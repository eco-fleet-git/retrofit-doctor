"""Task012 hydraulic consistency of within-minute variability at unchanged B1 alert times.

  B1  control: unchanged causal B1 (k=6, persistence 15, 24 h reference, 12 h refractory).
  H3  the public pump characteristic propagates measured pressure/speed/flow variability into a
      native-unit variability budget for flow, suction and discharge pressure. Exactly one source with
      causal spread z > 6 and measured std / budget > 3.0 -> SENSOR_NOISE_SPIKES on it; else exact B1.
  H5  same with ratio > 5.0.
  V3/V5  H3/H5; on hydraulic abstention, the unchanged Task010 W1 rule may refine B1 UNKNOWN only.

This is an exploratory analytical-redundancy hypothesis, NOT a calibrated variance model, a certified
limit, proof of an instrument fault or a validated digital twin. Assumptions (not field measurements):
water-like fluid, rho = 1000 kg/m^3, g = 9.80665 m/s^2, atmospheric pressure 101.325 kPa, pure-water vapor
pressure (NIST Antoine), equal tap elevations and no velocity-head difference. Real transient flow, air,
cavitation, a wrong curve and tap geometry remain alternatives. Rows re-labelled by H or W1 keep B1's
`confidence`, which is B1's anomaly score, not a confidence for the newly named cause.
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
from retrofit_sim import baselines as B
from retrofit_doctor import diagnosis_fusion as D

CANDIDATES = ("B1", "H3", "H5", "V3", "V5")
FACTOR = {"H3": 3.0, "H5": 5.0, "V3": 3.0, "V5": 5.0}
USES_WAVEFORM = ("V3", "V5")
SOURCES = ("q", "ps", "pd")                         # flow_m3_h, suction_pressure_kpa, discharge_pressure_kpa
INPUTS = ("q", "ps", "pd", "n", "tf")
UNITS = {"q": "m3/h", "ps": "kPa(g)", "pd": "kPa(g)", "n": "rpm", "tf": "degC"}
NOT_ASSESSED = ("CAVITATION", "AIR_ENTRAINMENT")    # quasi-steady premise in question
RHO, G, P_ATM_KPA = 1000.0, 9.80665, 101.325
MIN_COUNT = 30
R_RANGE, Q_RANGE = (0.5, 1.0), (0.3, 1.3)
MAX_REL_STD_Q, MAX_REL_STD_N = 0.20, 0.05
CURVE_TOL = 0.20
NPSH_MARGIN = 1.5
SOURCE_SPREAD_Z = 6.0                               # strictly greater
REF_MIN_MINUTES = 60
# NIST water Antoine rows: (TK_min, TK_max, A, B, C); log10(P_bar) = A - B / (TK + C); first matching row
ANTOINE = ((273., 303., 5.40221, 1838.675, -31.737), (304., 333., 5.20389, 1733.926, -39.485),
           (334., 363., 5.0768, 1659.793, -45.854), (344., 373., 5.08354, 1663.125, -45.622))
OUT_COLS = D.OUT_COLS + ["rule_detail"]
ASSUMPTIONS = ("water-like fluid, rho=1000 kg/m3, g=9.80665 m/s2, assumed atmospheric 101.325 kPa, pure-water vapor "
               "pressure, equal tap elevations and no velocity-head difference")


# --- physics -----------------------------------------------------------------------------------------------

def vapor_pressure_kpa(temp_c):
    """NIST Antoine pure-water vapor pressure (kPa) from the first row whose range contains TK; None outside/gaps."""
    if not np.isfinite(temp_c):
        return None
    tk = temp_c + 273.15
    for lo, hi, a, b, c in ANTOINE:
        if lo <= tk <= hi:
            return 100.0 * 10 ** (a - b / (tk + c))
    return None


def head_from_kpa(p_kpa):
    return p_kpa * 1000.0 / (RHO * G)


def kpa_from_head(h_m):
    return h_m * RHO * G / 1000.0


def curve_head(Q, n, Qb, Hb, H0, nr):
    r = n / nr
    return H0 * r ** 2 - (H0 - Hb) * (Q / Qb) ** 2


def derivatives(Q, n, Qb, Hb, H0, nr):
    """Magnitudes of d(pressure rise)/dQ [kPa/(m3/h)] and d(pressure rise)/dn [kPa/rpm] of the public curve."""
    k = RHO * G / 1000.0
    return k * 2 * (H0 - Hb) * Q / Qb ** 2, k * 2 * H0 * (n / nr) / nr


def npsh3(npsh3b, r, q):
    return npsh3b * r ** 2 * (0.55 + 0.45 * q ** 2.6)


# --- inputs -----------------------------------------------------------------------------------------------

def _val(g, row, col):
    if col not in g:
        return np.nan
    v = pd.to_numeric(pd.Series([g[col].iloc[row]]), errors="coerce").iloc[0]
    return float(v) if pd.notna(v) else np.nan


def measured(g, row, key, installed):
    """Closed-minute mean/std/count of an installed channel with count >= 30, finite mean and finite std >= 0."""
    if key not in installed:
        return None
    ch = B.CH[key]
    count, mean, std = (_val(g, row, f"{ch}__{s}") for s in ("count", "mean", "std"))
    if not (np.isfinite(count) and count >= MIN_COUNT and np.isfinite(mean) and np.isfinite(std) and std >= 0):
        return None
    return {"channel": ch, "unit": UNITS[key], "mean": mean, "std": std, "count": int(count)}


def reference_floors(g, installed, reference_end):
    """Median source std over steady closed minutes ending by reference_end (>= 60 eligible), else None.

    An eligible reference minute has the source installed, count >= 30, a finite mean and a finite std >= 0."""
    ends = g.window_start_utc + D.MINUTE
    ref = (ends <= reference_end).to_numpy() & g.steady.to_numpy(dtype=bool)
    out = {}
    for key in SOURCES:
        ch = B.CH[key]
        if key not in installed or any(f"{ch}__{s}" not in g for s in ("mean", "std", "count")):
            out[key] = {"floor": None, "minutes": 0}
            continue
        std = pd.to_numeric(g[f"{ch}__std"], errors="coerce")
        cnt = pd.to_numeric(g[f"{ch}__count"], errors="coerce")
        mean = pd.to_numeric(g[f"{ch}__mean"], errors="coerce")
        ok = ref & (cnt >= MIN_COUNT).to_numpy() & np.isfinite(mean).to_numpy() & np.isfinite(std).to_numpy() \
            & (std >= 0).to_numpy()
        n = int(ok.sum())
        out[key] = {"floor": float(np.median(std[ok])) if n >= REF_MIN_MINUTES else None, "minutes": n}
    return out


def _passport(asset):
    vals = {k: pd.to_numeric(pd.Series([asset.get(k)]), errors="coerce").iloc[0] for k in
            ("pump_rated_flow_m3_h", "pump_rated_head_m", "pump_shutoff_head_m", "motor_rated_rpm", "npsh3_at_bep_m")}
    return {k: float(v) for k, v in vals.items()}


def _r6(x):
    return None if x is None or (isinstance(x, float) and not np.isfinite(x)) else round(float(x), 6)


def hydraulic_check(g, row, asset, installed, factor, floors, reference_end, b1_type):
    """Evaluate the hydraulic hypothesis at one alert row. Returns a JSON-able detail dict.

    detail["outcome"] is emitted / abstained_no_source / abstained_ambiguous / unsupported; unsupported carries
    the first failing applicability reason."""
    d = {"factor": factor, "assumptions": ASSUMPTIONS}

    def unsupported(reason, **kw):
        d.update(kw, outcome="unsupported", unsupported_reason=reason)
        return d

    if b1_type in NOT_ASSESSED:
        return unsupported("b1_cavitation_or_air_entrainment")
    if "water" not in str(asset.get("fluid", "")).lower():
        return unsupported("fluid_not_water_like", fluid=asset.get("fluid"))
    p = _passport(asset)
    Qb, Hb, H0, nr, N3 = (p[k] for k in ("pump_rated_flow_m3_h", "pump_rated_head_m", "pump_shutoff_head_m",
                                         "motor_rated_rpm", "npsh3_at_bep_m"))
    d["passport"] = {k: _r6(v) for k, v in p.items()}
    if not all(np.isfinite(v) and v > 0 for v in p.values()) or not H0 > Hb:
        return unsupported("passport_invalid")
    t_end = g.window_start_utc.iloc[row] + D.MINUTE
    if t_end < reference_end:
        return unsupported("reference_incomplete")
    if not bool(g.steady.iloc[row]):
        return unsupported("not_steady")
    if bool(g.gap.iloc[row]):
        return unsupported("gap")
    m = {k: measured(g, row, k, installed) for k in INPUTS}
    d["measured"] = {k: (None if v is None else {**v, "mean": _r6(v["mean"]), "std": _r6(v["std"])}) for k, v in m.items()}
    for k in INPUTS:
        if m[k] is None:
            return unsupported(f"input_unavailable_{B.CH[k]}")
    Q, Ps, Pd, n, T = (m[k]["mean"] for k in INPUTS)
    sQ, sPs, sPd, sn = (m[k]["std"] for k in ("q", "ps", "pd", "n"))
    r = n / nr
    qrel = Q / (r * Qb) if r > 0 else np.nan
    d["operating_point"] = {"speed_ratio": _r6(r), "flow_ratio_at_speed": _r6(qrel)}
    if not (R_RANGE[0] <= r <= R_RANGE[1]):
        return unsupported("speed_ratio_out_of_range")
    if not (Q > 0 and Q_RANGE[0] <= qrel <= Q_RANGE[1]):
        return unsupported("flow_ratio_out_of_range")
    if not Pd > Ps:
        return unsupported("discharge_not_above_suction")
    if sQ / Q > MAX_REL_STD_Q:
        return unsupported("flow_relative_std_too_large")
    if sn / n > MAX_REL_STD_N:
        return unsupported("speed_relative_std_too_large")
    Hc, Ho = curve_head(Q, n, Qb, Hb, H0, nr), head_from_kpa(Pd - Ps)
    d["curve"] = {"head_curve_m": _r6(Hc), "head_observed_m": _r6(Ho),
                  "relative_mismatch": _r6(abs(Ho - Hc) / Hc) if Hc > 0 else None}
    if not (Hc > 0 and Ho > 0):
        return unsupported("nonpositive_head")
    if abs(Ho - Hc) > CURVE_TOL * Hc:
        return unsupported("curve_mismatch")
    pv = vapor_pressure_kpa(T)
    d["npsh"] = {"vapor_pressure_kpa": _r6(pv)}
    if pv is None:
        return unsupported("vapor_pressure_out_of_range")
    npsha = head_from_kpa(P_ATM_KPA + Ps - pv)
    req = npsh3(N3, r, qrel)
    d["npsh"].update(npsha_lower_m=_r6(npsha), npsh3_m=_r6(req), margin_required=NPSH_MARGIN)
    if not npsha >= NPSH_MARGIN * req:
        return unsupported("npsh_margin_low")
    aQ, an = derivatives(Q, n, Qb, Hb, H0, nr)
    d["derivatives"] = {"aQ_kpa_per_m3h": _r6(aQ), "an_kpa_per_rpm": _r6(an)}
    if not (np.isfinite(aQ) and aQ > 0 and np.isfinite(an)):
        return unsupported("derivative_invalid")
    phys = {"pd": {"sigma_ps": sPs, "an_sigma_n": an * sn, "aQ_sigma_q": aQ * sQ},
            "ps": {"sigma_pd": sPd, "an_sigma_n": an * sn, "aQ_sigma_q": aQ * sQ},
            "q": {"sigma_pd_over_aQ": sPd / aQ, "sigma_ps_over_aQ": sPs / aQ, "an_sigma_n_over_aQ": an * sn / aQ}}
    sources, eligible = {}, []
    for k in SOURCES:
        fl = floors[k]
        bphys = float(sum(phys[k].values()))
        rec = {"channel": B.CH[k], "unit": UNITS[k], "sigma": _r6(m[k]["std"]),
               "physical_contributions": {c: _r6(v) for c, v in phys[k].items()}, "physical_budget": _r6(bphys),
               "reference_floor": _r6(fl["floor"]), "reference_minutes": fl["minutes"],
               "spread_z": _r6(_val(g, row, "zs_" + k))}
        if fl["floor"] is None:
            rec["status"] = "reference_unsupported"
        else:
            budget = bphys + fl["floor"]
            rec["budget"] = _r6(budget)
            if not budget > 0:
                rec["status"] = "budget_nonpositive"
            else:
                ratio = m[k]["std"] / budget
                zs = _val(g, row, "zs_" + k)
                rec["ratio"] = _r6(ratio)
                ok = np.isfinite(zs) and zs > SOURCE_SPREAD_Z and ratio > factor
                rec["status"] = "eligible" if ok else "not_eligible"
                if ok:
                    eligible.append(k)
        sources[k] = rec
    d["sources"] = sources
    d["eligible"] = [B.CH[k] for k in eligible]
    # With factor >= 1 two sources cannot both be eligible (each budget contains the other's measured spread);
    # the ambiguous branch is kept as a defensive guard only.
    d["outcome"] = "emitted" if len(eligible) == 1 else ("abstained_ambiguous" if eligible else "abstained_no_source")
    return d


# --- candidates -------------------------------------------------------------------------------------------

def diagnose_asset(candidate, g, wf, asset, installed):
    """Re-diagnose B1 alerts of one causal frame; `wf` is required for V3/V5 and ignored otherwise."""
    if candidate not in CANDIDATES:
        raise ValueError(candidate)
    base = D.diagnose_asset("B1", g, wf if candidate in USES_WAVEFORM else None, None, installed)
    if not len(base):
        return pd.DataFrame(columns=OUT_COLS)
    base = base.assign(rule_detail=None)
    if candidate == "B1":
        return base[OUT_COLS]
    rows = D.b1_alert_rows(g).row.to_numpy()
    ref_end = D.utc(asset["window_start_utc"]) + pd.Timedelta(hours=B.BASELINE_H)
    floors = reference_floors(g, installed, ref_end)
    rule = "H3" if FACTOR[candidate] == 3.0 else "H5"
    out = []
    for i, r in base.iterrows():
        r = r.to_dict()
        j = int(rows[i])
        if r["b1_fault_type"] in D.PROTECTED:
            r["rule_detail"] = json.dumps({"evaluated_rule": rule, "outcome": "not_evaluated_protected",
                                           "emitted_source": "B1"}, sort_keys=True)
            out.append(r)
            continue
        d = hydraulic_check(g, j, asset, installed, FACTOR[candidate], floors, ref_end, r["b1_fault_type"])
        if d["outcome"] == "emitted":
            k = next(k for k in SOURCES if d["sources"][k]["status"] == "eligible")
            s = d["sources"][k]
            contrib = ", ".join(f"{c}={v}" for c, v in s["physical_contributions"].items())
            meas = "; ".join(f"{v['channel']} mean={v['mean']} std={v['std']} {v['unit']} n={v['count']}"
                             for v in d["measured"].values())
            r.update(event_class="SENSOR", fault_type="SENSOR_NOISE_SPIKES", suspected_channel=s["channel"],
                     diagnosis_source=rule,
                     evidence=(f"{rule} hydraulic spread on {s['channel']}: std {s['sigma']} {s['unit']} vs budget "
                               f"{s['budget']} (physical {s['physical_budget']} [{contrib}] + reference floor "
                               f"{s['reference_floor']} over {s['reference_minutes']} min), ratio {s['ratio']} > "
                               f"{FACTOR[candidate]}, spread z {s['spread_z']}; {meas}; curve head "
                               f"{d['curve']['head_curve_m']} m vs observed {d['curve']['head_observed_m']} m; "
                               f"NPSHa_lower {d['npsh']['npsha_lower_m']} m vs NPSH3 {d['npsh']['npsh3_m']} m; "
                               f"assumes {ASSUMPTIONS}; physically informed inconsistency hypothesis, not proof of "
                               f"instrument failure; confidence is B1's anomaly score; B1 rule said {r['b1_fault_type']}"),
                     recommended_action=(f"Compare {s['channel']} raw signal with a reference instrument under steady "
                                         "operation; consider unmodelled transients (air, cavitation, control action) "
                                         "before replacing hardware."))
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


def predict_asset(candidate, feat, snaps, asset_row: pd.DataFrame, as_of=None, table=None):
    g = D.normalized_asset(feat, asset_row, as_of)
    wf = D.asset_waveform(g, snaps, asset_row, as_of, table) if len(g) and candidate in USES_WAVEFORM else None
    asset = asset_row.iloc[0]
    return diagnose_asset(candidate, g, wf, asset, D.installed_keys(asset))
