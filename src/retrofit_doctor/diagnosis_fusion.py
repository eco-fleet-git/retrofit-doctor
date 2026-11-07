"""Task010 diagnosis-only layer at the unchanged causal B1 alarm times.

Emission (times, persistence, refractory) is the released causal B1 (k=6,
persistence 15, 24 h commissioning reference). Each emitted alert is then
re-diagnosed from information available at its alert time:

  B1  control: unchanged vendor rule diagnosis.
  W1  waveform rules (1x/2x running-speed lines, BPFO envelope) over the latest
      COMPLETED valid vibration snapshot; only for B1 MACHINE diagnoses;
      abstains to B1 when absent/stale/ambiguous.
  M1/M2  one depth-6 ExtraTrees classifier on causal minute features, score >= 0.6 / 0.8.
  F1/F2  same learner and thresholds with waveform features added.
  X1  cross-class fusion: a decisive W1 result may replace ANY non-protected B1
      type (machine or sensor), otherwise M1, otherwise B1.

B1 COMMUNICATION_LOSS and SENSOR_STUCK (gateway / missing-data protection) are
never overridden. Any learner abstention, insufficient support or a NORMAL
output falls back to the exact B1 diagnosis, never to healthy. Model scores are
uncalibrated ExtraTrees predict_proba outputs (averaged leaf class
distributions), not fault probabilities. Deviations quoted in evidence are
observations at the alert minute, not model feature attributions. One radial
snapshot axis is described as consistent-with, never as proof of a fault.
"""
from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
import json
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.signal import butter, hilbert, sosfiltfilt
from sklearn.ensemble import ExtraTreesClassifier
from retrofit_sim import baselines as B
from retrofit_doctor.causal_b1 import causal_features, predict_from_features, utc

K, PERSIST = 6.0, 15
MINUTE = pd.Timedelta(minutes=1)
TRAIN_ASSETS = tuple(f"PUMP-0{i}" for i in range(1, 8))
CANDIDATES = ("B1", "W1", "M1", "M2", "F1", "F2", "X1")
THRESHOLD = {"M1": .6, "M2": .8, "F1": .6, "F2": .8, "X1": .6}
LEARNER_KIND = {"M1": "minute", "M2": "minute", "F1": "fused", "F2": "fused", "X1": "minute"}
PROTECTED = ("COMMUNICATION_LOSS", "SENSOR_STUCK")
MACHINE_TYPES = ("BEARING_WEAR", "SUCTION_STRAINER_CLOGGING", "CAVITATION", "DISCHARGE_RESTRICTION", "MISALIGNMENT",
                 "IMBALANCE", "IMPELLER_WEAR", "AIR_ENTRAINMENT")
SENSOR_TYPES = ("SENSOR_DRIFT", "SENSOR_STUCK", "SENSOR_CALIBRATION_SHIFT", "SENSOR_NOISE_SPIKES", "COMMUNICATION_LOSS")
NORMAL = "NORMAL"

# --- waveform definitions (fixed before any labelled scoring) ---------------------------------------------
SNAP_MAX_AGE = pd.Timedelta(hours=4)       # latest completed valid snapshot, never nearest/future
SNAP_CONTRACT = {"unit": "g", "axis": "radial", "sample_rate_hz": 10240}
SNAP_CAPABILITY = "vibration_accel_rms_g"  # installed accelerometer required for snapshots to be used
REF_MIN_SNAPSHOTS = 2                      # valid commissioning snapshots completed inside the first 24 h
REF_SPEED_TOL = .10                        # snapshot rpm vs median reference rpm (amplitude ~ speed^2)
MINUTE_SPEED_TOL = .05                     # snapshot rpm vs alarm-minute VFD speed, when observed
LINE_TOL_REL, LINE_TOL_MIN_HZ = .03, 1.0   # line search half-width; 1 s record -> 1 Hz bins
ENV_BAND_HZ = (1000., 5000.)               # broad generic high-frequency band, Butterworth order 4, zero-phase
ENV_FLOOR_SPAN = (.5, 1.5)                 # noise floor: median envelope amplitude in [0.5, 1.5] x BPFO, line excluded
W1_ENV_RATIO_MIN = 4.0                     # BPFO envelope line / floor
W1_ENV_GAIN_MIN = 2.0                      # ... and >= 2x the commissioning ratio
W1_1X_GAIN_MIN = 2.0                       # 1x amplitude vs commissioning
W1_2X_OVER_1X = .5                         # 2x/1x split between "misalignment-consistent" and "imbalance-consistent"
WF_FEATURES = ["wf_log_1x_gain", "wf_log_2x_gain", "wf_2x_over_1x", "wf_log_env_ratio", "wf_log_env_gain"]

