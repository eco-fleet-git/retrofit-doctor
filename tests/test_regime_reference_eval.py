"""Task005 E3 evaluator contracts on constructed events (labels used only by the evaluator)."""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from run_regime_reference import confidence_comparator, evaluate

A = pd.DataFrame([{"asset_id": "A", "split": "train", "window_start_utc": "2026-01-01T00:00:00Z",
                   "window_end_utc": "2026-01-03T00:00:00Z"}])
EV = pd.DataFrame([
    {"event_id": "S", "asset_id": "A", "event_class": "SENSOR", "fault_type": "SENSOR_CALIBRATION_SHIFT",
     "onset_utc": "2026-01-01T10:00:00Z", "pre_existing": False, "detectable_utc": "2026-01-01T10:00:00Z",
     "action_deadline_utc": None, "end_utc": "2026-01-01T20:00:00Z", "observable": True,
     "sensor_tag": "flow_m3_h"},
    {"event_id": "M", "asset_id": "A", "event_class": "MACHINE", "fault_type": "IMBALANCE",
     "onset_utc": "2026-01-02T05:00:00Z", "pre_existing": False, "detectable_utc": "2026-01-02T06:00:00Z",
     "action_deadline_utc": None, "end_utc": "2026-01-02T20:00:00Z", "observable": True, "sensor_tag": None}])


def alert(t, cls, ft, ch, orig=None, conf=.5):
    return {"asset_id": "A", "alert_time_utc": t, "event_class": cls, "fault_type": ft, "confidence": conf,
            "evidence": "", "recommended_action": "", "class_status": "", "original_fault_type": orig or ft,
            "rule_id": "x", "detail": "", "suspected_channel": ch}


def test_unknown_never_gets_credit_from_stored_alternative():
    p = pd.DataFrame([alert("2026-01-01T11:00:00Z", "SENSOR", "UNKNOWN", "flow_m3_h", "SENSOR_CALIBRATION_SHIFT")])
    s, per, *_ = evaluate("X", p, EV, A, pd.DataFrame(columns=["asset_id", "start_utc", "end_utc"]))
    row = per.set_index("event_id").loc["S"]
    assert row.detected and not row.type_correct and not row.type_and_channel and pd.isna(row.first_useful_utc)
    assert s["specific_diagnosis_coverage"] == 0 and s["unknown_first"] == 1 and s["events"] == 2


def test_useful_delay_requires_channel_but_type_only_delay_does_not():
    p = pd.DataFrame([alert("2026-01-01T11:00:00Z", "SENSOR", "SENSOR_CALIBRATION_SHIFT", "fluid_temp_c"),
                      alert("2026-01-01T13:00:00Z", "SENSOR", "SENSOR_CALIBRATION_SHIFT", "flow_m3_h"),
                      alert("2026-01-02T08:00:00Z", "MACHINE", "IMBALANCE", None)])
    s, per, *_ = evaluate("X", p, EV, A, pd.DataFrame(columns=["asset_id", "start_utc", "end_utc"]))
    row = per.set_index("event_id")
    assert row.loc["S", "correct_type_delay_h"] == pytest.approx(1.0)
    assert row.loc["S", "useful_delay_h"] == pytest.approx(3.0)
    assert not row.loc["S", "type_and_channel"]                      # first matched burst named the wrong channel
    assert row.loc["M", "useful_delay_h"] == pytest.approx(2.0)      # machine events need no channel
    assert row.loc["M", "period"] == "later" and row.loc["S", "period"] == "0-24h"


def test_confidence_comparator_relabels_lowest_confidence_specific_first():
    per0 = pd.DataFrame({"event_id": ["a", "b", "c"], "asset_id": "A", "specific_first": [True, True, False],
                         "first_confidence": [.9, .2, .1], "first_alert_utc": ["1", "2", "3"],
                         "type_correct": [True, False, False], "wrong_specific_first": [False, True, False]})
    out = confidence_comparator(per0, 1)
    assert out["relabelled_events"] == ["b"] and out["type_correct"] == 1 and out["wrong_specific_first"] == 0
