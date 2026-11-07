"""Task010 phase-1 contracts on synthetic fixtures only (no benchmark telemetry, labels or scoring)."""
import numpy as np
import pandas as pd
import pytest

from retrofit_sim import baselines as B
from retrofit_doctor import diagnosis_fusion as D
from retrofit_doctor.causal_b1 import predict as predict_b1

FS, N = 10240, 10240
START = pd.Timestamp("2026-01-01", tz="UTC")
BPFO = 3.6


def wave(rpm=1500., a1=.05, a2=0., bpfo_impulses=0., noise=.01, seed=0):
    t = np.arange(N) / FS
    fr = rpm / 60
    rng = np.random.default_rng(seed)
    x = a1 * np.sin(2 * np.pi * fr * t) + a2 * np.sin(2 * np.pi * 2 * fr * t + .3) + noise * rng.standard_normal(N)
    if bpfo_impulses:
        ring = np.exp(-t[:200] * 1500) * np.sin(2 * np.pi * 3300 * t[:200])   # decaying high-frequency ring
        for k in np.arange(0, 1, 1 / (BPFO * fr)):
            i = int(k * FS)
            x[i:i + 200] += bpfo_impulses * ring[:N - i]
    return x.astype("float32")


def snap(ts, sid, rpm=1500., **kw):
    return {"asset_id": "A", "snapshot_id": sid, "timestamp_utc": pd.Timestamp(ts), "sample_rate_hz": FS,
            "n_samples": N, "axis": "radial", "unit": "g", "rpm_at_capture": rpm, "samples": wave(rpm, **kw)}


CHANNELS = "motor_speed_rpm|discharge_pressure_kpa|motor_current_a|vibration_accel_rms_g"
REF_END = START + pd.Timedelta(hours=24)


def asset_meta(hours=40, channels=CHANNELS):
    return pd.DataFrame([{"asset_id": "A", "motor_rated_rpm": 1500., "bearing_bpfo_order": BPFO,
                          "channels_available": channels,
                          "window_start_utc": START.isoformat(),
                          "window_end_utc": (START + pd.Timedelta(hours=hours)).isoformat()}])


def minutes(hours=40, aid="A", steps=((26, 30, "discharge_pressure_kpa__mean", 80.),)):
    n = hours * 60
    i = np.arange(n)
    f = pd.DataFrame({"asset_id": aid, "window_start_utc": pd.date_range(START, periods=n, freq="min"), "rows": 60,
                      "running_fraction": 1., "operating_mode": "RUNNING",
                      "motor_speed_rpm__mean": 1500. + np.sin(i), "motor_speed_rpm__std": .1, "motor_speed_rpm__count": 60,
                      "discharge_pressure_kpa__mean": 200. + .3 * np.sin(i * .7), "discharge_pressure_kpa__std": .1,
                      "discharge_pressure_kpa__count": 60,
                      "motor_current_a__mean": 50. + .2 * np.cos(i * .3), "motor_current_a__std": .1,
                      "motor_current_a__count": 60})
    for h0, h1, col, delta in steps:
        f.loc[(f.window_start_utc >= START + pd.Timedelta(hours=h0))
              & (f.window_start_utc < START + pd.Timedelta(hours=h1)), col] += delta
    return f


def reference_snaps():
    return [snap(START + pd.Timedelta(hours=h), f"S{h:02d}", seed=h) for h in (2, 6, 10, 14, 18, 22)]


# --- waveform signal processing ---------------------------------------------------------------------------

def test_sinusoidal_harmonics_are_measured_at_running_speed_orders():
    f = D.snapshot_features(wave(a1=.2, a2=.1, noise=0.), FS, 1500., BPFO)
    assert f["a1x"] == pytest.approx(.2, rel=.02) and f["a2x"] == pytest.approx(.1, rel=.02)


def test_bpfo_impulse_train_raises_envelope_ratio_but_broadband_noise_does_not():
    impact = D.snapshot_features(wave(bpfo_impulses=.5), FS, 1500., BPFO)
    noise = D.snapshot_features(wave(noise=.3), FS, 1500., BPFO)
    assert impact["env_ratio"] >= D.W1_ENV_RATIO_MIN
    assert noise["env_ratio"] < D.W1_ENV_RATIO_MIN


def test_invalid_rpm_or_short_record_gives_missing_not_normal():
    f = D.snapshot_features(wave(), FS, float("nan"), BPFO)
    assert all(np.isnan(v) for v in f.values())


