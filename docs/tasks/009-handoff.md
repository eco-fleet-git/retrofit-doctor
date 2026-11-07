# Task009 handoff — diagnostic and evidence clarity

Implementation owner: Claude Code. Base: release `3a3db0c` (no Git operations performed). Scope: UI and explanation only. No detector, replay, bundle or results change. No test telemetry or prediction files read. No human or visual acceptance is claimed. Review rounds 1 and 2 (`009-review-round1.md`, `009-review-round2.md`) are applied.

## Changed files

- `web/js/explain.js` (new): pure `explainAlert(view, alert, asset)`. Its only inputs are the `sliceReplay()` view, the selected alert and the static passport asset; it never receives the full replay or evaluation labels. It reads values only at the alert's own minute (and earlier minutes for the "last earlier sample"). It returns `kind` (machine/unknown/sensor/stuck/gap), `headline`, `caveat`, `hypothesis`, `observations` (measured value and unit kept separate from derived z; source-named channels first), `gaps` (not-installed / no-sample / no-z / partial / no-rows / not-in-benchmark), `gapSummary` (categories and counts derived from `gaps`, nothing hardcoded per pump), `alternatives`, `nextCheck {text, reason, advisory}` and `technical` (verbatim evidence and recommendation, rule plus "which branch fired is not recorded", score text, exact score and formula). An alert outside the visible minutes or later than the as-of time returns `{available: false}`.
- `web/js/knowledge.js`: new plain-language fields `suggests`, `short` and `checkReason`. Each reason is worded as a "Proposed check … helps distinguish/assess". SENSOR_STUCK gains a cadence/update-interval alternative. The existing `rule`, `alternatives`, `check` and `discriminators` are unchanged.
- `web/js/app.js`: the pump page order is now clock bar → **selected-alert explanation** → alert history (a native `<details>`, closed by default) → status row → trend + retrospective-label panel → schematic → inventory. Desktop and mobile share the same DOM order, so keyboard order matches visual order. `diagnosisCard()` replaces `evidenceCard()`. Its default view has four steps: (1) one hypothesis statement plus a short caveat; (2) observed values plus a one-line reference caveat; (3) the alternatives as one line ("not ranked or evaluated") plus the gap summary; (4) the next check, its reason and the advisory note. A native `<details id="dx-tech">` holds the full rule interpretation, the z explanation, the full per-item gaps (with last earlier samples), the verbatim evidence and recommendation, the rule, the score (exact value and formula) and a table of all channels at the alert minute. Selecting a history alert moves focus to `#dx-h` (`tabindex=-1`) and scrolls it into view; ordinary replay updates do not move focus. The open/closed state of the history and technical disclosures survives re-renders. Also removed: the stray closing `</div>` and the now-unused `alertFeatures`/`knowledgeFor` imports. `alertFeatures` still exists in `replay.js`.
- `web/styles.css`: appended Task009 block (`.diag*`, `.step`, `.obs-list`, `.gap-list`, `details.history`).
- `web/README.md`: one structure line for `explain.js`.
- `tests/web_explain.test.mjs`: 19 tests. 9 were pre-written by the earlier context; 10 were added for review rounds 1–2 and boundaries.
- `review/task009/browser-qa.mjs`, `browser-qa-result.txt` and 13 screenshots.

## Checks run (exact)

- `node --test tests/web_explain.test.mjs tests/web_replay.test.mjs` → 26/26 pass.
- `node --test tests/*.mjs` (all web tests: explain, replay, cost model, planner, physical proposal) → 63/63 pass.
- SHA-256 of all 21 files in `web/data/` and `results/release/` was taken before and after: byte-identical.
- Browser: `node review/task009/browser-qa.mjs "$PWD/review/task009"` → **26/26 pass**. It ran system Chrome headless with fresh isolated contexts (no user profile, so drafts untouched) against `python3 -m http.server 8769 -d web`. Covered:
  - **PUMP-08 12:37:** no alert, and the page says "No alert does not prove the pump is healthy".
  - **PUMP-08 12:38:**
    - Headline: "Suction pressure below this pump's reference; the rule suggests a suction restriction, but the cause is unconfirmed."
    - Observations: 35.3067 kPa(g) shown separately from causal z −6.71.
    - Gaps: flow is not installed; 4 installed 5-min channels have no sample, which "does not establish normal behaviour"; strainer DP is not in the benchmark.
    - No "no vibration" or "rules out" text and no "%". The page says the reference is "not verified healthy".
    - The next check has its reason.
    - Explanation sits above history and history above the trend.
    - Technical details are closed by default and open with Enter.
    - Toggling labels leaves the explanation text unchanged.
    - No overflow.
  - **Older alert:** 12:38 selected at 2025-09-11 02:00 shows "13 h 22 min before the replay time" and its own value. Focus moves to the explanation heading, which is in view.
  - **UNKNOWN** (20:47), **gap** (00:07 communication loss, zero rows), **PUMP-09 calibration shift** (detector-attributed headline; no motor-current/SENSOR_DRIFT text above the disclosure).
  - **PUMP-12:** metadata only, no explanation card, no replay request.
  - **390 px:** order is explanation → history → trend → schematic → inventory; step 1 at 895 px; P08 card 1233 px tall (desktop 571 px); keyboard opens technical details; no overflow on P08, P09 or PUMP-12.
  - No console errors at either width.
