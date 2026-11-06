# E3/E4 follow-up — proposed definitions, revision 2 (2026-11-07; not frozen, not scored)

Machine-readable contract: [`2026-11-07-e3-e4-manifest.json`](2026-11-07-e3-e4-manifest.json). Code: `src/retrofit_doctor/regime_reference.py`. Fixtures: `tests/test_regime_reference.py`. Review: `docs/tasks/005-review-round1.md`. All data is synthetic.

## Control

The control is R0: unchanged causal B1. It is the released detector, and it is identical to Task002's selected C0 and Task008's S0. C1 was not used as the base because its per-source persistence already fails the burden gate (Task008).

## E3 — will be scored in phase 2 after review

**R1 (H2): does nuisance come from normal speed changes?**

- **Unsupported regimes:** a regime bin with fewer than 60 steady commissioning minutes has its z-scores withheld. The status is INSUFFICIENT_REGIME_SUPPORT, which is reported as lost coverage, never as healthy.
- **Transitions:** after a change of regime bin, the amplitude (z) flag is held off for 10 minutes. 10 minutes is B1's existing start-up settling constant, not a tuned value.
- **Unchanged:** stuck/flatline checks and diagnosis keep B1's original steadiness; this was review item 1.
- **Shared persistence counter:** B1 keeps one run counter, so during a transition only a gap or flatline keeps a run alive.

**R2 (H6): does abstaining remove wrong specific causes?**

- **When it abstains:** in the two cases identified by the audit. One is a single-instrument claim backed by fewer than 2 coupled channels; the other is a machine rule that fired only because B1 treats missing values as 0.
- **What stays the same:** anomaly-alert coverage matches R0 (same alert times and classes).
- **What changes:** specific-diagnosis coverage goes down with every abstention, and it is reported separately.
- **Fair comparison:** R0 is also run with the same number of its lowest-confidence specific diagnoses turned into UNKNOWN, so both are compared at equal specific coverage.
- **No credit for UNKNOWN:** an UNKNOWN never earns type or type+channel credit from its stored original type.
- **Can't add correct types:** R2 can only keep or lose correct types, so it passes the type gate only if every abstention replaced a wrong type.

**Correctness gate.**

- R0 must equal the causal-B1 train report exactly.
- R1 and R2 must pass the 162 stored train cutpoints, both as prefix replay and under drastic future-value mutation.
- Four hash seeds (0/1/7/9) must give identical outputs. R1 and R2 inherit B1's set-order diagnosis, so if the seeds disagree, the check is recorded as failed and the candidate is rejected; the gate is not weakened afterwards.

## E4 — option A: H3 not testable here

The label-clean, near-rated, nameplate-normalised fleet prior has **zero support in every LOAO fold**. That holds both before and after the review-round-1 input corrections; both feasibility files are preserved.

| Asset | Why it can't contribute |
|---|---|
| PUMP-01, PUMP-02, PUMP-07 (VFD) | Run at 0.50–0.62 of rated speed |
| PUMP-03, PUMP-05 (fixed speed), PUMP-04 | No label-free minutes |
| PUMP-06 | No speed channel |

No replacement definition is registered and no threshold is loosened. P1 and P2 stay as fixture-tested prototypes so their code and claims are honest:

- **Pressure excluded:** discharge pressure is out of the prior, because pressure divided by design head is not pump head.
- **Tentative quantities:** the remaining ratios are tentative statistical transfer quantities, not physical performance residuals and not health certification.
- **Input validity:** inputs must be installed per metadata, actually observed in the minute, and have a valid nameplate scale.
- **Provenance:** alerts state their actual reference: a fleet-prior ID with its fit assets and quantities and their units, or the asset's own commissioning reference.

## Known limits

- **Regime needs speed:** assets without a speed channel are a single regime bin, so R1 never sees a transition there.
- **R1 can hide faults:** R1 can hide a real fault in an unsupported regime; a fixture shows this.
- **Healthy duty point:** a nameplate prior cannot tell a healthy pump's own duty point from a contaminated reference; a fixture shows this.
- **Exposure:** train outcomes are already known to the implementer and validation has been inspected. Results will be development-informed and descriptive.
