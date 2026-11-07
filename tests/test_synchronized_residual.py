"""Task013 phase-1 contracts on synthetic 1 Hz fixtures only (no benchmark telemetry, labels or scoring)."""
import inspect
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from retrofit_sim import baselines as B
from retrofit_doctor import diagnosis_fusion as D
from retrofit_doctor import hydraulic_spread as H
from retrofit_doctor import synchronized_residual as S

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from test_diagnosis_fusion import START, snap
from run_diagnosis_fusion import canonical

QB, HB, H0, NR, N3 = 100., 30., 40., 1500., 3.
N_RUN, Q_RUN, PS_RUN = 1425., 90., 100.
K = 9.80665
CHANNELS = ("flow_m3_h|suction_pressure_kpa|discharge_pressure_kpa|motor_speed_rpm|fluid_temp_c|"
            "vibration_accel_rms_g")
HOURS, W0, W1_ = 40, 26, 30
REF_END = START + pd.Timedelta(hours=24)


def meta(channels=CHANNELS):
    return pd.DataFrame([{"asset_id": "A", "split": "train", "motor_rated_rpm": NR, "bearing_bpfo_order": 3.6,
                          "channels_available": channels, "fluid": "Seawater", "pump_rated_flow_m3_h": QB,
                          "pump_rated_head_m": HB, "pump_shutoff_head_m": H0, "npsh3_at_bep_m": N3,
                          "window_start_utc": START.isoformat(),
                          "window_end_utc": (START + pd.Timedelta(hours=HOURS)).isoformat()}])


def rise(Q, n):
    return K * (H0 * (n / NR) ** 2 - (H0 - HB) * (Q / QB) ** 2)


def raw_series(kind=None, seed=0, offset=0.):
    """1 Hz raw rows; inside [26 h, 30 h) apply `kind`. Base: consistent pump with small independent noise."""
    rng = np.random.default_rng(seed)
    n_rows = HOURS * 3600
    t = pd.date_range(START, periods=n_rows, freq="s")
    sec = np.arange(n_rows)
    win = (sec >= W0 * 3600) & (sec < W1_ * 3600)
    speed = N_RUN + 3 * np.sin(2 * np.pi * sec / 1800)
    if kind == "synchronized":
        speed = speed + np.where(win, 30 * np.sin(2 * np.pi * sec / 20), 0.)
    Q = Q_RUN * speed / N_RUN
    Ps = np.full(n_rows, PS_RUN)
    Pd = Ps + rise(Q, speed)
    noise = {"q": .1, "ps": .3, "pd": .3, "n": .5}
    Qm = Q + noise["q"] * rng.standard_normal(n_rows)
    Psm = Ps + noise["ps"] * rng.standard_normal(n_rows)
    Pdm = Pd + noise["pd"] * rng.standard_normal(n_rows)
    nm = speed + noise["n"] * rng.standard_normal(n_rows)
    extra = rng.standard_normal(n_rows)
    if kind == "q":
        Qm = Qm + np.where(win, 10 * extra, 0.)
    elif kind == "pd":
        Pdm = Pdm + np.where(win, 20 * extra, 0.)
    elif kind == "ps":
        Psm = Psm + np.where(win, 20 * extra, 0.)
    elif kind == "n":
        nm = nm + np.where(win, 40 * extra, 0.)
    elif kind == "two":
        aQ = H.derivatives(Q_RUN, N_RUN, QB, HB, H0, NR)[0]
        Qm = Qm + np.where(win, 10 * extra, 0.)
        Pdm = Pdm + np.where(win, 10 * aQ * rng.standard_normal(n_rows), 0.)
    elif kind == "cancel":                     # pressure partially mirrors flow-sensor noise (strong cancellation)
        aQ = H.derivatives(Q_RUN, N_RUN, QB, HB, H0, NR)[0]
        Qm = Qm + np.where(win, 10 * extra, 0.)
        Pdm = Pdm + np.where(win, -.6 * aQ * 10 * extra, 0.)
    elif kind == "offset":
        Pdm = Pdm + np.where(win, offset, 0.)
    return pd.DataFrame({"timestamp_utc": t, "operating_mode": "RUNNING", "sample_interval_s": 1,
                         "flow_m3_h": Qm, "suction_pressure_kpa": Psm, "discharge_pressure_kpa": Pdm,
                         "motor_speed_rpm": nm, "fluid_temp_c": 20. + .05 * rng.standard_normal(n_rows)})


