import numpy as np
import pandas as pd
import pytest
from retrofit_doctor.causal_b1 import causal_features, predict_from_features, predict


@pytest.fixture
def synthetic():
    start = pd.Timestamp("2026-01-01", tz="UTC")
    n = 48 * 60
    ts = pd.date_range(start, periods=n, freq="min")
    f = pd.DataFrame({"asset_id": "A", "window_start_utc": ts, "rows": 60,
                      "running_fraction": 1., "operating_mode": "RUNNING",
                      "motor_speed_rpm__mean": 1500., "motor_speed_rpm__std": .1,
                      "motor_speed_rpm__count": 60,
                      "discharge_pressure_kpa__mean": 200. + .2 * np.sin(np.arange(n)),
                      "discharge_pressure_kpa__std": .1, "discharge_pressure_kpa__count": 60})
    a = pd.DataFrame([{"asset_id": "A", "motor_rated_rpm": 1500., "window_start_utc": start,
                       "window_end_utc": start + pd.Timedelta(hours=48)}])
    return f, a, start


def assert_frames(a, b):
    pd.testing.assert_frame_equal(a.reset_index(drop=True), b.reset_index(drop=True),
                                  check_dtype=False, check_exact=False, atol=1e-9, rtol=0)


def test_future_mutation_cannot_change_past_outputs(synthetic):
    f, a, start = synthetic
    f.loc[1500:1550, "discharge_pressure_kpa__mean"] += 80
    now = start + pd.Timedelta(hours=26)
    z = causal_features(f, a, {"A": now})
    changed = f.copy()
    changed.loc[changed.window_start_utc >= now, "discharge_pressure_kpa__mean"] = -1e9
    changed.loc[changed.window_start_utc >= now, "operating_mode"] = "STOPPED"
    z2 = causal_features(changed, a, {"A": now})
    assert_frames(z, z2)
    assert_frames(predict_from_features(z), predict_from_features(z2))
    assert len(predict_from_features(z)) > 0


@pytest.mark.parametrize("hours", [.75, 13, 23 + 59/60, 24, 24 + 1/60, 26, 40])
def test_closed_prefix_matches_full_run(synthetic, hours):
    f, a, start = synthetic
    f.loc[1500:1550, "discharge_pressure_kpa__mean"] += 80
    end = start + pd.Timedelta(hours=hours)
    full = causal_features(f, a, {"A": start + pd.Timedelta(hours=48)})
    prefix = f[f.window_start_utc + pd.Timedelta(minutes=1) <= end]
    short = causal_features(prefix, a, {"A": end})
    past = full[full.window_start_utc + pd.Timedelta(minutes=1) <= end]
    assert_frames(past, short)
    p = predict_from_features(full)
    pp = p[pd.to_datetime(p.alert_time_utc, utc=True) <= end]
    assert_frames(pp, predict_from_features(short))


def test_commissioning_never_computes_reference_deviations(synthetic):
    f, a, start = synthetic
    f.loc[20:60, "discharge_pressure_kpa__mean"] += 1000
    z = causal_features(f, a, {"A": start + pd.Timedelta(hours=30)})
    warmup = z[z.window_start_utc < start + pd.Timedelta(hours=24)]
    assert warmup.filter(regex=r"^zs?_").isna().all().all()
    assert (warmup.reference_status == "COLLECTING_REFERENCE").all()


def test_reference_is_frozen_after_commissioning(synthetic):
    f, a, start = synthetic
    f.loc[1440:, "discharge_pressure_kpa__mean"] = 280.
    z = causal_features(f, a, {"A": start + pd.Timedelta(hours=48)})
    active = z[z.window_start_utc >= start + pd.Timedelta(hours=24)]
    assert active.z_pd.min() > 30
    assert active.z_pd.max() - active.z_pd.min() < 1e-9


def test_trailing_outage_detected_without_recovery_packet(synthetic):
    f, a, start = synthetic
    outage = start + pd.Timedelta(hours=3)
    f = f[f.window_start_utc < outage]
    now = outage + pd.Timedelta(minutes=15)
    p = predict(f, a, {"A": now})
    assert len(p) == 1
    assert p.iloc[0].fault_type == "COMMUNICATION_LOSS"
    assert pd.Timestamp(p.iloc[0].alert_time_utc) == now


def test_no_baseline_data_does_not_borrow_from_later_samples(synthetic):
    f, a, start = synthetic
    f.loc[f.window_start_utc < start + pd.Timedelta(hours=24), "operating_mode"] = "STOPPED"
    f.loc[1440:, "discharge_pressure_kpa__mean"] = 900.
    z = causal_features(f, a, {"A": start + pd.Timedelta(hours=48)})
    assert z.z_pd.isna().all()
    assert (z.loc[z.window_start_utc >= start + pd.Timedelta(hours=24), "reference_status"] == "INSUFFICIENT_REFERENCE").all()


def test_flatline_quality_check_works_during_warmup(synthetic):
    f, a, start = synthetic
    f.loc[20:60, "discharge_pressure_kpa__std"] = 0
    p = predict(f, a, {"A": start + pd.Timedelta(hours=1)})
    assert len(p) == 1
    assert p.iloc[0].fault_type == "SENSOR_STUCK"


def test_unclosed_minute_cannot_trigger_alert(synthetic):
    f, a, start = synthetic
    f.loc[20:33, "discharge_pressure_kpa__std"] = 0
    f.loc[34, "discharge_pressure_kpa__std"] = 0
    early = predict(f, a, {"A": start + pd.Timedelta(minutes=34, seconds=59)})
    complete = predict(f, a, {"A": start + pd.Timedelta(minutes=35)})
    assert early.empty
    assert len(complete) == 1


def test_empty_packets_still_allow_gateway_warning(synthetic):
    f, a, start = synthetic
    p = predict(f.iloc[:0], a, {"A": start + pd.Timedelta(minutes=15)})
    assert len(p) == 1 and p.iloc[0].fault_type == "COMMUNICATION_LOSS"


def test_requires_explicit_clock(synthetic):
    f, a, _ = synthetic
    with pytest.raises(ValueError, match="observation time"):
        causal_features(f, a, {})


def test_future_duplicate_does_not_change_current_result(synthetic):
    f, a, start = synthetic
    now = start + pd.Timedelta(hours=26)
    expected = causal_features(f, a, {"A": now})
    with_duplicate = pd.concat([f, f.iloc[2000:2001]], ignore_index=True)
    assert_frames(expected, causal_features(with_duplicate, a, {"A": now}))


def test_duplicate_observed_window_is_rejected(synthetic):
    f, a, start = synthetic
    with_duplicate = pd.concat([f, f.iloc[:1]], ignore_index=True)
    with pytest.raises(ValueError, match="Duplicate observed"):
        causal_features(with_duplicate, a, {"A": start + pd.Timedelta(hours=26)})
