"""Causal B2 v1: channel quality/cadence states, per-source persistence and deterministic diagnosis.

Contract: docs/experiments/{FROZEN_PROTOCOL,CLAUDE_TASK_PACKET}.md and protocol_v1.json.
Normalization reuses causal B1 unchanged (24 h commissioning reference, explicit clock,
closed minute windows). B2 adds, per installed channel, expected cadence from public
metadata, a quality state per closed minute, and evidence chains that only count new
independent samples. A held value between sparse updates is state, never a sample.

Candidates: C1 = quality layer + deterministic B1-compatible diagnosis; C2..C5 add the
trajectory (constant/ramp/step) and coupled-channel sensor confirmation of step 2.
Batch/replay implementation: no persisted incremental state, not a streaming service.
Confidence is a bounded heuristic evidence strength, not a probability.
"""
from __future__ import annotations

from collections.abc import Mapping
import json
from pathlib import Path

import numpy as np
import pandas as pd
from retrofit_sim import baselines as B
from retrofit_doctor.causal_b1 import causal_features

K = 6.0
VAR_K = 12.0
PERSIST_MIN = 15
MIN_UPDATES = 3
STALE_INTERVALS = 2
TRAJ_MIN_UPDATES = 6
TRAJ_SPAN = .8
STEP_SIDE = 3
MIN_COUPLED = 2
COUPLED_MAX = 2.0
RETRY_MIN = 720
WIRELESS = {"bearing_temp_c", "vibration_rms_mm_s", "vibration_accel_rms_g", "vibration_crest_factor"}
STUCK_KEYS = ("pd", "ps", "q", "bt", "i", "tf")  # unchanged B1 stuck channel set
CANDIDATES = {"C1": None, "C2": (30, .5), "C3": (30, .8), "C4": (120, .5), "C5": (120, .8)}
ALLOWED_SPLITS = ("train", "validation")
PRED_COLS = B._COLS + ["suspected_channel", "class_status"]
EVIDENCE_COLS = ["asset_id", "alert_time_utc", "event_class", "fault_type", "confidence", "suspected_channel",
                 "class_status", "reference_status", "reference_origin", "reference_end_utc", "evidence_window_start",
                 "latest_input_available_at", "supporting_channels", "conflicting_channels", "missing_channels",
                 "observed_values", "residuals", "sample_counts", "ages", "expected_cadence", "rule_id", "source_id",
                 "candidate_id", "alternatives", "trajectory", "recommended_action"]
USABLE = ("FRESH", "NO_NEW_SAMPLE")
MINUTE = pd.Timedelta(minutes=1)


def load_split_inputs(data_dir, split):
    """Allowlisted loader: static metadata rows and telemetry of one permitted split only."""
    if split not in ALLOWED_SPLITS:
        raise PermissionError(f"Split {split!r} is not available to B2 development/evaluation")
    data_dir = Path(data_dir)
    assets = pd.read_csv(data_dir / "assets.csv").query("split == @split").reset_index(drop=True)
    ids = assets.asset_id.tolist()
    feat = pd.read_parquet(data_dir / "features_1min.parquet", filters=[("asset_id", "in", ids)])
    if not set(feat.asset_id) <= set(ids):
        raise RuntimeError("Predicate pushdown returned an asset outside the allowlist")
    return assets, feat


def expected_cadence_min(asset, channel):
    """Feature-observation cadence from public metadata: None = not installed, NaN = unknown."""
    if channel not in str(asset.get("channels_available", "")).split("|"):
        return None
    if asset.get("instrumentation_tier") == "T1_RETROFIT" and channel in WIRELESS:
        s = asset.get("wireless_update_s")
        return np.nan if pd.isna(s) else float(s) / 60.
    return 1.


