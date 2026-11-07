"""Task013 synchronized-residual runner (train PUMP-01..07, seven independent replays; nothing is fitted).

  PYTHONHASHSEED=0 python scripts/run_synchronized_residual.py selfcheck   # seed/manifest/code hashes; no data
  PYTHONHASHSEED=0 python scripts/run_synchronized_residual.py train       # refuses without a matching SEAL

`train` reads train metadata, minute features, snapshots and ONLY the explicit train raw telemetry partitions
(PUMP-01..07, asserted IDs/window bounds). Before any scoring it writes raw projection hashes, aggregation
provenance, raw predictions and applicability coverage. It then scores B1, R3, R5, E995, Y3, Y5 and Z995 once,
runs the full-evidence prefix/future-mutation audit at the Task010 cut set plus independent raw-aggregation
checks, and reproduces the main prediction hashes in a fresh seed-0 process. Each attempt writes a new run
directory (partial runs kept); COMPLETED.json blocks a second score. Earlier code is imported unchanged.
"""
from __future__ import annotations

import hashlib
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
from retrofit_doctor import synchronized_residual as S
from run_b1 import canonical_predictions, save_json, sha256
import run_diagnosis_fusion as T10

OUT = ROOT / "results/synchronized_residual"
DATA = ROOT / "vendor/benchmark/data/full"
MANIFEST = ROOT / "docs/experiments/followup/2026-11-07-synchronized-residual-manifest.json"
SEAL = OUT / "SEAL.json"
COMPLETED = OUT / "COMPLETED.json"
CONTROL_PRED = T10.CONTROL_PRED
CONTROL_EXPECT = {"detected": 18, "type_correct": 8, "class_correct": 14, "false_episodes": 3, "excess_repeats": 3,
                  "sensor_type_and_channel": 3, "events": 26}
SIMPLICITY = {c: i for i, c in enumerate(("R3", "R5", "E995", "Y3", "Y5", "Z995"))}
RULE_SOURCES = ("R3", "R5", "E995")
gate_passes, useful, canonical = T10.gate_passes, T10.useful, T10.canonical


def seed_pinned():
    return os.environ.get("PYTHONHASHSEED") == "0" and sys.flags.hash_randomization == 0


def require_seal():
    if not seed_pinned():
        raise SystemExit("PYTHONHASHSEED=0 must be set at interpreter start; no data accessed")
    if COMPLETED.exists():
        raise SystemExit("Task013 wave already completed; refusing a second score; no data accessed")
    if not SEAL.exists():
        raise SystemExit("no coordinator SEAL for Task013; no data accessed")
    seal, man = json.loads(SEAL.read_text()), json.loads(MANIFEST.read_text())
    if seal.get("manifest_sha256") != sha256(MANIFEST):
        raise SystemExit("SEAL does not approve this manifest; no data accessed")
    changed = [p for p, h in man["code_sha256"].items() if sha256(ROOT / p) != h]
    if changed:
        raise SystemExit(f"sealed code changed: {changed}; no data accessed")
    return man


def pipeline(assets, feat, raw, snaps):
    """Per asset: snapshot table, immutable per-minute residual table (cache), predictions for every candidate."""
    tables = {a.asset_id: D.snapshot_table(snaps, a) for _, a in assets.iterrows()}
    rtables = {a.asset_id: S.residual_table(raw.get(a.asset_id), a) for _, a in assets.iterrows()}
    preds = {c: [] for c in S.CANDIDATES}
    for aid in sorted(assets.asset_id):
        row = assets[assets.asset_id == aid]
        for c in S.CANDIDATES:
            preds[c].append(S.predict_asset(c, feat, raw.get(aid), snaps, row, table=tables[aid], rtable=rtables[aid]))
    return tables, rtables, {c: pd.concat(v, ignore_index=True) for c, v in preds.items()}


def mutate_minute_stats_future(feat, aid, cut):
    f = feat.copy()
    late = (f.asset_id == aid) & (pd.to_datetime(f.window_start_utc, utc=True) + D.MINUTE > cut)
    spread = [c for c in f.columns if c.endswith(("__std", "__min", "__max"))]
    f.loc[late, spread] = f.loc[late, spread] * 7 + 3
    f.loc[late, [c for c in f.columns if c.endswith("__count")]] = 0
    return f


def mutate_rtable_future(rt, cut):
    """Future closed-minute residual statistics changed drastically (they must be filtered out by the clock)."""
    r = rt.copy()
    late = r.minute_end > cut
    num = [c for c in S.STAT_COLS if c not in ("minute_start", "minute_end", "invalid_reason")]
    r.loc[late, num] = r.loc[late, num].astype("float64") * 5 + 11
    return r


