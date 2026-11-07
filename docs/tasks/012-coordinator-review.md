# Task012 coordinator outcome review

2026-11-07. Reviewed the completed sealed run `run-20261107T091714055594Z`, comparison, applicability counts, per-candidate control/correctness checks and findings. Manifest and code remained as sealed at2281e16. Runtime295.3s; no candidate selected.

H3/H5 exactly retain the main B1 counts (18 detected,8 type,14 class,3 false+3 excess,3 sensor type+channel). V3/V5 gain only the already observed UNKNOWN refinement (type9), still below the fixed improvement gate. No hydraulic override occurred. All1960 full-evidence prefix/future-mutation comparisons pass, and main hashes match a fresh seed0 process. Independent pre-score fixtures:39 passed.

The coverage report has24 model-applicable alerts,14 missing-flow exclusions,3 curve mismatches and2 protected alerts. Corrected a wording error in FINDINGS that had counted protected PUMP-01/PUMP-05 alerts as hydraulically applicable; the underlying CSV counts were correct. No scientific outcome or gate changed.

The known flow-noise alert's observed/budget ratio is0.974, despite spread z26.266. Summing the propagated standard deviations conservatively loses synchronization. This motivates a separately registered raw synchronized-residual experiment, not relaxation of this wave's thresholds. Task013 phase1 work overlapped the immutable read-only Task012 audit; no Task013 raw inspection/scoring occurred, and Task012 outcomes were preserved before proceeding with the new tests.

Decision: retain B1 as selected baseline, preserve every negative candidate, continue the user-authorized search. No validation/test development reads or default-demo adoption authorized by this result.