def features_from_raw(raw):
    r = raw.copy()
    r["window_start_utc"] = pd.to_datetime(r.timestamp_utc, utc=True).dt.floor("min")
    g = r.groupby("window_start_utc", sort=True)
    f = pd.DataFrame({"rows": g.size(), "running_fraction": 1.}).reset_index()
    f["asset_id"], f["operating_mode"] = "A", "RUNNING"
    for c in ("flow_m3_h", "suction_pressure_kpa", "discharge_pressure_kpa", "motor_speed_rpm", "fluid_temp_c"):
        agg = g[c].agg(["mean", "std", "min", "max", "count"]).reset_index(drop=True)
        for s in agg.columns:
            f[f"{c}__{s}"] = agg[s].to_numpy()
    return f


_CACHE = {}


def case(kind=None, **kw):
    key = (kind, tuple(sorted(kw.items())))
    if key not in _CACHE:
        raw = raw_series(kind, **kw)
        _CACHE[key] = (raw, features_from_raw(raw))
    raw, feat = _CACHE[key]
    return raw.copy(), feat.copy()


def run(c, raw, feat, a=None, snaps=None, as_of=None):
    a = meta() if a is None else a
    return S.predict_asset(c, feat, raw, pd.DataFrame(columns=["asset_id"]) if snaps is None else snaps, a, as_of=as_of)


def det(p, i=0):
    return json.loads(p.rule_detail.iloc[i])


# --- equation, units, identity, boundaries ------------------------------------------------------------

def test_residual_equation_in_kpa_is_zero_on_the_curve_and_tracks_offsets():
    p = H._passport(meta().iloc[0])
    X, E = S.terms([QB], [100.], [100. + K * HB], [NR], p)
    assert E[0] == pytest.approx(0., abs=1e-9)
    assert X["q"][0] + X["n"][0] == pytest.approx(-K * HB)
    _, E2 = S.terms([QB], [100.], [100. + K * HB + 7.], [NR], p)
    assert E2[0] == pytest.approx(7.)


def test_covariance_shares_sum_to_one_on_paired_rows():
    raw, _ = case("two")
    t = S.residual_table(raw[(raw.timestamp_utc >= START + pd.Timedelta(hours=27))
                             & (raw.timestamp_utc < START + pd.Timedelta(hours=27, minutes=3))], meta().iloc[0])
    for _, m in t.iterrows():
        assert sum(m[f"cov_E_{k}"] for k in S.TERMS) / m.var_E == pytest.approx(1., abs=1e-9)
        assert m.std_E ** 2 == pytest.approx(m.var_E)


def test_row_exactly_at_minute_end_belongs_to_next_minute_and_open_minute_is_dropped():
    raw, _ = case()
    t0 = START + pd.Timedelta(hours=25)
    sub = raw[(raw.timestamp_utc >= t0) & (raw.timestamp_utc <= t0 + pd.Timedelta(minutes=1))]
    t = S.residual_table(sub, meta().iloc[0], as_of=t0 + pd.Timedelta(minutes=1))
    assert list(t.minute_start) == [t0] and t.rows_total.iloc[0] == 60
    t2 = S.residual_table(sub, meta().iloc[0], as_of=t0 + pd.Timedelta(seconds=30))
    assert t2.empty


@pytest.mark.parametrize("mutate,reason", [
    ("dup", "duplicate_timestamps"), ("offgrid", "off_grid_timestamp"), ("interval", "sample_interval_not_1s")])
def test_invalid_raw_minutes_are_rejected_explicitly(mutate, reason):
    raw, _ = case()
    t0 = START + pd.Timedelta(hours=25)
    sub = raw[(raw.timestamp_utc >= t0) & (raw.timestamp_utc < t0 + pd.Timedelta(minutes=2))].reset_index(drop=True)
    if mutate == "dup":
        sub = pd.concat([sub, sub.iloc[[5]]], ignore_index=True)
    elif mutate == "offgrid":
        sub.loc[5, "timestamp_utc"] = sub.timestamp_utc[5] + pd.Timedelta(milliseconds=500)
    else:
        sub.loc[5, "sample_interval_s"] = 10
    t = S.residual_table(sub, meta().iloc[0])
    assert t.invalid_reason.iloc[0] == reason and t.paired.iloc[0] == 0 and np.isnan(t.std_E.iloc[0])
    assert t.invalid_reason.iloc[1] is None and t.paired.iloc[1] == 60