def causality_audit(assets, feat, snaps, tables, rtables, full):
    """Full-evidence prefix + future mutation (means, std/min/max, counts, snapshots, residual statistics)."""
    rng = np.random.default_rng(T10.AUDIT_SEED)
    rows = []
    for _, a in assets.sort_values("asset_id").iterrows():
        row, aid = assets[assets.asset_id == a.asset_id], a.asset_id
        mine = {c: full[c][full[c].asset_id == aid].reset_index(drop=True) for c in S.CANDIDATES}
        for cut, kind in T10.audit_cuts(a, list(mine.values()), tables[aid], rng).items():
            mf, ms = T10.mutate_future(feat, snaps, aid, cut)
            mf = mutate_minute_stats_future(mf, aid, cut)
            mr = mutate_rtable_future(rtables[aid], cut)
            for variant, (ff, ss, rt) in (("prefix", (feat, snaps, rtables[aid])), ("future_mutation", (mf, ms, mr))):
                tab = D.snapshot_table(ss, a) if variant == "future_mutation" else tables[aid]
                g = D.normalized_asset(ff, row, cut)
                if not len(g):
                    continue
                wf = D.asset_waveform(g, ss, row, cut, tab)
                clock = g.window_start_utc.iloc[-1] + D.MINUTE
                rtc = rt[rt.minute_end <= clock].reset_index(drop=True)
                for c in S.CANDIDATES:
                    got = S.diagnose_asset(c, g, wf if c in S.USES_WAVEFORM else None, a, D.installed_keys(a),
                                           rtc if c != "B1" else pd.DataFrame(columns=S.STAT_COLS))
                    want = mine[c][pd.to_datetime(mine[c].alert_time_utc, utc=True) <= cut]
                    rows.append({"candidate": c, "asset_id": aid, "cut_utc": cut.isoformat(), "cut_kind": kind,
                                 "variant": variant, "compared_rows": len(want),
                                 "pass": bool(canonical(got).equals(canonical(want)))})
    return pd.DataFrame(rows)


def mutate_raw_future(raw, cut):
    r = raw.copy()
    late = pd.to_datetime(r.timestamp_utc, utc=True) >= cut
    for c in S.RAW.values():
        r.loc[late, c] = pd.to_numeric(r.loc[late, c], errors="coerce") * 3 + 50
    r.loc[late, "operating_mode"] = "STOPPED"
    return r


def raw_audit(assets, raw, rtables, full):
    """Independent raw-aggregation checks: truncated and future-mutated raw must reproduce every closed-minute
    statistic (incl. counts and invalid/absent rows) at reference end -1/0/+1 s, the first post-reference alert
    minute boundary and one sub-minute cut, per asset with raw input."""
    rows = []
    for _, a in assets.sort_values("asset_id").iterrows():
        aid = a.asset_id
        if raw.get(aid) is None:
            continue
        ref_end = D.utc(a.window_start_utc) + pd.Timedelta(hours=B.BASELINE_H)
        alerts = sorted(t for t in pd.to_datetime(full["B1"][full["B1"].asset_id == aid].alert_time_utc, utc=True)
                        if t >= ref_end)
        cuts = {ref_end + pd.Timedelta(seconds=s): "reference_boundary" for s in (-1, 0, 1)}
        if alerts:
            cuts[alerts[0]] = "alert_boundary"
            cuts[alerts[0] - pd.Timedelta(seconds=30)] = "sub_minute"
        r = raw[aid]
        t = pd.to_datetime(r.timestamp_utc, utc=True)
        for cut, kind in sorted(cuts.items()):
            want = rtables[aid][rtables[aid].minute_end <= cut].reset_index(drop=True)
            for variant, rr in (("prefix", r[t < cut]), ("future_mutation", mutate_raw_future(r, cut))):
                got = S.residual_table(rr, a, cut)
                rows.append({"asset_id": aid, "cut_utc": cut.isoformat(), "cut_kind": kind, "variant": variant,
                             "compared_minutes": len(want), "pass": bool(canonical(got).equals(canonical(want)))})
    return pd.DataFrame(rows)


def raw_provenance(raw, caps):
    out = {}
    for aid in sorted(caps):
        if raw.get(aid) is None:
            out[aid] = {"loaded": False, "capability": caps[aid]}
            continue
        r = raw[aid]
        out[aid] = {"loaded": True, "capability": None, "rows": int(len(r)), "columns": list(r.columns),
                    "first_utc": str(pd.to_datetime(r.timestamp_utc, utc=True).min()),
                    "last_utc": str(pd.to_datetime(r.timestamp_utc, utc=True).max()),
                    "sha256": T10.frame_hash(r.sort_values("timestamp_utc", kind="stable").reset_index(drop=True))}
    return out


