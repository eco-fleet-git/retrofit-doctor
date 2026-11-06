"""Task005 E3/E4 runner.

  PYTHONHASHSEED=0 python scripts/run_regime_reference.py feasibility   # phase 1: E4 prior support (no scoring)
  PYTHONHASHSEED=0 python scripts/run_regime_reference.py freeze        # phase 2: hash runner/model/manifest once
  PYTHONHASHSEED=0 python scripts/run_regime_reference.py train         # E3 R0/R1/R2 on train, gates, seal
  PYTHONHASHSEED=0 python scripts/run_regime_reference.py validate      # only a gate-passing selected R1/R2, once

E4 (P1/P2) is not testable under the registered prior (zero support) and is never scored here.
E3 has no fitted parameters: each held-out asset is replayed alone; LOAO fit IDs are recorded, unused.
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
from retrofit_doctor import causal_b2 as B2
from retrofit_doctor.causal_b1 import causal_features
from retrofit_doctor.regime_reference import fit_prior, predict as predict_variant
from run_b1 import save_json, sha256
from run_causal_b2 import c0_channel, same
from run_sensor_ablation import _event_windows

OUT = ROOT / "results/regime_reference"
DATA = ROOT / "vendor/benchmark/data/full"
MANIFEST = ROOT / "docs/experiments/followup/2026-11-07-e3-e4-manifest.json"
CANDIDATES = ["R0", "R1", "R2"]
DEPLOYABLE = ["R1", "R2"]
SEEDS = ["0", "1", "7", "9"]
GATES = {"detected_min": 18, "class_correct_min": 14, "type_correct_min": 8, "false_plus_excess_max": 6}
FROZEN = ["scripts/run_regime_reference.py", "src/retrofit_doctor/regime_reference.py",
          "docs/experiments/followup/2026-11-07-e3-e4-manifest.json", "src/retrofit_doctor/causal_b1.py",
          "src/retrofit_doctor/causal_b2.py", "scripts/run_b1.py", "scripts/run_causal_b2.py",
          "scripts/run_sensor_ablation.py", "vendor/benchmark/src/retrofit_sim/baselines.py",
          "vendor/benchmark/src/retrofit_sim/scoring.py", "results/causal_b2/selection.json"]
CUTS = ROOT / "results/causal_b1/causality_audit.csv"
SPECIFIC_EXCLUDED = ("UNKNOWN", "AMBIGUOUS")


# --- phase 1 ------------------------------------------------------------------------------------------------

def feasibility():
    OUT.mkdir(parents=True, exist_ok=True)
    assets, feat = B2.load_split_inputs(DATA, "train")
    events = pd.read_csv(DATA / "events_train.csv")
    z = causal_features(feat, assets, dict(zip(assets.asset_id, assets.window_end_utc)))
    folds = {}
    for held in sorted(assets.asset_id):
        fit_ids = [a for a in sorted(assets.asset_id) if a != held]
        prior = fit_prior(z[z.asset_id.isin(fit_ids)], assets[assets.asset_id.isin(fit_ids)],
                          events[events.asset_id.isin(fit_ids)])
        folds[held] = {"fit_assets": fit_ids,
                       "channels": {k: {kk: v for kk, v in p.items()} for k, p in prior["channels"].items()},
                       "fit_minutes": prior["fit_minutes"], "prior_id": prior["prior_id"]}
        print(held, {k: (p["supported"], len(p["fit_assets"])) for k, p in prior["channels"].items()}, flush=True)
    save_json(OUT / "prior_feasibility.json", {
        "purpose": "pre-scoring support check of the registered E4 prior; no candidate outputs or scores",
        "reads": "train telemetry + train labels of fit assets per fold (fit-window selection only)",
        "folds": folds, "created_at": pd.Timestamp.now(tz="UTC").isoformat()})


# --- evaluator (labels used only here) ----------------------------------------------------------------------

def run_candidate(c, feat, assets, clocks=None):
    clocks = clocks or dict(zip(assets.asset_id, assets.window_end_utc))
    p, z = predict_variant(feat, assets, clocks, c)
    p = p.copy()
    p["suspected_channel"] = [c0_channel(e) for e in p.evidence]
    return p, z


def assigned_bursts(pred, events, assets):
    """Official burst->event assignment replicated, keeping burst members (asserted vs official per_event)."""
    ev = _event_windows(events, assets)
    p = pred.copy()
    p["t"] = pd.to_datetime(p.alert_time_utc, utc=True)
    bursts = []
    for aid, g in p.sort_values(["asset_id", "t"], kind="stable").groupby("asset_id", sort=True):
        start, members = None, []
        for _, r in g.iterrows():
            if start is None or r.t - start > S.BURST:
                if members:
                    bursts.append((aid, start, members))
                start, members = r.t, []
            members.append(r)
        if members:
            bursts.append((aid, start, members))
    assigned, unmatched = {}, []
    for aid, t, members in bursts:
        types = {m.fault_type for m in members}
        classes = {m.event_class for m in members}
        ft = types.pop() if len(types) == 1 else "AMBIGUOUS"
        cls = classes.pop() if len(classes) == 1 else "AMBIGUOUS"
        chans = {m.suspected_channel for m in members if m.fault_type == ft and isinstance(m.suspected_channel, str)}
        b = {"t": t, "fault_type": ft, "event_class": cls, "channel": chans.pop() if len(chans) == 1 else None,
             "confidence": float(min(m.confidence for m in members)),
             "original_fault_type": members[0].original_fault_type, "rule_id": members[0].rule_id}
        e_a = ev[ev.asset_id == aid]
        cand = e_a[(e_a.w_start <= t) & (t <= e_a.w_end)]
        if not len(cand):
            unmatched.append({"asset_id": aid, **b})
            continue
        cand = cand.assign(_type=(cand.fault_type != ft).astype(int), _cls=(cand.event_class != cls).astype(int),
                           _det=cand.event_id.isin(assigned).astype(int))
        eid = cand.sort_values(["_type", "_cls", "_det", "onset_utc"]).iloc[0].event_id
        assigned.setdefault(eid, []).append(b)
    return assigned, unmatched, ev


def evaluate(c, pred, events, assets, benign):
    rep = S.score(pred[B._COLS], events, assets, benign, "train")
    assigned, unmatched, ev = assigned_bursts(pred, events, assets)
    official = {e["event_id"]: e for e in rep["per_event"]}
    ws = dict(zip(assets.asset_id, S._ts(assets.window_start_utc)))
    rows = []
    for _, e in ev[ev.observable].iterrows():
        o = official[e.event_id]
        bs = assigned.get(e.event_id, [])
        if o["detected"]:
            assert pd.Timestamp(o["first_alert_utc"]) == bs[0]["t"], f"{c}: assignment mismatch {e.event_id}"
        else:
            assert not bs
        tag = e.sensor_tag if isinstance(e.sensor_tag, str) else None
        ref = e.detectable_utc if pd.notna(e.detectable_utc) else e.w_start
        typed = [b for b in bs if b["fault_type"] == e.fault_type]
        useful = [b for b in typed if e.event_class != "SENSOR" or b["channel"] == tag]
        first = bs[0] if bs else None
        rows.append({
            "candidate": c, "event_id": e.event_id, "asset_id": e.asset_id, "event_class": e.event_class,
            "fault_type": e.fault_type, "sensor_tag": tag, "pre_existing": bool(e.pre_existing),
            "period": "0-24h" if ref < ws[e.asset_id] + pd.Timedelta(hours=24) else "later",
            "detected": o["detected"], "first_alert_utc": o["first_alert_utc"],
            "emitted_type": first["fault_type"] if first else None, "emitted_class": first["event_class"] if first else None,
            "original_type": first["original_fault_type"] if first else None, "rule_id": first["rule_id"] if first else None,
            "emitted_channel": first["channel"] if first else None, "first_confidence": first["confidence"] if first else None,
            "type_correct": o["type_correct"], "class_correct": o["class_correct"],
            "specific_first": bool(first and first["fault_type"] not in SPECIFIC_EXCLUDED),
            "wrong_specific_first": bool(first and first["fault_type"] not in SPECIFIC_EXCLUDED and not o["type_correct"]),
            "type_and_channel": bool(e.event_class == "SENSOR" and o["type_correct"] and first["channel"] == tag) if first else False,
            "first_correct_type_utc": typed[0]["t"].isoformat() if typed else None,
            "correct_type_delay_h": (typed[0]["t"] - ref).total_seconds() / 3600 if typed else np.nan,
            "first_useful_utc": useful[0]["t"].isoformat() if useful else None,
            "useful_delay_h": (useful[0]["t"] - ref).total_seconds() / 3600 if useful else np.nan,
            "assigned_bursts": len(bs)})
    per = pd.DataFrame(rows)
    um = pd.DataFrame(unmatched)
    for d in (um,):
        if len(d):
            d["period"] = ["0-24h" if t < ws[a] + pd.Timedelta(hours=24) else "later" for a, t in zip(d.asset_id, d.t)]
    bn = benign[benign.asset_id.isin(assets.asset_id)]
    exposure = float(sum((pd.Timestamp(r.end_utc) - pd.Timestamp(r.start_utc)).total_seconds() / 60 for r in bn.itertuples()))
    summary = {
        "candidate": c, "events": len(per), "composite_score": rep["composite_score"],
        "detected": int(per.detected.sum()), "class_correct": int(per.class_correct.sum()),
        "type_correct": int(per.type_correct.sum()), "false_episodes": rep["false_alert_episodes"],
        "excess_repeats": rep["excess_repeat_episodes"],
        "false_plus_excess": rep["false_alert_episodes"] + rep["excess_repeat_episodes"],
        "sensor_events": int((per.event_class == "SENSOR").sum()),
        "sensor_type_and_channel": int(per.type_and_channel.sum()),
        "nuisance_benign": rep["nuisance_alerts_in_benign_windows"], "benign_exposure_minutes": exposure,
        "alerts": len(pred), "unknown_alerts": int((pred.fault_type == "UNKNOWN").sum()),
        "unknown_first": int((per.emitted_type == "UNKNOWN").sum()),
        "anomaly_alert_coverage": int(per.detected.sum()), "specific_diagnosis_coverage": int(per.specific_first.sum()),
        "wrong_specific_first": int(per.wrong_specific_first.sum()),
        "unmatched_specific_bursts": int((~um.fault_type.isin(SPECIFIC_EXCLUDED)).sum()) if len(um) else 0,
        "correct_type_reached": int(per.first_correct_type_utc.notna().sum()),
        "useful_reached": int(per.first_useful_utc.notna().sum()),
        "missed_useful": int(per.first_useful_utc.isna().sum()),
        "unmatched_bursts_0_24h": int((um.period == "0-24h").sum()) if len(um) else 0,
        "unmatched_bursts_later": int((um.period == "later").sum()) if len(um) else 0}
    for name, mask in [("pre_existing", per.pre_existing), ("period_0_24h", per.period == "0-24h"),
                       ("period_later", per.period == "later")]:
        sub = per[mask]
        summary[f"{name}_events"] = len(sub)
        summary[f"{name}_detected"] = int(sub.detected.sum())
        summary[f"{name}_type_correct"] = int(sub.type_correct.sum())
        summary[f"{name}_useful_reached"] = int(sub.first_useful_utc.notna().sum())
    return summary, per, rep, um


def status_minutes(c, z):
    col = "diagnostic_status" if "diagnostic_status" in z else "reference_status"
    t = z.groupby(["asset_id", col]).size().rename("minutes").reset_index().rename(columns={col: "status"})
    return t.assign(candidate=c, status_source=col)


def confidence_comparator(per0, n):
    """Offline, event-matched DESCRIPTIVE comparator (not deployable): relabel as UNKNOWN the n specific R0
    first diagnoses with the lowest confidence (ties: earlier alert, then asset ID)."""
    spec = per0[per0.specific_first].sort_values(["first_confidence", "first_alert_utc", "asset_id"], kind="stable")
    drop = set(spec.event_id.iloc[:n])
    kept = per0[~per0.event_id.isin(drop)]
    return {"n_relabelled": n, "relabelled_events": sorted(drop), "type_correct": int(kept.type_correct.sum()),
            "wrong_specific_first": int(kept.wrong_specific_first.sum()),
            "specific_diagnosis_coverage": int(kept.specific_first.sum())}


def common_window(pred0, z1, events, assets, benign):
    """Descriptive: R0 alerts at minutes R1 marks AVAILABLE vs all R0 alerts (quality alerts can occur elsewhere)."""
    st = z1.set_index(["asset_id", "window_start_utc"]).diagnostic_status
    keys = list(zip(pred0.asset_id, pd.to_datetime(pred0.alert_time_utc, utc=True) - pd.Timedelta(minutes=1)))
    status = [st.get(k, "MISSING") for k in keys]
    sub = pred0[[s == "AVAILABLE" for s in status]]
    rep = S.score(sub[B._COLS], events, assets, benign, "train")
    return {"r0_alerts_by_r1_status": pd.Series(status).value_counts().to_dict(),
            "r0_restricted_to_r1_available": {
                "alerts": len(sub), "detected": rep["true_positive_events"],
                "type_correct": int(sum(e["type_correct"] for e in rep["per_event"])),
                "false_plus_excess": rep["false_alert_episodes"] + rep["excess_repeat_episodes"]}}


# --- phase 2 --------------------------------------------------------------------------------------------------

def freeze():
    path = OUT / "frozen.json"
    if path.exists():
        raise SystemExit("already frozen")
    m = json.loads(MANIFEST.read_text())
    assert m["status"].startswith("APPROVED"), "manifest must be the approved revision"
    save_json(path, {"experiment": m["experiment_ids"]["E3"], "candidates": CANDIDATES, "deployable": DEPLOYABLE,
                     "gates": GATES, "seeds": SEEDS, "sha256": {p: sha256(ROOT / p) for p in FROZEN},
                     "inputs_sha256": {p: sha256(DATA / p) for p in ["assets.csv", "events_train.csv",
                                                                      "benign_windows_train_validation.csv"]},
                     "frozen_at": pd.Timestamp.now(tz="UTC").isoformat()})
    print("frozen", path)


def check_frozen():
    fz = json.loads((OUT / "frozen.json").read_text())
    changed = [p for p, h in fz["sha256"].items() if sha256(ROOT / p) != h]
    if changed:
        raise SystemExit(f"frozen files changed: {changed}")
    return fz


def determinism_child():
    assets, feat = B2.load_split_inputs(DATA, "train")
    print(json.dumps({c: hashlib.sha256(run_candidate(c, feat, assets)[0].to_csv(index=False).encode()).hexdigest()
                      for c in CANDIDATES}))


def train():
    started = time.monotonic()
    fz = check_frozen()
    assets, feat = B2.load_split_inputs(DATA, "train")
    events = pd.read_csv(DATA / "events_train.csv")
    benign = pd.read_csv(DATA / "benign_windows_train_validation.csv").query("asset_id in @assets.asset_id")
    ids = sorted(assets.asset_id)
    folds = [{"held_out": a, "fit_assets": [x for x in ids if x != a], "fitted_parameters": None} for a in ids]
    preds, frames, summaries, pers, unmatched, statuses = {}, {}, [], {}, {}, []
    for c in CANDIDATES:
        parts, zs = [], []
        for fold in folds:
            a = assets[assets.asset_id == fold["held_out"]]
            p, z = run_candidate(c, feat[feat.asset_id == fold["held_out"]], a)
            parts.append(p)
            zs.append(z)
        preds[c], frames[c] = pd.concat(parts, ignore_index=True), pd.concat(zs, ignore_index=True)
        preds[c].to_csv(OUT / f"train_predictions_{c}.csv", index=False)
        s, per, rep, um = evaluate(c, preds[c], events, assets, benign)
        save_json(OUT / f"train_report_{c}.json", rep)
        summaries.append(s)
        pers[c], unmatched[c] = per, um
        statuses.append(status_minutes(c, frames[c]))
        print(c, {k: s[k] for k in ["composite_score", "detected", "type_correct", "class_correct",
                                    "false_plus_excess", "sensor_type_and_channel", "unknown_first",
                                    "specific_diagnosis_coverage", "wrong_specific_first"]}, flush=True)
    pd.concat(pers.values(), ignore_index=True).to_csv(OUT / "train_paired_events_long.csv", index=False)
    wide = pers["R0"][["event_id", "asset_id", "event_class", "fault_type", "sensor_tag", "pre_existing", "period"]]
    keep = ["detected", "emitted_type", "emitted_class", "original_type", "rule_id", "emitted_channel", "type_correct",
            "class_correct", "type_and_channel", "first_alert_utc", "correct_type_delay_h", "useful_delay_h"]
    for c in CANDIDATES:
        wide = wide.merge(pers[c][["event_id"] + keep].rename(columns={k: f"{k}@{c}" for k in keep}), on="event_id")
    wide.to_csv(OUT / "train_paired_events.csv", index=False)
    pd.concat(statuses, ignore_index=True).to_csv(OUT / "train_status_minutes.csv", index=False)
    pd.concat([u.assign(candidate=c) for c, u in unmatched.items() if len(u)], ignore_index=True).to_csv(
        OUT / "train_unmatched_bursts.csv", index=False)

    ref = json.loads((ROOT / "results/causal_b1/report_causal_train.json").read_text())
    stored = pd.read_csv(ROOT / "results/causal_b1/predictions_causal_train.csv")
    r0_parity = bool(np.isclose(summaries[0]["composite_score"], ref["composite_score"], atol=1e-9, rtol=0)
                     and same(stored, pd.read_csv(OUT / "train_predictions_R0.csv")[stored.columns]))

    n_abstain = int(((pers["R2"].emitted_type == "UNKNOWN") & (pers["R2"].original_type != "UNKNOWN")).sum())
    comparisons = {"R2_vs_R0_confidence_comparator": {
        "label": "offline, event-matched descriptive comparator; selection uses evaluator matching; not deployable",
        "R2": {k: summaries[2][k] for k in ["type_correct", "wrong_specific_first", "specific_diagnosis_coverage"]},
        "R0_confidence_relabelled": confidence_comparator(pers["R0"], n_abstain)},
        "R1_common_window": {"label": "descriptive common-window comparison, not proof of equivalent operational coverage",
                             **common_window(preds["R0"], frames["R1"], events, assets, benign),
                             "R1": {k: summaries[1][k] for k in ["alerts", "detected", "type_correct", "false_plus_excess"]}}}
    save_json(OUT / "train_comparisons.json", comparisons)

    cuts = pd.read_csv(CUTS).query("split == 'train'")
    audit = []
    for aid, cc in cuts.groupby("asset_id", sort=True):
        a = assets[assets.asset_id == aid]
        f = feat[feat.asset_id == aid]
        end = a.window_end_utc.iloc[0]
        for c in DEPLOYABLE:
            fp = preds[c][preds[c].asset_id == aid].reset_index(drop=True)
            for cut in pd.to_datetime(cc.cutoff_utc, utc=True):
                prefix = f[pd.to_datetime(f.window_start_utc, utc=True) + pd.Timedelta(minutes=1) <= cut]
                sp, _ = run_candidate(c, prefix, a, {aid: cut})
                fut = f.copy()
                late = pd.to_datetime(fut.window_start_utc, utc=True) >= cut
                num = [x for x in fut.select_dtypes("number").columns if x != "rows"]
                fut.loc[late, num] = fut.loc[late, num] * -7 + 1e4
                mp, _ = run_candidate(c, fut, a)
                past = lambda p: p[pd.to_datetime(p.alert_time_utc, utc=True) <= cut]
                audit.append({"candidate": c, "asset_id": aid, "cutoff_utc": cut.isoformat(),
                              "prefix_match": same(past(fp), sp), "future_mutation_match": same(past(fp), past(mp))})
        print("causality", aid, flush=True)
    audit = pd.DataFrame(audit)
    audit.to_csv(OUT / "train_causality_audit.csv", index=False)
    det = {}
    for seed in SEEDS:
        r = subprocess.run([sys.executable, "-B", __file__, "determinism-child"], cwd=ROOT, capture_output=True, text=True,
                           check=True, env=dict(os.environ, PYTHONHASHSEED=seed, PYTHONDONTWRITEBYTECODE="1"))
        det[seed] = json.loads(r.stdout.strip().splitlines()[-1])
    save_json(OUT / "determinism.json", det)

    rows = []
    for s in summaries:
        c, bad = s["candidate"], []
        if len({det[x][c] for x in SEEDS}) != 1:
            bad.append("hash_seed_nondeterminism")
        if c == "R0":
            if not r0_parity:
                bad.append("r0_parity_failed")
        else:
            a = audit[audit.candidate == c]
            fails = int((~a.prefix_match).sum() + (~a.future_mutation_match).sum())
            if fails:
                bad.append(f"causality_failures={fails}")
            if s["detected"] < GATES["detected_min"]:
                bad.append("detection_below_18")
            if s["class_correct"] < GATES["class_correct_min"]:
                bad.append("class_below_14")
            if s["type_correct"] < GATES["type_correct_min"]:
                bad.append("type_below_8")
            if s["false_plus_excess"] > GATES["false_plus_excess_max"]:
                bad.append("burden_above_6")
        rows.append({**s, "gate_failures": "|".join(bad), "passes": c in DEPLOYABLE and not bad})
    table = pd.DataFrame(rows)
    table.to_csv(OUT / "train_selection_table.csv", index=False)
    passing = table[table.passes]
    selected = passing.assign(cid=passing.candidate.str[1:].astype(int)).sort_values(
        ["sensor_type_and_channel", "type_correct", "composite_score", "cid"],
        ascending=[False, False, False, True]).iloc[0].candidate if len(passing) else "R0"
    save_json(OUT / "selection.json", {
        "experiment": fz["experiment"], "selected_candidate": selected, "fallback_applied": selected == "R0",
        "r0_parity_with_causal_b1": r0_parity, "folds": folds, "causality_rows": len(audit),
        "determinism_identical": {c: len({det[x][c] for x in SEEDS}) == 1 for c in CANDIDATES},
        "train_table": rows, "frozen_sha256": fz["sha256"], "e4": "not scored (option A: not testable)",
        "exposure": "train outcomes of earlier detectors known; validation previously inspected; descriptive only",
        "sealed_at": pd.Timestamp.now(tz="UTC").isoformat(), "elapsed_s": round(time.monotonic() - started, 1)})
    print(table[["candidate", "composite_score", "detected", "type_correct", "class_correct", "false_plus_excess",
                 "sensor_type_and_channel", "gate_failures", "passes"]].to_string(index=False))
    print("R0 parity:", r0_parity, "selected:", selected, flush=True)


def validate():
    check_frozen()
    sel = json.loads((OUT / "selection.json").read_text())
    if sel["selected_candidate"] not in DEPLOYABLE:
        raise SystemExit("No E3 candidate passed train gates; validation is not run (R0 retained)")
    if (OUT / "validation_summary.json").exists():
        raise SystemExit("validation already evaluated once")
    assets, feat = B2.load_split_inputs(DATA, "validation")
    events = pd.read_csv(DATA / "events_validation.csv")
    benign = pd.read_csv(DATA / "benign_windows_train_validation.csv").query("asset_id in @assets.asset_id")
    out = []
    for c in ["R0", sel["selected_candidate"]]:
        p, _ = run_candidate(c, feat, assets)
        p.to_csv(OUT / f"validation_predictions_{c}.csv", index=False)
        rep = S.score(p[B._COLS], events, assets, benign, "validation")
        save_json(OUT / f"validation_report_{c}.json", rep)
        out.append({"candidate": c, "composite_score": rep["composite_score"], "detected": rep["true_positive_events"],
                    "type_correct": int(sum(e["type_correct"] for e in rep["per_event"])),
                    "class_correct": int(sum(e["class_correct"] for e in rep["per_event"])),
                    "false_plus_excess": rep["false_alert_episodes"] + rep["excess_repeat_episodes"]})
    save_json(OUT / "validation_summary.json", {"selected": sel["selected_candidate"], "rows": out,
                                                "evaluated_at": pd.Timestamp.now(tz="UTC").isoformat()})
    print(pd.DataFrame(out).to_string(index=False))


if __name__ == "__main__":
    {"feasibility": feasibility, "freeze": freeze, "train": train, "validate": validate,
     "determinism-child": determinism_child}[sys.argv[1]]()
