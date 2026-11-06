# Claude Code visual follow-up: Retrofit Doctor Task001

Claude Code is already implementing the functional UI under **Task001**. This package is its **visual follow-up**, not a new implementation assignment. Inspect the current Task001 build, reuse its framework, routes, adapters and state ownership, and apply targeted visual/interaction improvements. Coordinate any functional mismatch with main within Task001. The documentation author remains restricted to `docs/ux/` and has not created application code. Existing project authorization remains valid; this handoff adds no user-approval requirement.

## Copyable visual follow-up brief

```text
Continue your existing Retrofit Doctor Task001 implementation with this visual follow-up. Reuse the functional UI you are already building. Do not scaffold a second app, start a parallel implementation or replace working data adapters to match a mockup. Codex handles planning and verification. All UI and presentation content is English. Discuss progress in Russian. Internal timing and final-export coordination are in INTERNAL_COORDINATION.md.

Read repository README.md, B1_FINDINGS.md, CAUSAL_B1_FINDINGS.md, diagrams/README.md, and all docs/ux documents. Compare STATES_AND_ACCEPTANCE.md with Task001's current behavior. Resolve functional gaps through main within that task. Use the UX Pilot prompt pack as visual direction. Do not treat a generated design as authority to alter evidence or introduce new claims.

Refine the four Task001 destinations: Fleet Overview, Pump Detail, Retrofit Planner, Evidence & Validation. Focus on information hierarchy, readable evidence tables, data-mode labels, chart annotations, reference/freshness states, keyboard interaction and the three-minute demo flow. If the current implementation is not yet available, coordinate with main and prepare a visual change list instead of starting another application. Keep the build local and deterministic. No external publication, purchase, messages or device control is part of this follow-up.

Use a compact, readable engineering layout with tables, source evidence, UTC replay time and a persistent synthetic-data label. Twelve pumps are independent. Test pumps 10–12 are metadata-only. Validation pumps 08–09 may show labeled replay, with the label layer separate and off by default. Training pumps may show Replay not loaded until a causal source is connected. Do not invent a synchronized live plant view.

Default to existing causal B1 predictions and verified causal feature snapshots. Never use original B1 for operational replay. Original B1 appears only as the historical comparison with its future-data limitation. Replay must enforce completed-minute availability and per-asset as_of across data, charts, labels, counts, extrema and tooltips. No hidden test labels or test telemetry in the bundle or adapter. Do not retune the detector or change benchmark source code for this UI task.

Review and refine the reference, availability, diagnostic and draft states against STATES_AND_ACCEPTANCE.md. Reuse functional state handling already present in Task001. Keep sensor inventory separate from proposed additions. Preserve original alert text and confidence as source output. The confidence is uncalibrated. Present failed or unresolved diagnoses honestly. If a source is not connected, show the documented unavailable state and report the integration gap to main instead of synthesizing a measurement.

The planner creates local engineering-review drafts. It does not simulate sensor readings, recompute performance or assert approval. Every candidate records installation, integration, maintenance, certification-review questions and a validation hypothesis. Saving has a truthful local result and separate per-pump persistence. Nothing is sent externally.

Deliver targeted changes to the Task001 build, screenshots of the four views and important edge states, a concise change list, relevant acceptance evidence and known limitations. Run the three-minute script. Resolve P0 failures within Task001 with main. Reuse passing functional checks where the underlying code has not changed. Preserve source data, vendor code, metrics and historical outputs, and follow Task001's existing Git workflow.

The final one-shot blind export is already covered by project authorization. Its gate is freeze plus coordination with main, not separate user approval. This visual follow-up does not initiate that run or load test telemetry into the demo. Keep test labels inaccessible and never claim test accuracy from a label-free export.
```

## Read-only source map

Paths in this section are relative to the Retrofit Doctor repository root. These are source locations, not permission to overwrite them.

| Source | Usage |
|---|---|
| `vendor/benchmark/data/full/assets.csv` | All 12 public passports, split, channels, control mode and observation windows |
| `diagrams/sensor-inventory.csv` | Cadence summary; full channel count still comes from passport |
| `diagrams/README.md` | Placement and topology limitations |
| `diagrams/ship-cooling-concept.png`, `sensor-atlas.png` | Optional existing conceptual illustrations, preserving their caveats |
| `results/causal_b1/predictions_causal_validation.csv` | Exact causal alert rows for PUMP-08/09 |
| `results/causal_b1/predictions_causal_train.csv` | Optional train alert replay |
| `results/causal_b1/report_causal_validation.json` | Current nine-event retrospective evaluation |
| `results/causal_b1/event_comparison_validation.csv` | Original vs causal event timing/types |
| `results/causal_b1/comparison.csv` | Aggregate comparison with exact numerical values |
| `results/causal_b1/verification.json`, `causality_audit.csv`, `tests.xml`, `run_summary.json` | Recorded check scope and provenance; do not fabricate current test execution |
| `src/retrofit_doctor/causal_b1.py` | Existing causal feature API, to consume without changing diagnostic behavior |

The causal artifacts inspected when this specification was drafted contained predictions and reports, not a ready-made frontend feature-series contract. Check Task001's current adapter before assuming integration is missing. Reuse its verified causal source and read only permitted train/validation telemetry in the demo UI. Do not infer raw sample freshness from minute summaries. If integration is still deferred, retain the evidence-only fallback and report the gap to main. Do not change detector logic to match the UI.