def _asset_quality(g, asset):
    """Per-channel arrays for one asset's clock-complete normalized frame."""
    n = len(g)
    gap = g.gap.to_numpy(bool)
    out = {}
    for key, ch in B.CH.items():
        cad = expected_cadence_min(asset, ch)
        if cad is None:
            out[key] = {"channel": ch, "cadence": np.nan, "state": np.full(n, "NOT_INSTALLED", object),
                        "new": np.zeros(n, bool), "age": np.full(n, np.nan), "last": np.full(n, np.nan),
                        "z": np.full(n, np.nan), "zs": np.full(n, np.nan), "installed": False}
            continue
        mean = g[f"{ch}__mean"].to_numpy(float) if f"{ch}__mean" in g else np.full(n, np.nan)
        count = g[f"{ch}__count"].fillna(0).to_numpy(float) if f"{ch}__count" in g else np.zeros(n)
        z = g["z_" + key].to_numpy(float)
        zs = g["zs_" + key].to_numpy(float)
        reference_ready = g.reference_status.to_numpy() != "COLLECTING_REFERENCE"
        new = (count > 0) & np.isfinite(mean)
        state = np.empty(n, object)
        age = np.full(n, np.nan)
        last = np.full(n, np.nan)
        last_z = np.full(n, np.nan)
        last_zs = np.full(n, np.nan)
        lj = -1
        for j in range(n):
            if new[j]:
                lj = j
            if lj >= 0:
                age[j] = j - lj
                last[j], last_z[j], last_zs[j] = mean[lj], z[lj], zs[lj]
            if gap[j]:
                state[j] = "GATEWAY_GAP"
            elif new[j]:
                state[j] = "INSUFFICIENT_REFERENCE" if reference_ready[j] and np.isnan(z[j]) else "FRESH"
            elif np.isnan(cad):
                state[j] = "UNKNOWN_CADENCE"
            elif (age[j] if lj >= 0 else j + 1) <= STALE_INTERVALS * cad:
                state[j] = "NO_NEW_SAMPLE"
            else:
                state[j] = "STALE"
        out[key] = {"channel": ch, "cadence": cad, "state": state, "new": new, "age": age, "last": last,
                    "z": last_z, "zs": last_zs, "installed": True, "mean": mean, "count": count,
                    "std": g[f"{ch}__std"].to_numpy(float) if f"{ch}__std" in g else np.full(n, np.nan),
                    "z_now": z, "zs_now": zs}
    return out


def _normalized(features, assets, as_of):
    f = features.copy()
    f["window_start_utc"] = pd.to_datetime(f.window_start_utc, utc=True)
    # Input row order must not matter; duplicates are rejected by causal B1.
    f = f.sort_values(["asset_id", "window_start_utc"], kind="stable").reset_index(drop=True)
    return causal_features(f, assets, as_of)


def channel_quality(features, assets, as_of) -> pd.DataFrame:
    """Long table: one row per asset, closed minute and channel with explicit availability state."""
    z = _normalized(features, assets, as_of)
    rows = []
    for aid, g in z.groupby("asset_id", sort=True):
        g = g.reset_index(drop=True)
        asset = assets[assets.asset_id == aid].iloc[0].to_dict()
        for key, q in _asset_quality(g, asset).items():
            rows.append(pd.DataFrame({
                "asset_id": aid, "window_start_utc": g.window_start_utc, "channel": q["channel"],
                "expected_cadence_min": q["cadence"], "quality_state": q["state"], "new_observation": q["new"],
                "channel_present": q["installed"], "last_value": q["last"], "age_min": q["age"]}))
    if not rows:
        return pd.DataFrame(columns=["asset_id", "window_start_utc", "channel", "expected_cadence_min", "quality_state",
                                     "new_observation", "channel_present", "last_value", "age_min"])
    return pd.concat(rows, ignore_index=True)


class _Chain:
    """Evidence chain for one source; counts only independent new observations."""

    def __init__(self):
        self.obs, self.strength, self.value, self.next_attempt = [], 0., None, None

    def reset(self):
        self.obs, self.strength, self.value, self.next_attempt = [], 0., None, None

    def add(self, j, strength):
        self.obs.append(j)
        self.strength = strength

    def due(self, j):
        """True at first confirmation and every RETRY_MIN minutes of a continued episode."""
        if len(self.obs) < MIN_UPDATES or j + 1 - self.obs[0] < PERSIST_MIN:
            return False
        if self.next_attempt is None:
            self.next_attempt = j + RETRY_MIN
            return True
        if j >= self.next_attempt:
            self.next_attempt += RETRY_MIN
            return True
        return False


def _fit_losses(t, y):
    """Constant, robust ramp and best step fits; losses are median absolute residuals."""
    med = np.median(y)
    const = float(np.median(np.abs(y - med)))
    dt = t[None, :] - t[:, None]
    dy = y[None, :] - y[:, None]
    iu = np.triu_indices(len(t), 1)
    slope = float(np.median(dy[iu] / dt[iu]))
    intercept = float(np.median(y - slope * t))
    ramp = float(np.median(np.abs(y - (slope * t + intercept))))
    step, split, diff = np.inf, None, 0.
    for m in range(STEP_SIDE, len(y) - STEP_SIDE + 1):
        left, right = np.median(y[:m]), np.median(y[m:])
        loss = float(np.median(np.abs(np.concatenate([y[:m] - left, y[m:] - right]))))
        if loss < step:
            step, split, diff = loss, m, float(right - left)
    return {"constant": const, "ramp": ramp, "step": step, "slope_per_min": slope,
            "ramp_endpoint_diff": slope * float(t[-1] - t[0]), "step_split_index": split, "step_level_diff": diff}