# --- learner definitions --------------------------------------------------------------------------------
TRAIL = 15                                 # trailing minutes (= B1 persistence) for mean of observed z
Z_CLIP, MISSING = 50., -1000.              # explicit missing sentinel + indicator; never zero-as-normal
MAX_ROWS_PER_GROUP = 240                   # evenly spaced minutes per event / normal episode
SUPPORT_MIN_EVENTS, SUPPORT_MIN_ASSETS = 2, 2
SEED = 0
EXTRA_TREES = dict(n_estimators=300, max_depth=6, min_samples_leaf=3, max_features="sqrt", bootstrap=False,
                   random_state=SEED, n_jobs=1)
ACTION = {
    "BEARING_WEAR": "Inspect pump bearing; plan replacement; check lubrication.",
    "SUCTION_STRAINER_CLOGGING": "Inspect / clean suction strainer.",
    "CAVITATION": "Check suction strainer / level; reduce flow if allowed.",
    "DISCHARGE_RESTRICTION": "Check discharge valves and heat-exchanger fouling.",
    "MISALIGNMENT": "Check coupling alignment (a second axis / phase reading is needed to confirm).",
    "IMBALANCE": "Inspect impeller for fouling / damage; balance.",
    "IMPELLER_WEAR": "Performance test; inspect impeller / wear rings.",
    "AIR_ENTRAINMENT": "Check sea-chest / basin level and air ingress on suction side.",
    "SENSOR_DRIFT": "Verify {ch} against a reference gauge.",
    "SENSOR_CALIBRATION_SHIFT": "Verify {ch} against a reference gauge.",
    "SENSOR_NOISE_SPIKES": "Check wiring / grounding of {ch}.",
}
OUT_COLS = B._COLS + ["suspected_channel", "diagnosis_source", "b1_fault_type", "b1_event_class", "model_id",
                      "model_score", "wf_status", "wf_speed_check", "wf_snapshot_id", "wf_complete_utc", "wf_age_s",
                      "wf_reference_snapshots", "wf_features"]


def class_of(fault_type):
    return "SENSOR" if fault_type in SENSOR_TYPES else "MACHINE"


def b1_channel(evidence):
    """Same explicit-channel parse used for the control (run_causal_b2.c0_channel)."""
    if "missing rows" in evidence:
        return "GATEWAY"
    named = sorted({ch for ch in B.CH.values() if ch in evidence})
    return named[0] if len(named) == 1 else None


def installed_keys(asset: Mapping):
    """B1 channel keys listed in the asset passport (`channels_available`); none if metadata is absent."""
    listed = asset.get("channels_available")
    names = set(listed.split("|")) if isinstance(listed, str) else set()
    return frozenset(k for k, ch in B.CH.items() if ch in names)


# --- allowlisted loading --------------------------------------------------------------------------------

def load_train(data_dir):
    """Train metadata, minute features and snapshots, read through an asset predicate and asserted."""
    data_dir = Path(data_dir)
    ids = list(TRAIN_ASSETS)
    assets = pd.read_csv(data_dir / "assets.csv")
    assets = assets[assets.asset_id.isin(ids) & (assets.split == "train")].reset_index(drop=True)
    assert sorted(assets.asset_id) == ids, "train metadata mismatch"
    feat = pd.read_parquet(data_dir / "features_1min.parquet", filters=[("asset_id", "in", ids)])
    snaps = pd.read_parquet(data_dir / "vibration_snapshots.parquet", filters=[("asset_id", "in", ids)])
    for name, d in (("features", feat), ("snapshots", snaps)):
        if not set(d.asset_id) <= set(ids):
            raise RuntimeError(f"{name}: predicate returned an asset outside the train allowlist")
    return assets, feat, snaps


# --- waveform features ----------------------------------------------------------------------------------

def _amplitude_spectrum(x, fs):
    x = np.asarray(x, dtype="float64")
    x = x - x.mean()
    w = np.hanning(len(x) + 1)[:-1]                       # periodic Hann
    amp = 2 * np.abs(np.fft.rfft(x * w)) / w.sum()
    return np.fft.rfftfreq(len(x), 1 / fs), amp


