"""Task013 synchronized hydraulic residual at unchanged B1 alert times.

For each valid 1 Hz raw sample (double precision, kPa):
    Xpd = Pd, Xps = -Ps, Xq = (rho g/1000)(H0-Hb)(Q/Qb)^2, Xn = -(rho g/1000) H0 (n/nr)^2,  E = sum(X)
E is the measured pressure rise minus the public pump-curve pressure rise. Control-driven synchronized changes
largely cancel in E; independent instrument noise need not.

  R3/R5  std(E) > 3 / 5 x first-day empirical reference std(E) AND a unique covariance attribution
         c_j = Cov(E, X_j)/Var(E) (sum = 1; all >= -0.25; exactly one >= 0.75, others <= 0.25; not speed;
         source spread z > 6) -> SENSOR_NOISE_SPIKES on that channel; else exact B1.
  Y3/Y5  R3/R5; on abstention, unchanged Task010 W1 may refine B1 UNKNOWN only.
  E995   (pre-score amendment) as R3, but the excess test is the empirical first-day upper-tail rank
         (1 + b)/(N + 1) <= 0.005, N >= 199 eligible reference minutes, b = #reference std(E) >= current
         (ties count against). Not a fault probability, valid p-value or calibrated false-alarm rate.
  Z995   E995; on abstention, unchanged W1 may refine B1 UNKNOWN only.

The c_j are variance-decomposition terms, NOT causal probabilities. A strong residual can also come from
dynamics or a wrong model. Task012 applicability gates are reused unchanged and recorded separately; Task012
budgets/floors are not a decision gate here. Rows re-labelled keep B1's confidence, which is B1's anomaly
score, not a confidence in the proposed cause. Assumptions as Task012 (rho, g, atmosphere, taps).
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from retrofit_sim import baselines as B
from retrofit_doctor import diagnosis_fusion as D
from retrofit_doctor import hydraulic_spread as H

CANDIDATES = ("B1", "R3", "R5", "E995", "Y3", "Y5", "Z995")
FACTOR = {"R3": 3.0, "R5": 5.0, "Y3": 3.0, "Y5": 5.0}
TAIL = {"E995": 0.005, "Z995": 0.005}
RULE = {"R3": "R3", "Y3": "R3", "R5": "R5", "Y5": "R5", "E995": "E995", "Z995": "E995"}
USES_WAVEFORM = ("Y3", "Y5", "Z995")
TAIL_MIN_MINUTES = 199
TERMS = ("pd", "ps", "q", "n")
RAW = {"pd": "discharge_pressure_kpa", "ps": "suction_pressure_kpa", "q": "flow_m3_h", "n": "motor_speed_rpm"}
RAW_COLUMNS = ["timestamp_utc", "operating_mode", "sample_interval_s"] + list(RAW.values())
MIN_PAIRED = 30
REF_MIN_MINUTES = 60
SUM_TOL = 1e-6
MIN_TERM = -0.25
DOMINANT, COMPETITOR_MAX = 0.75, 0.25
SOURCE_SPREAD_Z = 6.0
K_KPA_PER_M = H.RHO * H.G / 1000.0
STAT_COLS = ["minute_start", "minute_end", "rows_total", "rows_running", "paired", "invalid_reason", "mean_E",
             "var_E", "std_E"] + [f"cov_E_{t}" for t in TERMS] + [f"var_{t}" for t in TERMS]
OUT_COLS = D.OUT_COLS + ["rule_detail"]


# --- raw loading (train partitions only) -------------------------------------------------------------------

def capability(asset):
    """None if the passport lists every required raw channel, else an explicit reason."""
    listed = set(str(asset.get("channels_available", "")).split("|"))
    missing = [c for c in RAW.values() if c not in listed]
    return f"channels_not_installed:{','.join(missing)}" if missing else None


def load_train_raw(data_dir, assets):
    """Read only explicit train asset partitions (columns needed here); assert IDs and window bounds."""
    data_dir = Path(data_dir)
    raw, caps = {}, {}
    for _, a in assets.sort_values("asset_id").iterrows():
        aid = a.asset_id
        if aid not in D.TRAIN_ASSETS or a.split != "train":
            raise PermissionError(f"{aid} is not a train asset")
        caps[aid] = capability(a)
        if caps[aid]:
            continue
        raw[aid] = read_asset_partition(data_dir / "telemetry", aid, a.window_start_utc, a.window_end_utc)
    return raw, caps


def read_asset_partition(root, aid, window_start, window_end):
    """Read only the files under root/asset_id=<aid>/; asset_id/day are restored from the hive path relative to
    root (no other asset directory is listed or read). IDs, timestamps and window bounds are asserted."""
    import pyarrow.dataset as ds
    root = Path(root)
    files = sorted(str(f) for f in (root / f"asset_id={aid}").rglob("*.parquet"))
    if not files:
        raise FileNotFoundError(f"no raw partition files for {aid}")
    dset = ds.dataset(files, format="parquet", partitioning="hive", partition_base_dir=str(root))
    r = dset.to_table(columns=RAW_COLUMNS + ["asset_id"]).to_pandas()
    if set(r.asset_id.astype(str)) != {aid}:
        raise RuntimeError(f"partition {aid} returned other asset IDs")
    t = pd.to_datetime(r.timestamp_utc, utc=True, errors="coerce")
    if t.isna().any():
        raise ValueError(f"{aid}: {int(t.isna().sum())} raw rows with missing/unparseable timestamp_utc")
    if len(t) and (t.min() < D.utc(window_start) or t.max() >= D.utc(window_end)):
        raise RuntimeError(f"{aid} raw rows outside the asset window")
    return r.drop(columns=["asset_id"]).sort_values("timestamp_utc", kind="stable").reset_index(drop=True)


# --- per-minute synchronized statistics --------------------------------------------------------------------

def terms(Q, Ps, Pd, n, passport):
    Qb, Hb, H0, nr = (passport[k] for k in ("pump_rated_flow_m3_h", "pump_rated_head_m", "pump_shutoff_head_m",
                                            "motor_rated_rpm"))
    X = {"pd": np.asarray(Pd, "float64"), "ps": -np.asarray(Ps, "float64"),
         "q": K_KPA_PER_M * (H0 - Hb) * (np.asarray(Q, "float64") / Qb) ** 2,
         "n": -K_KPA_PER_M * H0 * (np.asarray(n, "float64") / nr) ** 2}
    return X, X["pd"] + X["ps"] + X["q"] + X["n"]


def residual_table(raw: pd.DataFrame, asset, as_of=None) -> pd.DataFrame:
    """Closed-minute statistics of E from raw rows strictly before `as_of`; minutes ending after it are dropped.

    A minute is [start, start+1 min); a row exactly at a minute end belongs to the next minute. Minutes with
    duplicate timestamps, off-grid timestamps or a non-1 s nominal interval are kept with an invalid_reason and
    no statistics (never silently weighted). Only RUNNING rows with all four channels finite, Q > 0 and n > 0
    are paired; nothing is filled."""
    if raw is None or not len(raw):
        return pd.DataFrame(columns=STAT_COLS)
    r = raw.copy()
    r["t"] = pd.to_datetime(r.timestamp_utc, utc=True, errors="coerce")
    if r.t.isna().any():                                   # explicit rejection, never silently dropped by groupby
        raise ValueError(f"{int(r.t.isna().sum())} raw rows with missing/unparseable timestamp_utc")
    if as_of is not None:
        r = r[r.t < D.utc(as_of)]
    if not len(r):
        return pd.DataFrame(columns=STAT_COLS)
    r["minute_start"] = r.t.dt.floor("min")
    r["dup"] = r.t.duplicated(keep=False)
    r["offgrid"] = r.t != r.t.dt.floor("s")
    r["badint"] = pd.to_numeric(r.sample_interval_s, errors="coerce") != 1
    p = H._passport(asset)
    for c in RAW.values():
        r[c] = pd.to_numeric(r[c], errors="coerce").astype("float64")
    running = r.operating_mode.astype(str) == "RUNNING"
    ok = running & np.isfinite(r[list(RAW.values())]).all(axis=1) & (r[RAW["q"]] > 0) & (r[RAW["n"]] > 0)
    X, E = terms(r[RAW["q"]], r[RAW["ps"]], r[RAW["pd"]], r[RAW["n"]], p)
    pr = pd.DataFrame({"minute_start": r.minute_start, "E": E, **{f"X_{t}": X[t] for t in TERMS}})[ok.to_numpy()]
    r["is_running"] = running
    g = r.groupby("minute_start", sort=True)
    out = pd.DataFrame({"rows_total": g.size(), "rows_running": g.is_running.sum().astype(int),
                        "dup": g.dup.any(), "offgrid": g.offgrid.any(), "badint": g.badint.any()})
    if len(pr):
        c = pr.groupby("minute_start", sort=True)
        cols = ["E"] + [f"X_{t}" for t in TERMS]
        dev = pr[cols] - c[cols].transform("mean")                 # centred within the same paired rows
        prod = pd.DataFrame({"minute_start": pr.minute_start, "EE": dev.E ** 2,
                             **{f"EX_{t}": dev.E * dev[f"X_{t}"] for t in TERMS},
                             **{f"XX_{t}": dev[f"X_{t}"] ** 2 for t in TERMS}})
        sums = prod.groupby("minute_start", sort=True).sum()
        n = c.size()
        den = (n - 1).where(n > 1)
        stats = pd.DataFrame({"paired": n, "mean_E": c.E.mean(), "var_E": sums.EE / den})
        for t in TERMS:
            stats[f"cov_E_{t}"] = sums[f"EX_{t}"] / den
            stats[f"var_{t}"] = sums[f"XX_{t}"] / den
        out = out.join(stats, how="left")
    out["paired"] = out.get("paired", pd.Series(0, index=out.index)).fillna(0).astype(int)
    reason = np.where(out.dup, "duplicate_timestamps", np.where(out.offgrid, "off_grid_timestamp",
                      np.where(out.badint, "sample_interval_not_1s", None)))
    out["invalid_reason"] = reason
    out.loc[out.invalid_reason.notna(), ["paired"]] = 0
    for col in STAT_COLS:
        if col not in out and col not in ("minute_start", "minute_end"):
            out[col] = np.nan
    stat = ["mean_E", "var_E"] + [f"cov_E_{t}" for t in TERMS] + [f"var_{t}" for t in TERMS]
    out.loc[out.invalid_reason.notna() | (out.paired < 2), stat] = np.nan
    out["std_E"] = np.sqrt(out.var_E)
    out = out.reset_index().rename(columns={"index": "minute_start"})
    out["minute_end"] = out.minute_start + D.MINUTE
    if as_of is not None:
        out = out[out.minute_end <= D.utc(as_of)]
    out["invalid_reason"] = out.invalid_reason.astype(object).where(out.invalid_reason.notna(), None)
    return out[STAT_COLS].reset_index(drop=True)


def residual_reference(table, g, reference_end):
    """Median std(E) over first-24h closed minutes with g.steady, no gap, paired >= 30, finite std >= 0."""
    if not len(table) or not len(g):
        return {"reference_std_kpa": None, "minutes": 0, "median_raw": None, "_values": np.array([], "float64")}
    steady = dict(zip(g.window_start_utc, g.steady.astype(bool) & ~g.gap.astype(bool)))
    t = table[(table.minute_end <= reference_end) & table.invalid_reason.isna() & (table.paired >= MIN_PAIRED)
              & np.isfinite(table.std_E) & (table.std_E >= 0)]
    t = t[np.array([bool(steady.get(m, False)) for m in t.minute_start], dtype=bool)]   # explicit bool mask
    vals = np.sort(t.std_E.to_numpy(dtype="float64"))
    med = float(np.median(vals)) if len(vals) else None
    return {"reference_std_kpa": med if len(vals) >= REF_MIN_MINUTES and med > 0 else None, "minutes": int(len(t)),
            "median_raw": med, "_values": vals}


def tail_rank(values, current):
    """(1 + b) / (N + 1) with b = #reference values >= current (ties count against the candidate)."""
    b = int(np.sum(np.asarray(values) >= current))
    return b, (1 + b) / (len(values) + 1)


