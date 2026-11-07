"""Task012 phase-1 contracts on synthetic fixtures only (no benchmark telemetry, labels or scoring)."""
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

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from test_diagnosis_fusion import START, snap, reference_snaps

QB, HB, H0, NR, N3 = 100., 30., 40., 1500., 3.
N_RUN, Q_RUN, PS_RUN, T_RUN = 1425., 90., 100., 20.
HC = H0 * (N_RUN / NR) ** 2 - (H0 - HB) * (Q_RUN / QB) ** 2            # 28.0 m
PD_RUN = PS_RUN + HC * 9.80665                                          # kPa(g)
CH = {"q": "flow_m3_h", "ps": "suction_pressure_kpa", "pd": "discharge_pressure_kpa", "n": "motor_speed_rpm",
      "tf": "fluid_temp_c"}
MEAN = {"q": Q_RUN, "ps": PS_RUN, "pd": PD_RUN, "n": N_RUN, "tf": T_RUN}
STD = {"q": .5, "ps": .5, "pd": .5, "n": 2., "tf": .05}
ALL = "|".join(CH.values()) + "|vibration_accel_rms_g"
H0H, H1H = 26, 30


def meta(channels=ALL, fluid="Seawater", **kw):
    m = {"asset_id": "A", "motor_rated_rpm": NR, "bearing_bpfo_order": 3.6, "channels_available": channels,
         "fluid": fluid, "pump_rated_flow_m3_h": QB, "pump_rated_head_m": HB, "pump_shutoff_head_m": H0,
         "npsh3_at_bep_m": N3, "window_start_utc": START.isoformat(),
         "window_end_utc": (START + pd.Timedelta(hours=40)).isoformat()}
    m.update(kw)
    return pd.DataFrame([m])


def frame(hours=40, std=None, mean=None, count=None):
    """Consistent pump minutes; `std`/`mean`/`count` override channel values inside [26 h, 30 h)."""
    n = hours * 60
    i = np.arange(n)
    f = pd.DataFrame({"asset_id": "A", "window_start_utc": pd.date_range(START, periods=n, freq="min"), "rows": 60,
                      "running_fraction": 1., "operating_mode": "RUNNING"})
    win = ((f.window_start_utc >= START + pd.Timedelta(hours=H0H))
           & (f.window_start_utc < START + pd.Timedelta(hours=H1H))).to_numpy()
    for k, ch in CH.items():
        m = MEAN[k] * (1 + .0005 * np.sin(i * (.3 + .07 * len(k) + .01 * ord(k[0]))))
        s = np.full(n, STD[k]) * (1 + .02 * np.cos(i * .21 + ord(k[0])))
        if mean and k in mean:
            m = np.where(win, mean[k], m)
        if std and k in std:
            s = np.where(win, std[k], s)
        f[f"{ch}__mean"], f[f"{ch}__std"] = m, s
        f[f"{ch}__min"], f[f"{ch}__max"] = m - 3 * s, m + 3 * s
        f[f"{ch}__count"] = 60
        if count and k in count:
            f.loc[win, f"{ch}__count"] = count[k]
    return f


def run(c, f, a=None, snaps=None, as_of=None):
    a = meta() if a is None else a
    return H.predict_asset(c, f, pd.DataFrame(columns=["asset_id"]) if snaps is None else snaps, a, as_of=as_of)


def detail(p, i=0):
    return json.loads(p.rule_detail.iloc[i])


# --- physics, units, references -----------------------------------------------------------------------

def test_unit_conversion_round_trip_and_known_head():
    assert H.head_from_kpa(9.80665) == pytest.approx(1.0)
    assert H.kpa_from_head(H.head_from_kpa(274.6)) == pytest.approx(274.6)
    assert H.curve_head(QB, NR, QB, HB, H0, NR) == pytest.approx(HB)          # BEP at rated speed
    assert H.curve_head(0., NR, QB, HB, H0, NR) == pytest.approx(H0)          # shutoff


@pytest.mark.parametrize("Q,n", [(90., 1425.), (60., 1200.), (120., 1500.)])
def test_analytical_derivatives_match_finite_differences(Q, n):
    aQ, an = H.derivatives(Q, n, QB, HB, H0, NR)
    p = lambda q, s: H.kpa_from_head(H.curve_head(q, s, QB, HB, H0, NR))
    e = 1e-4
    assert aQ == pytest.approx(abs((p(Q + e, n) - p(Q - e, n)) / (2 * e)), rel=1e-6)
    assert an == pytest.approx(abs((p(Q, n + e) - p(Q, n - e)) / (2 * e)), rel=1e-6)


