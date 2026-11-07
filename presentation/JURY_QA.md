# Jury questions — evidence-backed answers

7 November 2026. English speaking notes. Selected research method: Z995; preserved replay and frozen test release: causal B1. Sources are repository-relative for rehearsal; they are not claims of an external deployment.

## What is Retrofit Doctor?

An engineer's workflow from a pump warning to its evidence and the next inspection or measurement decision. The proposed retrofit combines existing signals with a targeted additional measurement only when that measurement can resolve an important uncertainty. The demo uses synthetic replay; no physical device is built.

Source: CHALLENGE_BRIEF.md in vendor/benchmark; docs/PROJECT_PLAN.md; engineering/DECISION_BRIEF.md.

## Does the challenge require new hardware?

The supplied brief asks for an operator-assist layer using existing or low-cost sensor data, with a working prototype, repository, demo or presentation, baseline comparison and limitations. It prohibits hardware writes and production control. We therefore demonstrate the software and justify a proposed measurement/integration path. Physical feasibility still needs a site survey and pilot.

Do not call Elomatic the data owner: the supplied brief names Business Turku as challenge owner, Elomatic as invited technical sparring partner, and the dataset as organizer-supplied synthetic data. Source: vendor/benchmark/CHALLENGE_BRIEF.md, sections 2–7.

## What is working today?

The new Diagnosis Comparison shows frozen Z995 versus B1, with four source-specific cases, before/at-alert controls, waveform age, a measured-versus-derived hydraulic chart and separate evaluation labels. Training correct types improve8→10/26 and descriptive validation4→5/9; detection and burden are unchanged. Task015 passed coordinator review. The preserved baseline slices include twelve assets from public metadata, time-bounded validation replay for PUMP-08/09, signal trends, actual baseline alerts, sensor coverage and retrospective evaluation. The Planner supports local draft decisions, editable lifecycle costs, source labels and a negative economics example. Sensor mask/restore experiments are complete and reviewed. An English presentation and offline PDF exist. The light interface, interactive sensor schematic and conditional physical package have passed coordinator review after two correction rounds. The task handoffs are the authoritative checklist.

Sources: docs/tasks/001-handoff.md; docs/tasks/003-coordinator-review.md; docs/tasks/004-coordinator-review.md; docs/tasks/006-coordinator-review.md; presentation/README.md. Final user application feedback remains pending.

## How do you prevent future information from improving the answer?

The detector waits for a fixed first-day commissioning reference and consumes only completed minute windows at an explicit observation clock. The UI shows only windows and alerts available by that clock. The reference is empirical and may already contain degradation; it is not certified healthy. Prefix checks compare independent truncated runs with the past of a full run. Late packet arrival and persistent edge restart behavior are not proven by this batch replay.

The historical original validation score is 78.01; causal B1 is 76.01. We retain the lower score because the early future-reference use was removed. Both detect 8/9 events and correctly name 4/9 fault types. Source: CAUSAL_B1_FINDINGS.md; results/causal_b1/verification.json.

## Is 76% the diagnostic accuracy?

No. 76.01 is the benchmark's composite score out of 100. It combines event F1, timeliness, fault-type recall, class recall and alert burden. The useful denominators are explicit: eight of nine events detected, four correctly typed, on two validation assets. This is a very small synthetic sample, not field accuracy or calibrated confidence.

Source: vendor/benchmark/BENCHMARK_RULES.md; results/causal_b1/report_causal_validation.json.

## Did the new diagnostic model improve the baseline?

Yes, within this small synthetic dataset. Frozen Z995 combines synchronized hydraulic-residual evidence with UNKNOWN-only vibration refinement while retaining B1 emission times. On26 train events /7 pumps /49asset-days, correct types improve8→10, correctly localized sensor faults3→4 of8, while detected18, class14 and false3+excess3 remain unchanged. No earlier correct event is lost. On9 previously inspected validation events /2 pumps /14asset-days, correct types improve4→5, detected8 and false1+excess0 remain unchanged, again without losing a previous correct event/channel.

The train gains are flow-sensor noise on PUMP-04 and misalignment on PUMP-02. Validation adds bearing wear on PUMP-08. The hydraulic component cannot run on either validation pump because required inputs are absent; the validation gain is waveform-only. Training was adaptively inspected, validation was already inspected, and all measurements are synthetic. This is not independent generalization or field accuracy. The flow contribution only narrowly exceeds the fixed threshold; commissioning references are empirical, not certified healthy. Older radial vibration snapshots support a hypothesis, not a confirmed current fault.

Twenty-three earlier candidate configurations failed their registered gates. Six new configurations were sealed before scoring; two passed and the prespecified ranking selected Z995. We preserved failures and did not tune on test data. Training passed2744 causal comparisons and30 raw aggregation checks; validation passed276 causal/evidence comparisons. A separately sealed audit-only recovery corrected a categorical test mutator after the scored train run failed; original predictions and scores were preserved. The fixed B1 test export remains unchanged.

Sources: results/synchronized_residual/FINDINGS.md; results/validation_z995/FINDINGS.md; docs/tasks/013-coordinator-review.md; docs/tasks/014-coordinator-review.md; docs/experiments/RESULTS.md.

## Where is the AI?

The new comparison uses auditable statistical normalization, a pump-equation residual with covariance attribution, and frequency/envelope features from completed vibration snapshots. Learned ExtraTrees candidates were tested with asset-separated fitting and rejected because they lost correct diagnoses. The product is not presented as a trained language model diagnosing equipment, and no generative model invents the live evidence. We use coding/design assistants in development. The combined rule method passed those diagnostic, causality and workload checks; its independent field usefulness remains unproven.