def test_missing_or_unparseable_timestamps_are_rejected_explicitly():
    raw, _ = case()
    sub = raw.iloc[:120].copy()
    sub["timestamp_utc"] = sub.timestamp_utc.astype(object)
    sub.loc[7, "timestamp_utc"] = None
    with pytest.raises(ValueError, match="missing/unparseable"):
        S.residual_table(sub, meta().iloc[0])
    sub.loc[7, "timestamp_utc"] = "not a time"
    with pytest.raises(ValueError, match="missing/unparseable"):
        S.residual_table(sub, meta().iloc[0])


def test_partition_loader_reads_only_its_asset_and_restores_asset_id(tmp_path):
    raw, _ = case()
    root = tmp_path / "telemetry"
    for aid, rows in (("PUMP-01", raw.iloc[:7200]), ("PUMP-09", raw.iloc[:10])):
        for day, part in rows.groupby(pd.to_datetime(rows.timestamp_utc).dt.date):
            d = root / f"asset_id={aid}" / f"day={day}"
            d.mkdir(parents=True)
            part.to_parquet(d / "part-0.parquet", index=False)
    got = S.read_asset_partition(root, "PUMP-01", START, START + pd.Timedelta(hours=HOURS))
    assert len(got) == 7200 and list(got.columns) == S.RAW_COLUMNS
    a = meta().assign(asset_id="PUMP-01")
    rawd, caps = S.load_train_raw(tmp_path, a)
    assert list(rawd) == ["PUMP-01"] and caps == {"PUMP-01": None} and len(rawd["PUMP-01"]) == 7200
    with pytest.raises(RuntimeError, match="outside the asset window"):
        S.read_asset_partition(root, "PUMP-01", START + pd.Timedelta(hours=1), START + pd.Timedelta(hours=HOURS))
    bad = root / "asset_id=PUMP-02" / "day=x"
    bad.mkdir(parents=True)
    raw.iloc[:5].assign(timestamp_utc=[None, *raw.timestamp_utc.iloc[1:5].astype(str)]).to_parquet(
        bad / "part-0.parquet", index=False)
    with pytest.raises(ValueError, match="missing/unparseable"):
        S.read_asset_partition(root, "PUMP-02", START, START + pd.Timedelta(hours=HOURS))
    with pytest.raises(FileNotFoundError):
        S.read_asset_partition(root, "PUMP-03", START, START + pd.Timedelta(hours=HOURS))


def test_pairing_drops_non_running_missing_and_nonpositive_rows_without_filling():
    raw, _ = case()
    t0 = START + pd.Timedelta(hours=25)
    sub = raw[(raw.timestamp_utc >= t0) & (raw.timestamp_utc < t0 + pd.Timedelta(minutes=1))].reset_index(drop=True)
    sub.loc[0, "operating_mode"] = "STOPPING"
    sub.loc[1, "flow_m3_h"] = np.nan
    sub.loc[2, "motor_speed_rpm"] = 0.
    sub.loc[3, "flow_m3_h"] = -1.
    t = S.residual_table(sub, meta().iloc[0])
    assert t.rows_total.iloc[0] == 60 and t.rows_running.iloc[0] == 59 and t.paired.iloc[0] == 56


# --- rule outcomes --------------------------------------------------------------------------------------

@pytest.mark.parametrize("kind,channel", [("q", "flow_m3_h"), ("pd", "discharge_pressure_kpa"),
                                          ("ps", "suction_pressure_kpa")])
def test_independent_noise_is_localized_to_its_channel(kind, channel):
    raw, feat = case(kind)
    p = run("R3", raw, feat)
    assert len(p) and set(p.fault_type) == {"SENSOR_NOISE_SPIKES"} and set(p.suspected_channel) == {channel}
    d = det(p)
    assert d["outcome"] == "emitted" and d["contributions"][dict(zip(S.RAW.values(), S.RAW))[channel]] >= .75
    assert abs(d["contribution_sum"] - 1) <= 1e-6 and d["applicability"]["passed"]
    cov, var_e = d["covariances_kpa2"], d["minute"]["var_E_kpa2"]
    assert sum(cov.values()) == pytest.approx(var_e, rel=1e-6)          # native kPa^2 terms reproduce the shares
    assert all(d["contributions"][t] == pytest.approx(cov[t] / var_e, rel=1e-6, abs=1e-9) for t in S.TERMS)
    ev = p.evidence.iloc[0]
    assert "not causal probabilities" in ev and "anomaly score" in ev and "paired 1 Hz rows" in ev and "kPa" in ev


def test_synchronized_control_motion_cancels_and_is_not_noise():
    raw, feat = case("synchronized")
    p = run("R3", raw, feat)
    assert len(p) and "SENSOR_NOISE_SPIKES" not in set(p.fault_type)
    reasons = {det(p, i).get("reason") for i in range(len(p))}
    assert reasons & {"residual_not_excessive"} or all(r and r.startswith("applicability") for r in reasons)


