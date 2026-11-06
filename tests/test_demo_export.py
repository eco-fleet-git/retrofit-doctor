"""Demo bundle export: split separation, provenance, determinism and locked baseline figures.

Expected values are literals from docs/ux/STATES_AND_ACCEPTANCE.md and CAUSAL_B1_FINDINGS.md.
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
TEST_IDS = ("PUMP-10", "PUMP-11", "PUMP-12")


def load_exporter():
    spec = importlib.util.spec_from_file_location("export_demo", ROOT / "scripts/export_demo.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def export(tmp_path_factory):
    exporter = load_exporter()
    seen = []
    original = pd.read_parquet

    def recording_read_parquet(path, *args, **kwargs):
        frame = original(path, *args, **kwargs)
        seen.append((Path(path).name, kwargs.get("filters"), sorted(frame.asset_id.unique())))
        return frame

    exporter.pd.read_parquet = recording_read_parquet
    try:
        out = tmp_path_factory.mktemp("bundle")
        exporter.build(out)
        again = tmp_path_factory.mktemp("bundle_again")
        exporter.build(again)
    finally:
        exporter.pd.read_parquet = original
    files = {p.name: p.read_bytes() for p in out.iterdir()}
    return {"out": out, "again": again, "files": files, "reads": seen,
            "json": {name: json.loads(data) for name, data in files.items()}}


def test_only_validation_replay_features_are_read(export):
    for name, filters, ids in export["reads"]:
        assert ids == ["PUMP-08", "PUMP-09"], name
        assert filters is not None, "assets must be filtered inside the Parquet read"


def test_bundle_files_and_split_separation(export):
    assert sorted(export["files"]) == ["fleet.json", "replay-PUMP-08.json", "replay-PUMP-09.json"]
    for name in ("replay-PUMP-08.json", "replay-PUMP-09.json"):
        text = export["files"][name].decode()
        for test_id in TEST_IDS:
            assert test_id not in text, f"{test_id} leaked into {name}"


def test_fleet_lists_twelve_assets_with_test_metadata_only(export):
    assets = export["json"]["fleet.json"]["assets"]
    assert [a["assetId"] for a in assets] == [f"PUMP-{i:02d}" for i in range(1, 13)]
    splits = [a["split"] for a in assets]
    assert (splits.count("train"), splits.count("validation"), splits.count("test")) == (7, 2, 3)
    by_id = {a["assetId"]: a for a in assets}
    for test_id in TEST_IDS:
        assert by_id[test_id]["mode"] == "TEST_METADATA_ONLY"
        assert by_id[test_id]["replayFile"] is None
    assert [len(by_id[i]["channelsAvailable"]) for i in TEST_IDS] == [11, 6, 13]
    assert "motor_speed_rpm" not in by_id["PUMP-12"]["channelsAvailable"]
    assert by_id["PUMP-12"]["ratedRpmMetadata"] == 2935


def test_export_is_deterministic(export):
    for name, data in export["files"].items():
        assert (export["again"] / name).read_bytes() == data, name


def test_provenance_names_synthetic_source_and_hashes(export):
    prov = export["json"]["fleet.json"]["provenance"]
    assert "Synthetic" in prov["dataNature"]
    assert prov["featureFilter"] == {"assetIds": ["PUMP-08", "PUMP-09"], "testTelemetryLoaded": False, "testLabelsLoaded": False}
    paths = {i["path"] for i in prov["inputs"]}
    assert "vendor/benchmark/data/full/features_1min.parquet" in paths
    assert all(len(i["sha256"]) == 64 for i in prov["inputs"])


def test_locked_baseline_figures_are_exact(export):
    rows = {(r["version"], r["split"]): r for r in export["json"]["fleet.json"]["evidence"]["comparison"]}
    causal, original = rows["causal", "validation"], rows["original", "validation"]
    assert causal["composite_score"].startswith("76.01253946")
    assert original["composite_score"].startswith("78.01253946")
    assert (causal["true_positive_events"], causal["events_scored"]) == ("8", "9")
    assert (original["true_positive_events"], original["events_scored"]) == ("8", "9")
    assert (causal["false_alert_episodes"], original["false_alert_episodes"]) == ("1", "1")
    assert (causal["alerts_scored"], original["alerts_scored"]) == ("15", "16")
    verification = export["json"]["fleet.json"]["evidence"]["verification"]
    assert (verification["causality_checks_passed"], verification["tests_passed"]) == (209, 18)


def test_pump08_strainer_alert_is_verbatim(export):
    alerts = export["json"]["replay-PUMP-08.json"]["alerts"]
    assert alerts[0] == {
        "asset_id": "PUMP-08", "alert_time_utc": "2025-09-10T12:38:00Z", "event_class": "MACHINE",
        "fault_type": "SUCTION_STRAINER_CLOGGING", "confidence": "0.5587501525878906",
        "evidence": "B1 mode-aware z: suction_pressure_kpa z=-6.7", "recommended_action": "Inspect / clean suction strainer.",
    }
    assert len(alerts) + len(export["json"]["replay-PUMP-09.json"]["alerts"]) == 15


def test_first_day_rows_never_carry_z_scores(export):
    for name, reference_end in (("replay-PUMP-08.json", "2025-09-09T00:00:00Z"), ("replay-PUMP-09.json", "2026-02-10T00:00:00Z")):
        replay = export["json"][name]
        status = replay["rows"]["referenceStatus"]
        assert replay["referenceEndUtc"] == reference_end
        assert set(status[:1440]) == {"COLLECTING_REFERENCE"}
        assert "COLLECTING_REFERENCE" not in status[1440:]
        for channel in replay["channels"].values():
            if channel["z"] is not None:
                assert all(v is None for v in channel["z"][:1440])


def test_sparse_t1_vibration_is_not_forward_filled(export):
    vib = export["json"]["replay-PUMP-08.json"]["channels"]["vibration_rms_mm_s"]
    assert vib["nativeUpdateSeconds"] == 300 and vib["unit"] == "mm/s"
    idx = [i for i, v in enumerate(vib["mean"]) if v is not None]
    assert min(b - a for a, b in zip(idx, idx[1:])) >= 4
    assert export["json"]["replay-PUMP-09.json"]["channels"]["vibration_rms_mm_s"]["nativeUpdateSeconds"] == 1
    assert export["json"]["replay-PUMP-08.json"]["channels"]["suction_pressure_kpa"]["unit"] == "kPa(g)"


def test_experiments_section_reports_reviewed_results_verbatim(export):
    ex = export["json"]["fleet.json"]["experiments"]
    assert (ex["b2"]["selected"], ex["regime"]["selected"], ex["sparse"]["selected"]) == ("C0", "R0", "S0")
    b2 = {r["candidate"]: r for r in ex["b2"]["rows"]}
    assert b2["C0"]["composite_score"] == "59.20719120527966"  # equals causal B1 train
    assert (b2["C1"]["detected"], b2["C1"]["type_correct"], b2["C1"]["false_plus_excess"]) == ("21", "7", "21")
    assert b2["C1"]["passes"] == "False"
    assert ex["b2"]["priorRuns"][0]["status"] == "INVALID"
    assert ex["regime"]["e4"].startswith("not scored")
    assert ex["regime"]["validationRun"] is False
    assert [h["hypothesis"][:2] for h in ex["hypotheses"]] == ["H1", "H2", "H3", "H4", "H5", "H6", "H7"]


def test_ablation_pairs_keep_original_denominators_and_restore_equality(export):
    ab = export["json"]["fleet.json"]["experiments"]["ablation"]
    train = {(r["scope"], r["branch"]): r for r in ab["summary"]["train"]}
    full, masked = train["pooled", "full"], train["pooled", "mask:vibration_temperature"]
    assert (full["events"], full["detected"], full["type_correct"]) == ("10", "9", "2")
    assert (masked["events"], masked["detected"], masked["type_correct"]) == ("10", "8", "0")
    assert all(r["categorical_exact"] == "True" for split in ab["restoreCheck"].values() for r in split)
    changed = {e["event_id"] for e in ab["paired"]["train"]["vibration_temperature"]}
    assert {"PUMP-02-E01", "PUMP-04-E04"} <= changed  # lost when masked; adverse: detected only when masked
    adverse = next(e for e in ab["paired"]["train"]["vibration_temperature"] if e["event_id"] == "PUMP-04-E04")
    assert (adverse["full"]["detected"], adverse["mask"]["detected"]) == ("False", "True")


def test_experiments_section_names_no_test_asset(export):
    text = json.dumps(export["json"]["fleet.json"]["experiments"])
    for test_id in TEST_IDS:
        assert test_id not in text