Sources: src/retrofit_doctor/synchronized_residual.py; results/diagnosis_fusion/FINDINGS.md; results/synchronized_residual/FINDINGS.md. Reproducibility requires the recorded Python/dependency environment and PYTHONHASHSEED=0 at startup: inherited set iteration can change fault types under other seeds. We do not claim seed invariance.

## Why would another sensor help?

It adds a different physical observation. Suction pressure can add inlet context; a vibration/temperature point can add mechanical-condition context; suitable flow, head and input-power measurements can support operating-point assessment. None uniquely identifies every cause. We tested information value by masking and restoring groups already present on richer synthetic assets while keeping the event denominator fixed. Across ten train events, retaining the vibration/temperature group gave 9 detections and 2 correct types; masking it gave 8 and 0. Effects were mixed: masking flow/power lost one detection but gained one correct type. A paired event was detected only when vibration/temperature was absent. Restoring each group reproduced the original feature frame. This is evidence about information sensitivity of the unchanged detector, not installation quality or a demonstrated return on real hardware.

Sources: docs/engineering/DECISION_BRIEF.md; results/sensor_ablation/FINDINGS.md; docs/tasks/004-coordinator-review.md. The separate PUMP-09 check was descriptive on previously inspected validation data. The reported delay here is correct-type delay, not necessarily correct sensor-channel diagnosis delay.

## Can another pump provide a healthy reference immediately?

Not from the proposed reference design on this train set. A check requiring comparable near-rated operation, label-screened fit windows and at least three eligible reference assets found no supported channel in any held-out fold. We keep this as an infeasible hypothesis under the stated design instead of relaxing the criteria. The implemented fleet-prior code is only a fixture prototype, not a demonstrated improvement. A real pilot would need representative verified reference observations and a defensible comparability model.

Sources: docs/experiments/followup/2026-11-07-e3-e4-manifest.json; results/regime_reference/prior_feasibility.json; docs/tasks/005-phase1-coordinator-review.md.

## Why not install the fullest sensor package everywhere?

Hardware is only part of cost. Access, isolation, fittings, cabling or radio coverage, power, timestamp/tag mapping, commissioning, maintenance and applicable approvals can dominate. Added instruments also introduce their own faults and service work. An existing signal or periodic handheld route may answer the maintenance question adequately. The Planner should be able to recommend deferring permanent instrumentation under the entered assumptions.

Source: docs/engineering/COST_MODEL_SPEC.md. No current supplier price or certified installation is claimed.

## What is the business case?

We do not translate synthetic recall directly into revenue. The reviewer enters incremental actionable events, avoidable consequences, full installed/lifecycle costs and nuisance workload relative to existing practice. The independent illustrative redundant-pump example produces EUR 300 annual benefit, EUR 1,800 nuisance cost and EUR 700 upkeep: EUR −2,200 annual net, plus EUR 4,500 initial cost. At zero discount, the five-year incremental value is EUR −15,500. Even removing nuisance checks leaves EUR −400 annually. These are editable assumptions, not a forecast for PUMP-08 or a supplier quote.

Source: docs/engineering/COST_MODEL_SPEC.md. Unknown fields stay unknown; favorable assumptions permit engineering review, not automatic approval.

## Is this safe or certified for a ship or factory?

No field safety or compliance claim is made. The proposed path is an approved existing-data export or restricted read interface, optional sensors and local advisory analysis. Controls, trips and interlocks remain independent. Real read-only enforcement, network load, power/mounting/environmental suitability, service access and site/class/flag requirements need assessment. A protocol name or a DMZ does not prove a one-way connection. The current demonstration is local replay, not a commissioned edge appliance.

Source: docs/engineering/DECISION_BRIEF.md and SOURCES_AND_UNKNOWNS.md. Do not quote a universal marine-retrofit exemption or claim that an individual approved transmitter certifies the whole system.

## What would a first customer pilot prove?

Start with one asset, one maintenance decision and a named owner. Record existing-data behavior in shadow mode, compare warnings with logs and inspections, then trial one measurement against an independent reference where it addresses a real blind spot. Measure useful lead time, missed/ambiguous cases, nuisance checks and actual installation/service effort. Agree stop criteria. Rare faults and seasonal regimes may require longer exposure; a short period without faults is not evidence of effectiveness.

Source: docs/engineering/DECISION_BRIEF.md. Four to eight weeks in the organizer material is a planning example, not guaranteed validation duration.

## What remains for submission and deployment?

The integrated demo, presentation, run instructions and limitations are prepared. The fixed-model test prediction CSV has been exported: 23 rows, no schema errors and 42 registered prefix checks passed. During preparation, a gate-removal mutation test read PUMP-10 rows into a pytest process before approval. The implementer reports no values were displayed or analysed, and no model selection followed; the incident is disclosed in docs/tasks/007-coordinator-review.md. We therefore do not claim a pristine untouched blind test. Test labels stay with organizers; without their scoring, test quality is unknown. Deployment additionally requires a real site design, measurement verification, operating procedures, support ownership and applicable independent approvals. A hackathon demonstration is not that deployment.

Source: vendor/benchmark/CHALLENGE_BRIEF.md; docs/experiments/FROZEN_PROTOCOL.md. The local release package is complete; no competition upload has been performed.
