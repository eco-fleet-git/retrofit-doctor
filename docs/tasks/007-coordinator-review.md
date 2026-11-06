# Task007 coordinator review and release decision

7 November 2026. Phase-1 adapter accepted after review fixes. Codex independently ran the 24 focused release tests (24 passed), checked all five release-code identities, checked the registered train/validation prefix summary (98 + 28 checks, no failures), the 209 stored cutpoints and exact baseline parity, and verified the running local demo returns HTTP 200. Full 174-test and fresh-clone HTTP/44-JS-test results are implementer evidence. Fresh-clone visual rendering and a timed human rehearsal are not claimed.

## Exposure decision

The implementer disclosed a pre-gate PUMP-10 feature read into a pytest process during an intentional gate-removal mutation. They report no values were emitted, retained, compared or analysed; no model or parameter selection followed it. This violated phase-1 isolation. The final tests prohibit parquet reads in every potentially exposing boundary test; the no-gate test is isolated from the real release files. The proposed manifest exposure log was corrected by the coordinator before approval. Its original generated statement that test measurements were never loaded was inaccurate and is superseded.

Proceed with the already selected unchanged causal B1, using an exact reviewed-manifest gate. Describe this as a **fixed-model test export with disclosed pre-gate access**, not a pristine blind evaluation. No test quality can be inferred without organizer scoring. No retuning or manual diagnosis based on test results is authorized.

## Gate scope

Only PUMP-10/11/12 feature predicates; frozen code/data/template, Python 3.13.16, locked dependencies and interpreter-start seed 0. One predictions CSV, exact template fields; registered 42-prefix audit reports counts/pass/fail only. Preserve predictions even if an audit fails, disclose the failure and do not tune. No labels, organizer predictions or publication. The exact manifest digest and reviewed commit are recorded in BLIND_GATE.json after committing these reviewed files.

Main owns Git and the release gate. Claude may execute the sealed command and finish the release README/checklist once that gate is present. Final human feedback and spoken rehearsal remain pending.
