# Task005 coordinator review

2026-11-07. Experiment accepted as a reviewed negative/infeasible result. R1 and R2 are rejected; the fixed seed-0 causal B1 remains the demo/release choice. This does not mean R0 passed E3's cross-seed gate: it did not. No new validation evaluation is authorized or needed. E4 remains fixture-only and not testable under the registered design.

## Independent checks

- Read model, evaluator, frozen manifest, selection, paired/common-window results and final handoff. All eleven frozen code/manifest/control hashes match.
- Ran 48 model fixtures after phase-1 corrections and 3 evaluator fixtures after phase 2: all pass. The latter require emitted-type/channel correctness and separate useful vs type-only delay.
- Reconstructed the ten failing audit rows (five cutpoints for each candidate) with seed 0. Normalizing null representations makes all prefix and future-mutation comparisons equal; non-channel fields also match. Evidence: `review/task005/comparison-representation-check.json`. This is read-only diagnosis of failed comparisons, not a rerun of selection or a passing replacement audit. The original gate failures remain intact.
- Reviewed the retained-control parity check and unchanged original 26-event denominator. Neither candidate improves sensor type+channel. R2 loses the correct PUMP-03-E02 type; its stored alternative gets no credit. The common-window and confidence comparators are explicitly offline/descriptive.
- The E3 freeze's direct input list omits the shared feature parquet. Separately verified its complete opaque SHA-256 against the immutable organizer manifest: `de25928738c45a5d6608d6c1a3e6e3eb69d612d23e99a9f184f3b23db4d9c52c` (10,433,571 bytes). This hash reads whole-file bytes, including test partitions, without decoding or inspecting their values. It confirms unchanged source identity; it does not change the frozen E3 record. The final release manifest should explicitly include this data identity.

## Result and limitations

R1 retains 18 detections, 8 types, 14 classes and burden 6, but shifts which events/times receive alerts and removes amplitude coverage. R2 retains detection/class/burden but drops to 7 types and 2 sensor type+channel diagnoses. Both inherit seed-dependent outcomes and fail the registered correctness gate; R2 also fails the type gate. The original null-comparison defect is separately disclosed. Do not relabel these results as successful improvements or claim that all forms of regime modelling/abstention fail.

The report's wording was narrowed after review: diagnostic-status minutes are not proof that every R0 channel had a usable reference, and unchanged nuisance counts do not erase the recorded mixed timing changes. Code, manifest, predictions and selection were not changed.

## Release consequence

Use the unchanged causal B1 artifact and its existing parameters in a **pinned Python 3.13.16 / dependency-lock / PYTHONHASHSEED=0 process**. The final adapter must establish or enforce seed 0 at interpreter startup, reject an unpinned invocation or launch a fresh pinned subprocess, and record that condition. Merely setting the environment variable after Python startup does not establish it. Prove repeatability of this configured process on train/fixtures before the blind-test gate. Do not claim seed invariance; vendor set iteration can change a type, not merely explanation text. No vendor fix, new candidate or new parameter search is authorized for this release.

Task006 may now proceed as sole code writer. Task007 still needs its separate adapter/manifest review before any test measurements are read.
