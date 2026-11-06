"""Export a deterministic, provenance-bearing demo bundle for the local Retrofit Doctor UI.

Inputs are read-only: public asset metadata for all 12 pumps, stored causal B1
results, and 1-minute features for the validation replay pumps only. Assets are
filtered BEFORE features are loaded; test telemetry and labels are never read.
Features are recomputed with the existing causal B1 at each asset's window end;
alerts are re-derived and asserted identical to results/causal_b1, so the
exported z-scores are the ones behind the stored alerts. The browser reveals
rows with available_at <= as_of only; the bundle itself never contains test data.

Usage: PYTHONHASHSEED=0 python scripts/export_demo.py [--out web/data]
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "src"), str(ROOT / "vendor/benchmark/src")]
from retrofit_sim import baselines as B  # noqa: E402
from retrofit_doctor.causal_b1 import causal_features, predict_from_features  # noqa: E402

DATA = ROOT / "vendor/benchmark/data/full"
CAUSAL = ROOT / "results/causal_b1"
REPLAY_ASSETS = ("PUMP-08", "PUMP-09")
SCHEMA = "retrofit-doctor-demo/1"
K, PERSIST = 6.0, 15
ALERT_COLS = ["asset_id", "alert_time_utc", "event_class", "fault_type", "confidence", "evidence", "recommended_action"]

# Display units, transcribed from vendor/benchmark/data/full/units.md.
UNITS = {"motor_current_a": "A", "motor_power_kw": "kW", "motor_speed_rpm": "rpm", "suction_pressure_kpa": "kPa(g)",
         "discharge_pressure_kpa": "kPa(g)", "flow_m3_h": "m³/h", "fluid_temp_c": "°C", "ambient_temp_c": "°C",
         "bearing_temp_c": "°C", "motor_winding_temp_c": "°C", "vibration_rms_mm_s": "mm/s",
         "vibration_accel_rms_g": "g", "vibration_crest_factor": "ratio", "valve_position_pct": "%"}
WIRELESS = {"vibration_rms_mm_s", "vibration_accel_rms_g", "vibration_crest_factor", "bearing_temp_c"}
Z_KEY = {channel: key for key, channel in B.CH.items()}
EVENT_LABEL_COLS = ["event_id", "asset_id", "event_class", "fault_type", "onset_utc", "pre_existing", "detectable_utc",
                    "action_deadline_utc", "end_utc", "severity", "evidence_channels", "label_confidence"]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def native_update_s(asset: pd.Series, channel: str) -> int:
    """Mirror of vendor sensors.channel_specs update_s: T1 wireless block, 10 s ambient, otherwise 1 s."""
    if channel in WIRELESS and asset.instrumentation_tier == "T1_RETROFIT":
        return int(asset.wireless_update_s)
    return 10 if channel == "ambient_temp_c" else 1


def none_if_nan(v):
    return None if pd.isna(v) else v


def column(series: pd.Series, decimals: int) -> list:
    values = series.astype("float64").round(decimals).to_numpy()
    return [None if np.isnan(v) else (int(v) if decimals == 0 else float(v)) for v in values]


def asset_record(asset: pd.Series) -> dict:
    channels = asset.channels_available.split("|")
    split = asset.split
    mode = {"train": "TRAIN_REPLAY", "validation": "VALIDATION_REPLAY", "test": "TEST_METADATA_ONLY"}[split]
    return {
        "assetId": asset.asset_id, "split": split, "mode": mode, "site": asset.site, "system": asset.system,
        "profile": asset.profile, "control": asset.control, "instrumentationTier": asset.instrumentation_tier,
        "windowStartUtc": asset.window_start_utc, "windowEndUtc": asset.window_end_utc,
        "commissionedYear": int(asset.commissioned_year), "fluid": asset.fluid,
        "ratedRpmMetadata": float(asset.motor_rated_rpm), "motorRatedKw": float(asset.motor_rated_kw),
        "designFlowM3h": float(asset.design_flow_m3_h), "designHeadM": float(asset.design_head_m),
        "vibrationAlarmMmS": float(asset.vibration_alarm_mm_s),
        "wirelessUpdateS": None if pd.isna(asset.wireless_update_s) else int(asset.wireless_update_s),
        "channelsAvailable": channels,
        "channels": [{"channelId": c, "unit": UNITS[c], "nativeUpdateSeconds": native_update_s(asset, c)} for c in channels],
        "replayFile": f"replay-{asset.asset_id}.json" if asset.asset_id in REPLAY_ASSETS else None,
    }


def replay_record(asset: pd.Series, normalized: pd.DataFrame, alerts: pd.DataFrame, labels: pd.DataFrame) -> dict:
    g = normalized[normalized.asset_id == asset.asset_id].sort_values("window_start_utc").reset_index(drop=True)
    start = pd.Timestamp(asset.window_start_utc)
    expected = pd.date_range(start, periods=len(g), freq="1min")
    assert (pd.DatetimeIndex(g.window_start_utc) == expected).all(), "grid must be contiguous from window start"
    channels = {}
    for c in asset.channels_available.split("|"):
        mean, count = g[f"{c}__mean"], g[f"{c}__count"].fillna(0)
        # Sparse sampling stays sparse: a minute without a native sample has no value (no forward fill).
        assert (mean.isna() == count.eq(0)).all(), f"{asset.asset_id} {c}: value/count mismatch"
        key = Z_KEY.get(c)
        channels[c] = {"unit": UNITS[c], "nativeUpdateSeconds": native_update_s(asset, c),
                       "mean": column(mean, 4), "z": column(g[f"z_{key}"], 2) if key else None}
    a = alerts[alerts.asset_id == asset.asset_id]
    lab = labels[labels.asset_id == asset.asset_id].sort_values(["onset_utc", "event_id"])
    return {
        "schema": SCHEMA, "assetId": asset.asset_id, "mode": "VALIDATION_REPLAY", "sourceVersion": "causal_b1",
        "detectorParameters": {"k": K, "persistMinutes": PERSIST, "referenceHours": B.BASELINE_H},
        "gridStartUtc": asset.window_start_utc, "minutes": len(g),
        "referenceEndUtc": pd.Timestamp(g.reference_end_utc.iloc[0]).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "timeSemantics": "Row i covers [gridStart+i min, gridStart+(i+1) min); available at its window end. "
                         "Alert times are already window-end times (vendor _alerts_from_flag adds one minute).",
        "rows": {
            "packets": column(g.rows, 0),
            "operatingMode": g.operating_mode.astype(str).tolist(),
            "steady": g.steady.astype(bool).tolist(),
            "gap": g.gap.astype(bool).tolist(),
            "referenceStatus": g.reference_status.astype(str).tolist(),
            "referenceReadyChannels": g.reference_ready_channels.astype(int).tolist(),
        },
        "channels": channels,
        "alerts": [dict(zip(ALERT_COLS, r)) for r in a[ALERT_COLS].itertuples(index=False)],
        "evaluationLabels": {
            "notice": "Retrospective ground truth. Never a detector input; shown only in the separate evaluation overlay.",
            "source": "vendor/benchmark/data/full/events_validation.csv",
            "events": [{k: none_if_nan(v) for k, v in r._asdict().items()} for r in lab[EVENT_LABEL_COLS].itertuples(index=False)],
        },
    }


def evidence_record() -> dict:
    comparison = pd.read_csv(CAUSAL / "comparison.csv", dtype=str)
    events = {}
    for version in ("causal", "original"):
        e = pd.read_csv(CAUSAL / f"events_{version}_validation.csv", dtype=str, keep_default_na=False)
        events[version] = e.to_dict(orient="records")
    return {
        "comparison": comparison.to_dict(orient="records"),
        "comparisonSource": rel(CAUSAL / "comparison.csv"),
        "verification": json.loads((CAUSAL / "verification.json").read_text()),
        "verificationSource": rel(CAUSAL / "verification.json"),
        "verificationNote": "Recorded run of scripts/compare_causal_b1.py and tests/test_causal_b1.py. "
                            "The demo app displays these stored results; it does not rerun them.",
        "validationEvents": events,
        "validationEventsSource": "results/causal_b1/events_{causal,original}_validation.csv",
    }


def build(out: Path) -> dict[str, dict]:
    assets_path = DATA / "assets.csv"
    all_assets = pd.read_csv(assets_path, dtype={"wireless_update_s": "float64"})
    assert len(all_assets) == 12 and all_assets.asset_id.is_unique
    replay = all_assets[all_assets.asset_id.isin(REPLAY_ASSETS)].copy()
    assert set(replay.split) == {"validation"}, "replay is restricted to validation assets"
    # Filter by explicit asset ID inside the Parquet read: test rows are never materialized.
    features_path = DATA / "features_1min.parquet"
    feat = pd.read_parquet(features_path, filters=[("asset_id", "in", list(REPLAY_ASSETS))])
    assert set(feat.asset_id) == set(REPLAY_ASSETS)
    clocks = dict(zip(replay.asset_id, replay.window_end_utc))
    normalized = causal_features(feat, replay, clocks)
    stored_path = CAUSAL / "predictions_causal_validation.csv"
    stored = pd.read_csv(stored_path, dtype=str)
    recomputed = predict_from_features(normalized, k=K, persist=PERSIST)
    left = stored[stored.asset_id.isin(REPLAY_ASSETS)].reset_index(drop=True)
    right = recomputed.astype({"confidence": "float64"}).reset_index(drop=True)
    assert len(left) == len(right)
    assert (left.drop(columns="confidence") == right.drop(columns="confidence").astype(str)).all().all()
    assert np.allclose(left.confidence.astype(float), right.confidence, rtol=0, atol=1e-12)
    labels_path = DATA / "events_validation.csv"
    labels = pd.read_csv(labels_path, dtype=str)
    labels = labels[labels.asset_id.isin(REPLAY_ASSETS)]

    inputs = [assets_path, features_path, stored_path, labels_path, CAUSAL / "comparison.csv", CAUSAL / "verification.json",
              CAUSAL / "events_causal_validation.csv", CAUSAL / "events_original_validation.csv",
              ROOT / "src/retrofit_doctor/causal_b1.py"]
    provenance = {
        "generator": "scripts/export_demo.py",
        "dataNature": "Synthetic benchmark (RETROFIT AI 2026). Not field data.",
        "inputs": [{"path": rel(p), "sha256": sha256(p)} for p in inputs],
        "featureFilter": {"assetIds": list(REPLAY_ASSETS), "testTelemetryLoaded": False, "testLabelsLoaded": False},
        "rounding": "Channel means rounded to 4 decimals, z-scores to 2 decimals for display. Alerts are verbatim strings.",
    }
    bundles = {"fleet.json": {"schema": SCHEMA, "provenance": provenance,
                              "assets": [asset_record(a) for _, a in all_assets.sort_values("asset_id").iterrows()],
                              "evidence": evidence_record()}}
    for _, asset in replay.iterrows():
        rec = replay_record(asset, normalized, stored, labels)
        rec["provenance"] = provenance
        bundles[f"replay-{asset.asset_id}.json"] = rec
    out.mkdir(parents=True, exist_ok=True)
    for name, payload in bundles.items():
        (out / name).write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True,
                                           allow_nan=False) + "\n")
    return bundles


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, default=ROOT / "web/data")
    args = parser.parse_args()
    for name in build(args.out):
        path = args.out / name
        print(f"{path.relative_to(ROOT) if path.is_relative_to(ROOT) else path}  {path.stat().st_size:>9} B  {sha256(path)[:12]}")


if __name__ == "__main__":
    main()
