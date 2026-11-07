"""Task014 runner contracts on synthetic fixtures (no benchmark validation/test reads, no real scoring)."""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import run_validation_z995 as V
from retrofit_sim import baselines as B
from retrofit_doctor import synchronized_residual as S
from test_synchronized_residual import case, meta, START, REF_END, _snaps

AID = "PUMP-08"


def val_assets():
    return meta().assign(asset_id=AID, split="validation")


def val_data(categorical=True):
    raw, feat = case("q")
    feat = feat.assign(asset_id=AID)
    if categorical:
        raw = raw.assign(operating_mode=pd.Categorical(raw.operating_mode))
    snaps = _snaps().assign(asset_id=AID)
    return raw, feat, snaps


def events():
    return pd.DataFrame([{
        "event_id": f"{AID}-E1", "asset_id": AID, "event_class": "SENSOR", "fault_type": "SENSOR_NOISE_SPIKES",
        "onset_utc": (START + pd.Timedelta(hours=26)).isoformat(), "pre_existing": False,
        "detectable_utc": (START + pd.Timedelta(hours=26)).isoformat(), "action_deadline_utc": None,
        "end_utc": (START + pd.Timedelta(hours=30)).isoformat(), "severity": "moderate", "evidence_channels": None,
        "observable": True, "root_cause_event_id": None, "sensor_tag": "flow_m3_h", "label_confidence": "HIGH"}])


BENIGN = pd.DataFrame(columns=["asset_id", "benign_type", "start_utc", "end_utc", "note"])


@pytest.fixture(scope="module")
def piped():
    raw, feat, snaps = val_data()
    a = val_assets()
    tables, rtables, preds = V.pipeline(a, feat, {AID: raw}, snaps)
    return a, raw, feat, snaps, tables, rtables, preds


def test_pipeline_predicts_exactly_z995_and_b1(monkeypatch):
    seen = []
    real = S.predict_asset
    monkeypatch.setattr(S, "predict_asset", lambda c, *a, **k: (seen.append(c), real(c, *a, **k))[1])
    raw, feat, snaps = val_data()
    _, _, preds = V.pipeline(val_assets(), feat, {AID: raw}, snaps)
    assert set(seen) == {"B1", "Z995"} and set(preds) == {"B1", "Z995"}


def test_official_scoring_uses_validation_split(piped):
    a, _, _, _, _, _, preds = piped
    s, per, rep = V.score_validation("Z995", preds["Z995"], events(), a, BENIGN)
    assert rep["events_scored"] == 1 and s["events"] == 1 and s["detected"] == 1
    assert s["type_correct"] == 1 and s["sensor_type_and_channel"] == 1 and s["wrong_channel_claim_count"] == 0
    sb, _, _ = V.score_validation("B1", preds["B1"], events(), a, BENIGN)
    assert sb["type_correct"] == 0 and sb["wrong_specific_first"] == 0        # B1 said UNKNOWN: not specific
    with pytest.raises(Exception):                                         # train-labelled metadata is out of scope
        V.score_validation("Z995", preds["Z995"], events(), a.assign(split="train"), BENIGN)
    rows = V.per_asset_validation("Z995", preds["Z995"], per, events(), a, BENIGN)
    assert rows[0]["asset_id"] == AID and rows[0]["detected"] == 1 and rows[0]["alerts"] == len(preds["Z995"])


