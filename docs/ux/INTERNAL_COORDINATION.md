# Internal coordination note

Internal working note, excluded from the six-slide jury pitch. Updated 6 November 2026 following main-chat clarification.

## Delivery and ownership

Claude Code is already implementing the functional UI under **Task001**. This UX package is a **visual follow-up to Task001**: reuse the existing application, routes, data adapters and state ownership. It does not launch a second implementation, scaffold, parallel app or alternative backend. Codex plans and verifies. The documentation author's write scope remains `docs/ux/` only.

First working version: **7 November 2026, 12:00 Europe/Berlin** (11:00 UTC). Two subsequent iterations remain planned without invented dates: first repair demo/interaction/data-boundary failures, then refine evidence clarity, visual polish and rehearsal. Coordinate these passes through main within Task001. Algorithm improvements require their own evaluation and are outside the visual follow-up.

The user has authorized the project as a whole. Do not add a new user-approval requirement to carry out work already covered by that authorization. Routine coordination with main is an execution gate, not a request for the user to re-authorize the project.

## Final one-shot blind export

The gate is **freeze + coordination with main**. No separate mandatory user approval is required for the final one-shot blind export.

1. Freeze the selected model/rules, parameters, preprocessing and export configuration. Record the version and run manifest so the final output can be traced to that frozen configuration.
2. Coordinate the final run with main, which owns sequencing and the single final export. This visual follow-up must not launch a duplicate run.
3. Execute the one-shot blind inference/export using the frozen pipeline. Keep test ground truth inaccessible and do not tune from hidden labels or iteratively optimize against test results.
4. Preserve the resulting predictions and provenance for main's final delivery. A label-free export establishes no test-accuracy claim. Technical execution failures are handled through main and recorded; they do not justify silent retuning or untracked additional runs.

Until that coordinated final export, PUMP-10–12 remain metadata-only in the demo UI. The UI's prohibition on loading test telemetry or labels is a display/data-isolation contract for this release, not a prohibition on the already-authorized final blind-export pipeline. A later decision by main to expose actual frozen predictions must retain their blind status and provenance and must never imply known ground truth or measured accuracy.

## Review handoff

Review Task001's current build first. Apply only the visual/interaction gaps identified against this package. Report functional mismatches to main and resolve them within Task001 instead of implementing competing behavior. Keep benchmark findings and raw source evidence intact. No public release, purchase or physical installation is part of this documentation update.
