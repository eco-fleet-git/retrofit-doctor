"""Task011 phase-1 contracts on synthetic fixtures only (no benchmark telemetry, labels or scoring)."""
import inspect
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from retrofit_sim import baselines as B
from retrofit_doctor import diagnosis_fusion as D
from retrofit_doctor import noise_unresolved as N
from retrofit_doctor.causal_b1 import predict as predict_b1

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from test_diagnosis_fusion import START, snap, reference_snaps

CH = {"n": "motor_speed_rpm", "pd": "discharge_pressure_kpa", "i": "motor_current_a", "pw": "motor_power_kw",
      "wt": "motor_winding_temp_c"}
LEVEL = {"n": 1500., "pd": 200., "i": 50., "pw": 20., "wt": 60.}
ALL = "|".join(CH.values()) + "|vibration_accel_rms_g"
H0, H1 = 26, 30


def meta(channels=ALL, hours=40):
    return pd.DataFrame([{"asset_id": "A", "motor_rated_rpm": 1500., "bearing_bpfo_order": 3.6,
                          "channels_available": channels, "window_start_utc": START.isoformat(),
                          "window_end_utc": (START + pd.Timedelta(hours=hours)).isoformat()}])


def frame(hours=40, noisy=(), std=.5, level=(), count=None, ratio=3.):
    """Per-minute features with mean/std/min/max/count; `noisy` channels get std `std` in [H0, H1)."""
    n = hours * 60
    i = np.arange(n)
    f = pd.DataFrame({"asset_id": "A", "window_start_utc": pd.date_range(START, periods=n, freq="min"), "rows": 60,
                      "running_fraction": 1., "operating_mode": "RUNNING"})
    win = (f.window_start_utc >= START + pd.Timedelta(hours=H0)) & (f.window_start_utc < START + pd.Timedelta(hours=H1))
    for k, ch in CH.items():
        mean = LEVEL[k] * (1 + .001 * np.sin(i * (.3 + .1 * len(k))))
        sd = np.full(n, .1)
        if k in noisy:
            sd[win.to_numpy()] = std
        if k in level:
            mean = mean + np.where(win, LEVEL[k] * .5, 0.)
        f[f"{ch}__mean"], f[f"{ch}__std"] = mean, sd
        f[f"{ch}__min"], f[f"{ch}__max"] = mean - ratio * sd, mean + ratio * sd
        f[f"{ch}__count"] = 60
        if count and k in count:
            f.loc[win, f"{ch}__count"] = count[k]
    return f


def run(c, f, a=None, snaps=None, as_of=None):
    a = meta() if a is None else a
    return N.predict_asset(c, f, pd.DataFrame(columns=["asset_id"]) if snaps is None else snaps, a, as_of=as_of)


# --- Q1 / Q2 rule ---------------------------------------------------------------------------------------

def test_isolated_noisy_channel_with_quiet_coupled_channels_becomes_noise_on_that_channel():
    p = run("Q1", frame(noisy=("pd",)))
    b1 = run("B1", frame(noisy=("pd",)))
    assert len(p) and set(b1.fault_type) == {"UNKNOWN"}                     # B1 abstains on a pure spread change
    assert set(p.fault_type) == {"SENSOR_NOISE_SPIKES"} and set(p.event_class) == {"SENSOR"}
    assert set(p.suspected_channel) == {"discharge_pressure_kpa"} and set(p.diagnosis_source) == {"Q1"}
    ev = p.evidence.iloc[0]
    assert "motor_current_a spread z" in ev and "motor_speed_rpm spread z" in ev and "does not confirm" in ev
    assert "count=60" in ev and "B1 rule said UNKNOWN" in ev
    detail = json.loads(p.rule_detail.iloc[0])
    assert detail["eligible"] == 1 and detail["examined"][0]["channel"] == "discharge_pressure_kpa"
    assert detail["evaluated_noise_rule"] == "Q1" and detail["emitted_source"] == "Q1"
    assert detail["noise_rule_outcome"] == "emitted"