def _line(freqs, amp, f0):
    tol = max(LINE_TOL_MIN_HZ, LINE_TOL_REL * f0)
    m = np.abs(freqs - f0) <= tol
    return float(amp[m].max()) if m.any() else np.nan, tol


def snapshot_features(samples, fs, rpm, bpfo_order):
    """1x/2x acceleration line amplitudes and BPFO envelope line/noise-floor ratio of ONE completed record."""
    out = {"a1x": np.nan, "a2x": np.nan, "env_peak": np.nan, "env_floor": np.nan, "env_ratio": np.nan}
    x = np.asarray(samples, dtype="float64")
    if not (np.isfinite(rpm) and rpm > 0 and np.isfinite(bpfo_order) and bpfo_order > 0) \
            or len(x) < fs / 2 or not np.isfinite(x).all():
        return out
    fr = rpm / 60.
    freqs, amp = _amplitude_spectrum(x, fs)
    out["a1x"], _ = _line(freqs, amp, fr)
    out["a2x"], _ = _line(freqs, amp, 2 * fr)
    hi = min(ENV_BAND_HZ[1], .45 * fs)
    sos = butter(4, [ENV_BAND_HZ[0], hi], btype="bandpass", fs=fs, output="sos")
    env = np.abs(hilbert(sosfiltfilt(sos, x - x.mean())))  # zero-phase inside this record only
    ef, ea = _amplitude_spectrum(env, fs)
    f0 = bpfo_order * fr
    peak, tol = _line(ef, ea, f0)
    band = (ef >= ENV_FLOOR_SPAN[0] * f0) & (ef <= ENV_FLOOR_SPAN[1] * f0) & (np.abs(ef - f0) > tol)
    floor = float(np.median(ea[band])) if band.any() else np.nan
    out.update(env_peak=peak, env_floor=floor, env_ratio=peak / floor if floor and floor > 0 else np.nan)
    return out


def snapshot_problem(r, bpfo_order):
    """Contract violation of one snapshot row, or None if valid."""
    if r.unit != SNAP_CONTRACT["unit"]:
        return "unit"
    if r.axis != SNAP_CONTRACT["axis"]:
        return "axis"
    if not (np.isfinite(r.sample_rate_hz) and r.sample_rate_hz == SNAP_CONTRACT["sample_rate_hz"]):
        return "sample_rate"
    if not (np.isfinite(r.rpm_at_capture) and r.rpm_at_capture > 0):
        return "rpm"
    if not (np.isfinite(bpfo_order) and bpfo_order > 0):
        return "bpfo_order"
    x = np.asarray(r.samples if r.samples is not None else [], dtype="float64")
    if not (np.isfinite(r.n_samples) and r.n_samples > 0 and len(x) == r.n_samples):
        return "length"
    if not np.isfinite(x).all():
        return "nonfinite"
    return None


def snapshot_table(snaps: pd.DataFrame, asset: Mapping) -> pd.DataFrame:
    """Per-snapshot validity, completion time and features; reference = valid records completed in 24 h."""
    cols = ["snapshot_id", "timestamp_utc", "complete_utc", "rpm", "valid", "problem", "a1x", "a2x", "env_ratio",
            "is_reference"]
    s = snaps[snaps.asset_id == asset["asset_id"]].copy() if len(snaps) else pd.DataFrame()
    if s.empty:
        return pd.DataFrame(columns=cols)
    s["timestamp_utc"] = pd.to_datetime(s.timestamp_utc, utc=True)
    s["complete_utc"] = s.timestamp_utc + pd.to_timedelta(s.n_samples / s.sample_rate_hz, unit="s")
    bpfo = float(asset.get("bearing_bpfo_order", np.nan))
    capable = SNAP_CAPABILITY in set(str(asset.get("channels_available", "")).split("|"))
    probs, feats = [], []
    for r in s.itertuples():
        p = snapshot_problem(r, bpfo) if capable else "not_installed"
        probs.append(p)
        feats.append(snapshot_features(r.samples, float(r.sample_rate_hz), float(r.rpm_at_capture), bpfo)
                     if p is None else {})
    s = pd.concat([s.reset_index(drop=True), pd.DataFrame(feats, columns=["a1x", "a2x", "env_ratio"])], axis=1)
    s = s.rename(columns={"rpm_at_capture": "rpm"})
    s["problem"] = probs
    s["valid"] = s.problem.isna() & s.a1x.notna()
    start = utc(asset["window_start_utc"])
    s["is_reference"] = s.valid & (s.complete_utc <= start + pd.Timedelta(hours=B.BASELINE_H)) \
        & (s.timestamp_utc >= start)
    s = s.dropna(subset=["complete_utc"])
    return s.sort_values(["complete_utc", "snapshot_id"], kind="stable")[cols].reset_index(drop=True)


