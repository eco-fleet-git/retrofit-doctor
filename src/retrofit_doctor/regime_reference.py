"""Task005 E3/E4 candidates on top of the released control (unchanged causal B1, k=6, persist=15).

Proposed manifest: docs/experiments/followup/2026-11-07-e3-e4-manifest.json (definitions mirrored here).

E3 (H2 regime, H6 abstention)
  R0  control: unchanged causal B1.
  R1  causal regime gate on the AMPLITUDE path only. A B1 speed-ratio regime bin is SUPPORTED only if the
      frozen 24 h commissioning reference holds >= 60 steady minutes in that bin; otherwise every z/zs value
      of the minute is withheld (INSUFFICIENT_REGIME_SUPPORT, never z = 0). When the bin changes between two
      consecutive minutes with a finite speed ratio, that minute and the next 9 are TRANSITION: they cannot
      raise the z flag. The original B1 `steady` flag is kept for flatline/stuck checks and diagnosis.
      B1 keeps one shared persistence counter: a TRANSITION minute continues the run only if a gap or
      flatline flag is set there; otherwise it breaks it, exactly as a non-steady minute does in B1.
  R2  abstention relabelling. Alert times, classes and per-type refractory are identical to R0 (suppression
      keyed on the B1 type). The emitted type becomes UNKNOWN (class_status UNCERTAIN, B1 class kept as the
      scorer-required label, B1 type kept as alternative) when: (a) the B1 single-channel sensor rule fired
      with fewer than 2 coupled channels carrying a finite reference z; or (b) a B1 machine rule result
      differs from the same rules evaluated without NaN -> 0 (decision relied on a missing operand).

E4 (H3 cold start / contaminated reference) -- tentative statistical transfer hypotheses, not physical
performance residuals and not health certification
  P0  control: unchanged causal B1.
  P1  cold-start fleet prior: before the asset's own reference closes, z for five normalised quantities
      comes from a LOAO prior (fit on the other six train assets); same k, persistence, refractory and B1
      rule logic, with alerts labelled as fleet-prior provenance. After the reference closes: unchanged B1.
  P2  reference-quality check: unchanged B1 plus at most one alert at reference close if any normalised
      own-reference median deviates from the fleet prior by |z| > 6.

Prior quantities: i/I_rated, pw/P_rated, q/Q_design, v/v_alarm [all dimensionless], bt - tf [K]. Discharge
pressure is excluded: pd/(g*H_design) is not normalised pump head (inlet pressure and losses differ).
An input counts only if the channel is installed in public metadata, observed in that minute (count > 0,
finite mean) and its nameplate scale is present, finite and positive; otherwise unsupported (NaN).
"""
from __future__ import annotations

import hashlib
import json

import numpy as np
import pandas as pd
from retrofit_sim import baselines as B
from retrofit_doctor.causal_b1 import causal_features
from retrofit_doctor.causal_b2 import _machine_rules

K = 6.0
PERSIST = 15
REGIME_MIN_REF_MINUTES = 60
TRANSITION_MINUTES = 10
SENSOR_MIN_COUPLED = 2
NEAR_RATED = (0.90, 1.05)
PRIOR_MIN_MINUTES = 60
PRIOR_MIN_ASSETS = 3
QUALITY_TYPES = ("COMMUNICATION_LOSS", "SENSOR_STUCK")
PRIOR = {  # B1 key: (channel, subtracted channel, nameplate scale, floor, unit, quantity label)
    "i": ("motor_current_a", None, "motor_rated_current_a", .02, "1", "motor_current_a/motor_rated_current_a"),
    "pw": ("motor_power_kw", None, "motor_rated_kw", .02, "1", "motor_power_kw/motor_rated_kw"),
    "q": ("flow_m3_h", None, "design_flow_m3_h", .02, "1", "flow_m3_h/design_flow_m3_h"),
    "v": ("vibration_rms_mm_s", None, "vibration_alarm_mm_s", .05, "1", "vibration_rms_mm_s/vibration_alarm_mm_s"),
    "bt": ("bearing_temp_c", "fluid_temp_c", None, 1.0, "K", "bearing_temp_c-fluid_temp_c"),
}
VARIANTS = {"R0": "E3", "R1": "E3", "R2": "E3", "P0": "E4", "P1": "E4", "P2": "E4"}
COLS = B._COLS + ["class_status", "original_fault_type", "rule_id", "detail"]