def test_level_deviation_elsewhere_does_not_block_and_emission_is_b1():
    f = frame(noisy=("pd",), level=("wt",))
    p, b1 = run("Q1", f), run("B1", f)
    assert sorted(zip(p.asset_id, p.alert_time_utc)) == sorted(zip(b1.asset_id, b1.alert_time_utc))
    assert set(p.fault_type) == {"SENSOR_NOISE_SPIKES"}
    want = predict_b1(f, meta(), {"A": meta().window_end_utc.iloc[0]}, k=6, persist=15)
    pd.testing.assert_frame_equal(b1[B._COLS], want[B._COLS].reset_index(drop=True), check_dtype=False)


def test_coupled_variability_falls_back_to_exact_b1():
    f = frame(noisy=("pd", "i"))
    pd.testing.assert_frame_equal(run("Q1", f)[B._COLS], run("B1", f)[B._COLS])


def test_two_isolated_sources_are_ambiguous_and_fall_back():
    f = frame(noisy=("pd", "wt"))                     # wt coupled i, pw quiet; pd coupled i, pw, n quiet
    p = run("Q1", f)
    assert json.loads(p.rule_detail.iloc[0])["eligible"] == 2
    pd.testing.assert_frame_equal(p[B._COLS], run("B1", f)[B._COLS])


@pytest.mark.parametrize("variant", ["source_not_installed", "source_count_29", "source_count_0",
                                     "coupled_not_installed", "coupled_count_29"])
def test_missing_or_low_count_source_or_coupled_channel_falls_back(variant):
    f, a = frame(noisy=("pd",)), meta()
    if variant == "source_not_installed":
        a = meta(channels=ALL.replace("discharge_pressure_kpa|", ""))
    elif variant.startswith("source_count"):
        f = frame(noisy=("pd",), count={"pd": int(variant[-2:].strip("_"))})
    elif variant == "coupled_not_installed":       # pd keeps only i as usable coupled channel
        a = meta(channels=ALL.replace("motor_speed_rpm|", "").replace("motor_power_kw|", ""))
    else:
        f = frame(noisy=("pd",), count={"n": 29, "pw": 29})
    p = run("Q1", f, a)
    assert "SENSOR_NOISE_SPIKES" not in set(p.fault_type)
    assert set(p.diagnosis_source) <= {"B1"}


def test_negative_coupled_std_is_not_a_usable_observation():
    f = frame(noisy=("pd",))
    win = (f.window_start_utc >= START + pd.Timedelta(hours=H0)) & (f.window_start_utc < START + pd.Timedelta(hours=H1))
    f.loc[win, "motor_current_a__std"] = -.1                 # invalid; leaves n, pw usable -> still eligible
    p = run("Q1", f)
    assert set(p.fault_type) == {"SENSOR_NOISE_SPIKES"}
    assert "motor_current_a" not in json.loads(p.rule_detail.iloc[0])["examined"][0]["coupled"]
    f.loc[win, "motor_speed_rpm__std"] = -.1                 # now only pw usable -> fewer than 2 coupled
    assert "SENSOR_NOISE_SPIKES" not in set(run("Q1", f).fault_type)


def test_zero_coupled_std_is_a_valid_quiet_observation():
    f = frame(noisy=("pd",))
    win = (f.window_start_utc >= START + pd.Timedelta(hours=H0)) & (f.window_start_utc < START + pd.Timedelta(hours=H1))
    f.loc[win, "motor_power_kw__std"] = 0.                  # pw is not a B1 stuck channel, so no protected alert
    p = run("Q1", f)
    assert set(p.fault_type) == {"SENSOR_NOISE_SPIKES"}
    assert "motor_power_kw" in json.loads(p.rule_detail.iloc[0])["examined"][0]["coupled"]


def test_lower_coupled_spread_is_not_treated_as_variability():
    f = frame(noisy=("pd",))
    f.loc[(f.window_start_utc >= START + pd.Timedelta(hours=H0)) & (f.window_start_utc < START + pd.Timedelta(hours=H1)),
          "motor_current_a__std"] = .001                   # strongly negative spread z, still <= 2
    assert set(run("Q1", f).fault_type) == {"SENSOR_NOISE_SPIKES"}