def test_transitions_and_adoption_gate_with_wrong_specific_and_channel_guard(piped):
    a, _, _, _, _, _, preds = piped
    sb, pb, _ = V.score_validation("B1", preds["B1"], events(), a, BENIGN)
    sz, pz, _ = V.score_validation("Z995", preds["Z995"], events(), a, BENIGN)
    tr = V.transitions(pb, pz)
    assert tr.changed.tolist() == [True] and tr.z_type_correct.iloc[0] and not tr.b1_type_correct.iloc[0]
    base = {"detected": 8, "type_correct": 4, "class_correct": 8, "false_plus_excess": 1, "sensor_type_and_channel": 2,
            "nuisance_benign": 1, "wrong_specific_first": 3, "wrong_channel_claim_count": 1}
    ok_tr = pd.DataFrame({"event_id": ["e"], "b1_type_correct": [True], "z_type_correct": [True],
                          "b1_type_and_channel": [True], "z_type_and_channel": [True]})
    passed, gate, _ = V.adoption(base, base, ok_tr, True, True)
    assert passed and all(gate.values())
    for change, key in (({"wrong_specific_first": 4}, "wrong_specific_not_above_b1"),
                        ({"wrong_channel_claim_count": 2}, "wrong_channel_not_above_b1"),
                        ({"nuisance_benign": 2}, "nuisance"), ({"false_plus_excess": 2}, "false_plus_excess"),
                        ({"detected": 7}, "detected"), ({"sensor_type_and_channel": 1}, "sensor_type_and_channel")):
        passed, gate, _ = V.adoption(base, {**base, **change}, ok_tr, True, True)
        assert not passed and not gate[key]
    lost = ok_tr.assign(z_type_correct=[False])
    passed, gate, lost_ids = V.adoption(base, base, lost, True, True)
    assert not passed and lost_ids["lost_type_events"] == ["e"]
    assert not V.adoption(base, base, ok_tr, False, True)[0] and not V.adoption(base, base, ok_tr, True, False)[0]


def test_causality_and_raw_audits_pass_with_categorical_raw(piped):
    a, raw, feat, snaps, tables, rtables, preds = piped
    assert isinstance(raw.operating_mode.dtype, pd.CategoricalDtype)
    audit = V.causality_audit(a, feat, snaps, tables, rtables, preds)
    assert len(audit) and audit["pass"].all() and set(audit.config) == {"B1", "Z995"}
    rawa = V.raw_audit(a, {AID: raw}, rtables, preds)
    assert len(rawa) == 10 and rawa["pass"].all()
    m = V.safe_mutate_raw_future(raw, REF_END)
    assert (m.loc[m.timestamp_utc >= REF_END, "operating_mode"] == "STOPPED").all()
    assert isinstance(raw.operating_mode.dtype, pd.CategoricalDtype)


def test_loader_reads_only_validation_ids(tmp_path, monkeypatch):
    raw, feat, snaps = val_data(categorical=False)
    other = feat.assign(asset_id="PUMP-10")
    pd.concat([feat, other, feat.assign(asset_id="PUMP-01")]).to_parquet(tmp_path / "features_1min.parquet")
    pd.concat([snaps, snaps.assign(asset_id="PUMP-11")]).to_parquet(tmp_path / "vibration_snapshots.parquet")
    meta_rows = pd.concat([val_assets(), val_assets().assign(asset_id="PUMP-09"),
                           val_assets().assign(asset_id="PUMP-10", split="test"),
                           val_assets().assign(asset_id="PUMP-01", split="train")])
    meta_rows.to_csv(tmp_path / "assets.csv", index=False)
    events().to_csv(tmp_path / "events_validation.csv", index=False)
    BENIGN.to_csv(tmp_path / "benign_windows_train_validation.csv", index=False)
    read = []
    monkeypatch.setattr(S, "read_asset_partition", lambda root, aid, *a: (read.append(aid), raw)[1])
    assets, f, s, r, caps, ev, bn = V.load_validation(tmp_path)
    assert sorted(assets.asset_id) == ["PUMP-08", "PUMP-09"] and set(f.asset_id) == {"PUMP-08"}
    assert set(s.asset_id) == {"PUMP-08"} and read == ["PUMP-08", "PUMP-09"] and set(r) == {"PUMP-08", "PUMP-09"}
    events().assign(asset_id="PUMP-10").to_csv(tmp_path / "events_validation.csv", index=False)
    with pytest.raises(RuntimeError, match="outside the allowlist"):
        V.load_validation(tmp_path)


def test_train_gate_evidence_check(tmp_path, monkeypatch):
    comp = tmp_path / "comparison.csv"
    pd.DataFrame([{"candidate": "Z995", "gate_pass": True, "correctness_pass": True}]).to_csv(comp, index=False)
    summ = tmp_path / "run_summary.json"
    summ.write_text(json.dumps({"selected": "Z995"}))
    monkeypatch.setattr(V, "ROOT", Path("/"))
    man = {"train_selection_evidence": {"comparison": str(comp), "run_summary": str(summ)}}
    assert V.train_gate_still_passes(man)
    summ.write_text(json.dumps({"selected": "E995"}))
    assert not V.train_gate_still_passes(man)


