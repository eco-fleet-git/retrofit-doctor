"""Task007 phase-1 release adapter contracts. Fixtures only; no test-asset measurement is loaded here."""
import json
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import release_export as R
from retrofit_doctor.causal_b1 import predict as predict_b1

SCRIPT = str(ROOT / "scripts/release_export.py")
ASSETS = pd.DataFrame([{"asset_id": "PUMP-08", "window_start_utc": "2025-09-08T00:00:00Z",
                        "window_end_utc": "2025-09-15T00:00:00Z"},
                       {"asset_id": "PUMP-09", "window_start_utc": "2026-02-09T00:00:00Z",
                        "window_end_utc": "2026-02-16T00:00:00Z"}])


def env(**extra):
    base = {k: v for k, v in os.environ.items()
            if k not in ("PYTHONHASHSEED", R.RELAUNCH_FLAG, R.NO_RELAUNCH)}
    return {**base, **extra}


def test_template_rows_pass_and_header_is_the_organizer_template():
    t = pd.read_csv(R.TEMPLATE)
    assert R.template_columns() == ["asset_id", "alert_time_utc", "event_class", "fault_type", "confidence",
                                    "evidence", "recommended_action"]
    assert R.validate_submission(t, ASSETS) == []


@pytest.mark.parametrize("mutate,problem", [
    (lambda d: d.drop(columns=["evidence"]), "columns"),
    (lambda d: d.assign(alert_time_utc="2025-09-10 06:15"), "timestamps"),
    (lambda d: d.assign(asset_id="PUMP-10"), "outside target"),
    (lambda d: d.assign(confidence=1.5), "confidence"),
    (lambda d: d.assign(event_class="MAYBE"), "event_class"),
    (lambda d: d.assign(fault_type="GREMLINS"), "fault_type"),
    (lambda d: d.iloc[::-1].reset_index(drop=True), "sorted"),
    (lambda d: d.assign(alert_time_utc="2030-01-01T00:00:00Z"), "window"),
])
def test_schema_violations_are_reported(mutate, problem):
    bad = mutate(pd.read_csv(R.TEMPLATE))
    assert any(problem in p for p in R.validate_submission(bad, ASSETS))


def test_wrong_seed_is_relaunched_pinned_and_missing_seed_too():
    for e in (env(PYTHONHASHSEED="1"), env()):
        r = subprocess.run([sys.executable, SCRIPT, "selfcheck"], env=e, capture_output=True, text=True, cwd=ROOT)
        out = json.loads(r.stdout)
        assert r.returncode == 0 and out["seed_pinned"] and out["relaunched"] and out["hash_randomization"] == 0


def test_wrong_seed_without_relaunch_fails_before_data_access():
    r = subprocess.run([sys.executable, SCRIPT, "dev-run", "/nonexistent"],
                       env=env(PYTHONHASHSEED="1", **{R.NO_RELAUNCH: "1"}), capture_output=True, text=True, cwd=ROOT)
    assert r.returncode == 3 and "no data accessed" in r.stderr


def test_seed_set_after_start_is_not_trusted():
    code = ("import os,sys; sys.path.insert(0,'scripts'); os.environ['PYTHONHASHSEED']='0';"
            "import release_export as R; print(R.seed_pinned())")
    r = subprocess.run([sys.executable, "-c", code], env=env(PYTHONHASHSEED="5"), capture_output=True, text=True,
                       cwd=ROOT)
    assert r.stdout.strip() == "False"


def test_environment_mismatch_refuses(tmp_path):
    (tmp_path / "requirements.lock.txt").write_text("pandas==0.0.1\n")
    with pytest.raises(SystemExit) as e:
        R.ensure_environment(tmp_path)
    assert e.value.code == 4


def test_export_refuses_without_recorded_gate(monkeypatch, tmp_path, capsys):
    # Isolated from the real release gate/output so the suite stays valid after an approved release.
    def forbidden(*args, **kwargs):
        raise AssertionError("test telemetry read attempted")
    monkeypatch.setattr(pd, "read_parquet", forbidden)
    monkeypatch.setattr(R, "GATE", tmp_path / "BLIND_GATE.json")
    monkeypatch.setattr(R, "OUTPUT", tmp_path / "predictions_test.csv")
    with pytest.raises(SystemExit) as e:
        R.export()
    assert e.value.code == 5 and "no data accessed" in capsys.readouterr().err
    assert not (tmp_path / "predictions_test.csv").exists()


def test_test_assets_closed_without_gate_permission(monkeypatch):
    # The parquet reader is replaced, so even a broken gate can never read test measurements here.
    def forbidden(*args, **kwargs):
        raise AssertionError("test telemetry read attempted")
    monkeypatch.setattr(pd, "read_parquet", forbidden)
    with pytest.raises(PermissionError):
        R.load(["PUMP-10"])


def test_adapter_equals_causal_b1_and_validates():
    start = pd.Timestamp("2026-01-01", tz="UTC")
    n = 30 * 60
    i = np.arange(n)
    f = pd.DataFrame({"asset_id": "A", "window_start_utc": pd.date_range(start, periods=n, freq="min"), "rows": 60,
                      "running_fraction": 1., "operating_mode": "RUNNING",
                      "motor_speed_rpm__mean": 1500. + np.sin(i), "motor_speed_rpm__std": .1, "motor_speed_rpm__count": 60,
                      "discharge_pressure_kpa__mean": 200. + .3 * np.sin(i * .7), "discharge_pressure_kpa__std": .1,
                      "discharge_pressure_kpa__count": 60})
    f.loc[f.window_start_utc >= start + pd.Timedelta(hours=26), "discharge_pressure_kpa__mean"] += 80
    a = pd.DataFrame([{"asset_id": "A", "motor_rated_rpm": 1500., "window_start_utc": start.isoformat(),
                       "window_end_utc": (start + pd.Timedelta(hours=30)).isoformat()}])
    got = R.predict(f, a)
    want = predict_b1(f, a, {"A": a.window_end_utc.iloc[0]}, k=6, persist=15)
    assert len(got) and R.validate_submission(got, a) == []
    pd.testing.assert_frame_equal(got, want[R.template_columns()].reset_index(drop=True), check_dtype=False)