def test_nist_antoine_known_points_ranges_and_gaps():
    assert H.vapor_pressure_kpa(20.) == pytest.approx(2.34, abs=.01)
    assert H.vapor_pressure_kpa(99.5) == pytest.approx(99.6, abs=.3)           # 372.65 K, last row
    assert H.vapor_pressure_kpa(100.) is None                                  # 373.15 K > 373 K: no extrapolation
    assert H.vapor_pressure_kpa(30.5) is None                               # 303.65 K: gap between rows 1 and 2
    assert H.vapor_pressure_kpa(-1.) is None and H.vapor_pressure_kpa(100.5) is None
    tk = 80. + 273.15                                                       # overlap 344..363 -> first row (3)
    want = 100 * 10 ** (5.0768 - 1659.793 / (tk - 45.854))
    assert H.vapor_pressure_kpa(80.) == pytest.approx(want)
    assert H.npsh3(N3, 1., 1.) == pytest.approx(N3)


def test_reference_floor_support_and_boundary():
    ref_end = START + pd.Timedelta(hours=1)
    g = pd.DataFrame({"window_start_utc": pd.date_range(START, periods=120, freq="min"), "steady": True})
    for k in H.SOURCES:
        g[f"{B.CH[k]}__mean"] = 50.
        g[f"{B.CH[k]}__std"] = np.r_[np.full(60, 1.), np.full(60, 9.)]
        g[f"{B.CH[k]}__count"] = 60
    fl = H.reference_floors(g, frozenset(H.SOURCES), ref_end)
    assert fl["q"] == {"floor": 1.0, "minutes": 60}                       # minute ending exactly at ref_end included
    g.loc[0, "steady"] = False
    assert H.reference_floors(g, frozenset(H.SOURCES), ref_end)["q"] == {"floor": None, "minutes": 59}
    g.loc[0, "steady"] = True
    g.loc[1, f"{B.CH['pd']}__std"] = -1.                                   # invalid std excluded
    g.loc[2, f"{B.CH['ps']}__count"] = 29
    fl = H.reference_floors(g, frozenset(H.SOURCES), ref_end)
    assert fl["pd"]["floor"] is None and fl["ps"]["floor"] is None
    assert H.reference_floors(g, frozenset({"q"}), ref_end)["pd"] == {"floor": None, "minutes": 0}
    g.loc[3, f"{B.CH['q']}__mean"] = np.nan                               # retained std, missing mean: not observed
    assert H.reference_floors(g, frozenset(H.SOURCES), ref_end)["q"] == {"floor": None, "minutes": 59}
    assert H.reference_floors(g.drop(columns=[f"{B.CH['q']}__mean"]), frozenset(H.SOURCES), ref_end)["q"]["minutes"] == 0


# --- rule outcomes --------------------------------------------------------------------------------------

@pytest.mark.parametrize("key,std", [("q", 10.), ("pd", 20.), ("ps", 20.)])
def test_source_only_excess_gives_unique_hypothesis_on_that_source(key, std):
    p = run("H3", frame(std={key: std}))
    assert len(p) and set(p.fault_type) == {"SENSOR_NOISE_SPIKES"} and set(p.suspected_channel) == {CH[key]}
    d = detail(p)
    assert d["outcome"] == "emitted" and d["eligible"] == [CH[key]] and d["sources"][key]["ratio"] > 3
    assert d["measured"]["q"]["unit"] == "m3/h" and d["measured"]["pd"]["unit"] == "kPa(g)"
    ev = p.evidence.iloc[0]
    assert "not proof of instrument failure" in ev and "anomaly score" in ev and "101.325 kPa" in ev


def test_h5_requires_ratio_above_five():
    f = frame(std={"q": 7.})                     # ratio ~4.3: H3 fires, H5 abstains
    h3, h5 = run("H3", f), run("H5", f)
    assert set(h3.fault_type) == {"SENSOR_NOISE_SPIKES"} and "SENSOR_NOISE_SPIKES" not in set(h5.fault_type)
    r = detail(h5)["sources"]["q"]["ratio"]
    assert 3 < r <= 5 and detail(h5)["outcome"] == "abstained_no_source"


def test_physically_consistent_speed_driven_pressure_variation_is_not_noise():
    an = H.derivatives(Q_RUN, N_RUN, QB, HB, H0, NR)[1]
    f = frame(std={"pd": 20., "n": 20. / an})    # discharge spread explained by measured speed spread
    p = run("H3", f)
    assert len(p) and "SENSOR_NOISE_SPIKES" not in set(p.fault_type)
    assert detail(p)["sources"]["pd"]["ratio"] < 1