class _Asset:
    def __init__(self, g, asset, candidate):
        self.g, self.asset, self.candidate = g, asset, candidate
        self.traj = CANDIDATES[candidate]
        self.q = _asset_quality(g, asset)
        self.steady = g.steady.to_numpy(bool)
        self.gap = g.gap.to_numpy(bool)
        self.t = g.window_start_utc.reset_index(drop=True)
        self.segment_start = {k: 0 for k in self.q}

    def usable_z(self, j):
        return {k: (q["z"][j] if q["installed"] and q["state"][j] in USABLE else np.nan) for k, q in self.q.items()}

    def coupled(self, c, zu):
        cpl = sorted(B.COUPLED.get(c, []))
        avail = [x for x in cpl if np.isfinite(zu[x])]
        quiet = [x for x in avail if abs(zu[x]) < COUPLED_MAX]
        loud = [x for x in avail if abs(zu[x]) >= COUPLED_MAX]
        missing = [x for x in cpl if not np.isfinite(zu[x])]
        return avail, quiet, loud, missing

    def trajectory(self, c, j):
        W, ratio = self.traj
        q = self.q[c]
        lo = max(self.segment_start[c], j + 1 - W)
        idx = [i for i in range(lo, j + 1) if q["new"][i] and np.isfinite(q["z_now"][i])]
        info = {"history_minutes": W, "loss_ratio": ratio, "n": len(idx)}
        if len(idx) < TRAJ_MIN_UPDATES or j + 1 - idx[0] < TRAJ_SPAN * W:
            return None, {**info, "verdict": "INSUFFICIENT_HISTORY"}
        t = np.asarray(idx, float)
        y = q["z_now"][idx]
        fit = _fit_losses(t, y)
        info.update(fit)
        r, s, k0 = fit["ramp"], fit["step"], fit["constant"]
        if r < ratio * k0 and r < ratio * s and abs(fit["ramp_endpoint_diff"]) > K:
            return "SENSOR_DRIFT", {**info, "verdict": "RAMP"}
        if s < ratio * k0 and s < ratio * r and abs(fit["step_level_diff"]) > K and abs(y[-1]) > K:
            return "SENSOR_CALIBRATION_SHIFT", {**info, "verdict": "STEP"}
        return None, {**info, "verdict": "AMBIGUOUS"}

    def diagnose(self, source, j):
        """Return (class, type, channel, class_status, rule_id, alternatives, trajectory, action)."""
        kind, c = source
        if kind == "gateway":
            return "SENSOR", "COMMUNICATION_LOSS", "GATEWAY", "SUPPORTED", "gateway_gap_15min", [], None, \
                "Check gateway / network; data gap."
        if kind == "stuck":
            ch = B.CH[c]
            return "SENSOR", "SENSOR_STUCK", ch, "SUPPORTED", "stuck_new_samples", [], None, f"Check transmitter {ch}."
        zu = self.usable_z(j)
        zs_c = self.q[c]["zs"][j] if self.q[c]["state"][j] in USABLE else np.nan
        big = sorted((x for x in zu if np.isfinite(zu[x]) and abs(zu[x]) > K), key=lambda x: (-abs(zu[x]), x))
        if self.traj is None:
            for x in big:
                avail, _, _, _ = self.coupled(x, zu)
                if x in B.COUPLED and avail and max(abs(zu[y]) for y in avail) < K / 3:
                    zs = self.q[x]["zs"][j]
                    ft = "SENSOR_NOISE_SPIKES" if np.isfinite(zs) and zs > K else "SENSOR_CALIBRATION_SHIFT"
                    return "SENSOR", ft, B.CH[x], "SUPPORTED", "b1_single_channel", [], None, \
                        f"Verify {B.CH[x]} against a reference gauge."
        else:
            order = big if kind == "amplitude" else [c] + [x for x in big if x != c]
            for x in order:
                avail, quiet, loud, _ = self.coupled(x, zu)
                if x not in B.COUPLED or len(quiet) < MIN_COUPLED or loud:
                    continue
                ch = B.CH[x]
                zsx = self.q[x]["zs"][j] if self.q[x]["state"][j] in USABLE else np.nan
                if self.q[x]["cadence"] == 1 and np.isfinite(zsx) and zsx > VAR_K:
                    return "SENSOR", "SENSOR_NOISE_SPIKES", ch, "SUPPORTED", "variance_coupled_quiet", [], None, \
                        f"Verify {ch} against a reference gauge; inspect wiring/shielding."
                if kind == "variance" and x == c:
                    continue
                ft, info = self.trajectory(x, j)
                if ft:
                    return "SENSOR", ft, ch, "SUPPORTED", f"trajectory_{info['verdict'].lower()}", [], info, \
                        f"Verify {ch} against a reference gauge."
                return "SENSOR", "UNKNOWN", ch, "SUPPORTED_TYPE_UNKNOWN", "coupled_quiet_shape_unknown", \
                    ["SENSOR_DRIFT", "SENSOR_CALIBRATION_SHIFT"], info, f"Compare {ch} with a reference gauge."
        machine = _machine_rules(zu)
        if machine:
            ft, act = machine
            return "MACHINE", ft, None, "SUPPORTED", "b1_machine_rule", [], None, act
        return "MACHINE", "UNKNOWN", None, "UNCERTAIN", "unknown_fallback_machine", ["MACHINE", "SENSOR"], None, \
            "Anomaly without a supported cause; inspect pump and compare instruments."

    def run(self):
        n = len(self.g)
        chains = {("gateway", ""): _Chain()}
        for k, q in self.q.items():
            if not q["installed"] or np.isnan(q["cadence"]):
                continue
            chains["amplitude", k] = _Chain()
            if q["cadence"] == 1:
                chains["variance", k] = _Chain()
            if k in STUCK_KEYS:
                chains["stuck", k] = _Chain()
        last, rows = {}, []
        for j in range(n):
            gw = chains["gateway", ""]
            if self.gap[j]:
                gw.add(j, 0.)
            else:
                gw.reset()
            due = [("gateway", "")] if gw.due(j) else []
            for (kind, k), ch in chains.items():
                if kind == "gateway":
                    continue
                q = self.q[k]
                st = q["state"][j]
                if self.gap[j] or not self.steady[j] or st in ("STALE", "GATEWAY_GAP"):
                    ch.reset()
                    self.segment_start[k] = j + 1
                    continue
                if not q["new"][j]:
                    continue  # NO_NEW_SAMPLE neither confirms nor resets
                if kind == "amplitude":
                    z = q["z_now"][j]
                    if np.isfinite(z) and abs(z) > K:
                        ch.add(j, abs(z))
                    else:
                        ch.reset()
                elif kind == "variance":
                    zs = q["zs_now"][j]
                    if q["count"][j] >= 2 and np.isfinite(zs) and zs > VAR_K:
                        ch.add(j, zs / 2)
                    else:
                        ch.reset()
                else:
                    v = q["mean"][j]
                    flat = q["cadence"] != 1 or (q["std"][j] == 0 and q["count"][j] >= 30)
                    if not flat:
                        ch.reset()
                        continue
                    if ch.obs and ch.value != v:
                        ch.reset()
                    ch.value = v
                    ch.add(j, 0.)
                if ch.due(j):
                    due.append((kind, k))
            if not due:
                continue
            prio = {"gateway": 0, "stuck": 1, "amplitude": 2, "variance": 2}
            due.sort(key=lambda s: (prio[s[0]], -chains[s].strength, s[1], s[0]))
            primary = due[0]
            cls, ft, chan, status, rule, alts, info, act = self.diagnose(primary, j)
            t = self.t[j] + MINUTE
            if ft in last and t - last[ft] <= B.REFRACTORY:
                continue
            last[ft] = t
            rows.append(self.evidence(j, t, primary, chains, due, cls, ft, chan, status, rule, alts, info, act))
        return rows

    def evidence(self, j, t, primary, chains, due, cls, ft, chan, status, rule, alts, info, act):
        zu = self.usable_z(j)
        key = primary[1]
        ch_obj = chains[primary]
        if primary[0] == "gateway":
            sup, conf, miss = [], [], []
        else:
            _, quiet, loud, missing = self.coupled(key, zu)
            sup, conf, miss = [B.CH[x] for x in quiet], [B.CH[x] for x in loud], [B.CH[x] for x in missing]
        used = [k for k in sorted(self.q) if self.q[k]["installed"] and np.isfinite(zu[k])]
        strength = max([chains[s].strength for s in due] + [0.])
        fmt = lambda v: None if not np.isfinite(v) else round(float(v), 6)
        alternatives = [f"{s[0]}:{B.CH.get(s[1], 'GATEWAY')}" for s in due[1:]] + alts
        return {
            "asset_id": self.asset["asset_id"], "alert_time_utc": t.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "event_class": cls, "fault_type": ft, "confidence": float(np.clip(strength / (2 * K), .05, .99)),
            "suspected_channel": chan, "class_status": status,
            "reference_status": self.g.reference_status.iloc[j],
            "reference_origin": pd.Timestamp(self.asset["window_start_utc"]).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "reference_end_utc": pd.Timestamp(self.g.reference_end_utc.iloc[j]).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "evidence_window_start": self.t[ch_obj.obs[0]].strftime("%Y-%m-%dT%H:%M:%SZ"),
            "latest_input_available_at": t.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "supporting_channels": "|".join(sup), "conflicting_channels": "|".join(conf), "missing_channels": "|".join(miss),
            "observed_values": json.dumps({B.CH[k]: fmt(self.q[k]["last"][j]) for k in used}, sort_keys=True),
            "residuals": json.dumps({B.CH[k]: fmt(zu[k]) for k in used}, sort_keys=True),
            "sample_counts": len(ch_obj.obs),
            "ages": json.dumps({B.CH[k]: fmt(self.q[k]["age"][j]) for k in used}, sort_keys=True),
            "expected_cadence": json.dumps({B.CH[k]: self.q[k]["cadence"] for k in used}, sort_keys=True),
            "rule_id": rule, "source_id": f"{primary[0]}:{B.CH.get(key, 'GATEWAY')}", "candidate_id": self.candidate,
            "alternatives": "|".join(alternatives),
            "trajectory": json.dumps(info, sort_keys=True, default=float) if info else "",
            "recommended_action": act}


