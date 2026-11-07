"""Export the Task015 diagnosis-comparison bundle (web/data/diagnosis-comparison.json).

Read-only inputs, nothing is re-scored or re-fitted:
  * the sealed Task013 train run (frozen Z995 selected) and the sealed Task014 descriptive validation run:
    stored B1/Z995 predictions (hash-checked against each run's provenance), comparison, per-event results;
  * train/validation event labels for the four demonstrated cases only (retrospective overlay);
  * public passport rows (assets.csv) for the four case assets;
  * ONE closed train minute of raw 1 Hz telemetry (PUMP-04, 2025-06-18 22:05:00 <= t < 22:06:00) for the
    measured-versus-curve chart. Its synchronized residual statistics are recomputed with the unchanged Task013
    `terms()` and asserted equal to the stored rule_detail before export.
No test asset, test telemetry or test prediction is read. Existing web/data files are not touched.

Usage: PYTHONHASHSEED=0 ../../work/.venv/bin/python scripts/export_diagnosis_comparison.py [--out web/data]
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
from pathlib import Path
import sys

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "src"), str(ROOT / "vendor/benchmark/src")]
from retrofit_doctor import synchronized_residual as S  # noqa: E402
from retrofit_doctor import hydraulic_spread as H  # noqa: E402

csv.field_size_limit(10**9)
DATA = ROOT / "vendor/benchmark/data/full"
TRAIN_RUN = ROOT / "results/synchronized_residual/run-20261107T093222280839Z"
VAL_RUN = ROOT / "results/validation_z995/run-20261107T094945244932Z"
SCHEMA = "retrofit-doctor-diagnosis-comparison/1"
TRAIN_ASSETS = {f"PUMP-0{i}" for i in range(1, 8)}
VAL_ASSETS = {"PUMP-08", "PUMP-09"}
# Coordinator-selected cases (docs/tasks/015-case-selection.md). Role is display ordering only.
CASES = [
    {"caseId": "pump04-train", "assetId": "PUMP-04", "split": "train", "alert": "2025-06-18T22:06:00Z", "eventId": "PUMP-04-E03"},
    {"caseId": "pump02-train", "assetId": "PUMP-02", "split": "train", "alert": "2025-12-07T10:32:00Z", "eventId": "PUMP-02-E02"},
    {"caseId": "pump08-validation", "assetId": "PUMP-08", "split": "validation", "alert": "2025-09-11T20:47:00Z", "eventId": "PUMP-08-E02"},
    {"caseId": "pump01-train", "assetId": "PUMP-01", "split": "train", "alert": "2025-08-12T19:27:00Z", "eventId": "PUMP-01-E01"},
]
RAW_CASE = {"caseId": "pump04-train", "assetId": "PUMP-04", "day": "2025-06-18",
            "start": "2025-06-18T22:05:00Z", "end": "2025-06-18T22:06:00Z"}
PRED_FIELDS = ["event_class", "fault_type", "confidence", "evidence", "recommended_action", "suspected_channel",
               "diagnosis_source", "b1_fault_type", "b1_event_class"]
WF_FIELDS = ["wf_status", "wf_speed_check", "wf_snapshot_id", "wf_complete_utc", "wf_age_s", "wf_reference_snapshots"]
SCORE_FIELDS = ["events", "detected", "type_correct", "class_correct", "false_episodes", "excess_repeats",
                "false_plus_excess", "nuisance_benign", "alerts", "sensor_events", "sensor_type_and_channel",
                "wrong_specific_first", "composite_score"]
LABEL_FIELDS = ["event_id", "asset_id", "event_class", "fault_type", "sensor_tag", "onset_utc", "end_utc"]

read_files: dict[str, str] = {}


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def rel(p: Path) -> str:
    return p.relative_to(ROOT).as_posix()


def read(p: Path) -> bytes:
    b = p.read_bytes()
    read_files[rel(p)] = sha256_bytes(b)
    return b


def rows(p: Path):
    return list(csv.DictReader(read(p).decode().splitlines()))


def jload(p: Path):
    return json.loads(read(p))


def verify_run(run: Path, assets_allowed: set[str]):
    prov = jload(run / "run_provenance.json")
    assert prov.get("test_touched") is False, run
    preds = {}
    for c in ("B1", "Z995"):
        b = read(run / f"predictions_{c}.csv")
        assert sha256_bytes(b) == prov["prediction_sha256"][c], f"{run.name} {c} prediction hash mismatch"
        preds[c] = list(csv.DictReader(b.decode().splitlines()))
        assert {r["asset_id"] for r in preds[c]} <= assets_allowed, f"{run.name} {c} unexpected asset"
    return prov, preds


def changed_alerts(preds):
    b1 = {(r["asset_id"], r["alert_time_utc"]): r for r in preds["B1"]}
    z = {(r["asset_id"], r["alert_time_utc"]): r for r in preds["Z995"]}
    assert b1.keys() == z.keys(), "Z995 must keep B1 alert times"
    out = []
    for k in sorted(z):
        if (b1[k]["event_class"], b1[k]["fault_type"], b1[k]["suspected_channel"]) != (
                z[k]["event_class"], z[k]["fault_type"], z[k]["suspected_channel"]):
            out.append({"assetId": k[0], "alertUtc": k[1], "b1": f"{b1[k]['event_class']} · {b1[k]['fault_type']}",
                        "b1Channel": b1[k]["suspected_channel"] or None, "z995": f"{z[k]['event_class']} · {z[k]['fault_type']}",
                        "z995Channel": z[k]["suspected_channel"] or None, "source": z[k]["diagnosis_source"]})
    return out


def score(rows_, cand):
    r = next(x for x in rows_ if x["candidate"] == cand)
    return {k: r.get(k) for k in SCORE_FIELDS if k in r}


def train_transitions():
    b1 = {r["event_id"]: r for r in rows(TRAIN_RUN / "per_event_B1.csv")}
    z = {r["event_id"]: r for r in rows(TRAIN_RUN / "per_event_Z995.csv")}
    assert b1.keys() == z.keys() and len(z) == 26
    assert {r["asset_id"] for r in [*b1.values(), *z.values()]} <= TRAIN_ASSETS, "per-event rows outside the train split"
    side = lambda r: {"detected": r["detected"] == "True", "type": r["emitted_type"] or None, "channel": r["emitted_channel"] or None,
                      "typeCorrect": r["type_correct"] == "True", "typeAndChannel": r["type_and_channel"] == "True"}
    out = []
    for eid in sorted(z):
        e = z[eid]
        out.append({"eventId": eid, "assetId": e["asset_id"], "eventClass": e["event_class"], "faultType": e["fault_type"],
                    "sensorTag": e["sensor_tag"] or None, "b1": side(b1[eid]), "z995": side(e)})
    for t in out:
        t["changed"] = t["b1"] != t["z995"]
    return out


def validation_transitions():
    out = []
    for r in rows(VAL_RUN / "event_transitions.csv"):
        side = lambda p: {"detected": r[f"{p}_detected"] == "True", "type": r[f"{p}_predicted_fault_type"] or None,
                          "channel": r[f"{p}_predicted_channel"] or None, "typeCorrect": r[f"{p}_type_correct"] == "True",
                          "typeAndChannel": r[f"{p}_type_and_channel"] == "True"}
        out.append({"eventId": r["event_id"], "assetId": r["asset_id"], "eventClass": r["event_class"],
                    "faultType": r["fault_type"], "sensorTag": r["sensor_tag"] or None, "b1": side("b1"), "z995": side("z"),
                    "changed": r["changed"] == "True"})
    assert len(out) == 9
    assert {t["assetId"] for t in out} <= VAL_ASSETS, "transition rows outside the validation split"
    return out


def raw_minute(assets):
    """One closed train minute, rows strictly inside [start, end); statistics re-derived and asserted."""
    a = assets[RAW_CASE["assetId"]]
    assert a["split"] == "train"
    p = DATA / "telemetry" / f"asset_id={RAW_CASE['assetId']}" / f"day={RAW_CASE['day']}" / "part-0.parquet"
    read(p)
    r = pd.read_parquet(p, columns=S.RAW_COLUMNS)
    t = pd.to_datetime(r.timestamp_utc, utc=True)
    lo, hi = pd.Timestamp(RAW_CASE["start"]), pd.Timestamp(RAW_CASE["end"])
    m = r[(t >= lo) & (t < hi)].copy()                         # a row exactly at the minute end is the next minute
    m["t"] = pd.to_datetime(m.timestamp_utc, utc=True)
    m = m.sort_values("t", kind="stable")
    ok = (m.operating_mode.astype(str) == "RUNNING") & np.isfinite(m[list(S.RAW.values())].astype(float)).all(axis=1) \
        & (m[S.RAW["q"]] > 0) & (m[S.RAW["n"]] > 0)
    m = m[ok]
    passport = H._passport(pd.Series(a))
    X, E = S.terms(m[S.RAW["q"]], m[S.RAW["ps"]], m[S.RAW["pd"]], m[S.RAW["n"]], passport)
    E = np.asarray(E, "float64")
    measured_rise = X["pd"] + X["ps"]                          # Pd - Ps, kPa
    curve_rise = -(X["q"] + X["n"])                            # public pump-curve pressure rise at (Q, n), kPa
    return m, passport, E, measured_rise, curve_rise


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "web/data"))
    out_dir = Path(ap.parse_args().out)

    train_prov, train_preds = verify_run(TRAIN_RUN, TRAIN_ASSETS)
    val_prov, val_preds = verify_run(VAL_RUN, VAL_ASSETS)
    seals = {k: jload(p) for k, p in {"trainSeal": TRAIN_RUN.parent / "SEAL.json", "trainCompleted": TRAIN_RUN.parent / "COMPLETED.json",
                                      "validationSeal": VAL_RUN.parent / "SEAL.json", "validationCompleted": VAL_RUN.parent / "COMPLETED.json"}.items()}
    assert seals["trainCompleted"]["selected"] == "Z995" and seals["trainCompleted"]["run_dir"] == rel(TRAIN_RUN)
    assert seals["validationCompleted"]["run_dir"] == rel(VAL_RUN) and seals["validationCompleted"]["adoption_pass"] is True
    assert seals["trainSeal"]["manifest_sha256"] == train_prov["manifest_sha256"]
    assert seals["validationSeal"]["manifest_sha256"] == val_prov["manifest_sha256"]

    train_cmp, val_cmp = rows(TRAIN_RUN / "comparison.csv"), rows(VAL_RUN / "comparison.csv")
    t_changes, v_changes = changed_alerts(train_preds), changed_alerts(val_preds)
    t_events, v_events = train_transitions(), validation_transitions()   # before filesRead is snapshotted below
    assert len(t_changes) == 2 and len(v_changes) == 3, (len(t_changes), len(v_changes))

    asset_rows = {r["asset_id"]: r for r in rows(DATA / "assets.csv") if r["asset_id"] in {c["assetId"] for c in CASES}}
    assert all(asset_rows[c["assetId"]]["split"] == c["split"] for c in CASES)
    labels = {}
    for split in ("train", "validation"):
        for r in rows(DATA / f"events_{split}.csv"):
            if r["event_id"] in {c["eventId"] for c in CASES}:
                labels[r["event_id"]] = {k: (r.get(k) or None) for k in LABEL_FIELDS}

    m, passport, E, mrise, crise = raw_minute(asset_rows)
    cases = []
    for c in CASES:
        preds = train_preds if c["split"] == "train" else val_preds
        key = (c["assetId"], c["alert"])
        b1 = next(r for r in preds["B1"] if (r["asset_id"], r["alert_time_utc"]) == key)
        z = next(r for r in preds["Z995"] if (r["asset_id"], r["alert_time_utc"]) == key)
        detail = json.loads(z["rule_detail"])
        alert = pd.Timestamp(c["alert"])
        case = {
            "caseId": c["caseId"], "assetId": c["assetId"], "split": c["split"], "alertUtc": c["alert"],
            "minuteStartUtc": (alert - pd.Timedelta(minutes=1)).strftime("%Y-%m-%dT%H:%M:%SZ"), "minuteEndUtc": c["alert"],
            "b1": {k: b1[k] or None for k in ("event_class", "fault_type", "confidence", "evidence", "recommended_action", "suspected_channel")},
            "z995": {**{k: z[k] or None for k in PRED_FIELDS},
                     "waveform": {**{k: z[k] or None for k in WF_FIELDS},
                                  "features": json.loads(z["wf_features"]) if z["wf_features"] else None},
                     "ruleDetail": detail},
            "label": labels[c["eventId"]],
            "passport": {k: asset_rows[c["assetId"]].get(k) for k in ("asset_id", "split", "site", "system", "instrumentation_tier",
                                                                       "channels_available", "control")},
        }
        if c["caseId"] == RAW_CASE["caseId"]:
            md = detail["minute"]
            assert len(E) == md["paired"] == 60
            assert abs(float(np.std(E, ddof=1)) - md["std_E_kpa"]) < 1e-6, (float(np.std(E, ddof=1)), md["std_E_kpa"])
            assert abs(float(np.mean(E)) - md["mean_E_kpa"]) < 1e-6
            assert abs(float(np.var(E, ddof=1)) - md["var_E_kpa2"]) < 1e-5
            case["rawMinute"] = {
                "source": f"vendor/benchmark/data/full/telemetry/asset_id={RAW_CASE['assetId']}/day={RAW_CASE['day']}/part-0.parquet",
                "window": f"{RAW_CASE['start']} <= t < {RAW_CASE['end']} (a row exactly at the minute end belongs to the next minute)",
                "equation": "E = Pd - Ps + (rho g/1000)(H0-Hb)(Q/Qb)^2 - (rho g/1000) H0 (n/nr)^2; measured rise = Pd - Ps; "
                            "curve-derived rise = (rho g/1000)[H0 (n/nr)^2 - (H0-Hb)(Q/Qb)^2]",
                "passport": passport,
                "recomputedStdE_kpa": round(float(np.std(E, ddof=1)), 9),
                "t": [ts.strftime("%Y-%m-%dT%H:%M:%SZ") for ts in m.t],
                "q_m3_h": [round(float(v), 6) for v in m[S.RAW["q"]]], "ps_kpa": [round(float(v), 6) for v in m[S.RAW["ps"]]],
                "pd_kpa": [round(float(v), 6) for v in m[S.RAW["pd"]]], "n_rpm": [round(float(v), 6) for v in m[S.RAW["n"]]],
                "measuredRise_kpa": [round(float(v), 6) for v in mrise], "curveRise_kpa": [round(float(v), 6) for v in crise],
            }
        cases.append(case)

    bundle = {
        "schema": SCHEMA,
        "notice": "Research comparison, not a production-detector replacement. Synthetic benchmark measurements; Z995 was "
                  "adaptively developed on inspected training assets; validation (PUMP-08/09) was already inspected, so "
                  "its result is descriptive and development-informed. No test asset, telemetry or prediction is included.",
        "provenance": {
            "generator": "scripts/export_diagnosis_comparison.py", "selectedCandidate": "Z995",
            "train": {"runDir": rel(TRAIN_RUN), "manifestSha256": train_prov["manifest_sha256"],
                      "predictionSha256": {k: train_prov["prediction_sha256"][k] for k in ("B1", "Z995")},
                      "codeSha256": train_prov["code_sha256"], "inputs": train_prov["inputs"], "seal": seals["trainSeal"],
                      "completed": seals["trainCompleted"]},
            "validation": {"runDir": rel(VAL_RUN), "manifestSha256": val_prov["manifest_sha256"],
                           "predictionSha256": val_prov["prediction_sha256"], "codeSha256": val_prov["code_sha256"],
                           "inputs": val_prov["inputs"], "seal": seals["validationSeal"], "completed": seals["validationCompleted"]},
            "filesRead": dict(sorted(read_files.items())),
        },
        "scorecard": {
            "train": {"scope": "Train · 7 pumps (PUMP-01..07) · 26 events · 49 asset-days", "b1": score(train_cmp, "B1"),
                      "z995": score(train_cmp, "Z995"), "changedAlerts": t_changes, "events": t_events},
            "validation": {"scope": "Validation · 2 pumps (PUMP-08/09) · 9 events · 14 asset-days · previously inspected",
                           "b1": score(val_cmp, "B1"), "z995": score(val_cmp, "Z995"), "changedAlerts": v_changes,
                           "events": v_events,
                           "rawAggregationChecks": 0,
                           "rawNote": "Zero applicable raw-aggregation checks: PUMP-08 has no flow meter and PUMP-09 no measured speed, so the hydraulic residual could not be applied. The validation gain comes from the waveform refinement only."},
        },
        "cases": cases,
    }
    assert bundle["provenance"]["filesRead"] == dict(sorted(read_files.items())), "a source was read after provenance"
    out_dir.mkdir(parents=True, exist_ok=True)
    text = json.dumps(bundle, ensure_ascii=False, indent=1, sort_keys=False) + "\n"
    (out_dir / "diagnosis-comparison.json").write_text(text)
    print(f"wrote {out_dir / "diagnosis-comparison.json"} ({len(text):,} bytes, sha256 {sha256_bytes(text.encode())})")


if __name__ == "__main__":
    main()
