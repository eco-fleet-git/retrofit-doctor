"""Task013 audit-only recovery contracts (synthetic fixtures; no benchmark reads, no scoring)."""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import recover_synchronized_residual_audit as RC
import run_synchronized_residual as R
from retrofit_doctor import synchronized_residual as S
from test_synchronized_residual import case, meta, START, REF_END


def categorical_raw():
    raw, _ = case("q")
    raw = raw[raw.timestamp_utc < START + pd.Timedelta(hours=28)].reset_index(drop=True)
    raw["operating_mode"] = pd.Categorical(raw.operating_mode)          # RUNNING-only categories, as in parquet
    assert list(raw.operating_mode.cat.categories) == ["RUNNING"]
    return raw


def test_original_mutator_fails_on_categorical_and_wrapper_applies_registered_mutation():
    raw = categorical_raw()
    cut = START + pd.Timedelta(hours=26, minutes=15)
    with pytest.raises(TypeError, match="Categorical"):
        R.mutate_raw_future(raw, cut)                                    # the original failure, reproduced
    m = RC.safe_mutate_raw_future(raw, cut)
    late = m.timestamp_utc >= cut
    assert (m.loc[late, "operating_mode"] == "STOPPED").all() and (m.loc[~late, "operating_mode"] == "RUNNING").all()
    for c in S.RAW.values():
        np.testing.assert_allclose(m.loc[late, c], raw.loc[late, c] * 3 + 50)
        np.testing.assert_array_equal(m.loc[~late, c], raw.loc[~late, c])
    assert isinstance(raw.operating_mode.dtype, pd.CategoricalDtype)    # input copy untouched
    full = S.residual_table(raw, meta().iloc[0])
    want = full[full.minute_end <= cut].reset_index(drop=True)
    for r in (raw[raw.timestamp_utc < cut], m):
        assert R.canonical(S.residual_table(r, meta().iloc[0], cut)).equals(R.canonical(want))


def test_original_raw_audit_passes_with_wrapper_and_restores_original_mutator():
    raw, feat = case("q")
    raw["operating_mode"] = pd.Categorical(raw.operating_mode)
    a = meta().assign(asset_id="A")
    rtables = {"A": S.residual_table(raw, a.iloc[0])}
    preds = {"B1": S.predict_asset("B1", feat, raw, pd.DataFrame(), a)}
    out = RC.run_raw_audit(a, {"A": raw}, rtables, preds)
    assert len(out) and out["pass"].all() and (out.variant == "future_mutation").any()
    assert {"reference_boundary", "alert_boundary", "sub_minute"} <= set(out.cut_kind)
    assert R.mutate_raw_future is RC.ORIGINAL_MUTATE


def test_build_final_attaches_flags_to_original_metrics_without_scoring(monkeypatch):
    import run_regime_reference
    monkeypatch.setattr(run_regime_reference, "evaluate", lambda *a, **k: (_ for _ in ()).throw(AssertionError("scored")))
    unchecked = pd.DataFrame([
        {"candidate": c, "gate_pass": c in ("E995", "Z995"), "useful_diagnoses": u, "type_correct": t,
         "false_plus_excess": 6} for c, u, t in (("B1", 8, 8), ("R3", 8, 8), ("E995", 9, 9), ("Z995", 10, 10))])
    ok = {"control_equals_saved": True, "emission_equal_control": {c: True for c in unchecked.candidate},
          "control_metrics": {"detected": True}, "raw_aggregation_failures": 0,
          "inputs_identical": {"inputs": True, "raw_inputs": True, "aggregation": True},
          "causality_failures": {c: 0 for c in unchecked.candidate}, "determinism": {c: True for c in unchecked.candidate}}
    comp, sel = RC.build_final(unchecked, ok)
    assert sel == "Z995" and comp.correctness_pass.all()
    pd.testing.assert_frame_equal(comp.drop(columns="correctness_pass"), unchecked)
    for broken in ({"raw_aggregation_failures": 1}, {"determinism": {**ok["determinism"], "Z995": False}},
                   {"inputs_identical": {"inputs": False}}, {"causality_failures": {**ok["causality_failures"], "E995": 2}}):
        comp, sel = RC.build_final(unchecked, {**ok, **broken})
        if "determinism" in broken:
            assert sel == "E995"
        elif "causality_failures" in broken:
            assert sel == "Z995" and not comp.set_index("candidate").correctness_pass["E995"]
        else:
            assert sel is None


def _forbid_reads(monkeypatch):
    def forbidden(*a, **k):
        raise AssertionError("data read attempted")
    monkeypatch.setattr(pd, "read_parquet", forbidden)
    monkeypatch.setattr(S, "load_train_raw", forbidden)


