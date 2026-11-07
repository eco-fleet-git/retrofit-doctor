# Task011 pre-score review

Coordinator read the new module, runner and fixtures before any Task011 benchmark scoring. Candidate definitions and success gate remain unchanged.

1. In the main benchmark causality audit, the future-mutation branch should mutate future std/min/max as well as means/snapshots for ALL candidates, including U1/U2. The current extra spread audit covers only Q1/Q2. Apply the existing mutate_spread_future helper to the future-mutated frame before normalization in the main audit; then the same full provenance comparison tests the actual U path too. This is a verification correction, not an algorithm change. A focused runner fixture should exercise it.
2. Reject physically invalid negative std as a usable coupled observation (std=0 can be a valid quiet coupled channel; the source still requires >0). Add a small invalid-coupled-statistic fixture. This refines the input-validity guard, not thresholds.
3. Clarify `rule_detail.rule`: it describes the noise rule evaluated, even when the emitted decision comes from W1 or B1. Rename it to `evaluated_noise_rule` and store the actual `diagnosis_source` separately in the detail, or document the distinction explicitly in the schema/manifest. Do not present evaluated-but-abstained Q1 as the emitted explanation. The retained confidence on Q/W1 decisions is B1's anomaly score, not a confidence estimate for the newly named cause; record this in the manifest/handoff.

No additional candidate or score run. Return final fixture results, matching manifest hashes and handoff for seal.