# --- inputs -----------------------------------------------------------------------------------------------

def _installed(asset):
    return set(str(asset.get("channels_available") or "").split("|")) - {""}


def observed(g, asset, channel):
    """Value only where the channel is installed and actually observed in the minute; else NaN."""
    m, c = g.get(f"{channel}__mean"), g.get(f"{channel}__count")
    if channel not in _installed(asset) or m is None or c is None:
        return pd.Series(np.nan, index=g.index)
    return m.where((c.fillna(0) > 0) & np.isfinite(m))


def _scale(asset, key):
    try:
        v = float(asset[key])
    except (KeyError, TypeError, ValueError):
        return None
    return v if np.isfinite(v) and v > 0 else None


def normalised(g, asset):
    """Prior quantities per minute; NaN when any required input or nameplate scale is unsupported."""
    out = {}
    for key, (ch, minus, den, *_rest) in PRIOR.items():
        x = observed(g, asset, ch)
        if minus is not None:
            x = x - observed(g, asset, minus)
        if den is not None:
            s = _scale(asset, den)
            x = x / s if s else pd.Series(np.nan, index=g.index)
        out[key] = x
    return pd.DataFrame(out)


def near_rated(g, asset):
    if "motor_speed_rpm" in _installed(asset):
        rated = _scale(asset, "motor_rated_rpm")
        r = observed(g, asset, "motor_speed_rpm") / rated if rated else pd.Series(np.nan, index=g.index)
        return (r >= NEAR_RATED[0]) & (r <= NEAR_RATED[1])
    return pd.Series(asset.get("control") == "FIXED_SPEED", index=g.index)


def prior_minutes(g, asset):
    """Minutes usable for prior statistics: B1 steady, no gateway gap, near rated speed."""
    return g.steady & ~g.gap & near_rated(g, asset)


# --- LOAO fleet prior ---------------------------------------------------------------------------------------

def fit_prior(normalized_fit, assets_fit, events_fit):
    """Fleet prior from fit assets only. Labels select fit windows: every labelled event of a fit asset,
    observable or not, excludes [onset, end) (end missing -> window end). This does not certify health."""
    per_asset = {k: [] for k in PRIOR}
    support = {}
    for aid, g in normalized_fit.groupby("asset_id", sort=True):
        asset = assets_fit[assets_fit.asset_id == aid].iloc[0].to_dict()
        ok = prior_minutes(g, asset)
        t = g.window_start_utc
        for _, e in events_fit[events_fit.asset_id == aid].iterrows():
            on = pd.Timestamp(e.onset_utc)
            end = pd.Timestamp(e.end_utc) if pd.notna(e.end_utc) else pd.Timestamp(asset["window_end_utc"])
            ok &= ~((t + pd.Timedelta(minutes=1) > on) & (t < end))
        x = normalised(g, asset)
        support[aid] = {}
        for k in PRIOR:
            v = x[k][ok].dropna()
            support[aid][k] = int(len(v))
            if len(v) >= PRIOR_MIN_MINUTES:
                med = float(v.median())
                per_asset[k].append((aid, med, float(1.4826 * (v - med).abs().median())))
    channels = {}
    for k, rows in per_asset.items():
        quantity, unit = PRIOR[k][5], PRIOR[k][4]
        if len(rows) < PRIOR_MIN_ASSETS:
            channels[k] = {"supported": False, "fit_assets": [r[0] for r in rows], "quantity": quantity, "unit": unit}
            continue
        meds = np.array([r[1] for r in rows])
        within = float(np.median([r[2] for r in rows]))
        between = float(1.4826 * np.median(np.abs(meds - np.median(meds))))
        channels[k] = {"supported": True, "fit_assets": [r[0] for r in rows], "quantity": quantity, "unit": unit,
                       "median": float(np.median(meds)), "scale": max(float(np.hypot(between, within)), PRIOR[k][3]),
                       "between_asset": between, "within_asset": within}
    prior_id = hashlib.sha256(json.dumps(channels, sort_keys=True).encode()).hexdigest()[:16]
    return {"prior_id": prior_id, "channels": channels, "fit_minutes": support}


