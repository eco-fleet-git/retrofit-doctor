# Task014 pre-validation review and authorization

2026-11-07. Reviewed the new validation runner, generic metrics, immutable official scoring call, candidate/ID restrictions, adoption conditions and review-round fixes. Exactly frozen Z995 and B1; nothing fitted or retuned. No validation inputs or new predictions read during preparation.

Independent15-fixture suite passed in11.72s. Selfcheck confirms pinned seed, exact code hashes, unchanged train selection evidence and no existing seal/completed run. Manifest SHA-256 `a63f145db05bf6f378f6332f778a403a9c1847dd0806c2f29742dc98a8e08e39`.

Verified official split='validation' in both overall and per-asset scoring, full report preservation and14asset-day context checks, split-correct provenance keys, refusal before data access if the frozen train gate fails, categorical-safe raw mutation, event-preservation and wrong-specific/channel guards. No train-hardcoded evaluator is used for validation. Prefix and future-mutation checks include explanations and raw aggregation where supported.

Authorize the single registered descriptive validation run, standalone command preserving its actual exit code. This is previously inspected validation, not blind independent evidence. Preserve any failure and all outputs; do not try runners-up or change scientific code after the result. No test reads/release changes or UI adoption until coordinator reviews the completed result.
