"""Task004 E5/H7: information value of existing sensor groups for the sealed detector (mask/restore).

  PYTHONHASHSEED=0 python scripts/run_sensor_ablation.py manifest     # once, before any branch result
  PYTHONHASHSEED=0 python scripts/run_sensor_ablation.py train        # PUMP-02/04/07; restore + causality gate
  PYTHONHASHSEED=0 python scripts/run_sensor_ablation.py validation   # PUMP-09 descriptive; needs the train gate

The Task002 seal selected C0, so the detector is unchanged causal B1 (k=6, persist=15).
A mask is an information-availability intervention (columns absent from the start of the
window, channel removed from working metadata), not failed hardware or a comm fault.
No refitting, threshold change or group selection. Original labels are used only here.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys
import time

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "src"), str(ROOT / "vendor/benchmark/src"), str(ROOT / "scripts")]
from retrofit_sim import baselines as B
from retrofit_sim import scoring as S
from retrofit_doctor.causal_b1 import causal_features, predict_from_features
from run_b1 import save_json, sha256

OUT = ROOT / "results/sensor_ablation"
DATA = ROOT / "vendor/benchmark/data/full"
PROTOCOL = json.loads((ROOT / "docs/experiments/protocol_v1.json").read_text())["sensor_ablation"]
GROUPS = PROTOCOL["groups"]
TRAIN_ASSETS = PROTOCOL["train_assets"]
VALIDATION_ASSETS = PROTOCOL["descriptive_validation_assets"]
BRANCHES = ["full"] + [f"mask:{g}" for g in GROUPS] + [f"restore:{g}" for g in GROUPS]
CONSUMED_SUFFIXES = ("mean", "std", "count")
BASE_COLUMNS = ["asset_id", "window_start_utc", "rows", "operating_mode", "running_fraction"]
ATOL = 1e-6
SEALED = ["src/retrofit_doctor/causal_b1.py", "vendor/benchmark/src/retrofit_sim/baselines.py",
          "vendor/benchmark/src/retrofit_sim/scoring.py", "scripts/run_b1.py", "scripts/run_sensor_ablation.py",
          "results/causal_b2/selection.json", "docs/experiments/protocol_v1.json"]
INPUTS = ["assets.csv", "events_train.csv", "events_validation.csv", "benign_windows_train_validation.csv"]
CUTS = ROOT / "results/causal_b1/causality_audit.csv"


# --- detector and interventions --------------------------------------------------------------------------

def predict_c0(features, assets, as_of):
    """Sealed selection C0: unchanged causal B1, k=6, persistence=15."""
    return predict_from_features(causal_features(features, assets, as_of), k=6, persist=15)


def consumed_columns(features):
    """Every feature column causal B1 reads: clock/gateway/mode columns plus mean/std/count of B1 channels."""
    cols = [c for c in BASE_COLUMNS if c in features]
    for ch in B.CH.values():
        cols += [f"{ch}__{s}" for s in CONSUMED_SUFFIXES if f"{ch}__{s}" in features]
    return cols


def mask_group(features, assets, group):
    """Return copies without any column derived from the group's channels and without them in metadata."""
    channels = GROUPS[group]
    f = features.drop(columns=[c for c in features if c.split("__")[0] in channels])
    a = assets.copy()
    record = {}
    for i, row in a.iterrows():
        avail = str(row.channels_available).split("|")
        record[row.asset_id] = {"removed": sorted(c for c in channels if c in avail),
                                "not_installed": sorted(c for c in channels if c not in avail)}
        a.at[i, "channels_available"] = "|".join(c for c in avail if c not in channels)
    return f, a, record


def restore_group(masked_features, masked_assets, original_features, original_assets, group):
    """Re-attach the group's original columns and metadata by key; must reproduce the full branch."""
    channels = GROUPS[group]
    key = ["asset_id", "window_start_utc"]
    back = original_features[key + [c for c in original_features if c.split("__")[0] in channels]]
    f = masked_features.merge(back, on=key, how="left", validate="one_to_one")
    f = f[list(original_features.columns)]
    f.index = original_features.index
    a = masked_assets.copy()
    a["channels_available"] = original_assets.set_index("asset_id").loc[a.asset_id, "channels_available"].to_numpy()
    return f, a


# --- evaluator (labels used only here) ---------------------------------------------------------------------

