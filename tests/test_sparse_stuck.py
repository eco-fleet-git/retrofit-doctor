"""Task008 sparse-stuck variant contracts. Fixtures are constructed probes, not benchmark observations."""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_causal_b2 import MIN, START, at, make_asset
from retrofit_doctor.causal_b2 import predict_b2
from retrofit_doctor.sparse_stuck import predict_variant

PATTERN = [80., 80., 80., 80., 80.5, 81., 81., 80.5]  # healthy quantized repeats: longest equal run 4


def quantized(hours=30):
    f, a = make_asset(hours=hours)
    s = f["bearing_temp_c__count"].eq(1)
    f.loc[s, "bearing_temp_c__mean"] = [PATTERN[i % len(PATTERN)] for i in range(s.sum())]
    return f, a


def run(f, a, hours, variant):
    return predict_variant(f, a, {"A": at(hours)}, variant)


def comparable(ev):
    return ev.drop(columns=["candidate_id", "sparse_stuck_rule"])


@pytest.mark.parametrize("mutate", ["none", "sparse_freeze", "dense_freeze", "quantized"])
def test_s1_reproduces_sealed_c1(mutate):
    f, a = quantized() if mutate == "quantized" else make_asset(hours=30)
    if mutate == "sparse_freeze":
        f.loc[(f.window_start_utc >= at(26)) & f["bearing_temp_c__count"].eq(1), "bearing_temp_c__mean"] = 81.
    if mutate == "dense_freeze":
        w = (f.window_start_utc >= at(26)) & (f.window_start_utc < at(27))
        f.loc[w, ["discharge_pressure_kpa__mean", "discharge_pressure_kpa__std"]] = [200., 0.]
    p1, e1 = run(f, a, 30, "S1")
    p0, e0 = predict_b2(f, a, {"A": at(30)}, "C1")
    pd.testing.assert_frame_equal(comparable(e1), e0.drop(columns=["candidate_id"]))
    pd.testing.assert_frame_equal(p1.drop(columns=["evidence"]), p0.drop(columns=["evidence"]))


def test_quantized_repeats_fire_c1_but_not_commissioning_rule():
    f, a = quantized()
    assert "SENSOR_STUCK" in set(run(f, a, 30, "S1")[0].fault_type)
    assert run(f, a, 30, "S3")[0].empty


def test_new_freeze_needs_longest_reference_run_plus_one_samples():
    f, a = quantized()
    frozen = (f.window_start_utc >= at(26)) & f["bearing_temp_c__count"].eq(1)
    f.loc[frozen, "bearing_temp_c__mean"] = 79.5
    p, ev = run(f, a, 30, "S3")
    stuck = ev[ev.fault_type == "SENSOR_STUCK"]
    assert len(stuck) == 1 and stuck.iloc[0].suspected_channel == "bearing_temp_c"
    # samples at :02 :07 :12 :17 :22 -> fifth sample closes at 26:23
    assert pd.Timestamp(stuck.iloc[0].alert_time_utc) == at(26) + 23 * MIN
    rule = json.loads(stuck.iloc[0].sparse_stuck_rule)
    # 286 reference samples: the two samples before 10 steady-running minutes are not reference samples
    assert rule == {"channel": "bearing_temp_c", "independent_equal_samples": 5, "required_equal_samples": 5,
                    "reference_samples": 286, "reference_longest_equal_run": 4,
                    "threshold_frozen_at": "2026-01-02T00:00:00Z"}
    # one minute earlier the alert does not exist
    assert predict_variant(f[f.window_start_utc + MIN <= at(26) + 22 * MIN], a, {"A": at(26) + 22 * MIN}, "S3")[0].empty


