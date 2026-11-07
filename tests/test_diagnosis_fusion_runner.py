"""Task010 runner contracts on mocked fixture data (no benchmark reads)."""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import run_diagnosis_fusion as R
from retrofit_doctor import diagnosis_fusion as D
from test_diagnosis_fusion import START, CHANNELS, minutes, snap, reference_snaps

IDS = ("A", "B", "C")


def fixture():
    assets, feats, snaps, events = [], [], [], []
    for n, aid in enumerate(IDS):
        assets.append({"asset_id": aid, "split": "train", "motor_rated_rpm": 1500., "bearing_bpfo_order": 3.6,
                       "channels_available": CHANNELS, "window_start_utc": START.isoformat(),
                       "window_end_utc": (START + pd.Timedelta(hours=40)).isoformat()})
        f = minutes(aid=aid, steps=((26, 30, "discharge_pressure_kpa__mean", 80.), (34, 36, "motor_current_a__mean", 30.)))
        f = f[(f.window_start_utc < START + pd.Timedelta(hours=5)) | (f.window_start_utc >= START + pd.Timedelta(hours=6))]
        feats.append(f)                                    # early (pre-24 h) gateway gap on every asset
        for s in reference_snaps() + [snap(START + pd.Timedelta(hours=h), f"S{h}", seed=h, bpfo_impulses=.5 * (h > 30))
                                      for h in (26, 30, 34, 38)]:
            snaps.append({**s, "asset_id": aid, "snapshot_id": f"{aid}-{s['snapshot_id']}"})
        for eid, ft, cls, h0, h1, tag in (("E1", "DISCHARGE_RESTRICTION", "MACHINE", 26, 30, None),
                                          ("E2", "COMMUNICATION_LOSS", "SENSOR", 5, 6, "GATEWAY")):
            events.append({"event_id": f"{aid}-{eid}", "asset_id": aid, "event_class": cls, "fault_type": ft,
                           "onset_utc": (START + pd.Timedelta(hours=h0)).isoformat(), "pre_existing": False,
                           "detectable_utc": (START + pd.Timedelta(hours=h0)).isoformat(), "action_deadline_utc": None,
                           "end_utc": (START + pd.Timedelta(hours=h1)).isoformat(), "severity": "moderate",
                           "evidence_channels": None, "observable": True, "root_cause_event_id": None,
                           "sensor_tag": tag, "label_confidence": "HIGH"})
    return (pd.DataFrame(assets), pd.concat(feats, ignore_index=True), pd.DataFrame(snaps), pd.DataFrame(events))


@pytest.fixture(scope="module")
def run():
    assets, feat, snaps, events = fixture()
    tables, models, preds = R.pipeline(assets, feat, snaps, events)
    return assets, feat, snaps, events, tables, models, preds


def test_pipeline_fits_every_fold_without_its_held_out_asset(run):
    *_, models, preds = run
    prov = R.fold_provenance(models)
    assert {p["held_out"] for p in prov} == set(IDS)
    for p in prov:
        assert p["held_out"] not in p["fit_assets"] and p["fitted"] and p["fitted_state_sha256"]
        assert p["estimator_params"]["max_depth"] == 6 and p["feature_names"]
    emitted = {c: sorted(zip(p.asset_id, p.alert_time_utc)) for c, p in preds.items()}
    assert all(v == emitted["B1"] for v in emitted.values())
    assert (preds["B1"].b1_fault_type == "COMMUNICATION_LOSS").any()


def test_runner_audit_passes_for_every_candidate_including_b1_with_snapshots(run):
    assets, feat, snaps, _, tables, models, preds = run
    audit = R.causality_audit(assets, feat, snaps, tables, models, preds)
    assert {"alert", "reference_boundary", "snapshot_complete", "snapshot_age", "random"} <= set(audit.cut_kind)
    early = audit[(audit.cut_kind == "alert") & (pd.to_datetime(audit.cut_utc) < START + pd.Timedelta(hours=24))]
    assert len(early) and early.compared_rows.min() >= 1
    bad = audit[~audit["pass"]]
    assert bad.empty, bad.head().to_dict("records")


def test_audit_would_flag_waveform_provenance_supplied_to_b1(run, monkeypatch):
    assets, feat, snaps, _, tables, models, preds = run
    real = D.diagnose_asset
    monkeypatch.setattr(D, "diagnose_asset", lambda c, g, wf, m, inst: real(c, g, wf if wf is not None else
                        D.asset_waveform(g, snaps, assets[assets.asset_id == g.asset_id.iloc[0]]), m, inst))
    audit = R.causality_audit(assets.iloc[:1], feat, snaps, tables, models, preds)
    assert not audit[audit.candidate == "B1"]["pass"].all()     # old bug reproduced -> detected