# --- availability, staleness and causality --------------------------------------------------------------

def test_snapshot_is_usable_only_after_its_last_sample_and_until_max_age():
    s = pd.DataFrame(reference_snaps() + [snap(START + pd.Timedelta(hours=30), "LATE")])
    table = D.snapshot_table(s, asset_meta().iloc[0])
    done = START + pd.Timedelta(hours=30, seconds=1)
    times = [done - pd.Timedelta(seconds=1), done, done + D.SNAP_MAX_AGE, done + D.SNAP_MAX_AGE + pd.Timedelta(seconds=1)]
    st = D.waveform_state(table, times, None, REF_END)
    assert list(st.wf_snapshot_id) == ["S22", "LATE", "LATE", "LATE"]
    assert list(st.wf_status) == ["STALE", "FRESH", "FRESH", "STALE"]


def test_reference_is_not_used_before_commissioning_ends():
    table = D.snapshot_table(pd.DataFrame(reference_snaps()), asset_meta().iloc[0])
    st = D.waveform_state(table, [START + pd.Timedelta(hours=23)], None, START + pd.Timedelta(hours=24))
    assert st.wf_status[0] == "NO_REFERENCE" and np.isnan(st.wf_log_1x_gain[0])


def test_speed_change_and_reference_speed_mismatch_abstain():
    s = pd.DataFrame(reference_snaps() + [snap(START + pd.Timedelta(hours=26), "FAST", rpm=1800.)])
    table = D.snapshot_table(s, asset_meta().iloc[0])
    t = [START + pd.Timedelta(hours=27)]
    assert D.waveform_state(table, t, np.array([1500.]), START + pd.Timedelta(hours=24)).wf_status[0] == "SPEED_CHANGED"
    assert D.waveform_state(table, t, None, START + pd.Timedelta(hours=24)).wf_status[0] == "REF_SPEED_MISMATCH"


def test_future_snapshot_mutation_cannot_change_state_at_earlier_clock():
    base = reference_snaps() + [snap(START + pd.Timedelta(hours=26), "S26")]
    later = [snap(START + pd.Timedelta(hours=28), "S28", a1=5., bpfo_impulses=2.)]
    t = [START + pd.Timedelta(hours=27), START + pd.Timedelta(hours=28, seconds=1) - pd.Timedelta(microseconds=1)]
    a = D.waveform_state(D.snapshot_table(pd.DataFrame(base), asset_meta().iloc[0]), t, None, START + pd.Timedelta(hours=24))
    b = D.waveform_state(D.snapshot_table(pd.DataFrame(base + later), asset_meta().iloc[0]), t, None,
                         START + pd.Timedelta(hours=24))
    pd.testing.assert_frame_equal(a, b)


# --- W1 rules -------------------------------------------------------------------------------------------

def _w1_at(**kw):
    s = pd.DataFrame(reference_snaps() + [snap(START + pd.Timedelta(hours=26), "X", **kw)])
    st = D.waveform_state(D.snapshot_table(s, asset_meta().iloc[0]), [START + pd.Timedelta(hours=27)], None,
                          START + pd.Timedelta(hours=24))
    return D.w1_rule(st.iloc[0])


def test_w1_rules_bearing_misalignment_imbalance_and_abstain():
    assert _w1_at(bpfo_impulses=.5)[0] == "BEARING_WEAR"
    mis = _w1_at(a1=.2, a2=.15)
    assert mis[0] == "MISALIGNMENT" and "not proof" in mis[1]
    assert _w1_at(a1=.2, a2=0.)[0] == "IMBALANCE"
    assert _w1_at() is None


# --- emission, fallback and protection ------------------------------------------------------------------

def test_b1_control_equals_released_causal_b1_and_emission_is_fixed_for_all_candidates():
    f, a = minutes(), asset_meta()
    want = predict_b1(f, a, {"A": a.window_end_utc.iloc[0]}, k=6, persist=15)
    got = D.predict_asset("B1", f, pd.DataFrame(), a)
    assert len(want)
    pd.testing.assert_frame_equal(got[B._COLS], want[B._COLS].reset_index(drop=True), check_dtype=False)
    for c in ("W1", "M1", "F2", "X1"):                  # no model / no snapshots -> exact B1 fallback
        p = D.predict_asset(c, f, pd.DataFrame(columns=["asset_id"]), a, model=None)
        pd.testing.assert_frame_equal(p[B._COLS], got[B._COLS])
        assert set(p.diagnosis_source) == {"B1"}