def _machine_rules(z):
    """Unchanged B1 machine rules; a comparison with a missing operand is False (never NaN -> 0)."""
    gt = lambda c, v: np.isfinite(z[c]) and z[c] > v
    lt = lambda c, v: np.isfinite(z[c]) and z[c] < v
    le = lambda c, v: np.isfinite(z[c]) and z[c] <= v
    if gt("a", K) and (gt("c", K / 2) or gt("bt", K / 2) or gt("a", 2 * K)):
        return "BEARING_WEAR", "Inspect pump bearing; plan replacement; check lubrication."
    if lt("ps", -K) and gt("a", K):
        return "CAVITATION", "Check suction strainer / level; reduce flow if allowed."
    if lt("ps", -K):
        return "SUCTION_STRAINER_CLOGGING", "Inspect / clean suction strainer."
    if gt("v", K):
        if gt("bt", K / 2) or gt("wt", K / 2):
            return "MISALIGNMENT", "Check coupling alignment."
        return "IMBALANCE", "Inspect impeller for fouling / damage; balance."
    if gt("pd", K) and (lt("q", -K / 2) or lt("i", -K / 2) or lt("pw", -K / 2)):
        return "DISCHARGE_RESTRICTION", "Check discharge valves and heat-exchanger fouling."
    if lt("q", -K) and le("n", K / 2):
        return "DISCHARGE_RESTRICTION", "Check discharge valves and heat-exchanger fouling."
    if lt("pd", -K) and lt("i", 0):
        return "IMPELLER_WEAR", "Performance test; inspect impeller / wear rings."
    if gt("n", K) or gt("pw", K):
        return "SUCTION_STRAINER_CLOGGING", "Inspect / clean suction strainer."
    return None


