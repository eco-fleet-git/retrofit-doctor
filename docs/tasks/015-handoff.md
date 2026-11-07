# Task015 handoff — source-specific diagnosis comparison (`#/diagnosis`)

Implementation owner: Claude Code (sole code writer). Base: HEAD `d3ae0a2`. No Git operations, no detector/model change, no test telemetry or prediction access, no cloud or purchases. README / research registry / pitch docs are left to Codex as requested. No user visual acceptance is claimed. Coordinator CUA observations received during the session (footer, channel labels, minute format, UNKNOWN wording, P01 capability wording, mobile legend) are applied and re-checked below.

## Changed files

- `scripts/export_diagnosis_comparison.py` (new). It is read-only and re-scores nothing. It reads the sealed Task013 train run and the Task014 validation run:
  - B1/Z995 predictions, with SHA-256 asserted against each run's `run_provenance.json`;
  - SEAL/COMPLETED, checking that the selected candidate is Z995 and adoption passed;
  - `comparison.csv`, `per_event_B1/Z995.csv` (train) and `event_transitions.csv` (validation).

  It also reads the events labels for the four case event IDs only, `assets.csv` rows for the four case assets, and one train raw parquet day partition (PUMP-04 2025-06-18), from which it keeps only rows `22:05:00 <= t < 22:06:00`.

  Asserts:
  - Exactly 2 train and 3 validation changed alert outputs.
  - 26 train / 9 validation events.
  - Per-event and transition rows are inside their split's asset set.
  - The recomputed std(E) (unchanged Task013 `terms()`), mean and variance equal the stored `rule_detail` (to 1e-6, and 1e-5 for the variance).
  - `filesRead` is complete when it is written. Transitions are computed before the provenance snapshot, which fixes the review note.
- `web/data/diagnosis-comparison.json` (new, 58,064 bytes, sha256 `8ffff27f…ea567`). It holds provenance (runs, manifests, code hashes, 19 source-file hashes), train and validation scorecards, every changed alert, all 35 event transitions, and the four cases. Only one case carries raw rows: PUMP-04, 60 rows.
- `web/js/comparison.js` (new, pure, no DOM):
  - `sliceCase(case, clock)` is the only path to the explanation. Before the alert it returns no B1/Z995/raw/label fields; it only announces a snapshot that has already completed by the clock.
  - It enforces provenance through `evidenceIssue()`. A waveform completing after the alert, a stored age disagreeing with the timestamps, or a raw row outside the closed minute causes the whole case to be rejected, at every later clock as well.
  - `sliceCaseLabel()` returns nothing before the case's alert or before the label onset, and withholds a later end time.
  - `explainCase(slice, asset)` gives source-specific explanations for three kinds:
    - residual (E995): the headline uses the stored source channel;
    - waveform (W1): 1×/2× or BPFO evidence, snapshot age at the alert and at the clock, speed check and number of reference snapshots;
    - unsupported (B1 retained): names the exact missing input, says "not assessed ≠ healthy", and gives a planner link with capability-only wording.
- `web/js/diagnosis-view.js` (new):
  - Neutral case selector (asset · split · time) and clock controls: 1 s before alert, At alert, ±1 min, +1 h, +1 day. Case and clock are kept in the URL.
  - Gated card: B1 → Z995 boxes, then four steps. For the residual case it shows a measured-versus-calculated pressure-rise chart (HTML legend, wraps on mobile) and a stacked measured table on mobile.
  - Technical `<details>`, collapsed by default and again on each case switch. It holds the verbatim outputs, the equation, the full `rule_detail` and the assumptions.
  - Opt-in ground-truth panel and a retrospective scorecard. The scorecard leads with correct type and sensor type+channel, and its disclosure lists every changed alert and all 26+9 events.
  - Provenance disclosure and a route-specific footer.
- `web/js/app.js`: `#/diagnosis` route, render/bind wiring, route-specific footer, and the Evidence page scope note ("historical rounds up to Task008 … see the Diagnosis comparison").
- `web/js/experiments.js`: one scoping sentence plus a link.
- `web/index.html`: nav link "Diagnosis Comparison".
- `web/styles.css`: Task015 block.
- `tests/web_comparison.test.mjs` (new, 16 tests).
- `review/task015/browser-qa.mjs`, `browser-qa-result.txt` and 14 screenshots.

## Checks run (exact)

- `PYTHONHASHSEED=0 ../../work/.venv/bin/python scripts/export_diagnosis_comparison.py`: all asserts pass. A second export to the scratchpad is byte-identical (deterministic).
- `node --test tests/web_comparison.test.mjs`: 16/16 pass. The tests cover:
  - provenance hashes against the files on disk, including the per-event sources;
  - no PUMP-10..12 or test path in the bundle, and split membership;
  - baseline `replay-PUMP-08/09.json` and `fleet.json` hashes unchanged;
  - scorecard values;
  - raw minute boundary (no 22:06:00 row);
  - before-alert gating for all four cases;
  - stability at a later clock;
  - label mutation invariance and per-case label gating;
  - source-specific wording, including a mutated source channel;
  - waveform ages;
  - unsupported wording;
  - no probability or percentage framing;
  - three future-provenance mutation tests (snapshot after the alert, inconsistent age, raw row at minute end);
  - one test documenting the helper's limits.
