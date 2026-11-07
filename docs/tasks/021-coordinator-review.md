# Task021 coordinator review — local system onboarding

Date: 2026-11-07. Application code: Claude Code; scope, scientific review, browser QA and release: Codex. User requested execution of the product workflow: site → system → equipment characteristics → acquisition device and sensors → existing data → justified next measurement. This release is a bounded first vertical slice; user acceptance is pending. New video production remains paused.

## Delivered

- EN/RU My systems list and four-step add/edit wizard: site and engineering question; pump/motor/valve passport; device, measurement points and source; readiness and advisory next step.
- Unknown ratings remain unknown. Explicit PUMP-04 prefill retains provenance. The conceptual diagram is labelled as an assumption, not inferred physical topology.
- Three distinct sources: reviewed historical synthetic challenge minute; actual locally parsed CSV; network/gateway configuration only, with no network ingestion or apparent connected state.
- Installed, proposed, received and mapped channels remain distinct. Ps/Pd chart requires installed sensors at pump taps. No new diagnosis or performance claim is derived from user imports.
- Systems persist in this browser under distinct SYS IDs. Maximum 20 systems; up to 600 sampled rows plus full-record counts retained per source. Corrupt storage is reported and not overwritten.

## Review corrections

Strict calendar/timezone validation rejects impossible dates, rather than relying on permissive Date.parse. Nominal rpm cannot stand in for measured speed. A design Q/H point cannot stand in for a pump curve. Pressure-tap mismatches block hydraulic/energy review. Energy readiness is only potential review under additional density/geometry assumptions. Proposed vibration sensors do not enable mechanical assessment. Received and mapped counts are reported separately; an unmapped pressure chart is hidden.

Capability cards now stack within their narrow column and disclose missing prerequisites. Source badges and sidebar captions wrap. The mobile channel table becomes individual cards. A list-click failure seen with browser automation was investigated: native clicking worked, routing was unchanged, and after the overlap fix both native and Playwright link clicks worked. No console errors were observed.

## Verification

`node --test --test-timeout=30000 tests/*.mjs`: **123 passed, 0 failed, 0 skipped** (109 existing + 14 systems checks). `git diff --check`: clean.

Browser checks at 1161 px and 390 px:

- Required site/system names produce validation messages.
- Explicit challenge passport and 60-row recording import, mapping, save and reload in SYS-001.
- Invalid February 30 CSV rejected with line-specific error; valid 3-row synthetic QA CSV loaded and persisted as SYS-002.
- Five received CSV channels with zero mapped channels displayed separately; pressure chart withheld until mapping is confirmed.
- Installed Ps/Pd/Q/n/power allow pressure review and potential energy review; proposed V/T alone do not enable mechanical analysis.
- Network-only configuration reports not connected and zero received data; this test was not saved over the CSV system.
- Language changes preserve current draft values. Saved records reopen for editing. Reload restores saved data; unsaved drafts are intentionally memory-only.
- List source labels no longer overlap adjacent columns. Final detail and sensor wizard have document width 390/scroll width 390. Mobile navigation remains horizontally scrollable by design.
- Existing fleet grouping and PUMP-04 diagnostic review still render with the correct synthetic-benchmark provenance. Local-system captions do not call user CSV benchmark data.

Screenshots are in `review/task021/`: final RU detail, RU list, RU mobile detail, RU mobile sensor wizard and EN wizard. The saved examples are browser-local QA/demo state and are not distributed as new benchmark records.

## Frozen bundles

All SHA-256 values match the previous release:

- diagnosis-comparison.json: `8ffff27f530dd05d0970ec36b23126ec5502a0c1055d7ee12a135aef559ea567`
- fleet.json: `168ab6cfa14c797e83d932fadcd1da28e096d3c547d0f9a9799cfd3678279724`
- replay-PUMP-08.json: `51e2456168480ad24d6d137b6e9898f4f72de34799483ac24ff543c3bd30c80f`
- replay-PUMP-09.json: `47c0a0d52816f1e7ca1407fe8af553d40db40d3c8509443a7b9d22e5340edfb3`

## Practical limits and next scope

This does not deliver a certified acquisition device, actual network ingestion, a production historian, saved-system export/delete UI, pump-curve input, or diagnosis on arbitrary imported data. Imported files are local; larger files are sampled for persistence, not archived in full. Wizard drafts are lost on reload. No hardware/control actions or new video were made.

The next coherent diagnostic increment is verified pump-curve/reference entry and unit/operating-regime checks, followed by a causal analysis of an imported time series with explicit uncertainty. Multi-equipment interactions need an explicitly configured topology and matching timestamps; proximity in a site list cannot supply that information. Hardware selection, reliability and certification require a separate justified design rather than UI labels.
