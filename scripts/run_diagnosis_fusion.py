"""Task010 diagnosis-fusion runner (train LOAO only).

  PYTHONHASHSEED=0 python scripts/run_diagnosis_fusion.py selfcheck   # seed/manifest/code hashes; no data
  PYTHONHASHSEED=0 python scripts/run_diagnosis_fusion.py train       # refuses without a matching coordinator SEAL

Phase 1 never scores. `train` requires results/diagnosis_fusion/SEAL.json approving the exact manifest SHA-256
and the code hashes listed in that manifest. It reads train assets PUMP-01..07 only (asserted predicates),
fits the learners per fold on the six other assets and writes the run provenance (inputs, fitted state,
prediction hashes) BEFORE scoring. It then scores all declared candidates once and writes comparison,
per-asset, per-event, support, causality and determinism artifacts. Each attempt writes a new run directory;
a partial failed run is preserved, and a completed run blocks any further attempt. No validation/test access.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "src"), str(ROOT / "vendor/benchmark/src"), str(ROOT / "scripts")]
from retrofit_sim import baselines as B
from retrofit_sim import scoring as S
from retrofit_doctor import diagnosis_fusion as D
from run_b1 import canonical_predictions, save_json, sha256

OUT = ROOT / "results/diagnosis_fusion"
DATA = ROOT / "vendor/benchmark/data/full"
MANIFEST = ROOT / "docs/experiments/followup/2026-11-07-diagnosis-fusion-manifest.json"
SEAL = OUT / "SEAL.json"
COMPLETED = OUT / "COMPLETED.json"
CONTROL_PRED = ROOT / "results/causal_b1/predictions_causal_train.csv"
CONTROL_EXPECT = {"detected": 18, "type_correct": 8, "class_correct": 14, "false_plus_excess": 6,
                  "sensor_type_and_channel": 3, "events": 26}
GATE = {"detected_min": 18, "class_correct_min": 14, "false_plus_excess_max": 6, "sensor_type_and_channel_min": 3}
AUDIT_SEED, RANDOM_CUTS, SNAPSHOT_CUTS = 0, 5, 3


def seed_pinned():
    return os.environ.get("PYTHONHASHSEED") == "0" and sys.flags.hash_randomization == 0


def require_seal():
    if not seed_pinned():
        raise SystemExit("PYTHONHASHSEED=0 must be set at interpreter start; no data accessed")
    if COMPLETED.exists():
        raise SystemExit("Task010 wave already completed; refusing a second score; no data accessed")
    if not SEAL.exists():
        raise SystemExit("no coordinator SEAL for Task010; no data accessed")
    seal, man = json.loads(SEAL.read_text()), json.loads(MANIFEST.read_text())
    if seal.get("manifest_sha256") != sha256(MANIFEST):
        raise SystemExit("SEAL does not approve this manifest; no data accessed")
    changed = [p for p, h in man["code_sha256"].items() if sha256(ROOT / p) != h]
    if changed:
        raise SystemExit(f"sealed code changed: {changed}; no data accessed")
    return man


def gate_passes(s):
    base = (s["detected"] >= GATE["detected_min"] and s["class_correct"] >= GATE["class_correct_min"]
            and s["false_plus_excess"] <= GATE["false_plus_excess_max"]
            and s["sensor_type_and_channel"] >= GATE["sensor_type_and_channel_min"])
    return bool(base and (s["type_correct"] >= 10 or (s["type_correct"] >= 9 and s["sensor_type_and_channel"] >= 4)))


def useful(per):
    return int((per.type_correct & ((per.event_class != "SENSOR") | per.type_and_channel)).sum())


# --- pipeline (pure over in-memory inputs; fixtures use it directly) -------------------------------------

def fit_fold(held, assets, frames, wfs, ev):
    fit_ids = tuple(a for a in sorted(assets.asset_id) if a != held)
    fa = assets[assets.asset_id.isin(fit_ids)]
    fr = {a: frames[a] for a in fit_ids}
    wf = {a: wfs[a] for a in fit_ids}
    fe = ev[ev.asset_id.isin(fit_ids)]
    assert held not in set(fe.asset_id) and held not in fr and held not in wf
    return {kind: D.fit_model(kind, fr, wf, fe, fit_ids, fa, model_id=f"{kind}/heldout-{held}")
            for kind in ("minute", "fused")}


def model_for(c, models):
    return models[D.LEARNER_KIND[c]] if c in D.LEARNER_KIND else None


def pipeline(assets, feat, snaps, events):
    """Fit every LOAO fold and predict every candidate on its held-out asset."""
    from run_sensor_ablation import _event_windows
    ev = _event_windows(events, assets)
    tables = {a.asset_id: D.snapshot_table(snaps, a) for _, a in assets.iterrows()}
    frames = {a: D.normalized_asset(feat, assets[assets.asset_id == a]) for a in sorted(assets.asset_id)}
    wfs = {a: D.asset_waveform(frames[a], snaps, assets[assets.asset_id == a], table=tables[a]) for a in frames}
    models = {held: fit_fold(held, assets, frames, wfs, ev) for held in sorted(assets.asset_id)}
    preds = {c: [] for c in D.CANDIDATES}
    for aid in sorted(assets.asset_id):
        row = assets[assets.asset_id == aid]
        for c in D.CANDIDATES:
            preds[c].append(D.predict_asset(c, feat, snaps, row, model_for(c, models[aid]), table=tables[aid]))
    return tables, models, {c: pd.concat(v, ignore_index=True) for c, v in preds.items()}


def prediction_hashes(preds):
    return {c: hashlib.sha256(p.to_csv(index=False).encode()).hexdigest() for c, p in preds.items()}


def canonical(frame):
    """None/NaN-normalized semantic form of every output column (raw artifacts are kept separately)."""
    f = frame.reset_index(drop=True).astype(object)
    return f.where(pd.notna(f), None).map(lambda v: round(v, 9) if isinstance(v, float) else v)


def audit_cuts(asset, preds, table, rng):
    start, end = D.utc(asset.window_start_utc), D.utc(asset.window_end_utc)
    ref = start + pd.Timedelta(hours=B.BASELINE_H)
    cuts = {ref + pd.Timedelta(seconds=s): "reference_boundary" for s in (-1, 0, 1, 60)}
    for t in sorted({pd.Timestamp(x) for p in preds for x in p.alert_time_utc}):
        cuts[t] = "alert"
    valid = table[table.valid.astype(bool)] if len(table) else table
    if len(valid):
        for j in sorted(rng.choice(len(valid), size=min(SNAPSHOT_CUTS, len(valid)), replace=False)):
            done = valid.complete_utc.iloc[j]
            for s in (-1, 0, 1):
                cuts[done + pd.Timedelta(seconds=s)] = "snapshot_complete"
                cuts[done + D.SNAP_MAX_AGE + pd.Timedelta(seconds=s)] = "snapshot_age"
    for s in rng.integers(3600, int((end - start).total_seconds()), size=RANDOM_CUTS):
        cuts[start + pd.Timedelta(seconds=int(s))] = "random"
    return {t: k for t, k in sorted(cuts.items()) if start < t <= end}


def mutate_future(feat, snaps, aid, cut):
    """Drastic change of every minute ending after the cut (incl. an open minute) and every later snapshot."""
    f = feat.copy()
    late = (f.asset_id == aid) & (pd.to_datetime(f.window_start_utc, utc=True) + D.MINUTE > cut)
    means = [c for c in f.columns if c.endswith("__mean")]
    f.loc[late, means] = f.loc[late, means] * 3 + 100
    s = snaps.copy()
    if len(s):
        done = pd.to_datetime(s.timestamp_utc, utc=True) + pd.to_timedelta(s.n_samples / s.sample_rate_hz, unit="s")
        rng = np.random.default_rng(1)
        s["samples"] = [(rng.standard_normal(len(x)) * 5).astype("float32") if (a == aid and d > cut) else x
                        for a, d, x in zip(s.asset_id, done, s.samples)]
    return f, s


def causality_audit(assets, feat, snaps, tables, models_by_fold, full):
    """Prefix replay and future mutation; each candidate uses exactly its production call (B1: no waveform)."""
    rng = np.random.default_rng(AUDIT_SEED)
    rows = []
    for _, a in assets.sort_values("asset_id").iterrows():
        row = assets[assets.asset_id == a.asset_id]
        aid = a.asset_id
        mine = {c: full[c][full[c].asset_id == aid].reset_index(drop=True) for c in D.CANDIDATES}
        for cut, kind in audit_cuts(a, list(mine.values()), tables[aid], rng).items():
            for variant, (ff, ss) in (("prefix", (feat, snaps)), ("future_mutation", mutate_future(feat, snaps, aid, cut))):
                tab = D.snapshot_table(ss, a) if variant == "future_mutation" else tables[aid]
                g = D.normalized_asset(ff, row, cut)
                wf = D.asset_waveform(g, ss, row, cut, tab) if len(g) else None
                for c in D.CANDIDATES:
                    got = D.diagnose_asset(c, g, None if c == "B1" else wf, model_for(c, models_by_fold[aid]),
                                           D.installed_keys(a))
                    want = mine[c][pd.to_datetime(mine[c].alert_time_utc, utc=True) <= cut]
                    ok = canonical(got).equals(canonical(want))
                    rows.append({"candidate": c, "asset_id": aid, "cut_utc": cut.isoformat(), "cut_kind": kind,
                                 "variant": variant, "compared_rows": len(want), "pass": bool(ok)})
    return pd.DataFrame(rows)


# --- provenance -------------------------------------------------------------------------------------------

def frame_hash(df):
    """Content hash of a train-only projection; the caller sorts rows."""
    h = hashlib.sha256()
    plain = [c for c in df.columns if c != "samples"]
    h.update(",".join(plain).encode())
    h.update(pd.util.hash_pandas_object(df[plain].astype(str), index=False).to_numpy().tobytes())
    if "samples" in df:
        for x in df.samples:
            h.update(np.asarray(x, dtype="float32").tobytes())
    return h.hexdigest()


def input_projection_hashes(assets, feat, snaps, events, benign):
    sort = lambda d, keys: d.sort_values(keys, kind="stable").reset_index(drop=True)
    return {"assets_train_rows": frame_hash(sort(assets, ["asset_id"])),
            "features_train_rows": frame_hash(sort(feat, ["asset_id", "window_start_utc"])),
            "snapshots_train_rows": frame_hash(sort(snaps, ["asset_id", "timestamp_utc", "snapshot_id"])),
            "events_train": frame_hash(sort(events, ["event_id"])),
            "benign_train_rows": frame_hash(sort(benign, ["asset_id", "start_utc"])) if benign is not None else None,
            "row_counts": {"assets": len(assets), "features": len(feat), "snapshots": len(snaps),
                           "events": len(events)},
            "asset_ids": sorted(set(feat.asset_id) | set(snaps.asset_id) | set(assets.asset_id))}


def fitted_state_hash(est):
    if est is None:
        return None
    h = hashlib.sha256()
    for t in est.estimators_:
        tr = t.tree_
        for arr in (tr.children_left, tr.children_right, tr.feature, tr.threshold, tr.value):
            h.update(np.ascontiguousarray(arr).tobytes())
    return h.hexdigest()


def fold_provenance(models):
    out = []
    for held, ms in sorted(models.items()):
        for kind, m in ms.items():
            out.append({"held_out": held, "fit_assets": list(m.fit_assets), "kind": kind, "model_id": m.model_id,
                        "classes": list(m.classes), "support": m.support, "unsupported_classes": m.dropped_types,
                        "training_rows": m.training_rows, "fitted": m.estimator is not None,
                        "estimator_params": D.EXTRA_TREES, "feature_names": list(m.feature_names),
                        "fitted_state_sha256": fitted_state_hash(m.estimator), "held_out_labels_seen": False})
    return out


def availability(preds):
    """Waveform status and diagnosis source at emitted alerts, per candidate and asset."""
    rows = []
    for c, p in preds.items():
        for aid, g in p.groupby("asset_id", sort=True):
            rows.append({"candidate": c, "asset_id": aid, "alerts": len(g),
                         **{f"source_{k}": int(v) for k, v in g.diagnosis_source.value_counts().items()},
                         **{f"wf_{k}": int(v) for k, v in g.wf_status.fillna("NOT_COMPUTED").value_counts().items()},
                         "fallback_to_b1": int((g.diagnosis_source == "B1").sum())})
    return pd.DataFrame(rows).fillna(0)


def per_asset(c, pred, per, events, assets, benign):
    rows = []
    for aid in sorted(assets.asset_id):
        a = assets[assets.asset_id == aid]
        rep = S.score(pred[pred.asset_id == aid][B._COLS], events, a, benign, "train")
        pa = per[per.asset_id == aid]
        rows.append({"candidate": c, "asset_id": aid, "events": len(pa), "detected": int(pa.detected.sum()),
                     "type_correct": int(pa.type_correct.sum()), "class_correct": int(pa.class_correct.sum()),
                     "sensor_type_and_channel": int(pa.type_and_channel.sum()),
                     "false_episodes": rep["false_alert_episodes"], "excess_repeats": rep["excess_repeat_episodes"],
                     "nuisance_benign": rep["nuisance_alerts_in_benign_windows"], "alerts": int((pred.asset_id == aid).sum())})
    return rows


def held_out_type_support(models, events):
    """Evaluator-only: held-out scored event types the fold's learner could not output."""
    obs = events[events.observable.astype(str).str.lower().isin(["true", "1"])]
    out = []
    for held, ms in sorted(models.items()):
        types = sorted(set(obs[obs.asset_id == held].fault_type))
        for kind, m in ms.items():
            out.append({"held_out": held, "kind": kind, "held_out_types": types,
                        "unpredictable_types": [t for t in types if t not in m.classes]})
    return out