class StubEstimator:
    def __init__(self, probs):
        self.probs = np.asarray(probs)

    def predict_proba(self, X):
        return np.repeat(self.probs[None, :], len(X), axis=0)


def _stub_model(kind, probs, classes=("DISCHARGE_RESTRICTION", "NORMAL", "SENSOR_DRIFT")):
    f = D.minute_features(D.normalized_asset(minutes(), asset_meta()), D.installed_keys(asset_meta().iloc[0]))
    names = tuple(f.columns) if kind == "minute" else tuple(D.fused_features(
        f, pd.DataFrame({"wf_status": ["NONE"] * len(f), **{c: np.nan for c in D.WF_FEATURES}})).columns)
    return D.FittedModel(kind=kind, fit_assets=("B", "C"), model_id="stub", classes=classes, feature_names=names,
                         estimator=StubEstimator(probs))


@pytest.mark.parametrize("cand,probs,expect_source", [
    ("M1", [.7, .2, .1], "M1"), ("M2", [.7, .2, .1], "B1"),     # threshold 0.6 vs 0.8
    ("M1", [.1, .8, .1], "B1"),                                  # NORMAL vote never means healthy
])
def test_learned_override_respects_threshold_and_normal_falls_back(cand, probs, expect_source):
    f, a = minutes(), asset_meta()
    p = D.predict_asset(cand, f, pd.DataFrame(columns=["asset_id"]), a, model=_stub_model("minute", probs))
    assert set(p.diagnosis_source) == {expect_source}
    if expect_source == "M1":
        assert set(p.fault_type) == {"DISCHARGE_RESTRICTION"} and "uncalibrated" in p.evidence.iloc[0]
        assert p.confidence.iloc[0] == pytest.approx(.7)


def test_sensor_claim_names_only_a_uniquely_deviating_channel():
    f, a = minutes(), asset_meta()
    p = D.predict_asset("M1", f, pd.DataFrame(columns=["asset_id"]), a, model=_stub_model("minute", [.1, .1, .8]))
    assert set(p.fault_type) == {"SENSOR_DRIFT"} and set(p.event_class) == {"SENSOR"}
    assert set(p.suspected_channel) == {"discharge_pressure_kpa"}
    two = minutes(steps=((26, 30, "discharge_pressure_kpa__mean", 80.), (26, 30, "motor_current_a__mean", 20.)))
    q = D.predict_asset("M1", two, pd.DataFrame(columns=["asset_id"]), a, model=_stub_model("minute", [.1, .1, .8]))
    assert q.suspected_channel.isna().all()


def test_quality_diagnoses_are_never_overridden():
    f, a = minutes(), asset_meta()
    f = f[(f.window_start_utc < START + pd.Timedelta(hours=33)) | (f.window_start_utc >= START + pd.Timedelta(hours=34))]
    p = D.predict_asset("M1", f, pd.DataFrame(columns=["asset_id"]), a, model=_stub_model("minute", [.9, .05, .05]))
    gw = p[p.b1_fault_type == "COMMUNICATION_LOSS"]
    assert len(gw) and set(gw.fault_type) == {"COMMUNICATION_LOSS"} and set(gw.diagnosis_source) == {"B1"}


def test_missing_waveform_is_explicit_in_fused_features():
    g = D.normalized_asset(minutes(), asset_meta())
    wf = D.asset_waveform(g, pd.DataFrame(columns=["asset_id"]), asset_meta())
    x = D.fused_features(D.minute_features(g, D.installed_keys(asset_meta().iloc[0])), wf)
    assert (x.wf_available == 0).all() and (x[D.WF_FEATURES] == D.MISSING).all().all()


# --- prefix replay ----------------------------------------------------------------------------------------

