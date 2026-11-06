"""Task008 sparse-stuck follow-up: registered S0..S3, train-only selection, one gated validation check.

  PYTHONHASHSEED=0 python scripts/run_sparse_stuck.py manifest     # once, before any candidate score
  PYTHONHASHSEED=0 python scripts/run_sparse_stuck.py train        # 7 held-out-asset replays, gates, seal
  PYTHONHASHSEED=0 python scripts/run_sparse_stuck.py validate     # only if S2/S3 passed; S0 + selected, once

Sealed Task002 modules are imported unchanged. S1 is a comparison control and cannot be selected.
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
from retrofit_sim.scoring import score
from retrofit_doctor import causal_b2 as B2
from retrofit_doctor.sparse_stuck import REFERENCE_MIN_SAMPLES, predict_variant
from run_b1 import save_json, sha256
from run_causal_b2 import diagnostic_metrics, predict as predict_task002, same, summarise
from run_sensor_ablation import _event_windows

OUT = ROOT / "results/sparse_stuck_followup"
DATA = ROOT / "vendor/benchmark/data/full"
CANDIDATES = ["S0", "S1", "S2", "S3"]
DEPLOYABLE = ["S2", "S3"]
SEEDS = ["0", "1", "7", "9"]
GATES = {"detected_min": 18, "class_correct_min": 14, "type_correct_min": 8, "false_plus_excess_max": 6}
SEALED = ["src/retrofit_doctor/sparse_stuck.py", "src/retrofit_doctor/causal_b2.py", "src/retrofit_doctor/causal_b1.py",
          "scripts/run_sparse_stuck.py", "scripts/run_causal_b2.py", "scripts/run_b1.py",
          "scripts/run_sensor_ablation.py", "vendor/benchmark/src/retrofit_sim/baselines.py",
          "vendor/benchmark/src/retrofit_sim/scoring.py", "docs/experiments/protocol_v1.json",
          "docs/tasks/008-sparse-stuck-followup.md"]
CUTS = ROOT / "results/causal_b1/causality_audit.csv"
C1_STORED = ROOT / "results/causal_b2/train_predictions_C1.csv"
CORE = ["asset_id", "alert_time_utc", "event_class", "fault_type", "confidence", "suspected_channel", "class_status"]


def predict(candidate, feat, assets):
    if candidate == "S0":
        return predict_task002("C0", feat, assets)
    return predict_variant(feat, assets, dict(zip(assets.asset_id, assets.window_end_utc)), candidate)


def sparse_stuck_table(pred, events, assets):
    """Every sparse-channel SENSOR_STUCK alert, marked inside/outside a real stuck event on that channel."""
    sparse = {(r.asset_id, ch) for r in assets.itertuples() for ch in B2.WIRELESS
              if B2.expected_cadence_min(r._asdict(), ch) not in (None, 1.)}
    ev = _event_windows(events, assets)
    real = ev[ev.fault_type == "SENSOR_STUCK"]
    rows = []
    for r in pred[pred.fault_type == "SENSOR_STUCK"].itertuples():
        if (r.asset_id, r.suspected_channel) not in sparse:
            continue
        t = pd.Timestamp(r.alert_time_utc)
        hit = real[(real.asset_id == r.asset_id) & (real.sensor_tag == r.suspected_channel)
                   & (real.w_start <= t) & (t <= real.w_end)]
        rows.append({"asset_id": r.asset_id, "alert_time_utc": r.alert_time_utc, "channel": r.suspected_channel,
                     "real_stuck_event": hit.event_id.iloc[0] if len(hit) else None})
    return pd.DataFrame(rows, columns=["asset_id", "alert_time_utc", "channel", "real_stuck_event"])


def manifest():
    path = OUT / "manifest.json"
    if path.exists():
        raise SystemExit("manifest already saved")
    OUT.mkdir(parents=True, exist_ok=True)
    ev = pd.read_csv(DATA / "events_train.csv")
    obs = ev[ev.observable.astype(str).str.lower().isin(["true", "1"])]
    save_json(path, {
        "experiment": "Task008 sparse-stuck follow-up", "registered_before_scoring": True,
        "candidates": {
            "S0": "unchanged causal B1 (released control), k=6, persist=15",
            "S1": "unchanged Task002 C1 (comparison control; not selectable)",
            "S2": "C1 with the sparse-stuck source disabled; all other sources unchanged",
            "S3": "C1 with commissioning-repeat sparse stuck: threshold max(3, longest reference equal run + 1), "
                  "frozen at 24 h; S3 sparse stuck chains reset at the freeze and on gap, stale, non-steady minute "
                  "or g.regime change; reference samples = fresh steady non-gap samples in the first 24 h; "
                  f"< {REFERENCE_MIN_SAMPLES} reference samples or before freeze -> unsupported; "
                  "15 min wall-clock persistence; exact equality (no resolution guess)"},
        "deployable": DEPLOYABLE, "gates": GATES, "gates_source": "Task002 hard gates, unchanged",
        "tie_break": ["max sensor type+channel", "max correct type", "max composite", "min candidate id"],
        "fallback": "S0", "train_assets": sorted(obs.asset_id.unique()), "observable_events": len(obs),
        "observable_event_ids": sorted(obs.event_id), "asset_days": 49,
        "folds": "7 independent held-out-asset replays; no across-asset fit",
        "validation": "one descriptive check of the selected deployable candidate vs S0, only if one passes; "
                      "validation split previously inspected",
        "sealed_sha256": {p: sha256(ROOT / p) for p in SEALED},
        "inputs_sha256": {p: sha256(DATA / p) for p in ["assets.csv", "events_train.csv",
                                                         "benign_windows_train_validation.csv"]},
        "saved_at": pd.Timestamp.now(tz="UTC").isoformat()})
    print("manifest saved")


def check_manifest():
    m = json.loads((OUT / "manifest.json").read_text())
    changed = [p for p, h in m["sealed_sha256"].items() if sha256(ROOT / p) != h]
    if changed:
        raise SystemExit(f"sealed files changed since manifest: {changed}")
    return m


def determinism_child():
    assets, feat = B2.load_split_inputs(DATA, "train")
    print(json.dumps({c: hashlib.sha256(predict(c, feat, assets)[1].to_csv(index=False).encode()).hexdigest()
                      for c in ["S1", "S2", "S3"]}))


def train():
    started = time.monotonic()
    m = check_manifest()
    assets, feat = B2.load_split_inputs(DATA, "train")
    events = pd.read_csv(DATA / "events_train.csv")
    benign = pd.read_csv(DATA / "benign_windows_train_validation.csv").query("asset_id in @assets.asset_id")
    preds, evs, summary, per_events, stuck_rows = {}, {}, [], {}, []
    for c in CANDIDATES:
        parts, eparts = [], []
        for aid in sorted(assets.asset_id):
            a = assets[assets.asset_id == aid]
            p, e = predict(c, feat[feat.asset_id == aid], a)
            parts.append(p)
            if e is not None:
                eparts.append(e)
        p = pd.concat(parts, ignore_index=True)
        preds[c], evs[c] = p, (pd.concat(eparts, ignore_index=True) if eparts else None)
        p.to_csv(OUT / f"train_predictions_{c}.csv", index=False)
        if evs[c] is not None:
            evs[c].to_csv(OUT / f"train_evidence_{c}.csv", index=False)
        r = score(p[B._COLS], events, assets, benign, "train")
        save_json(OUT / f"train_report_{c}.json", r)
        d, extra = diagnostic_metrics(p, r, events)
        per_events[c] = d
        st = sparse_stuck_table(p, events, assets).assign(candidate=c)
        stuck_rows.append(st)
        real = events[(events.fault_type == "SENSOR_STUCK") & events.sensor_tag.isin(B2.WIRELESS)].event_id
        extra.update({"sparse_stuck_alerts": len(st), "sparse_stuck_alerts_outside_real_stuck": int(st.real_stuck_event.isna().sum()),
                      "real_sparse_stuck_events": ",".join(sorted(real)),
                      "real_sparse_stuck_type_and_channel": int(d[d.event_id.isin(real)].type_and_channel.sum())})
        summary.append(summarise(c, r, extra))
        print(c, {k: summary[-1][k] for k in ["composite_score", "detected", "type_correct", "class_correct",
                                              "false_plus_excess", "sensor_type_and_channel", "sparse_stuck_alerts",
                                              "sparse_stuck_alerts_outside_real_stuck"]}, flush=True)
    pd.concat(stuck_rows, ignore_index=True).to_csv(OUT / "train_sparse_stuck_alerts.csv", index=False)
    s0 = json.loads((ROOT / "results/causal_b1/report_causal_train.json").read_text())
    assert np.isclose(summary[0]["composite_score"], s0["composite_score"], atol=1e-9, rtol=0), "S0 parity failed"
    stored = pd.read_csv(C1_STORED)[CORE]
    mine = pd.read_csv(OUT / "train_predictions_S1.csv")[CORE]
    s1_parity = same(stored, mine)

    paired = per_events["S0"][["event_id", "asset_id", "event_class", "fault_type", "sensor_tag"]].copy()
    for c in CANDIDATES:
        d = per_events[c][["event_id", "detected", "predicted_fault_type", "predicted_class", "predicted_channel",
                           "first_alert_utc", "type_correct", "class_correct", "type_and_channel"]]
        paired = paired.merge(d.rename(columns={k: f"{k}@{c}" for k in d.columns if k != "event_id"}), on="event_id")
    paired.to_csv(OUT / "train_paired_events.csv", index=False)

    cuts = pd.read_csv(CUTS).query("split == 'train'")
    audit = []
    for aid, cc in cuts.groupby("asset_id", sort=True):
        a = assets[assets.asset_id == aid]
        f = feat[feat.asset_id == aid]
        end = a.window_end_utc.iloc[0]
        for c in ["S1", "S2", "S3"]:
            fp = preds[c][preds[c].asset_id == aid].reset_index(drop=True)
            fe = evs[c][evs[c].asset_id == aid].reset_index(drop=True)
            for cut in pd.to_datetime(cc.cutoff_utc, utc=True):
                prefix = f[pd.to_datetime(f.window_start_utc, utc=True) + pd.Timedelta(minutes=1) <= cut]
                sp, se = predict_variant(prefix, a, {aid: cut}, c)
                keep = pd.to_datetime(fe.alert_time_utc, utc=True) <= cut
                future = f.copy()
                late = pd.to_datetime(future.window_start_utc, utc=True) >= cut
                num = [x for x in future.select_dtypes("number").columns if x != "rows"]
                future.loc[late, num] = future.loc[late, num] * -7 + 1e4   # drastic future-value mutation
                mp, me = predict_variant(future, a, {aid: end}, c)
                mkeep = pd.to_datetime(me.alert_time_utc, utc=True) <= cut
                audit.append({"candidate": c, "asset_id": aid, "cutoff_utc": cut.isoformat(),
                              "prefix_predictions_match": same(fp[pd.to_datetime(fp.alert_time_utc, utc=True) <= cut], sp),
                              "prefix_evidence_match": same(fe[keep], se),
                              "future_mutation_evidence_match": same(fe[keep], me[mkeep])})
        print("causality", aid, flush=True)
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
        c, bad = s["candidate"], []
        if c != "S0":
            a = audit[audit.candidate == c]
            fails = int((~a.prefix_predictions_match).sum() + (~a.prefix_evidence_match).sum()
                        + (~a.future_mutation_evidence_match).sum())
            if fails:
                bad.append(f"causality_failures={fails}")
            if len({det[x][c] for x in SEEDS}) != 1:
                bad.append("hash_seed_nondeterminism")
            if s["detected"] < GATES["detected_min"]:
                bad.append("detection_below_18")
            if s["class_correct"] < GATES["class_correct_min"]:
                bad.append("class_below_14")
            if s["type_correct"] < GATES["type_correct_min"]:
                bad.append("type_below_8")
            if s["false_plus_excess"] > GATES["false_plus_excess_max"]:
                bad.append("burden_above_6")
            if c not in DEPLOYABLE:
                bad.append("comparison_control_not_selectable")
        rows.append({**s, "gate_failures": "|".join(bad), "passes": c in DEPLOYABLE and not bad})
    table = pd.DataFrame(rows)
    table.to_csv(OUT / "train_selection_table.csv", index=False)
    passing = table[table.passes]
    if len(passing):
        selected = passing.assign(cid=passing.candidate.str[1:].astype(int)).sort_values(
            ["sensor_type_and_channel", "type_correct", "composite_score", "cid"],
            ascending=[False, False, False, True]).iloc[0].candidate
    else:
        selected = "S0"
    save_json(OUT / "selection.json", {
        "experiment": m["experiment"], "selected_candidate": selected, "fallback_applied": selected == "S0",
        "s0_parity_with_causal_b1_train": True, "s1_parity_with_sealed_task002_c1_core_fields": s1_parity,
        "causality_rows": len(audit), "causality_cutpoints": "162 stored causal-B1 train cutpoints x S1/S2/S3; "
        "prefix replay + drastic future-value mutation", "determinism_seeds": SEEDS,
        "train_table": rows, "sealed_sha256": m["sealed_sha256"],
        "exposure": "validation previously inspected; selection on train only; validation check descriptive",
        "sealed_at": pd.Timestamp.now(tz="UTC").isoformat(), "elapsed_s": round(time.monotonic() - started, 1)})
    print(table[["candidate", "composite_score", "detected", "type_correct", "class_correct", "false_plus_excess",
                 "sensor_type_and_channel", "sparse_stuck_alerts", "sparse_stuck_alerts_outside_real_stuck",
                 "gate_failures", "passes"]].to_string(index=False))
    print("S1 parity:", s1_parity, "selected:", selected, flush=True)


def validate():
    sel = json.loads((OUT / "selection.json").read_text())
    check_manifest()
    if sel["selected_candidate"] not in DEPLOYABLE:
        raise SystemExit("No deployable candidate passed train gates; validation is not run (S0 retained)")
    if (OUT / "validation_summary.json").exists():
        raise SystemExit("validation already evaluated once")
    assets, feat = B2.load_split_inputs(DATA, "validation")
    events = pd.read_csv(DATA / "events_validation.csv")
    benign = pd.read_csv(DATA / "benign_windows_train_validation.csv").query("asset_id in @assets.asset_id")
    out, per = [], {}
    for c in ["S0", sel["selected_candidate"]]:
        p, e = predict(c, feat, assets)
        p.to_csv(OUT / f"validation_predictions_{c}.csv", index=False)
        if e is not None:
            e.to_csv(OUT / f"validation_evidence_{c}.csv", index=False)
        r = score(p[B._COLS], events, assets, benign, "validation")
        save_json(OUT / f"validation_report_{c}.json", r)
        d, extra = diagnostic_metrics(p, r, events)
        per[c] = d
        out.append(summarise(c, r, extra))
    a, b = per["S0"], per[sel["selected_candidate"]]
    a.merge(b, on=["event_id", "asset_id", "event_class", "fault_type", "sensor_tag"],
            suffixes=("@S0", f"@{sel['selected_candidate']}")).to_csv(OUT / "validation_paired_events.csv", index=False)
    save_json(OUT / "validation_summary.json", {"selected": sel["selected_candidate"], "rows": out,
                                                "evaluated_at": pd.Timestamp.now(tz="UTC").isoformat(),
                                                "exposure": sel["exposure"]})
    print(pd.DataFrame(out)[["candidate", "composite_score", "detected", "type_correct", "class_correct",
                             "false_plus_excess", "sensor_type_and_channel"]].to_string(index=False))


if __name__ == "__main__":
    {"manifest": manifest, "train": train, "validate": validate, "determinism-child": determinism_child}[sys.argv[1]]()