def waveform_state(table: pd.DataFrame, times, minute_speed, reference_end, capable=True) -> pd.DataFrame:
    """Waveform evidence at each as-of time: latest VALID snapshot with complete_utc <= t, age <= 4 h.

    `reference_end` is mandatory: the commissioning reference is used only once t >= reference_end, so every
    reference record is complete. Missing current speed is disclosed as UNVERIFIED, not as a checked match.
    `wf_reference_snapshots` counts only reference records completed by each clock. `capable` comes from the
    asset passport (installed accelerometer), never from the presence of snapshot rows."""
    if reference_end is None:
        raise ValueError("reference_end is required")
    reference_end = utc(reference_end)
    times = pd.DatetimeIndex(pd.to_datetime(times, utc=True))
    n = len(times)
    res = pd.DataFrame({"wf_status": ["NONE"] * n, "wf_speed_check": [None] * n, "wf_snapshot_id": [None] * n,
                        "wf_complete_utc": [None] * n, "wf_age_s": np.nan, "wf_reference_snapshots": 0,
                        **{c: np.nan for c in WF_FEATURES}})
    if not capable:
        res["wf_status"] = "NOT_INSTALLED"
        return res
    usable = table[table.valid.astype(bool)] if len(table) else table
    if not len(usable):
        return res
    ref = usable[usable.is_reference.astype(bool)]
    tn = times.to_numpy(dtype="datetime64[ns]")
    res["wf_reference_snapshots"] = np.searchsorted(ref.complete_utc.to_numpy(dtype="datetime64[ns]"), tn,
                                                    side="right")                 # completed by t only
    comp = usable.complete_utc.to_numpy(dtype="datetime64[ns]")
    idx = np.searchsorted(comp, tn, side="right") - 1                             # never later than t
    ref_ok = len(ref) >= REF_MIN_SNAPSHOTS
    if ref_ok:
        r1, r2, rr, rrpm = (float(ref[c].median()) for c in ("a1x", "a2x", "env_ratio", "rpm"))
    for i, j in enumerate(idx):
        if j < 0:
            continue
        s = usable.iloc[j]
        age = (times[i] - s.complete_utc).total_seconds()
        res.at[i, "wf_snapshot_id"], res.at[i, "wf_age_s"] = s.snapshot_id, age
        res.at[i, "wf_complete_utc"] = s.complete_utc.isoformat()
        if age > SNAP_MAX_AGE.total_seconds():
            res.at[i, "wf_status"] = "STALE"
            continue
        ms = None if minute_speed is None else minute_speed[i]
        if ms is not None and np.isfinite(ms) and ms > 0:
            if abs(s.rpm / ms - 1) > MINUTE_SPEED_TOL:
                res.at[i, "wf_status"], res.at[i, "wf_speed_check"] = "SPEED_CHANGED", "MISMATCH"
                continue
            res.at[i, "wf_speed_check"] = "MATCH"
        else:
            res.at[i, "wf_speed_check"] = "UNVERIFIED"
        if not ref_ok or times[i] < reference_end:
            res.at[i, "wf_status"] = "NO_REFERENCE"
            continue
        if abs(s.rpm / rrpm - 1) > REF_SPEED_TOL:
            res.at[i, "wf_status"] = "REF_SPEED_MISMATCH"
            continue
        res.at[i, "wf_status"] = "FRESH"
        res.at[i, "wf_log_1x_gain"] = np.log(s.a1x / r1) if r1 > 0 and s.a1x > 0 else np.nan
        res.at[i, "wf_log_2x_gain"] = np.log(s.a2x / r2) if r2 > 0 and s.a2x > 0 else np.nan
        res.at[i, "wf_2x_over_1x"] = s.a2x / s.a1x if s.a1x > 0 else np.nan
        res.at[i, "wf_log_env_ratio"] = np.log(s.env_ratio) if s.env_ratio > 0 else np.nan
        res.at[i, "wf_log_env_gain"] = np.log(s.env_ratio / rr) if rr > 0 and s.env_ratio > 0 else np.nan
    return res


