"""Task012 hydraulic-spread runner (train PUMP-01..07, seven independent replays; nothing is fitted).

  PYTHONHASHSEED=0 python scripts/run_hydraulic_spread.py selfcheck   # seed/manifest/code hashes; no data
  PYTHONHASHSEED=0 python scripts/run_hydraulic_spread.py train       # refuses without a matching coordinator SEAL

`train` reads train assets only (asserted predicates), writes run provenance and raw predictions BEFORE any
scoring, then scores B1/H3/H5/V3/V5 once with the unchanged official scorer and writes comparison, per-asset,
per-event, applicability coverage, causality and determinism artifacts. Each attempt writes a new run
directory (partial runs kept); COMPLETED.json blocks a second score. Earlier code is imported unchanged.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import time

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "src"), str(ROOT / "vendor/benchmark/src"), str(ROOT / "scripts")]
from retrofit_sim import baselines as B
from retrofit_doctor import diagnosis_fusion as D
from retrofit_doctor import hydraulic_spread as H
from run_b1 import canonical_predictions, save_json, sha256
import run_diagnosis_fusion as T10

OUT = ROOT / "results/hydraulic_spread"
DATA = ROOT / "vendor/benchmark/data/full"
MANIFEST = ROOT / "docs/experiments/followup/2026-11-07-hydraulic-spread-manifest.json"
SEAL = OUT / "SEAL.json"
COMPLETED = OUT / "COMPLETED.json"
CONTROL_PRED = T10.CONTROL_PRED
CONTROL_EXPECT = {"detected": 18, "type_correct": 8, "class_correct": 14, "false_episodes": 3, "excess_repeats": 3,
                  "sensor_type_and_channel": 3, "events": 26}
SIMPLICITY = {c: i for i, c in enumerate(("H3", "H5", "V3", "V5"))}
gate_passes, useful, canonical = T10.gate_passes, T10.useful, T10.canonical


def seed_pinned():
    return os.environ.get("PYTHONHASHSEED") == "0" and sys.flags.hash_randomization == 0


def require_seal():
    if not seed_pinned():
        raise SystemExit("PYTHONHASHSEED=0 must be set at interpreter start; no data accessed")
    if COMPLETED.exists():
        raise SystemExit("Task012 wave already completed; refusing a second score; no data accessed")
    if not SEAL.exists():
        raise SystemExit("no coordinator SEAL for Task012; no data accessed")
    seal, man = json.loads(SEAL.read_text()), json.loads(MANIFEST.read_text())
    if seal.get("manifest_sha256") != sha256(MANIFEST):
        raise SystemExit("SEAL does not approve this manifest; no data accessed")
    changed = [p for p, h in man["code_sha256"].items() if sha256(ROOT / p) != h]
    if changed:
        raise SystemExit(f"sealed code changed: {changed}; no data accessed")
    return man


def pipeline(assets, feat, snaps):
    tables = {a.asset_id: D.snapshot_table(snaps, a) for _, a in assets.iterrows()}
    preds = {c: [] for c in H.CANDIDATES}
    for aid in sorted(assets.asset_id):
        row = assets[assets.asset_id == aid]
        for c in H.CANDIDATES:
            preds[c].append(H.predict_asset(c, feat, snaps, row, table=tables[aid]))
    return tables, {c: pd.concat(v, ignore_index=True) for c, v in preds.items()}


def mutate_minute_stats_future(feat, aid, cut):
    """Drastic future change of std/min/max and counts (the hydraulic rule's own inputs)."""
    f = feat.copy()
    late = (f.asset_id == aid) & (pd.to_datetime(f.window_start_utc, utc=True) + D.MINUTE > cut)
    spread = [c for c in f.columns if c.endswith(("__std", "__min", "__max"))]
    f.loc[late, spread] = f.loc[late, spread] * 7 + 3
    counts = [c for c in f.columns if c.endswith("__count")]
    f.loc[late, counts] = 0
    return f


def causality_audit(assets, feat, snaps, tables, full):
    """Prefix replay + future mutation of means, std/min/max, counts and snapshots for every candidate."""
    rng = np.random.default_rng(T10.AUDIT_SEED)
    rows = []
    for _, a in assets.sort_values("asset_id").iterrows():
        row, aid = assets[assets.asset_id == a.asset_id], a.asset_id
        mine = {c: full[c][full[c].asset_id == aid].reset_index(drop=True) for c in H.CANDIDATES}
        for cut, kind in T10.audit_cuts(a, list(mine.values()), tables[aid], rng).items():
            mf, ms = T10.mutate_future(feat, snaps, aid, cut)
            mf = mutate_minute_stats_future(mf, aid, cut)
            for variant, (ff, ss) in (("prefix", (feat, snaps)), ("future_mutation", (mf, ms))):
                tab = D.snapshot_table(ss, a) if variant == "future_mutation" else tables[aid]
                g = D.normalized_asset(ff, row, cut)
                wf = D.asset_waveform(g, ss, row, cut, tab) if len(g) else None
                for c in H.CANDIDATES:
                    got = H.diagnose_asset(c, g, wf if c in H.USES_WAVEFORM else None, a, D.installed_keys(a))
                    want = mine[c][pd.to_datetime(mine[c].alert_time_utc, utc=True) <= cut]
                    rows.append({"candidate": c, "asset_id": aid, "cut_utc": cut.isoformat(), "cut_kind": kind,
                                 "variant": variant, "compared_rows": len(want),
                                 "pass": bool(canonical(got).equals(canonical(want)))})
    return pd.DataFrame(rows)


def coverage(preds):
    """Applicability outcome / unsupported reason per candidate and asset (from rule_detail)."""
    rows = []
    for c, p in preds.items():
        if c == "B1":
            continue
        for aid, r in zip(p.asset_id, p.rule_detail):
            d = json.loads(r) if isinstance(r, str) else {}
            rows.append({"candidate": c, "asset_id": aid, "outcome": d.get("outcome"),
                         "unsupported_reason": d.get("unsupported_reason")})
    d = pd.DataFrame(rows)
    if not len(d):
        return d
    return d.fillna("-").groupby(["candidate", "asset_id", "outcome", "unsupported_reason"]).size() \
        .rename("alerts").reset_index()


def select(comp):
    passing = comp[(comp.candidate != "B1") & comp.gate_pass & comp.correctness_pass]
    if not len(passing):
        return None
    order = passing.assign(_s=passing.candidate.map(SIMPLICITY)).sort_values(
        ["useful_diagnoses", "type_correct", "false_plus_excess", "_s"], ascending=[False, False, True, True])
    return order.candidate.iloc[0]


def determinism_child():
    assets, feat, snaps = D.load_train(DATA)
    print(json.dumps(T10.prediction_hashes(pipeline(assets, feat, snaps)[1])))


def train():
    started = time.monotonic()
    man = require_seal()
    run_dir = OUT / f"run-{pd.Timestamp.now(tz='UTC').strftime('%Y%m%dT%H%M%S%fZ')}"
    run_dir.mkdir(parents=True, exist_ok=False)
    from run_regime_reference import evaluate
    assets, feat, snaps = D.load_train(DATA)
    events = pd.read_csv(DATA / "events_train.csv")
    assert set(events.asset_id) <= set(D.TRAIN_ASSETS)
    benign = pd.read_csv(DATA / "benign_windows_train_validation.csv").query("asset_id in @assets.asset_id")
    tables, preds = pipeline(assets, feat, snaps)
    main_hashes = T10.prediction_hashes(preds)
    for c, p in preds.items():
        p.to_csv(run_dir / f"predictions_{c}.csv", index=False)
    save_json(run_dir / "run_provenance.json", {
        "manifest_sha256": sha256(MANIFEST), "code_sha256": man["code_sha256"],
        "inputs": T10.input_projection_hashes(assets, feat, snaps, events, benign),
        "prediction_sha256": main_hashes, "fitted_models": None,
        "seed": os.environ.get("PYTHONHASHSEED"), "python": sys.version.split()[0],
        "validation_touched": False, "test_touched": False, "scored": False})
    coverage(preds).to_csv(run_dir / "applicability_coverage.csv", index=False)
    control = canonical_predictions(CONTROL_PRED)
    checks = {"control_equals_saved": canonical(canonical_predictions(preds["B1"][B._COLS])).equals(canonical(control))}
    key = lambda p: sorted(zip(p.asset_id, p.alert_time_utc))
    checks["emission_equal_control"] = {c: key(p) == key(preds["B1"]) for c, p in preds.items()}
    summaries, asset_rows = [], []
    for c, p in preds.items():
        p = p.assign(original_fault_type=p.b1_fault_type, rule_id=p.diagnosis_source)
        s, per, _, um = evaluate(c, p, events, assets, benign)
        s.update(useful_diagnoses=useful(per), overrides=int((p.diagnosis_source != "B1").sum()),
                 noise_claims=int(p.diagnosis_source.isin(["H3", "H5"]).sum()),
                 waveform_refinements=int((p.diagnosis_source == "W1").sum()))
        s["gate_pass"] = gate_passes(s)
        summaries.append(s)
        asset_rows += T10.per_asset(c, p, per, events, assets, benign)
        per.to_csv(run_dir / f"per_event_{c}.csv", index=False)
        um.to_csv(run_dir / f"unmatched_{c}.csv", index=False)
    comp = pd.DataFrame(summaries)
    comp.to_csv(run_dir / "comparison_unchecked.csv", index=False)
    pd.DataFrame(asset_rows).to_csv(run_dir / "per_asset.csv", index=False)
    T10.availability(preds).to_csv(run_dir / "waveform_and_fallback.csv", index=False)
    ctrl = comp[comp.candidate == "B1"].iloc[0]
    checks["control_metrics"] = {k: int(ctrl[k]) == v for k, v in CONTROL_EXPECT.items()}
    audit = causality_audit(assets, feat, snaps, tables, preds)
    audit.to_csv(run_dir / "causality_audit.csv", index=False)
    checks["causality_failures"] = {c: int((~audit[audit.candidate == c]["pass"]).sum()) for c in H.CANDIDATES}
    child = json.loads(subprocess.run([sys.executable, __file__, "determinism-child"],
                                      env={**os.environ, "PYTHONHASHSEED": "0"}, check=True, capture_output=True,
                                      text=True, cwd=ROOT).stdout)
    checks["determinism"] = {c: child[c] == main_hashes[c] for c in main_hashes}
    save_json(run_dir / "determinism.json", {"main": main_hashes, "fresh_child": child})
    correct_ok = (checks["control_equals_saved"] and all(checks["emission_equal_control"].values())
                  and all(checks["control_metrics"].values()))
    comp["correctness_pass"] = [bool(correct_ok and checks["causality_failures"][c] == 0 and checks["determinism"][c])
                                for c in comp.candidate]
    selected = select(comp)
    comp.to_csv(run_dir / "comparison.csv", index=False)
    save_json(run_dir / "run_summary.json", {"manifest_sha256": sha256(MANIFEST), "checks": checks, "gate": T10.GATE,
                                             "selected": selected, "validation_touched": False, "test_touched": False,
                                             "runtime_s": round(time.monotonic() - started, 1)})
    save_json(COMPLETED, {"run_dir": str(run_dir.relative_to(ROOT)), "selected": selected})
    print(comp[["candidate", "detected", "type_correct", "class_correct", "false_episodes", "excess_repeats",
                "sensor_type_and_channel", "useful_diagnoses", "gate_pass", "correctness_pass"]].to_string())
    print("selected:", selected)


def selfcheck():
    man = json.loads(MANIFEST.read_text())
    print(json.dumps({"seed_pinned": seed_pinned(), "manifest_sha256": sha256(MANIFEST),
                      "code_matches_manifest": all(sha256(ROOT / p) == h for p, h in man["code_sha256"].items()),
                      "sealed": SEAL.exists(), "completed": COMPLETED.exists()}, indent=2))


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "selfcheck"
    {"selfcheck": selfcheck, "train": train, "determinism-child": lambda: (require_seal(), determinism_child())}[mode]()
