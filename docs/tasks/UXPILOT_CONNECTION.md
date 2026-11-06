# UX Pilot MCP — connection and generation audit

Date: 2026-11-06. Initial check was read-only; later sections record the user-authorized generation attempts. No project, page or design was created or changed, no AI generation ran, no credits were spent, nothing was published.

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