# --- modes ------------------------------------------------------------------------------------------------

def determinism_child():
    assets, feat, snaps = D.load_train(DATA)
    events = pd.read_csv(DATA / "events_train.csv")
    print(json.dumps(prediction_hashes(pipeline(assets, feat, snaps, events)[2])))


def train():
    started = time.monotonic()
    man = require_seal()
    run_dir = OUT / f"run-{pd.Timestamp.now(tz='UTC').strftime('%Y%m%dT%H%M%S%fZ')}"
    run_dir.mkdir(parents=True, exist_ok=False)                  # every attempt is preserved
    from run_regime_reference import evaluate
    assets, feat, snaps = D.load_train(DATA)
    events = pd.read_csv(DATA / "events_train.csv")
    assert set(events.asset_id) <= set(D.TRAIN_ASSETS)
    benign = pd.read_csv(DATA / "benign_windows_train_validation.csv").query("asset_id in @assets.asset_id")
    tables, models, preds = pipeline(assets, feat, snaps, events)
    main_hashes = prediction_hashes(preds)
    for c, p in preds.items():
        p.to_csv(run_dir / f"predictions_{c}.csv", index=False)
    save_json(run_dir / "run_provenance.json", {           # written before any scoring
        "manifest_sha256": sha256(MANIFEST), "code_sha256": man["code_sha256"],
        "inputs": input_projection_hashes(assets, feat, snaps, events, benign),
        "folds": fold_provenance(models), "prediction_sha256": main_hashes,
        "seed": os.environ.get("PYTHONHASHSEED"), "python": sys.version.split()[0],
        "validation_touched": False, "test_touched": False, "scored": False})
    control = canonical_predictions(CONTROL_PRED)
    checks = {"control_equals_saved": canonical(canonical_predictions(preds["B1"][B._COLS])).equals(canonical(control))}
    key = lambda p: sorted(zip(p.asset_id, p.alert_time_utc))
    checks["emission_equal_control"] = {c: key(p) == key(preds["B1"]) for c, p in preds.items()}
    summaries, assets_rows = [], []
    for c, p in preds.items():
        p = p.assign(original_fault_type=p.b1_fault_type, rule_id=p.diagnosis_source)
        s, per, _, um = evaluate(c, p, events, assets, benign)
        s.update(useful_diagnoses=useful(per), overrides=int((p.diagnosis_source != "B1").sum()))
        s["gate_pass"] = gate_passes(s)
        summaries.append(s)
        assets_rows += per_asset(c, p, per, events, assets, benign)
        per.to_csv(run_dir / f"per_event_{c}.csv", index=False)
        um.to_csv(run_dir / f"unmatched_{c}.csv", index=False)
    comp = pd.DataFrame(summaries)
    comp.to_csv(run_dir / "comparison_unchecked.csv", index=False)
    pd.DataFrame(assets_rows).to_csv(run_dir / "per_asset.csv", index=False)
    availability(preds).to_csv(run_dir / "waveform_and_fallback.csv", index=False)
    save_json(run_dir / "held_out_type_support.json", held_out_type_support(models, events))
    ctrl = comp[comp.candidate == "B1"].iloc[0]
    checks["control_metrics"] = {k: int(ctrl[k]) == v for k, v in CONTROL_EXPECT.items()}
    audit = causality_audit(assets, feat, snaps, tables, models, preds)
    audit.to_csv(run_dir / "causality_audit.csv", index=False)
    checks["causality_failures"] = {c: int((~audit[audit.candidate == c]["pass"]).sum()) for c in D.CANDIDATES}
    env = {**os.environ, "PYTHONHASHSEED": "0"}
    runs = [json.loads(subprocess.run([sys.executable, __file__, "determinism-child"], env=env, check=True,
                                      capture_output=True, text=True, cwd=ROOT).stdout) for _ in range(2)]
    checks["determinism"] = {c: runs[0][c] == runs[1][c] == main_hashes[c] for c in main_hashes}
    save_json(run_dir / "determinism.json", {"main": main_hashes, "children": runs})
    correct_ok = (checks["control_equals_saved"] and all(checks["emission_equal_control"].values())
                  and all(checks["control_metrics"].values()))
    comp["correctness_pass"] = [bool(correct_ok and checks["causality_failures"][c] == 0 and checks["determinism"][c])
                                for c in comp.candidate]
    passing = comp[(comp.candidate != "B1") & comp.gate_pass & comp.correctness_pass]
    selected = None
    if len(passing):
        selected = passing.sort_values(["useful_diagnoses", "type_correct", "false_plus_excess", "candidate"],
                                       ascending=[False, False, True, True]).candidate.iloc[0]
    comp.to_csv(run_dir / "comparison.csv", index=False)
    save_json(run_dir / "run_summary.json", {"manifest_sha256": sha256(MANIFEST), "checks": checks, "gate": GATE,
                                             "selected": selected, "validation_touched": False, "test_touched": False,
                                             "runtime_s": round(time.monotonic() - started, 1)})
    save_json(COMPLETED, {"run_dir": str(run_dir.relative_to(ROOT)), "selected": selected})
    print(comp[["candidate", "detected", "type_correct", "class_correct", "false_plus_excess",
                "sensor_type_and_channel", "useful_diagnoses", "gate_pass", "correctness_pass"]].to_string())
    print("selected:", selected)


def selfcheck():
    man = json.loads(MANIFEST.read_text())
    print(json.dumps({"seed_pinned": seed_pinned(), "manifest_sha256": sha256(MANIFEST),
                      "code_sha256_current": {p: sha256(ROOT / p) for p in man["code_sha256"]},
                      "code_matches_manifest": all(sha256(ROOT / p) == h for p, h in man["code_sha256"].items()),
                      "sealed": SEAL.exists(), "completed": COMPLETED.exists()}, indent=2))


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "selfcheck"
    {"selfcheck": selfcheck, "train": train, "determinism-child": lambda: (require_seal(), determinism_child())}[mode]()
