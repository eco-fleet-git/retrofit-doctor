# Task012 handoff — phase 1 (hydraulic consistency of within-minute variability), awaiting coordinator seal

2026-11-07. Claude Code. **No candidate has been scored.** No benchmark telemetry, snapshots or labels were read in this phase; only synthetic fixtures were run.

**Earlier waves are preserved unchanged.** Task011 has its sealed run, `results/noise_unresolved/FINDINGS.md` and its handoff phase-2 section. No gate passed there: U1/U2 reached type 9 but sensor type+channel stayed at 3.

**Exposure.** This is adaptive development on an inspected train set. All formulas, ranges and thresholds come from the packet.

## Files (new only)

- `src/retrofit_doctor/hydraulic_spread.py`: H3/H5/V3/V5. Task010's guards, waveform state and W1 rule are imported unchanged.
- `scripts/run_hydraulic_spread.py`:
  - `selfcheck` mode.
  - `train` mode, which needs `results/hydraulic_spread/SEAL.json` and refuses before any read on: unpinned seed, an existing `COMPLETED.json`, a missing or mismatched seal, or a code-hash change.
  - Provenance, raw predictions and `applicability_coverage.csv` are written before scoring.
  - Each attempt writes a new run directory, and a fresh-process determinism check runs.
- `tests/test_hydraulic_spread.py`: 39 synthetic tests, all passing in about 32 s (`PYTHONHASHSEED=0 ../../work/.venv/bin/python -m pytest -q tests/test_hydraulic_spread.py`).
- `docs/experiments/followup/2026-11-07-hydraulic-spread-manifest.json`: SHA-256 `2d2da3bc410a8e4566273a8ada536fd145d2809b6b5356e68fec50ef2abcb3a7`. `selfcheck` reports the code matches it.

## Rule (as registered)

**Applicability gates, in order.** The first failing gate becomes the explicit `unsupported_reason`, and the alert stays exact B1:
1. B1 type is not CAVITATION or AIR_ENTRAINMENT.
2. The passport fluid is water-like.
3. The passport values are valid, with H0 > Hb.
4. The alert falls at or after the end of the 24 h reference period.
5. The minute is steady and has no gap.
6. Q, Ps, Pd, n and T are all observed: installed, count ≥ 30, finite mean, finite std ≥ 0.
7. r is in [0.5, 1], q is in [0.3, 1.3], Q > 0 and Pd > Ps.
8. std(Q)/Q ≤ 0.2 and std(n)/n ≤ 0.05.
9. The curve head and observed head are both positive and agree within 20 %.
10. The NIST Antoine row is the first one containing TK; there is no extrapolation (gaps at 303–304 K and 333–334 K, nothing outside 273–373 K).
11. NPSHa_lower ≥ 1.5 × NPSH3.
12. aQ > 0.

**Budget per source**, in kPa or m³/h:
- Bphys is the registered sum of magnitudes, using aQ and an.
- The reference floor is the median std over steady first-24h minutes. Each minute must be observed (installed, count ≥ 30, finite mean, finite std ≥ 0), and at least 60 such minutes are needed. Otherwise the source is `reference_unsupported` and cannot be eligible.

**Decision.** A source is eligible when its spread z > 6 and its std/budget > factor (3 or 5). Exactly one eligible source gives SENSOR_NOISE_SPIKES on that channel; zero or several give exact B1.

**V3/V5.** On any hydraulic abstention, the unchanged W1 waveform rule may refine B1 UNKNOWN only.

**Assumptions** (not field measurements): rho = 1000 kg/m³, g = 9.80665 m/s², atmospheric pressure 101.325 kPa, pure-water vapor pressure, equal tap elevations, no velocity-head difference.

**Limits.** This is a physically informed inconsistency hypothesis, not proof of instrument failure. Transients, air, cavitation, a wrong curve and tap geometry remain alternatives. Rows the rule relabels keep B1's anomaly score as confidence, not a confidence in the new cause.

**Structural property.** With factor ≥ 1, two sources can never be eligible at once, because each source's budget includes the other's measured spread. Two noisy sources therefore abstain. The `abstained_ambiguous` branch is a defensive guard only.

