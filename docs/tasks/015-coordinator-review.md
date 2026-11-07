# Task015 coordinator review — accepted

7 November 2026. Scope: the frozen Z995 train/validation comparison and its source-specific explanation view. The existing B1 replay and test release remain preserved. User visual acceptance and a timed spoken rehearsal remain pending.

## Evidence and implementation review

Reviewed exporter, explanation helper, view, routing/style diff, generated bundle and Claude's handoff. Independently reconciled all26 train and9 validation event rows to the scorecard: detected, correctly typed and correctly localized sensor events agree. Gains are exactly PUMP-02-E02, PUMP-04-E03 and PUMP-08-E02; no earlier correct type is lost. All19 read-source hashes match disk. Inference code, results, vendor data and original replay/fleet files have no changes in this task. Displayed W1 cutoffs were checked against the sealed Python constants.

Review corrections completed: per-event sources included in the provenance snapshot; asset split membership enforced; future waveform/raw-minute provenance rejected; per-case evaluation hidden before the alert; mobile chart legend/axis fit; route-specific exporter footer; human channel names in main recommendations; readable minute interval; UNKNOWN presented as unresolved cause; missing flow described as an input gap rather than a guarantee of applicability.

## Independent checks

- `node --test tests/web_comparison.test.mjs tests/web_replay.test.mjs tests/web_explain.test.mjs`: **42/42 passed**, actual exit0. Includes source hashes, boundaries, label isolation, future-provenance mutations and baseline replay/explanation regressions.
- Manual CUA in the served local app: all four cases, P04 before/at alert with opt-in labels, P08 at+1 day, P01 unchanged wrong diagnosis with separate label, technical disclosure via Enter, historical Evidence link/scope and corrected footer. At1440 and390 px, the content is readable; page width stays390 on mobile. The corrected graph shows the full right-hand time label and wrapping legend. No console errors/warnings reported.
- Inspected actual screenshots including the desktop full view/card and mobile chart. Claude separately reports all79 web tests and36/36 isolated-browser checks; reviewed the retained log/script, including baseline P08 and no test replay request. Those broader counts are implementer-run, not a second independent rerun.
- Claude's repeat exporter run is byte-identical. Stored P08/P09 replay/fleet hashes match their prior committed bytes. Release files were compared by hash only, without using test predictions for development.

## Interpretation and limits

The two training gains and one descriptive validation gain are shown with the unchanged burden and detection counts. P01's wrong diagnosis and all missed events remain visible. Validation was already inspected and its gain is waveform-only; there is no hydraulic validation gain. The narrow flow contribution margin, empirical first-day reference and old single-radial-axis vibration snapshots are explicit. No calibrated cause probability, hardware return or field performance is claimed.

The browser is a static replay/comparison over pre-exported evidence, not a live gateway or secure concealment of future data. Time controls hide the selected case until its alert; aggregate retrospective benchmark results are explicitly separate and not time-gated. Browser guards validate stated timestamp/boundary relationships, not arbitrary malformed statistics. Physics and waveform features come from the reviewed frozen experiments. The long mobile residual card is readable but could be condensed following user feedback.

Accept Task015 for local demonstration. The aligned eight-slide presentation and verified eight-page PDF were saved and the reviewed implementation was pushed privately at64cca3c. The diagnostic improvement goal is satisfied. Do not replace or re-export the frozen B1 test submission as part of this task.
