# UX Pilot MCP — connection and generation audit

Date: 2026-11-06. Initial check was read-only; later sections record the user-authorized generation attempts. The read-only check changed nothing. Afterwards, exactly one user-approved generation ran (receipt below): 9 credits, one private page with one screen, nothing published.

## Calls made

| Call | Result |
|---|---|
| `guide { topic: "design.agent" }` | OK, params documented (below) |
| `guide {}` | OK, full tool/action list |
| `guide { topic: "confirm" }` | OK, two-step confirmation flow |
| `catalog { kind: "tiers" }` | OK |
| `catalog { kind: "credits" }` | OK |
| `find { kind: "pages", query: "Retrofit Doctor" }` | OK, returned all 5 owned pages, none for Retrofit Doctor |
| `find { kind: "designs", query: "Retrofit Doctor" }` | OK, 0 matches across 85 screens (creditsUsed 0; HTML scan flagged truncated) |

## Available tools

`guide`, `catalog`, `find`, `read`, `get_job`, `stop_job`, `design` (agent, react, react_edit, flowchart, flowchart_edit), `edit` (patch, replace, save_version, …), `import` (html, url, assets, upload, design_system), `manage` (pages, groups, comments, …), `review` (ux, persona, heatmap, gaze_flow, *_fix), `export` (preview, prototype, react_build, video), `make_video`, `generate_media`, `delete`.

Calls that spend credits, publish or delete use two steps: the first call returns a summary and a `confirmationToken`; it only runs when called again with `confirmed: true` and the token (single use, expires after 15 min).

## Does a Retrofit Doctor project exist?

No matching page or screen was found among the five owned pages. A `design.agent` run without `pageId` would create a new page. Unrelated page names are omitted.

## Can docs/ux/UX_PILOT_PROMPTS.md be sent?

Technically yes: `design { action: "agent" }` accepts a free-text `prompt` with no documented length limit; the file is ~16.5 KB (master prompt + per-screen prompts). Options: one run with the master and one screen prompt, or `import { kind: "html" }` (0 credits) for our own HTML.

Not done in this check. The file says it is not itself a request to run UX Pilot, and any run needs the user's explicit OK. Suggest splitting it: the master prompt as page context (`manage.update_page`, after a page exists) plus one screen prompt per run.

## Cost of the smallest single-screen design run

There is no fixed price. `design.agent` is billed on actual token use when the run ends, plus any generated images; the cost is only known afterwards (`get_job` → `creditsUsed`). Starting a run requires credits on hand.

| Tier | Input | Cached input | Output (credits per 1M tokens) |
|---|---|---|---|
| standard (cheapest; free-plan tier) | 47 | 5 | 930 |
| pro (default on paid plans) | 186 | 9 | 930 |
| ultra | 372 | 19 | 1860 |

Cheapest setup: `tier: "standard"`, `generateImage: false`, one screen prompt, `selectedType: "desktop"`. A rough estimate, assuming 100–300k input and 20–50k output tokens: about 20–60 credits. This is not a quote; the real cost depends on how much the agent plans, researches and fixes its own output.

Other prices for reference: `import html` 0 (refine 18), `import url` 18, `review ux` 3, `review heatmap` 2, `review persona` 0, `export preview` 6, `design react` ~10–22 per screen, flowchart 0.

Account credit balance: no read-only call reports it (`catalog` lists prices, not the balance).

## Pump Detail design run: prepared, not confirmed (2026-11-06)

**Attempt 1:** `manage.create_page "Retrofit Doctor"` was blocked by the local Claude Code permission classifier; it was not retried and permissions were not changed. Next, `design.agent` with the master prompt plus Pump Detail verbatim (8370 characters) was rejected by the server: the `prompt` limit is 8000 characters.

**Attempt 2 (current):** `design.agent` without `pageId` and without `confirmed`. Params: `tier: standard`, `generateImage: false`, `selectedType: desktop`. The prompt is condensed to 6570 characters and keeps the following:
- exactly one desktop Pump Detail screen for PUMP-08; no other screens, component sheet or extra state frames
- PUMP-08 header facts and "As of 2025-09-10 12:38 UTC", paused replay, the causal as-of rules
- the alert values verbatim (issued time, class, type, evidence z=-6.7, recommended action, confidence 0.559 / 0.5587501525878906, uncalibrated)
- no fabricated readings, read-only, sensor and schematic placement rules, validation labels off by default.

**Server result:** `confirmation_required`, with a confirmation token that expires **2026-11-06T22:00:23Z**. The server gives no cost estimate: usage is metered at standard rates (47 / 5 / 930 credits per 1M input / cached / output tokens, no images) and charged only when a run ends. No job was started, no credits were spent, nothing was published, and no page was created.

