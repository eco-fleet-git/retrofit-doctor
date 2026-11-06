"""Contract tests for causal B2 v1 (docs/experiments/CLAUDE_TASK_PACKET.md, step 4).

All fixtures are constructed logic probes, not benchmark observations. Seams:
causal predictions + structured evidence, per-channel sample availability, and
deterministic evidence. Tests do not inspect implementation internals.
"""
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from retrofit_doctor.causal_b1 import predict as predict_b1
from retrofit_doctor.causal_b2 import channel_quality, load_split_inputs, predict_b2

ROOT = Path(__file__).resolve().parents[1]
START = pd.Timestamp("2026-01-01", tz="UTC")
REF_END = START + pd.Timedelta(hours=24)
MIN = pd.Timedelta(minutes=1)
SPARSE = ["bearing_temp_c", "vibration_rms_mm_s"]
DENSE = ["motor_speed_rpm", "discharge_pressure_kpa", "motor_current_a", "fluid_temp_c"]


def make_asset(hours=30, tier="T1_RETROFIT", update_s=300.):
    """T1-like asset: dense PLC channels each minute, wireless channels one sample per 5 min."""
    n = int(hours * 60)
    ts = pd.date_range(START, periods=n, freq="min")
    i = np.arange(n)
    f = pd.DataFrame({"asset_id": "A", "window_start_utc": ts, "rows": 60, "running_fraction": 1.,
                      "operating_mode": "RUNNING", "quality_any": 0})
    base = {"motor_speed_rpm": 1500., "discharge_pressure_kpa": 200., "motor_current_a": 50., "fluid_temp_c": 30.,
            "bearing_temp_c": 80., "vibration_rms_mm_s": 2.}
    wiggle = {"motor_speed_rpm": 3., "discharge_pressure_kpa": 1., "motor_current_a": .3, "fluid_temp_c": .2,
              "bearing_temp_c": .5, "vibration_rms_mm_s": .05}
    for c in DENSE:
        f[c + "__mean"] = base[c] + wiggle[c] * np.sin(i * .7)
        f[c + "__std"] = .1
        f[c + "__count"] = 60.
    sparse_rows = (i % 5) == 2 if tier == "T1_RETROFIT" else np.ones(n, bool)
    for c in SPARSE:
        # Deterministic pseudo-noise with distinct consecutive sample values.
        f[c + "__mean"] = np.where(sparse_rows, base[c] + wiggle[c] * np.sin(i * 1.3), np.nan)
        f[c + "__std"] = np.nan if tier == "T1_RETROFIT" else .1
        f[c + "__count"] = np.where(sparse_rows, 1. if tier == "T1_RETROFIT" else 60., 0.)
    a = pd.DataFrame([{"asset_id": "A", "split": "train", "motor_rated_rpm": 1500., "window_start_utc": START,
                       "window_end_utc": START + pd.Timedelta(hours=hours), "instrumentation_tier": tier,
                       "wireless_update_s": update_s if tier == "T1_RETROFIT" else np.nan,
                       "channels_available": "|".join(sorted(DENSE + SPARSE))}])
    return f, a


def at(hours):
    return START + pd.Timedelta(hours=hours)


def run(f, a, hours, candidate="C1"):
    return predict_b2(f, a, {"A": at(hours)}, candidate=candidate)


def state(q, channel, t):
    return q[(q.channel == channel) & (q.window_start_utc == t)].iloc[0]


# --- sample availability -------------------------------------------------------------------------------

def test_native_sparse_cadence_is_not_missing_data():
    f, a = make_asset(hours=2)
    q = channel_quality(f, a, {"A": at(2)})
    bt = q[q.channel == "bearing_temp_c"]
    assert set(bt.expected_cadence_min) == {5.}
    assert set(bt.quality_state) == {"FRESH", "NO_NEW_SAMPLE"}
    assert bt.new_observation.sum() == 24
    # a held value between updates is state, never a new observation
    held = state(q, "bearing_temp_c", START + 4 * MIN)
    assert held.quality_state == "NO_NEW_SAMPLE" and not held.new_observation
    assert held.last_value == pytest.approx(f.loc[2, "bearing_temp_c__mean"]) and held.age_min == 2