def test_speed_noise_abstains_as_unsupported_source():
    raw, feat = case("n")
    p = run("R3", raw, feat)
    assert "SENSOR_NOISE_SPIKES" not in set(p.fault_type)
    assert "dominant_speed_not_a_supported_sensor_source" in {det(p, i).get("reason") for i in range(len(p))}


@pytest.mark.parametrize("kind,reason", [("two", "no_unique_dominant_term"), ("cancel", "strong_cancellation")])
def test_two_source_and_cancellation_abstain(kind, reason):
    raw, feat = case(kind)
    p = run("R3", raw, feat)
    assert "SENSOR_NOISE_SPIKES" not in set(p.fault_type)
    assert reason in {det(p, i).get("reason") for i in range(len(p))}


def test_constant_calibration_offset_changes_mean_not_spread_and_does_not_fire():
    raw, feat = case("offset", offset=15.)
    p, b1 = run("R3", raw, feat), run("B1", raw, feat)
    assert len(p) and "SENSOR_NOISE_SPIKES" not in set(p.fault_type)
    pd.testing.assert_frame_equal(p[B._COLS], b1[B._COLS])
    d = [det(p, i) for i in range(len(p))]
    assert any(x.get("reason") == "residual_not_excessive" and abs(x["minute"]["mean_E_kpa"]) > 10 for x in d)


def test_r5_is_stricter_than_r3():
    raw, feat = case("q")
    g = D.normalized_asset(feat, meta())
    rt = S.residual_table(raw, meta().iloc[0])
    ref = S.residual_reference(rt, g, REF_END)
    j = int(np.flatnonzero((g.window_start_utc == START + pd.Timedelta(hours=27)).to_numpy())[0])
    ratio = rt[rt.minute_start == g.window_start_utc[j]].std_E.iloc[0] / ref["reference_std_kpa"]
    for f, fires in ((ratio - 1e-9, True), (ratio, False)):
        d = S.residual_decision(g, j, meta().iloc[0], D.installed_keys(meta().iloc[0]), f, rt, ref, "UNKNOWN")
        assert (d["outcome"] == "emitted") is fires


# --- guards -----------------------------------------------------------------------------------------------

def _alert_minute(raw, feat):
    b1 = run("B1", raw, feat)
    return pd.Timestamp(b1.alert_time_utc.iloc[0]) - D.MINUTE


@pytest.mark.parametrize("mutate,reason", [
    ("missing", "raw_minute_unavailable"), ("count29", "raw_paired_count_below_30"),
    ("dup", "raw_invalid:duplicate_timestamps"), ("noref", "residual_reference_unsupported")])
def test_raw_guards_fall_back_with_explicit_reason(mutate, reason):
    raw, feat = case("q")
    m = _alert_minute(raw, feat)
    inm = (raw.timestamp_utc >= m) & (raw.timestamp_utc < m + D.MINUTE)
    if mutate == "missing":
        raw = raw[~inm]
    elif mutate == "count29":
        raw.loc[inm & (raw.timestamp_utc >= m + pd.Timedelta(seconds=29)), "flow_m3_h"] = np.nan
    elif mutate == "dup":
        raw = pd.concat([raw, raw[inm].iloc[[3]]], ignore_index=True)
    else:
        raw = raw[raw.timestamp_utc >= START + pd.Timedelta(hours=23, minutes=30)]   # < 60 reference minutes
    p, b1 = run("R3", raw, feat), run("B1", raw, feat)
    d = det(p)
    assert d["reason"] == reason and d["outcome"] == "unsupported"
    pd.testing.assert_frame_equal(p.iloc[[0]][B._COLS], b1.iloc[[0]][B._COLS])


def test_applicability_failure_is_recorded_separately_and_falls_back():
    raw, feat = case("q")
    a = meta().assign(fluid="Lube oil")
    p = run("R3", raw, feat, a)
    d = det(p)
    assert d["reason"] == "applicability:fluid_not_water_like" and not d["applicability"]["passed"]
    assert "SENSOR_NOISE_SPIKES" not in set(p.fault_type)


def test_capability_and_train_only_loader(tmp_path):
    assert S.capability(meta().iloc[0]) is None
    assert S.capability(meta(channels="flow_m3_h|motor_speed_rpm").iloc[0]).startswith("channels_not_installed")
    with pytest.raises(PermissionError):
        S.load_train_raw(tmp_path, meta().assign(asset_id="PUMP-10", split="test"))
    raw, caps = S.load_train_raw(tmp_path, meta(channels="flow_m3_h").assign(asset_id="PUMP-01"))
    assert raw == {} and caps["PUMP-01"].startswith("channels_not_installed")


