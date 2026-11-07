# Task020 — coordinator review

2026-11-07. Claude Code implemented the application; Codex scoped, reviewed source and exercised the local browser. User visual acceptance is still pending. Video remains paused.

## Delivered product behaviour

- Collapsible site portfolio on the overview, six actual metadata groups (three vessels, three plants), clear ship/factory silhouettes and availability markers. The group selected filters the existing queue and coverage table. Technical sensor abbreviations remain unchanged.
- Separate optional large-fleet scenario: 200 SIM pumps at 20 fictional sites. Authored states illustrate equipment inspection, instrument checks and missing-data triage. This is a deterministic UI scenario, not a new physical telemetry simulation, detector evaluation or live connection.
- Explicit source distinction in panel, collapsed summary, sidebar and footer. Historical challenge records and the scenario never share displayed pump lists or diagnosis metrics.

## Browser observations

Reviewed screenshots in EN/RU, desktop 1440, default 1161, tablet 940 and mobile 390. No page overflow or text collisions in the reviewed portfolio/scenario views. Mobile scenario table becomes readable per-pump cards. Screenshots are under `review/task020/`.

- Vessel A selects exactly PUMP-01/02/03 and its two recorded reviews. Vessel B selects PUMP-07/08 and the PUMP-08 review. The site dropdown agrees. The review opens the actual PUMP-08 evidence page.
- Source switching hides benchmark queue/table and restores the selected site on return. Reset restores all 12 pumps. EN/RU changes preserve current selection.
- Missing-data scenario filter shows 9 sites and 10 matching pumps. Selecting SIM plant 2 shows SIM-036 and SIM-040, authored gap descriptions and gateway/check recommendations. Changing that selection to measurement checks gives an explicit empty result.
- Collapse/expand works with pointer and keyboard. The open state persists through language changes and reload; source badge remains visible when collapsed. Scenario mode itself is session-only, and reload defaults to challenge data.
- No new browser warning/error logs during this review. Temporary viewport overrides reset; the tab is left on the Russian challenge-data overview.

## Corrections made during review

Added visible disclosure chevron/text; fixed scenario card wrapping and icon-row sizing; kept legend icons attached to their labels; showed both review and replay icons for PUMP-08; made scenario filtering remove nonmatching sites (retaining a selected site to explain an empty result); corrected all scenario source labels including the shell footer; arranged challenge sites in three desktop columns.

## Verification

Independent `node --test --test-timeout=30000 tests/*.mjs`: **109/109 pass**, 0 failures. `git diff --check` clean. All four frozen `web/data/*.json` hashes match the Task019 baseline; no benchmark changes. Meaningful tests cover site membership, loading semantics, SIM partition/IDs, filtering, rendering and source presentation.

The scenario demonstrates navigation and suggested next checks at scale. It does not establish measured fault accuracy, concurrent operating health, real fleet scalability, savings or equipment connectivity.