def test_missed_sparse_update_becomes_stale_after_two_intervals():
    f, a = make_asset(hours=2)
    f.loc[(f.index >= 30) & (f.index < 60), "bearing_temp_c__mean"] = np.nan
    f.loc[(f.index >= 30) & (f.index < 60), "bearing_temp_c__count"] = 0
    q = channel_quality(f, a, {"A": at(2)})
    # last sample in window 27 (ends 28); 2 x 5 min allowed -> stale from window ending 39
    assert state(q, "bearing_temp_c", START + 37 * MIN).quality_state == "NO_NEW_SAMPLE"
    assert state(q, "bearing_temp_c", START + 38 * MIN).quality_state == "STALE"
    assert state(q, "bearing_temp_c", START + 62 * MIN).quality_state == "FRESH"


def test_not_installed_and_unknown_cadence_are_explicit():
    f, a = make_asset(hours=1, update_s=np.nan)
    q = channel_quality(f, a, {"A": at(1)})
    assert (q[q.channel == "flow_m3_h"].quality_state == "NOT_INSTALLED").all()
    assert q[q.channel == "bearing_temp_c"].expected_cadence_min.isna().all()
    assert "UNKNOWN_CADENCE" in set(q[q.channel == "bearing_temp_c"].quality_state)


def test_channel_gap_is_stale_not_gateway_loss():
    f, a = make_asset(hours=30)
    gap = (f.index >= 26 * 60) & (f.index < 27 * 60)
    f.loc[gap, "discharge_pressure_kpa__mean"] = np.nan
    f.loc[gap, "discharge_pressure_kpa__count"] = 0
    p, ev = run(f, a, 30)
    assert "COMMUNICATION_LOSS" not in set(p.fault_type)
    q = channel_quality(f, a, {"A": at(30)})
    assert state(q, "discharge_pressure_kpa", at(26.5)).quality_state == "STALE"


# --- gateway -----------------------------------------------------------------------------------------

def test_gateway_gap_without_recovery_alerts_on_clock_even_in_warmup():
    f, a = make_asset(hours=30)
    f = f[f.window_start_utc < at(3)]
    p, ev = run(f, a, 3 + 15 / 60)
    assert list(p.fault_type) == ["COMMUNICATION_LOSS"]
    assert pd.Timestamp(p.iloc[0].alert_time_utc) == at(3) + 15 * MIN
    assert ev.iloc[0].suspected_channel == "GATEWAY"


def test_continued_gateway_episode_keeps_b1_refractory_boundary():
    # Retry every 720 min; exactly 12 h after the last alert is suppressed (strict > 12 h).
    f, a = make_asset(hours=40)
    f = f[(f.window_start_utc < at(2)) | (f.window_start_utc >= at(27))]
    p, _ = run(f, a, 40)
    times = list(pd.to_datetime(p[p.fault_type == "COMMUNICATION_LOSS"].alert_time_utc, utc=True))
    assert times == [at(2) + 15 * MIN, at(2) + 15 * MIN + pd.Timedelta(hours=24)]


# --- sparse persistence ------------------------------------------------------------------------------

def test_sparse_sustained_anomaly_is_detected_where_b1_misses_it():
    f, a = make_asset(hours=30)
    f.loc[f.window_start_utc >= at(25), "bearing_temp_c__mean"] += 20
    assert predict_b1(f, a, {"A": at(30)}, k=6, persist=15).empty  # A01 counterexample on control
    p, ev = run(f, a, 30)
    assert len(p) >= 1
    first = ev.iloc[0]
    assert first.suspected_channel == "bearing_temp_c"
    # >= 3 independent samples and >= 15 min of evidence, from 25:02 (first shifted sample)
    assert first.sample_counts >= 3
    t = pd.Timestamp(first.alert_time_utc)
    assert t - pd.Timestamp(first.evidence_window_start) >= pd.Timedelta(minutes=15)
    assert t == at(25) + 18 * MIN