## Review round 1 (`012-review-round1.md`)

1. **Reference floors:** they now require a finite source mean. Fixtures cover a retained std with a NaN mean (excluded, support drops to 59 of 60 minutes, so unsupported) and a missing mean column (0 minutes).
2. **Two noisy sources:** the fixture now shows the correct abstention (`abstained_no_source`, both ratios < 3, flow spread visible in the discharge-pressure budget, output equal to exact B1). The earlier test that forced the ambiguous branch with factor 0.01 was removed.
3. **Counts in the future mutation:** both the runner audit and the fixture now set future counts to 0, alongside means, std/min/max and snapshots, for all candidates. A runner fixture confirms the mutation runs in the main audit and that it covers V3/V5.

## Fixture coverage

- **Physics:**
  - kPa ↔ m conversion; curve passes through BEP and shutoff.
  - aQ and an match central finite differences at 3 operating points.
  - NIST known points (20 °C ≈ 2.34 kPa; 99.5 °C ≈ 99.5 kPa), the 30.5 °C gap, 100 °C above 373 K (unsupported), first-row choice in the 80 °C overlap, NPSH3 at BEP.
- **Reference support:** a minute ending exactly at reference end is included; non-steady, negative std, count 29, missing mean and not-installed minutes are excluded.
- **Fires:** source-only excess on Q, Pd and Ps each gives the corresponding channel.
- **Factors:** H5 abstains where H3 fires (ratio 3–5).
- **Abstains:**
  - Speed-explained discharge variation is not noise.
  - 12 unsupported cases, each with its reason and exact B1 output:
    - fluid, two passport cases, missing temperature;
    - speed count 29, speed ratio, flow ratio;
    - curve mismatch, vapor-pressure gap, low NPSH;
    - flow and speed relative std.
  - Also tested directly: reference incomplete, not steady, B1 cavitation or air entrainment, and a source without reference support.
- **Protected:** gateway alerts are unchanged.
- **V scope:** V refines only UNKNOWN; H takes precedence; specific B1 causes are kept; H never uses waveform evidence.
- **Causality:** prefix replay and future mutation (means, std/min/max, counts, snapshots) at alerts, reference boundaries, snapshot boundaries and a sub-minute cut, for all 5 candidates.
- **Interface:** no label parameters; emission equals B1.
- **Runner:** pipeline, audit and coverage smoke test; selection order; 5 refusal cases.

## For the coordinator

Write `results/hydraulic_spread/SEAL.json` with `{"manifest_sha256": "2d2da3bc410a8e4566273a8ada536fd145d2809b6b5356e68fec50ef2abcb3a7"}`, then authorize `PYTHONHASHSEED=0 ../../work/.venv/bin/python scripts/run_hydraulic_spread.py train`. Git is yours.

## Phase 2 (executed once under SEAL)

**Run:** `run-20261107T091714055594Z`, exit 0, 295 s.

**Correctness: all passed.**
- Control equality and expected metrics.
- Emission equal to the control.
- Causality: 0 failures in 392 checks per candidate (means, std, counts and snapshots mutated).
- Fresh-child determinism.

**Success gate: no candidate passed, so `selected = null`.**

| Candidate | Correct type | Correct class | Detected | False + excess | Sensor type+channel | Hydraulic overrides |
|---|---:|---:|---:|---:|---:|---:|
| H3 / H5 | 8 | 14 | 18 | 3 + 3 | 3 | 0 |
| V3 / V5 | 9 (PUMP-02-E02 via W1) | 14 | 18 | 3 + 3 | 3 | 0 |

**Applicability** at 43 alerts:
- 24 applicable, but no source eligible;
- 14 with no flow meter;
- 3 with a curve mismatch;
- 2 protected.

At the known PUMP-04 flow-noise alert, flow std/budget was 0.97, because pressure spreads divided by the small curve slope dominated the budget.

Details are in `results/hydraulic_spread/FINDINGS.md`. No validation, test, UI or release change, and no edits after scoring. B1 is retained.
