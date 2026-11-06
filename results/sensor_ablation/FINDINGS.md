# E5/H7 sensor mask/restore — findings (Task004)

Date 2026-11-06. Implementer: Claude Code. All data synthetic. This measures how much the **fixed, sealed detector** depends on information from existing sensor groups. It is an information-availability ablation: no hardware was installed or removed, no field recall is established, no ROI, and nothing here says anything about PUMP-11.

## What was run

The Task002 seal (`causal-b2-v1-train-r2`) selected **C0**, so the detector is unchanged causal B1 (k=6, persistence=15, 24 h reference, PYTHONHASHSEED=0). There was no refitting, no threshold change and no group selection.

- **Assets:** train PUMP-02, PUMP-04 and PUMP-07 (10 observable events, 21 asset-days). One descriptive asset, PUMP-09 (5 observable events, 7 asset-days). The validation split was inspected before this experiment, so the PUMP-09 result is **descriptive, not independent validation**.
- **Branches:** full; mask-from-start for each of the 3 registered groups; restore for each group. The causal reference is recomputed from scratch in every branch. A mask drops every `<channel>__*` feature column and removes the channel from the working `channels_available`. Gateway `rows` are unchanged. Every group channel was installed on all four assets, so nothing had to be recorded as absent.
- **Columns the detector reads:** `asset_id`, `window_start_utc`, `rows`, `operating_mode`, `running_fraction`, and mean/std/count of the 13 B1 channels. C0 has no cross-channel derived residual. `quality_any`, min/max and `ambient_temp_c` are not read. This is proven by a test: dropping every other column leaves predictions unchanged.
- **Masked branch ignores masked data:** a counterfactual test changes masked source values drastically, and the masked predictions stay identical.
- **Masked z-scores in diagnosis:** this is the unchanged B1 behaviour. A masked channel's z-score is NaN and B1 diagnosis turns it into 0. That 0 is part of the fixed algorithm, not something added by the ablation.
- **Manifest:** saved before any branch result (`manifest.json`, saved 2026-11-06T22:40:28Z; train run finished 22:40:42Z, PUMP-09 22:40:54Z) with the groups, branches, event IDs, metric definitions and the hashes below. The runner refuses to start if any sealed hash changes, and the PUMP-09 run refuses without the train gate.

## Correctness gates

| Gate | Train | PUMP-09 |
|---|---|---|
| Restore equals full: times, categories and text exact; numbers within atol 1e-6, rtol 0 | 9/9 (3 groups × 3 assets) | 3/3 |
| Frozen causal-B1 prefix cutpoints for that asset; mask and restore branches; prefix run vs full-run past | 414/414 (23 cuts × 6 branches × 3 assets) | 138/138 |
| My evaluator's first-alert assignment equals the official `per_event` | asserted in every branch and scope | asserted |

The full branch is C0, which already has its own causal-B1 audit. This is a batch replay that assumes zero ingestion lag; there is no streaming or restart test.

## Pooled results (original denominator and windows; full − mask in brackets)

Train, 10 events:

| Branch | Detected | Class | Type | False+excess | Sensor type+channel | UNKNOWN first / alerts | Correct type ever | Composite |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| full | 9 | 7 | 2 | 6 | 0 | 1 / 2 | 4 | 61.5949 |
| mask vibration+temperature | 8 [+1] | 6 [+1] | 0 [+2] | 6 [0] | 0 | 1 / 2 | 2 [+2] | 53.4874 |
| mask suction | 9 [0] | 7 [0] | 2 [0] | 6 [0] | 0 | 1 / 2 | 4 [0] | 61.9646 |
| mask flow+power | 8 [+1] | 7 [0] | 3 [−1] | 5 [+1] | 0 | 2 / 3 | 4 [0] | 61.0015 |
| every restore | identical to full | | | | | | | 61.5949 |

PUMP-09 (descriptive), 5 events:

| Branch | Detected | Class | Type | False+excess | Sensor type+channel | UNKNOWN first / alerts | Correct type ever | Composite |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| full | 5 | 5 | 2 | 1 | 1 | 0 / 0 | 2 | 77.5039 |
| mask vibration+temperature | 4 [+1] | 4 [+1] | 1 [+1] | 1 [0] | 0 [+1] | 1 / 1 | 1 [+1] | 66.2857 |
| mask suction | 4 [+1] | 4 [+1] | 2 [0] | 1 [0] | 1 [0] | 0 / 0 | 2 [0] | 67.6857 |
| mask flow+power | 5 [0] | 4 [+1] | 2 [0] | 1 [0] | 1 [0] | 0 / 0 | 2 [0] | 75.4708 |

A positive bracket means the full branch is better. False+excess is reversed: a positive bracket means the mask had fewer false+excess episodes, i.e. the masked branch did better. Composite is shown, but it is not the claim.

