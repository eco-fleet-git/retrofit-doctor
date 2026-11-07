# Retrofit Doctor

An engineering assistant for reviewing pump warnings and deciding whether an additional measurement is worth installing. **Working local prototype on synthetic data; no hardware is built or controlled.**

The workflow connects an alert to its evidence, the measurements available on that pump, a proposed inspection or measurement, and an editable lifecycle-cost assessment. Keeping existing signals or deferring permanent instrumentation are valid outcomes.

## Run the demonstration

The committed browser bundle needs only Python's static server. No dataset download, model service, account, build step or analysis dependencies are needed to view it.

```bash
python3 -m http.server 8765 --bind 127.0.0.1 -d web
```

Open [Start / Fleet](http://127.0.0.1:8765/#/fleet), select English or Russian, then follow the primary PUMP-04 example into [the warning review](http://127.0.0.1:8765/#/diagnosis). Four recorded cases connect the hypothesis, visual evidence, installed measurements and next engineering check. Before/at-warning controls retain the evidence-time boundary. The [Task015 scientific review](docs/tasks/015-coordinator-review.md) documents the unchanged source bundle. For the preserved baseline workflow, open [PUMP-08 at the recorded alert](http://127.0.0.1:8765/#/pumps/PUMP-08?t=2025-09-10T12%3A38%3A00Z), then inspect [retrospective evidence](http://127.0.0.1:8765/#/evidence) and [the Retrofit Planner](http://127.0.0.1:8765/#/pumps/PUMP-08/retrofit). Drafts are stored in this browser, not sent to equipment or a server.

The interface supports English / Russian for jury presentation and rehearsal. The pitch remains English. Exact source identifiers and verbatim technical outputs retain their original wording. [Russian working notes](README.ru.md) preserve the earlier development context.

**Product workflow, 7 November:** the English/Russian interface now includes a collapsible site portfolio, a separately labelled 200-asset illustrative scenario, and [My systems](http://127.0.0.1:8765/#/systems). Add a site/system, equipment passport, acquisition-device configuration and measurement points; load a local CSV or an explicitly selected challenge example; then review data readiness and the next useful measurement. Online ingestion is configuration only. Local systems do not run the benchmark detector. See the [Task021 review](docs/tasks/021-coordinator-review.md) for verification and limits. User acceptance remains open; new video production is paused until interface approval, and the existing deck/PDF depicts an earlier version.

## What is demonstrated

- Twelve independent pumps with public equipment and sensor metadata. Site membership does not establish pipe connections or six paired circuits.
- Causal replay for two validation pumps: closed minute windows, an explicit observation clock, actual baseline alerts, source evidence and visible data gaps.
- Detector output separated from retrospective event labels, including wrong, unknown and missed diagnoses.
- A working Planner with measurement hypotheses, integration questions, local drafts, editable installed/lifecycle costs and an illustrative negative business case.
- Reviewed diagnostic experiments and sensor mask/restore evidence. The [engineering proposal](docs/engineering/DECISION_BRIEF.md) describes optional measurement points, mounting, cables/radio, local gateway/power and maintenance questions.
- An [English presentation and offline PDF](presentation/README.md), with explicit prototype and field-validation limits.

**Integration status, 7 November:** the light interface, interactive sensor schematic, reviewed experiment evidence and conditional physical proposal have passed [coordinator review](docs/tasks/006-coordinator-review.md). The fixed-model test export is complete: 23 prediction rows, valid schema and 42/42 registered prefix checks. [Release package](docs/release/README.md). **Test quality is unknown.** A pre-gate PUMP-10 process-memory read during a mutation test is [disclosed](docs/tasks/007-coordinator-review.md); no pristine untouched blind claim is made. Final user application feedback and a timed spoken rehearsal remain outstanding; the light visual direction is approved.

**Clarity iteration, 7 November:** the selected-alert card now separates the rule hypothesis, actual alert-minute measurements, uncertainty and the next engineering check. Exact source evidence, scores and per-channel details remain expandable. Selecting an older alert brings its explanation into view. [Review and limits](docs/tasks/009-coordinator-review.md); [60-second walkthrough](docs/tasks/009-handoff.md#60-second-demo-path). Detector and prediction artifacts are unchanged.

## Measured evidence

The new research comparison uses **Z995**, combining synchronized hydraulic evidence with UNKNOWN-only vibration refinement. Both components retain B1 alert times. On seven training pumps, correct fault types improved **8→10/26**, sensor type+channel **3→4/8**, with detection18/26 and false+repeat burden6 unchanged. On two previously inspected validation pumps, correct types improved **4→5/9**, with detection8/9 and burden1 unchanged. No earlier correct event was lost. The validation gain is from vibration only; the hydraulic gain has training-only support. [Training review](docs/tasks/013-coordinator-review.md), [descriptive validation review](docs/tasks/014-coordinator-review.md).

The preserved historical replay and frozen test export use **causal B1, k=6, persistence=15 minutes**, with a first-day empirical reference that is not certified healthy. Its original-versus-causal comparison remains:

| Synthetic validation, 9 events / 2 pumps | Causal B1 | Historical original B1 |
|---|---:|---:|
| Composite benchmark score | 76.01 | 78.01 |
| Events detected | 8/9 | 8/9 |
| Correct fault type | 4/9 | 4/9 |
| False alert episodes | 1 | 1 |

The lower causal score follows removal of early future-reference use. It is not an accuracy percentage. The comparison recorded 209 prefix checks and 18 regression tests. See [causality findings](CAUSAL_B1_FINDINGS.md) and [exact figures](results/causal_b1/comparison.csv).

Five new B2 candidates failed the registered training gates: more detections came with fewer correct types and more false/repeated alerts. The bounded sparse-sensor follow-up also retained B1. See [B2 findings](results/causal_b2/CAUSAL_B2_FINDINGS.md), [sparse-sensor findings](results/sparse_stuck_followup/FINDINGS.md) and [review](docs/tasks/008-coordinator-review.md).

Sensor mask/restore effects were mixed. On ten original train events, full inputs gave 9 detections and 2 correct types; removing vibration/temperature gave 8 and 0. Removing flow/power lost a detection but gained a correct type. Restoration reproduced the full-input features. These are information-ablation results for an unchanged detector, not hardware ROI. See [paired results and adverse cases](results/sensor_ablation/FINDINGS.md).

The proposed fleet reference has no channel supported by three eligible fit assets under the registered comparability rules. It remains a fixture-only prototype. The regime/abstention candidates also failed their gates; causal B1 was retained in that historical round. The seven initial hypotheses and subsequent combined-method results are summarized in [research outcomes](docs/experiments/RESULTS.md). See [the registered experiment and exposure log](docs/experiments/followup/2026-11-07-e3-e4-manifest.json).

## Limits that matter

All data are synthetic: seven training pumps, two previously inspected validation pumps, three test pumps. Validation is descriptive, not independent field evidence. The browser contains the full validation-week bundle and filters it by clock for display; this is not secure concealment of future data. Test assets are metadata-only in the UI.

The app is static batch replay, not a persistent edge service. Real arrival delays, restart recovery, installation quality, maintenance effort and field diagnostic performance have not been demonstrated. Confidence is a heuristic, not calibrated probability. Inherited B1 set iteration can change a diagnosis across Python hash seeds; reproducible inference requires the recorded environment and seed 0 at interpreter startup. The proposed measurement package is not certified or priced by a supplier. Controls, trips and interlocks are outside the assistant.

Planner economics use stated user assumptions, never synthetic recall converted to revenue. The included example gives EUR −2,200 annual net and EUR −15,500 over five years at zero discount; it is not a forecast for PUMP-08. [Planner review](docs/tasks/003-coordinator-review.md) lists remaining scope, including partial shared-cost allocation and provenance limitations.

## Reproduce the analysis separately

The viewing bundle is already in Git. For analytical reruns, restore the immutable organizer data as described in [NOTICE.md](NOTICE.md), then use the pinned dependencies. The recorded environment is macOS arm64, Python 3.13.16.

```bash
python3.13 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock.txt
PYTHONHASHSEED=0 .venv/bin/python -m pytest -q tests/test_causal_b1.py
PYTHONHASHSEED=0 .venv/bin/python scripts/run_b1.py
PYTHONHASHSEED=0 .venv/bin/python scripts/compare_causal_b1.py
```

The last two commands recreate their respective results directories; use a separate checkout to preserve reviewed evidence. The baseline loader restricts telemetry to train/validation. Hash-only integrity checks of the complete organizer bundle are disclosed separately from semantic data access. The [experiment protocol](docs/experiments/FROZEN_PROTOCOL.md) defines the final one-shot test-export gate.

## Project map

| Location | Contents |
|---|---|
| `web/` | Committed local UI and synthetic validation bundle |
| `src/retrofit_doctor/`, `scripts/`, `tests/` | Detectors, exporters, experiment runners and focused checks |
| `results/` | Recorded predictions, event matching, metrics and audits |
| `diagrams/` | Sensor inventory and explicitly conceptual cooling sketches |
| `docs/engineering/` | Measurement, integration and lifecycle-cost contracts |
| `docs/tasks/` | Claude implementation packets and coordinator reviews |
| `presentation/` | Pitch, local PDF fallback and jury Q&A |
| `vendor/benchmark/` | Unchanged organizer code/docs; large data restored locally |

Private repository: [eco-fleet-git/retrofit-doctor](https://github.com/eco-fleet-git/retrofit-doctor). Benchmark attribution, licensing and provenance: [NOTICE.md](NOTICE.md). No public deployment or competition submission is performed by this setup.
