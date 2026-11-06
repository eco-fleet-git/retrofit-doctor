"""Compare unchanged B1 with a causal commissioning-reference correction.

No new tuning or diagnostic rules: both versions use k=6 and persist=15.
Only train/validation telemetry is loaded. The test split remains untouched.
"""
from __future__ import annotations

import json
from pathlib import Path
import sys
import time
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "src"), str(ROOT / "vendor/benchmark/src")]
from retrofit_sim import baselines as B
from retrofit_sim.scoring import score
from retrofit_doctor.causal_b1 import causal_features, predict_from_features
from run_b1 import canonical_predictions, same_fields, save_json, sha256


def main():
    started = time.monotonic()
    out = ROOT / "results/causal_b1"
    out.mkdir(parents=True, exist_ok=True)
    vendor = ROOT / "vendor/benchmark"
    manifest = json.loads((vendor / "MANIFEST.json").read_text())
    assert all(sha256(vendor / e["path"]) == e["sha256"] for e in manifest["files"])
    data = vendor / "data/full"
    assets = pd.read_csv(data / "assets.csv").query("split in ['train', 'validation']").copy()
    feat = pd.read_parquet(data / "features_1min.parquet", filters=[("asset_id", "in", assets.asset_id.tolist())])
    events = {s: pd.read_csv(data / f"events_{s}.csv") for s in ("train", "validation")}
    benign = pd.read_csv(data / "benign_windows_train_validation.csv")
    clocks = dict(zip(assets.asset_id, assets.window_end_utc))
    original = B.zscores(B.regime_frame(feat, assets))
    causal = causal_features(feat, assets, clocks)
    reports, predictions, rows = {}, {}, []
    metric_cols = ["composite_score", "event_f1", "event_recall", "alert_precision", "fault_type_recall", "class_recall",
                   "true_positive_events", "events_scored", "false_alert_episodes", "excess_repeat_episodes",
                   "false_alerts_per_asset_day", "alerts_scored", "median_lead_time_h", "timeliness"]
    for split in events:
        ids = assets[assets.split == split].asset_id
        for name, frame in [("original", original), ("causal", causal)]:
            pred = predict_from_features(frame[frame.asset_id.isin(ids)], k=6, persist=15)
            predictions[name, split] = pred
            pred.to_csv(out / f"predictions_{name}_{split}.csv", index=False)
            r = score(pred, events[split], assets, benign, split)
            reports[name, split] = r
            save_json(out / f"report_{name}_{split}.json", r)
            pd.DataFrame(r["per_event"]).to_csv(out / f"events_{name}_{split}.csv", index=False)
            rows.append({"version": name, "split": split, **{key: r[key] for key in metric_cols}})
            if name == "original":
                reference = json.loads((ROOT / f"results/b1/report_{split}.json").read_text())
                for key in metric_cols:
                    assert np.isclose(r[key], reference[key], atol=1e-9, rtol=0), key
            print(f"{split} {name}: score={r['composite_score']:.8f}, detected={r['true_positive_events']}/{r['events_scored']}, false={r['false_alert_episodes']}, excess={r['excess_repeat_episodes']}", flush=True)
        left = pd.DataFrame(reports['original', split]['per_event'])
        right = pd.DataFrame(reports['causal', split]['per_event'])
        event_comparison = left.merge(right, on=["event_id", "asset_id", "event_class", "fault_type"], suffixes=("_original", "_causal"))
        event_comparison.to_csv(out / f"event_comparison_{split}.csv", index=False)
    pd.DataFrame(rows).to_csv(out / "comparison.csv", index=False)

    audits = []
    rng = np.random.default_rng(20261106)
    for _, asset in assets.iterrows():
        aid = asset.asset_id
        a = assets[assets.asset_id == aid]
        f = feat[feat.asset_id == aid]
        full_z = causal[causal.asset_id == aid]
        full_p = canonical_predictions(predictions['causal', asset.split].query("asset_id == @aid"))
        start, end = pd.Timestamp(asset.window_start_utc), pd.Timestamp(asset.window_end_utc)
        cuts = {start + pd.Timedelta(hours=h): "original_audit" for h in [.75, 6, 12, 13, 18, 23, 24, 36, 48]}
        cuts.update({start + pd.Timedelta(hours=24) + pd.Timedelta(seconds=s): "reference_boundary" for s in [-1, 1, 59, 60]})
        for seconds in rng.integers(60, int((end - start).total_seconds()), size=10):
            cuts[start + pd.Timedelta(seconds=int(seconds))] = "random"
        gap = full_z.rows.eq(0)
        for t in full_z.loc[gap & ~gap.shift(fill_value=False), "window_start_utc"]:
            t = pd.Timestamp(t)
            # A cut inside the outage tests clock-driven missing-packet detection.
            if ((full_z.window_start_utc == t + pd.Timedelta(minutes=14)) & gap).any():
                cuts[t + pd.Timedelta(minutes=15)] = "trailing_outage"
        cols = ["asset_id", "window_start_utc", "regime", "steady", "gap", "reference_status", "reference_ready_channels"]
        cols += [c for c in full_z if c.startswith(("z_", "zs_", "flat_"))]
        for cut, kind in sorted(cuts.items()):
            prefix = f[pd.to_datetime(f.window_start_utc, utc=True) + pd.Timedelta(minutes=1) <= cut]
            short_z = causal_features(prefix, a, {aid: cut})
            short_p = canonical_predictions(predict_from_features(short_z, k=6, persist=15))
            past_z = full_z[full_z.window_start_utc + pd.Timedelta(minutes=1) <= cut]
            past_p = full_p[pd.to_datetime(full_p.alert_time_utc, utc=True) <= cut]
            values_same = same_fields(past_z[cols].reset_index(drop=True), short_z[cols].reset_index(drop=True))
            alerts_same = same_fields(past_p.reset_index(drop=True), short_p.reset_index(drop=True))
            audits.append({"asset_id": aid, "split": asset.split, "cutoff_utc": cut.isoformat(), "kind": kind,
                           "feature_rows": len(short_z), "alerts": len(short_p),
                           "normalized_values_match": values_same, "all_alert_fields_match": alerts_same})
        print(f"Causality {aid}: {len(cuts)} cut points checked", flush=True)
    pd.DataFrame(audits).to_csv(out / "causality_audit.csv", index=False)
    feature_failures = sum(not a['normalized_values_match'] for a in audits)
    alert_failures = sum(not a['all_alert_fields_match'] for a in audits)
    summary = {"parameters": {"k": 6, "persist_min": 15, "reference_hours": 24},
               "parameter_selection": "unchanged from original train-only B1 search; no new tuning",
               "diagnostic_rules": "unchanged vendor B1.diagnose",
               "test_telemetry_used": False, "vendor_files_verified": len(manifest['files']),
               "causality_cutpoints": len(audits), "normalized_feature_failures": feature_failures,
               "alert_field_failures": alert_failures, "numeric_tolerance": 1e-6,
               "causal_code_sha256": sha256(ROOT / "src/retrofit_doctor/causal_b1.py"),
               "comparison_script_sha256": sha256(Path(__file__)),
               "elapsed_s": round(time.monotonic() - started, 2)}
    save_json(out / "run_summary.json", summary)
    assert feature_failures == 0 and alert_failures == 0, summary
    print(json.dumps(summary, indent=2), flush=True)


if __name__ == "__main__":
    main()
