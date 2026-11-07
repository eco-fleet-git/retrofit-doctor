"""Task013 AUDIT-ONLY recovery of the failed first sealed run (docs/tasks/013-audit-recovery.md).

  PYTHONHASHSEED=0 python scripts/recover_synchronized_residual_audit.py selfcheck   # hashes only; no data
  PYTHONHASHSEED=0 python scripts/recover_synchronized_residual_audit.py recover     # needs RECOVERY_SEAL.json

The original attempt run-20261107T093222280839Z wrote predictions, provenance, unchecked scores and the full
prediction causality audit, then failed in raw_audit: the original mutate_raw_future assigned future
operating_mode='STOPPED' to a pandas Categorical lacking that category (TypeError). This script does NOT
change or re-run training/scoring and does not edit the sealed runner, modules, manifest or SEAL. It:

1. verifies original code/manifest/SEAL, the original run provenance and prediction file hashes, the saved
   control identity/metrics/emissions and the completed causality CSV;
2. reloads the train-only inputs/raw data and requires identical input, raw and aggregation hashes;
3. runs the ORIGINAL raw_audit with the original mutate_raw_future wrapped so that a COPY of operating_mode
   is cast to object first (the registered future mutation is otherwise identical; prefix inputs unchanged);
4. runs the ORIGINAL determinism-child in a fresh seed-0 process and requires the original prediction hashes;
5. attaches the verified correctness flags to the ORIGINAL unchecked metrics (no scoring call), selects with
   the original registered function, and adds only the previously absent final artifacts + COMPLETED.json.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import time

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "src"), str(ROOT / "vendor/benchmark/src"), str(ROOT / "scripts")]
from retrofit_sim import baselines as B
from retrofit_doctor import synchronized_residual as S
from run_b1 import canonical_predictions, save_json, sha256
import run_diagnosis_fusion as T10
import run_synchronized_residual as R

RECOVERY_MANIFEST = ROOT / "docs/experiments/followup/2026-11-07-synchronized-residual-recovery-manifest.json"
RECOVERY_SEAL = R.OUT / "RECOVERY_SEAL.json"
NEW_OUTPUTS = ("raw_aggregation_audit.csv", "determinism.json", "comparison.csv", "run_summary.json",
               "recovery_provenance.json")
ORIGINAL_MUTATE = R.mutate_raw_future


def safe_mutate_raw_future(raw, cut):
    """Cast a COPY of operating_mode to object, then apply the unchanged original registered mutation."""
    r = raw.copy()
    r["operating_mode"] = r["operating_mode"].astype(object)
    return ORIGINAL_MUTATE(r, cut)


def require_recovery_seal():
    if not R.seed_pinned():
        raise SystemExit("PYTHONHASHSEED=0 must be set at interpreter start; no data accessed")
    if not RECOVERY_SEAL.exists():
        raise SystemExit("no coordinator RECOVERY_SEAL for Task013; no data accessed")
    man = json.loads(RECOVERY_MANIFEST.read_text())
    if json.loads(RECOVERY_SEAL.read_text()).get("recovery_manifest_sha256") != sha256(RECOVERY_MANIFEST):
        raise SystemExit("RECOVERY_SEAL does not approve this recovery manifest; no data accessed")
    changed = [p for p, h in man["recovery_code_sha256"].items() if sha256(ROOT / p) != h]
    if changed:
        raise SystemExit(f"recovery code changed: {changed}; no data accessed")
    return man


def verify_original(man):
    """All file-level checks of the original attempt; returns (run_dir, provenance, checks). No data read."""
    R.require_seal()                                     # original seed/seal/manifest/code hashes, not completed
    o = man["original"]
    if sha256(R.MANIFEST) != o["manifest_sha256"] or sha256(R.SEAL) != o["seal_sha256"]:
        raise SystemExit("original manifest/SEAL differ from the recovery manifest; no data accessed")
    run_dir = ROOT / o["run_dir"]
    present = [f for f in NEW_OUTPUTS if (run_dir / f).exists()]
    if present or R.COMPLETED.exists():
        raise SystemExit(f"refusing to overwrite existing recovery outputs {present}; no data accessed")
    bad = [f for f, h in o["file_sha256"].items() if sha256(run_dir / f) != h]
    if bad:
        raise SystemExit(f"original run files changed: {bad}; no data accessed")
    prov = json.loads((run_dir / "run_provenance.json").read_text())
    if prov["manifest_sha256"] != o["manifest_sha256"]:
        raise SystemExit("original provenance names another manifest; no data accessed")
    preds = {c: pd.read_csv(run_dir / f"predictions_{c}.csv") for c in S.CANDIDATES}
    for c in S.CANDIDATES:
        if sha256(run_dir / f"predictions_{c}.csv") != prov["prediction_sha256"][c]:
            raise SystemExit(f"prediction file {c} differs from its recorded hash; no data accessed")
    control = canonical_predictions(R.CONTROL_PRED)
    checks = {"control_equals_saved": bool(R.canonical(canonical_predictions(preds["B1"][B._COLS])).equals(
        R.canonical(control)))}
    key = lambda p: sorted(zip(p.asset_id, p.alert_time_utc))
    checks["emission_equal_control"] = {c: key(p) == key(preds["B1"]) for c, p in preds.items()}
    comp = pd.read_csv(run_dir / "comparison_unchecked.csv")
    ctrl = comp[comp.candidate == "B1"].iloc[0]
    checks["control_metrics"] = {k: int(ctrl[k]) == v for k, v in R.CONTROL_EXPECT.items()}
    audit = pd.read_csv(run_dir / "causality_audit.csv")
    checks["causality_failures"] = {c: int((~audit[audit.candidate == c]["pass"].astype(bool)).sum())
                                    for c in S.CANDIDATES}
    checks["causality_checks"] = {c: int((audit.candidate == c).sum()) for c in S.CANDIDATES}
    if set(audit.candidate) != set(S.CANDIDATES) or len(set(checks["causality_checks"].values())) != 1:
        raise SystemExit("original causality audit does not cover every candidate equally; no data accessed")
    return run_dir, prov, preds, comp, checks


def verify_inputs(prov):
    """Reload train-only data; require identical input, raw and aggregation hashes. Returns data + rtables."""
    assets, feat, snaps, raw, caps = R.load_all()
    events = pd.read_csv(R.DATA / "events_train.csv")
    benign = pd.read_csv(R.DATA / "benign_windows_train_validation.csv").query("asset_id in @assets.asset_id")
    got = {"inputs": T10.input_projection_hashes(assets, feat, snaps, events, benign),
           "raw_inputs": R.raw_provenance(raw, caps)}
    rtables = {a.asset_id: S.residual_table(raw.get(a.asset_id), a) for _, a in assets.iterrows()}
    got["aggregation"] = R.aggregation_provenance(rtables)
    same = {k: json.loads(json.dumps(got[k], default=str)) == prov[k] for k in got}
    return assets, raw, rtables, same


def run_raw_audit(assets, raw, rtables, preds):
    R.mutate_raw_future = safe_mutate_raw_future
    try:
        return R.raw_audit(assets, raw, rtables, preds)
    finally:
        R.mutate_raw_future = ORIGINAL_MUTATE


def build_final(comp_unchecked, checks):
    """Attach verified correctness flags to the ORIGINAL unchecked metrics; original selection function."""
    comp = comp_unchecked.copy()
    correct_ok = (checks["control_equals_saved"] and all(checks["emission_equal_control"].values())
                  and all(checks["control_metrics"].values()) and checks["raw_aggregation_failures"] == 0
                  and all(checks["inputs_identical"].values()))
    comp["correctness_pass"] = [bool(correct_ok and checks["causality_failures"][c] == 0 and checks["determinism"][c])
                                for c in comp.candidate]
    return comp, R.select(comp)


def fresh_child_hashes():
    out = subprocess.run([sys.executable, str(ROOT / "scripts/run_synchronized_residual.py"), "determinism-child"],
                         env={**os.environ, "PYTHONHASHSEED": "0"}, check=True, capture_output=True, text=True,
                         cwd=ROOT).stdout
    return json.loads(out)


def recover():
    started = time.monotonic()
    man = require_recovery_seal()
    run_dir, prov, preds, comp_unchecked, checks = verify_original(man)
    assets, raw, rtables, same = verify_inputs(prov)
    checks["inputs_identical"] = same
    if not all(same.values()):
        save_json(run_dir / "recovery_provenance.json", {"status": "STOPPED_INPUT_HASH_MISMATCH", "inputs_identical": same})
        raise SystemExit(f"input hashes differ from the original run: {same}")
    rawa = run_raw_audit(assets, raw, rtables, preds)
    checks["raw_aggregation_failures"] = int((~rawa["pass"]).sum()) if len(rawa) else 0
    child = fresh_child_hashes()
    checks["determinism"] = {c: child.get(c) == prov["prediction_sha256"][c] for c in S.CANDIDATES}
    comp, selected = build_final(comp_unchecked, checks)
    runtime = round(time.monotonic() - started, 1)
    rawa.to_csv(run_dir / "raw_aggregation_audit.csv", index=False)
    save_json(run_dir / "determinism.json", {"main": prov["prediction_sha256"], "fresh_child": child,
                                             "note": "main = hashes recorded by the original attempt"})
    comp.to_csv(run_dir / "comparison.csv", index=False)
    save_json(run_dir / "run_summary.json", {
        "manifest_sha256": prov["manifest_sha256"], "checks": checks, "gate": T10.GATE, "selected": selected,
        "completion": "AUDIT-ONLY RECOVERY after the initial process failed (exit 1) in raw_audit; not an "
                      "uninterrupted exit-0 run; scores are the original unchecked metrics, not recomputed",
        "validation_touched": False, "test_touched": False, "original_runtime_s": None,
        "recovery_runtime_s": runtime})
    save_json(run_dir / "recovery_provenance.json", {
        "recovery_manifest_sha256": sha256(RECOVERY_MANIFEST), "recovery_seal_sha256": sha256(RECOVERY_SEAL),
        "recovery_code_sha256": man["recovery_code_sha256"], "original": man["original"],
        "repair": "copy of operating_mode cast to object before the unchanged original mutate_raw_future",
        "original_failure": man["reason"], "inputs_identical": same, "recovery_runtime_s": runtime,
        "scoring_called": False})
    save_json(R.COMPLETED, {"run_dir": str(run_dir.relative_to(ROOT)), "selected": selected,
                            "completion": "audit-only recovery"})
    print(comp[["candidate", "detected", "type_correct", "class_correct", "false_episodes", "excess_repeats",
                "sensor_type_and_channel", "useful_diagnoses", "gate_pass", "correctness_pass"]].to_string())
    print("checks:", json.dumps(checks))
    print("selected:", selected)


def selfcheck():
    man = json.loads(RECOVERY_MANIFEST.read_text())
    print(json.dumps({"seed_pinned": R.seed_pinned(), "recovery_manifest_sha256": sha256(RECOVERY_MANIFEST),
                      "recovery_code_matches": all(sha256(ROOT / p) == h for p, h in man["recovery_code_sha256"].items()),
                      "original_files_match": all(sha256(ROOT / man["original"]["run_dir"] / f) == h
                                                  for f, h in man["original"]["file_sha256"].items()),
                      "recovery_sealed": RECOVERY_SEAL.exists(), "completed": R.COMPLETED.exists()}, indent=2))


if __name__ == "__main__":
    {"selfcheck": selfcheck, "recover": recover}[sys.argv[1] if len(sys.argv) > 1 else "selfcheck"]()
