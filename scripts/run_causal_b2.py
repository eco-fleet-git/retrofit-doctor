"""Causal B2 v1 protocol runner: train-only LOAO selection, then one sealed validation check.

  PYTHONHASHSEED=0 python scripts/run_causal_b2.py train
  PYTHONHASHSEED=0 python scripts/run_causal_b2.py validate     # refuses without a matching seal

Train mode never reads validation/test telemetry or labels. B2 v1 has no learned
parameters, so each LOAO fold's fit set is recorded but unused; held-out assets
are replayed independently with their own causal 24 h commissioning reference.
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
from retrofit_sim.scoring import score, BURST
from retrofit_doctor.causal_b1 import causal_features, predict_from_features
from retrofit_doctor import causal_b2 as B2
from run_b1 import canonical_predictions, save_json, sha256

OUT = ROOT / "results/causal_b2"
DATA = ROOT / "vendor/benchmark/data/full"
PROTOCOL = ROOT / "docs/experiments/protocol_v1.json"
CANDIDATES = ["C0", "C1", "C2", "C3", "C4", "C5"]
SEEDS = ["0", "1", "7", "9"]
RUN_ID = "causal-b2-v1-train-r2"
PRIOR_RUNS = [{"run_id": "causal-b2-v1-train-r1", "status": "INVALID",
               "reason": "audit flagged 83 of 1547 cutpoints (136 prediction+evidence comparisons) caused by None-vs-NaN missing-channel dtype "
                         "instability in predict_b2 output; fixed in r2 (regression test added); predictions unchanged",
               "artifacts": "results/causal_b2/run1_invalid/", "validation_touched": False}]
CODE = ["src/retrofit_doctor/causal_b2.py", "src/retrofit_doctor/causal_b1.py", "scripts/run_causal_b2.py",
        "scripts/run_b1.py", "vendor/benchmark/src/retrofit_sim/baselines.py", "vendor/benchmark/src/retrofit_sim/scoring.py",
        "docs/experiments/protocol_v1.json"]
CTRL = json.loads(PROTOCOL.read_text())["control_hashes"]


def predict(candidate, feat, assets):
    clocks = dict(zip(assets.asset_id, assets.window_end_utc))
    if candidate == "C0":
        p = predict_from_features(causal_features(feat, assets, clocks), k=6, persist=15)
        p["suspected_channel"] = [c0_channel(e) for e in p.evidence]
        p["class_status"] = np.where(p.fault_type == "UNKNOWN", "UNCERTAIN", "SUPPORTED")
        return p, None
    return B2.predict_b2(feat, assets, clocks, candidate)


def c0_channel(evidence):
    """Deterministic explicit-channel parse of B1 evidence: one name -> channel, missing rows -> GATEWAY."""
    if "missing rows" in evidence:
        return "GATEWAY"
    named = sorted({ch for ch in B.CH.values() if ch in evidence})
    return named[0] if len(named) == 1 else None


def first_bursts(pred):
    """Reproduce official bursting and keep the member alerts of each burst."""
    out = []
    p = pred.copy()
    p["t"] = pd.to_datetime(p.alert_time_utc, utc=True)
    for aid, g in p.sort_values(["asset_id", "t"], kind="stable").groupby("asset_id", sort=True):
        start, members = None, []
        for _, r in g.iterrows():
            if start is None or r.t - start > BURST:
                if members:
                    out.append((aid, start, members))
                start, members = r.t, []
            members.append(r)
        if members:
            out.append((aid, start, members))
    return out


def diagnostic_metrics(pred, report, events):
    """Protocol section 4 evaluator layered on official per_event (labels used only here)."""
    ev = events.set_index("event_id")
    bursts = {(a, t): m for a, t, m in first_bursts(pred)} if len(pred) else {}
    rows = []
    for pe in report["per_event"]:
        e = ev.loc[pe["event_id"]]
        channel, specific = None, None
        if pe["detected"]:
            members = bursts[pe["asset_id"], pd.Timestamp(pe["first_alert_utc"])]
            chans = {m.suspected_channel for m in members if m.fault_type == pe["predicted_fault_type"]
                     and isinstance(m.suspected_channel, str)}
            channel = chans.pop() if len(chans) == 1 else None
            specific = pe["predicted_fault_type"] not in ("UNKNOWN", "AMBIGUOUS")
        tag = e.sensor_tag if isinstance(e.sensor_tag, str) else None
        rows.append({**{k: pe[k] for k in ["event_id", "asset_id", "event_class", "fault_type", "detected",
                                           "first_alert_utc", "predicted_fault_type", "predicted_class",
                                           "type_correct", "class_correct"]},
                     "sensor_tag": tag, "predicted_channel": channel, "specific_claim": bool(specific),
                     "type_and_channel": bool(e.event_class == "SENSOR" and pe["type_correct"] and channel == tag)})
    d = pd.DataFrame(rows)
    sens = d[d.event_class == "SENSOR"]
    nongw = sens[sens.sensor_tag != "GATEWAY"]
    hits = nongw[nongw.detected & (nongw.predicted_class == "SENSOR")]
    claims = hits[hits.predicted_channel.notna()]
    return d, {
        "sensor_events": len(sens), "sensor_type_and_channel": int(sens.type_and_channel.sum()),
        "sensor_type_and_channel_non_gateway": int(nongw.type_and_channel.sum()), "non_gateway_sensor_events": len(nongw),
        "channel_localization_among_hits": [int((claims.predicted_channel == claims.sensor_tag).sum()), len(hits)],
        "wrong_channel_claims": [int((claims.predicted_channel != claims.sensor_tag).sum()), len(claims)],
        "selective_diagnosis": [int((d.specific_claim & d.type_correct).sum()), int(d.specific_claim.sum()), len(d)],
        "unknown_first_diagnoses": int((d.predicted_fault_type == "UNKNOWN").sum()),
        "useful_diagnosis_delay": "not_implemented_in_session1"}


def summarise(name, report, extra):
    return {"candidate": name, "composite_score": report["composite_score"], "detected": report["true_positive_events"],
            "type_correct": int(sum(e["type_correct"] for e in report["per_event"])),
            "class_correct": int(sum(e["class_correct"] for e in report["per_event"])),
            "events": report["events_scored"], "false_episodes": report["false_alert_episodes"],
            "excess_repeats": report["excess_repeat_episodes"],
            "false_plus_excess": report["false_alert_episodes"] + report["excess_repeat_episodes"],
            "nuisance_benign": report["nuisance_alerts_in_benign_windows"], "alerts": report["alerts_scored"], **extra}


def causality_audit(candidate, feat, assets, full_pred, full_ev, rng, with_quality):
    rows = []
    for _, asset in assets.iterrows():
        aid = asset.asset_id
        a = assets[assets.asset_id == aid]
        f = feat[feat.asset_id == aid]
        start, end = pd.Timestamp(asset.window_start_utc), pd.Timestamp(asset.window_end_utc)
        cuts = {start + pd.Timedelta(hours=h): "original_audit" for h in [.75, 6, 12, 13, 18, 23, 24, 36, 48]}
        cuts.update({start + pd.Timedelta(hours=24) + pd.Timedelta(seconds=s): "reference_boundary" for s in [-1, 1, 59, 60]})
        for s in rng.integers(60, int((end - start).total_seconds()), size=10):
            cuts[start + pd.Timedelta(seconds=int(s))] = "random"
        fe = full_ev[full_ev.asset_id == aid]
        for t in pd.to_datetime(fe.alert_time_utc, utc=True):
            # exact alert boundaries: just before and at issuance
            cuts.setdefault(t - pd.Timedelta(seconds=1), "alert_boundary")
            cuts.setdefault(t, "alert_boundary")
        full_q = B2.channel_quality(f, a, {aid: end}) if with_quality else None
        fp = full_pred[full_pred.asset_id == aid].reset_index(drop=True)
        for cut, kind in sorted(cuts.items()):
            prefix = f[pd.to_datetime(f.window_start_utc, utc=True) + pd.Timedelta(minutes=1) <= cut]
            sp, se = B2.predict_b2(prefix, a, {aid: cut}, candidate)
            keep = pd.to_datetime(fe.alert_time_utc, utc=True) <= cut
            ev_ok = same(fe[keep], se)
            keep = pd.to_datetime(fp.alert_time_utc, utc=True) <= cut
            pred_ok = same(fp[keep], sp)
            q_ok = None
            if with_quality:
                sq = B2.channel_quality(prefix, a, {aid: cut})
                q_ok = same(full_q[full_q.window_start_utc + pd.Timedelta(minutes=1) <= cut], sq)
            rows.append({"candidate": candidate, "asset_id": aid, "cutoff_utc": cut.isoformat(), "kind": kind,
                         "alerts": len(sp), "predictions_match": pred_ok, "evidence_match": ev_ok, "quality_match": q_ok})
    return rows


def same(left, right):
    try:
        pd.testing.assert_frame_equal(left.reset_index(drop=True), right.reset_index(drop=True), check_dtype=False,
                                      check_exact=False, atol=1e-6, rtol=0)
        return True
    except AssertionError:
        return False


def determinism_child():
    assets, feat = B2.load_split_inputs(DATA, "train")
    digests = {}
    for c in CANDIDATES[1:]:
        _, ev = predict(c, feat, assets)
        digests[c] = hashlib.sha256(ev.to_csv(index=False).encode()).hexdigest()
    print(json.dumps(digests))


def gates(row, c0):
    reasons = []
    if row["detected"] < c0["detected"]:
        reasons.append("detection_below_C0")
    if row["class_correct"] < c0["class_correct"]:
        reasons.append("class_below_C0")
    if row["type_correct"] < c0["type_correct"]:
        reasons.append("type_below_C0")
    if row["false_plus_excess"] > c0["false_plus_excess"]:
        reasons.append("burden_above_C0")
    return reasons


def train():
    started = time.monotonic()
    OUT.mkdir(parents=True, exist_ok=True)
    for path, h in CTRL.items():
        assert sha256(ROOT / path) == h, f"control file changed: {path}"
    manifest = json.loads((ROOT / "vendor/benchmark/MANIFEST.json").read_text())
    assert all(sha256(ROOT / "vendor/benchmark" / e["path"]) == e["sha256"] for e in manifest["files"])
    assets, feat = B2.load_split_inputs(DATA, "train")
    events = pd.read_csv(DATA / "events_train.csv")
    assert set(events.asset_id) <= set(assets.asset_id)
    benign = pd.read_csv(DATA / "benign_windows_train_validation.csv").query("asset_id in @assets.asset_id")
    ids = sorted(assets.asset_id)
    folds = [{"fold": i, "held_out": a, "fit_assets": [x for x in ids if x != a], "learned_parameters": None}
             for i, a in enumerate(ids)]
    summary, per_asset, preds, evs = [], [], {}, {}
    for c in CANDIDATES:
        parts, eparts = [], []
        for fold in folds:
            a = assets[assets.asset_id == fold["held_out"]]
            p, ev = predict(c, feat[feat.asset_id == fold["held_out"]], a)
            parts.append(p)
            if ev is not None:
                eparts.append(ev)
            r = score(p[B._COLS], events, a, benign, "train")
            per_asset.append(summarise(c, r, {"asset_id": fold["held_out"], "fold": fold["fold"]}))
        p = pd.concat(parts, ignore_index=True)
        preds[c] = p
        evs[c] = pd.concat(eparts, ignore_index=True) if eparts else None
        p.to_csv(OUT / f"train_predictions_{c}.csv", index=False)
        if evs[c] is not None:
            evs[c].to_csv(OUT / f"train_evidence_{c}.csv", index=False)
        r = score(p[B._COLS], events, assets, benign, "train")
        save_json(OUT / f"train_report_{c}.json", r)
        d, extra = diagnostic_metrics(p, r, events)
        d.to_csv(OUT / f"train_events_{c}.csv", index=False)
        summary.append(summarise(c, r, extra))
        print(c, {k: summary[-1][k] for k in ["composite_score", "detected", "type_correct", "class_correct",
                                              "false_plus_excess", "sensor_type_and_channel"]}, flush=True)
    c0 = summary[0]
    ref = json.loads((ROOT / "results/causal_b1/report_causal_train.json").read_text())
    assert np.isclose(c0["composite_score"], ref["composite_score"], atol=1e-9, rtol=0), "C0 does not reproduce causal B1"
    pd.DataFrame(per_asset).to_csv(OUT / "train_per_asset.csv", index=False)

    rng = np.random.default_rng(20261106)
    audit = []
    for c in CANDIDATES[1:]:
        audit += causality_audit(c, feat, assets, preds[c], evs[c], rng, with_quality=(c == "C1"))
        print(f"causality {c}: {len(audit)} rows so far", flush=True)
    audit = pd.DataFrame(audit)
    audit.to_csv(OUT / "train_causality_audit.csv", index=False)

    det = {}
    for seed in SEEDS:
        r = subprocess.run([sys.executable, "-B", __file__, "determinism-child"], cwd=ROOT, capture_output=True, text=True,
                           check=True, env=dict(os.environ, PYTHONHASHSEED=seed, PYTHONDONTWRITEBYTECODE="1"))
        det[seed] = json.loads(r.stdout.strip().splitlines()[-1])
    save_json(OUT / "determinism.json", det)

    rows = []
    for s in summary:
        c = s["candidate"]
        bad = []
        if c != "C0":
            a = audit[audit.candidate == c]
            fails = int((~a.predictions_match).sum() + (~a.evidence_match).sum()
                        + (a.quality_match.notna() & (a.quality_match == False)).sum())  # noqa: E712
            if fails:
                bad.append(f"causality_failures={fails}")
            if len({det[seed][c] for seed in SEEDS}) != 1:
                bad.append("hash_seed_nondeterminism")
            bad += gates(s, c0)
        rows.append({**s, "gate_failures": "|".join(bad), "passes": c != "C0" and not bad})
    table = pd.DataFrame(rows)
    table.to_csv(OUT / "train_selection_table.csv", index=False)
    passing = table[table.passes]
    if len(passing):
        best = passing.assign(cid=passing.candidate.str[1:].astype(int)).sort_values(
            ["sensor_type_and_channel", "type_correct", "composite_score", "cid"],
            ascending=[False, False, False, True]).iloc[0]
        selected = best.candidate
    else:
        selected = "C0"
    selection = {
        "protocol_id": "retrofit-doctor-causal-b2-v1", "run_id": RUN_ID, "selected_candidate": selected,
        "prior_runs": PRIOR_RUNS,
        "selection_rule": "hard gates vs C0, then max sensor type+channel, type, composite, min id (FROZEN_PROTOCOL 3)",
        "fallback_applied": selected == "C0", "folds": folds,
        "candidates": {c: ({"method": "unchanged_causal_b1", "k": 6, "persist": 15} if c == "C0" else
                           {"method": "B2", "trajectory": B2.CANDIDATES[c]}) for c in CANDIDATES},
        "fixed_parameters": {"K": B2.K, "VAR_K": B2.VAR_K, "PERSIST_MIN": B2.PERSIST_MIN, "MIN_UPDATES": B2.MIN_UPDATES,
                             "STALE_INTERVALS": B2.STALE_INTERVALS, "TRAJ_MIN_UPDATES": B2.TRAJ_MIN_UPDATES,
                             "TRAJ_SPAN": B2.TRAJ_SPAN, "STEP_SIDE": B2.STEP_SIDE, "MIN_COUPLED": B2.MIN_COUPLED,
                             "COUPLED_MAX": B2.COUPLED_MAX, "RETRY_MIN": B2.RETRY_MIN, "reference_hours": 24},
        "train_table": rows, "causality_rows": len(audit), "determinism_seeds": SEEDS,
        "code_sha256": {p: sha256(ROOT / p) for p in CODE},
        "inputs_sha256": {"features_1min.parquet(manifest)": next(e["sha256"] for e in manifest["files"]
                                                                  if e["path"].endswith("full/features_1min.parquet")),
                          "events_train.csv": sha256(DATA / "events_train.csv"), "assets.csv": sha256(DATA / "assets.csv")},
        "python": sys.version, "pandas": pd.__version__, "numpy": np.__version__,
        "exposure": "validation previously inspected (causal B1 per-event analysis); current candidate chosen on train only; "
                    "validation check will be descriptive, not an independent blind test. No test telemetry/labels read.",
        "sealed_at": pd.Timestamp.now(tz="UTC").isoformat(), "elapsed_s": round(time.monotonic() - started, 1)}
    save_json(OUT / "selection.json", selection)
    print(table[["candidate", "composite_score", "detected", "type_correct", "class_correct", "false_plus_excess",
                 "sensor_type_and_channel", "gate_failures", "passes"]].to_string(), flush=True)
    print("selected:", selected, flush=True)


def validate():
    sel_path = OUT / "selection.json"
    if not sel_path.exists():
        raise SystemExit("No sealed selection.json; run train selection first")
    sel = json.loads(sel_path.read_text())
    changed = [p for p, h in sel["code_sha256"].items() if sha256(ROOT / p) != h]
    if changed:
        raise SystemExit(f"Sealed code changed since selection: {changed}")
    if (OUT / "validation_summary.json").exists():
        raise SystemExit("Validation already evaluated once; a rerun needs a new experiment ID")
    assets, feat = B2.load_split_inputs(DATA, "validation")
    events = pd.read_csv(DATA / "events_validation.csv")
    benign = pd.read_csv(DATA / "benign_windows_train_validation.csv").query("asset_id in @assets.asset_id")
    out = []
    for c in dict.fromkeys(["C0", sel["selected_candidate"]]):
        p, ev = predict(c, feat, assets)
        p.to_csv(OUT / f"validation_predictions_{c}.csv", index=False)
        if ev is not None:
            ev.to_csv(OUT / f"validation_evidence_{c}.csv", index=False)
        r = score(p[B._COLS], events, assets, benign, "validation")
        save_json(OUT / f"validation_report_{c}.json", r)
        d, extra = diagnostic_metrics(p, r, events)
        d.to_csv(OUT / f"validation_events_{c}.csv", index=False)
        out.append(summarise(c, r, extra))
    save_json(OUT / "validation_summary.json", {"selected": sel["selected_candidate"], "rows": out,
                                                "evaluated_at": pd.Timestamp.now(tz="UTC").isoformat(),
                                                "exposure": sel["exposure"]})
    print(pd.DataFrame(out).to_string())


if __name__ == "__main__":
    {"train": train, "validate": validate, "determinism-child": determinism_child}[sys.argv[1]]()