- I looked at screenshots 03, 04, 05, 07, 08 and 11 myself.

## Coordinator review status

- Round 2 was visually accepted by the main Codex coordinator, as reported to Claude on 2026-11-07. Main reviewed the final 1440 and 390 images and exercised two things in the in-app browser:
  - opening the technical disclosure;
  - selecting the older alert, where focus landed on `#dx-h`, the card showed the "13 h 22 min" age and the original 35.3067 kPa(g) value.
- Main judged the final card heights of 571 px (desktop) and 1233 px (mobile) acceptable. This is the coordinator's review. It is not end-user acceptance.
- One narrow correctness fix was made after that acceptance, at the coordinator's request. For machine and UNKNOWN alerts, if the primary observation is measured but has no causal z, the headline used to fall back to "away from this pump's reference". That wording invented a deviation. The headline now says "reference comparison unavailable at the alert minute" and attributes the hypothesis to the detector's rule. Headlines that have a z are unchanged, including the accepted PUMP-08 12:38 headline. The existing no-z fixture now checks the new headline (both the missing-entry and missing-array variants).
- After that fix, `node --test tests/web_explain.test.mjs tests/web_replay.test.mjs` was rerun: 26/26 pass. The 26/26 browser checks and screenshots come from the run before the fix; they were not rerun because no bundled alert reaches the changed branch. No broader tests were rerun.

## Not tested / limitations

- No end-user visual review. The coordinator's review is recorded above.
- The partial-packet COMMUNICATION_LOSS wording is covered only by a unit fixture (an edited view). The bundle has no partial-packet alert, so the browser never shows it.
- The no-z ("reference comparison unavailable") state is covered by unit fixtures only; no bundled alert shows it in the browser.
- No browser check was run on PUMP-09 SENSOR_STUCK, noise-spike or discharge-restriction alerts (unit tests cover stuck).
- Physical keyboard/screen reader not used. Keyboard was simulated with Playwright `focus` + Enter.
- `review/task006/browser-qa.mjs` still targets the removed `#ev-h` evidence card and the old "Uncalibrated baseline score" text, so it will fail those checks. It was not rerun. Task009's script supersedes those checks.
- If a named sparse channel has no sample at the alert minute, the card says "no sample in this minute" for it. No bundled alert is known to trigger this. (An earlier draft of this handoff wrongly gave the 2025-09-14 04:09 UNKNOWN as an example; the coordinator checked the bundle and crest factor is present there: 6.93, z 13.94.)
- The "Also deviating · not named" observations use |z| ≥ 3 at the same minute (machine/UNKNOWN only). This is a display threshold, not a detector output.

## 60-second demo path

1. Open `#/pumps/PUMP-08?t=2025-09-10T12:37:00Z`: no alert, and no alert ≠ healthy. Press `+1 min`.
2. At 12:38, read the card top-down: rule suggestion (unconfirmed) → measured suction 35.3067 kPa(g), z −6.71 → flow not installed, 4 wireless channels without a sample this minute, strainer DP not in benchmark → next check with its reason.
3. Tab to "Technical details" and press Enter: verbatim evidence and recommendation (not a work order), uncalibrated score, all channels at the minute.
4. Press `+1 h` a few times or set the time to 2025-09-11 02:00. Open Alert history and select 12:38: focus jumps to the explanation, which says "13 h 22 min before the replay time".
5. Open `#/pumps/PUMP-09?t=2026-02-11T06:28:00Z`: "The detector reports Vibration velocity RMS deviating alone", a data-quality warning, not a confirmed fault.