def test_reference_is_not_exposed_before_completion():
    raw, feat = case("q")
    g = D.normalized_asset(feat, meta(), REF_END - pd.Timedelta(minutes=1))
    rt = S.residual_table(raw, meta().iloc[0], REF_END - pd.Timedelta(minutes=1))
    out = S.diagnose_asset("R3", g, None, meta().iloc[0], D.installed_keys(meta().iloc[0]), rt)
    assert out.empty or all(json.loads(x).get("reference", {}).get("reference_std_kpa") is None
                            for x in out.rule_detail if isinstance(x, str))
    with pytest.raises(ValueError):
        S.diagnose_asset("R3", g, None, meta().iloc[0], D.installed_keys(meta().iloc[0]), S.residual_table(raw, meta().iloc[0]))


def test_early_nonprotected_alert_exposes_no_future_reference_in_full_or_prefix_replay():
    raw, feat = case("q")
    early = (feat.window_start_utc >= START + pd.Timedelta(hours=5)) & (feat.window_start_utc < START + pd.Timedelta(hours=5, minutes=20))
    feat.loc[early, "motor_speed_rpm__std"] = 0.        # flatline on a non-stuck channel -> B1 UNKNOWN before 24 h
    full = run("R3", raw, feat)
    pre = full[pd.to_datetime(full.alert_time_utc, utc=True) < REF_END]
    assert len(pre) and (pre.b1_fault_type == "UNKNOWN").all()
    d = json.loads(pre.rule_detail.iloc[0])
    assert d["reference"]["reference_std_kpa"] is None and d["reference"]["status"] == "incomplete"
    assert d["reason"] == "applicability:reference_incomplete"
    t = pd.Timestamp(pre.alert_time_utc.iloc[0])
    mr = mutate_raw_future(raw, t)
    for r in (raw, mr):
        got = run("R3", r, feat, as_of=t)                  # None/NaN-normalized comparison of every column
        assert canonical(got).equals(canonical(pre.iloc[[0]]))


def test_protected_quality_causes_unchanged():
    raw, feat = case("q")
    gap = (feat.window_start_utc >= START + pd.Timedelta(hours=33)) & (feat.window_start_utc < START + pd.Timedelta(hours=34))
    feat = feat[~gap]
    for c in ("R3", "Y3"):
        p = run(c, raw, feat)
        gw = p[p.b1_fault_type == "COMMUNICATION_LOSS"]
        assert len(gw) and set(gw.fault_type) == {"COMMUNICATION_LOSS"} and det(gw)["outcome"] == "not_evaluated_protected"


# --- Y3 / Y5 UNKNOWN-only waveform ------------------------------------------------------------------------

def _snaps():
    return pd.DataFrame([snap(START + pd.Timedelta(hours=h), f"S{h:02d}", rpm=N_RUN, seed=h) for h in (2, 6, 10, 14, 18, 22)]
                        + [snap(START + pd.Timedelta(hours=h), f"B{h}", rpm=N_RUN, bpfo_impulses=.5) for h in (25, 27, 29)])


def test_y3_residual_first_then_unknown_only_waveform():
    raw, feat = case("q")
    assert set(run("Y3", raw, feat, snaps=_snaps()).fault_type) == {"SENSOR_NOISE_SPIKES"}
    raw, feat = case("synchronized")
    b1, y3 = run("B1", raw, feat), run("Y3", raw, feat, snaps=_snaps())
    assert (b1.fault_type == "UNKNOWN").any()
    for i in range(len(b1)):
        if b1.fault_type.iloc[i] == "UNKNOWN":
            assert y3.fault_type.iloc[i] == "BEARING_WEAR" and det(y3, i)["emitted_source"] == "W1"
        else:
            assert y3.fault_type.iloc[i] == b1.fault_type.iloc[i]
    for c in ("R3", "R5"):
        assert "W1" not in set(run(c, raw, feat, snaps=_snaps()).diagnosis_source)


def test_y3_keeps_specific_b1_cause():
    raw, feat = case("offset", offset=15.)             # lone pd level shift -> specific B1 sensor cause
    b1, y3 = run("B1", raw, feat), run("Y3", raw, feat, snaps=_snaps())
    assert "UNKNOWN" not in set(b1.fault_type)
    pd.testing.assert_frame_equal(y3[B._COLS], b1[B._COLS])


# --- causality -----------------------------------------------------------------------------------------