def _event_windows(events, assets):
    ws = dict(zip(assets.asset_id, S._ts(assets.window_start_utc)))
    we = dict(zip(assets.asset_id, S._ts(assets.window_end_utc)))
    ev = events[events.asset_id.isin(ws)].copy()
    for c in ("onset_utc", "detectable_utc", "action_deadline_utc", "end_utc"):
        ev[c] = S._ts(ev[c])
    ev["observable"] = ev["observable"].astype(str).str.lower().isin(["true", "1"])
    starts, ends = [], []
    for _, e in ev.iterrows():
        s = max(e.onset_utc, ws[e.asset_id])
        if pd.notna(e.detectable_utc):
            s = max(s, e.detectable_utc - S.PRE_TOL)
        if pd.isna(e.end_utc):
            end = we[e.asset_id]
        else:
            soft = e.fault_type in S.SOFT_END or e.event_class == "SENSOR"
            end = min(e.end_utc + (S.POST_TOL if soft else pd.Timedelta(0)), we[e.asset_id])
        starts.append(s)
        ends.append(end)
    ev["w_start"], ev["w_end"] = starts, ends
    return ev


def first_correct_type_alerts(pred, events, assets):
    """Replicates official burst->event assignment; reports first and first correct-type assigned burst."""
    ev = _event_windows(events, assets)
    p = S.load_predictions(pred) if len(pred) else pd.DataFrame(columns=S.REQUIRED)
    bu = S.bursts(p) if len(p) else pd.DataFrame(columns=["asset_id", "alert_time_utc", "event_class", "fault_type"])
    assigned = {}
    for _, r in bu.iterrows():
        e_a = ev[ev.asset_id == r.asset_id]
        cand = e_a[(e_a.w_start <= r.alert_time_utc) & (r.alert_time_utc <= e_a.w_end)]
        if not len(cand):
            continue
        cand = cand.assign(_type=(cand.fault_type != r.fault_type).astype(int),
                           _cls=(cand.event_class != r.event_class).astype(int),
                           _det=cand.event_id.isin(assigned).astype(int))
        eid = cand.sort_values(["_type", "_cls", "_det", "onset_utc"]).iloc[0].event_id
        assigned.setdefault(eid, []).append(r)
    rows = []
    for _, e in ev[ev.observable].iterrows():
        bursts = assigned.get(e.event_id, [])
        good = [b for b in bursts if b.fault_type == e.fault_type]
        ref = e.detectable_utc if pd.notna(e.detectable_utc) else e.w_start
        t = good[0].alert_time_utc if good else None
        rows.append({"event_id": e.event_id, "asset_id": e.asset_id, "event_class": e.event_class,
                     "fault_type": e.fault_type, "first_alert_utc": bursts[0].alert_time_utc.isoformat() if bursts else None,
                     "first_correct_type_utc": t.isoformat() if t is not None else None,
                     "correct_type_detected": t is not None,
                     "correct_type_delay_h": (t - ref).total_seconds() / 3600 if t is not None else np.nan})
    return pd.DataFrame(rows)


def c0_channel(evidence):
    """Task002 C0 parse rule: one named B1 channel -> it; 'missing rows' -> GATEWAY; otherwise None."""
    if "missing rows" in evidence:
        return "GATEWAY"
    named = sorted({ch for ch in B.CH.values() if ch in evidence})
    return named[0] if len(named) == 1 else None