## Visual follow-up order within Task001

1. **Inspect and map.** Review the current Task001 screens and existing acceptance evidence. Identify visual gaps and report functional mismatches to main. Keep one implementation and one owner per component.
2. **Core demo flow.** Refine Fleet → PUMP-08 at 2025-09-10 12:38 UTC → source alert → Planner draft → Evidence page. Make the mode, clock, evidence and next action immediately legible.
3. **Reference and signal display.** Refine units, missing-channel copy, 24-hour reference states, chart availability annotations and cadence/freshness presentation using Task001's actual source fields.
4. **Retrospective evidence.** Improve comparison and event-table readability, keeping detection and correct type separate, source provenance visible and wrong/missed diagnoses explicit.
5. **Draft workflow.** Refine candidate rationale, engineering questions and local save/error feedback. Keep existing coverage and metrics immutable when proposals change.
6. **Review pass.** Run the checks relevant to changed behavior, browser/keyboard checks and the three-minute rehearsal. Record remaining P0 gaps for Task001 and capture inspected screens.

Keep this follow-up focused on the existing UI. Authentication, a cloud database, streaming service, hardware integration, PDF generation, billing and algorithm redesign are outside this visual pass. Internal deadlines and iterations are recorded separately in `INTERNAL_COORDINATION.md`; they are not pitch content. Report a blocker to main with a specific gap and fallback.

## Demonstration checkpoints and exact content

| Checkpoint | Expected source output |
|---|---|
| PUMP-08, 2025-09-10 12:37 UTC | No visibility of the 12:38 strainer alert |
| PUMP-08, 2025-09-10 12:38 UTC | MACHINE / SUCTION_STRAINER_CLOGGING; confidence 0.5587501525878906; `B1 mode-aware z: suction_pressure_kpa z=-6.7`; `Inspect / clean suction strainer.` |
| PUMP-08, 2025-09-11 20:47 UTC | MACHINE / UNKNOWN; confidence 0.5298386917890457; `B1 mode-aware z: fluid_temp_c z=-6.4`; `Inspect pump.` |
| PUMP-08, 2025-09-13 00:07 UTC | SENSOR / COMMUNICATION_LOSS; confidence 0.05; `B1 mode-aware z: missing rows`; `Check gateway / network; data gap.` |
| PUMP-09, 2026-02-11 06:28 UTC | SENSOR / SENSOR_CALIBRATION_SHIFT; confidence 0.99; `B1 mode-aware z: vibration_rms_mm_s deviates alone (z=18.5)`; `Verify vibration_rms_mm_s against a reference gauge.` |

Source: `predictions_causal_validation.csv`. Preserve the original action wording even where imperfect. Add a separately labeled engineering note if needed; never silently repair the recorded baseline text. In retrospective evaluation, the PUMP-09 alert above matches current-sensor drift but points at vibration. This mismatch must remain visible.

The display uses readable names with exact codes in details. It must not convert `UNKNOWN` to bearing wear because an evaluation label exists. There is no source severity, active/resolved state or probability calibration. There is no source for physical measurements from an installed demonstrator.

## Existing implementation mapping

Map the visual changes onto Task001's existing components and state. Source parsing, replay projection and presentation should remain distinct. The conceptual areas are asset inventory, causal replay, retrospective evaluation, local drafts, mode/clock labels, channel/reference states and alert evidence. These are review categories, not instructions to create a parallel module tree or rename working components.

Do not put ground-truth events in the replay adapter's diagnosis input type. Chart data should be the result of the replay projection, not the full series hidden by CSS or a viewport range. Selection state must also obey the cutoff. Use bounded local assets and avoid network dependence in the timed walkthrough.

For browser export, sanitize values structurally, preserve units and nulls, and validate split/asset/time against source metadata. When using static snapshots, document which checkpoints are real and what times are selectable. Do not label a jump-only checkpoint viewer as continuous replay; either provide causal snapshots for the full selectable range or label its controls “Previous / Next checkpoint”. The supplied 12:37/12:38 boundary still needs two valid snapshots.

## Review evidence requested from Claude

Provide evidence in Task001's existing workspace and review flow, without overwriting this specification or unrelated files:

- The visual change list, existing start/build/check commands and relevant results. Explain any necessary dependency change or source transformation.
- A compact A01–A30 checklist: pass/fail/deferred, check method and evidence location. Reuse applicable unchanged Task001 evidence. P0 must pass for an unqualified completion claim.
- Four primary-screen screenshots at the inspected desktop viewport plus collecting-reference, insufficient-reference, blind-test metadata and source-error states. Fixture-driven screenshots must say Fixture in the evidence record.
- Targeted automated checks for split isolation, causal time cutoff, reference boundary, label separation and planner immutability. Include the actual test invocation and result. Avoid screenshots as the sole proof that hidden data was never loaded.
- A three-minute rehearsal result and disclosed fallback, if any. Do not claim that stored benchmark tests were rerun unless they were.
- Known limitations: trace integration, raw sample timestamps, train replay coverage, local persistence behavior, and any remaining P1 items.

Codex review should reject: fabricated values, label-driven predictions, test telemetry loaded into the demo UI, marketing health/accuracy claims, unsupported certification or ROI, changing observed coverage when proposing a sensor, shared clocks across independent assets, and hidden future-derived chart scales. The frozen final blind-export pipeline coordinated by main is distinct from this UI boundary.