def predict_b2(features, assets, as_of: Mapping[str, object], candidate="C1"):
    """Return (scorer-compatible predictions, structured evidence) for one registered candidate."""
    if candidate not in CANDIDATES:
        raise ValueError(f"Unregistered candidate {candidate}")
    z = _normalized(features, assets, as_of)
    rows = []
    if not z.empty:
        for aid, g in z.groupby("asset_id", sort=True):
            asset = assets[assets.asset_id == aid].iloc[0].to_dict()
            rows += _Asset(g.reset_index(drop=True), asset, candidate).run()
    ev = pd.DataFrame(rows, columns=EVIDENCE_COLS)
    # Canonical text columns: object dtype, None for missing. Otherwise pandas infers the dtype
    # from whichever alerts happen to be present, and a prefix run differs from the full run.
    for col in ev.columns:
        if col not in ("confidence", "sample_counts"):
            ev[col] = pd.Series([None if v is None or (isinstance(v, float) and np.isnan(v)) else v
                                 for v in ev[col]], index=ev.index, dtype=object)
    pred = ev[B._COLS[:5]].copy()
    pred["evidence"] = [f"B2 {r.candidate_id} {r.rule_id}: {r.suspected_channel or 'no channel'} ({r.source_id})"
                        for r in ev.itertuples()]
    pred["recommended_action"] = ev.recommended_action
    pred["suspected_channel"] = ev.suspected_channel
    pred["class_status"] = ev.class_status
    return pred.reset_index(drop=True), ev.reset_index(drop=True)
