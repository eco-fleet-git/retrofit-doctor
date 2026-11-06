# Task 003 coordinator review — round 1

Fix before final handoff. The previous terminal message was truncated; this file is authoritative for this review. You remain the sole application writer. No Git commands, external generation, or test-set inspection.

Independent Node probes reproduced three failures:

1. `m=redundantPumpPreset(); m.horizonYears='100000000000'; evaluateModel(m)` throws `Invalid array length`. Define and explain a bounded supported horizon in UI; return a field validation error instead of allocating unbounded arrays.
2. Set the preset sensors quantity to `'2'` and unit cost to `'1e308'`. The evaluation has zero errors but initial cost Infinity and NPV -Infinity. Validate nonfinite intermediate and final arithmetic, and suppress financial conclusions for invalid models.
3. A saved draft `{assetId:'PUMP-08',version:1,economics:null}` loads as valid, then evaluation/rendering crashes. Validate essential nested schema, including migrated drafts; corrupt or incompatible storage must not crash or silently overwrite the original.

Write meaningful regression tests for these cases, including renderer/storage integration as appropriate.

Provenance: editing a fixture/preset cost currently preserves the old source/basis/date as if the number were still sourced. Preserve original provenance, mark the edited value as a user assumption with entry date, and allow meaningful source/reference/source-date editing. Check COST_MODEL_SPEC requirements. Do not accidentally retain a quotation label for an unsourced edited amount. Quote validity, scope and tax basis must be captured or unsupported quoting must be clearly disabled/deferred.

Shared gateway project-total allocation is not implemented by an allocated-cost note alone. Implement if practical in this task; otherwise explicitly disclose the limitation and do not claim complete ENG acceptance. Update handoff with exact implemented/deferred requirements.

User approved the light UX Pilot visual direction, sidebar and separate evidence card. Full visual integration belongs to Task006. The paid UX Pilot run succeeded (9 credits); its invented data are rejected and documented in design/uxpilot/README.md. No additional paid generation.