def mutate_raw_future(raw, cut):
    r = raw.copy()
    late = pd.to_datetime(r.timestamp_utc, utc=True) >= cut
    for c in S.RAW.values():
        r.loc[late, c] = r.loc[late, c] * 3 + 50
    return r


def test_raw_table_prefix_and_future_mutation_match_full_closed_minutes():
    raw, _ = case("q")
    full = S.residual_table(raw, meta().iloc[0])
    alert = START + pd.Timedelta(hours=26, minutes=15)
    for cut in [REF_END + pd.Timedelta(seconds=s) for s in (-1, 0, 1)] + [alert, alert + pd.Timedelta(seconds=30)]:
        want = full[full.minute_end <= cut].reset_index(drop=True)
        for r in (raw[raw.timestamp_utc < cut], mutate_raw_future(raw, cut)):
            pd.testing.assert_frame_equal(S.residual_table(r, meta().iloc[0], cut), want)


def test_prediction_prefix_and_future_mutation_of_raw_features_counts_and_snapshots():
    raw, feat = case("q")
    snaps = _snaps()
    full = {c: run(c, raw, feat, snaps=snaps) for c in S.CANDIDATES}
    alerts = sorted(set(pd.to_datetime(full["B1"].alert_time_utc, utc=True)))[:3]
    cuts = alerts + [REF_END + pd.Timedelta(seconds=s) for s in (-1, 0, 1, 60)]
    cuts += [START + pd.Timedelta(hours=27, seconds=s) for s in (0, 1, 30)]
    for cut in cuts:
        mf = feat.copy()
        late = mf.window_start_utc + D.MINUTE > cut
        num = [c for c in mf.columns if c.endswith(("__mean", "__std", "__min", "__max"))]
        mf.loc[late, num] = mf.loc[late, num] * 7 + 3
        mf.loc[late, [c for c in mf.columns if c.endswith("__count")]] = 0
        ms = snaps.copy()
        ms["samples"] = [np.full(len(x), 9., dtype="float32") if t + pd.Timedelta(seconds=1) > cut else x
                         for t, x in zip(ms.timestamp_utc, ms.samples)]
        mr = mutate_raw_future(raw, cut)
        for c, want in full.items():
            keep = want[pd.to_datetime(want.alert_time_utc, utc=True) <= cut].reset_index(drop=True)
            for args in ((raw, feat, snaps), (mr, mf, ms)):
                got = run(c, args[0], args[1], snaps=args[2], as_of=cut).reset_index(drop=True)
                pd.testing.assert_frame_equal(got, keep, check_dtype=False)


def test_cached_table_equals_on_demand_and_interface_has_no_labels():
    raw, feat = case("q")
    rt = S.residual_table(raw, meta().iloc[0])
    cut = START + pd.Timedelta(hours=27, seconds=30)
    a = S.predict_asset("R3", feat, raw, pd.DataFrame(), meta(), as_of=cut)
    b = S.predict_asset("R3", feat, None, pd.DataFrame(), meta(), as_of=cut, rtable=rt)
    pd.testing.assert_frame_equal(a, b)
    for fn in (S.diagnose_asset, S.predict_asset, S.residual_decision, S.residual_table):
        assert not set(inspect.signature(fn).parameters) & {"events", "labels", "sensor_tag"}
    b1 = run("B1", raw, feat)
    for c in S.CANDIDATES:
        p = run(c, raw, feat, snaps=_snaps())
        assert sorted(zip(p.asset_id, p.alert_time_utc)) == sorted(zip(b1.asset_id, b1.alert_time_utc))


# --- runner -----------------------------------------------------------------------------------------------

def test_runner_pipeline_audits_and_coverage_on_fixture(monkeypatch):
    import run_synchronized_residual as R
    raw, feat = case("q")
    gap = (feat.window_start_utc >= START + pd.Timedelta(hours=5)) & (feat.window_start_utc < START + pd.Timedelta(hours=6))
    feat = feat[~gap]
    a, snaps = meta(), _snaps()
    rawd, caps = {"A": raw}, {"A": None}
    tables, rtables, preds = R.pipeline(a, feat, rawd, snaps)
    assert set(preds) == set(S.CANDIDATES)
    main = R.causality_audit(a, feat, snaps, tables, rtables, preds)
    assert main["pass"].all() and set(main.candidate) == set(S.CANDIDATES)
    rawa = R.raw_audit(a, rawd, rtables, preds)
    assert len(rawa) and rawa["pass"].all() and {"reference_boundary", "alert_boundary", "sub_minute"} <= set(rawa.cut_kind)
    cov = R.coverage(preds)
    assert "emitted" in set(cov.outcome) and set(cov.candidate) == set(S.CANDIDATES) - {"B1"}
    prov = R.raw_provenance(rawd, caps)
    assert prov["A"]["rows"] == len(raw) and len(prov["A"]["sha256"]) == 64