def test_two_noisy_sources_correctly_abstain_under_conservative_budgets():
    # Each source budget contains the other's measured spread, so neither can exceed factor >= 1 at once.
    p = run("H3", frame(std={"q": 10., "pd": 20.}))
    assert len(p) and "SENSOR_NOISE_SPIKES" not in set(p.fault_type)
    d = detail(p)
    assert d["outcome"] == "abstained_no_source" and d["eligible"] == []
    assert d["sources"]["q"]["ratio"] < 3 and d["sources"]["pd"]["ratio"] < 3
    assert d["sources"]["pd"]["physical_contributions"]["aQ_sigma_q"] > 10        # flow spread enters pd budget
    pd.testing.assert_frame_equal(p[B._COLS], run("B1", frame(std={"q": 10., "pd": 20.}))[B._COLS])


@pytest.mark.parametrize("change,reason", [
    (dict(a=dict(fluid="Lube oil")), "fluid_not_water_like"),
    (dict(a=dict(pump_shutoff_head_m=25.)), "passport_invalid"),
    (dict(a=dict(npsh3_at_bep_m=float("nan"))), "passport_invalid"),
    (dict(a=dict(channels=ALL.replace("fluid_temp_c|", ""))), "input_unavailable_fluid_temp_c"),
    (dict(count={"n": 29}), "input_unavailable_motor_speed_rpm"),
    (dict(mean={"n": 600.}), "speed_ratio_out_of_range"),
    (dict(mean={"q": 20.}), "flow_ratio_out_of_range"),
    (dict(mean={"pd": PD_RUN + 80.}), "curve_mismatch"),
    (dict(mean={"tf": 30.5}), "vapor_pressure_out_of_range"),
    (dict(mean={"ps": -95., "pd": -95. + HC * 9.80665}), "npsh_margin_low"),
    (dict(std={"q": 30.}), "flow_relative_std_too_large"),
    (dict(std={"n": 100.}), "speed_relative_std_too_large"),
])
def test_unsupported_inputs_fall_back_with_explicit_reason(change, reason):
    a = meta(**change.get("a", {}))
    std = {"q": 10., **change.get("std", {})}
    f = frame(std=std, mean=change.get("mean"), count=change.get("count"))
    p, b1 = run("H3", f, a), run("B1", f, a)
    assert len(p)
    hit = np.array([detail(p, i).get("unsupported_reason") == reason for i in range(len(p))])
    assert hit.any()
    pd.testing.assert_frame_equal(p[hit][B._COLS].reset_index(drop=True), b1[hit][B._COLS].reset_index(drop=True))
    assert (p[hit].diagnosis_source == "B1").all()


def test_reference_incomplete_and_not_steady_are_unsupported():
    f = frame(std={"q": 10.})
    g = D.normalized_asset(f, meta())
    inst = D.installed_keys(meta().iloc[0])
    ref_end = START + pd.Timedelta(hours=24)
    floors = H.reference_floors(g, inst, ref_end)
    early = int(np.flatnonzero((g.window_start_utc == ref_end - pd.Timedelta(minutes=2)).to_numpy())[0])
    assert H.hydraulic_check(g, early, meta().iloc[0], inst, 3., floors, ref_end, "UNKNOWN")["unsupported_reason"] \
        == "reference_incomplete"
    j = int(np.flatnonzero((g.window_start_utc == START + pd.Timedelta(hours=27)).to_numpy())[0])
    g2 = g.copy()
    g2.loc[j, "steady"] = False
    assert H.hydraulic_check(g2, j, meta().iloc[0], inst, 3., floors, ref_end, "UNKNOWN")["unsupported_reason"] \
        == "not_steady"
    for t in ("CAVITATION", "AIR_ENTRAINMENT"):
        assert H.hydraulic_check(g, j, meta().iloc[0], inst, 3., floors, ref_end, t)["unsupported_reason"] \
            == "b1_cavitation_or_air_entrainment"


def test_source_without_reference_support_cannot_be_eligible():
    f = frame(std={"q": 10.})
    f.loc[f.window_start_utc < START + pd.Timedelta(hours=24), "flow_m3_h__count"] = 10
    p = run("H3", f)
    d = detail(p)
    assert d["sources"]["q"]["status"] == "reference_unsupported" and "SENSOR_NOISE_SPIKES" not in set(p.fault_type)