def aggregation_provenance(rtables):
    return {aid: {"minutes": int(len(t)), "invalid_minutes": t.invalid_reason.dropna().value_counts().to_dict(),
                  "minutes_paired_ge_30": int((t.paired >= S.MIN_PAIRED).sum()),
                  "sha256": T10.frame_hash(t)} for aid, t in sorted(rtables.items())}


def coverage(preds):
    rows = []
    for c, p in preds.items():
        if c == "B1":
            continue
        for aid, r in zip(p.asset_id, p.rule_detail):
            d = json.loads(r) if isinstance(r, str) else {}
            rows.append({"candidate": c, "asset_id": aid, "outcome": d.get("outcome"), "reason": d.get("reason"),
                         "emitted_source": d.get("emitted_source")})
    d = pd.DataFrame(rows)
    if not len(d):
        return d
    return d.fillna("-").groupby(["candidate", "asset_id", "outcome", "reason", "emitted_source"]).size() \
        .rename("alerts").reset_index()


def select(comp):
    passing = comp[(comp.candidate != "B1") & comp.gate_pass & comp.correctness_pass]
    if not len(passing):
        return None
    order = passing.assign(_s=passing.candidate.map(SIMPLICITY)).sort_values(
        ["useful_diagnoses", "type_correct", "false_plus_excess", "_s"], ascending=[False, False, True, True])
    return order.candidate.iloc[0]


def load_all():
    assets, feat, snaps = D.load_train(DATA)
    raw, caps = S.load_train_raw(DATA, assets)
    return assets, feat, snaps, raw, caps


def determinism_child():
    assets, feat, snaps, raw, _ = load_all()
    print(json.dumps(T10.prediction_hashes(pipeline(assets, feat, raw, snaps)[2])))


def train():
    started = time.monotonic()
    man = require_seal()
    run_dir = OUT / f"run-{pd.Timestamp.now(tz='UTC').strftime('%Y%m%dT%H%M%S%fZ')}"
    run_dir.mkdir(parents=True, exist_ok=False)
    from run_regime_reference import evaluate
    assets, feat, snaps, raw, caps = load_all()
    events = pd.read_csv(DATA / "events_train.csv")
    assert set(events.asset_id) <= set(D.TRAIN_ASSETS)
    benign = pd.read_csv(DATA / "benign_windows_train_validation.csv").query("asset_id in @assets.asset_id")
    tables, rtables, preds = pipeline(assets, feat, raw, snaps)
    main_hashes = T10.prediction_hashes(preds)
    for c, p in preds.items():
        p.to_csv(run_dir / f"predictions_{c}.csv", index=False)
    save_json(run_dir / "run_provenance.json", {
        "manifest_sha256": sha256(MANIFEST), "code_sha256": man["code_sha256"],
        "inputs": T10.input_projection_hashes(assets, feat, snaps, events, benign),
        "raw_inputs": raw_provenance(raw, caps), "aggregation": aggregation_provenance(rtables),
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
                 noise_claims=int(p.diagnosis_source.isin(RULE_SOURCES).sum()),
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
    audit = causality_audit(assets, feat, snaps, tables, rtables, preds)
    audit.to_csv(run_dir / "causality_audit.csv", index=False)
    rawa = raw_audit(assets, raw, rtables, preds)
    rawa.to_csv(run_dir / "raw_aggregation_audit.csv", index=False)
    checks["causality_failures"] = {c: int((~audit[audit.candidate == c]["pass"]).sum()) for c in S.CANDIDATES}
    checks["raw_aggregation_failures"] = int((~rawa["pass"]).sum()) if len(rawa) else 0
    child = json.loads(subprocess.run([sys.executable, __file__, "determinism-child"],
                                      env={**os.environ, "PYTHONHASHSEED": "0"}, check=True, capture_output=True,
                                      text=True, cwd=ROOT).stdout)
    checks["determinism"] = {c: child[c] == main_hashes[c] for c in main_hashes}
    save_json(run_dir / "determinism.json", {"main": main_hashes, "fresh_child": child})
    correct_ok = (checks["control_equals_saved"] and all(checks["emission_equal_control"].values())
                  and all(checks["control_metrics"].values()) and checks["raw_aggregation_failures"] == 0)
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