def test_sparse_stuck_unsupported_during_commissioning_and_contaminated_run_is_insensitive():
    f, a = make_asset(hours=30)
    f.loc[(f.window_start_utc >= at(3)) & f["bearing_temp_c__count"].eq(1), "bearing_temp_c__mean"] = 81.
    stuck_s1 = run(f, a, 30, "S1")[0]
    assert "SENSOR_STUCK" in set(stuck_s1.fault_type)
    assert "SENSOR_STUCK" not in set(run(f, a, 30, "S3")[0].fault_type)


def test_insufficient_reference_samples_make_sparse_stuck_unsupported():
    f, a = make_asset(hours=30)
    ref = f.window_start_utc < at(24)
    f.loc[ref & (f.index > 10), ["bearing_temp_c__mean", "bearing_temp_c__count"]] = [np.nan, 0]  # 2 samples only
    f.loc[(f.window_start_utc >= at(26)) & f["bearing_temp_c__count"].eq(1), "bearing_temp_c__mean"] = 81.
    assert "SENSOR_STUCK" not in set(run(f, a, 30, "S3")[0].fault_type)


def test_reference_run_is_broken_by_a_non_steady_segment():
    f, a = make_asset(hours=30)
    s = f.index[f["bearing_temp_c__count"].eq(1) & (f.window_start_utc >= at(10))][:6]
    f.loc[s, "bearing_temp_c__mean"] = 85.
    stop = f.index[(f.index > s[2]) & (f.index < s[3])][0]
    f.loc[stop, "running_fraction"] = 0.
    frozen = (f.window_start_utc >= at(26)) & f["bearing_temp_c__count"].eq(1)
    f.loc[frozen, "bearing_temp_c__mean"] = 81.
    ev = run(f, a, 30, "S3")[1]
    rule = json.loads(ev[ev.fault_type == "SENSOR_STUCK"].iloc[0].sparse_stuck_rule)
    assert rule["reference_longest_equal_run"] == 3 and rule["required_equal_samples"] == 4


def test_s2_drops_only_sparse_stuck_source():
    f, a = make_asset(hours=30)
    f.loc[(f.window_start_utc >= at(26)) & f["bearing_temp_c__count"].eq(1), "bearing_temp_c__mean"] = 81.
    w = (f.window_start_utc >= at(28)) & (f.window_start_utc < at(29))
    f.loc[w, ["discharge_pressure_kpa__mean", "discharge_pressure_kpa__std"]] = [200., 0.]
    ev = run(f, a, 30, "S2")[1]
    assert list(ev[ev.fault_type == "SENSOR_STUCK"].suspected_channel) == ["discharge_pressure_kpa"]


@pytest.mark.parametrize("hours", [24, 24 + 1 / 60, 26 + 22 / 60, 26 + 23 / 60, 29])
def test_s3_prefix_and_future_mutation_do_not_change_past(hours):
    f, a = quantized()
    f.loc[(f.window_start_utc >= at(26)) & f["bearing_temp_c__count"].eq(1), "bearing_temp_c__mean"] = 79.5
    end = at(hours)
    full_p, full_e = run(f, a, 30, "S3")
    g = f.copy()
    g.loc[g.window_start_utc >= end, "bearing_temp_c__mean"] = 80.
    short_p, short_e = predict_variant(g[g.window_start_utc + MIN <= end], a, {"A": end}, "S3")
    keep = pd.to_datetime(full_e.alert_time_utc, utc=True) <= end
    pd.testing.assert_frame_equal(full_e[keep].reset_index(drop=True), short_e, check_dtype=False)


@pytest.mark.parametrize("variant", ["S2", "S3"])
def test_dense_only_asset_is_identical_to_c1(variant):
    f, a = make_asset(hours=30, tier="T2_FULL")
    w = (f.window_start_utc >= at(26)) & (f.window_start_utc < at(27))
    f.loc[w, ["discharge_pressure_kpa__mean", "discharge_pressure_kpa__std"]] = [200., 0.]
    f.loc[f.window_start_utc >= at(28), "motor_current_a__mean"] += 30
    p, ev = run(f, a, 30, variant)
    p0, e0 = predict_b2(f, a, {"A": at(30)}, "C1")
    assert len(e0) >= 2
    pd.testing.assert_frame_equal(comparable(ev), e0.drop(columns=["candidate_id"]))