def w1_rule(state: Mapping):
    """Decisive waveform diagnosis or None (abstain). Thresholds are the fixed manifest values."""
    if state.get("wf_status") != "FRESH":
        return None
    v = {c: state.get(c) for c in WF_FEATURES}
    if any(pd.isna(x) for x in v.values()):
        return None
    ratio, gain = np.exp(v["wf_log_env_ratio"]), np.exp(v["wf_log_env_gain"])
    if ratio >= W1_ENV_RATIO_MIN and gain >= W1_ENV_GAIN_MIN:
        return ("BEARING_WEAR", f"envelope line at BPFO {ratio:.1f}x local floor ({gain:.1f}x commissioning); "
                                "one radial axis is consistent with, not proof of, outer-race damage")
    g1 = np.exp(v["wf_log_1x_gain"])
    if g1 >= W1_1X_GAIN_MIN:
        kind = "MISALIGNMENT" if v["wf_2x_over_1x"] >= W1_2X_OVER_1X else "IMBALANCE"
        return (kind, f"1x line {g1:.1f}x commissioning with 2x/1x={v['wf_2x_over_1x']:.2f}; "
                      f"one radial axis is consistent with, not proof of, {kind.lower()}")
    return None


# --- causal frames and minute features ------------------------------------------------------------------

def normalized_asset(feat, asset_row: pd.DataFrame, as_of=None):
    aid = asset_row.asset_id.iloc[0]
    clock = asset_row.window_end_utc.iloc[0] if as_of is None else as_of
    g = causal_features(feat[feat.asset_id == aid], asset_row, {aid: clock})
    return g.reset_index(drop=True) if len(g) else g


def observed(g: pd.DataFrame, key, installed) -> pd.Series:
    """Current-minute observation of an installed channel: count > 0 and a finite mean."""
    ch = B.CH[key]
    m, c = f"{ch}__mean", f"{ch}__count"
    if key not in installed or m not in g or c not in g:
        return pd.Series(False, index=g.index)
    return (pd.to_numeric(g[c], errors="coerce") > 0) & np.isfinite(pd.to_numeric(g[m], errors="coerce"))


def minute_features(g: pd.DataFrame, installed) -> pd.DataFrame:
    """Per-minute causal features from installed, currently observed channels (B1 frame is not mutated).

    Current z / spread are masked unless observed now; the trailing mean uses past observed z only, and the
    present_ indicator keeps current missingness explicit."""
    out = {}
    nan = pd.Series(np.nan, index=g.index)
    for key in B.CH:
        obs = observed(g, key, installed)
        z = (g["z_" + key] if "z_" + key in g else nan).astype("float64").where(obs)
        zs = (g["zs_" + key] if "zs_" + key in g else nan).astype("float64").where(obs)
        trail = z.rolling(TRAIL, min_periods=1).mean() if key in installed else nan
        out[f"present_{key}"] = (obs & z.notna()).astype(float)
        for name, s in ((f"z_{key}", z), (f"zs_{key}", zs), (f"ztrail_{key}", trail)):
            out[name] = s.clip(-Z_CLIP, Z_CLIP).fillna(MISSING)
    return pd.DataFrame(out, index=g.index)


def fused_features(minute: pd.DataFrame, wf: pd.DataFrame) -> pd.DataFrame:
    w = wf[WF_FEATURES].astype("float64").set_axis(minute.index)
    avail = (wf.wf_status.to_numpy() == "FRESH") & w.notna().all(axis=1).to_numpy()
    w = w.where(np.repeat(avail[:, None], len(WF_FEATURES), axis=1)).clip(-Z_CLIP, Z_CLIP).fillna(MISSING)
    return pd.concat([minute, w.assign(wf_available=avail.astype(float))], axis=1)


def candidate_minutes(g):
    """Minutes where B1 would diagnose from deviations (steady, |z| > k, no gap / steady flatline)."""
    zm = B._zmax(g, K)
    return g.steady.to_numpy(dtype=bool) & (zm > K) & ~g.gap.to_numpy(dtype=bool) & ~B._flat_any(g)


def b1_alert_rows(g):
    """Unchanged causal B1 emission for one asset, with the row index of each alert minute."""
    pred = predict_from_features(g, k=K, persist=PERSIST).reset_index(drop=True)
    ends = g.window_start_utc + MINUTE
    pos = {t: i for i, t in enumerate(ends)}
    pred["row"] = [pos[pd.Timestamp(t)] for t in pred.alert_time_utc]
    return pred