def test_outlier_ratio_definition_and_boundary():
    s = {"mean": 280., "std": .5, "max": 282., "min": 279.}
    assert N.outlier_ratio(s) == 4.0
    assert N.outlier_ratio({**s, "max": 281.99}) < 4.0
    assert N.outlier_ratio({**s, "min": np.nan}) is None
    assert N.outlier_ratio({**s, "min": 281., "max": 282.}) is None          # mean below min: inconsistent
    assert N.outlier_ratio({**s, "min": 282., "max": 282.}) is None


@pytest.mark.parametrize("ratio,fires", [(3.0, False), (4.0, True), (5.0, True)])
def test_q2_requires_extreme_to_spread_ratio_at_least_four(ratio, fires):
    f = frame(noisy=("pd",), ratio=ratio)
    q1, q2 = run("Q1", f), run("Q2", f)
    assert set(q1.fault_type) == {"SENSOR_NOISE_SPIKES"}
    assert ("SENSOR_NOISE_SPIKES" in set(q2.fault_type)) is fires


def test_q2_falls_back_when_min_max_missing():
    f = frame(noisy=("pd",), ratio=5.)
    f["discharge_pressure_kpa__max"] = np.nan
    assert "SENSOR_NOISE_SPIKES" not in set(run("Q2", f).fault_type)


def test_protected_quality_diagnoses_unchanged():
    f = frame(noisy=("pd",))
    f = f[(f.window_start_utc < START + pd.Timedelta(hours=33)) | (f.window_start_utc >= START + pd.Timedelta(hours=34))]
    for c in ("Q1", "U1"):
        p = run(c, f)
        gw = p[p.b1_fault_type == "COMMUNICATION_LOSS"]
        assert len(gw) and set(gw.fault_type) == {"COMMUNICATION_LOSS"} and set(gw.diagnosis_source) == {"B1"}


# --- U1 / U2 UNKNOWN-only waveform refinement -------------------------------------------------------------

def _bearing_snaps():
    return pd.DataFrame(reference_snaps() + [snap(START + pd.Timedelta(hours=h), f"B{h}", bpfo_impulses=.5)
                                             for h in (25, 27, 29)])


def test_q_variants_never_use_waveform_even_on_b1_unknown():
    f = frame(noisy=("pd", "i"))                       # B1 UNKNOWN, Q abstains, decisive bearing snapshots present
    assert set(run("B1", f).fault_type) == {"UNKNOWN"}
    for c in ("Q1", "Q2"):
        q = run(c, f, snaps=_bearing_snaps())
        assert set(q.diagnosis_source) == {"B1"} and q.wf_status.isna().all()


def test_u1_turns_unknown_into_bearing_but_q1_first_wins():
    noisy = frame(noisy=("pd",))                       # B1 UNKNOWN, Q1 eligible
    assert set(run("U1", noisy, snaps=_bearing_snaps()).fault_type) == {"SENSOR_NOISE_SPIKES"}
    quiet_unknown = frame(noisy=("pd", "i"))           # B1 UNKNOWN, Q1 abstains (coupled variability)
    b1 = run("B1", quiet_unknown)
    assert set(b1.fault_type) == {"UNKNOWN"}
    u1 = run("U1", quiet_unknown, snaps=_bearing_snaps())
    assert set(u1.fault_type) == {"BEARING_WEAR"} and u1.wf_complete_utc.notna().all()
    assert u1.evidence.str.contains("refines B1 UNKNOWN").all()
    d = json.loads(u1.rule_detail.iloc[0])                 # Q1 evaluated and abstained; W1 emitted
    assert d["evaluated_noise_rule"] == "Q1" and d["emitted_source"] == "W1"
    assert d["noise_rule_outcome"] == "abstained_no_source" and "Q1" not in u1.evidence.iloc[0]
    assert (u1.confidence == b1.confidence).all()           # B1 anomaly score retained, not a cause confidence


def test_u1_keeps_specific_b1_cause_even_with_decisive_waveform():
    f = frame(level=("pd",))                           # lone pd level step -> B1 SENSOR_CALIBRATION_SHIFT
    b1, u1 = run("B1", f), run("U1", f, snaps=_bearing_snaps())
    assert "UNKNOWN" not in set(b1.fault_type)
    pd.testing.assert_frame_equal(u1[B._COLS], b1[B._COLS])


# --- causality / interface ------------------------------------------------------------------------------

