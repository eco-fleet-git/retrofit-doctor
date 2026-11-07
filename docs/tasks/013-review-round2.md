# Task013 pre-score review round 2

2026-11-07. No threshold changes. Reviewed runner, early-reference fix, native covariance evidence, allowlisted partition loader and empirical amendment.

1. In residual_reference, `t = t[[steady.get(m, False) for m in t.minute_start]]` becomes a column selection when the list is empty, so the following `t.std_E` raises AttributeError if all rows were filtered out. Use an explicit boolean row mask preserving schema. Test nonempty raw/table with zero eligible first-day minutes (all missing/invalid/low-count or non-steady) for both factor and empirical candidates: unsupported fallback, not a crash; support0, no reference distribution in evidence.
2. The runner fixture still expects only R3/R5/Y3/Y5 in coverage; the amendment requires E995/Z995 too. Update that fixture and ensure the whole suite passes, including the actual pipeline audit path. This is test coverage of the declared expansion, not a scientific change.

The remaining reviewed core behavior matches the prospective protocol: covariance identity uses the exact additive transformed terms; empirical rank counts ties against the candidate; all original thresholds and gates are preserved; raw checks recompute from truncated/future-mutated raw input rather than relying only on a cached table.