def evaluate(pred, events, assets, benign):
    """Official scorer on the original assets/events + paired per-event table."""
    rep = S.score(pred, events, assets, benign)
    per = pd.DataFrame(rep["per_event"])
    extra = first_correct_type_alerts(pred, events, assets)
    detected = per.set_index("event_id").first_alert_utc.dropna()
    mine = extra.set_index("event_id").first_alert_utc.dropna()
    assert detected.sort_index().equals(mine.sort_index()), "evaluator does not reproduce official assignment"
    p = pred.copy()
    p["t"] = pd.to_datetime(p.alert_time_utc, utc=True)
    channel = {}
    for e in rep["per_event"]:
        if e["detected"]:
            t = pd.Timestamp(e["first_alert_utc"])
            m = p[(p.asset_id == e["asset_id"]) & (p.t >= t) & (p.t - t <= S.BURST)
                  & (p.fault_type == e["predicted_fault_type"])]
            chans = {c0_channel(x) for x in m.evidence} - {None}
            channel[e["event_id"]] = chans.pop() if len(chans) == 1 else None
    tags = events.set_index("event_id").sensor_tag
    per = per.merge(extra[["event_id", "first_correct_type_utc", "correct_type_detected", "correct_type_delay_h"]],
                    on="event_id")
    per["predicted_channel"] = per.event_id.map(channel)
    per["sensor_tag"] = per.event_id.map(tags)
    per["type_and_channel"] = (per.event_class == "SENSOR") & per.type_correct & (per.predicted_channel == per.sensor_tag)
    per["unknown_first"] = per.predicted_fault_type == "UNKNOWN"
    summary = {"events": len(per), "detected": int(per.detected.sum()), "class_correct": int(per.class_correct.sum()),
               "type_correct": int(per.type_correct.sum()), "false_episodes": rep["false_alert_episodes"],
               "excess_repeats": rep["excess_repeat_episodes"],
               "false_plus_excess": rep["false_alert_episodes"] + rep["excess_repeat_episodes"],
               "sensor_events": int((per.event_class == "SENSOR").sum()),
               "sensor_type_and_channel": int(per.type_and_channel.sum()),
               "unknown_first_diagnoses": int(per.unknown_first.sum()),
               "unknown_alerts": int((pred.fault_type == "UNKNOWN").sum()), "alerts": len(pred),
               "correct_type_detected": int(per.correct_type_detected.sum()),
               "missed_correct_type": int((~per.correct_type_detected).sum()),
               "composite_score": rep["composite_score"]}
    return summary, per, rep


# --- runner ---------------------------------------------------------------------------------------------

def load(ids):
    assets = pd.read_csv(DATA / "assets.csv")
    assets = assets[assets.asset_id.isin(ids)].reset_index(drop=True)
    assert set(assets.split) <= {"train", "validation"}, "only train/validation assets are allowed"
    feat = pd.read_parquet(DATA / "features_1min.parquet", filters=[("asset_id", "in", list(ids))])
    assert set(feat.asset_id) == set(ids), "predicate pushdown returned unexpected assets"
    split = assets.split.iloc[0]
    assert (assets.split == split).all()
    events = pd.read_csv(DATA / f"events_{split}.csv").query("asset_id in @ids")
    benign = pd.read_csv(DATA / "benign_windows_train_validation.csv").query("asset_id in @ids")
    return assets, feat, events, benign


def branch_inputs(branch, feat, assets):
    if branch == "full":
        return feat, assets, None
    kind, group = branch.split(":")
    mf, ma, rec = mask_group(feat, assets, group)
    if kind == "mask":
        return mf, ma, rec
    rf, ra = restore_group(mf, ma, feat, assets, group)
    return rf, ra, rec


def same(left, right):
    """Exact categorical/time equality; numeric columns within the audit tolerance."""
    try:
        pd.testing.assert_frame_equal(left.reset_index(drop=True), right.reset_index(drop=True), check_dtype=False,
                                      check_exact=False, atol=ATOL, rtol=0)
        return True
    except AssertionError:
        return False