def test_protected_quality_cases_unchanged():
    f = frame(std={"q": 10.})
    f = f[(f.window_start_utc < START + pd.Timedelta(hours=33)) | (f.window_start_utc >= START + pd.Timedelta(hours=34))]
    for c in ("H3", "V3"):
        p = run(c, f)
        gw = p[p.b1_fault_type == "COMMUNICATION_LOSS"]
        assert len(gw) and set(gw.fault_type) == {"COMMUNICATION_LOSS"} and set(gw.diagnosis_source) == {"B1"}
        assert detail(gw).get("outcome") == "not_evaluated_protected"


# --- V3 / V5 UNKNOWN-only waveform scope ----------------------------------------------------------------

def _bearing_snaps():
    return pd.DataFrame(reference_snaps() + [snap(START + pd.Timedelta(hours=h), f"B{h}", rpm=N_RUN, bpfo_impulses=.5)
                                             for h in (25, 27, 29)])


def _ref_snaps_at_speed():
    return pd.DataFrame([snap(START + pd.Timedelta(hours=h), f"S{h:02d}", rpm=N_RUN, seed=h) for h in (2, 6, 10, 14, 18, 22)]
                        + [snap(START + pd.Timedelta(hours=h), f"B{h}", rpm=N_RUN, bpfo_impulses=.5) for h in (25, 27, 29)])


def test_v3_hydraulic_first_then_unknown_only_waveform():
    noisy = frame(std={"q": 10.})                        # B1 UNKNOWN, H3 eligible
    assert set(run("B1", noisy).fault_type) == {"UNKNOWN"}
    assert set(run("V3", noisy, snaps=_ref_snaps_at_speed()).fault_type) == {"SENSOR_NOISE_SPIKES"}
    an = H.derivatives(Q_RUN, N_RUN, QB, HB, H0, NR)[1]
    explained = frame(std={"pd": 20., "n": 20. / an})    # B1 alert, hydraulic abstains
    b1 = run("B1", explained)
    v3 = run("V3", explained, snaps=_ref_snaps_at_speed())
    for i in range(len(b1)):
        if b1.fault_type.iloc[i] == "UNKNOWN":
            assert v3.fault_type.iloc[i] == "BEARING_WEAR" and v3.diagnosis_source.iloc[i] == "W1"
            assert detail(v3, i)["emitted_source"] == "W1" and detail(v3, i)["outcome"] != "emitted"
        else:
            assert v3.fault_type.iloc[i] == b1.fault_type.iloc[i]
    assert (b1.fault_type == "UNKNOWN").any()


def test_h_variants_never_use_waveform():
    an = H.derivatives(Q_RUN, N_RUN, QB, HB, H0, NR)[1]
    f = frame(std={"pd": 20., "n": 20. / an})
    for c in ("H3", "H5"):
        p = run(c, f, snaps=_ref_snaps_at_speed())
        assert "W1" not in set(p.diagnosis_source) and p.wf_status.isna().all()


def test_v3_keeps_specific_b1_cause():
    f = frame(mean={"ps": PS_RUN - 30.})                 # suction level drop -> specific B1 cause
    b1 = run("B1", f)
    assert len(b1) and "UNKNOWN" not in set(b1.fault_type)
    v3 = run("V3", f, snaps=_ref_snaps_at_speed())
    keep = v3.diagnosis_source != "H3"
    pd.testing.assert_frame_equal(v3[keep][B._COLS].reset_index(drop=True), b1[keep][B._COLS].reset_index(drop=True))


# --- causality / interface ------------------------------------------------------------------------------

def test_prefix_and_future_mutation_of_means_std_counts_and_snapshots():
    f = frame(std={"q": 10.})
    f.loc[f.window_start_utc >= START + pd.Timedelta(hours=34), "discharge_pressure_kpa__std"] = 20.
    snaps = _ref_snaps_at_speed()
    full = {c: run(c, f, snaps=snaps) for c in H.CANDIDATES}
    alerts = sorted(set(pd.to_datetime(full["B1"].alert_time_utc, utc=True)))
    cuts = alerts + [START + pd.Timedelta(hours=24, seconds=s) for s in (-1, 0, 1, 60)]
    cuts += [START + pd.Timedelta(hours=h, seconds=1 + s) for h in (25, 27, 29) for s in (-1, 0, 1)]
    cuts += [START + pd.Timedelta(hours=27, seconds=30)]
    for cut in cuts:
        mf = f.copy()
        late = mf.window_start_utc + D.MINUTE > cut
        cols = [c for c in mf.columns if c.endswith(("__mean", "__std", "__min", "__max"))]
        mf.loc[late, cols] = mf.loc[late, cols] * 7 + 3
        mf.loc[late, [c for c in mf.columns if c.endswith("__count")]] = 0
        ms = snaps.copy()
        ms["samples"] = [np.full(len(x), 9., dtype="float32") if t + pd.Timedelta(seconds=1) > cut else x
                         for t, x in zip(ms.timestamp_utc, ms.samples)]
        for c, want in full.items():
            keep = want[pd.to_datetime(want.alert_time_utc, utc=True) <= cut].reset_index(drop=True)
            for ff, ss in ((f, snaps), (mf, ms)):
                pd.testing.assert_frame_equal(run(c, ff, snaps=ss, as_of=cut).reset_index(drop=True), keep,
                                              check_dtype=False)