def test_prefix_replay_and_future_mutation_at_alert_snapshot_and_reference_boundaries():
    f = minutes(steps=((26, 30, "discharge_pressure_kpa__mean", 80.), (34, 36, "motor_current_a__mean", 30.)))
    a = asset_meta()
    snaps = pd.DataFrame(reference_snaps() + [snap(START + pd.Timedelta(hours=h), f"S{h}", seed=h, a1=.2 if h > 30 else .05)
                                              for h in (26, 30, 34, 38)])
    model = _stub_model("fused", [.65, .3, .05])
    full = {c: D.predict_asset(c, f, snaps, a, model=model) for c in ("W1", "F1", "X1")}
    alerts = sorted(pd.to_datetime(full["W1"].alert_time_utc, utc=True).unique())
    cuts = list(alerts) + [START + pd.Timedelta(hours=24, seconds=s) for s in (-1, 0, 1, 60)]
    cuts += [START + pd.Timedelta(hours=h, seconds=1 + s) for h in (26, 30, 34) for s in (-1, 0, 1)]
    cuts += [START + pd.Timedelta(hours=27, seconds=30)]                                  # sub-minute clock
    for c, want in full.items():
        for cut in cuts:
            keep = pd.to_datetime(want.alert_time_utc, utc=True) <= cut
            mut_f = f.copy()
            mut_f.loc[mut_f.window_start_utc + D.MINUTE > cut, "discharge_pressure_kpa__mean"] = 1e4   # incl. open minute
            mut_s = snaps.copy()
            mut_s["samples"] = [wave(a1=9., bpfo_impulses=5.) if ts + pd.Timedelta(seconds=1) > cut else x
                                for ts, x in zip(mut_s.timestamp_utc, mut_s.samples)]    # completion > cut only
            for ff, ss in ((f, snaps), (mut_f, mut_s)):
                got = D.predict_asset(c, ff, ss, a, model=model, as_of=cut)
                pd.testing.assert_frame_equal(got.reset_index(drop=True), want[keep].reset_index(drop=True),
                                              check_dtype=False)


# --- review round 1: installed / observed guards ---------------------------------------------------------

def test_retained_value_with_zero_count_is_masked_and_not_localized():
    f, a = minutes(), asset_meta()
    f.loc[f.window_start_utc >= START + pd.Timedelta(hours=26), "discharge_pressure_kpa__count"] = 0
    g = D.normalized_asset(f, a)
    x = D.minute_features(g, D.installed_keys(a.iloc[0]))
    late = (g.window_start_utc >= START + pd.Timedelta(hours=27)).to_numpy()
    assert (x.loc[late, "z_pd"] == D.MISSING).all() and (x.loc[late, "present_pd"] == 0).all()
    assert "z_pd" in g and g.loc[late, "z_pd"].notna().any()                    # B1 frame itself unchanged
    p = D.predict_asset("M1", f, pd.DataFrame(columns=["asset_id"]), a, model=_stub_model("minute", [.1, .1, .8]))
    assert len(p) and p.suspected_channel.isna().all() and set(p.fault_type) == {"SENSOR_DRIFT"}
    assert p.evidence.str.contains("no uniquely supported channel").all()


def test_channel_removed_from_passport_is_masked_even_with_values():
    a = asset_meta(channels="motor_speed_rpm|motor_current_a|vibration_accel_rms_g")
    g = D.normalized_asset(minutes(), a)
    x = D.minute_features(g, D.installed_keys(a.iloc[0]))
    assert (x.z_pd == D.MISSING).all() and (x.ztrail_pd == D.MISSING).all() and (x.present_pd == 0).all()
    p = D.predict_asset("M1", minutes(), pd.DataFrame(columns=["asset_id"]), a,
                        model=_stub_model("minute", [.1, .1, .8]))
    assert p.suspected_channel.isna().all()


def test_trailing_feature_uses_only_past_observed_values():
    f, a = minutes(), asset_meta()
    f.loc[f.window_start_utc == START + pd.Timedelta(hours=28), "discharge_pressure_kpa__count"] = 0
    g = D.normalized_asset(f, a)
    x = D.minute_features(g, D.installed_keys(a.iloc[0]))
    j = int(np.flatnonzero((g.window_start_utc == START + pd.Timedelta(hours=28)).to_numpy())[0])
    want = g.z_pd.iloc[j - D.TRAIL + 1:j].mean()
    assert x.z_pd.iloc[j] == D.MISSING and x.ztrail_pd.iloc[j] == pytest.approx(want)


# --- review round 1: snapshot contract -------------------------------------------------------------------

