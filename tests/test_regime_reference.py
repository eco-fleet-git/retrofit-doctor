"""Task005 phase-1 fixture contracts for E3 (R1 regime gate, R2 abstention) and E4 (P1 prior, P2 reference
check). Constructed probes only: they establish mechanisms and failure cases, not benchmark performance."""
import numpy as np
import pandas as pd
import pytest
from retrofit_doctor.causal_b1 import predict as predict_b1
from retrofit_doctor.regime_reference import fit_prior, normalised, predict
from retrofit_doctor.causal_b1 import causal_features

START = pd.Timestamp("2026-01-01", tz="UTC")
MIN = pd.Timedelta(minutes=1)
RATED = {"motor_rated_rpm": 1500., "motor_rated_current_a": 100., "motor_rated_kw": 50., "design_flow_m3_h": 400.,
         "design_head_m": 25., "vibration_alarm_mm_s": 5.}


def at(h):
    return START + pd.Timedelta(hours=h)


def make(hours=30, channels=("motor_speed_rpm", "discharge_pressure_kpa", "motor_current_a", "fluid_temp_c"),
         aid="A", level=1.0, control="VFD_PRESSURE", start=START):
    """Dense pump at rated speed. `level` scales current/power/flow/head relative to nameplate design point."""
    n = int(hours * 60)
    i = np.arange(n)
    f = pd.DataFrame({"asset_id": aid, "window_start_utc": pd.date_range(start, periods=n, freq="min"), "rows": 60,
                      "running_fraction": 1., "operating_mode": "RUNNING", "quality_any": 0})
    base = {"motor_speed_rpm": 1500., "discharge_pressure_kpa": 9.80665 * 25 * level, "motor_current_a": 80. * level,
            "motor_power_kw": 40. * level, "flow_m3_h": 400. * level, "fluid_temp_c": 30., "vibration_rms_mm_s": 2.,
            "bearing_temp_c": 45.}
    wig = {"motor_speed_rpm": 3., "discharge_pressure_kpa": 1., "motor_current_a": .3, "motor_power_kw": .2,
           "flow_m3_h": 2., "fluid_temp_c": .2, "vibration_rms_mm_s": .05, "bearing_temp_c": .3}
    for k, c in enumerate(channels):
        f[c + "__mean"] = base[c] + wig[c] * np.sin(i * (.7 + .05 * k))
        f[c + "__std"] = .1
        f[c + "__count"] = 60.
    a = pd.DataFrame([{"asset_id": aid, "split": "train", "window_start_utc": start,
                       "window_end_utc": start + pd.Timedelta(hours=hours), "instrumentation_tier": "T2_FULL",
                       "channels_available": "|".join(sorted(channels)), "control": control, **RATED}])
    return f, a


def run(f, a, hours, variant, prior=None):
    return predict(f, a, {a.asset_id.iloc[0]: a.window_start_utc.iloc[0] + pd.Timedelta(hours=hours)}, variant, prior)[0]


def core(p):
    return p[["asset_id", "alert_time_utc", "event_class", "fault_type", "confidence", "evidence",
              "recommended_action"]].reset_index(drop=True)


def set_speed(f, mask, rpm):
    ratio = rpm / 1500.
    f.loc[mask, "motor_speed_rpm__mean"] = rpm + 3 * np.sin(np.arange(mask.sum()))
    if "discharge_pressure_kpa__mean" in f:
        f.loc[mask, "discharge_pressure_kpa__mean"] *= ratio ** 2   # affinity law: head ~ n^2
    if "motor_current_a__mean" in f:
        f.loc[mask, "motor_current_a__mean"] *= ratio ** 3


# --- controls ------------------------------------------------------------------------------------------

@pytest.mark.parametrize("variant", ["R0", "P0"])
def test_controls_equal_causal_b1(variant):
    f, a = make()
    for h in (26, 28):   # same fault type twice within 12 h: the second episode must be suppressed
        f.loc[(f.window_start_utc >= at(h)) & (f.window_start_utc < at(h + 1)), "discharge_pressure_kpa__mean"] += 80
    f = f[(f.window_start_utc < at(3)) | (f.window_start_utc >= at(4))]
    expected = predict_b1(f, a, {"A": at(30)}, k=6, persist=15)
    got = run(f, a, 30, variant)
    assert len(expected) >= 2
    pd.testing.assert_frame_equal(core(got), expected.reset_index(drop=True), check_dtype=False)


# --- R1 regime gate ------------------------------------------------------------------------------------

