"""Supplemental train-only B2 causality audit at the exact stored causal B1 train cutpoints.

  PYTHONHASHSEED=0 python scripts/audit_causal_b2_cutpoints.py

Reads the 162 train rows of results/causal_b1/causality_audit.csv (validation rows are
skipped, not replayed) and checks B2 C1..C5 predictions, evidence and channel quality
(full run vs independent prefix run). Does not change the sealed model or the r2 selection.
The shared causal_features normalization is unchanged and covered by the B1 audit.
"""
from __future__ import annotations

import json
from pathlib import Path
import sys

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "src"), str(ROOT / "vendor/benchmark/src"), str(ROOT / "scripts")]
from retrofit_doctor import causal_b2 as B2
from run_b1 import save_json, sha256
from run_causal_b2 import DATA, OUT, same


def main():
    stored = pd.read_csv(ROOT / "results/causal_b1/causality_audit.csv").query("split == 'train'")
    assets, feat = B2.load_split_inputs(DATA, "train")
    rows = []
    for aid, cuts in stored.groupby("asset_id", sort=True):
        a = assets[assets.asset_id == aid]
        f = feat[feat.asset_id == aid]
        end = pd.Timestamp(a.window_end_utc.iloc[0])
        full_q = B2.channel_quality(f, a, {aid: end})
        for c in list(B2.CANDIDATES):
            fp, fe = B2.predict_b2(f, a, {aid: end}, c)
            for _, r in cuts.iterrows():
                cut = pd.Timestamp(r.cutoff_utc)
                prefix = f[pd.to_datetime(f.window_start_utc, utc=True) + pd.Timedelta(minutes=1) <= cut]
                sp, se = B2.predict_b2(prefix, a, {aid: cut}, c)
                keep = pd.to_datetime(fe.alert_time_utc, utc=True) <= cut
                q_ok = None
                if c == "C1":
                    sq = B2.channel_quality(prefix, a, {aid: cut})
                    q_ok = same(full_q[full_q.window_start_utc + pd.Timedelta(minutes=1) <= cut], sq)
                rows.append({"candidate": c, "asset_id": aid, "cutoff_utc": r.cutoff_utc, "kind": r.kind,
                             "alerts": len(sp), "predictions_match": same(fp[keep], sp),
                             "evidence_match": same(fe[keep], se), "quality_match": q_ok})
        print(aid, len(cuts), "stored cutpoints", flush=True)
    audit = pd.DataFrame(rows)
    audit.to_csv(OUT / "supplemental_original_train_cutpoints_audit.csv", index=False)
    failures = int((~audit.predictions_match).sum() + (~audit.evidence_match).sum()
                   + (audit.quality_match == False).sum())  # noqa: E712
    summary = {"stored_train_cutpoints": len(stored), "candidates": list(B2.CANDIDATES), "rows": len(audit),
               "by_kind": stored.kind.value_counts().to_dict(), "failures": failures,
               "validation_cutpoints_replayed": 0, "causal_b2_sha256": sha256(ROOT / "src/retrofit_doctor/causal_b2.py")}
    save_json(OUT / "supplemental_original_train_cutpoints_summary.json", summary)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