def manifest():
    path = OUT / "manifest.json"
    if path.exists():
        raise SystemExit("manifest already saved; it must not change after results")
    OUT.mkdir(parents=True, exist_ok=True)
    events = {}
    for split, ids in (("train", TRAIN_ASSETS), ("validation", VALIDATION_ASSETS)):
        e = pd.read_csv(DATA / f"events_{split}.csv").query("asset_id in @ids")
        obs = e[e.observable.astype(str).str.lower().isin(["true", "1"])]
        events[split] = {"observable_event_ids": sorted(obs.event_id), "observable_events": len(obs),
                         "excluded_unobservable_original": sorted(set(e.event_id) - set(obs.event_id))}
    assets = pd.read_csv(DATA / "assets.csv").query("asset_id in @TRAIN_ASSETS or asset_id in @VALIDATION_ASSETS")
    vendor = json.loads((ROOT / "vendor/benchmark/MANIFEST.json").read_text())
    cuts = pd.read_csv(CUTS)
    save_json(path, {
        "experiment": "E5/H7 sensor mask/restore (Task004)", "registered_before_results": True,
        "model": {"selected_by_task002_seal": "C0", "detector": "causal B1 unchanged", "k": 6, "persist": 15,
                  "reference_hours": 24, "pythonhashseed": 0},
        "train_assets": TRAIN_ASSETS, "descriptive_validation_assets": VALIDATION_ASSETS,
        "validation_prior_exposure": "validation split inspected before; PUMP-09 result is descriptive only",
        "groups": GROUPS, "branches": BRANCHES,
        "installed_channels": {r.asset_id: str(r.channels_available).split("|") for r in assets.itertuples()},
        "mask_definition": "drop every <channel>__* feature column of the group from the start of the window and remove "
                           "the channel from working channels_available; rows/gateway columns unchanged; reference "
                           "recomputed from scratch in every branch; original assets/events used only by the evaluator",
        "consumed_columns_rule": "asset_id, window_start_utc, rows, operating_mode, running_fraction and mean/std/count "
                                 "of the 13 B1 channels; regime uses motor_speed_rpm__mean; no cross-channel derived "
                                 "residual exists in C0; quality_any, min/max and ambient_temp_c are not consumed",
        "restore_definition": "masked frame + original group columns re-attached by (asset_id, window_start_utc); "
                              "must equal full exactly (times/categories/text) and numerics atol 1e-6 rtol 0",
        "causality_cutpoints": {aid: int((cuts.asset_id == aid).sum()) for aid in TRAIN_ASSETS + VALIDATION_ASSETS},
        "original_events": events,
        "metrics": {
            "official": "unchanged vendor scorer on original assets/events: detected, class_correct, type_correct, "
                        "false_episodes + excess_repeats, composite",
            "sensor_type_and_channel": "SENSOR event, correct type and channel parsed from first matched burst evidence "
                                       "by the Task002 C0 rule (single named channel; 'missing rows' -> GATEWAY; "
                                       "otherwise none). Machine evidence citing several channels yields no channel.",
            "unknown": "UNKNOWN first diagnoses among observable events; total UNKNOWN alerts",
            "correct_type_delay": "first burst assigned to the event by the replicated official assignment whose type "
                                  "equals the event type; delay from detectable_utc (window start if absent); missed "
                                  "correct diagnoses reported as counts and per event, never dropped",
            "deltas": "full minus mask per asset and pooled; restore must equal full"},
        "sealed_sha256": {p: sha256(ROOT / p) for p in SEALED},
        "inputs_sha256": {**{p: sha256(DATA / p) for p in INPUTS},
                          "features_1min.parquet(vendor manifest)": next(
                              e["sha256"] for e in vendor["files"] if e["path"].endswith("full/features_1min.parquet"))},
        "saved_at": pd.Timestamp.now(tz="UTC").isoformat()})
    print("manifest saved", path)


def check_manifest():
    m = json.loads((OUT / "manifest.json").read_text())
    changed = [p for p, h in m["sealed_sha256"].items() if sha256(ROOT / p) != h]
    changed += [p for p, h in m["inputs_sha256"].items() if not p.startswith("features") and sha256(DATA / p) != h]
    if changed:
        raise SystemExit(f"sealed files changed since manifest: {changed}")
    return m