@pytest.mark.parametrize("field,value,problem", [
    ("unit", "m/s2", "unit"), ("axis", "axial", "axis"), ("sample_rate_hz", 8000, "sample_rate"),
    ("rpm_at_capture", 0., "rpm"), ("n_samples", N - 1, "length"),
])
def test_snapshot_contract_violations_are_marked_and_unused(field, value, problem):
    bad = snap(START + pd.Timedelta(hours=26), "BAD")
    bad[field] = value
    table = D.snapshot_table(pd.DataFrame(reference_snaps() + [bad]), asset_meta().iloc[0])
    row = table[table.snapshot_id == "BAD"].iloc[0]
    assert row.problem == problem and not row.valid
    st = D.waveform_state(table, [START + pd.Timedelta(hours=27)], None, REF_END)
    assert st.wf_snapshot_id[0] == "S22" and st.wf_status[0] == "STALE"


def test_nonfinite_samples_bpfo_and_missing_capability_are_rejected():
    bad = snap(START + pd.Timedelta(hours=26), "NAN")
    bad["samples"] = bad["samples"].copy()
    bad["samples"][5] = np.nan
    t = D.snapshot_table(pd.DataFrame([bad]), asset_meta().iloc[0])
    assert t.problem[0] == "nonfinite"
    t = D.snapshot_table(pd.DataFrame(reference_snaps()), asset_meta().assign(bearing_bpfo_order=0.).iloc[0])
    assert set(t.problem) == {"bpfo_order"}
    no_acc = asset_meta(channels="motor_speed_rpm|discharge_pressure_kpa")
    t = D.snapshot_table(pd.DataFrame(reference_snaps()), no_acc.iloc[0])
    st = D.waveform_state(t, [START + pd.Timedelta(hours=27)], None, REF_END, capable=False)
    assert set(t.problem) == {"not_installed"} and st.wf_status[0] == "NOT_INSTALLED"


def test_reference_end_is_mandatory_and_missing_speed_is_unverified():
    table = D.snapshot_table(pd.DataFrame(reference_snaps() + [snap(START + pd.Timedelta(hours=26), "X")]),
                             asset_meta().iloc[0])
    with pytest.raises(ValueError):
        D.waveform_state(table, [START + pd.Timedelta(hours=27)], None, None)
    st = D.waveform_state(table, [START + pd.Timedelta(hours=27)] * 2, np.array([np.nan, 1500.]), REF_END)
    assert list(st.wf_speed_check) == ["UNVERIFIED", "MATCH"] and set(st.wf_status) == {"FRESH"}
    assert st.wf_reference_snapshots[0] == 6 and st.wf_complete_utc[0].startswith("2026-01-02T02:00:01")


# --- review round 1: waveform override scope -------------------------------------------------------------

def test_w1_is_machine_only_but_x1_may_override_any_non_protected_type():
    f, a = minutes(), asset_meta()        # lone discharge-pressure step -> B1 sensor diagnosis
    snaps = pd.DataFrame(reference_snaps() + [snap(START + pd.Timedelta(hours=h), f"B{h}", bpfo_impulses=.5)
                                              for h in (25, 27, 29)])
    b1 = D.predict_asset("B1", f, snaps, a)
    assert set(b1.event_class) == {"SENSOR"}
    w1 = D.predict_asset("W1", f, snaps, a)
    assert set(w1.diagnosis_source) == {"B1"}
    x1 = D.predict_asset("X1", f, snaps, a, model=None)
    assert set(x1.fault_type) == {"BEARING_WEAR"} and set(x1.diagnosis_source) == {"W1"}
    assert x1.evidence.str.contains("B1 rule said SENSOR").all() and x1.wf_complete_utc.notna().all()


# --- supervised fit isolation, labels and determinism ----------------------------------------------------

def _events(aid, **kw):
    e = {"asset_id": aid, "event_id": f"{aid}-E1", "fault_type": "DISCHARGE_RESTRICTION", "observable": True,
         "onset_utc": START + pd.Timedelta(hours=26), "detectable_utc": START + pd.Timedelta(hours=26),
         "end_utc": START + pd.Timedelta(hours=30), "w_start": START + pd.Timedelta(hours=20),
         "w_end": START + pd.Timedelta(hours=30)}
    e.update(kw)
    return e


