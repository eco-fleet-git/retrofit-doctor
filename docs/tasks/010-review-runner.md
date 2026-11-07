# Task010 runner review before first score

Read initial run_diagnosis_fusion.py; no candidate scores have been seen.

1. Full B1 prediction uses wf=None, but causality_audit currently passes the waveform frame for every candidate including B1. diagnose_asset copies its provenance fields, so this manufactures differences in the control audit. Pass None for B1 in the audit, matching the production call, and add a synthetic runner-level audit fixture with a pre-24h quality alert and nonempty snapshots. Do not drop waveform fields from comparisons for the other candidates.
2. Determinism currently compares only two child runs. Compare their hashes with the original main predictions too, so the gate covers the actual scored artifacts.
3. Persist prospective run provenance BEFORE the first score: manifest/code hashes, actual train-only input projection hashes (not full shared telemetry/test content), fit assets, feature names, class/support, model parameters and reproducible fitted-state hashes. No need for large binaries if model reconstruction is deterministic. Save per-asset comparisons as well as per-event rows; show unsupported classes and waveform availability/fallback counts. Preserve a partial failed run rather than overwriting predictions on a retry.
4. Add focused runner fixtures for the seal/no-data-on-refusal guard, gate boundaries, and the audit path using mocked fixture data. This prevents discovering interface/schema mistakes only after a costly benchmark run. No need to rerun unrelated legacy suites or read test data.

All candidate definitions and the success gate remain unchanged. Hash the final implementation/runner/tests and manifest after these corrections, then stop for coordinator seal.
