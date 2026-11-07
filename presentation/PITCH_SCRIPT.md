# Three-minute presentation script

Eight-slide alternative to the live demo, not an additional three minutes to append to it. English narration. Timing is a rehearsal target. Pause for questions after the final slide; the longer answers are in `JURY_QA.md`.

| Time | Slide | Suggested narration |
|---|---|---|
| 0:00–0:20 | Retrofit Doctor | “A pump warning should help an engineer decide what to inspect and whether another measurement is worth installing. Retrofit Doctor connects the warning, its evidence and that engineering decision. This is a working software demonstration; we have not built a physical device.” |
| 0:20–0:35 | Twelve independent pumps | “The data are synthetic: seven training pumps, two validation pumps and three test pumps. Instrumentation differs between assets. These are independent pumps, not six cooling circuits. Public metadata tells us which signals exist.” |
| 0:35–0:58 | Diagnostic gains and a remaining error | “The combined method corrects a flow-sensor diagnosis on training data and identifies bearing wear from an older vibration snapshot on validation data. These are hypotheses with visible evidence. We also retain a wrong suction-pressure diagnosis: without flow, the hydraulic check cannot resolve it.” |
| 0:58–1:22 | Diagnosis improved on training data | “On twenty-six training events, correct causes rise from eight to ten, with no extra false or repeated alerts and no loss of earlier correct diagnoses. Previously inspected validation improves from four to five of nine, through vibration alone. These are small synthetic, development-informed results. Independent evidence is still needed.” |
| 1:22–1:45 | Sensor ablation | “We measured information sensitivity by hiding and restoring existing sensor groups. Across ten train events, removing vibration and temperature reduced detections from nine to eight and correct types from two to zero. Other changes helped some cases and harmed others. This is useful evidence, but it does not prove installation benefit or savings.” |
| 1:45–2:08 | Proposed retrofit architecture | “Reuse existing pressure, flow and drive signals first. Where a useful measurement is absent, trial targeted flow or housing vibration and temperature. A proposed gateway timestamps and buffers read-only data for the engineering display. Mapping, mounting, power and service ownership still need verification. Equipment controls remain independent.” |
| 2:08–2:35 | Retrofit economics | “The Planner includes integration, upkeep and nuisance checks. In this editable example, annual benefit is 300 euros, nuisance work is 1,800 and upkeep is 700. That means minus 2,200 euros annually, before installation. The right decision under those assumptions is to defer permanent retrofit. These are illustrative inputs, not a customer forecast.” |
| 2:35–3:00 | Pilot pathway | “The next step is one asset and one named maintenance decision. Observe existing data, review warnings against inspections, and trial the smallest measurement that resolves an important gap. Measure useful lead time, missed cases, nuisance work and actual service effort. Deployment depends on that evidence and the engineering review.” |

## Demonstration and question boundaries

- A saved Planner draft is an assessment, not purchase or deployment approval.
- A proposed field gateway is not the static replay application already running on the laptop.
- Extra sensors do not create a guaranteed diagnosis; no sensor package is recommended solely from a tier label.
- The new method's measured gains and the optional-hardware hypothesis are separate claims. Sensor ablation uses unchanged B1, not the new method.
- The already frozen test export still uses causal B1, with quality unknown. The Z995 research comparison does not silently replace that release. Do not infer test quality without organizer scoring.

Sources for narration: `deck-content.json`, `docs/experiments/RESULTS.md`, `results/sensor_ablation/FINDINGS.md`, `docs/engineering/COST_MODEL_SPEC.md` and the coordinator reviews. The cover screenshot is refreshed after final UI review; its exact build is recorded in the release package.

Release disclosure for Q&A: the fixed-model test CSV contains 23 rows and passed 42 prefix checks; diagnostic quality is unknown. A pre-gate PUMP-10 read into a mutation-test process is disclosed in `../docs/tasks/007-coordinator-review.md`. Do not call this a pristine untouched blind evaluation.
