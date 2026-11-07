# Task010 outcome review

2026-11-07. Run `results/diagnosis_fusion/run-20261107T083245565432Z`, manifest sealed before scoring in commit81ccd85. Runtime451.3s. No candidate selected; B1 retained. This is adaptive synthetic training evidence, not independent field validation.

| Candidate | Detected /26 | Correct type /26 | Correct class /26 | False + excess | Sensor type+channel /8 |
|---|---:|---:|---:|---:|---:|
| B1 |18|8|14|6|3|
| W1 |18|8|13|5|3|
| M1 |17|6|14|6|2|
| M2 |17|6|13|6|2|
| F1 |17|6|14|6|2|
| F2 |17|6|13|6|2|
| X1 |16|7|13|6|2|

Codex inspected the final comparison, per-event changes, fit provenance, waveform availability and run summary. Control equals the stored causal B1; every candidate has the same emitted asset/time multiset. All2744 prefix/future-mutation comparisons passed with full evidence, and two fresh seed0 processes matched the main prediction hashes. Thus correctness passed, but the scientific improvement gate failed for every new candidate. Validation/test were not used and the frozen release was not changed.

W1 refined one UNKNOWN misalignment correctly, but lost a previously correct imbalance under the official matching of overlapping faults; its lower burden did not compensate for reduced class accuracy. Broad learned overrides displaced correct diagnoses. Fold support is small: several folds can learn only bearing wear, misalignment and NORMAL; one fold has no fitted classifier. Waveform fusion did not change the learned candidates' aggregate outcomes. This does not show that vibration or learning is useless; it rejects these registered definitions on these data.

Task011 is a separately registered next wave. It tests isolated within-minute spread and UNKNOWN-only waveform refinement. The earlier gates and negative artifacts stay intact; no Task010 threshold change or descriptive-validation run is permitted to rescue this family.