def test_runner_selection_order():
    import run_synchronized_residual as R
    assert list(R.SIMPLICITY) == ["R3", "R5", "E995", "Y3", "Y5", "Z995"]
    base = {"gate_pass": True, "correctness_pass": True, "useful_diagnoses": 10, "type_correct": 10,
            "false_plus_excess": 5}
    comp = pd.DataFrame([{"candidate": c, **base} for c in ("B1", "Z995", "Y3", "E995", "R5")])
    assert R.select(comp) == "R5"
    assert R.select(comp[comp.candidate != "R5"]) == "E995"
    comp.loc[comp.candidate == "Z995", "useful_diagnoses"] = 11
    assert R.select(comp) == "Z995"
    assert R.select(comp.assign(gate_pass=False)) is None


@pytest.mark.parametrize("case_", ["no_seal", "wrong_manifest", "code_changed", "completed", "seed"])
def test_runner_refuses_before_any_read(monkeypatch, tmp_path, case_):
    import run_synchronized_residual as R
    def forbidden(*a, **k):
        raise AssertionError("data read attempted")
    monkeypatch.setattr(pd, "read_parquet", forbidden)
    monkeypatch.setattr(pd, "read_csv", forbidden)
    code = tmp_path / "code.py"
    code.write_text("x = 1\n")
    man = tmp_path / "manifest.json"
    man.write_text(json.dumps({"code_sha256": {str(code): R.sha256(code)}}))
    seal = tmp_path / "SEAL.json"
    if case_ != "no_seal":
        seal.write_text(json.dumps({"manifest_sha256": "0" * 64 if case_ == "wrong_manifest" else R.sha256(man)}))
    if case_ == "code_changed":
        code.write_text("x = 2\n")
    if case_ == "completed":
        (tmp_path / "COMPLETED.json").write_text("{}")
    for name, val in (("ROOT", Path("/")), ("MANIFEST", man), ("SEAL", seal), ("OUT", tmp_path / "out"),
                      ("COMPLETED", tmp_path / "COMPLETED.json"), ("seed_pinned", lambda: case_ != "seed")):
        monkeypatch.setattr(R, name, val)
    with pytest.raises(SystemExit, match="no data accessed"):
        R.train()
    assert not (tmp_path / "out").exists()


# --- amendment: E995 / Z995 empirical first-day tail rank ------------------------------------------------

def _alert_ctx(kind="q"):
    raw, feat = case(kind)
    g = D.normalized_asset(feat, meta())
    rt = S.residual_table(raw, meta().iloc[0])
    j = int(D.b1_alert_rows(g).row.iloc[0])
    cur = float(rt[rt.minute_start == g.window_start_utc[j]].std_E.iloc[0])
    return g, rt, j, cur


def _decide(g, rt, j, values):
    vals = np.sort(np.asarray(values, "float64"))
    ref = {"reference_std_kpa": float(np.median(vals)), "minutes": len(vals), "median_raw": float(np.median(vals)),
           "_values": vals}
    return S.residual_decision(g, j, meta().iloc[0], D.installed_keys(meta().iloc[0]), None, rt, ref, "UNKNOWN", .005)


@pytest.mark.parametrize("n,b,outcome,reason", [
    (198, 0, "unsupported", "residual_reference_unsupported"),
    (199, 0, "emitted", None),                                   # rank 1/200 = 0.005
    (199, 1, "abstained", "residual_not_in_empirical_tail"),     # one tie counts against: rank 0.01
    (999, 4, "emitted", None),                                   # 5/1000
    (999, 5, "abstained", "residual_not_in_empirical_tail"),     # 6/1000
])
def test_tail_rank_resolution_ties_and_known_counts(n, b, outcome, reason):
    g, rt, j, cur = _alert_ctx()
    vals = np.r_[np.linspace(.1, .5, n - b), np.full(b, cur)]     # b values exactly equal (ties) to current
    d = _decide(g, rt, j, vals)
    assert d["outcome"] == outcome and d.get("reason") == reason
    if n >= 199:
        assert d["tail"]["N"] == n and d["tail"]["b"] == b and d["tail"]["tail_rank"] == pytest.approx((1 + b) / (n + 1))
        assert d["tail"]["limit"] == .005 and d["tail"]["reference_median_kpa"] > 0
    assert "_values" not in d["reference"]


