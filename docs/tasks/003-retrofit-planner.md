# Task 003 — working Retrofit Planner (Claude Code)

Execution gate: start after Task002 hands off and its implementation writer is idle. One active code writer. Codex owns Git and experiment release; do not change diagnostics, benchmark data, exported telemetry or historical evidence. Timebox 90 minutes; preserve a working slice and handoff at the boundary. English product text.

Read AGENTS.md, CLAUDE.md, docs/engineering/{DECISION_BRIEF,COST_MODEL_SPEC,PLANNER_ACCEPTANCE,SOURCES_AND_UNKNOWNS}.md, docs/ux/STATES_AND_ACCEPTANCE.md and the current web implementation. The engineering contracts govern scientific and numerical behavior. Use the installed tdd skill for meaningful calculator/storage boundaries. No new framework, cloud service, account or paid design call. UX Pilot styling can be integrated later.

## User outcome

An engineer sees the selected pump's real installed coverage, chooses a measurement hypothesis, records installation/integration/maintenance uncertainties, compares full lifecycle assumptions and saves a review draft locally. A justified decision to defer permanent retrofit is a successful outcome. The negative economics example must be easy to demonstrate in under a minute.

## Implement

1. Replace the skeleton Planner with existing-only, minimal retrofit and instrument-grade assessment choices, plus an explicit defer outcome. Show useful decisions, residual blind spots and engineering gates. Candidates must remain separate from installed inventory and telemetry. Test assets remain metadata-only. No fabricated topology, paired pumps, efficiency improvement or waveform data.
2. Add/remove proposed measurement cards. Preserve review answers, notes and explicit unknown states. Explain bandwidth versus update cadence for vibration; pressure tap location and missing flow context for hydraulic assessment. Proposed architecture stays advisory/read-only and separate from current replay capability.
3. Implement the cost contract as a pure module with typed-by-convention structured data and explicit null values. Three option records use a named baseline. Required cost categories stay visible; partial estimates show known subtotal and exclusions. Currency/tax/source fields, shared allocations and scheduled costs must not silently lose required context. Keep optional benefit inputs empty until entered or an illustrative preset is explicitly loaded.
4. Include the exact independently labelled redundant-pump preset from COST_MODEL_SPEC. It does not assert standby availability for the chosen benchmark asset. Show annual benefit/nuisance/upkeep/net, initial cost, horizon net present value and valid payback wording. Surface useful sensitivity (nuisance count and event-rate break-even) without treating assumptions as measured facts. Preserve all zero/unknown/invalid distinctions and no double counting.
5. Save versioned drafts per asset in localStorage with dates, source/assumption notes and unresolved review questions. Reload/switch pump preserves independent state; storage failure keeps in-memory edits and displays an actionable message. Add a draft reset with an explicit local confirmation if edits exist. No external transmission.
6. Keep the existing visual language and navigation. Make controls keyboard usable, labels and numeric errors legible at 390 px and 1440 px. The core works offline after local assets load. Do not imply this proves field resilience. Fix small chart labels only if the change is isolated and verified; do not expand into a full UI redesign.

## Verification and handoff

Cover ENG-01 through ENG-18 with appropriate evidence. Unit checks should verify independent arithmetic fixtures, missing/invalid data, discounting and scheduled-cost payback restrictions, currency incompatibility, and storage failure/migration behavior. Browser checks should exercise add/remove isolation, edit/save/reload/pump switch, the negative preset and its zero-nuisance variant, keyboard/narrow layout, and the ready-versus-economic-review distinction. Do not write implementation-mirroring tests or claim all acceptance rows pass from unit tests alone.

Run existing JS replay tests and the relevant exporter checks if their boundaries change. Keep the local server at port 8765 usable. Save actual browser screenshots under review/task003/ and a concise docs/tasks/003-handoff.md listing checks, remaining limits, changed files and the next action. No Git mutation. Do not alter or hide unsupported controls merely to claim acceptance: identify any deferred requirement explicitly.
