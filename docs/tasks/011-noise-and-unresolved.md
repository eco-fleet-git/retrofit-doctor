# Task011 — isolated spread evidence and refinement of unresolved causes

2026-11-07. New prospective adaptive wave, after Task010's unchecked scores rejected every candidate (correctness audit still running when this packet was written). Finish/preserve Task010 before starting implementation. Claude sole code writer; Codex protocol/review/Git. 45-minute slice. No user confirmation needed; continued research explicitly authorized.

## Motivation and exposure

The coordinator saw all Task010 train comparisons, changed first diagnoses, fold-support classes and waveform evidence at the already-known train bearing/misalignment/noise events. Task010 W1 correctly refined an UNKNOWN misalignment, but also displaced a simultaneous imbalance under official matching; its overall type count stayed 8 and class count fell. Learned classifiers often had only BEARING_WEAR, MISALIGNMENT and NORMAL supported, and lost other correct diagnoses. These outcomes remain preserved; no Task010 parameter/gate change or validation check.

Separate unresolved causal hypothesis: B1 chooses single-channel level deviations before assessing other channels' within-minute spread. A pressure/flow/electrical/temperature instrument with a uniquely excessive spread and stable coupled spreads may deserve a SENSOR_NOISE_SPIKES hypothesis even when an unrelated channel has a large slow level deviation. This is not proof of a bad transmitter: real fast process fluctuations remain an alternative. No new raw channel values were inspected to set the thresholds below.

## Exactly four new configurations plus B1

All retain unchanged B1 emission times, persistence and 12h refractory, first24h empirical reference, k6/persistence15, startup seed0. Gateway loss and SENSOR_STUCK remain protected. New modules/files only; keep Task010 sealed module/runner/results unchanged. Reuse its installed/observed guards and W1 waveform logic by import, not by editing it.

Q1 — unique isolated spread rule, otherwise exact B1:
- Candidate channels: B1 process/electrical/temperature keys ps,pd,q,i,pw,bt,wt,tf. Exclude vibration keys v,a,c (mechanical impacts can legitimately increase their spread), speed n and valve position vp (actuation changes are not instrument noise evidence).
- At the existing alert's closed minute, channel installed, count>=30, mean/std finite, std>0, causal spread z (`zs_key`) >12.
- Require >=2 distinct channels in the existing B.COUPLED[key] to be installed and currently observed (count>=30, finite mean/std and finite spread z). ALL usable coupled channels must have spread z<=2. A lower spread is not increased variability; do not take absolute value here. Coupled level deviations do not invalidate this specific spread test because simultaneous slow faults are possible.
- Exactly ONE eligible source channel -> SENSOR / SENSOR_NOISE_SPIKES, explicitly suspected_channel that channel. Zero or multiple -> exact B1. Keep B1 COMMUNICATION_LOSS/SENSOR_STUCK unchanged.
- Evidence lists observed minute mean/std/count, source spread z and the actual coupled channels/spread z, plus this rule's limits. Sensor failure unconfirmed; recommend checking raw signal/wiring/reference measurement under comparable operation.

Q2 — Q1 plus a within-minute outlier requirement:
- The same channel must have finite min/max consistent with min<=mean<=max and max>min.
- max(abs(max-mean),abs(min-mean))/std >=4.0, using that closed minute only. This is a descriptive extreme-to-spread ratio, not a calibrated probability or proof of electronic noise.

U1 — Q1 first; if it abstains AND B1 fault_type==UNKNOWN, apply the exact Task010 W1 waveform rule to refine the unresolved cause; otherwise exact B1.

U2 — Q2 first; the same UNKNOWN-only W1 refinement; otherwise exact B1.

No learned classifier in this wave. Seven independently replayed train assets; do not call it a learned leave-one-asset-out fit. W1's reference/age/speed thresholds remain unchanged (including max4h age and first24h reference). Do not add a new absolute-bearing, memory, deduplication or multiclass candidate inside this wave. No new thresholds after outcomes.

## Phase 1 before first score

Implement src/retrofit_doctor/noise_unresolved.py, scripts/run_noise_unresolved.py and focused tests. Write exact manifest docs/experiments/followup/2026-11-07-noise-unresolved-manifest.json. Candidate definitions above fixed; request internal coordinator decision if a required interface is genuinely ambiguous. No candidate benchmark scoring until code/manifest are reviewed and sealed.

Fixtures: isolated noisy process channel with >=2 coupled observations; true coupled variability -> fallback; two noisy sources -> ambiguous/fallback; missing/not-installed/count-zero/count<30 source or coupled channel; missing/inconsistent min/max; outlier ratio equality at4; no future minute/snapshot information; protected quality cases; U variants never replace a specific non-noise B1 cause with waveform; evidence channel does not use labels; emission equality to B1. Reuse meaningful causal checks instead of duplicating all Task010 signal-processing tests. Add mocked runner smoke and seal guard.

## Phase 2 gate (same success definition as Task010)

Train01..07 only, original26 observable events/49asset-days; official scorer unchanged. Control must equal saved causal B1:18 detected,8type,14class,3false+3excess,3sensor type+channel. Success: detected>=18, class>=14, burden<=6, sensor type+channel>=3, AND (type>=10 OR (type>=9 AND sensor type+channel>=4)). Select max useful diagnoses, then type, lower burden, then simpler candidate (Q1,Q2,U1,U2). Report all per-event/per-asset gains/losses, separate false/excess/nuisance, UNKNOWN and incorrect specific claims. Preserve negative variants.

Correctness: fixed emission asset/time multiset; semantic equality of control; prefix+future mutation at all alerts, commissioning boundaries and representative snapshot completion/age boundaries/random cuts; include full evidence and numeric detail. Main predictions must match a fresh seed0-process run. Freeze exact code/manifest/input projection identities before first score; preserve partial runs. No extra repeat beyond what a new failure requires.

No validation08/09 or test10..12 telemetry/labels/predictions in development. Shared static metadata can be parsed then train-filtered; shared benign table filtered to train. After a gate-passing result, stop for coordinator seal and one descriptive validation decision. No UI or release changes in this task. English artifacts, synthetic/development-informed disclaimer, original baseline retained until reviewed.

## Deliver

Prospective manifest, code/tests, results/noise_unresolved/{SEAL,run artifacts,comparison,causality,FINDINGS}, docs/tasks/011-handoff.md. Keep recommendations advisory and alternatives explicit. A passed synthetic rule is useful development evidence, not field confirmation or certification.