def _fit_inputs(ids=("B", "C", "E")):
    frames, wfs, ev, meta = {}, {}, [], []
    for aid in ids:
        a = asset_meta().assign(asset_id=aid)
        f = minutes(aid=aid, steps=((26, 30, "discharge_pressure_kpa__mean", 80.), (34, 36, "motor_current_a__mean", 30.)))
        frames[aid] = D.normalized_asset(f, a)
        wfs[aid] = D.asset_waveform(frames[aid], pd.DataFrame(columns=["asset_id"]), a)
        ev.append(_events(aid))
        meta.append(a)
    return frames, wfs, pd.DataFrame(ev), pd.concat(meta, ignore_index=True)


def test_fit_refuses_held_out_frames_metadata_or_labels():
    frames, wfs, ev, meta = _fit_inputs()
    two = meta[meta.asset_id.isin(["B", "C"])]
    with pytest.raises(ValueError):
        D.fit_model("minute", frames, wfs, ev, ("B", "C"), two)
    with pytest.raises(ValueError):
        D.fit_model("minute", {k: frames[k] for k in ("B", "C")}, wfs, ev, ("B", "C"), two)
    with pytest.raises(ValueError):
        D.fit_model("minute", {k: frames[k] for k in ("B", "C")}, wfs, ev[ev.asset_id != "E"], ("B", "C"), meta)


def test_fit_is_event_balanced_support_limited_and_deterministic():
    frames, wfs, ev, meta = _fit_inputs()
    m1 = D.fit_model("fused", frames, wfs, ev, ("B", "C", "E"), meta, model_id="F1/test")
    m2 = D.fit_model("fused", frames, wfs, ev, ("B", "C", "E"), meta, model_id="F1/test")
    assert m1.classes == ("DISCHARGE_RESTRICTION", "NORMAL") and m1.estimator.max_depth == 6
    assert m1.support["DISCHARGE_RESTRICTION"] == {"groups": 3, "assets": 3}
    assert m1.support["NORMAL"] == {"groups": 3, "assets": 3}
    X = D.fused_features(D.minute_features(frames["B"], D.installed_keys(meta.iloc[0])), wfs["B"]).to_numpy()
    assert np.array_equal(m1.estimator.predict_proba(X), m2.estimator.predict_proba(X))
    single = D.fit_model("minute", {"B": frames["B"]}, wfs, ev[ev.asset_id == "B"], ("B",), meta[meta.asset_id == "B"])
    assert single.estimator is None and "DISCHARGE_RESTRICTION" in single.dropped_types   # 1 asset < support
    assert not hasattr(m1, "events") and "w_start" not in vars(m1)


def test_labels_use_physical_interval_and_scoring_buffer_is_excluded():
    frames, _, ev, meta = _fit_inputs(("B",))
    g, end = frames["B"], meta.window_end_utc.iloc[0]
    e = pd.DataFrame([_events("B", onset_utc=START + pd.Timedelta(hours=28))])   # physical starts at 28 h
    pos, lab, _ = D.training_rows(g, e, end)
    t = (g.window_start_utc + D.MINUTE).iloc[pos].reset_index(drop=True)
    ev_t = t[lab == "DISCHARGE_RESTRICTION"]
    assert len(ev_t) and ev_t.min() >= START + pd.Timedelta(hours=28)
    assert not ((t >= START + pd.Timedelta(hours=20)) & (t < START + pd.Timedelta(hours=28))).any()


def test_overlapping_and_unobservable_windows_are_excluded_from_training():
    frames, _, ev, meta = _fit_inputs(("B",))
    g, end = frames["B"], meta.window_end_utc.iloc[0]
    both = pd.concat([ev, ev.assign(event_id="B-E2", fault_type="IMPELLER_WEAR")])
    _, lab, _ = D.training_rows(g, both, end)
    assert set(lab) <= {D.NORMAL}
    pos, lab, _ = D.training_rows(g, ev.assign(observable=False), end)
    assert set(lab) <= {D.NORMAL}
    t = (g.window_start_utc + D.MINUTE).iloc[pos]
    assert not ((t >= START + pd.Timedelta(hours=20)) & (t <= START + pd.Timedelta(hours=30))).any()


def test_normal_episodes_separated_by_an_event_are_distinct_groups():
    a = asset_meta()
    f = minutes(steps=((25, 32, "motor_current_a__mean", 30.),))                 # one flag run across an event
    g = D.normalized_asset(f, a)
    e = pd.DataFrame([_events("A", fault_type="IMPELLER_WEAR", onset_utc=START + pd.Timedelta(hours=27),
                              detectable_utc=START + pd.Timedelta(hours=27), end_utc=START + pd.Timedelta(hours=29),
                              w_start=START + pd.Timedelta(hours=27), w_end=START + pd.Timedelta(hours=29))])
    _, lab, grp = D.training_rows(g, e, a.window_end_utc.iloc[0])
    normals = {x for x, l in zip(grp, lab) if l == D.NORMAL}
    assert len(normals) == 2 and "IMPELLER_WEAR" in set(lab)


