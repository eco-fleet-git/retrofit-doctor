# Task014 pre-score review

2026-11-07. Reviewed run_validation_z995.py before validation inputs or scores. The selected candidate, official split='validation', generic diagnostic metrics, event preservation and wrong-specific/channel guards are correct. Raw mutation handles categorical columns. No changes to inference or gates requested.

1. T10.input_projection_hashes has literal keys assets_train_rows/features_train_rows/events_train/etc. Rename these keys explicitly to validation equivalents in this runner's provenance so it does not misdescribe the loaded split. Include the IDs and test_touched=false as already planned. Do not edit the sealed T10 helper.
2. If train_gate_still_passes returns false, refuse before validation data access instead of merely recording an eventual failed adoption gate. Add a focused fixture proving load_validation is not reached in that case.
3. Preserve each full official scoring report as report_B1.json / report_Z995.json instead of discarding it. Verify/report split validation, assets08/09 and exposure14 asset-days alongside the expected metrics. These source reports preserve the exact denominators and scoring context behind the comparison.

No runner-up evaluation or tuning is allowed. The current source-code and train-evidence checks must still precede all validation reads. Keep the default UI and test release untouched during this task.