def test_sparse_normal_cadence_raises_nothing():
    f, a = make_asset(hours=30)
    p, _ = run(f, a, 30)
    assert p.empty


def test_sparse_frozen_samples_are_stuck_but_requires_new_updates():
    f, a = make_asset(hours=30)
    frozen = (f.window_start_utc >= at(26)) & f["bearing_temp_c__count"].eq(1)
    f.loc[frozen, "bearing_temp_c__mean"] = 81.
    p, ev = run(f, a, 30)
    stuck = ev[ev.fault_type == "SENSOR_STUCK"]
    assert len(stuck) == 1 and stuck.iloc[0].suspected_channel == "bearing_temp_c"
    # updates at :02 :07 :12 :17 -> 4 samples, span 16 min
    assert pd.Timestamp(stuck.iloc[0].alert_time_utc) == at(26) + 18 * MIN


def test_dense_stuck_needs_constant_values_and_zero_std():
    f, a = make_asset(hours=3)
    win = (f.index >= 60) & (f.index < 80)
    f.loc[win, "discharge_pressure_kpa__std"] = 0
    rounded_only = run(f, a, 3)[0]
    assert rounded_only.empty  # zero std but changing means is not a frozen value
    f.loc[win, "discharge_pressure_kpa__mean"] = 200.
    p, ev = run(f, a, 3)
    assert list(p.fault_type) == ["SENSOR_STUCK"]
    assert pd.Timestamp(p.iloc[0].alert_time_utc) == START + 75 * MIN


def test_dense_equal_means_with_live_variation_are_not_stuck():
    f, a = make_asset(hours=3)
    f.loc[(f.index >= 60) & (f.index < 80), "discharge_pressure_kpa__mean"] = 200.
    assert run(f, a, 3)[0].empty


def test_stale_sparse_channel_is_not_stuck():
    f, a = make_asset(hours=30)
    f.loc[f.window_start_utc >= at(26), ["bearing_temp_c__mean", "bearing_temp_c__count"]] = [np.nan, 0]
    assert run(f, a, 30)[0].empty


def test_two_causes_in_a_row_do_not_confirm_either():
    f, a = make_asset(hours=30)
    t0 = f.index[f.window_start_utc == at(26)][0]
    f.loc[t0:t0 + 9, "discharge_pressure_kpa__mean"] += 100       # cause A 10 min
    f.loc[t0 + 10:t0 + 14, "motor_current_a__mean"] += 30         # cause B 5 min
    assert not predict_b1(f, a, {"A": at(30)}, k=6, persist=15).empty  # B1 merges them
    assert run(f, a, 30)[0].empty


def test_planned_stop_is_not_stuck_or_anomaly():
    f, a = make_asset(hours=30)
    stop = (f.window_start_utc >= at(26)) & (f.window_start_utc < at(27))
    f.loc[stop, "operating_mode"] = "STOPPED"
    f.loc[stop, "running_fraction"] = 0.
    for c in DENSE:
        f.loc[stop, c + "__mean"] = 0.
        f.loc[stop, c + "__std"] = 0.
    assert run(f, a, 30)[0].empty


# --- causality and determinism -------------------------------------------------------------------------

def _shifted():
    f, a = make_asset(hours=30)
    f.loc[f.window_start_utc >= at(25), "bearing_temp_c__mean"] += 20
    f.loc[(f.window_start_utc >= at(27)) & (f.window_start_utc < at(28)), "rows"] = 0
    return f, a


