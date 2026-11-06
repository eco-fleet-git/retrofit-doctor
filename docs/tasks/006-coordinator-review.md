# Task006 coordinator review and preparation gate

7 November 2026. The integrated local demo is accepted as a working prototype after two review rounds. This is coordinator verification, not final user acceptance or field validation. The user approved the light visual direction earlier; a request for the next iteration's priority is pending.

## Independently verified

- Ran the 12 exporter tests and existing 40 JS tests; all passed. After round 2, independently ran the four new physical-package tests; all passed. Read the implementer's browser checks: 34 Task006 checks and 47 Planner regression checks pass. This review does not claim to have independently rerun those entire browser suites.
- Both validation replay files are identical to their pre-integration versions after excluding provenance. No detector output was changed by the UI work.
- Inspected actual screenshots of desktop decision/empty-draft/proposal/diagnosis views and the corrected 390 px chart/schematic. Physical proposal statuses now appear alongside elements; pressure-rise sign is corrected; pressure/power instruments already present are reused.
- Independently navigated the local app in IAB at 1440 × 900 and 390 × 844. At PUMP-08 12:37 there is no alert; at 12:38 the original suction-strainer alert appears. Read the corrected pressure explanation. Added the flow/head/power hypothesis: only absent flow is proposed on PUMP-08, while VFD power and both pressures are present/reuse-where-verified.
- Switched that draft to Defer and loaded the illustrative case: annual net −EUR 2,200 and five-year NPV −EUR 15,500, missing review answers still explicit. No proposed points remain on the schematic; stored hypotheses remain in the draft. No draft was saved or existing user draft deleted during this review.
- Opened PUMP-11: six-channel passport and unavailable diagnosis, with missing pressure/flow/vibration points, no replay controls. Reviewed captured browser logs: no warnings/errors. The narrow chart is now readable. Temporary viewport override was reset; the reviewed PUMP-08 tab was left available.

## Remaining prototype scope

The optional two-circuit cooling concept remains a separately labelled diagram, not an inferred benchmark topology. Fullscreen phone tables/cost editor require contained scrolling. The Planner remains long below the summary. Partial Task003 shared allocation, provenance and quote-expiry requirements are disclosed, not claimed complete. No screen-reader or 200% zoom audit and no timed human rehearsal have been performed. All engineering proposals remain unvalidated.

The walkthrough's assertion that browser-offline-after-load had been verified was not supported by Task006's QA script; coordinator corrected that wording. The release check must distinguish no Internet dependency with the local server available from switching the browser offline (which can block new localhost fetches). Prefer a fresh browser profile for rehearsal; do not clear the user's existing drafts.

## Task007 preparation authorized

Proceed with Task007 **phase 1 only**: implement and test the pinned-baseline export adapter on train/fixtures, exact submission schema, release manifest and fresh-checkout demo checks. The selected artifact is unchanged causal B1 at k=6/persistence15, Python 3.13.16 with locked dependencies and seed 0 at process startup. Include the shared feature-file identity from the Task005 review.

Return the exact proposed release gate for coordinator review before reading any PUMP-10/11/12 measurements. No test labels, organizer test predictions, outcome inspection, algorithm change or external submission. Codex continues to own the main README and presentation; Claude owns release documentation and `web/README.md` corrections.