# --- runner gate ----------------------------------------------------------------------------------------

def test_runner_refuses_without_seal_before_any_read(monkeypatch, tmp_path):
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
    import run_diagnosis_fusion as R
    def forbidden(*args, **kwargs):
        raise AssertionError("data read attempted")
    monkeypatch.setattr(pd, "read_parquet", forbidden)
    monkeypatch.setattr(pd, "read_csv", forbidden)
    monkeypatch.setattr(R, "SEAL", tmp_path / "SEAL.json")
    monkeypatch.setattr(R, "OUT", tmp_path)
    monkeypatch.setattr(R, "seed_pinned", lambda: True)
    with pytest.raises(SystemExit, match="no data accessed"):
        R.train()
    assert not list(tmp_path.iterdir())


def test_gate_rule_matches_the_registered_success_gate():
    import run_diagnosis_fusion as R
    base = {"detected": 18, "class_correct": 14, "false_plus_excess": 6, "sensor_type_and_channel": 3}
    assert R.gate_passes({**base, "type_correct": 10})
    assert not R.gate_passes({**base, "type_correct": 9})
    assert R.gate_passes({**base, "type_correct": 9, "sensor_type_and_channel": 4})
    assert not R.gate_passes({**base, "type_correct": 12, "false_plus_excess": 7})


# --- review round 1 (08:21): provenance causality and fit-frame identity --------------------------------

def test_reference_count_is_causal_and_early_gateway_alert_replays_exactly():
    f, a = minutes(), asset_meta()
    f = f[(f.window_start_utc < START + pd.Timedelta(hours=5)) | (f.window_start_utc >= START + pd.Timedelta(hours=6))]
    snaps = pd.DataFrame(reference_snaps())
    full = D.predict_asset("X1", f, snaps, a, model=None)
    early = full[full.b1_fault_type == "COMMUNICATION_LOSS"].iloc[0]
    t = pd.Timestamp(early.alert_time_utc)
    assert t < REF_END and early.wf_reference_snapshots == 1                 # only S02 completed by ~05:15
    for cut in (t, t + pd.Timedelta(seconds=30)):
        got = D.predict_asset("X1", f, snaps, a, model=None, as_of=cut)
        want = full[pd.to_datetime(full.alert_time_utc, utc=True) <= cut]
        pd.testing.assert_frame_equal(got.reset_index(drop=True), want.reset_index(drop=True), check_dtype=False)


def test_not_installed_comes_from_passport_not_snapshot_rows():
    a = asset_meta(channels="motor_speed_rpm|discharge_pressure_kpa")
    g = D.normalized_asset(minutes(), a)
    st = D.asset_waveform(g, pd.DataFrame(columns=["asset_id"]), a)
    assert set(st.wf_status) == {"NOT_INSTALLED"}


def test_snapshot_ending_exactly_at_cut_is_available():
    table = D.snapshot_table(pd.DataFrame(reference_snaps() + [snap(START + pd.Timedelta(hours=26), "X")]),
                             asset_meta().iloc[0])
    st = D.waveform_state(table, [START + pd.Timedelta(hours=26, seconds=1)], None, REF_END)
    assert st.wf_snapshot_id[0] == "X" and st.wf_age_s[0] == 0


def test_fit_rejects_mis_keyed_frames_and_misaligned_waveform_maps():
    frames, wfs, ev, meta = _fit_inputs()
    swapped = {**frames, "B": frames["C"]}
    with pytest.raises(ValueError, match="contains rows"):
        D.fit_model("minute", swapped, wfs, ev, ("B", "C", "E"), meta)
    with pytest.raises(ValueError, match="waveform map"):
        D.fit_model("fused", frames, {**wfs, "Z": wfs["B"]}, ev, ("B", "C", "E"), meta)
    with pytest.raises(ValueError, match="align"):
        D.fit_model("fused", frames, {**wfs, "B": wfs["B"].iloc[:-1]}, ev, ("B", "C", "E"), meta)
