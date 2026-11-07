# Task011 handoff — phase 1 (isolated spread noise / UNKNOWN refinement), awaiting coordinator seal

2026-11-07. Claude Code. **No candidate has been scored.** No benchmark telemetry, snapshots or labels were read in this phase; only synthetic fixtures were run.

**Exposure.** Before implementing, I had seen the full Task010 train comparison and its per-event changes (`results/diagnosis_fusion/FINDINGS.md`). All Q/U thresholds come from the coordinator packet, and no raw channel values were inspected to set them.

Task010 is preserved unchanged: its sealed run, `FINDINGS.md` and phase-2 handoff section. All six of its candidates were negative and B1 is retained.

## Files (new only)

- `src/retrofit_doctor/noise_unresolved.py`: Q1/Q2/U1/U2. Task010's guards, waveform state and W1 rule are imported unchanged.
- `scripts/run_noise_unresolved.py`:
  - `selfcheck` mode.
  - `train` mode, which requires `results/noise_unresolved/SEAL.json` and refuses before any read on: unpinned seed, an existing `COMPLETED.json`, a missing or mismatched seal, or a code-hash change.
  - Provenance and raw predictions are written before scoring.
  - Each attempt writes a new run directory.
  - Determinism compares the main hash with a fresh seed-0 child process.
- `tests/test_noise_unresolved.py`: 31 synthetic tests, all passing in about 30 s (`PYTHONHASHSEED=0 ../../work/.venv/bin/python -m pytest -q tests/test_noise_unresolved.py`).
- `docs/experiments/followup/2026-11-07-noise-unresolved-manifest.json`: SHA-256 `4a365967643fd63fa2757e870cc78df5ba5d88cd491551dead014c08712acccc`. `selfcheck` reports the code matches it.

## Definitions (as registered; unchanged by review)

**Q1**
- Applies at every B1 alert except COMMUNICATION_LOSS or SENSOR_STUCK, which stay protected.
- Source channels: ps, pd, q, i, pw, bt, wt, tf.
- A source must be installed, with count ≥ 30, finite mean, std > 0, and spread z (`zs`) > 12.
- It needs at least 2 usable coupled channels from `B.COUPLED`. Usable means installed, count ≥ 30, finite mean, finite std ≥ 0 and finite spread z. Every usable coupled spread z must be ≤ 2 (signed). Coupled level deviations are ignored.
- Exactly one eligible source gives SENSOR / SENSOR_NOISE_SPIKES on that channel. Zero or several eligible sources give the exact B1 row.

**Q2:** Q1, plus finite and consistent min/max (min ≤ mean ≤ max, max > min), and max(|max − mean|, |min − mean|) / std ≥ 4.

**U1 / U2:** Q1 / Q2 first. If the Q rule abstains and B1 said UNKNOWN, the unchanged Task010 W1 rule may refine it. A specific B1 cause is never replaced by waveform evidence.

## Review round 1 (`011-review-round1.md`)

1. **Audit coverage:** the main causality audit now also mutates future std/min/max, for every candidate including U1/U2. The extra Q-only spread audit is kept. A runner fixture uses a spy to confirm the main audit applies the spread mutation, and checks that all audits pass.
2. **Negative std:** a negative coupled std is no longer a usable observation. Fixtures cover a negative coupled std (that channel drops out; with too few coupled channels left, the result falls back to B1) and a zero coupled std (valid and quiet).
3. **`rule_detail` fields:**
   - `evaluated_noise_rule` names the Q rule that was evaluated.
   - `emitted_source` (equal to `diagnosis_source`) names what produced the emitted row.
   - `noise_rule_outcome` is one of emitted, abstained_no_source or abstained_ambiguous.
   - When Q abstains and W1 or B1 emits, the evidence text describes only the emitting rule.
4. **Confidence:** a row re-labelled by Q or W1 keeps B1's confidence. That is B1's uncalibrated anomaly score for the alert, not a confidence for the newly named cause. This is stated in the manifest and in the module docstring.

## Fixture coverage

- **Fires:** isolated noisy channel with quiet coupled channels; a level deviation on another channel does not block it; lower coupled spread counts as quiet (no absolute value).
- **Falls back:** coupled variability; two isolated sources (ambiguous); source or coupled channel not installed, or with count 0 or 29.
- **Outlier ratio:** exactly 4.0 passes, 3.99 fails; missing or inconsistent min/max makes Q2 fall back; Q2 fires at ratios 4 and 5 but not 3.
- **Protected:** gateway alerts stay unchanged.
- **Override scope:** Q variants never use waveform evidence; U1 refines only UNKNOWN, Q1 takes precedence, and a specific B1 cause is kept even with a decisive waveform.
- **Causality and interface:** prefix replay and future mutation (means, std/min/max and snapshots) at alerts, reference boundaries, snapshot boundaries and a sub-minute cut; the inference interface has no label parameters; repeats are deterministic.
- **Runner:** pipeline and audit smoke test, selection order, and 5 refusal cases.

## Limits

- An isolated spread is consistent with instrument noise or spikes. It is not proof of a failed transmitter, since a fast real process fluctuation remains an alternative.
- All data is synthetic, and the train set has prior development exposure.
- Nothing is learned in this wave; there are seven independent replays.

## For the coordinator

Write `results/noise_unresolved/SEAL.json` with `{"manifest_sha256": "4a365967643fd63fa2757e870cc78df5ba5d88cd491551dead014c08712acccc"}`, then authorize `PYTHONHASHSEED=0 ../../work/.venv/bin/python scripts/run_noise_unresolved.py train`. Git is yours.
