# Diagnostic hypothesis outcomes

7 November 2026. Completed first bounded research round for this demo. All observations are synthetic and development-informed. Earlier validation was already inspected; failed candidates were not selected by validation. Causal B1 with fixed seed 0 remains selected.

| Hypothesis | Completed work | Result and implication |
|---|---|---|
| H1: distinguish machine and sensor causes | Five B2 quality/trajectory candidates | Not supported by this candidate family. Correct-type counts fell and false/repeated-alert burden grew. No replacement of B1. |
| H2: suppress regime-change nuisance | R1 support and transition gate | Not supported. Benign nuisance and burden unchanged; diagnostic coverage lost; paired timing effects mixed. Cross-seed correctness gate also failed. |
| H3: fleet prior / contaminated first-day reference | Registered prior feasibility and constructed fixtures | Not testable with this design: no channel has three eligible fit assets in any fold. No benchmark P1/P2 evaluation or warmup gain claimed. |
| H4: sparse instruments and stuck values | B2 quality states; bounded S2/S3 follow-up | Fixture contracts work, but neither follow-up passed train gates. S3 reduced sparse false stuck indications yet total burden stayed above control. Only one eligible real sparse stuck event. |
| H5: gateway/channel gaps | Causal-clock and separate gap-state fixtures, B2 evaluation | Fixture behavior supported; benchmark improvement inconclusive with one communication-loss event. No persistent edge restart validation. |
| H6: explicit UNKNOWN | R2 abstention and equal-specific-coverage offline comparator | Not supported here. It removed one correct first diagnosis; wrong specific diagnoses did not decrease. Anomaly coverage alone is not specific-diagnosis coverage. |
| H7: sensor information value | Full/mask/restore, three registered groups, original denominators | Mixed. Vibration/temperature improved aggregate train counts, but paired adverse cases remain. Flow/power effects include both gains and losses. No field ROI inference. |

Sources: [B2](../../results/causal_b2/CAUSAL_B2_FINDINGS.md), [sparse follow-up](../../results/sparse_stuck_followup/FINDINGS.md), [E3/E4](../../results/regime_reference/FINDINGS.md), [sensor ablation](../../results/sensor_ablation/FINDINGS.md). Detailed checks and limitations are in their coordinator reviews under `docs/tasks/`.

The table describes tested definitions, not all conceivable diagnostic methods. No post-result expansion is included in those historical experiment families. More complex methods require a new design and new independent evidence. A practical result of this project is a reviewed decision workflow that exposes insufficient evidence and costs, alongside the retained baseline.

## New adaptive research round — Task010 (pending)

After the completed round above, the user explicitly requested continued search and confirmed diagnostic accuracy and explanations as the priority. [Task010](../tasks/010-diagnosis-fusion.md) registers a separate prospective wave: retain B1 alarm emission times and compare minute-feature learning, completed vibration snapshots and their combination. Its candidate definitions and code must be frozen before scoring. This is adaptive development on the already inspected seven training assets, with actual leave-one-asset-out model fitting; it is not a new independent validation set. No improvement is claimed yet. Test data and frozen release predictions are excluded from further development. Historical failures and their gates remain unchanged.

## Reproducibility caveat

The four-seed E3 check found that inherited B1 set iteration can change fault types. All retained results use seed 0; the release must enforce that at interpreter startup with the recorded environment. R0 is a constrained baseline choice, not a seed-invariant improved detector. Ten failed E3 comparison rows were traced to null representations; the original failed gates remain recorded and no post-outcome selection rerun was performed.
