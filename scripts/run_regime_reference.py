"""Task005 E3/E4 runner. Phase 1 contains only the pre-scoring prior feasibility check.

  PYTHONHASHSEED=0 python scripts/run_regime_reference.py feasibility

Feasibility reads train telemetry and train labels of the FIT assets of each LOAO fold, exactly as the
registered prior fit would, and reports which channels reach the >= 3 fit-asset support. No candidate is
run on a held-out asset and nothing is scored. Train/validation scoring modes are added only after the
coordinator reviews the proposed manifest (phase 2).
"""
from __future__ import annotations

import json
from pathlib import Path
import sys

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "src"), str(ROOT / "vendor/benchmark/src"), str(ROOT / "scripts")]
from retrofit_doctor import causal_b2 as B2
from retrofit_doctor.causal_b1 import causal_features
from retrofit_doctor.regime_reference import fit_prior
from run_b1 import save_json

OUT = ROOT / "results/regime_reference"
DATA = ROOT / "vendor/benchmark/data/full"


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


if __name__ == "__main__":
    {"feasibility": feasibility}[sys.argv[1]]()