The exact params, prompt (sha256 in the file) and token are in ignored `work/uxpilot-prepared.json`; the token is kept out of this doc. To run: the user explicitly approves, then call again with the identical params plus `confirmed: true` and the token, before it expires. After expiry, prepare again.

**Execution attempt (2026-11-06 ~21:48Z):** the user approved one run ("Да, запусти один экран Standard без изображений"). The confirmed call (identical params, `confirmed: true`, valid token) was blocked locally by the Claude Code permission classifier before reaching UX Pilot. No job, 0 credits, no page or design. No workaround was attempted. User requested direct session access for confirmation; the exact manual resume command was supplied after Terminal computer-use access was denied. Do not broaden permissions or route around the refusal. If the token has expired (22:00:23Z), prepare the same request again before its authorized one-screen execution. Verify no job was launched by the user before any retry.

## Run receipt: Pump Detail, one screen (2026-11-06)

- Approval: the user's own chat message ("Запусти подготовленный UX Pilot design.agent, один экран, Standard, без изображений"). Before retrying, `find pages` confirmed that no run had been started in between. The first token had expired, so the request was prepared again: identical params, same server `paramsHash`, then confirmed once.
- Params: `tier: standard`, `generateImage: false`, `selectedType: desktop`, no `pageId`, 6570-character prompt (sha256 in `work/uxpilot-prepared.json`).
- Job `TQPZZzEqfNXvFzmYmjbu`: completed, **creditsUsed 9 / creditsCharged 9**, warnings 0, static checker issues 0.
- New private page `Gg4kE9AeBl6or2bSTnsK` (https://uxpilot.ai/a/ui-design?page=Gg4kE9AeBl6or2bSTnsK). The server named the page; it was not renamed.
- One screen: design `6umz4u8tBcLUj7Tk3BKA` "RetrofitDoctor - PumpDetail", 1440 × 1632, HTML 28,757 bytes (hash `ab457bc4…24cd`). Not published, no preview or prototype export, no reviews, no further runs.
- Local copy: `work/uxpilot-run-TQPZZzEqfNXvFzmYmjbu/pump-detail-preview.png` (ignored). The HTML was read through `read design` and is not stored in the repo.

### Check against the brief (a reviewer's reading, not visual approval)

Matches the brief:
- exactly one desktop screen; four-item left nav with Pump Detail current
- header shows "Synthetic benchmark", "Replay / metadata only", "ASSET: PUMP-08" and "As of 2025-09-10 12:38 UTC"; no Live badge
- PUMP-08 · Vessel B · Seawater cooling; paused replay with step controls and an observation-window selector
- alert values verbatim: 2025-09-10 12:38:00Z, MACHINE, suction strainer clogging, "B1 mode-aware z: suction_pressure_kpa z=-6.7", "Inspect / clean suction strainer.", 0.559 / 0.5587501525878906, uncalibrated
- primary "Review retrofit options", secondary "View source evidence", "View validation results" link
- validation-labels toggle off by default with the retrospective annotation
- "Signal data unavailable" state; "Not instrumented" and "No measurement available" wording
- six sensor-inventory columns as specified; dashed "Proposed" marker; schematic disclaimer.

Violates the brief (must be fixed before use as a reference):
1. **Fabricated readings:** the suction-pressure chart plots invented values (~142→108 kPa, 12:00–12:38). This is exactly what the brief prohibits.
2. **Fabricated inventory:** last-measurement times, ages, "Active" states and the reference-readiness values are not from verified data. So are the per-channel installed/not-instrumented claims (e.g. "Discharge Pressure — Not instrumented") and the "6 channels tracked" count. All must come from the PUMP-08 passport and export.
3. **Invented provenance:** "B1 Replay Dataset V4" and "metadata_registry_v12" are not real sources.
4. The "Key interactions" popover covers the schematic panel. The numbered callouts render as plain digits, because `@apply` does not work in a runtime `<style>` block.
5. "Baseline prediction. Engineering review required." appears only as a "BASELINE PREDICTION" badge, without the full sentence. Confidence is visible on the card rather than only in details.
6. The chart x-axis extends to 12:40, past the As-of boundary (there are no points after it).
7. The schematic marks motor/suction/discharge only; bearing housing, winding and drive contexts are missing. "Phase Current — Proposed" sits in the installed-state column.

Usable as visual direction only: layout, hierarchy, alert card and inventory-table structure. Any data shown must come from Task001's verified export.
