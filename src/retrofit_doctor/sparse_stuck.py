"""Task008: sparse-stuck variants of the sealed causal B2 C1 (sealed module is imported, never mutated).

S1  unchanged C1 behaviour (reimplemented loop; parity with causal_b2.predict_b2 C1 is tested)
S2  C1 with the sparse-stuck source disabled; dense stuck, gateway, amplitude and variance unchanged
S3  C1 with a commissioning-repeat rule for sparse stuck: within the first 24 h steady-running
    reference, the longest run of exactly equal independent samples (broken by gap, stale or a
    non-steady segment, as for every chain) gives a frozen threshold max(3, longest + 1). After
    commissioning a sparse stuck needs that many NEW equal samples and >= 15 min of evidence: the S3
    sparse stuck chain is reset when the threshold freezes, so reference samples never count, and on
    every operating-segment change: gap, stale, a non-steady minute, or a change of the B1 speed-ratio
    regime bin (g.regime) while steady, both during commissioning and after it. A freeze that began during commissioning
    inflates the threshold (contaminated reference => insensitive).
    Before the reference closes, or with < 3 reference samples, sparse stuck is unsupported.

S0 (unchanged causal B1) is run by the experiment script. Batch/replay only.
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
from retrofit_sim import baselines as B
from retrofit_doctor import causal_b2 as B2

VARIANTS = ("S1", "S2", "S3")
REFERENCE_MIN_SAMPLES = 3
EVIDENCE_COLS = B2.EVIDENCE_COLS + ["sparse_stuck_rule"]


class _VariantAsset(B2._Asset):
    def __init__(self, g, asset, variant):
        super().__init__(g, asset, "C1")
        self.variant = variant
        ref_end = pd.Timestamp(g.reference_end_utc.iloc[0])
        self.ref_end_j = int((g.window_start_utc < ref_end).sum())
        self.reference = {}
        self.regime = g.regime.to_numpy()

    def sparse(self, k):
        return self.q[k]["cadence"] != 1

    def sparse_threshold(self, k):
        r = self.reference[k]
        if r["samples"] < REFERENCE_MIN_SAMPLES:
            return None
        return max(B2.MIN_UPDATES, r["longest_equal_run"] + 1)

    def stuck_due(self, k, ch, j):
        """S3 sparse confirmation: frozen commissioning threshold + unchanged wall-clock persistence."""
        if j < self.ref_end_j:
            return False
        need = self.sparse_threshold(k)
        if need is None or len(ch.obs) < need or j + 1 - ch.obs[0] < B2.PERSIST_MIN:
            return False
        if ch.next_attempt is None:
            ch.next_attempt = j + B2.RETRY_MIN
            return True
        if j >= ch.next_attempt:
            ch.next_attempt += B2.RETRY_MIN
            return True
        return False

    def run(self):
        # Same loop as causal_b2._Asset.run; variant hooks are marked "variant".
        n = len(self.g)
        chains = {("gateway", ""): B2._Chain()}
        for k, q in self.q.items():
            if not q["installed"] or np.isnan(q["cadence"]):
                continue
            chains["amplitude", k] = B2._Chain()
            if q["cadence"] == 1:
                chains["variance", k] = B2._Chain()
            if k in B2.STUCK_KEYS and not (self.variant == "S2" and self.sparse(k)):  # variant
                chains["stuck", k] = B2._Chain()
                if self.sparse(k):
                    self.reference[k] = {"samples": 0, "longest_equal_run": 0}
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
                if self.variant == "S3" and kind == "stuck" and self.sparse(k) and (  # variant
                        j == self.ref_end_j or (j > 0 and self.regime[j] != self.regime[j - 1])):
                    # threshold freezes at ref_end_j: only NEW post-commissioning samples may confirm;
                    # an operating-segment (regime) change restarts the equal run even while steady
                    ch.reset()
                q = self.q[k]
                st = q["state"][j]
                if self.gap[j] or not self.steady[j] or st in ("STALE", "GATEWAY_GAP"):
                    ch.reset()
                    self.segment_start[k] = j + 1
                    continue
                if not q["new"][j]:
                    continue
                if kind == "amplitude":
                    z = q["z_now"][j]
                    if np.isfinite(z) and abs(z) > B2.K:
                        ch.add(j, abs(z))
                    else:
                        ch.reset()
                elif kind == "variance":
                    zs = q["zs_now"][j]
                    if q["count"][j] >= 2 and np.isfinite(zs) and zs > B2.VAR_K:
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
                    if self.variant == "S3" and self.sparse(k):  # variant
                        if j < self.ref_end_j:
                            r = self.reference[k]
                            r["samples"] += 1
                            r["longest_equal_run"] = max(r["longest_equal_run"], len(ch.obs))
                        if self.stuck_due(k, ch, j):
                            due.append((kind, k))
                        continue
                if ch.due(j):
                    due.append((kind, k))
            if not due:
                continue
            prio = {"gateway": 0, "stuck": 1, "amplitude": 2, "variance": 2}
            due.sort(key=lambda s: (prio[s[0]], -chains[s].strength, s[1], s[0]))
            primary = due[0]
            cls, ft, chan, status, rule, alts, info, act = self.diagnose(primary, j)
            t = self.t[j] + B2.MINUTE
            if ft in last and t - last[ft] <= B.REFRACTORY:
                continue
            last[ft] = t
            row = self.evidence(j, t, primary, chains, due, cls, ft, chan, status, rule, alts, info, act)
            row["candidate_id"] = self.variant
            row["sparse_stuck_rule"] = ""
            if primary[0] == "stuck" and self.sparse(primary[1]):
                k = primary[1]
                rule_info = {"channel": B.CH[k], "independent_equal_samples": len(chains[primary].obs)}
                if self.variant == "S3":
                    rule_info.update({"required_equal_samples": self.sparse_threshold(k),
                                      "reference_samples": self.reference[k]["samples"],
                                      "reference_longest_equal_run": self.reference[k]["longest_equal_run"],
                                      "threshold_frozen_at": pd.Timestamp(self.g.reference_end_utc.iloc[0])
                                      .strftime("%Y-%m-%dT%H:%M:%SZ")})
                else:
                    rule_info["required_equal_samples"] = B2.MIN_UPDATES
                row["sparse_stuck_rule"] = json.dumps(rule_info, sort_keys=True)
            rows.append(row)
        return rows


def predict_variant(features, assets, as_of, variant):
    """Return (scorer-compatible predictions, structured evidence) for S1/S2/S3."""
    if variant not in VARIANTS:
        raise ValueError(f"Unregistered variant {variant}")
    z = B2._normalized(features, assets, as_of)
    rows = []
    if not z.empty:
        for aid, g in z.groupby("asset_id", sort=True):
            asset = assets[assets.asset_id == aid].iloc[0].to_dict()
            rows += _VariantAsset(g.reset_index(drop=True), asset, variant).run()
    ev = pd.DataFrame(rows, columns=EVIDENCE_COLS)
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
