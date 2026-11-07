"""Task011 isolated-spread noise hypothesis and UNKNOWN-only waveform refinement at unchanged B1 alert times.

  B1  control: unchanged causal B1 (k=6, persistence 15, 24 h reference, 12 h refractory).
  Q1  one process/electrical/temperature channel with an isolated excessive within-minute spread
      (spread z > 12, >= 2 usable coupled channels all with spread z <= 2) -> SENSOR_NOISE_SPIKES
      on that channel; zero or several such channels -> exact B1.
  Q2  Q1 plus a within-minute extreme-to-spread ratio >= 4 on the same channel.
  U1  Q1; if it abstains and B1 said UNKNOWN, the unchanged Task010 W1 waveform rule may refine it.
  U2  Q2 with the same UNKNOWN-only W1 refinement.

B1 COMMUNICATION_LOSS / SENSOR_STUCK are never replaced. A spread hypothesis is not proof of a bad
transmitter: fast real process fluctuations remain an alternative. Ratios are descriptive, not
calibrated probabilities. Rows re-labelled by Q or W1 keep B1's `confidence`, which is B1's anomaly
score, not a confidence for the newly named cause. Task010 code is reused by import, unchanged.
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
from retrofit_sim import baselines as B
from retrofit_doctor import diagnosis_fusion as D

CANDIDATES = ("B1", "Q1", "Q2", "U1", "U2")
SOURCE_KEYS = ("ps", "pd", "q", "i", "pw", "bt", "wt", "tf")   # no vibration v/a/c, speed n, valve vp
MIN_COUNT = 30
SOURCE_SPREAD_Z = 12.0                 # strictly greater
COUPLED_SPREAD_Z_MAX = 2.0             # every usable coupled channel <= this (signed; no abs)
MIN_COUPLED = 2
OUTLIER_RATIO = 4.0                    # >= ; Q2/U2 only
USES_Q2 = {"Q2": True, "U2": True, "Q1": False, "U1": False}
USES_WAVEFORM = ("U1", "U2")
OUT_COLS = D.OUT_COLS + ["rule_detail"]
LIMITS = ("isolated within-minute spread is consistent with instrument noise/spikes but does not confirm a sensor "
          "failure; fast real process fluctuation remains an alternative")


def _val(g, row, col):
    if col not in g:
        return np.nan
    v = pd.to_numeric(pd.Series([g[col].iloc[row]]), errors="coerce").iloc[0]
    return float(v) if pd.notna(v) else np.nan


def channel_minute(g, row, key, installed):
    """Closed-minute statistics of one channel, or None unless installed, count >= 30, finite mean, finite std >= 0
    (a negative std is physically invalid) and finite spread z. Sources additionally require std > 0."""
    if key not in installed:
        return None
    ch = B.CH[key]
    count, mean, std = (_val(g, row, f"{ch}__{s}") for s in ("count", "mean", "std"))
    zs = _val(g, row, "zs_" + key)
    if not (np.isfinite(count) and count >= MIN_COUNT and np.isfinite(mean) and np.isfinite(std) and std >= 0
            and np.isfinite(zs)):
        return None
    return {"key": key, "channel": ch, "count": count, "mean": mean, "std": std, "spread_z": zs,
            "min": _val(g, row, f"{ch}__min"), "max": _val(g, row, f"{ch}__max")}


def outlier_ratio(s):
    """max(|max-mean|, |min-mean|) / std of the same closed minute, or None if min/max are unusable."""
    lo, hi, mean, std = s["min"], s["max"], s["mean"], s["std"]
    if not (np.isfinite(lo) and np.isfinite(hi) and lo <= mean <= hi and hi > lo and std > 0):
        return None
    return max(abs(hi - mean), abs(lo - mean)) / std


def isolated_spread(g, row, installed, require_outlier):
    """Return (eligible source details, all examined details) at one alert row."""
    eligible, examined = [], []
    for key in SOURCE_KEYS:
        s = channel_minute(g, row, key, installed)
        if s is None or not (s["std"] > 0 and s["spread_z"] > SOURCE_SPREAD_Z):
            continue
        coupled = [c for c in (channel_minute(g, row, k, installed) for k in dict.fromkeys(B.COUPLED[key])) if c]
        rec = {**s, "coupled": {c["channel"]: round(c["spread_z"], 6) for c in coupled}}
        ok = len(coupled) >= MIN_COUPLED and all(c["spread_z"] <= COUPLED_SPREAD_Z_MAX for c in coupled)
        if ok and require_outlier:
            r = outlier_ratio(s)
            rec["outlier_ratio"] = None if r is None else round(r, 6)
            ok = r is not None and r >= OUTLIER_RATIO
        rec["eligible"] = bool(ok)
        examined.append(rec)
        if ok:
            eligible.append(rec)
    return eligible, examined


def _fmt(x):
    return "nan" if not np.isfinite(x) else f"{x:.4g}"


def diagnose_asset(candidate, g, wf, installed):
    """Re-diagnose B1 alerts of one causal frame; `wf` is required for U1/U2 and ignored otherwise."""
    if candidate not in CANDIDATES:
        raise ValueError(candidate)
    base = D.diagnose_asset("B1", g, wf if candidate in USES_WAVEFORM else None, None, installed)
    if not len(base):
        return pd.DataFrame(columns=OUT_COLS)
    base = base.assign(rule_detail=None)
    if candidate == "B1":
        return base[OUT_COLS]
    rows = D.b1_alert_rows(g).row.to_numpy()
    out = []
    for i, r in base.iterrows():
        r = r.to_dict()
        j = int(rows[i])
        if r["b1_fault_type"] in D.PROTECTED:
            out.append(r)
            continue
        eligible, examined = isolated_spread(g, j, installed, USES_Q2[candidate])
        rule = "Q2" if USES_Q2[candidate] else "Q1"
        if len(eligible) == 1:
            s = eligible[0]
            coupled = ", ".join(f"{c} spread z={z:+.1f}" for c, z in s["coupled"].items())
            extra = f", extreme/std={s['outlier_ratio']:.2f}" if "outlier_ratio" in s else ""
            r.update(event_class="SENSOR", fault_type="SENSOR_NOISE_SPIKES", suspected_channel=s["channel"],
                     diagnosis_source=rule,
                     evidence=(f"{rule} isolated spread on {s['channel']}: minute mean={_fmt(s['mean'])}, "
                               f"std={_fmt(s['std'])}, count={int(s['count'])}, spread z={s['spread_z']:+.1f}{extra}; "
                               f"coupled {coupled}; {LIMITS}; B1 rule said {r['b1_fault_type']}"),
                     recommended_action=(f"Check the raw signal, wiring and a reference measurement of {s['channel']} "
                                         "under comparable operation; sensor failure unconfirmed."))
        elif candidate in USES_WAVEFORM and r["b1_fault_type"] == "UNKNOWN" and wf is not None:
            w = wf.iloc[j]
            hit = D.w1_rule(w)
            if hit:
                r.update(event_class=D.class_of(hit[0]), fault_type=hit[0], diagnosis_source="W1",
                         evidence=(f"W1 waveform refines B1 UNKNOWN: {hit[1]}; snapshot {w['wf_snapshot_id']} completed "
                                   f"{w['wf_complete_utc']}, age {w['wf_age_s']:.0f} s, speed check "
                                   f"{w['wf_speed_check']}, {int(w['wf_reference_snapshots'])} reference snapshots; "
                                   f"B1 rule said UNKNOWN"),
                         recommended_action=D.ACTION[hit[0]], suspected_channel=None)
        # evaluated_noise_rule is the Q rule that was evaluated; emitted_source is what produced the emitted row
        r["rule_detail"] = json.dumps({"evaluated_noise_rule": rule, "emitted_source": r["diagnosis_source"],
                                       "noise_rule_outcome": "emitted" if len(eligible) == 1 else
                                       ("abstained_ambiguous" if eligible else "abstained_no_source"),
                                       "eligible": len(eligible), "examined": [
            {k: (None if isinstance(v, float) and not np.isfinite(v) else (round(v, 6) if isinstance(v, float) else v))
             for k, v in e.items()} for e in examined]}, sort_keys=True)
        out.append(r)
    return pd.DataFrame(out, columns=OUT_COLS)


def predict_asset(candidate, feat, snaps, asset_row: pd.DataFrame, as_of=None, table=None):
    g = D.normalized_asset(feat, asset_row, as_of)
    wf = D.asset_waveform(g, snaps, asset_row, as_of, table) if len(g) and candidate in USES_WAVEFORM else None
    return diagnose_asset(candidate, g, wf, D.installed_keys(asset_row.iloc[0]))