def test_unfamiliar_normal_regime_is_withheld_not_alarmed():
    f, a = make()
    set_speed(f, f.window_start_utc >= at(26), 1350.)
    assert not run(f, a, 30, "R0").empty                       # control: nuisance from a normal speed change
    assert run(f, a, 30, "R1").empty
    z = predict(f, a, {"A": at(30)}, "R1")[1]
    after = z[z.window_start_utc >= at(26)]
    assert set(after.diagnostic_status) == {"INSUFFICIENT_REGIME_SUPPORT", "TRANSITION"}
    assert after.filter(regex=r"^zs?_").loc[after.diagnostic_status == "INSUFFICIENT_REGIME_SUPPORT"].isna().all().all()


def test_failure_case_fault_in_unsupported_regime_is_missed_with_visible_coverage_loss():
    f, a = make()
    m = f.window_start_utc >= at(26)
    set_speed(f, m, 1350.)
    f.loc[m, "discharge_pressure_kpa__mean"] += 120
    assert run(f, a, 30, "R1").empty
    z = predict(f, a, {"A": at(30)}, "R1")[1]
    assert (z[z.window_start_utc >= at(26) + 10 * MIN].diagnostic_status == "INSUFFICIENT_REGIME_SUPPORT").all()


def test_transition_delays_fault_confirmation_by_ten_minutes_in_supported_regime():
    f, a = make()
    set_speed(f, (f.window_start_utc >= at(12)) & (f.window_start_utc < at(24)), 1350.)  # both regimes in reference
    set_speed(f, f.window_start_utc >= at(26), 1350.)
    f.loc[f.window_start_utc >= at(26), "discharge_pressure_kpa__mean"] += 80
    t0 = pd.to_datetime(run(f, a, 30, "R0").alert_time_utc, utc=True).min()
    t1 = pd.to_datetime(run(f, a, 30, "R1").alert_time_utc, utc=True).min()
    assert t0 == at(26) + 15 * MIN and t1 == at(26) + 25 * MIN
    z = predict(f, a, {"A": at(30)}, "R1")[1].set_index("window_start_utc")
    assert z.loc[at(26):at(26) + 9 * MIN, "diagnostic_status"].eq("TRANSITION").all()
    assert z.loc[at(26) + 10 * MIN, "diagnostic_status"] == "AVAILABLE"


def test_missing_speed_minute_is_not_a_transition():
    f, a = make()
    f.loc[f.window_start_utc == at(26), ["motor_speed_rpm__mean", "motor_speed_rpm__count"]] = [np.nan, 0]
    z = predict(f, a, {"A": at(30)}, "R1")[1]
    assert "TRANSITION" not in set(z[z.window_start_utc > at(25)].diagnostic_status)


# --- R2 abstention -------------------------------------------------------------------------------------

def test_abstention_keeps_alert_times_and_class():
    f, a = make(channels=("motor_speed_rpm", "discharge_pressure_kpa", "fluid_temp_c"))
    f.loc[f.window_start_utc >= at(26), "discharge_pressure_kpa__mean"] += 80
    r0, r2 = run(f, a, 30, "R0"), run(f, a, 30, "R2")
    assert list(r0.alert_time_utc) == list(r2.alert_time_utc) and list(r0.event_class) == list(r2.event_class)
    first = r2.iloc[0]
    assert (first.fault_type, first.event_class, first.class_status, first.original_fault_type, first.rule_id) == (
        "UNKNOWN", "SENSOR", "UNCERTAIN", "SENSOR_CALIBRATION_SHIFT", "abstain_sensor_coupled")
    assert r0.iloc[0].fault_type == "SENSOR_CALIBRATION_SHIFT"


def test_single_channel_claim_with_two_coupled_channels_is_kept():
    f, a = make()
    f.loc[f.window_start_utc >= at(26), "discharge_pressure_kpa__mean"] += 80
    r2 = run(f, a, 30, "R2")
    assert (r2.iloc[0].fault_type, r2.iloc[0].class_status) == ("SENSOR_CALIBRATION_SHIFT", "SUPPORTED")


def test_machine_rule_relying_on_missing_operand_abstains():
    f, a = make(channels=("flow_m3_h", "fluid_temp_c"), control="FIXED_SPEED")
    f.loc[f.window_start_utc >= at(26), "flow_m3_h__mean"] -= 100
    assert run(f, a, 30, "R0").iloc[0].fault_type == "DISCHARGE_RESTRICTION"    # B1 read missing speed as 0
    r2 = run(f, a, 30, "R2").iloc[0]
    assert (r2.fault_type, r2.event_class, r2.original_fault_type, r2.rule_id) == (
        "UNKNOWN", "MACHINE", "DISCHARGE_RESTRICTION", "abstain_missing_operand")


# --- E4 prior ------------------------------------------------------------------------------------------

def fleet(levels=(1.0, 1.02, 0.98), events=None):
    fs, as_ = [], []
    for n, lv in enumerate(levels):
        f, a = make(hours=48, aid=f"F{n}", level=lv)
        fs.append(f)
        as_.append(a)
    f, a = pd.concat(fs, ignore_index=True), pd.concat(as_, ignore_index=True)
    ev = events if events is not None else pd.DataFrame(columns=["asset_id", "onset_utc", "end_utc"])
    z = causal_features(f, a, dict(zip(a.asset_id, a.window_end_utc)))
    return fit_prior(z, a, ev), f, a, ev