def prior_z(g, asset, prior):
    x = normalised(g, asset)
    ok = prior_minutes(g, asset)
    return pd.DataFrame({k: ((x[k] - p["median"]) / p["scale"]).where(ok) if p["supported"]
                         else pd.Series(np.nan, index=g.index) for k, p in prior["channels"].items()})


def _prior_text(zs, prior):
    top = sorted(((k, v) for k, v in zs.items() if np.isfinite(v)), key=lambda kv: (-abs(kv[1]), kv[0]))[:3]
    return ", ".join(f"{prior['channels'][k]['quantity']} z={v:+.1f}" for k, v in top)


# --- B1 loop with hooks (parity with vendor b1_threshold is tested) ----------------------------------------

def _b1_rows(g, diagnose, extra=None):
    g = g.reset_index(drop=True)
    zm = B._zmax(g, K)
    amp = g["amplitude_steady"].values if "amplitude_steady" in g else g["steady"].values
    flag = (amp & (zm > K)) | g["gap"].values | B._flat_any(g)   # _flat_any uses the original B1 steady
    rows, run, last = [], 0, {}
    inject = extra or {}
    for j in range(len(g)):
        run = run + 1 if flag[j] else 0
        if run == PERSIST or (run > PERSIST and (run - PERSIST) % 720 == 0):
            t = g["window_start_utc"].iloc[j] + pd.Timedelta(minutes=1)
            r = g.iloc[j]
            cls, ft, evd, act, status, key, rule, detail = diagnose(r)
            if key not in last or t - last[key] > B.REFRACTORY:
                rows.append({"asset_id": r["asset_id"], "alert_time_utc": t.strftime("%Y-%m-%dT%H:%M:%SZ"),
                             "event_class": cls, "fault_type": ft,
                             "confidence": float(np.clip(zm[j] / (2 * K), 0.05, 0.99)),
                             "evidence": evd, "recommended_action": act, "class_status": status,
                             "original_fault_type": key, "rule_id": rule, "detail": json.dumps(detail, sort_keys=True)})
                last[key] = t
        if j in inject:
            row = inject[j]
            t = pd.Timestamp(row["alert_time_utc"])
            key = row["original_fault_type"]
            if key not in last or t - last[key] > B.REFRACTORY:
                rows.append(row)
                last[key] = t
    return rows


def _own_detail(r, ft):
    if ft in QUALITY_TYPES:
        return {"reference": "none_quality_rule"}
    return {"reference": "own_commissioning",
            "reference_end_utc": pd.Timestamp(r["reference_end_utc"]).strftime("%Y-%m-%dT%H:%M:%SZ")}


def _plain(r):
    cls, ft, evd, act = B.diagnose(r, K)
    return (cls, ft, f"B1 mode-aware z: {evd}", act, "UNCERTAIN" if ft == "UNKNOWN" else "SUPPORTED", ft, "b1",
            _own_detail(r, ft))


def _abstaining(r):
    cls, ft, evd, act, status, key, rule, detail = _plain(r)
    if ft in ("SENSOR_CALIBRATION_SHIFT", "SENSOR_NOISE_SPIKES"):
        raw = evd.removeprefix("B1 mode-aware z: ")
        ch = next((c for c, name in sorted(B.CH.items()) if raw.startswith(f"{name} deviates alone")), None)
        coupled = [x for x in B.COUPLED.get(ch, []) if np.isfinite(r.get("z_" + x, np.nan))]
        if len(coupled) < SENSOR_MIN_COUPLED:
            return cls, "UNKNOWN", evd, "Anomaly confirmed; single-instrument claim lacks two coupled channels. " \
                "Compare instruments before acting.", "UNCERTAIN", ft, "abstain_sensor_coupled", detail
    elif cls == "MACHINE" and ft != "UNKNOWN":
        z = {c: float(r.get("z_" + c)) if pd.notna(r.get("z_" + c)) else np.nan for c in B.CH}
        nan_aware = _machine_rules(z)
        if nan_aware is None or nan_aware[0] != ft:
            return cls, "UNKNOWN", evd, "Anomaly confirmed; cause relied on a missing measurement. Inspect pump.", \
                "UNCERTAIN", ft, "abstain_missing_operand", detail
    return cls, ft, evd, act, status, key, rule, detail


