# Task012 pre-score coordinator review

Read hydraulic_spread.py before any Task012 score. Formula signs/magnitudes, kPa↔m conversion, requested NIST ranges and unsupported-model gates match the registered design. References are restricted to first24h and only exposed after completion.

1. Reference floor eligibility should require a finite source mean as well as installed/count>=30/finite nonnegative std, consistently with the observed-input contract. Do not let a retained std with a missing mean contribute to a purportedly observed reference. Add a focused reference-support fixture.
2. For the two-noisy-sources fixture, the registered conservative budgets may make both sources abstain: each includes the other's variability. Do not fabricate an impossible simultaneous-eligible branch or weaken the budget to make a test pass. Show the correct two-source/physically coupled fallback behavior and document the reason.
3. Include counts in the future mutation audit, as Task012 registers, along with means/std/snapshots. This should cover V3/V5 and reference support, not only H variants. Preserve source-availability semantics and all evidence in comparisons.

No scientific parameter/candidate changes. Return fixtures, exact manifest/hash and handoff before any score; prior sealed code remains unchanged.
