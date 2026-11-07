# Task012 pre-score coordinator review

2026-11-07. Codex reviewed hydraulic_spread.py, the train runner, task packet and focused fixture coverage before scoring. The prior Task010/011 code and outcomes remain immutable.

The implementation preserves the registered head curve, derivative units, conservative spread budgets, NIST ranges, NPSH applicability check, first-24h reference and UNKNOWN-only waveform fallback. Review round 1 is resolved: reference means must be finite, future counts are mutated as well as statistics, and the two-noisy-source fixture demonstrates abstention without weakening the registered thresholds. The sum-of-magnitudes rule cannot identify two simultaneous noisy instruments; it is deliberately conservative. This is an inconsistency hypothesis, not proof of a defective sensor.

The runner compares all prediction/evidence columns for prefix invariance, verifies B1 emissions and saved control metrics, and compares the main prediction hashes with a fresh seed-0 process. It writes input projections and predictions before scoring. Training uses seven independent asset replays, not fitted cross-validation. No validation or test reads are authorized in this wave.

Manifest SHA-256: `2d2da3bc410a8e4566273a8ada536fd145d2809b6b5356e68fec50ef2abcb3a7`.

Authorization is limited to the registered single train run after the independent 39-fixture suite and manifest selfcheck pass. The fixed improvement gate is unchanged. A passing result would require a separate coordinator-reviewed validation protocol and source-specific demo explanation before adoption; a failing result stays recorded.

Independent verification: `PYTHONHASHSEED=0 ../../work/.venv/bin/python -m pytest -q tests/test_hydraulic_spread.py` — 39 passed in 30.86 s. Selfcheck confirmed pinned seed, exact code hashes, no seal and no completed run before this authorization.
