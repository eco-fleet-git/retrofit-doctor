# Task004 independent evidence review

6 November 2026. Codex review of the frozen sensor-ablation implementation and saved outputs; final narrative checked separately before commit.

- Seven focused tests independently passed. Masking removes every channel-derived feature column plus installed-channel metadata; the original event denominator stays in the evaluator.
- All sealed code hashes match. The actual feature file SHA-256 also matches the recorded vendor-manifest hash (byte integrity only; no test-content inspection).
- Full-control predictions independently match the previous sealed C0 outputs for the same assets: 27 train alerts, 9 PUMP-09 alerts. All three restored prediction frames match full control, including categorical evidence and timestamps; numeric tolerance 1e-6, rtol 0.
- Saved audits contain 414 train and 138 descriptive-validation prefix checks, all passing. Restore comparisons are 9 train + 3 validation asset/group checks. The restore branches also exercise the full-information detector at the historical cutpoints.
- Train original denominator is 10 events; validation denominator is 5. Masking never removes an event from these denominators.

Train full → mask vibration/temperature: detection 9→8, first correct type 2→0. Important paired changes: PUMP-02 bearing wear and misalignment lose detection, PUMP-04 imbalance loses the correct type, and its discharge-restriction event gains an UNKNOWN detection. The net delta alone hides these changes.

Train flow/power mask: detection 9→8 but correct first types 2→3 and false+excess burden 6→5. PUMP-07 sensor shift gets the right type after removing competing information, while air entrainment loses detection. This is a mixed effect of a fixed rule set, not evidence that these measurements are useless or should be removed in practice.

Suction masking does not change train counts; on PUMP-09 it removes an incorrectly typed air-entrainment detection. Vibration/temperature masking on PUMP-09 reduces detection 5→4, correct first types 2→1 and sensor type+channel 1→0.

The added delay metric measures first correct **type**, not necessarily a correctly localized sensor diagnosis. Keep that label. Evidence is tied to unchanged causal B1 and these synthetic assets only; do not extrapolate to physical installation benefit, ROI, PUMP-11 outcomes or a later detector.