@pytest.mark.parametrize("candidate", ["C1", "C4"])
@pytest.mark.parametrize("hours", [.75, 23 + 59 / 60, 24, 25.3, 25 + 17 / 60, 25 + 18 / 60, 27.25, 29.9])
def test_prefix_run_equals_full_run_past(candidate, hours):
    f, a = _shifted()
    end = at(hours)
    full_p, full_e = run(f, a, 30, candidate)
    short_p, short_e = predict_b2(f[f.window_start_utc + MIN <= end], a, {"A": end}, candidate=candidate)
    keep = pd.to_datetime(full_e.alert_time_utc, utc=True) <= end
    pd.testing.assert_frame_equal(full_e[keep].reset_index(drop=True), short_e.reset_index(drop=True), check_dtype=False)
    keep = pd.to_datetime(full_p.alert_time_utc, utc=True) <= end
    pd.testing.assert_frame_equal(full_p[keep].reset_index(drop=True), short_p.reset_index(drop=True), check_dtype=False)
    q_full = channel_quality(f, a, {"A": at(30)})
    q_short = channel_quality(f, a, {"A": end})
    pd.testing.assert_frame_equal(q_full[q_full.window_start_utc + MIN <= end].reset_index(drop=True),
                                  q_short.reset_index(drop=True), check_dtype=False)


def test_future_mutation_and_row_order_do_not_change_past():
    f, a = _shifted()
    now = at(26)
    p, ev = run(f, a, 26)
    assert len(p) >= 1
    changed = f.copy()
    changed.loc[changed.window_start_utc >= now, "bearing_temp_c__mean"] = -1e9
    changed = changed.sample(frac=1, random_state=3)
    p2, ev2 = predict_b2(changed, a, {"A": now})
    pd.testing.assert_frame_equal(ev, ev2)


def test_duplicate_observed_window_is_rejected():
    f, a = make_asset(hours=2)
    with pytest.raises(ValueError, match="Duplicate observed"):
        predict_b2(pd.concat([f, f.iloc[:1]]), a, {"A": at(2)})


def test_equal_strength_hypotheses_are_hash_seed_independent():
    code = (
        "import sys; sys.path[:0]=['src','vendor/benchmark/src','tests'];"
        "import test_causal_b2 as T; f,a=T.make_asset(hours=30);"
        "m=f.window_start_utc>=T.at(26);"
        "f.loc[m,'discharge_pressure_kpa__mean']+=100; f.loc[m,'motor_current_a__mean']+=100*.3;"
        "f.loc[m,'fluid_temp_c__mean']+=100*.3*0.2/1.0;"
        "p,e=T.predict_b2(f,a,{'A':T.at(30)},candidate='C2'); print(e.to_csv(index=False))")
    outs = set()
    for seed in ["0", "1", "7", "9"]:
        env = dict(os.environ, PYTHONHASHSEED=seed)
        r = subprocess.run([sys.executable, "-c", code], cwd=ROOT, env=env, capture_output=True, text=True, check=True)
        outs.add(r.stdout)
    assert len(outs) == 1 and len(next(iter(outs)).splitlines()) > 1


# --- trajectory diagnosis (C2..C5) -------------------------------------------------------------------

def test_step_on_one_instrument_with_quiet_coupled_channels_is_calibration_shift():
    f, a = make_asset(hours=30)
    f.loc[f.window_start_utc >= at(26), "discharge_pressure_kpa__mean"] += 40
    p, ev = run(f, a, 30, "C2")
    first = ev.iloc[0]
    assert (first.event_class, first.fault_type, first.suspected_channel) == (
        "SENSOR", "SENSOR_CALIBRATION_SHIFT", "discharge_pressure_kpa")


def test_ramp_on_one_instrument_is_drift():
    f, a = make_asset(hours=30)
    m = f.window_start_utc >= at(26)
    f.loc[m, "discharge_pressure_kpa__mean"] += 1.0 * np.arange(m.sum())
    p, ev = run(f, a, 30, "C2")
    first = ev.iloc[0]
    assert (first.fault_type, first.suspected_channel) == ("SENSOR_DRIFT", "discharge_pressure_kpa")