# --- supervised fit (fit assets only) -------------------------------------------------------------------

def _np_utc(ts):
    return utc(ts).tz_convert(None).to_datetime64().astype("datetime64[ns]")


@dataclass
class FittedModel:
    kind: str
    fit_assets: tuple
    model_id: str = ""
    classes: tuple = ()
    feature_names: tuple = ()
    estimator: object = None
    support: dict = field(default_factory=dict)
    dropped_types: dict = field(default_factory=dict)
    training_rows: int = 0


def physical_interval(e, window_end):
    """Fit-label interval: max(onset, detectable) .. end (asset window end if open). No scorer allowances."""
    start = utc(e.onset_utc)
    if pd.notna(e.detectable_utc):
        start = max(start, utc(e.detectable_utc))
    end = utc(e.end_utc) if pd.notna(e.end_utc) else utc(window_end)
    return start, end


def training_rows(g, events: pd.DataFrame, window_end):
    """Label candidate minutes of ONE fit asset.

    Event label: alert time inside the PHYSICAL interval of exactly one observable event and inside no other
    event's official scoring window. NORMAL: outside every event's official scoring window (w_start..w_end,
    including the scorer's 6 h early / 30 min late allowances) and every physical interval. Minutes in an
    unobservable event, in overlaps, or in the buffer between physical interval and scoring window are excluded;
    B1-owned quality types are excluded. Returns (row positions, labels, group ids)."""
    t = (g.window_start_utc + MINUTE).to_numpy(dtype="datetime64[ns]")
    cand = candidate_minutes(g)
    phys_hits = np.zeros(len(g), dtype=int)
    any_window = np.zeros(len(g), dtype=int)
    blocked = np.zeros(len(g), dtype=bool)
    label = np.array([NORMAL] * len(g), dtype=object)
    group = np.array([None] * len(g), dtype=object)
    for e in events.itertuples():
        ps, pe = physical_interval(e, window_end)
        phys = (t >= _np_utc(ps)) & (t <= _np_utc(pe))
        win = phys | ((t >= _np_utc(e.w_start)) & (t <= _np_utc(e.w_end)))
        any_window += win
        if not e.observable:
            blocked |= win
            continue
        phys_hits += phys
        label[phys], group[phys] = e.fault_type, e.event_id
    labelled = (phys_hits == 1) & (any_window == 1)
    normal = any_window == 0
    keep = cand & ~blocked & (labelled | normal) & ~np.isin(np.where(normal, NORMAL, label), PROTECTED)
    label = np.where(normal, NORMAL, label)
    aid = g.asset_id.iloc[0]
    seg = keep & normal                                       # contiguous NORMAL candidate segments only
    seg_id = np.cumsum(np.r_[seg[:1], seg[1:] & ~seg[:-1]])
    group[seg] = [f"{aid}:normal:{s}" for s in seg_id[seg]]
    pos = np.flatnonzero(keep)
    return pos, label[pos], group[pos]


