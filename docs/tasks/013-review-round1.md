# Task013 early coordinator review

2026-11-07, before fixtures/seal/scoring. Review of the first synchronized_residual.py draft. No thresholds or scientific definitions changed.

1. **Future reference in evidence:** diagnose_asset computes the complete reference using the frame's final clock. residual_decision puts it into rule_detail before checking whether the individual alert is before reference_end. Thus an early alert in a full replay can expose first-day statistics that a prefix cannot know. At each alert's own minute end, expose the empty/incomplete reference state until reference_end. Add a fixture with a non-protected pre-24h alert in a longer full run and compare every column under prefix/future mutation. Similar failures were caught in the earlier waveform wave; prevent recurrence here.
2. **Native covariance evidence:** the protocol requires all four Cov(E,Xj) in kPa² as well as the dimensionless shares and sum. The draft emits only shares. Include native terms in rule_detail for reproducible decomposition; do not call shares causal probabilities.
3. **Invalid timestamps:** NaT currently disappears in groupby. Reject missing/unparseable timestamps explicitly before aggregation, and test it. Keep exact minute-boundary behavior and the existing duplicate/off-grid handling. Test the explicit asset-partition loader on a temporary synthetic partition tree (including the asset_id restoration), without reading real benchmark raw files before the seal.

Finish preserving Task012 final findings when its background run completes; its uncompleted run is not replaced by the next wave. New Phase1 may progress independently while the immutable read-only audit finishes, but note that overlap accurately in the handoff.