def test_prefix_and_future_mutation_including_spread_inputs():
    f = frame(noisy=("pd",), level=("i",))
    f.loc[f.window_start_utc >= START + pd.Timedelta(hours=34), "motor_winding_temp_c__std"] = .6
    snaps = _bearing_snaps()
    full = {c: run(c, f, snaps=snaps) for c in N.CANDIDATES}
    alerts = sorted(set(pd.to_datetime(full["B1"].alert_time_utc, utc=True)))
    cuts = alerts + [START + pd.Timedelta(hours=24, seconds=s) for s in (-1, 0, 1, 60)]
    cuts += [START + pd.Timedelta(hours=h, seconds=1 + s) for h in (25, 27, 29) for s in (-1, 0, 1)]
    cuts += [START + pd.Timedelta(hours=27, seconds=30)]
    for cut in cuts:
        mf = f.copy()
        late = mf.window_start_utc + D.MINUTE > cut
        cols = [c for c in mf.columns if c.endswith(("__mean", "__std", "__min", "__max"))]
        mf.loc[late, cols] = mf.loc[late, cols] * 7 + 3
        ms = snaps.copy()
        ms["samples"] = [np.full(len(x), 9., dtype="float32") if t + pd.Timedelta(seconds=1) > cut else x
                         for t, x in zip(ms.timestamp_utc, ms.samples)]
        for c, want in full.items():
            keep = want[pd.to_datetime(want.alert_time_utc, utc=True) <= cut].reset_index(drop=True)
            for ff, ss in ((f, snaps), (mf, ms)):
                got = run(c, ff, snaps=ss, as_of=cut).reset_index(drop=True)
                pd.testing.assert_frame_equal(got, keep, check_dtype=False)


def test_inference_interface_accepts_no_labels():
    for fn in (N.diagnose_asset, N.predict_asset, N.isolated_spread):
        params = set(inspect.signature(fn).parameters)
        assert not params & {"events", "labels", "sensor_tag", "events_fit"}


def test_deterministic_repeat():
    f = frame(noisy=("pd",))
    pd.testing.assert_frame_equal(run("U2", f, snaps=_bearing_snaps()), run("U2", f, snaps=_bearing_snaps()))


# --- runner smoke and seal guard (mocked data) -----------------------------------------------------------

def test_runner_pipeline_and_audit_on_fixture():
    import run_noise_unresolved as R
    a = meta().assign(split="train")
    f = frame(noisy=("pd",))
    f = f[(f.window_start_utc < START + pd.Timedelta(hours=5)) | (f.window_start_utc >= START + pd.Timedelta(hours=6))]
    snaps = _bearing_snaps()
    tables, preds = R.pipeline(a, f, snaps)
    assert set(preds) == set(N.CANDIDATES)
    calls = []
    real = R.mutate_spread_future
    def spy(feat, aid, cut):
        calls.append(cut)
        return real(feat, aid, cut)
    import pytest as _p
    mp = _p.MonkeyPatch()
    mp.setattr(R, "mutate_spread_future", spy)
    main = R.causality_audit(a, f, snaps, tables, preds)
    mp.undo()
    assert calls and set(main.candidate) == set(N.CANDIDATES)          # spread mutation in the main audit, all candidates
    audit = pd.concat([main, R.spread_audit(a, f, preds)])
    assert audit["pass"].all() and {"alert", "snapshot_complete", "reference_boundary"} <= set(audit.cut_kind)
    assert (audit.variant == "spread_future_mutation").any()


def test_runner_selection_order_and_gate():
    import run_noise_unresolved as R
    base = {"gate_pass": True, "correctness_pass": True, "useful_diagnoses": 10, "type_correct": 10,
            "false_plus_excess": 5}
    comp = pd.DataFrame([{"candidate": c, **base} for c in ("B1", "U2", "Q2", "U1")])
    assert R.select(comp) == "Q2"
    comp.loc[comp.candidate == "U1", "useful_diagnoses"] = 11
    assert R.select(comp) == "U1"
    assert R.select(comp.assign(correctness_pass=False)) is None


@pytest.mark.parametrize("case", ["no_seal", "wrong_manifest", "code_changed", "completed", "seed"])
def test_runner_refuses_before_any_read(monkeypatch, tmp_path, case):
    import run_noise_unresolved as R
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
