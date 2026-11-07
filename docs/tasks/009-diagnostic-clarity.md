# Task009 — make diagnosis and evidence understandable

User selected **diagnostic and evidence clarity** as iteration 1 priority (7 November). English UI, Russian collaboration. Claude Code is sole code writer. Codex owns review/Git/docs. Work from release 3a3db0c. Target a focused 45-minute slice, then handoff; no new UX Pilot purchase.

Read AGENTS.md, web/js/{app,replay,knowledge}.js, docs/tasks/006-coordinator-review.md and 007-coordinator-review.md. Use installed relevant project skills where helpful. Existing light style remains.

## Problem and intended behavior

The evidence card starts with raw enum codes, a dense evidence string and an uncalibrated score, then a generic rule paragraph. An engineer must reconstruct the meaning. Make the selected alert understandable in this order:
1. **What the rule suggests** — plain-English hypothesis, explicitly unconfirmed; historical alert's issue time distinct from current replay time. UNKNOWN means unresolved, no alert does not mean healthy, data-quality warnings do not confirm mechanical failure.
2. **What was actually observed** — human channel name, measured value/unit at the alert minute, whether higher/lower than the empirical reference, and readable source/time. Explicitly separate measured values from derived z. Prioritize the source-named evidence channels, not just four largest deviations. Do not claim that a generic rule branch is proven to be the executed branch.
3. **Why this is still uncertain** — the most relevant alternative explanations and missing/absent-at-that-minute data. Installed but no sample/z at the alert must not become “normal” or “not installed”. Distinguish missing benchmark measurements from existing channels. Do not rank alternatives as evaluated probabilities.
4. **Next engineering check** — existing engineering prompt with a plain reason (what uncertainty it addresses), advisory. Preserve verbatim detector recommendation under technical details; its broad cleaning/inspection suggestion must not read as a confirmed work order.

Keep exact source evidence, full rule text, exact score/formula and feature table in an accessible native details disclosure. Explain z in plain language as signed scaled deviation from the fixed first-day reference; it is not a physical safety limit or a probability. Do not reconstruct a physical baseline from rounded z or invent thresholds/healthy bands. Keep raw score secondary, not a percentage/gauge. Preserve retrospective labels in their separate opt-in panel and never use them to compose the diagnosis card.

Real acceptance example: PUMP-08 at 2025-09-10 12:38 UTC: suction pressure 35.3067 kPa(g), causal z −6.71; source evidence names suction pressure. Convey “suction pressure below this pump's reference; the rule suggests a suction restriction, but the cause is unconfirmed.” Flow is not installed. Wireless vibration channels are installed but have no sample in that particular minute; do NOT say no vibration or absence rules out cavitation. The first-day reference is not certified healthy. Consider whether the selected alert summary should appear above the alert-history list so history cannot push the explanation down.

PUMP-09 sensor-calibration warning: retain the named vibration channel, do not silently substitute the known retrospective current-sensor label. COMMUNICATION_LOSS: packet loss is observed, network/gateway explanations are hypotheses; do not imply a pump trip. SENSOR_STUCK: acknowledge cadence/constant-process alternatives; do not imply transmitter failure confirmed. UNKNOWN: observations and next check still work.

## Scope and boundaries

UI/explanation transformation only. No detector change, replay regeneration, new derived scientific claims or benchmark access. In particular never read test predictions or test telemetry during this iteration. web/data byte identities and results/release must remain unchanged. No Git operations. No cloud services. Avoid giant new architecture or duplicating B1 classification. Any new pure explanation helper should accept only sliced view + selected alert + static inventory, not full replay/evaluation labels.

## Verify and handoff

Use focused tests for meaningful explanation/data boundaries: unavailable-at-alert vs not installed; future data/labels cannot change explanation; older selected alert uses its own minute; UNKNOWN/data-gap/sparse-stuck states; uncalibrated score never presented as probability. Existing relevant replay tests plus changed UI browser smoke. Browser-check P08 12:37/12:38, older alert selected at a later clock, P09 sensor warning, a gap, UNKNOWN, and test metadata-only page. Desktop 1440 and mobile390; keyboard-open technical details and no page overflow. Save actual screenshots in review/task009, preserve user drafts using isolated test profile. Record exact tested vs untested facts.

Return docs/tasks/009-handoff.md with changed files, checks, limitations and 60-second demo path. No claimed human acceptance. Main will independently inspect and push.

## Layout acceptance detail

On mobile, do not leave the diagnosis after the entire left-column schematic and inventory (current grid stacks that way). Put the selected alert explanation before the long inventory/history, with the hypothesis, primary observation and next check discoverable without traversing unrelated panels. A compact summary near the top with expandable supporting details is appropriate; keep the trend accessible. On desktop avoid a tall narrow wall of text. The long alert history can be a disclosure after the selected diagnosis.