def test_equal_run_crossing_commissioning_end_counts_only_new_samples():
    # Freeze starts at 23:50: samples 23:52 and 23:57 are reference samples, not new ones.
    f, a = quantized()
    frozen = (f.window_start_utc >= at(23) + 50 * MIN) & f["bearing_temp_c__count"].eq(1)
    f.loc[frozen, "bearing_temp_c__mean"] = 79.5
    ev = run(f, a, 30, "S3")[1]
    stuck = ev[ev.fault_type == "SENSOR_STUCK"]
    # threshold 5 new samples: 00:02 00:07 00:12 00:17 00:22 -> alert 00:23 (not 00:13)
    assert list(pd.to_datetime(stuck.alert_time_utc, utc=True)) == [at(24) + 23 * MIN]
    rule = json.loads(stuck.iloc[0].sparse_stuck_rule)
    assert rule["independent_equal_samples"] == 5 and rule["required_equal_samples"] == 5
    assert pd.Timestamp(stuck.iloc[0].evidence_window_start) == at(24) + 2 * MIN


def test_operating_segment_change_restarts_the_new_sample_count():
    f, a = quantized()
    frozen = (f.window_start_utc >= at(26)) & f["bearing_temp_c__count"].eq(1)
    f.loc[frozen, "bearing_temp_c__mean"] = 79.5
    stop = f.window_start_utc == at(26) + 15 * MIN          # after samples :02 :07 :12, before :17
    f.loc[stop, "running_fraction"] = 0.
    ev = run(f, a, 30, "S3")[1]
    # steady again from 26:25 (10 running minutes) -> samples :27 :32 :37 :42 :47 -> alert 26:48
    stuck = ev[ev.fault_type == "SENSOR_STUCK"]
    assert list(pd.to_datetime(stuck.alert_time_utc, utc=True)) == [at(26) + 48 * MIN]


def test_regime_change_restarts_new_sample_count_while_steady():
    f, a = quantized()
    frozen = (f.window_start_utc >= at(26)) & f["bearing_temp_c__count"].eq(1)
    f.loc[frozen, "bearing_temp_c__mean"] = 79.5
    f.loc[f.window_start_utc >= at(26) + 15 * MIN, "motor_speed_rpm__mean"] = 1350.  # speed ratio 1.0 -> 0.9
    ev = run(f, a, 30, "S3")[1]
    stuck = ev[ev.fault_type == "SENSOR_STUCK"]
    # regime change at 26:15 (still steady): new count from 26:17 -> :17 :22 :27 :32 :37 -> alert 26:38
    assert list(pd.to_datetime(stuck.alert_time_utc, utc=True)) == [at(26) + 38 * MIN]
    assert pd.Timestamp(stuck.iloc[0].evidence_window_start) == at(26) + 17 * MIN


def test_reference_run_is_broken_by_regime_change_while_steady():
    f, a = make_asset(hours=30)
    s = f.index[f["bearing_temp_c__count"].eq(1) & (f.window_start_utc >= at(10))][:6]
    f.loc[s, "bearing_temp_c__mean"] = 85.
    f.loc[s[2] + 1:s[3] - 1, "motor_speed_rpm__mean"] = 1350.  # brief other regime, steady throughout
    f.loc[(f.window_start_utc >= at(26)) & f["bearing_temp_c__count"].eq(1), "bearing_temp_c__mean"] = 81.
    ev = run(f, a, 30, "S3")[1]
    rule = json.loads(ev[ev.fault_type == "SENSOR_STUCK"].iloc[0].sparse_stuck_rule)
    assert rule["reference_longest_equal_run"] == 3 and rule["required_equal_samples"] == 4