def test_tail_rank_helper():
    assert S.tail_rank([1., 2., 3.], 2.) == (2, .75)
    assert S.tail_rank([1., 2., 3.], 3.5) == (0, .25)


def test_e995_fires_on_localized_noise_and_not_on_stable_spread():
    raw, feat = case("q")
    p = run("E995", raw, feat)
    assert set(p.fault_type) == {"SENSOR_NOISE_SPIKES"} and set(p.suspected_channel) == {"flow_m3_h"}
    d = det(p)
    assert d["tail"]["N"] >= 199 and d["tail"]["b"] == 0 and "excess_ratio" not in d
    ev = p.evidence.iloc[0]
    assert "empirical upper-tail rank" in ev and "not a fault probability" in ev and "N=" in ev
    raw, feat = case("offset", offset=15.)                      # spread unchanged -> rank far above the limit
    p = run("E995", raw, feat)
    assert "SENSOR_NOISE_SPIKES" not in set(p.fault_type)
    assert any(det(p, i).get("reason") == "residual_not_in_empirical_tail" for i in range(len(p)))


def test_reference_filters_invalid_low_count_nonfinite_and_unsteady_minutes():
    raw, feat = case()
    g = D.normalized_asset(feat, meta())
    rt = S.residual_table(raw, meta().iloc[0])
    base = S.residual_reference(rt, g, REF_END)
    ok = dict(zip(g.window_start_utc, g.steady & ~g.gap))
    eligible = rt[(rt.minute_end <= REF_END).to_numpy() & np.array([bool(ok.get(m, False)) for m in rt.minute_start])]
    assert base["minutes"] == len(eligible) >= 199 and len(base["_values"]) == base["minutes"]
    bad = rt.copy()
    idx = eligible.index[:4]
    bad.loc[idx[0], "std_E"] = np.nan
    bad.loc[idx[1], "paired"] = 29
    bad.loc[idx[2], "invalid_reason"] = "duplicate_timestamps"
    g2 = g.copy()
    g2.loc[g2.window_start_utc == bad.minute_start[idx[3]], "steady"] = False
    assert S.residual_reference(bad, g2, REF_END)["minutes"] == base["minutes"] - 4


def test_z995_unknown_only_waveform_and_pre24h_evidence():
    raw, feat = case("synchronized")
    b1, z = run("B1", raw, feat), run("Z995", raw, feat, snaps=_snaps())
    for i in range(len(b1)):
        if b1.fault_type.iloc[i] == "UNKNOWN":
            assert z.fault_type.iloc[i] == "BEARING_WEAR" and det(z, i)["evaluated_rule"] == "E995"
        else:
            assert z.fault_type.iloc[i] == b1.fault_type.iloc[i]
    raw, feat = case("q")
    early = (feat.window_start_utc >= START + pd.Timedelta(hours=5)) & (feat.window_start_utc < START + pd.Timedelta(hours=5, minutes=20))
    feat.loc[early, "motor_speed_rpm__std"] = 0.
    full = run("E995", raw, feat)
    pre = full[pd.to_datetime(full.alert_time_utc, utc=True) < REF_END]
    d = json.loads(pre.rule_detail.iloc[0])
    assert d["reference"]["status"] == "incomplete" and "tail" not in d
    t = pd.Timestamp(pre.alert_time_utc.iloc[0])
    got = run("E995", mutate_raw_future(raw, t), feat, as_of=t)
    assert canonical(got).equals(canonical(pre.iloc[[0]]))


def test_zero_eligible_reference_minutes_fall_back_for_factor_and_tail_rules():
    raw, feat = case("q")
    raw = raw.copy()
    raw.loc[raw.timestamp_utc < REF_END, "operating_mode"] = "STOPPED"     # no paired first-day rows at all
    g = D.normalized_asset(feat, meta())
    rt = S.residual_table(raw, meta().iloc[0])
    ref = S.residual_reference(rt, g, REF_END)
    assert ref["minutes"] == 0 and ref["reference_std_kpa"] is None and len(ref["_values"]) == 0
    empty = S.residual_reference(rt.iloc[0:0], g, REF_END)
    assert empty["minutes"] == 0 and empty["reference_std_kpa"] is None
    for c in ("R3", "E995", "Y3", "Z995"):
        p, b1 = run(c, raw, feat), run("B1", raw, feat)
        assert {det(p, i).get("reason") for i in range(len(p))} >= {"residual_reference_unsupported"}
        assert "SENSOR_NOISE_SPIKES" not in set(p.fault_type)
