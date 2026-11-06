"""B1 with a fixed, causal commissioning reference and an explicit observation clock.

The first 24 wall-clock hours collect steady-running reference samples. No
reference-dependent deviations are computed during commissioning. Once that
interval is complete, its statistics are frozen; only subsequent minutes are
normalized. Gap/flatline checks remain available during commissioning.

Input rows represent CLOSED one-minute windows. `as_of` is the observation
clock, never inferred from the last packet (which may precede a gateway outage).
All vendor diagnosis, persistence, suppression and confidence rules are reused.
This is a batch/replay implementation, not yet an incremental edge service.
"""
from __future__ import annotations

from collections.abc import Mapping
import numpy as np
import pandas as pd
from retrofit_sim import baselines as B

FLOORS = {"v": .05, "a": .01, "c": .05, "bt": .3, "ps": 1., "pd": 2., "i": .3,
          "pw": .2, "q": 2., "n": 5., "wt": .5, "tf": .3, "vp": .5}
MINUTE = pd.Timedelta(minutes=1)


def utc(value):
    t = pd.Timestamp(value)
    if pd.isna(t):
        raise ValueError("Observation time must not be NaT")
    return t.tz_localize("UTC") if t.tzinfo is None else t.tz_convert("UTC")


def causal_features(features: pd.DataFrame, assets: pd.DataFrame,
                    as_of: Mapping[str, object]) -> pd.DataFrame:
    """Return causal normalized rows up to each asset's explicit observation time.

    Metadata window start anchors commissioning; changing future telemetry must
    not move that origin. Windows not yet complete are ignored. Missing completed
    windows are materialized as missing packets, including a trailing outage.
    A reference is an empirical commissioning reference, not certified healthy.
    """
    if assets.asset_id.duplicated().any():
        raise ValueError("Duplicate asset metadata")
    source = features.copy()
    source["window_start_utc"] = pd.to_datetime(source.window_start_utc, utc=True)
    result = []
    for _, asset in assets.iterrows():
        aid = asset.asset_id
        if aid not in as_of:
            raise ValueError(f"Missing observation time for {aid}")
        start = utc(asset.window_start_utc)
        observed_until = min(utc(as_of[aid]), utc(asset.window_end_utc))
        reference_end = start + pd.Timedelta(hours=B.BASELINE_H)
        grid = pd.date_range(start, observed_until.floor("min") - MINUTE, freq="1min")
        if len(grid) == 0:
            continue
        f = source[(source.asset_id == aid) & (source.window_start_utc >= start)
                   & (source.window_start_utc + MINUTE <= observed_until)].copy()
        if f.window_start_utc.duplicated().any():
            raise ValueError(f"Duplicate observed feature window for {aid}")
        # Float64 avoids prefix-dependent float32 aggregation rounding.
        numeric = f.select_dtypes(include="number").columns
        f[numeric] = f[numeric].astype("float64")
        f = f.set_index("window_start_utc").reindex(grid)
        f.index.name = "window_start_utc"
        f["asset_id"] = aid
        f["rows"] = f["rows"].fillna(0)
        f["operating_mode"] = f["operating_mode"].fillna("NO_DATA")
        f["running_fraction"] = f["running_fraction"].fillna(0.)
        # Vendor regime construction is now given a clock-complete, sorted grid.
        g = B.regime_frame(f.reset_index(), assets[assets.asset_id == aid])
        eligible = g.window_start_utc >= reference_end
        base = g[(g.window_start_utc < reference_end) & g.steady]
        reference_available = observed_until >= reference_end
        ready_channels = np.zeros(len(g), dtype=int)
        for key, channel in B.CH.items():
            m, s, count = f"{channel}__mean", f"{channel}__std", f"{channel}__count"
            g["z_" + key] = np.nan
            g["zs_" + key] = np.nan
            # These existing B1 quality rules require only the current minute.
            g["flat_" + key] = ((g[s] == 0) & g[count].ge(30)) if s in g and count in g else False
            if not reference_available or m not in g or base[m].notna().sum() == 0:
                continue
            med = base.groupby("regime")[m].median()
            mad = base.groupby("regime")[m].apply(lambda x: (x - x.median()).abs().median())
            global_med = base[m].median()
            global_mad = (base[m] - global_med).abs().median()
            mu = g.regime.map(med).fillna(global_med)
            scale = 1.4826 * g.regime.map(mad).fillna(global_mad)
            g.loc[eligible, "z_" + key] = ((g[m] - mu) / np.maximum(scale, FLOORS[key])).loc[eligible]
            ready_channels += eligible.to_numpy(dtype=int)
            if s in base and base[s].notna().any():
                sb = base[s].median()
                sd = max(1.4826 * (base[s] - sb).abs().median(), 1e-3 + .05 * abs(sb))
                g.loc[eligible, "zs_" + key] = ((g[s] - sb) / sd).loc[eligible]
        g["gap"] = g.rows < 30
        g["reference_ready_channels"] = ready_channels
        g["reference_status"] = np.where(~eligible, "COLLECTING_REFERENCE",
                                         np.where(ready_channels > 0, "REFERENCE_AVAILABLE", "INSUFFICIENT_REFERENCE"))
        # Do not retroactively label early minutes as reference-ready.
        g["reference_end_utc"] = reference_end
        result.append(g)
    if not result:
        return pd.DataFrame()
    return pd.concat(result, ignore_index=True)


def predict_from_features(normalized: pd.DataFrame, k=6., persist=15) -> pd.DataFrame:
    if normalized.empty:
        return pd.DataFrame(columns=B._COLS)
    # Persistence/refractory state sees causal inputs from the beginning;
    # this is not post-hoc deletion of early alerts from a leaky full run.
    return B.b1_threshold(normalized, k=k, persist=persist)


def predict(features, assets, as_of, k=6., persist=15):
    return predict_from_features(causal_features(features, assets, as_of), k, persist)
