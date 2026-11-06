# Task008 coordinator review

6 November 2026. The bounded sparse-stuck follow-up retains S0 (unchanged causal B1). Neither new variant meets the registered deployment gates. No follow-up validation run is warranted.

Before scoring, review clarified two S3 boundaries: reference samples cannot remain in the post-commissioning evidence chain, and a change of `g.regime` resets only the sparse stuck chain even while the steady flag stays true. Constructed regressions cover both; the code and manifest were frozen after these corrections and before benchmark scoring. Earlier B2 seals remain unchanged.

Codex independently ran 21 focused tests after the regime fix. The saved audit contains 486 cutpoints (162 each for S1/S2/S3), with zero prediction-prefix, evidence-prefix or future-mutation failures. All three variants produce identical structured-evidence hashes across four hash seeds. Sealed file hashes match. S0's entire 43-row prediction frame matches prior C0; S1's 75-row core prediction fields match prior C1 (experiment labels in evidence differ). The paired table retains all 26 original train events.

| Candidate | Detected / 26 | Correct type / 26 | Correct class / 26 | False + excess over 49 asset-days | Sensor type + channel / 8 |
|---|---:|---:|---:|---:|---:|
| S0 causal B1 | 18 | 8 | 14 | 6 | 3 |
| S1 prior C1 control | 21 | 7 | 14 | 21 | 4 |
| S2 disable sparse stuck | 17 | 8 | 14 | 11 | 3 |
| S3 commissioning repeats | 19 | 9 | 15 | 14 | 4 |

S3 improves type and channel counts but exceeds the burden limit by eight episodes. S2 also loses detection. Do not release either or tune another threshold inside this experiment. S3's 8 sparse-stuck alert rows include 6 outside real sparse-stuck event windows; these are alert-row counts, distinct from the official episode burden above. A lower count than S1 is a mechanism result, not sufficient deployment evidence.

E5 sensor-ablation findings remain tied to C0. Next step is the internal candidate-definition review for Task005, followed by its finite experiments and final UI integration.

Narrative review corrected “24 hours of steady running” to the first 24 wall-clock hours with steady samples, replaced an implied exact alert-subset reduction with a count comparison, and narrowed the claim about every possible sparse-stuck rule to the measured source-disable result. These are report wording corrections only; sealed code and outputs are unchanged.