def _r(x):
    return None if x is None or not np.isfinite(x) else round(float(x), 9)


def residual_decision(g, row, asset, installed, factor, table, reference, b1_type, tail=None):
    """Applicability (Task012, recorded separately) then the residual rule at one alert row.

    `tail` (E995) replaces only the factor excess test by the empirical tail rank."""
    ref_end = D.utc(asset["window_start_utc"]) + pd.Timedelta(hours=B.BASELINE_H)
    if g.window_start_utc.iloc[row] + D.MINUTE < ref_end:   # at this alert's own clock the reference is not known
        reference = {"reference_std_kpa": None, "minutes": None, "median_raw": None, "status": "incomplete"}
    floors = H.reference_floors(g, installed, ref_end)
    app = H.hydraulic_check(g, row, asset, installed, 3.0, floors, ref_end, b1_type)
    d = {"factor": factor, "tail_limit": tail, "assumptions": H.ASSUMPTIONS,
         "applicability": {"passed": app["outcome"] != "unsupported", "unsupported_reason": app.get("unsupported_reason"),
                           **{k: app.get(k) for k in ("measured", "operating_point", "curve", "npsh", "passport")}},
         "reference": {k: _r(v) if isinstance(v, float) else v for k, v in reference.items() if k != "_values"}}

    def stop(reason, **kw):
        d.update(kw, outcome="unsupported" if reason.startswith(("applicability", "raw", "residual_reference",
                                                                  "capability")) else "abstained",
                 reason=reason)
        return d

    if app["outcome"] == "unsupported":
        return stop(f"applicability:{app['unsupported_reason']}")
    cap = capability(asset)
    if cap:
        return stop(f"capability:{cap}")
    start = g.window_start_utc.iloc[row]
    m = table[table.minute_start == start]
    if not len(m):
        return stop("raw_minute_unavailable")
    m = m.iloc[0]
    d["minute"] = {"start": start.isoformat(), "end": (start + D.MINUTE).isoformat(), "rows_total": int(m.rows_total),
                   "rows_running": int(m.rows_running), "paired": int(m.paired), "invalid_reason": m.invalid_reason,
                   "mean_E_kpa": _r(m.mean_E), "std_E_kpa": _r(m.std_E), "var_E_kpa2": _r(m.var_E)}
    if m.invalid_reason is not None:
        return stop(f"raw_invalid:{m.invalid_reason}")
    if m.paired < MIN_PAIRED:
        return stop("raw_paired_count_below_30")
    if tail is None:
        if reference["reference_std_kpa"] is None:
            return stop("residual_reference_unsupported")
    else:
        vals = reference.get("_values")
        med = reference.get("median_raw")
        if vals is None or len(vals) < TAIL_MIN_MINUTES or not (med is not None and med > 0):
            return stop("residual_reference_unsupported")
    if not (np.isfinite(m.var_E) and m.var_E > 0):
        return stop("residual_variance_not_positive")
    if tail is None:
        ratio = m.std_E / reference["reference_std_kpa"]
        d["excess_ratio"] = _r(ratio)
        if not ratio > factor:
            return stop("residual_not_excessive")
    else:
        b, rank = tail_rank(vals, m.std_E)
        d["tail"] = {"N": int(len(vals)), "b": b, "tail_rank": _r(rank), "limit": tail,
                     "reference_median_kpa": _r(med)}
        if not rank <= tail:
            return stop("residual_not_in_empirical_tail")
    c = {t: float(m[f"cov_E_{t}"] / m.var_E) for t in TERMS}
    d["covariances_kpa2"] = {t: _r(float(m[f"cov_E_{t}"])) for t in TERMS}
    d["term_variances_kpa2"] = {t: _r(float(m[f"var_{t}"])) for t in TERMS}
    d["contributions"] = {t: _r(v) for t, v in c.items()}
    d["contribution_sum"] = _r(sum(c.values()))
    if not abs(sum(c.values()) - 1) <= SUM_TOL:
        return stop("decomposition_identity_failed")
    if min(c.values()) < MIN_TERM:
        return stop("strong_cancellation")
    dom = [t for t, v in c.items() if v >= DOMINANT]
    if len(dom) != 1 or any(v > COMPETITOR_MAX for t, v in c.items() if t != dom[0]):
        return stop("no_unique_dominant_term")
    src = dom[0]
    d["dominant"] = RAW[src]
    if src == "n":
        return stop("dominant_speed_not_a_supported_sensor_source")
    zs = H._val(g, row, "zs_" + src)
    d["source_spread_z"] = _r(zs)
    if not (np.isfinite(zs) and zs > SOURCE_SPREAD_Z):
        return stop("source_spread_z_not_above_6")
    d.update(outcome="emitted", reason=None, source=RAW[src])
    return d


