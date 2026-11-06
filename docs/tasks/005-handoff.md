# Task 005 handoff — phase 1 (definitions + fixtures), ready for coordinator review

Date 2026-11-07. Implementer: Claude Code (sole writer). Status: **phase 1 complete after review round 1; NOT frozen, NO benchmark candidate scored.** No Git, web, test-data or sealed-file changes. `causal_b2.py` is still `9976d47a…` and `causal_b1.py` is still `c637e0f8…`.

## Delivered

| File | Purpose |
|---|---|
| `docs/experiments/followup/2026-11-07-e3-e4-manifest.json` | Proposed contract, revision 2 (sha in the table below; status `PROPOSED_REVISION_2_…`) |
| `docs/experiments/followup/2026-11-07-e3-e4-explanation.md` | Readable rationale and limits |
| `src/retrofit_doctor/regime_reference.py` | R0/R1/R2, plus P1/P2 as fixture-only prototypes, on unchanged causal B1. Includes a B1 loop with hooks, whose parity with the vendor `b1_threshold` is tested, including the refractory |
| `tests/test_regime_reference.py` | 48 fixture tests |
| `scripts/run_regime_reference.py` | Phase-1 `feasibility` mode only. The phase-2 E3 modes will be added after review and frozen with the manifest |
| `results/regime_reference/` | `prior_feasibility.json` (v2), `prior_feasibility_v1_pre_review.json`, the two feasibility logs, `tests_phase1.log` |

## Review round 1: how each item was addressed (test-first; each new fixture failed before its fix)

1. **R1 vs the stuck path.**
   - R1 no longer overwrites `steady`. A separate `amplitude_steady` (B1 steady and not transition) gates only the z flag; the flatline/stuck flags and diagnosis keep B1's original steadiness.
   - New fixture: a sustained flat signal across a regime change gives the same SENSOR_STUCK alert as R0 (02:10).
   - Shared-counter behaviour is documented: a TRANSITION minute continues the B1 run only if a gap or flatline flag is set.
   - R0/P0 parity is preserved.
2. **Prior inputs.**
   - `observed()` requires the channel to be in `channels_available` and actually observed in the minute (count > 0, finite mean); the temperature rise needs both temperatures.
   - A nameplate scale that is missing, non-finite or ≤ 0 makes the input unsupported (NaN). It no longer raises KeyError.
   - New fixture covers metadata-only removal with retained values, a held value with zero count, and bad or missing scales.
3. **Discharge pressure** is removed from the prior; own-reference `z_pd` is untouched. The remaining ratios are labelled tentative statistical transfer quantities.
4. **Provenance.**
   - P1 alerts before 24 h: rule `fleet_prior_cold_start`. The evidence names the transformed quantities (for example `bearing_temp_c-fluid_temp_c`). The detail carries `prior_id`, fit assets, units, z, and prior median/scale.
   - After commissioning: the detail says `own_commissioning`.
   - P2: the detail carries `prior_id`, own minutes and median, and prior median/scale/z per quantity.
5. **Phase-2 rules** are registered in the manifest under `phase2_E3_evaluation`:
   - freeze before any held-out evaluation; original denominators;
   - useful delay (channel required) reported separately from first correct-type delay;
   - UNKNOWN/coverage trade-offs; pre-existing, 0–24 h and later strata;
   - the R1 coverage-matched comparison.

## Coordinator decisions applied

- **E4: option A.** H3 is recorded as not testable with this prior on this train set, and there is no E4 evaluation path. The feasibility check was re-run on the corrected inputs and still finds 0 supported channels in all 7 folds, with 0 eligible label-free minutes on every fit asset. The v1 result is kept. P1/P2 are fixture-only prototypes.
- **R2 coverage claim corrected.** Anomaly-alert coverage matches R0; specific-diagnosis coverage drops and is reported separately. A registered comparison relabels R0's lowest-confidence specific diagnoses as UNKNOWN to reach equal specific coverage. An UNKNOWN never gets type or channel credit from its stored alternative.
- **Four-seed gate kept.** If B1's inherited set-order behaviour makes seeds diverge, the check is recorded as failed and deployment is rejected.

## Verification

```
pytest -v -p no:cacheprovider tests/                            → 144 passed (48 in test_regime_reference.py)
scripts/run_regime_reference.py feasibility (v1, pre-review)     → 0/6 channels supported in 7/7 folds
scripts/run_regime_reference.py feasibility (v2, corrected)      → 0/5 channels supported in 7/7 folds
```

Mutation checks; each was caught and reverted:

| Mutation | Tests failing |
|---|---:|
| R1 without z withholding | 2 |
| R1 without transition | 1 |
| R2 with one coupled channel | 1 |
| Prior ignores labels | 1 |
| Refractory removed (after adding the 2-episode fixture) | 2 |
| R1 overwrites `steady` (the review defect) | 3 |
| Installed metadata ignored | 1 |
| Held values accepted | 1 |
| Bad nameplate scale accepted | 1 |
| P1 provenance mislabelled | 1 |

## Phase-1 hashes

| File | SHA-256 |
|---|---|
| `regime_reference.py` | `da5489f76360a97181ab78063beda0cabd17954c8a1b15753834ff73eb5a6619` |
| `test_regime_reference.py` | `37493709277aaf391e43b6a8284d04883a2b48d66afb8f90171a585e833649d7` |
| `run_regime_reference.py` | `43c184c09a3885a944be00bfb1ac2fe2409185170231a2b4aba895469745fcb7` (feasibility only) |
| `prior_feasibility.json` | `bb918132…` |
| `prior_feasibility_v1_pre_review.json` | `f5977bc8…` |

## Exposure disclosure

- **Phase-1 reads:** train telemetry and train labels of the fit assets, used only for the prior feasibility check. No candidate was run on a held-out asset.
- **Fixture-only so far:** no R1/R2 benchmark output exists yet.
- **Prior exposure:** train outcomes for B1, C0–C5 and S0–S3 were already known, and validation was inspected earlier. Results will be descriptive.

## Next (after coordinator approval)

1. Add the phase-2 E3 runner modes and freeze the manifest and code hashes.
2. Run the train evaluation of R0/R1/R2: correctness gate, metrics, strata, coverage comparisons.
3. Select under the gates. Validation runs only for a passing candidate.
4. Write findings and the final handoff.

P1/P2 are not scored.