def test_prediction_hashes_are_reproducible_and_input_hashes_train_only(run):
    assets, feat, snaps, events, *_ = run
    again = R.pipeline(assets, feat, snaps, events)[2]
    assert R.prediction_hashes(again) == R.prediction_hashes(run[-1])
    h = R.input_projection_hashes(assets, feat, snaps, events, None)
    assert h["asset_ids"] == list(IDS) and len(h["snapshots_train_rows"]) == 64
    mutated = snaps.copy()
    mutated.at[0, "samples"] = mutated.samples[0] * 2
    assert R.input_projection_hashes(assets, feat, mutated, events, None)["snapshots_train_rows"] != h["snapshots_train_rows"]


def test_scoring_outputs_have_per_asset_support_and_availability_schema(run):
    from run_regime_reference import evaluate
    assets, feat, snaps, events, tables, models, preds = run
    p = preds["X1"].assign(original_fault_type=preds["X1"].b1_fault_type, rule_id=preds["X1"].diagnosis_source)
    s, per, _, _ = evaluate("X1", p, events, assets, pd.DataFrame(columns=["asset_id", "start_utc", "end_utc"]))
    rows = R.per_asset("X1", p, per, events, assets, pd.DataFrame(columns=["asset_id", "start_utc", "end_utc"]))
    assert [r["asset_id"] for r in rows] == list(IDS) and sum(r["events"] for r in rows) == s["events"]
    av = R.availability(preds)
    assert {"fallback_to_b1", "alerts"} <= set(av.columns) and set(av.candidate) == set(D.CANDIDATES)
    sup = R.held_out_type_support(models, events)
    assert all("unpredictable_types" in x for x in sup)
    assert any("COMMUNICATION_LOSS" in x["unpredictable_types"] for x in sup)   # protected type never learned


# --- seal / no-data guard ----------------------------------------------------------------------------------

def _no_reads(monkeypatch):
    def forbidden(*a, **k):
        raise AssertionError("data read attempted")
    monkeypatch.setattr(pd, "read_parquet", forbidden)
    monkeypatch.setattr(pd, "read_csv", forbidden)


@pytest.mark.parametrize("case", ["no_seal", "wrong_manifest", "code_changed", "completed", "seed"])
def test_train_refuses_before_any_read(monkeypatch, tmp_path, case):
    _no_reads(monkeypatch)
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
    monkeypatch.setattr(R, "ROOT", Path("/"))
    monkeypatch.setattr(R, "MANIFEST", man)
    monkeypatch.setattr(R, "SEAL", seal)
    monkeypatch.setattr(R, "OUT", tmp_path / "out")
    monkeypatch.setattr(R, "COMPLETED", tmp_path / "COMPLETED.json")
    monkeypatch.setattr(R, "seed_pinned", lambda: case != "seed")
    with pytest.raises(SystemExit, match="no data accessed"):
        R.train()
    assert not (tmp_path / "out").exists()


@pytest.mark.parametrize("s,ok", [
    ({"detected": 18, "class_correct": 14, "false_plus_excess": 6, "sensor_type_and_channel": 3, "type_correct": 10}, True),
    ({"detected": 17, "class_correct": 14, "false_plus_excess": 6, "sensor_type_and_channel": 3, "type_correct": 12}, False),
    ({"detected": 18, "class_correct": 13, "false_plus_excess": 6, "sensor_type_and_channel": 3, "type_correct": 12}, False),
    ({"detected": 18, "class_correct": 14, "false_plus_excess": 7, "sensor_type_and_channel": 3, "type_correct": 12}, False),
    ({"detected": 18, "class_correct": 14, "false_plus_excess": 6, "sensor_type_and_channel": 2, "type_correct": 12}, False),
    ({"detected": 18, "class_correct": 14, "false_plus_excess": 6, "sensor_type_and_channel": 3, "type_correct": 9}, False),
    ({"detected": 18, "class_correct": 14, "false_plus_excess": 6, "sensor_type_and_channel": 4, "type_correct": 9}, True),
    ({"detected": 18, "class_correct": 14, "false_plus_excess": 6, "sensor_type_and_channel": 4, "type_correct": 8}, False),
])
def test_gate_boundaries(s, ok):
    assert R.gate_passes(s) is ok