def _cold_start_diagnose(prior):
    def diagnose(r):
        cls, ft, evd, act = B.diagnose(r, K)
        before = pd.Timestamp(r["window_start_utc"]) < pd.Timestamp(r["reference_end_utc"])
        if not before or ft in QUALITY_TYPES:
            return _plain(r)
        zs = {k: float(r.get("prior_z_" + k, np.nan)) for k in PRIOR}
        quantities = {k: {"quantity": p["quantity"], "unit": p["unit"], "fit_assets": p["fit_assets"],
                          "prior_median": p.get("median"), "prior_scale": p.get("scale"),
                          "z": None if not np.isfinite(zs[k]) else round(zs[k], 6)}
                      for k, p in prior["channels"].items()}
        detail = {"reference": "fleet_prior", "prior_id": prior["prior_id"], "quantities": quantities,
                  "rule_logic": "B1 rule table applied to fleet-prior z of these transformed quantities (tentative)"}
        return (cls, ft, f"Fleet prior {prior['prior_id']} (before own reference): {_prior_text(zs, prior)}",
                "Cold-start deviation from the fleet prior, not from this pump's own reference; verify. " + act,
                "UNCERTAIN" if ft == "UNKNOWN" else "SUPPORTED", ft, "fleet_prior_cold_start", detail)
    return diagnose


# --- candidate frames -------------------------------------------------------------------------------------

def regime_gate(z, assets):
    """R1 frame: withheld z in unsupported regimes, amplitude_steady excludes transitions, status per minute."""
    out = []
    for aid, g in z.groupby("asset_id", sort=True):
        g = g.reset_index(drop=True).copy()
        ref_end = pd.Timestamp(g.reference_end_utc.iloc[0])
        base = g[(g.window_start_utc < ref_end) & g.steady]
        counts = base.regime.value_counts()
        supported = g.regime.map(counts).fillna(0).ge(REGIME_MIN_REF_MINUTES)
        finite = g.speed_ratio.notna()
        change = (g.regime != g.regime.shift()) & finite & finite.shift(fill_value=False)
        transition = np.zeros(len(g), bool)
        for j in np.flatnonzero(change.to_numpy()):
            transition[j:j + TRANSITION_MINUTES] = True
        eligible = g.window_start_utc >= ref_end
        withhold = eligible & ~supported
        zc = [c for c in g if c.startswith(("z_", "zs_"))]
        g.loc[withhold, zc] = np.nan
        g["amplitude_steady"] = g.steady & ~transition
        g["diagnostic_status"] = np.select(
            [g.gap, ~eligible, ~g.steady, transition, withhold],
            ["GATEWAY_GAP", "COLLECTING_REFERENCE", "NOT_STEADY", "TRANSITION", "INSUFFICIENT_REGIME_SUPPORT"],
            "AVAILABLE")
        out.append(g)
    return pd.concat(out, ignore_index=True) if out else z


def cold_start(z, assets, prior):
    """P1 frame: before the own reference closes, z_i/pw/q/v/bt carry fleet-prior z (provenance kept in
    prior_z_* columns and in the alert detail); own-reference values are untouched afterwards."""
    out = []
    for aid, g in z.groupby("asset_id", sort=True):
        g = g.reset_index(drop=True).copy()
        asset = assets[assets.asset_id == aid].iloc[0].to_dict()
        pre = g.window_start_utc < pd.Timestamp(g.reference_end_utc.iloc[0])
        pz = prior_z(g, asset, prior)
        for k in PRIOR:
            g["prior_z_" + k] = pz[k].where(pre)
            g.loc[pre, "z_" + k] = pz.loc[pre, k]
        g["diagnostic_status"] = np.where(pre, np.where(pz.notna().any(axis=1), "PRIOR_SUPPORTED", "NO_PRIOR_SUPPORT"),
                                          g.reference_status)
        out.append(g)
    return pd.concat(out, ignore_index=True) if out else z