- `node --test tests/*.mjs` (all web tests, including the Task009 explanation and replay tests): 79/79 pass.
- `web/data/replay-PUMP-08.json` `51e24561…`, `replay-PUMP-09.json` `47c0a0d5…`, `fleet.json` `168ab6cf…` match HEAD. The files in `results/release/` are byte-identical to the hashes taken at the start of Task009.
- Browser: `node review/task015/browser-qa.mjs "$PWD/review/task015"` gives **36/36 pass**. It ran system Chrome headless with fresh isolated contexts against `python3 -m http.server 8769 -d web`. Covered:
  - **Navigation and footer:** nav link; footer names `export_diagnosis_comparison.py` and 19 sources on `#/diagnosis`; Evidence keeps the `export_demo.py` footer.
  - **PUMP-04 at the alert:** headline, B1→Z995, measured table, spread/rank/share with "narrow" margin, chart labels, main next check says "flow".
  - **Technical details:** collapsed by default; Enter opens it.
  - **1 s before alert:** no result, chart or statistics, and the label is withheld.
  - **At alert:** label appears only in its own panel.
  - **+1 day:** same headline, and the age is stated; URL state checked.
  - **PUMP-02:** misalignment-consistent, 3 h 02 min 10 s, 2.7×, 2.48, alignment and axial/phase check.
  - **PUMP-08 +1 day:** "cause unresolved (UNKNOWN)" before box; bearing pattern; age at the alert 3 h 39 min 37 s and now 27 h 39 min 37 s; flow not installed ≠ healthy; disclosure collapsed after the case switch.
  - **PUMP-01:** missing-input wording, "suction pressure" in the next check, planner link.
  - **Scorecard and deep link:** scorecard numbers, 35 event rows with PUMP-08-E04 visible; deep link 1 s before PUMP-02 shows no interpretation, and the selector shows no diagnosis.
  - **Regressions:** Evidence scope note and link; baseline PUMP-08 12:38 card; no test replay request; no console errors.
  - **390 px:**
    - no overflow for all four cases;
    - legend inside the viewport, and all SVG text inside the 300 viewBox;
    - chart and measured table without horizontal scroll;
    - next check and its reason visible, technical details collapsed;
    - keyboard opens technical details without overflow.
- I looked at screenshots 02, 04, 06, 11, 12 and 13 myself.

## Known limits / not tested

- The browser helper enforces only completion-time and minute-boundary provenance. Other stored fields (statistics, features, shares) are trusted as exported. The exporter is what verifies the residual statistics against the raw minute; the W1 features are copied from the sealed predictions and are not recomputed from waveforms. A test documents this boundary.
- Python tests were not run, and there is no Python test for the exporter. Its assertions run at every export.
- At 390 px the PUMP-04 card is long (the stacked measured table plus the chart). It is readable and does not overflow, but it was not condensed further.
- W1 rule values shown in the UI (4, 2, 2, 0.5, 4 h) are transcribed from the sealed `diagnosis_fusion.py` constants for display only. The bundle does not carry them.
- The validation hydraulic note and the train-only status of noise localisation are written as fixed copy that follows Task014; they are not computed.
- No physical keyboard or screen-reader pass was done; keyboard actions were simulated with Playwright.
- The old task006/task009 QA scripts were not rerun. Task015 QA includes one baseline pump-detail regression check.

## 60-second demo path

1. Open `#/diagnosis`. PUMP-04 at its alert: B1 said calibration shift on winding temperature, and Z995 says noise on flow. Read the headline, the measured table, the spread (7.3 vs 3.5 kPa, rank 1/1432), the narrow 0.013 share margin and the chart (measured vs calculated). The next check is synchronized traces plus an independent flow instrument.
2. Click "1 s before alert": nothing is interpreted yet. Tick the ground-truth box: it is withheld. Click "At alert": the explanation and, separately, the label appear.
3. PUMP-02, then PUMP-08 and "+1 day": an older radial snapshot is consistent with misalignment / bearing wear. The age at the alert stays fixed while the age now grows; it is not confirmed.
4. PUMP-01: flow is not installed, so B1 is kept. "Not assessed" is not healthy, and the planner link is a capability argument only.
5. Scroll to the retrospective comparison. Train correct type goes 8→10 and sensor type+channel 3→4; validation correct type goes 4→5 from W1 only. Expand the disclosure for every event.