def fit_model(kind, frames: Mapping[str, pd.DataFrame], wf: Mapping[str, pd.DataFrame], events_fit: pd.DataFrame,
              fit_assets, assets_fit: pd.DataFrame, model_id="") -> FittedModel:
    """Fit one learner on fit assets only. All inputs must be restricted to the fit assets."""
    fit_assets = tuple(sorted(fit_assets))
    if set(frames) != set(fit_assets) or not set(events_fit.asset_id) <= set(fit_assets) \
            or set(assets_fit.asset_id) != set(fit_assets):
        raise ValueError("fit inputs must be restricted to the fit assets")
    for aid, g in frames.items():                       # underlying rows, not only mapping keys
        if len(g) and set(g.asset_id) != {aid}:
            raise ValueError(f"frame keyed {aid} contains rows of {sorted(set(g.asset_id))}")
    if kind == "fused":
        if set(wf) != set(fit_assets):
            raise ValueError("waveform map must match the fit assets")
        for aid in fit_assets:
            if len(wf[aid]) != len(frames[aid]):
                raise ValueError(f"waveform state of {aid} does not align with its frame")
    meta = assets_fit.set_index("asset_id")
    X, y, grp, aids = [], [], [], []
    for aid in fit_assets:
        g = frames[aid]
        if not len(g):
            continue
        pos, lab, gid = training_rows(g, events_fit[events_fit.asset_id == aid], meta.loc[aid, "window_end_utc"])
        feats = minute_features(g, installed_keys(meta.loc[aid]))
        if kind == "fused":
            feats = fused_features(feats, wf[aid])
        X.append(feats.iloc[pos].reset_index(drop=True))
        y += list(lab); grp += list(gid); aids += [aid] * len(pos)
    model = FittedModel(kind=kind, fit_assets=fit_assets, model_id=model_id)
    if not X:
        return model
    X = pd.concat(X, ignore_index=True)
    d = pd.DataFrame({"y": y, "group": grp, "asset": aids})
    if not len(d):
        return model
    sup = d.groupby("y").agg(groups=("group", "nunique"), assets=("asset", "nunique"))
    ok = sup[(sup.groups >= SUPPORT_MIN_EVENTS) & (sup.assets >= SUPPORT_MIN_ASSETS)].index
    model.support = {k: {"groups": int(v.groups), "assets": int(v.assets)} for k, v in sup.iterrows()}
    model.dropped_types = {k: model.support[k] for k in sup.index if k not in ok}
    d = d[d.y.isin(ok)]
    if d.y.nunique() < 2:
        return model
    # each event and each NORMAL episode weighs 1 in total, over at most MAX_ROWS_PER_GROUP evenly spaced minutes
    picked = []
    for _, idx in d.groupby("group", sort=True).groups.items():
        idx = np.asarray(sorted(idx))
        if len(idx) > MAX_ROWS_PER_GROUP:
            idx = idx[np.linspace(0, len(idx) - 1, MAX_ROWS_PER_GROUP).round().astype(int)]
        picked.append(idx)
    sel = np.sort(np.concatenate(picked))
    sizes = d.loc[sel].groupby("group").group.transform("size").to_numpy()
    est = ExtraTreesClassifier(**EXTRA_TREES)
    est.fit(X.loc[sel].to_numpy(), d.loc[sel, "y"].to_numpy(), sample_weight=1. / sizes)
    model.classes, model.feature_names = tuple(est.classes_), tuple(X.columns)
    model.estimator, model.training_rows = est, int(len(sel))
    return model


# --- inference ------------------------------------------------------------------------------------------

def _sensor_channel(g, row, installed):
    """Unique installed, currently observed channel with |z| > k or spread z > k; else None (no channel credit)."""
    hits = []
    for k in B.CH:
        if not observed(g.iloc[[row]], k, installed).iloc[0]:
            continue
        z, zs = g["z_" + k].iloc[row] if "z_" + k in g else np.nan, g["zs_" + k].iloc[row] if "zs_" + k in g else np.nan
        if (np.isfinite(z) and abs(z) > K) or (np.isfinite(zs) and zs > K):
            hits.append(B.CH[k])
    return hits[0] if len(hits) == 1 else None


def _observed_deviations(g, row, installed, n=3):
    z = {}
    for k in B.CH:
        if "z_" + k in g and observed(g.iloc[[row]], k, installed).iloc[0] and np.isfinite(g["z_" + k].iloc[row]):
            z[B.CH[k]] = float(g["z_" + k].iloc[row])
    top = sorted(z.items(), key=lambda kv: (-abs(kv[1]), kv[0]))[:n]
    return ", ".join(f"{c} z={v:+.1f}" for c, v in top) or "none observed"


def _wf_detail(w):
    if not len(w) or w.get("wf_snapshot_id") is None:
        return {}
    return {c: (None if pd.isna(w.get(c)) else round(float(w.get(c)), 6)) for c in WF_FEATURES}