def run_split(name, ids):
    started = time.monotonic()
    m = check_manifest()
    assets, feat, events, benign = load(ids)
    assert sorted(events[events.observable.astype(str).str.lower().isin(["true", "1"])].event_id) == \
        m["original_events"][name]["observable_event_ids"]
    clocks = dict(zip(assets.asset_id, assets.window_end_utc))
    cuts = pd.read_csv(CUTS).query("asset_id in @ids")
    preds, summaries, paired, restore, causal, records = {}, [], [], [], [], {}
    for branch in BRANCHES:
        f, a, rec = branch_inputs(branch, feat, assets)
        if rec:
            records[branch] = rec
        p = predict_c0(f, a, clocks)
        preds[branch] = p
        p.to_csv(OUT / f"{name}_predictions_{branch.replace(':', '_')}.csv", index=False)
        for scope in ["pooled"] + list(ids):
            sa = assets if scope == "pooled" else assets[assets.asset_id == scope]
            sp = p if scope == "pooled" else p[p.asset_id == scope]
            s, per, _ = evaluate(sp, events, sa, benign)
            summaries.append({"split": name, "scope": scope, "branch": branch, **s})
            if scope == "pooled":
                paired.append(per.assign(branch=branch))
        if branch != "full":
            for aid in ids:
                af, aa = f[f.asset_id == aid], a[a.asset_id == aid]
                full_p = p[p.asset_id == aid].reset_index(drop=True)
                for cut in pd.to_datetime(cuts[cuts.asset_id == aid].cutoff_utc, utc=True):
                    prefix = af[pd.to_datetime(af.window_start_utc, utc=True) + pd.Timedelta(minutes=1) <= cut]
                    sp = predict_c0(prefix, aa, {aid: cut})
                    past = full_p[pd.to_datetime(full_p.alert_time_utc, utc=True) <= cut]
                    causal.append({"split": name, "branch": branch, "asset_id": aid, "cutoff_utc": cut.isoformat(),
                                   "alerts": len(sp), "alerts_match": same(past, sp)})
        if branch.startswith("restore:"):
            for aid in ids:
                full_p = preds["full"][preds["full"].asset_id == aid]
                rest_p = p[p.asset_id == aid]
                text = ["asset_id", "alert_time_utc", "event_class", "fault_type", "evidence", "recommended_action"]
                restore.append({"split": name, "branch": branch, "asset_id": aid, "alerts_full": len(full_p),
                                "alerts_restore": len(rest_p),
                                "categorical_exact": full_p[text].reset_index(drop=True).equals(
                                    rest_p[text].reset_index(drop=True)),
                                "all_fields_within_tolerance": same(full_p, rest_p)})
        print(name, branch, len(p), "alerts", flush=True)
    summary = pd.DataFrame(summaries)
    full = summary[summary.branch == "full"].set_index("scope")
    metrics = ["detected", "class_correct", "type_correct", "false_plus_excess", "sensor_type_and_channel",
               "unknown_first_diagnoses", "unknown_alerts", "correct_type_detected", "missed_correct_type",
               "composite_score"]
    for mtr in metrics:
        summary[f"full_minus_branch_{mtr}"] = summary.scope.map(full[mtr]) - summary[mtr]
    summary.to_csv(OUT / f"{name}_group_summary.csv", index=False)
    pt = pd.concat(paired, ignore_index=True)
    cols = ["detected", "class_correct", "type_correct", "predicted_fault_type", "predicted_class", "first_alert_utc",
            "first_correct_type_utc", "correct_type_delay_h", "predicted_channel", "type_and_channel"]
    wide = pt[pt.branch == "full"][["event_id", "asset_id", "event_class", "fault_type", "sensor_tag"] + cols]
    for branch in BRANCHES[1:]:
        b = pt[pt.branch == branch][["event_id"] + cols].rename(columns={c: f"{c}@{branch}" for c in cols})
        wide = wide.merge(b, on="event_id", validate="one_to_one")
    wide.to_csv(OUT / f"{name}_paired_events.csv", index=False)
    pd.DataFrame(restore).to_csv(OUT / f"{name}_restore_check.csv", index=False)
    pd.DataFrame(causal).to_csv(OUT / f"{name}_causality.csv", index=False)
    restore_ok = all(r["categorical_exact"] and r["all_fields_within_tolerance"] for r in restore)
    causal_ok = all(c["alerts_match"] for c in causal)
    gate = {"split": name, "restore_equal": restore_ok, "restore_checks": len(restore),
            "causality_ok": causal_ok, "causality_checks": len(causal), "mask_records": records,
            "pythonhashseed": __import__("os").environ.get("PYTHONHASHSEED"),
            "elapsed_s": round(time.monotonic() - started, 1), "finished_at": pd.Timestamp.now(tz="UTC").isoformat()}
    save_json(OUT / f"{name}_gate.json", gate)
    print(json.dumps({k: gate[k] for k in ["restore_equal", "restore_checks", "causality_ok", "causality_checks"]}))
    print(summary[summary.scope == "pooled"][["branch"] + metrics].to_string(index=False))
    if not (restore_ok and causal_ok):
        raise SystemExit("restore/causality gate failed: comparison invalid")


def validation():
    gate = OUT / "train_gate.json"
    if not gate.exists() or not (g := json.loads(gate.read_text()))["restore_equal"] or not g["causality_ok"]:
        raise SystemExit("PUMP-09 run is gated on a saved manifest and successful train restore/causality")
    if (OUT / "validation_gate.json").exists():
        raise SystemExit("descriptive validation run already executed once")
    run_split("validation", VALIDATION_ASSETS)


if __name__ == "__main__":
    {"manifest": manifest, "train": lambda: run_split("train", TRAIN_ASSETS), "validation": validation}[sys.argv[1]]()
