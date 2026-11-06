"""Reproduce organizer B1 on train/validation, without loading test telemetry.

Run from the project root: PYTHONHASHSEED=0 python scripts/run_b1.py
The vendor implementation and official scorer remain unchanged.
"""
from __future__ import annotations

import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT / "vendor/benchmark"
AUDIT_NUMERIC_ATOL = 1e-6  # float32 reductions can differ slightly in per-asset prefix runs
sys.path.insert(0, str(VENDOR / "src"))

import numpy as np
import pandas as pd
from retrofit_sim import baselines as B
from retrofit_sim.scoring import score, load_predictions


def save_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False, default=str) + "\n")


def sha256(path):
    return hashlib.file_digest(path.open("rb"), "sha256").hexdigest()


def canonical_predictions(frame):
    cols = ["asset_id", "alert_time_utc", "event_class", "fault_type", "confidence", "evidence", "recommended_action"]
    f = load_predictions(frame)
    f["alert_time_utc"] = f["alert_time_utc"].dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    return f[cols].reset_index(drop=True)


def same_fields(left, right):
    try:
        pd.testing.assert_frame_equal(left, right, check_dtype=False, check_exact=False, atol=AUDIT_NUMERIC_ATOL, rtol=0)
        return True
    except AssertionError:
        return False


