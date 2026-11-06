# Three-minute presentation script

Eight-slide alternative to the live demo, not an additional three minutes to append to it. English narration. Timing is a rehearsal target. Pause for questions after the final slide; the longer answers are in `JURY_QA.md`.

| Time | Slide | Suggested narration |
|---|---|---|
| 0:00–0:20 | Retrofit Doctor | “A pump warning should help an engineer decide what to inspect and whether another measurement is worth installing. Retrofit Doctor connects the warning, its evidence and that engineering decision. This is a working software demonstration; we have not built a physical device.” |
| 0:20–0:35 | Twelve independent pumps | “The data are synthetic: seven training pumps, two validation pumps and three blind test pumps. Instrumentation differs between assets. These are independent pumps, not six cooling circuits. Public metadata tells us which signals exist.” |
| 0:35–0:58 | Diagnostic evidence and limits | “Here is a correctly identified suction-strainer event. But bearing wear received an unknown cause, and pressure-sensor noise was missed. We keep these failures visible. The detector's evidence and the retrospective labels are separate; one pressure reading does not measure loss across a strainer.” |
| 0:58–1:22 | Causal baseline validation | “We removed future-reference use. The composite score fell from 78.01 to 76.01; both versions detected eight of nine events and named four types correctly. This is not field accuracy. Nine bounded candidates failed to justify replacement, so the configured causal baseline remains. Its environment and seed must be pinned.” |
| 1:22–1:45 | Sensor ablation | “We measured information sensitivity by hiding and restoring existing sensor groups. Across ten train events, removing vibration and temperature reduced detections from nine to eight and correct types from two to zero. Other changes helped some cases and harmed others. This is useful evidence, but it does not prove installation benefit or savings.” |
| 1:45–2:08 | Proposed measurement package | “Where a mechanical-condition point is missing, one proposal is a bearing-housing sensor, a surveyed cable or radio link, local gateway and engineering display. Mounting, power, environment and service ownership still need decisions. Existing signals or a temporary measurement route may be sufficient. Equipment controls remain independent.” |
| 2:08–2:35 | Retrofit economics | “The Planner includes integration, upkeep and nuisance checks. In this editable example, annual benefit is 300 euros, nuisance work is 1,800 and upkeep is 700. That means minus 2,200 euros annually, before installation. The right decision under those assumptions is to defer permanent retrofit. These are illustrative inputs, not a customer forecast.” |
| 2:35–3:00 | Pilot pathway | “The next step is one asset and one named maintenance decision. Observe existing data, review warnings against inspections, and trial the smallest measurement that resolves an important gap. Measure useful lead time, missed cases, nuisance work and actual service effort. Deployment depends on that evidence and the engineering review.” |

## Demonstration and question boundaries

- A saved Planner draft is an assessment, not purchase or deployment approval.
- A proposed field gateway is not the static replay application already running on the laptop.
- Extra sensors do not create a guaranteed diagnosis; no sensor package is recommended solely from a tier label.
- The retained detector's scores and the optional-hardware hypothesis are separate claims.
- Blind prediction export, once verified in the release checklist, can be described as exported with quality unknown. Do not infer test quality without organizer scoring.

Sources for narration: `deck-content.json`, `docs/experiments/RESULTS.md`, `results/sensor_ablation/FINDINGS.md`, `docs/engineering/COST_MODEL_SPEC.md` and the coordinator reviews. The cover screenshot is refreshed after final UI review; its exact build is recorded in the release package.