## Paired event changes (from `*_paired_events.csv`)

**Vibration + bearing temperature** — label: **supported in pooled deltas, mixed per asset.**

- **Train:**
  - Lost when masked: PUMP-02-E01 BEARING_WEAR (full gives the correct type at 118.1 h; the mask misses it), PUMP-02-E02 MISALIGNMENT (full had UNKNOWN), PUMP-04-E01 IMBALANCE (the correct type becomes DISCHARGE_RESTRICTION) and PUMP-04-E02 (the later correct-type alert at 82.1 h is lost).
  - **Adverse:** PUMP-04-E04 DISCHARGE_RESTRICTION is detected *only* when vibration and temperature are masked (first alert UNKNOWN; correct type after 7.35 h).
  - Per-asset false+excess: PUMP-04 +1 when masked, PUMP-07 −1.
- **PUMP-09:**
  - PUMP-09-E04 is lost when masked (full had the wrong type, CALIBRATION_SHIFT).
  - PUMP-09-E03 SENSOR_STUCK becomes CALIBRATION_SHIFT, so its correct type and channel are lost.
  - PUMP-09-E01 changes from IMBALANCE (wrong) to UNKNOWN.

**Suction** — label: **mixed; no pooled effect on train.**

- **Train:** the counts are unchanged.
  - **Adverse:** with suction masked, PUMP-02-E01 BEARING_WEAR gets its first alert, already correctly typed, 36 h earlier (82.1 h vs 118.1 h). In the full branch, suction data delayed the correct diagnosis.
  - PUMP-02-E03 gets its first alert 8.3 h later when masked; its type is wrong in both branches.
- **PUMP-09:** PUMP-09-E06 AIR_ENTRAINMENT is missed when masked. The full branch detects it with the wrong type (SUCTION_STRAINER_CLOGGING) but the right class.

**Flow + power** — label: **mixed, with an adverse train effect.**

- **Train:**
  - **Adverse:** with flow and power present, PUMP-07-E02 SENSOR_CALIBRATION_SHIFT is first diagnosed as DISCHARGE_RESTRICTION. Masked, it gets the correct type, though its first alert comes 15.3 h later.
  - PUMP-07-E03 AIR_ENTRAINMENT (wrong type in full) is not detected when masked. The masked branch has one fewer false+excess episode on PUMP-07.
  - PUMP-04-E02's first label changes from DISCHARGE_RESTRICTION to UNKNOWN; the correct-type time is unchanged.
- **PUMP-09:**
  - PUMP-09-E02 DISCHARGE_RESTRICTION keeps its correct type with flow and power, and is found faster (0.36 h vs 1.06 h).
  - PUMP-09-E06's class changes from MACHINE (right) to SENSOR (wrong) when masked.

**Missed correct diagnoses** are always reported, never dropped:

- Train: full misses the correct type for 6 of 10 events; the vibration+temperature mask misses 8 of 10.
- PUMP-09: full misses 3 of 5; the vibration+temperature mask misses 4 of 5.

Delay medians are not used as a claim. Only events that reach the correct type have a delay, and those are few.

## H7 verdict

Within this synthetic benchmark and this fixed C0 detector, removing the existing vibration+bearing-temperature group lost detections and correct types on both train and PUMP-09, without changing pooled burden. This is the clearest measured information dependence, although one train event was only detected without it.

Suction and flow+power show no consistent benefit. Each has at least one event where its presence made C0's first diagnosis worse or later. **H7 overall: mixed.** It is supported for one group and unsupported or mixed for the other two. With 10 + 5 events, none of these deltas is a stable estimate. A group improving one event is not a generic benefit.

## Limits

- **Sensor type+channel** uses the documented Task002 C0 evidence-parsing rule: a single named channel is taken as the channel, and "missing rows" maps to GATEWAY. Machine evidence that names several channels gives no channel.
  - Train full has 0 sensor type+channel hits, so this metric carries little information there.
- **First correct-type delay** is the time from `detectable_utc` to the first alert, assigned by a replica of the official matching, whose fault type is correct. It does not require the sensor channel, so it is not the protocol's "useful diagnosis delay" (which, for SENSOR events, also requires the correct channel). It is not an official scorer metric.
- **Not covered:** waveform snapshots (not used by C0), retrained masked models (a separate experiment), the B2 candidates (not selected), and the test split (not read).

## Hashes (from `manifest.json`)

`src/retrofit_doctor/causal_b1.py` c637e0f8…, `vendor/.../baselines.py` 4bf291d6…, `vendor/.../scoring.py` 5293c2e4…, `results/causal_b2/selection.json` and `scripts/run_sensor_ablation.py`: full SHA-256 in `manifest.json` → `sealed_sha256`. Input hashes: `manifest.json` → `inputs_sha256`.