def reference_check(g, asset, prior):
    """P2: at most one alert at reference close; returns ((minute index, row) or None, detail)."""
    ref_end = pd.Timestamp(g.reference_end_utc.iloc[0])
    pre = g.window_start_utc < ref_end
    j = int(pre.sum()) - 1
    if j < 0 or g.window_start_utc.iloc[-1] + pd.Timedelta(minutes=1) < ref_end:
        return None, {"status": "COLLECTING"}  # the 24 h reference window is not closed yet
    x = normalised(g, asset)
    ok = prior_minutes(g, asset) & pre
    zref, quantities = {}, {}
    for k, p in prior["channels"].items():
        v = x[k][ok].dropna()
        q = {"quantity": p["quantity"], "unit": p["unit"], "fit_assets": p["fit_assets"], "own_minutes": int(len(v))}
        if not p["supported"] or len(v) < PRIOR_MIN_MINUTES:
            quantities[k] = {**q, "status": "UNSUPPORTED"}
            continue
        zref[k] = (float(v.median()) - p["median"]) / p["scale"]
        quantities[k] = {**q, "status": "CHECKED", "own_median": float(v.median()), "prior_median": p["median"],
                         "prior_scale": p["scale"], "z": round(zref[k], 6)}
    detail = {"reference": "fleet_prior", "prior_id": prior["prior_id"], "quantities": quantities,
              "own_reference_end_utc": ref_end.strftime("%Y-%m-%dT%H:%M:%SZ"),
              "rule_logic": "B1 rule table applied to reference-vs-prior z of these transformed quantities (tentative)"}
    if not zref or max(abs(v) for v in zref.values()) <= K:
        return None, detail
    r = pd.Series({**{"z_" + c: zref.get(c, np.nan) for c in B.CH}, "gap": False, "steady": True})
    cls, ft, _, act = B.diagnose(r, K)
    row = {"asset_id": asset["asset_id"], "alert_time_utc": ref_end.strftime("%Y-%m-%dT%H:%M:%SZ"),
           "event_class": cls, "fault_type": ft,
           "confidence": float(np.clip(max(abs(v) for v in zref.values()) / (2 * K), .05, .99)),
           "evidence": f"Reference check vs fleet prior {prior['prior_id']}: {_prior_text(zref, prior)}",
           "recommended_action": "Commissioning reference deviates from the fleet prior; verify before trusting it. " + act,
           "class_status": "UNCERTAIN" if ft == "UNKNOWN" else "SUPPORTED", "original_fault_type": ft,
           "rule_id": "reference_vs_fleet_prior", "detail": json.dumps(detail, sort_keys=True)}
    return (j, row), detail


def predict(features, assets, as_of, variant, prior=None):
    """Return (predictions incl. class_status/original type/rule/detail, per-minute frame used)."""
    if variant not in VARIANTS:
        raise ValueError(f"Unregistered variant {variant}")
    if variant in ("P1", "P2") and prior is None:
        raise ValueError("P1/P2 need a LOAO prior fit on other assets")
    f = features.copy()
    f["window_start_utc"] = pd.to_datetime(f.window_start_utc, utc=True)
    f = f.sort_values(["asset_id", "window_start_utc"], kind="stable").reset_index(drop=True)
    z = causal_features(f, assets, as_of)
    if z.empty:
        return pd.DataFrame(columns=COLS), z
    if variant == "R1":
        z = regime_gate(z, assets)
    elif variant == "P1":
        z = cold_start(z, assets, prior)
    diagnose = {"R2": _abstaining, "P1": _cold_start_diagnose(prior) if variant == "P1" else None}.get(variant) or _plain
    rows = []
    for aid, g in z.groupby("asset_id", sort=True):
        g = g.reset_index(drop=True)
        extra = None
        if variant == "P2":
            hit, _ = reference_check(g, assets[assets.asset_id == aid].iloc[0].to_dict(), prior)
            extra = {hit[0]: hit[1]} if hit else None
        rows += _b1_rows(g, diagnose, extra)
    return pd.DataFrame(rows, columns=COLS), z
