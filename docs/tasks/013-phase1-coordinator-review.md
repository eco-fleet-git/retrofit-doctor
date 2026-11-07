# Task013 pre-score coordinator review and authorization

2026-11-07. Reviewed the residual module, raw/metadata loaders, runner, tests, protocol and pre-score empirical-tail amendment. All six variants are defined before raw benchmark inspection and scoring. No earlier sealed code or data artifact changed.

Independent focused suite: `PYTHONHASHSEED=0 ../../work/.venv/bin/python -m pytest -q tests/test_synchronized_residual.py` — **49 passed in36.04s**. Selfcheck: pinned seed, exact code hashes, no seal/completed run yet. Manifest SHA-256 `4e673ca28dd1c9dd0dac0770969bef693402ba34bcfa5d335bccf14c46ed19a9`.

Both review rounds resolved: per-alert reference timing (including early non-protected UNKNOWN), native covariance evidence, explicit invalid timestamps, synthetic partition-loader verification, schema-preserving zero-support fallback, all six configurations in runner coverage. Exact additive covariance decomposition and empirical tie handling match the registered rules. The reference-tail rank has no claimed probability calibration. Raw aggregation uses same-minute paired observations and an explicit availability clock; independent raw replay checks complement cached-table prediction audits.

Authorize exactly the registered train run, all six variants plus B1, with the fixed success gate and tie order. Preserve every result and partial attempt. Do not amend code/thresholds after observing scores. No validation/test read or UI adoption yet. A selected candidate requires separate review and the already prospective Task014 protocol; the existing test release remains frozen.