def test_inference_interface_accepts_no_labels_and_emission_is_b1():
    for fn in (H.diagnose_asset, H.predict_asset, H.hydraulic_check):
        assert not set(inspect.signature(fn).parameters) & {"events", "labels", "sensor_tag", "events_fit"}
    f = frame(std={"q": 10.})
    b1 = run("B1", f)
    for c in H.CANDIDATES:
        p = run(c, f, snaps=_ref_snaps_at_speed())
        assert sorted(zip(p.asset_id, p.alert_time_utc)) == sorted(zip(b1.asset_id, b1.alert_time_utc))


# --- runner smoke and seal guard (mocked data) ------------------------------------------------------------

def test_runner_pipeline_audit_and_coverage_on_fixture(monkeypatch):
    import run_hydraulic_spread as R
    a = meta().assign(split="train")
    f = frame(std={"q": 10.})
    f = f[(f.window_start_utc < START + pd.Timedelta(hours=5)) | (f.window_start_utc >= START + pd.Timedelta(hours=6))]
    snaps = _ref_snaps_at_speed()
    tables, preds = R.pipeline(a, f, snaps)
    calls = []
    real = R.mutate_minute_stats_future
    monkeypatch.setattr(R, "mutate_minute_stats_future", lambda *x: (calls.append(1), real(*x))[1])
    audit = R.causality_audit(a, f, snaps, tables, preds)
    assert calls and audit["pass"].all() and set(audit.candidate) == set(H.CANDIDATES)
    assert {"alert", "snapshot_complete", "reference_boundary"} <= set(audit.cut_kind)
    cov = R.coverage(preds)
    assert {"emitted", "not_evaluated_protected"} <= set(cov.outcome) and set(cov.candidate) == {"H3", "H5", "V3", "V5"}


def test_runner_selection_order():
    import run_hydraulic_spread as R
    base = {"gate_pass": True, "correctness_pass": True, "useful_diagnoses": 10, "type_correct": 10,
            "false_plus_excess": 5}
    comp = pd.DataFrame([{"candidate": c, **base} for c in ("B1", "V5", "H5", "V3")])
    assert R.select(comp) == "H5"
    comp.loc[comp.candidate == "V3", "useful_diagnoses"] = 11
    assert R.select(comp) == "V3"
    assert R.select(comp.assign(gate_pass=False)) is None


@pytest.mark.parametrize("case", ["no_seal", "wrong_manifest", "code_changed", "completed", "seed"])
def test_runner_refuses_before_any_read(monkeypatch, tmp_path, case):
    import run_hydraulic_spread as R
    def forbidden(*a, **k):
        raise AssertionError("data read attempted")
    monkeypatch.setattr(pd, "read_parquet", forbidden)
    monkeypatch.setattr(pd, "read_csv", forbidden)
    code = tmp_path / "code.py"
    code.write_text("x = 1\n")
    man = tmp_path / "manifest.json"
    man.write_text(json.dumps({"code_sha256": {str(code): R.sha256(code)}}))
    seal = tmp_path / "SEAL.json"
    if case != "no_seal":
        seal.write_text(json.dumps({"manifest_sha256": "0" * 64 if case == "wrong_manifest" else R.sha256(man)}))
    if case == "code_changed":
        code.write_text("x = 2\n")
    if case == "completed":
        (tmp_path / "COMPLETED.json").write_text("{}")
    for name, val in (("ROOT", Path("/")), ("MANIFEST", man), ("SEAL", seal), ("OUT", tmp_path / "out"),
                      ("COMPLETED", tmp_path / "COMPLETED.json"), ("seed_pinned", lambda: case != "seed")):
        monkeypatch.setattr(R, name, val)
    with pytest.raises(SystemExit, match="no data accessed"):
        R.train()
    assert not (tmp_path / "out").exists()