def test_nameplate_normalisation_units():
    f, a = make(hours=1, channels=("motor_current_a", "motor_power_kw", "flow_m3_h", "vibration_rms_mm_s",
                                   "bearing_temp_c", "fluid_temp_c"))
    x = normalised(f.assign(steady=True), a.iloc[0].to_dict())
    assert x.i.mean() == pytest.approx(.80, abs=.01)          # 80 A / 100 A rated
    assert x.pw.mean() == pytest.approx(.80, abs=.01)         # 40 kW / 50 kW rated
    assert x.q.mean() == pytest.approx(1.0, abs=.01)          # 400 / 400 m3/h design
    assert x.v.mean() == pytest.approx(.40, abs=.01)          # 2 / 5 mm/s alarm
    assert x.bt.mean() == pytest.approx(15., abs=.2)          # 45 degC - 30 degC [K]


def test_prior_uses_only_fit_assets_and_excludes_labelled_windows():
    prior, f, a, _ = fleet()
    assert prior["channels"]["i"]["supported"] and prior["channels"]["i"]["median"] == pytest.approx(.80, abs=.02)
    assert not prior["channels"]["q"]["supported"]           # flow not installed on the fit assets
    ev = pd.DataFrame([{"asset_id": "F0", "onset_utc": START + pd.Timedelta(hours=2), "end_utc": None}])
    f2 = f.copy()
    f2.loc[(f2.asset_id == "F0") & (f2.window_start_utc >= START + pd.Timedelta(hours=2)), "motor_current_a__mean"] += 500
    z2 = causal_features(f2, a, dict(zip(a.asset_id, a.window_end_utc)))
    z1 = causal_features(f, a, dict(zip(a.asset_id, a.window_end_utc)))
    assert fit_prior(z2, a, ev)["channels"]["i"] == fit_prior(z1, a, ev)["channels"]["i"]


def test_prior_needs_three_fit_assets():
    prior, *_ = fleet(levels=(1.0, 1.02))
    assert not prior["channels"]["i"]["supported"]


def test_cold_start_prior_detects_offset_pump_during_commissioning():
    prior, *_ = fleet()
    f, a = make(level=1.3)                                     # 30 % above the fleet design-point fraction
    assert run(f, a, 23, "P0").empty
    p1 = run(f, a, 23, "P1", prior)
    # B1 steady from the 10th running minute (index 9); 15 flagged minutes 9..23 -> alert 00:24
    assert len(p1) and pd.Timestamp(p1.iloc[0].alert_time_utc) == START + 24 * MIN
    assert run(make(level=1.0)[0], a, 23, "P1", prior).empty


def test_reference_check_flags_contaminated_reference_once_at_close():
    prior, *_ = fleet()
    f, a = make(level=1.3)
    p = run(f, a, 30, "P2", prior)
    hits = p[p.rule_id == "reference_vs_fleet_prior"]
    assert list(hits.alert_time_utc) == ["2026-01-02T00:00:00Z"]
    assert run(f, a, 24 - 1 / 3600, "P2", prior).empty
    assert run(make()[0], a, 30, "P2", prior).empty


def test_failure_case_healthy_pump_at_its_own_duty_point_is_flagged():
    # Nameplate normalisation cannot know a pump's intended duty point: a healthy pump run at 70 % of
    # design load is indistinguishable here from a contaminated reference. Documented limitation.
    prior, *_ = fleet()
    f, a = make(level=0.7)
    assert len(run(f, a, 30, "P2", prior))


# --- causality ----------------------------------------------------------------------------------------

@pytest.mark.parametrize("variant", ["R1", "R2", "P1", "P2"])
@pytest.mark.parametrize("hours", [.4, 23.99, 24, 24 + 1 / 60, 26.2, 26.5, 29])
def test_prefix_and_future_mutation_do_not_change_past(variant, hours):
    prior = fleet()[0] if variant in ("P1", "P2") else None
    f, a = make(level=1.3 if variant.startswith("P") else 1.0)
    set_speed(f, (f.window_start_utc >= at(12)) & (f.window_start_utc < at(24)), 1350.)
    set_speed(f, f.window_start_utc >= at(26), 1350.)
    f.loc[f.window_start_utc >= at(26), "discharge_pressure_kpa__mean"] += 80
    end = at(hours)
    full = run(f, a, 30, variant, prior)
    g = f.copy()
    g.loc[g.window_start_utc >= end, ["discharge_pressure_kpa__mean", "motor_speed_rpm__mean"]] = [-1e6, 1.]
    short = predict(g[g.window_start_utc + MIN <= end], a, {"A": end}, variant, prior)[0]
    mutated = run(g, a, 30, variant, prior)
    past = lambda p: p[pd.to_datetime(p.alert_time_utc, utc=True) <= end].reset_index(drop=True)
    pd.testing.assert_frame_equal(past(full), short.reset_index(drop=True), check_dtype=False)
    pd.testing.assert_frame_equal(past(full), past(mutated), check_dtype=False)


