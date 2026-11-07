"""Task014 descriptive validation of the single frozen train-selected candidate Z995 against causal B1.

  PYTHONHASHSEED=0 python scripts/run_validation_z995.py selfcheck   # hashes only; no data
  PYTHONHASHSEED=0 python scripts/run_validation_z995.py validate    # refuses without the Task014 SEAL

Validation PUMP-08/09 were inspected earlier: this is a descriptive non-regression check, not blind evidence.
Exactly Z995 and B1 are predicted (no runner-up, no tuning, nothing fitted). Only explicit validation IDs are
read (metadata filter, parquet predicates, explicit raw partitions; asserted). Raw predictions, input/raw/
aggregation hashes and coverage are written BEFORE scoring with the official scorer split='validation'.
Then the predeclared adoption gate, full-evidence prefix/future-mutation audit, raw-aggregation checks with a
categorical-safe mutator and a fresh seed-0 reproduction. Each attempt writes a new run directory; partial
attempts are kept; COMPLETED.json blocks a second check. No test data, release or UI is touched.
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
from retrofit_sim import scoring as SC
from retrofit_doctor import diagnosis_fusion as D
from retrofit_doctor import synchronized_residual as S
from run_b1 import canonical_predictions, save_json, sha256
import run_diagnosis_fusion as T10
import run_synchronized_residual as R13

OUT = ROOT / "results/validation_z995"
DATA = ROOT / "vendor/benchmark/data/full"
MANIFEST = ROOT / "docs/experiments/followup/2026-11-07-validation-z995-manifest.json"
SEAL = OUT / "SEAL.json"
COMPLETED = OUT / "COMPLETED.json"
VALIDATION = ("PUMP-08", "PUMP-09")
CANDIDATE = "Z995"
CONFIGS = ("B1", CANDIDATE)
CONTROL_PRED = ROOT / "results/causal_b1/predictions_causal_validation.csv"
CONTROL_EXPECT = {"detected": 8, "type_correct": 4, "class_correct": 8, "false_episodes": 1, "excess_repeats": 0,
                  "sensor_type_and_channel": 2, "sensor_type_and_channel_non_gateway": 1, "alerts": 15, "events": 9}
CONTROL_COMPOSITE = 76.01253946421124
ADOPTION = {"detected_min": 8, "type_correct_min": 4, "class_correct_min": 8, "false_plus_excess_max": 1,
            "sensor_type_and_channel_min": 2, "nuisance_max": 1}
canonical = T10.canonical


def seed_pinned():
    return os.environ.get("PYTHONHASHSEED") == "0" and sys.flags.hash_randomization == 0


def require_seal():
    if not seed_pinned():
        raise SystemExit("PYTHONHASHSEED=0 must be set at interpreter start; no data accessed")
    if COMPLETED.exists():
        raise SystemExit("Task014 validation already completed; refusing a second check; no data accessed")
    if not SEAL.exists():
        raise SystemExit("no coordinator SEAL for Task014; no data accessed")
    seal, man = json.loads(SEAL.read_text()), json.loads(MANIFEST.read_text())
    if seal.get("manifest_sha256") != sha256(MANIFEST):
        raise SystemExit("SEAL does not approve this manifest; no data accessed")
    changed = [p for p, h in man["code_sha256"].items() if sha256(ROOT / p) != h]
    if changed:
        raise SystemExit(f"sealed code changed: {changed}; no data accessed")
    ev = man["train_selection_evidence"]
    if any(sha256(ROOT / p) != h for p, h in ev["file_sha256"].items()):
        raise SystemExit("train selection evidence changed; no data accessed")
    return man


def train_gate_still_passes(man):
    """Frozen Task013 comparison: Z995 gate_pass and correctness_pass, and the registered selection."""
    ev = man["train_selection_evidence"]
    comp = pd.read_csv(ROOT / ev["comparison"])
    row = comp[comp.candidate == CANDIDATE].iloc[0]
    summary = json.loads((ROOT / ev["run_summary"]).read_text())
    return bool(row.gate_pass and row.correctness_pass and summary["selected"] == CANDIDATE)


def validation_projection_hashes(assets, feat, snaps, events, benign):
    """Task010 projection hashes with keys renamed to the split actually loaded (helper itself unchanged)."""
    h = T10.input_projection_hashes(assets, feat, snaps, events, benign)
    rename = {"assets_train_rows": "assets_validation_rows", "features_train_rows": "features_validation_rows",
              "snapshots_train_rows": "snapshots_validation_rows", "events_train": "events_validation",
              "benign_train_rows": "benign_validation_rows"}
    out = {rename.get(k, k): v for k, v in h.items()}
    out.update(split="validation", allowlist=list(VALIDATION), test_touched=False)
    return out


def report_context(rep):
    """Official report scope must be split validation, exactly PUMP-08/09 and 14 asset-days."""
    return {"split_validation": rep.get("split") == "validation", "assets_08_09": rep.get("assets") == list(VALIDATION),
            "asset_days_14": rep.get("asset_days") == 14.0}


# --- validation-only loading -------------------------------------------------------------------------------

def load_validation(data_dir=DATA):
    data_dir = Path(data_dir)
    ids = list(VALIDATION)
    assets = pd.read_csv(data_dir / "assets.csv")
    assets = assets[assets.asset_id.isin(ids) & (assets.split == "validation")].reset_index(drop=True)
    assert sorted(assets.asset_id) == ids, "validation metadata mismatch"
    feat = pd.read_parquet(data_dir / "features_1min.parquet", filters=[("asset_id", "in", ids)])
    snaps = pd.read_parquet(data_dir / "vibration_snapshots.parquet", filters=[("asset_id", "in", ids)])
    for name, d in (("features", feat), ("snapshots", snaps)):
        if not set(d.asset_id) <= set(ids):
            raise RuntimeError(f"{name}: predicate returned an asset outside the validation allowlist")
    raw, caps = {}, {}
    for _, a in assets.sort_values("asset_id").iterrows():
        caps[a.asset_id] = S.capability(a)
        if caps[a.asset_id] is None:
            raw[a.asset_id] = S.read_asset_partition(data_dir / "telemetry", a.asset_id, a.window_start_utc,
                                                     a.window_end_utc)
    events = pd.read_csv(data_dir / "events_validation.csv")
    if not set(events.asset_id) <= set(ids):
        raise RuntimeError("validation events outside the allowlist")
    benign = pd.read_csv(data_dir / "benign_windows_train_validation.csv")
    benign = benign[benign.asset_id.isin(ids)].reset_index(drop=True)
    return assets, feat, snaps, raw, caps, events, benign


def pipeline(assets, feat, raw, snaps):
    tables = {a.asset_id: D.snapshot_table(snaps, a) for _, a in assets.iterrows()}
    rtables = {a.asset_id: S.residual_table(raw.get(a.asset_id), a) for _, a in assets.iterrows()}
    preds = {c: [] for c in CONFIGS}
    for aid in sorted(assets.asset_id):
        row = assets[assets.asset_id == aid]
        for c in CONFIGS:
            preds[c].append(S.predict_asset(c, feat, raw.get(aid), snaps, row, table=tables[aid], rtable=rtables[aid]))
    return tables, rtables, {c: pd.concat(v, ignore_index=True) for c, v in preds.items()}


# --- scoring (official scorer, split='validation') ----------------------------------------------------------

def score_validation(c, pred, events, assets, benign):
    """Official report with split='validation' plus the generic Task002 diagnostic metrics."""
    from run_causal_b2 import diagnostic_metrics, summarise
    p = pred.copy()
    rep = SC.score(p[B._COLS], events, assets, benign, "validation")
    per, diag = diagnostic_metrics(p, rep, events)
    s = summarise(c, rep, diag)
    s["wrong_specific_first"] = s["selective_diagnosis"][1] - s["selective_diagnosis"][0]
    s["wrong_channel_claim_count"] = s["wrong_channel_claims"][0]
    s["sensor_type_and_channel_non_gateway"] = diag["sensor_type_and_channel_non_gateway"]
    return s, per, rep


def per_asset_validation(c, pred, per, events, assets, benign):
    rows = []
    for aid in sorted(assets.asset_id):
        rep = SC.score(pred[pred.asset_id == aid][B._COLS], events, assets[assets.asset_id == aid], benign,
                       "validation")
        pa = per[per.asset_id == aid]
        rows.append({"config": c, "asset_id": aid, "events": len(pa), "detected": int(pa.detected.sum()),
                     "type_correct": int(pa.type_correct.sum()), "class_correct": int(pa.class_correct.sum()),
                     "sensor_type_and_channel": int(pa.type_and_channel.sum()),
                     "false_episodes": rep["false_alert_episodes"], "excess_repeats": rep["excess_repeat_episodes"],
                     "nuisance_benign": rep["nuisance_alerts_in_benign_windows"],
                     "alerts": int((pred.asset_id == aid).sum())})
    return rows


def transitions(per_b1, per_c):
    b, c = per_b1.set_index("event_id"), per_c.set_index("event_id")
    cols = ["detected", "predicted_fault_type", "predicted_class", "predicted_channel", "type_correct",
            "class_correct", "type_and_channel"]
    rows = []
    for e in b.index:
        rows.append({"event_id": e, "asset_id": b.loc[e, "asset_id"], "event_class": b.loc[e, "event_class"],
                     "fault_type": b.loc[e, "fault_type"], "sensor_tag": b.loc[e, "sensor_tag"],
                     **{f"b1_{k}": b.loc[e, k] for k in cols}, **{f"z_{k}": c.loc[e, k] for k in cols},
                     "changed": any(str(b.loc[e, k]) != str(c.loc[e, k]) for k in cols)})
    return pd.DataFrame(rows)


def adoption(sb, sz, trans, correctness_ok, train_ok):
    """Predeclared descriptive adoption gate (Task014, incl. the wrong-specific / wrong-channel guard)."""
    lost_type = trans[trans.b1_type_correct.astype(bool) & ~trans.z_type_correct.astype(bool)].event_id.tolist()
    lost_tc = trans[trans.b1_type_and_channel.astype(bool) & ~trans.z_type_and_channel.astype(bool)].event_id.tolist()
    g = {"detected": sz["detected"] >= ADOPTION["detected_min"],
         "type_correct": sz["type_correct"] >= ADOPTION["type_correct_min"],
         "class_correct": sz["class_correct"] >= ADOPTION["class_correct_min"],
         "false_plus_excess": sz["false_plus_excess"] <= ADOPTION["false_plus_excess_max"],
         "sensor_type_and_channel": sz["sensor_type_and_channel"] >= ADOPTION["sensor_type_and_channel_min"],
         "nuisance": sz["nuisance_benign"] <= ADOPTION["nuisance_max"],
         "preserves_b1_correct_types": not lost_type, "preserves_b1_type_and_channel": not lost_tc,
         "wrong_specific_not_above_b1": sz["wrong_specific_first"] <= sb["wrong_specific_first"],
         "wrong_channel_not_above_b1": sz["wrong_channel_claim_count"] <= sb["wrong_channel_claim_count"],
         "train_gate_still_passes": bool(train_ok), "correctness": bool(correctness_ok)}
    return all(g.values()), g, {"lost_type_events": lost_type, "lost_type_and_channel_events": lost_tc}


# --- audits -------------------------------------------------------------------------------------------------

def safe_mutate_raw_future(raw, cut):
    """Registered raw future mutation on a COPY with operating_mode as object (Task013 categorical defect)."""
    r = raw.copy()
    r["operating_mode"] = r["operating_mode"].astype(object)
    late = pd.to_datetime(r.timestamp_utc, utc=True) >= cut
    for c in S.RAW.values():
        r.loc[late, c] = pd.to_numeric(r.loc[late, c], errors="coerce") * 3 + 50
    r.loc[late, "operating_mode"] = "STOPPED"
    return r


def causality_audit(assets, feat, snaps, tables, rtables, full):
    """Full-evidence prefix + future mutation (means, std/min/max, counts, snapshots, residual statistics)."""
    rng = np.random.default_rng(T10.AUDIT_SEED)
    rows = []
    for _, a in assets.sort_values("asset_id").iterrows():
        row, aid = assets[assets.asset_id == a.asset_id], a.asset_id
        mine = {c: full[c][full[c].asset_id == aid].reset_index(drop=True) for c in CONFIGS}
        rt_full = rtables[aid]
        for cut, kind in T10.audit_cuts(a, list(mine.values()), tables[aid], rng).items():
            mf, ms = T10.mutate_future(feat, snaps, aid, cut)
            mf = R13.mutate_minute_stats_future(mf, aid, cut)
            mr = R13.mutate_rtable_future(rt_full, cut)
            for variant, (ff, ss, rt) in (("prefix", (feat, snaps, rt_full)), ("future_mutation", (mf, ms, mr))):
                tab = D.snapshot_table(ss, a) if variant == "future_mutation" else tables[aid]
                g = D.normalized_asset(ff, row, cut)
                if not len(g):
                    continue
                wf = D.asset_waveform(g, ss, row, cut, tab)
                clock = g.window_start_utc.iloc[-1] + D.MINUTE
                rtc = rt[rt.minute_end <= clock].reset_index(drop=True)
                for c in CONFIGS:
                    got = S.diagnose_asset(c, g, wf if c in S.USES_WAVEFORM else None, a, D.installed_keys(a),
                                           rtc if c != "B1" else pd.DataFrame(columns=S.STAT_COLS))
                    want = mine[c][pd.to_datetime(mine[c].alert_time_utc, utc=True) <= cut]
                    rows.append({"config": c, "asset_id": aid, "cut_utc": cut.isoformat(), "cut_kind": kind,
                                 "variant": variant, "compared_rows": len(want),
                                 "pass": bool(canonical(got).equals(canonical(want)))})
    return pd.DataFrame(rows)


def raw_audit(assets, raw, rtables, full):
    """Task013 raw-aggregation boundary checks with the categorical-safe mutator."""
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
            for variant, rr in (("prefix", r[t < cut]), ("future_mutation", safe_mutate_raw_future(r, cut))):
                got = S.residual_table(rr, a, cut)
                rows.append({"asset_id": aid, "cut_utc": cut.isoformat(), "cut_kind": kind, "variant": variant,
                             "compared_minutes": len(want), "pass": bool(canonical(got).equals(canonical(want)))})
    return pd.DataFrame(rows, columns=["asset_id", "cut_utc", "cut_kind", "variant", "compared_minutes", "pass"])


def coverage(pred):
    rows = []
    for aid, r, src, wf in zip(pred.asset_id, pred.rule_detail, pred.diagnosis_source, pred.wf_status):
        d = json.loads(r) if isinstance(r, str) else {}
        rows.append({"asset_id": aid, "outcome": d.get("outcome"), "reason": d.get("reason"),
                     "emitted_source": src, "wf_status": wf})
    d = pd.DataFrame(rows)
    return d.fillna("-").groupby(list(d.columns)).size().rename("alerts").reset_index() if len(d) else d


def determinism_child():
    assets, feat, snaps, raw, _, _, _ = load_validation()
    print(json.dumps(T10.prediction_hashes(pipeline(assets, feat, raw, snaps)[2])))


def validate():
    started = time.monotonic()
    man = require_seal()
    train_ok = train_gate_still_passes(man)
    if not train_ok:
        raise SystemExit("frozen Task013 train evidence no longer shows Z995 passing and selected; no data accessed")
    run_dir = OUT / f"run-{pd.Timestamp.now(tz='UTC').strftime('%Y%m%dT%H%M%S%fZ')}"
    run_dir.mkdir(parents=True, exist_ok=False)
    assets, feat, snaps, raw, caps, events, benign = load_validation()
    tables, rtables, preds = pipeline(assets, feat, raw, snaps)
    main_hashes = T10.prediction_hashes(preds)
    for c, p in preds.items():
        p.to_csv(run_dir / f"predictions_{c}.csv", index=False)
    save_json(run_dir / "run_provenance.json", {
        "manifest_sha256": sha256(MANIFEST), "code_sha256": man["code_sha256"], "candidate": CANDIDATE,
        "inputs": validation_projection_hashes(assets, feat, snaps, events, benign),
        "raw_inputs": R13.raw_provenance(raw, caps), "aggregation": R13.aggregation_provenance(rtables),
        "prediction_sha256": main_hashes, "train_gate_still_passes": train_ok, "fitted_models": None,
        "seed": os.environ.get("PYTHONHASHSEED"), "python": sys.version.split()[0],
        "test_touched": False, "scored": False})
    coverage(preds[CANDIDATE]).to_csv(run_dir / "applicability_coverage.csv", index=False)
    control = canonical_predictions(CONTROL_PRED)
    checks = {"control_equals_saved": bool(canonical(canonical_predictions(preds["B1"][B._COLS])).equals(
        canonical(control)))}
    key = lambda p: sorted(zip(p.asset_id, p.alert_time_utc))
    checks["emission_equal_control"] = key(preds[CANDIDATE]) == key(preds["B1"])
    summ, pers, asset_rows, reports = {}, {}, [], {}
    for c, p in preds.items():
        s, per, rep = score_validation(c, p, events, assets, benign)
        summ[c], pers[c], reports[c] = s, per, rep
        save_json(run_dir / f"report_{c}.json", rep)
        asset_rows += per_asset_validation(c, p, per, events, assets, benign)
        per.to_csv(run_dir / f"per_event_{c}.csv", index=False)
    comp = pd.DataFrame([summ[c] for c in CONFIGS])
    comp.to_csv(run_dir / "comparison_unchecked.csv", index=False)
    pd.DataFrame(asset_rows).to_csv(run_dir / "per_asset.csv", index=False)
    trans = transitions(pers["B1"], pers[CANDIDATE])
    trans.to_csv(run_dir / "event_transitions.csv", index=False)
    sb = summ["B1"]
    checks["control_metrics"] = {k: int(sb[k]) == v for k, v in CONTROL_EXPECT.items()}
    checks["control_composite"] = abs(sb["composite_score"] - CONTROL_COMPOSITE) < 1e-9
    checks["report_context"] = {c: report_context(reports[c]) for c in CONFIGS}
    audit = causality_audit(assets, feat, snaps, tables, rtables, preds)
    audit.to_csv(run_dir / "causality_audit.csv", index=False)
    rawa = raw_audit(assets, raw, rtables, preds)
    rawa.to_csv(run_dir / "raw_aggregation_audit.csv", index=False)
    checks["causality_failures"] = {c: int((~audit[audit.config == c]["pass"]).sum()) for c in CONFIGS}
    checks["causality_checks"] = {c: int((audit.config == c).sum()) for c in CONFIGS}
    checks["raw_aggregation_failures"] = int((~rawa["pass"]).sum())
    checks["raw_aggregation_checks"] = int(len(rawa))
    child = json.loads(subprocess.run([sys.executable, __file__, "determinism-child"],
                                      env={**os.environ, "PYTHONHASHSEED": "0"}, check=True, capture_output=True,
                                      text=True, cwd=ROOT).stdout)
    checks["determinism"] = {c: child[c] == main_hashes[c] for c in main_hashes}
    save_json(run_dir / "determinism.json", {"main": main_hashes, "fresh_child": child})
    correctness_ok = (checks["control_equals_saved"] and checks["emission_equal_control"]
                      and all(all(v.values()) for v in checks["report_context"].values())
                      and all(checks["control_metrics"].values()) and checks["control_composite"]
                      and all(v == 0 for v in checks["causality_failures"].values())
                      and checks["raw_aggregation_failures"] == 0 and all(checks["determinism"].values()))
    passed, gate, lost = adoption(sb, summ[CANDIDATE], trans, correctness_ok, train_ok)
    comp.to_csv(run_dir / "comparison.csv", index=False)
    save_json(run_dir / "run_summary.json", {
        "manifest_sha256": sha256(MANIFEST), "candidate": CANDIDATE, "checks": checks, "adoption_gate": gate,
        "adoption_pass": passed, **lost, "changed_events": trans[trans.changed].event_id.tolist(),
        "nature": "descriptive non-regression on previously inspected validation; not blind evidence",
        "test_touched": False, "runtime_s": round(time.monotonic() - started, 1)})
    save_json(COMPLETED, {"run_dir": str(run_dir.relative_to(ROOT)), "adoption_pass": passed})
    print(comp[["candidate", "detected", "type_correct", "class_correct", "false_episodes", "excess_repeats",
                "nuisance_benign", "sensor_type_and_channel", "wrong_specific_first", "wrong_channel_claim_count",
                "alerts", "composite_score"]].to_string())
    print("adoption gate:", json.dumps(gate))
    print("adoption_pass:", passed)


def selfcheck():
    man = json.loads(MANIFEST.read_text())
    print(json.dumps({"seed_pinned": seed_pinned(), "manifest_sha256": sha256(MANIFEST),
                      "code_matches_manifest": all(sha256(ROOT / p) == h for p, h in man["code_sha256"].items()),
                      "train_evidence_matches": all(sha256(ROOT / p) == h for p, h in
                                                    man["train_selection_evidence"]["file_sha256"].items()),
                      "sealed": SEAL.exists(), "completed": COMPLETED.exists()}, indent=2))


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "selfcheck"
    {"selfcheck": selfcheck, "validate": validate,
     "determinism-child": lambda: (require_seal(), determinism_child())}[mode]()
