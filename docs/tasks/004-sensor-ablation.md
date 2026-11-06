# Task 004 — measured value of existing sensor groups (Claude Code)

Registered 6 November 2026 before these mask/restore results. Execution follows Task003 handoff; one implementation writer, Codex owns Git. Timebox 45 minutes for the executable experiment, then preserve a handoff. Read AGENTS.md, docs/experiments/{HYPOTHESES,FROZEN_PROTOCOL}.md and protocol_v1.json. This task executes E5/H7, not a new detector search. Do not alter Task002 results or choose a model from ablation/validation results.

## Fixed experiment

- Model: the train-selected artifact in the reviewed Task002 seal. If no B2 candidate passes and the seal selects C0, use unchanged causal B1, k=6, persistence=15. Record exact code/config hashes before loading any new evaluation. Keep PYTHONHASHSEED=0.
- Train assets: PUMP-02, PUMP-04, PUMP-07. One descriptive validation asset: PUMP-09. Test telemetry/labels remain forbidden. The validation split has prior exposure; never call this independent validation.
- Fixed groups, exactly as protocol_v1.json: vibration_temperature = vibration_rms_mm_s, vibration_accel_rms_g, vibration_crest_factor, bearing_temp_c; suction = suction_pressure_kpa; flow_power = flow_m3_h, motor_power_kw.
- Branches: full, mask-from-start for each of the three groups, restore-original for each group. Recompute the causal reference from the beginning in every branch. Do not tune thresholds, select the best group, train on validation or fabricate any measurement. Full/control may be reused when its inputs and hash are identical. Mask means an information-availability intervention, not failed hardware or an injected communication fault.
- Before the first run, save the manifest of assets, groups, model hash, branches, immutable source hashes, original observable event IDs/denominators and metric definitions. Do not change these after results. Gate the PUMP-09 descriptive run on a saved manifest and successful restore equality on train.

## Mask correctness

Remove every feature column derived from masked channels and remove those channels from the working metadata passed to inference. Keep original assets/truth separately for evaluation. Recompute derived hydraulic/electrical residuals if the detector uses them; otherwise remove any derivative that encodes masked information. Prove this by enumerating consumed input columns and a focused counterfactual test where masked source values are changed drastically without changing masked predictions. Never overwrite vendor files. If a group contains a channel not originally installed, record the absence rather than pretending it was removed.

Restore must exactly reproduce full predictions, categorical evidence and timestamps; numeric evidence uses the existing audit tolerance (atol=1e-6, rtol=0). Failure invalidates the comparison. Run at least the existing registered frozen prefix cutpoints applicable to these assets for the selected detector and masked branch; full-clock diagnosis cannot access future samples. Report batch/replay limits honestly.

## Outcomes and reporting

Evaluate every branch with the same original observable event denominator and windows. Preserve the original event labels in the evaluator only. Do not mark a newly unobservable masked event excluded or silently drop it. Report full minus mask (and restore equality) for detected events, correct class, correct type, false+excess episodes, sensor type+channel where supported, unresolved/UNKNOWN output, and per-event first correct-type alert delay. Report missed correct diagnoses explicitly; a shorter median among fewer detections is not a gain. If the C0 adapter lacks explicit suspected_channel, document the deterministic evidence parsing rule and its limits before computing channel metrics, or mark that metric unsupported rather than inventing it.

Output one paired event table, one per-asset/group summary and one readable findings report in results/sensor_ablation/. Label supported, unsupported or mixed by the observed deltas; include adverse results. A sensor group is not generically beneficial because it improves one event. No hardware recommendation, field recall, ROI or PUMP-11 outcome is established by this experiment.

Write docs/tasks/004-handoff.md with executed commands, restore and causality results, source/config hashes and unresolved limits. Implementation scope: scripts/run_sensor_ablation.py, focused tests, experiment results and handoff. No web edits in this task; UI integration is a separate slice after evidence review. Do not change the sealed model, original benchmark, earlier reports or Git.