@pytest.mark.parametrize("case_", ["no_seal", "wrong_manifest", "code_changed", "seed"])
def test_recovery_refuses_before_any_read(monkeypatch, tmp_path, case_):
    _forbid_reads(monkeypatch)
    code = tmp_path / "rec.py"
    code.write_text("x = 1\n")
    man = tmp_path / "rman.json"
    man.write_text(json.dumps({"recovery_code_sha256": {str(code): R.sha256(code)}}))
    seal = tmp_path / "RECOVERY_SEAL.json"
    if case_ != "no_seal":
        seal.write_text(json.dumps({"recovery_manifest_sha256": "0" * 64 if case_ == "wrong_manifest" else R.sha256(man)}))
    if case_ == "code_changed":
        code.write_text("x = 2\n")
    monkeypatch.setattr(RC, "ROOT", Path("/"))
    monkeypatch.setattr(RC, "RECOVERY_MANIFEST", man)
    monkeypatch.setattr(RC, "RECOVERY_SEAL", seal)
    monkeypatch.setattr(R, "seed_pinned", lambda: case_ != "seed")
    with pytest.raises(SystemExit, match="no data accessed"):
        RC.recover()


def _fake_original(tmp_path, monkeypatch):
    """A synthetic original attempt directory + sealed original files (no benchmark data)."""
    raw, feat = case("q")
    a = meta()
    run_dir = tmp_path / "run-x"
    run_dir.mkdir()
    preds = {c: S.predict_asset(c, feat, raw, pd.DataFrame(), a) for c in S.CANDIDATES}
    hashes = {}
    for c, p in preds.items():
        p.to_csv(run_dir / f"predictions_{c}.csv", index=False)
        hashes[c] = R.sha256(run_dir / f"predictions_{c}.csv")
    (run_dir / "run_provenance.json").write_text(json.dumps({"manifest_sha256": "m" * 64, "prediction_sha256": hashes}))
    pd.DataFrame([{"candidate": c, "gate_pass": False, "detected": 18, "type_correct": 8, "class_correct": 14,
                   "false_episodes": 3, "excess_repeats": 3, "sensor_type_and_channel": 3, "events": 26,
                   "useful_diagnoses": 8, "false_plus_excess": 6} for c in S.CANDIDATES]).to_csv(
        run_dir / "comparison_unchecked.csv", index=False)
    pd.DataFrame([{"candidate": c, "pass": True} for c in S.CANDIDATES for _ in range(3)]).to_csv(
        run_dir / "causality_audit.csv", index=False)
    preds["B1"][S.D.OUT_COLS[:7]].to_csv(tmp_path / "control.csv", index=False)
    files = {f.name: R.sha256(f) for f in run_dir.iterdir()}
    man = {"original": {"manifest_sha256": "MAN", "seal_sha256": "SEAL", "run_dir": str(run_dir), "file_sha256": files}}
    monkeypatch.setattr(RC, "ROOT", Path("/"))
    monkeypatch.setattr(R, "require_seal", lambda: None)
    monkeypatch.setattr(R, "CONTROL_PRED", tmp_path / "control.csv")
    monkeypatch.setattr(R, "COMPLETED", tmp_path / "COMPLETED.json")
    monkeypatch.setattr(RC, "sha256", lambda p: {str(R.MANIFEST): "MAN", str(R.SEAL): "SEAL"}.get(str(p), R.sha256(p)))
    monkeypatch.setattr(R, "CONTROL_EXPECT", {"detected": 18})
    return run_dir, man


def test_verify_original_detects_tampering_and_existing_outputs(monkeypatch, tmp_path):
    _forbid_reads(monkeypatch)
    run_dir, man = _fake_original(tmp_path, monkeypatch)
    man["original"]["manifest_sha256"] = "m" * 64
    monkeypatch.setattr(RC, "sha256", lambda p: {str(R.MANIFEST): "m" * 64, str(R.SEAL): "SEAL"}.get(str(p), R.sha256(p)))
    _, _, _, _, checks = RC.verify_original(man)
    assert checks["control_equals_saved"] and all(checks["emission_equal_control"].values())
    assert set(checks["causality_failures"].values()) == {0}
    (run_dir / "predictions_E995.csv").write_text("tampered\n")
    with pytest.raises(SystemExit, match="original run files changed"):
        RC.verify_original(man)
    (run_dir / "comparison.csv").write_text("x\n")
    with pytest.raises(SystemExit, match="refusing to overwrite"):
        RC.verify_original(man)