# --- review round 1 ------------------------------------------------------------------------------------

def test_transition_does_not_change_stuck_path():
    # Review 1: a sustained flat (stuck) pressure across a regime change must alert exactly as in R0.
    f, a = make()
    set_speed(f, (f.window_start_utc >= at(12)) & (f.window_start_utc < at(24)), 1350.)
    set_speed(f, f.window_start_utc >= at(26), 1350.)
    flat = (f.window_start_utc >= at(26) - 5 * MIN) & (f.window_start_utc < at(27))
    f.loc[flat, ["discharge_pressure_kpa__mean", "discharge_pressure_kpa__std"]] = [190., 0.]
    r0, r1 = run(f, a, 30, "R0"), run(f, a, 30, "R1")
    stuck0 = r0[r0.fault_type == "SENSOR_STUCK"]
    assert list(stuck0.alert_time_utc) == ["2026-01-02T02:10:00Z"]          # 25:55 + 15 flat minutes
    pd.testing.assert_frame_equal(core(r1[r1.fault_type == "SENSOR_STUCK"]), core(stuck0))
    z = predict(f, a, {"A": at(30)}, "R1")[1].set_index("window_start_utc")
    assert z.loc[at(26), "steady"] and not z.loc[at(26), "amplitude_steady"]


def test_metadata_removal_makes_prior_inputs_unsupported():
    f, a = make(hours=1, channels=("motor_current_a", "fluid_temp_c", "bearing_temp_c", "motor_power_kw"))
    asset = a.iloc[0].to_dict()
    g = f.assign(steady=True)
    assert normalised(g, asset).i.mean() == pytest.approx(.80, abs=.01)
    x = normalised(g, {**asset, "channels_available": ""})                    # values retained, metadata removed
    assert x.isna().all().all()
    x = normalised(g, {**asset, "channels_available": "motor_current_a|bearing_temp_c|motor_power_kw"})
    assert x.bt.isna().all() and x.i.notna().all()                            # rise needs both temperatures
    for bad in (np.nan, 0., -5., np.inf):
        assert normalised(g, {**asset, "motor_rated_current_a": bad}).i.isna().all()
    no_scale = {k: v for k, v in asset.items() if k != "motor_rated_kw"}
    assert normalised(g, no_scale).pw.isna().all()                            # missing nameplate -> unsupported
    held = g.copy()
    held.loc[5:, "motor_current_a__count"] = 0                                # held value, no observation
    assert normalised(held, asset).i.iloc[5:].isna().all()


def test_discharge_pressure_is_not_a_prior_channel():
    prior, *_ = fleet()
    assert "pd" not in prior["channels"]
    x = normalised(make(hours=1)[0].assign(steady=True), make(hours=1)[1].iloc[0].to_dict())
    assert "pd" not in x


def test_cold_start_alert_states_fleet_prior_provenance():
    import json
    prior, *_ = fleet()
    f, a = make(level=1.3)
    first = run(f, a, 30, "P1", prior).iloc[0]
    assert first.rule_id == "fleet_prior_cold_start" and "B1 mode-aware" not in first.evidence
    assert "motor_current_a/motor_rated_current_a" in first.evidence
    d = json.loads(first.detail)
    assert d["reference"] == "fleet_prior" and d["prior_id"] == prior["prior_id"]
    assert d["quantities"]["i"]["fit_assets"] == ["F0", "F1", "F2"] and d["quantities"]["i"]["unit"] == "1"
    later = run(f, a, 30, "P1", prior)
    own = later[pd.to_datetime(later.alert_time_utc, utc=True) > at(24)]
    assert (own.rule_id != "fleet_prior_cold_start").all()
    assert all(json.loads(x)["reference"] == "own_commissioning" for x in own.detail)


def test_reference_check_states_exact_provenance():
    import json
    prior, *_ = fleet()
    f, a = make(level=1.3)
    hit = run(f, a, 30, "P2", prior).query("rule_id == 'reference_vs_fleet_prior'").iloc[0]
    d = json.loads(hit.detail)
    assert d["reference"] == "fleet_prior" and d["prior_id"] == prior["prior_id"]
    assert d["quantities"]["i"]["status"] == "CHECKED" and d["quantities"]["i"]["own_minutes"] >= 60
    assert "bearing_temp_c z" not in hit.evidence and "motor_current_a/motor_rated_current_a" in hit.evidence
