# Task011 outcome review

2026-11-07. Run `results/noise_unresolved/run-20261107T084946436461Z`; prospective seal commitc19d676, manifest4a365967…acccc. Runtime304.7s. No candidate selected under the unchanged success gate; causal B1 remains the release.

Q1/Q2 were identical to B1:18detected,8correct type,14correct class,3false+3excess,3sensor type+channel. Neither noise rule emitted. U1/U2 each refined one UNKNOWN misalignment, reaching9correct types; all other principal counts stayed unchanged. This is a real incremental train gain, preserved as such, but it does not pass type>=10 or(type>=9 andsensorTC>=4). No gate weakening or validation run.

Codex inspected the comparison, per-alert Q detail and final run summary. All2046 causality comparisons passed (392per candidate plus43extra spread mutations each for Q1/Q2); control and emission identity passed; fresh seed0-process predictions matched. All31 focused fixtures had independently passed before scoring.

At the known flow-noise alert, Q1's source was above its spread threshold but several coupled channels also had increased spread. The rule therefore abstained as specified. The outcome does not establish whether that co-movement was controller reaction or actual process dynamics. Task012 prospectively investigates physical-unit variability propagation using the public pump curve, not post-outcome relaxation of Task011's thresholds. Historical artifacts remain unchanged; test and validation data remain excluded from development.