def main():
    started = time.monotonic()
    out = ROOT / "results/b1"
    out.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((VENDOR / "MANIFEST.json").read_text())
    mismatches = [entry["path"] for entry in manifest["files"]
                  if sha256(VENDOR / entry["path"]) != entry["sha256"]]
    save_json(out / "integrity.json", {"files_checked": len(manifest["files"]), "mismatches": mismatches})
    if mismatches:
        raise RuntimeError(f"Vendor integrity mismatch: {mismatches}")
    data = VENDOR / "data/full"
    assets = pd.read_csv(data / "assets.csv")
    scope = assets[assets.split.isin(["train", "validation"])].copy()
    ids = scope.asset_id.tolist()
    # Predicate pushdown excludes test assets from feature loading and all analysis.
    feat = pd.read_parquet(data / "features_1min.parquet", filters=[("asset_id", "in", ids)])
    assert set(feat.asset_id) == set(ids)
    events = {s: pd.read_csv(data / f"events_{s}.csv") for s in ("train", "validation")}
    benign = pd.read_csv(data / "benign_windows_train_validation.csv")
    zf = B.zscores(B.regime_frame(feat, scope))
    z = {s: zf[zf.asset_id.isin(scope[scope.split == s].asset_id)] for s in events}
    print(f"Loaded {len(feat):,} feature windows; train/validation only.", flush=True)

    trials = []
    best_score = -1.0
    for k in [4, 6, 8, 12]:
        for persist in [5, 15, 30]:
            report = score(B.b1_threshold(z["train"], k, persist), events["train"], scope, benign, "train")
            trials.append({"k": k, "persist_min": persist,
                           **{m: report[m] for m in ["composite_score", "event_f1", "fault_type_recall", "false_alerts_per_asset_day"]}})
            if report["composite_score"] > best_score:
                best_score = report["composite_score"]
                selected = (k, persist)
    pd.DataFrame(trials).to_csv(out / "train_tuning.csv", index=False)
    print(f"Selected on TRAIN: k={selected[0]}, persist={selected[1]} min", flush=True)
    official = pd.read_csv(VENDOR / "baselines/results/baseline_metrics.csv")
    metric_cols = ["composite_score", "event_f1", "event_recall", "alert_precision", "false_alerts_per_asset_day",
                   "timeliness", "fault_type_recall", "class_recall", "median_lead_time_h", "events_scored"]
    comparisons = []
    predictions = {}
    for split in events:
        pred = B.b1_threshold(z[split], *selected)
        predictions[split] = pred
        pred.to_csv(out / f"predictions_{split}.csv", index=False)
        report = score(pred, events[split], scope, benign, split)
        save_json(out / f"report_{split}.json", report)
        pe = pd.DataFrame(report["per_event"])
        pe = pe.merge(events[split][["event_id", "pre_existing", "sensor_tag", "detectable_utc", "action_deadline_utc"]], on="event_id", how="left")
        pe.to_csv(out / f"events_{split}.csv", index=False)
        ref = official[(official.baseline == "B1_mode_aware_z") & (official.split == split)].iloc[0]
        for metric in metric_cols:
            actual, expected = report[metric], ref[metric]
            comparisons.append({"split": split, "metric": metric, "actual": actual, "organizer": expected,
                                "delta": actual - expected if actual is not None else None,
                                "matches": bool(np.isclose(actual, expected, atol=1e-9, rtol=0, equal_nan=True)) if actual is not None else bool(pd.isna(expected))})
        print(f"{split}: composite={report['composite_score']:.8f}; detected={report['true_positive_events']}/{report['events_scored']}; correct types={pe.type_correct.sum()}; false episodes={report['false_alert_episodes']}; excess={report['excess_repeat_episodes']}", flush=True)
    pd.DataFrame(comparisons).to_csv(out / "metric_comparison.csv", index=False)
    expected_pred = canonical_predictions(VENDOR / "baselines/results/predictions_B1_mode_aware_z_validation.csv")
    actual_pred = canonical_predictions(predictions["validation"])
    same_prediction_fields = {}
    for c in actual_pred:
        same_prediction_fields[c] = (len(actual_pred) == len(expected_pred) and
            (bool(np.allclose(actual_pred[c], expected_pred[c], atol=1e-12, rtol=0)) if c == "confidence" else actual_pred[c].equals(expected_pred[c])))

    # Truncate at complete-minute boundaries, freeze TRAIN-selected parameters.
    # Past predictions should not depend on future samples (train and validation).
    cuts = []
    diff_rows = []
    field_diffs = []
    for _, asset in scope.iterrows():
        f = feat[feat.asset_id == asset.asset_id].copy()
        split_pred = predictions[asset.split]
        full_pred = canonical_predictions(split_pred[split_pred.asset_id == asset.asset_id])
        for hours in [0.75, 6, 12, 13, 18, 23, 24, 36, 48]:
            cutoff = pd.Timestamp(asset.window_start_utc) + pd.Timedelta(hours=hours)
            prefix = f[pd.to_datetime(f.window_start_utc, utc=True) + pd.Timedelta(minutes=1) <= cutoff]
            prefix_z = B.zscores(B.regime_frame(prefix, scope))
            short_pred = canonical_predictions(B.b1_threshold(prefix_z, *selected))
            past = full_pred[pd.to_datetime(full_pred.alert_time_utc, utc=True) <= cutoff].reset_index(drop=True)
            columns = ["asset_id", "alert_time_utc", "event_class", "fault_type"]
            merged = past[columns].merge(short_pred[columns], on=columns, how="outer", indicator=True)
            changed = merged[merged._merge != "both"].copy()
            record = {"asset_id": asset.asset_id, "split": asset.split, "cutoff_hours": hours, "cutoff_utc": cutoff.isoformat(),
                      "full_run_past_alerts": len(past), "prefix_run_alerts": len(short_pred),
                      "alert_identity_matches": len(changed) == 0,
                      "all_fields_match": same_fields(past, short_pred)}
            cuts.append(record)
            for row in changed.to_dict("records"):
                diff_rows.append({**record, **row})
            shared = past.merge(short_pred, on=columns, suffixes=("_full", "_prefix"))
            for _, row in shared.iterrows():
                for field in ["confidence", "evidence", "recommended_action"]:
                    a, b = row[field + "_full"], row[field + "_prefix"]
                    equal = bool(np.isclose(a, b, atol=AUDIT_NUMERIC_ATOL, rtol=0)) if field == "confidence" else a == b
                    if not equal:
                        field_diffs.append({"asset_id": asset.asset_id, "split": asset.split, "cutoff_hours": hours,
                                            "alert_time_utc": row.alert_time_utc, "field": field,
                                            "full_run_value": a, "prefix_run_value": b})
    pd.DataFrame(cuts).to_csv(out / "causality_cutpoints.csv", index=False)
    pd.DataFrame(diff_rows).to_csv(out / "causality_differences.csv", index=False)
    pd.DataFrame(field_diffs).to_csv(out / "causality_field_differences.csv", index=False)
    # Alert-time vs baseline availability audit, independent of prefix sensitivity.
    early = []
    for split, pred in predictions.items():
        p = pred.merge(scope[["asset_id", "window_start_utc"]], on="asset_id")
        p["hours_since_start"] = (pd.to_datetime(p.alert_time_utc, utc=True) - pd.to_datetime(p.window_start_utc, utc=True)).dt.total_seconds() / 3600
        p["split"] = split
        early.append(p[p.hours_since_start < B.BASELINE_H])
    pd.concat(early).to_csv(out / "alerts_before_baseline_complete.csv", index=False)
    packages = {name: importlib.metadata.version(name) for name in ["numpy", "pandas", "pyarrow", "scipy", "scikit-learn", "pytest"]}
    summary = {"python": sys.version, "platform": platform.platform(), "packages": packages,
               "pythonhashseed": os.environ.get("PYTHONHASHSEED", "unset"),
               "selected_parameters": {"k": selected[0], "persist_min": selected[1]},
               "test_telemetry_used": False, "feature_windows_loaded": len(feat),
               "all_reference_metrics_match": all(r["matches"] for r in comparisons),
               "validation_prediction_fields_match": same_prediction_fields,
               "causality_checks": len(cuts), "causality_identity_failures": sum(not r["alert_identity_matches"] for r in cuts),
               "causality_all_fields_failures": sum(not r["all_fields_match"] for r in cuts),
               "causality_numeric_tolerance": AUDIT_NUMERIC_ATOL,
               "vendor_baselines_sha256": sha256(VENDOR / "src/retrofit_sim/baselines.py"),
               "vendor_scoring_sha256": sha256(VENDOR / "src/retrofit_sim/scoring.py"),
               "elapsed_s": round(time.monotonic() - started, 2)}
    save_json(out / "run_summary.json", summary)
    print(json.dumps(summary, indent=2), flush=True)


if __name__ == "__main__":
    main()