def test_noise_without_mean_shift_is_noise_in_trajectory_candidates_only():
    f, a = make_asset(hours=30)
    f.loc[f.window_start_utc >= at(26), "discharge_pressure_kpa__std"] = 5.
    p, ev = run(f, a, 30, "C2")
    first = ev.iloc[0]
    assert (first.fault_type, first.suspected_channel) == ("SENSOR_NOISE_SPIKES", "discharge_pressure_kpa")


def test_short_history_is_unknown_not_drift():
    f, a = make_asset(hours=30)
    m = f.window_start_utc >= at(26)
    f.loc[m, "discharge_pressure_kpa__mean"] += 40
    # A stop 20 min before the shift resets the segment: 120 min history is insufficient.
    stop = (f.window_start_utc >= at(26) - 20 * MIN) & (f.window_start_utc < at(26) - 19 * MIN)
    f.loc[stop, "running_fraction"] = 0.
    p, ev = run(f, a, 30, "C4")
    first = ev.iloc[0]
    assert first.fault_type == "UNKNOWN" and first.event_class == "SENSOR"


def test_sensor_claim_needs_two_fresh_coupled_channels():
    f, a = make_asset(hours=30)
    f.loc[f.window_start_utc >= at(26), "discharge_pressure_kpa__mean"] += 40
    # discharge pressure coupled: current, power, flow, speed, suction -> only current and speed exist; drop speed
    f.loc[f.window_start_utc >= at(25), ["motor_speed_rpm__mean", "motor_speed_rpm__count"]] = [np.nan, 0]
    p, ev = run(f, a, 30, "C2")
    first = ev.iloc[0]
    assert first.event_class != "SENSOR" or first.fault_type == "UNKNOWN"
    assert first.class_status == "UNCERTAIN"


# --- evidence contract and split guard ----------------------------------------------------------------

def test_evidence_contract_fields_and_no_labels():
    f, a = _shifted()
    p, ev = run(f, a, 30, "C2")
    required = {"asset_id", "alert_time_utc", "event_class", "fault_type", "confidence", "suspected_channel",
                "class_status", "reference_status", "reference_origin", "reference_end_utc", "evidence_window_start",
                "latest_input_available_at", "supporting_channels", "conflicting_channels", "missing_channels",
                "observed_values", "residuals", "sample_counts", "ages", "expected_cadence", "rule_id",
                "candidate_id", "alternatives", "recommended_action"}
    assert required <= set(ev.columns)
    assert not {"event_id", "sensor_tag", "label"} & set(ev.columns)
    assert (pd.to_datetime(ev.latest_input_available_at, utc=True) <= pd.to_datetime(ev.alert_time_utc, utc=True)).all()
    assert list(p.columns[:5]) == ["asset_id", "alert_time_utc", "event_class", "fault_type", "confidence"]


def test_loader_rejects_test_split_before_reading_telemetry(tmp_path):
    with pytest.raises(PermissionError):
        load_split_inputs(tmp_path, "test")


def test_missing_channel_representation_does_not_depend_on_other_alerts():
    # Regression (train audit run 1): a prefix holding only channel-less alerts stored None while the
    # full run stored NaN, so identical past alerts compared unequal. Missing channel is always None.
    f, a = make_asset(hours=30)
    f.loc[(f.window_start_utc >= at(25)) & (f.window_start_utc < at(26)), "discharge_pressure_kpa__mean"] += 100
    f.loc[(f.window_start_utc >= at(25)) & (f.window_start_utc < at(26)), "motor_current_a__mean"] -= 30
    f = f[f.window_start_utc < at(28)]
    p_full, ev_full = run(f, a, 29)
    assert {"GATEWAY", None} <= set(ev_full.suspected_channel)
    p_short, ev_short = predict_b2(f[f.window_start_utc + MIN <= at(27)], a, {"A": at(27)})
    assert list(ev_short.suspected_channel) == [None]
    pd.testing.assert_frame_equal(ev_full.iloc[:1], ev_short)
    pd.testing.assert_frame_equal(p_full.iloc[:1], p_short)
