# Task016–017 coordinator review — bilingual visual walkthrough

User explicitly requested English / Russian and less text: the entry point, meaning of the diagnosis and next action were all unclear. English remains the jury language. Claude Code implemented the application; Codex specified the task, reviewed the scientific wording and tested the real local UI through CUA. No user acceptance is inferred from implementation or tests.

## Design decisions

- Start with one primary PUMP-04 button and a visual three-step route. Keep the twelve-pump inventory secondary.
- Show a tentative conclusion, actual visual evidence and an advisory next check. Put extended explanation and limits in disclosures.
- Use recorded P04 pressure/flow values, stored vibration feature ratios and explicit recording ages. No fabricated vibration spectrum or inferred ship topology.
- The schematic is a generic single-pump measurement map from the passport. Installed, proposed and missing measurements are distinct. A highlighted point means “check”, not confirmed failure.
- Switch language locally while retaining case, clock, filters and draft values. Exact source outputs retain their original wording in marked technical disclosures.

## Browser observations completed

- EN→RU and RU→EN retain PUMP-04 at 22:05:59 UTC and the unavailable-warning state. No inference chart or focus/proposed chip appears before its warning. The static sensor inventory remains visible.
- P04 at 22:06 UTC shows 7.3 vs 3.5 kPa residual spread, actual measured/curve-derived pressure traces, and the recorded flow range 248–326 m³/h during 22:05:00–22:05:59 UTC. The reference is explicitly not a healthy limit.
- P08 +1 day retains the original hypothesis and the 3 h 39 min 37 s age at warning; the current recording age is 27 h 39 min 37 s. Both languages agree. Feature bars show a line/background ratio (1.9 vs 4.8), not a probability or absolute amplitude.
- P02 shows its earlier recording, 3 h 02 min 10 s before warning, and 1×/2× feature context.
- P01 shows unresolved cause, a missing-flow capability gap, an advisory pressure-reference check and an explicit route to the retrofit planner. Adding flow is not claimed to guarantee the diagnosis.
- Fleet “Sensor inventory only” filter leaves seven pumps and survives the language switch.
- At 1440×900, the corrected action panel begins at y486 and is approximately 157 px tall; the schematic starts at y654. The hypothesis, comparison bars and next check are visible together. The initial nested-grid regression was identified through CUA and fixed by Claude.
- At 940×1190 the layout stacks, with the next check before the evidence. “See evidence” scrolls to and focuses `cmp-evid-h`.
- At 390×844 there is no horizontal page overflow. “See the next check” focuses `cmp-next-h`; the action, schematic and bars remain readable.

Screenshots are saved in `review/task017/` (RU start, P04 desktop/panel/mobile, P01/P08, English P04 and RU Planner).

## Final core-route and regression checks

- Pump Detail PUMP-08 at 2025-09-10 12:38 UTC renders the same baseline hypothesis and data in Russian: suction-strainer restriction, 35.3067 kPa(g), causal z −6.71, missing flow and four unsampled five-minute channels. The next engineering check and alternatives are translated. This preserved baseline example is distinct from the later bearing review.
- The P04 inventory and interactive sensor schematic are translated. Clicking Q explains its one-second period, source and unspecified physical placement. The full-replay banner now distinguishes inventory from the separately reviewed warning. The training badge is neutral “Training pump · passport”.
- Returning from the P04 sensor page to its warning review retains 22:05:59 UTC and the unavailable-warning state; opening the explicit reviewed episode uses its warning checkpoint.
- Planner note, selected minimal-retrofit path and added flow/head/power hypothesis survive EN/RU switching. Temporary QA note was removed; no draft was saved externally or to browser storage. Reload discards these unsaved QA changes as expected.
- The illustrative case retains EUR 4,500 initial cost, EUR −2,200 annual net and EUR −15,500 five-year NPV in both languages. Its hypothetical redundancy and non-price/non-pump-specific assumptions remain visible.
- Planner entry has one primary next-action button. It focuses `choice-existing`; after choosing a path, the next-question button focuses `ans-c0-s`. The cost comparison is closed by default and follows the choices. All calculations remain accessible.
- The historical Evidence page retains its English source tables with a Russian explanation of scope and language. The current comparison metrics and descriptions are available in Russian on the warning-review route.
- No captured browser console errors. Default viewport restored; visible browser left at the Russian Start page with the primary P04 entry available.

## Independent automated and source verification

Codex ran `node --test tests/*.mjs`: **94/94 pass**, including as-of boundaries, future provenance rejection, language/visual checks, Planner state and its next-action targets. `git diff --check` passed. No broad diagnostic rerun was needed for this display change.

There are no changes to `src/`, `results/`, `release/`, `vendor/` or `web/data/`. SHA-256 values match the reviewed Task015 bundle:

| File | SHA-256 |
|---|---|
| diagnosis-comparison.json | `8ffff27f530dd05d0970ec36b23126ec5502a0c1055d7ee12a135aef559ea567` |
| fleet.json | `168ab6cfa14c797e83d932fadcd1da28e096d3c547d0f9a9799cfd3678279724` |
| replay-PUMP-08.json | `51e2456168480ad24d6d137b6e9898f4f72de34799483ac24ff543c3bd30c80f` |
| replay-PUMP-09.json | `47c0a0d52816f1e7ca1407fe8af553d40db40d3c8509443a7b9d22e5340edfb3` |

## Remaining limits

Technical source disclosures, old historical research tables, raw identifiers and user-entered/preset source text retain their original wording. Some rare storage-error details and field-path suffixes also remain English (exact list in the Task017 handoff). This is a bilingual core demonstration, not a certified complete translation of every analytical source. Decimal points and explicit UTC are retained.

The previously exported presentation/PDF still documents Task015; this task changes the live demo, not those presentation artifacts. Screenshots and this review cover Task017. Engineering recommendations remain tentative and advisory; no diagnostic gain or installation benefit is created by translation or graphics.

## Status

Implementation and coordinator review complete. The initial partial translation was extended to the core Planner and Pump Detail workflow before acceptance of the implementation. **User visual acceptance and a timed rehearsal remain pending.**