# --- review round 1 -----------------------------------------------------------------------------------

def _forbid_parquet(monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("test telemetry read attempted")
    monkeypatch.setattr(pd, "read_parquet", forbidden)


def _fixture(hours=30):
    start = pd.Timestamp("2026-01-01", tz="UTC")
    n = hours * 60
    i = np.arange(n)
    f = pd.DataFrame({"asset_id": "A", "window_start_utc": pd.date_range(start, periods=n, freq="min"), "rows": 60,
                      "running_fraction": 1., "operating_mode": "RUNNING",
                      "motor_speed_rpm__mean": 1500. + np.sin(i), "motor_speed_rpm__std": .1, "motor_speed_rpm__count": 60,
                      "discharge_pressure_kpa__mean": 200. + .3 * np.sin(i * .7), "discharge_pressure_kpa__std": .1,
                      "discharge_pressure_kpa__count": 60})
    f.loc[f.window_start_utc >= start + pd.Timedelta(hours=26), "discharge_pressure_kpa__mean"] += 80
    f = f[(f.window_start_utc < start + pd.Timedelta(hours=3)) | (f.window_start_utc >= start + pd.Timedelta(hours=4))]
    a = pd.DataFrame([{"asset_id": "A", "motor_rated_rpm": 1500., "window_start_utc": start.isoformat(),
                       "window_end_utc": (start + pd.Timedelta(hours=hours)).isoformat()}])
    return f, a


def test_registered_prefix_clocks_cover_commissioning_boundary_and_end():
    a = {"window_start_utc": "2026-01-01T00:00:00Z", "window_end_utc": "2026-01-08T00:00:00Z"}
    offs = [(c - pd.Timestamp(a["window_start_utc"])).total_seconds() for c in R.prefix_clocks(a)]
    assert {86399, 86400, 86401, 86460} <= set(offs) and offs[-1] == 7 * 86400 - 60 and offs == sorted(offs)


def test_prefix_audit_passes_for_the_causal_adapter_and_reports_only_metadata():
    f, a = _fixture()
    full = R.predict(f, a)
    assert len(full) >= 2
    rows = R.prefix_audit(f, a, full)
    assert rows and all(r["pass"] for r in rows)
    assert set(rows[0]) == {"asset_id", "offset_from_start_s", "compared_rows", "pass"}


def test_prefix_audit_detects_output_depending_on_future_rows():
    f, a = _fixture()
    full = R.predict(f, a)
    def leaky(feat, assets):                        # past confidence depends on how much data follows
        return R.predict(feat, assets).assign(confidence=lambda d: (d.confidence * 0 + len(feat) / 1e6).round(9))
    full_leaky = leaky(f, a)
    assert not all(r["pass"] for r in R.prefix_audit(f, a, full_leaky, predictor=leaky))


def test_canonical_comparison_is_null_safe_and_dtype_independent():
    x = pd.DataFrame({c: ["v"] for c in R.template_columns()}).assign(confidence=[.5], evidence=[None])
    y = x.astype({"evidence": "float64"}).assign(evidence=[np.nan], confidence=["0.5"])
    y["confidence"] = y.confidence.astype(float)
    assert R.canonical(x).equals(R.canonical(y))


def test_test_scope_must_be_exactly_the_approved_targets(monkeypatch):
    _forbid_parquet(monkeypatch)
    with pytest.raises(PermissionError):
        R.load(["PUMP-10", "PUMP-11"], allow_test=True)
    with pytest.raises(PermissionError):
        R.load(["PUMP-10", "PUMP-11", "PUMP-12", "PUMP-09"], allow_test=True)
    with pytest.raises(AssertionError, match="read attempted"):     # exact scope reaches the predicate read
        R.load(list(R.TARGETS), allow_test=True)


@pytest.mark.parametrize("tamper", ["assets.csv", "predictions_template.csv", "target_assets"])
def test_export_refuses_changed_identity_before_any_read(monkeypatch, tmp_path, tamper, capsys):
    _forbid_parquet(monkeypatch)
    m = {"code_sha256": {p: R.sha256(ROOT / p) for p in R.CODE},
         "data_identity": {"assets.csv": R.sha256(R.DATA / "assets.csv"),
                           "predictions_template.csv": R.sha256(R.TEMPLATE)},
         "target_assets": list(R.TARGETS)}
    if tamper == "target_assets":
        m["target_assets"] = ["PUMP-10", "PUMP-11", "PUMP-12", "PUMP-13"]
    else:
        m["data_identity"][tamper] = "0" * 64
    man = tmp_path / "manifest.json"
    man.write_text(json.dumps(m))
    gate = tmp_path / "gate.json"
    gate.write_text(json.dumps({"approved": True, "manifest_sha256": R.sha256(man)}))
    monkeypatch.setattr(R, "MANIFEST", man)
    monkeypatch.setattr(R, "GATE", gate)
    monkeypatch.setattr(R, "OUTPUT", tmp_path / "predictions_test.csv")
    with pytest.raises(SystemExit) as e:
        R.export()
    assert e.value.code == 5 and tamper in capsys.readouterr().err and not (tmp_path / "predictions_test.csv").exists()