@pytest.mark.parametrize("case_", ["no_seal", "wrong_manifest", "code_changed", "evidence_changed", "completed", "seed"])
def test_validate_refuses_before_any_read(monkeypatch, tmp_path, case_):
    def forbidden(*a, **k):
        raise AssertionError("data read attempted")
    monkeypatch.setattr(pd, "read_parquet", forbidden)
    monkeypatch.setattr(pd, "read_csv", forbidden)
    code, evid = tmp_path / "code.py", tmp_path / "evidence.csv"
    code.write_text("x = 1\n")
    evid.write_text("e\n")
    man = tmp_path / "manifest.json"
    man.write_text(json.dumps({"code_sha256": {str(code): V.sha256(code)},
                               "train_selection_evidence": {"file_sha256": {str(evid): V.sha256(evid)}}}))
    seal = tmp_path / "SEAL.json"
    if case_ != "no_seal":
        seal.write_text(json.dumps({"manifest_sha256": "0" * 64 if case_ == "wrong_manifest" else V.sha256(man)}))
    if case_ == "code_changed":
        code.write_text("x = 2\n")
    if case_ == "evidence_changed":
        evid.write_text("f\n")
    if case_ == "completed":
        (tmp_path / "COMPLETED.json").write_text("{}")
    for name, val in (("ROOT", Path("/")), ("MANIFEST", man), ("SEAL", seal), ("OUT", tmp_path / "out"),
                      ("COMPLETED", tmp_path / "COMPLETED.json"), ("seed_pinned", lambda: case_ != "seed")):
        monkeypatch.setattr(V, name, val)
    with pytest.raises(SystemExit, match="no data accessed"):
        V.validate()
    assert not (tmp_path / "out").exists()


# --- review round 1 ----------------------------------------------------------------------------------------

def test_projection_keys_name_the_validation_split(piped):
    a, raw, feat, snaps, *_ = piped
    h = V.validation_projection_hashes(a, feat, snaps, events(), BENIGN)
    assert {"assets_validation_rows", "features_validation_rows", "snapshots_validation_rows", "events_validation",
            "benign_validation_rows"} <= set(h)
    assert not any("train" in k for k in h) and h["split"] == "validation" and h["test_touched"] is False
    assert h["allowlist"] == ["PUMP-08", "PUMP-09"]


def test_failed_train_evidence_refuses_before_validation_reads(monkeypatch, tmp_path):
    monkeypatch.setattr(V, "require_seal", lambda: {"train_selection_evidence": {}})
    monkeypatch.setattr(V, "train_gate_still_passes", lambda man: False)
    monkeypatch.setattr(V, "load_validation", lambda *a, **k: (_ for _ in ()).throw(AssertionError("validation read")))
    monkeypatch.setattr(V, "OUT", tmp_path / "out")
    with pytest.raises(SystemExit, match="no data accessed"):
        V.validate()
    assert not (tmp_path / "out").exists()


def test_official_report_context_and_serialisation(piped, tmp_path):
    a, *_, preds = piped
    _, _, rep = V.score_validation("Z995", preds["Z995"], events(), a, BENIGN)
    ctx = V.report_context(rep)
    assert ctx["split_validation"] and not ctx["assets_08_09"]            # fixture has one asset over 40 h
    V.save_json(tmp_path / "report_Z995.json", rep)
    back = json.loads((tmp_path / "report_Z995.json").read_text())
    assert back["split"] == "validation" and back["per_event"] and back["events_scored"] == 1
    good = {"split": "validation", "assets": ["PUMP-08", "PUMP-09"], "asset_days": 14.0}
    assert all(V.report_context(good).values())
    assert not V.report_context({**good, "asset_days": 13.99})["asset_days_14"]
    assert not V.report_context({**good, "split": "train"})["split_validation"]