def diagnose_asset(candidate, g, wf, asset, installed, table):
    """Re-diagnose the B1 alerts of one causal frame; `table` must contain only minutes closed by the clock."""
    if candidate not in CANDIDATES:
        raise ValueError(candidate)
    if len(g) and table is not None and len(table) and \
            (table.minute_end > g.window_start_utc.iloc[-1] + D.MINUTE).any():
        raise ValueError("residual table contains minutes after the frame clock")
    base = D.diagnose_asset("B1", g, wf if candidate in USES_WAVEFORM else None, None, installed)
    if not len(base):
        return pd.DataFrame(columns=OUT_COLS)
    base = base.assign(rule_detail=None)
    if candidate == "B1":
        return base[OUT_COLS]
    rows = D.b1_alert_rows(g).row.to_numpy()
    ref_end = D.utc(asset["window_start_utc"]) + pd.Timedelta(hours=B.BASELINE_H)
    clock = g.window_start_utc.iloc[-1] + D.MINUTE
    reference = residual_reference(table, g, ref_end) if clock >= ref_end else {"reference_std_kpa": None,
                                                                                "minutes": 0, "median_raw": None}
    rule = RULE[candidate]
    out = []
    for i, r in base.iterrows():
        r = r.to_dict()
        j = int(rows[i])
        if r["b1_fault_type"] in D.PROTECTED:
            r["rule_detail"] = json.dumps({"evaluated_rule": rule, "outcome": "not_evaluated_protected",
                                           "emitted_source": "B1"}, sort_keys=True)
            out.append(r)
            continue
        d = residual_decision(g, j, asset, installed, FACTOR.get(candidate), table, reference, r["b1_fault_type"],
                              TAIL.get(candidate))
        if d["outcome"] == "emitted":
            mi = d["minute"]
            shares = ", ".join(f"{RAW[t]}={v}" for t, v in d["contributions"].items())
            r.update(event_class="SENSOR", fault_type="SENSOR_NOISE_SPIKES", suspected_channel=d["source"],
                     diagnosis_source=rule,
                     evidence=(f"{rule} synchronized residual: minute {mi['start']}..{mi['end']} ({mi['paired']} paired "
                               f"1 Hz rows of {mi['rows_total']}), std(E) {mi['std_E_kpa']} kPa vs first-day reference "
                               + (f"{d['reference']['reference_std_kpa']} kPa over {d['reference']['minutes']} min "
                                  f"(ratio {d['excess_ratio']} > {FACTOR[candidate]}); " if rule != "E995" else
                                  f"median {d['tail']['reference_median_kpa']} kPa, empirical upper-tail rank "
                                  f"(1+b)/(N+1) = {d['tail']['tail_rank']} with N={d['tail']['N']}, b={d['tail']['b']}, "
                                  f"limit {d['tail']['limit']} (not a fault probability, valid p-value or calibrated "
                                  "false-alarm rate); ")
                               + f"covariance shares {shares} "
                               f"(sum {d['contribution_sum']}; variance decomposition, not causal probabilities); "
                               f"{d['source']} spread z {d['source_spread_z']}; assumes {H.ASSUMPTIONS}; a strong "
                               "residual can also come from dynamics or a wrong model; confidence is B1's anomaly "
                               f"score; B1 rule said {r['b1_fault_type']}"),
                     recommended_action=(f"Inspect synchronized traces and check {d['source']} with an independent "
                                         "instrument before replacement."))
        elif candidate in USES_WAVEFORM and r["b1_fault_type"] == "UNKNOWN" and wf is not None:
            w = wf.iloc[j]
            hit = D.w1_rule(w)
            if hit:
                r.update(event_class=D.class_of(hit[0]), fault_type=hit[0], diagnosis_source="W1",
                         evidence=(f"W1 waveform refines B1 UNKNOWN: {hit[1]}; snapshot {w['wf_snapshot_id']} completed "
                                   f"{w['wf_complete_utc']}, age {w['wf_age_s']:.0f} s, speed check "
                                   f"{w['wf_speed_check']}, {int(w['wf_reference_snapshots'])} reference snapshots; "
                                   "confidence is B1's anomaly score; B1 rule said UNKNOWN"),
                         recommended_action=D.ACTION[hit[0]], suspected_channel=None)
        d.update(evaluated_rule=rule, emitted_source=r["diagnosis_source"])
        r["rule_detail"] = json.dumps(d, sort_keys=True, default=str)
        out.append(r)
    return pd.DataFrame(out, columns=OUT_COLS)


def predict_asset(candidate, feat, raw, snaps, asset_row: pd.DataFrame, as_of=None, table=None, rtable=None):
    """Causal path at an explicit clock. `rtable` may be a cached residual_table of the full raw input; it is
    filtered here to minutes closed by the clock (per-minute statistics never depend on later rows)."""
    asset = asset_row.iloc[0]
    g = D.normalized_asset(feat, asset_row, as_of)
    wf = D.asset_waveform(g, snaps, asset_row, as_of, table) if len(g) and candidate in USES_WAVEFORM else None
    if not len(g):
        return pd.DataFrame(columns=OUT_COLS)
    clock = g.window_start_utc.iloc[-1] + D.MINUTE
    if candidate == "B1":
        rt = pd.DataFrame(columns=STAT_COLS)
    elif rtable is not None:
        rt = rtable[rtable.minute_end <= clock].reset_index(drop=True)
    else:
        rt = residual_table(raw, asset, clock)
    return diagnose_asset(candidate, g, wf, asset, D.installed_keys(asset), rt)