def diagnose_asset(candidate, g, wf: pd.DataFrame | None, model: FittedModel | None, installed=frozenset()):
    """Re-diagnose the B1 alerts of one asset. `g` is the causal frame; `wf` the per-row waveform state."""
    if not len(g):
        return pd.DataFrame(columns=OUT_COLS)
    pred = b1_alert_rows(g)
    if not len(pred):
        return pd.DataFrame(columns=OUT_COLS)
    learned = {}
    if candidate in THRESHOLD and model is not None and model.estimator is not None:
        feats = minute_features(g, installed)
        if model.kind == "fused":
            feats = fused_features(feats, wf)
        assert tuple(feats.columns) == model.feature_names, "feature schema changed"
        proba = model.estimator.predict_proba(feats.iloc[pred.row].to_numpy())
        for i, p in zip(pred.index, proba):
            j = int(np.argmax(p))                                 # ties -> first class in sorted order
            learned[i] = (model.classes[j], float(p[j]))
    rows = []
    for i, a in pred.iterrows():
        w = wf.iloc[a.row] if wf is not None else pd.Series(dtype=object)
        out = {c: a[c] for c in B._COLS}                          # exact B1 evidence/action retained on fallback
        out.update(suspected_channel=b1_channel(a.evidence), diagnosis_source="B1", b1_fault_type=a.fault_type,
                   b1_event_class=a.event_class, model_id=None, model_score=np.nan,
                   **{c: (w.get(c) if len(w) else None) for c in
                      ("wf_status", "wf_speed_check", "wf_snapshot_id", "wf_complete_utc", "wf_age_s",
                       "wf_reference_snapshots")},
                   wf_features=json.dumps(_wf_detail(w), sort_keys=True) if len(w) else None)
        new = None
        if a.fault_type not in PROTECTED and candidate != "B1":
            waveform_scope = candidate == "X1" or (candidate == "W1" and a.event_class == "MACHINE")
            if waveform_scope:
                hit = w1_rule(w)
                if hit:
                    new = (hit[0], f"W1 waveform: {hit[1]}; snapshot {w['wf_snapshot_id']} completed "
                                   f"{w['wf_complete_utc']}, age {w['wf_age_s']:.0f} s, speed check "
                                   f"{w['wf_speed_check']}, {int(w['wf_reference_snapshots'])} reference snapshots",
                           "W1", np.nan, None, None)
            if new is None and i in learned:
                lab, score = learned[i]
                if lab != NORMAL and score >= THRESHOLD[candidate]:
                    ch = _sensor_channel(g, a.row, installed) if class_of(lab) == "SENSOR" else None
                    src = "M1" if candidate == "X1" else candidate
                    text = (f"{src} model {model.model_id} uncalibrated score {score:.2f}; observed deviations at "
                            f"alert minute (observations, not model attribution): "
                            f"{_observed_deviations(g, a.row, installed)}")
                    if model.kind == "fused":
                        text += (f"; waveform {w.get('wf_status')} snapshot {w.get('wf_snapshot_id')} "
                                 f"completed {w.get('wf_complete_utc')} age {w.get('wf_age_s')} s "
                                 f"features {json.dumps(_wf_detail(w), sort_keys=True)}")
                    if class_of(lab) == "SENSOR":
                        text += f"; channel {ch}" if ch else "; no uniquely supported channel"
                    new = (lab, text, src, score, ch, model.model_id)
        if new:
            ft, evd, src, score, ch, mid = new
            out.update(event_class=class_of(ft), fault_type=ft, evidence=f"{evd}; B1 rule said {a.fault_type}",
                       recommended_action=ACTION[ft].format(ch=ch or "the deviating transmitter"),
                       suspected_channel=ch, diagnosis_source=src, model_id=mid, model_score=score)
            if not np.isnan(score):
                out["confidence"] = float(np.clip(score, 0.05, 0.99))
        rows.append(out)
    return pd.DataFrame(rows, columns=OUT_COLS)


def asset_waveform(g, snaps, asset_row: pd.DataFrame, as_of=None, table=None):
    """Per-row waveform state for one causal frame; only records completed by the clock are considered.

    `table` may be a precomputed snapshot_table (per-record features do not depend on the clock)."""
    asset = asset_row.iloc[0]
    table = snapshot_table(snaps, asset) if table is None else table
    if as_of is not None and len(table):
        table = table[table.complete_utc <= utc(as_of)]
    obs = observed(g, "n", installed_keys(asset))
    speed = g["motor_speed_rpm__mean"].where(obs).to_numpy() if "motor_speed_rpm__mean" in g else None
    ref_end = utc(asset["window_start_utc"]) + pd.Timedelta(hours=B.BASELINE_H)
    capable = SNAP_CAPABILITY in set(str(asset.get("channels_available", "")).split("|"))
    return waveform_state(table, g.window_start_utc + MINUTE, speed, ref_end, capable)


def predict_asset(candidate, feat, snaps, asset_row: pd.DataFrame, model=None, as_of=None, table=None):
    """Full causal path for one asset at an explicit clock (default: asset window end)."""
    g = normalized_asset(feat, asset_row, as_of)
    wf = asset_waveform(g, snaps, asset_row, as_of, table) if len(g) and candidate != "B1" else None
    return diagnose_asset(candidate, g, wf, model, installed_keys(asset_row.iloc[0]))
