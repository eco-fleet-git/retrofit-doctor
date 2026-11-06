# Task008 sparse-stuck follow-up — findings

Date 2026-11-06. Implementer: Claude Code. All data synthetic; train only. **No deployable candidate passed the unchanged Task002 hard gates, so S0 (unchanged causal B1) is retained. The registered validation check was not run, as the protocol requires when no deployable candidate passes.** No test content was read.

## Registered candidates (manifest saved 2026-11-06, before any score)

| ID | Definition |
|---|---|
| **S0** | Unchanged causal B1: the released control, k=6, persistence=15. |
| **S1** | Unchanged Task002 C1, reimplemented as a variant loop. Its core fields reproduce the sealed `results/causal_b2/train_predictions_C1.csv` (parity check = True). It is a comparison control and cannot be selected. |
| **S2** | C1 with the sparse-stuck source disabled. Dense stuck, gateway, amplitude and variance are unchanged. |
| **S3** | C1 with a commissioning-repeat sparse-stuck rule (details below). |

The S3 rule:

- **Reference statistic:** for each sparse installed stuck-eligible channel, take the longest run of exactly equal independent samples among steady-running samples within the first 24 wall-clock hours. Reference samples are fresh, steady, non-gap samples; held values don't count.
- **Threshold:** max(3, longest reference run + 1), frozen when the 24 h reference closes.
- **Resets:** S3's sparse stuck chain resets when the threshold freezes, so only new post-commissioning samples count. It also resets on a gap, a stale channel, a non-steady minute, and any change of the B1 speed-ratio regime bin (`g.regime`) while the pump is steady, both during commissioning and after it.
- **Confirmation:** the existing 15-minute wall-clock persistence still applies.
- **Unsupported cases:** sparse stuck is unsupported before the freeze, or when there are fewer than 3 reference samples.
- **Equality:** exact. No resolution is assumed, and no quantile was tuned.

In the train data, only `bearing_temp_c` on the T1 assets PUMP-01 and PUMP-06 is a sparse stuck-eligible channel.

## Train results (7 independent held-out-asset replays, 26 events, 49 asset-days, official scorer)

| ID | Composite | Det. | Type | Class | False+excess | Sensor type+channel | Sparse stuck alerts (outside a real stuck event) | Gate failures |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| S0 | 59.20719120527966 | 18 | 8 | 14 | 6 (3+3) | 3 | 0 (0) | — control |
| S1 | 56.00452043409396 | 21 | 7 | 14 | 21 (11+10) | 4 | 24 (23) | type < 8, burden > 6, not selectable |
| S2 | 55.37542243325022 | 17 | 8 | 14 | 11 (4+7) | 3 | 0 (0) | detection < 18, burden > 6 |
| S3 | 58.62918796560097 | 19 | **9** | **15** | 14 (7+7) | **4** | 8 (6) | burden > 6 |

The gates are the Task002 ones, unchanged: detection ≥ 18, class ≥ 14, type ≥ 8, false+excess ≤ 6, and zero correctness failures. Selected: **S0** (fallback).

## Per-event changes against S0 (`train_paired_events.csv`)

**S3**

- **Gained:** PUMP-01-E04 SENSOR_STUCK `bearing_temp_c`, now with the correct type and channel; S0 misses it. PUMP-06-E05 CAVITATION is now detected as BEARING_WEAR (right class, wrong type).
- **Lost:** PUMP-03-E03 IMPELLER_WEAR, which S0 detected only as UNKNOWN.
- **Sparse false stuck:** 6 of S3's 8 sparse stuck alerts fall outside any real stuck event: 4 on PUMP-01 and 2 on PUMP-06. S1 had 23 such alerts. The commissioning rule reduced this count from 23 to 6, but did not eliminate it.

**S2**

- **Lost:** PUMP-03-E03.
- **Changed:** PUMP-06-E02 MISALIGNMENT moves from SENSOR_CALIBRATION_SHIFT to BEARING_WEAR (class now correct, type still wrong).
- **Real stuck event:** PUMP-01-E04 stays missed, as in S0. Turning off the source removes every false sparse stuck alert and also gives up the only real one. That trade-off stays visible here.

**Missed real sparse stuck events:** in S0 and S2, PUMP-01-E04. S3 and S1 catch it.

## Why the burden gate still fails

Sparse stuck is not the only source of extra false+excess episodes. S2, which has no sparse stuck alerts at all, still has 4 false episodes and 7 excess repeats, against S0's 3 and 3.

- **Extra false episodes:** one more unmatched SENSOR_CALIBRATION_SHIFT burst, on PUMP-01.
- **Extra repeats:** these come from C1's per-source persistence, where different channels confirm at different times. They appear in both S2 and S3:

| Event | S0 repeats | S2 / S3 repeats |
|---|---:|---:|
| PUMP-04-E02 | 4 | 7 |
| PUMP-07-E01 | 1 | 3 |
| PUMP-02-E01 | 0 | 1 |
| PUMP-02-E02 | 0 | 2 |

Disabling the sparse-stuck source alone was insufficient to meet the burden gate on this train set. Remaining burden comes from other C1 mechanisms. This does not prove that every possible sparse-stuck rule must fail: source priority and refractory interactions can also change other emitted alerts. Under this protocol, these findings do not authorize another variant.

## Correctness evidence

- **Causality:** 486/486 checks: S1/S2/S3 × the 162 stored causal-B1 train cutpoints. Each check compares prefix-replay predictions, prefix-replay evidence, and full-clock evidence after drastic future-value mutation of every numeric feature from the cut onward.
- **Determinism:** PYTHONHASHSEED 0/1/7/9 give identical evidence digests for S1/S2/S3.
- **Parity:** S0 equals the causal-B1 train report exactly; S1 reproduces the sealed C1 core fields.
- **Tests:** 96 Python tests pass, 21 of them new in `tests/test_sparse_stuck.py`. They cover:
  - S1 parity with the sealed C1 in four scenarios, and S2/S3 dense-only parity;
  - quantized repeats against a new freeze, with the exact boundary minute;
  - unsupported commissioning, and insufficient reference samples;
  - an equal run crossing the 24 h boundary, which counts only new samples;
  - reference runs broken by a non-steady minute or by a regime change while steady, and the post-commissioning count restarting after a stop or a regime change;
  - S2 dropping only the sparse source;
  - prefix and future-mutation boundaries.
- **Mutations caught:** removing the boundary reset breaks 2 tests; using threshold = longest run breaks 5. Both were reverted.
- **Evidence column:** `sparse_stuck_rule` records the channel, independent equal samples, required samples, reference sample count, reference longest run and freeze time.

## Limits

- **Contamination:** a freeze that begins during commissioning, or a long flat commissioning period, inflates the threshold and makes S3 insensitive. This is tested by fixture.
- **Narrow coverage:** only one real sparse stuck event exists in train, so S3's sensitivity is essentially a single observation. These are fixtures plus one synthetic benchmark; nothing here measures field performance.
- **Exact equality:** values are compared exactly, and transmitter resolution is unknown from public metadata.
- **Regime bins:** the regime is the B1 speed-ratio bin. Assets without a speed channel fall into regime 0, so there the regime reset never fires.
- **Batch replay only:** no streaming or restart test.
- **E5 sensor-ablation evidence (Task004)** remains tied to C0 (= S0), the detector it was measured on.
