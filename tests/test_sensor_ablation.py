"""Task004 E5/H7 mask/restore contract tests. Fixtures are constructed probes, not benchmark data."""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from run_sensor_ablation import (GROUPS, CONSUMED_SUFFIXES, consumed_columns, first_correct_type_alerts,
                                 mask_group, predict_c0, restore_group)

START = pd.Timestamp("2026-01-01", tz="UTC")
CHANNELS = ["motor_speed_rpm", "discharge_pressure_kpa", "suction_pressure_kpa", "motor_current_a",
            "motor_power_kw", "flow_m3_h", "bearing_temp_c", "vibration_rms_mm_s"]


def make(hours=30):
    n = hours * 60
    i = np.arange(n)
    f = pd.DataFrame({"asset_id": "A", "window_start_utc": pd.date_range(START, periods=n, freq="min"), "rows": 60,
                      "running_fraction": 1., "operating_mode": "RUNNING", "quality_any": 0})
    for k, c in enumerate(CHANNELS):
        level = 100. + 10 * k
        f[c + "__mean"] = level + np.sin(i * (.3 + .1 * k))
        f[c + "__std"] = .1
        f[c + "__min"] = f[c + "__mean"] - .2
        f[c + "__max"] = f[c + "__mean"] + .2
        f[c + "__count"] = 60.
    a = pd.DataFrame([{"asset_id": "A", "split": "train", "motor_rated_rpm": 100., "window_start_utc": START,
                       "window_end_utc": START + pd.Timedelta(hours=hours), "channels_available": "|".join(CHANNELS)}])
    return f, a


def clocks(a):
    return dict(zip(a.asset_id, a.window_end_utc))


def test_groups_are_exactly_the_registered_protocol_groups():
    import json
    proto = json.loads((Path(__file__).resolve().parents[1] / "docs/experiments/protocol_v1.json").read_text())
    assert GROUPS == proto["sensor_ablation"]["groups"]


def test_mask_removes_every_derived_column_and_metadata_entry():
    f, a = make()
    mf, ma, rec = mask_group(f, a, "flow_power")
    assert not [c for c in mf if c.startswith(("flow_m3_h__", "motor_power_kw__"))]
    assert "flow_m3_h" not in ma.channels_available.iloc[0] and "motor_power_kw" not in ma.channels_available.iloc[0]
    assert rec["A"]["removed"] == ["flow_m3_h", "motor_power_kw"] and rec["A"]["not_installed"] == []
    # rows/gateway information is not changed by removing one instrument
    assert mf.rows.equals(f.rows)
    # vendor inputs are not mutated
    assert "flow_m3_h__mean" in f and "flow_m3_h" in a.channels_available.iloc[0]


def test_absent_group_channel_is_recorded_not_pretended_removed():
    f, a = make()
    f = f.drop(columns=[c for c in f if c.startswith("bearing_temp_c__")])
    a = a.assign(channels_available="|".join(c for c in CHANNELS if c != "bearing_temp_c"))
    _, _, rec = mask_group(f, a, "vibration_temperature")
    assert rec["A"]["removed"] == ["vibration_rms_mm_s"]
    assert rec["A"]["not_installed"] == ["bearing_temp_c", "vibration_accel_rms_g", "vibration_crest_factor"]


def test_masked_predictions_ignore_drastic_changes_to_masked_sources():
    f, a = make()
    f.loc[f.window_start_utc >= START + pd.Timedelta(hours=26), "suction_pressure_kpa__mean"] -= 60
    full = predict_c0(f, a, clocks(a))
    assert len(full)  # the masked channel matters in the full branch
    mf, ma, _ = mask_group(f, a, "suction")
    masked = predict_c0(mf, ma, clocks(ma))
    g = f.copy()
    for c in [c for c in g if c.startswith("suction_pressure_kpa__")]:
        g[c] = g[c] * -1000 + 1e6
    mg, mga, _ = mask_group(g, a, "suction")
    pd.testing.assert_frame_equal(masked, predict_c0(mg, mga, clocks(mga)))
    assert not masked.equals(full)


def test_detector_consumes_only_enumerated_columns():
    f, a = make()
    f.loc[f.window_start_utc >= START + pd.Timedelta(hours=26), "discharge_pressure_kpa__mean"] += 80
    used = consumed_columns(f)
    assert not [c for c in used if c.endswith(("__min", "__max"))] and "quality_any" not in used
    assert {c.rsplit("__", 1)[1] for c in used if "__" in c} <= set(CONSUMED_SUFFIXES)
    expected = predict_c0(f, a, clocks(a))
    assert len(expected)
    pd.testing.assert_frame_equal(expected, predict_c0(f[used], a, clocks(a)))


def test_restore_reproduces_full_branch_exactly():
    f, a = make()
    f.loc[f.window_start_utc >= START + pd.Timedelta(hours=26), "flow_m3_h__mean"] -= 50
    mf, ma, _ = mask_group(f, a, "flow_power")
    rf, ra = restore_group(mf, ma, f, a, "flow_power")
    pd.testing.assert_frame_equal(predict_c0(f, a, clocks(a)), predict_c0(rf, ra, clocks(ra)))
    pd.testing.assert_frame_equal(rf, f)
    pd.testing.assert_frame_equal(ra, a)


def test_first_correct_type_alert_uses_scorer_assignment_and_reports_missed():
    a = pd.DataFrame([{"asset_id": "A", "split": "train", "window_start_utc": "2026-01-01T00:00:00Z",
                       "window_end_utc": "2026-01-03T00:00:00Z"}])
    ev = pd.DataFrame([
        {"event_id": "E1", "asset_id": "A", "event_class": "MACHINE", "fault_type": "IMBALANCE",
         "onset_utc": "2026-01-01T10:00:00Z", "detectable_utc": "2026-01-01T11:00:00Z", "action_deadline_utc": None,
         "end_utc": "2026-01-01T20:00:00Z", "observable": True},
        {"event_id": "E2", "asset_id": "A", "event_class": "SENSOR", "fault_type": "SENSOR_DRIFT",
         "onset_utc": "2026-01-02T10:00:00Z", "detectable_utc": "2026-01-02T10:00:00Z", "action_deadline_utc": None,
         "end_utc": "2026-01-02T12:00:00Z", "observable": True}])
    pred = pd.DataFrame([
        {"asset_id": "A", "alert_time_utc": "2026-01-01T12:00:00Z", "event_class": "MACHINE", "fault_type": "UNKNOWN",
         "confidence": .5},
        {"asset_id": "A", "alert_time_utc": "2026-01-01T14:30:00Z", "event_class": "MACHINE", "fault_type": "IMBALANCE",
         "confidence": .5}])
    out = first_correct_type_alerts(pred, ev, a).set_index("event_id")
    assert out.loc["E1", "first_alert_utc"] == "2026-01-01T12:00:00+00:00"
    assert out.loc["E1", "first_correct_type_utc"] == "2026-01-01T14:30:00+00:00"
    assert out.loc["E1", "correct_type_delay_h"] == pytest.approx(3.5)
    assert pd.isna(out.loc["E2", "first_correct_type_utc"]) and not out.loc["E2", "correct_type_detected"]
