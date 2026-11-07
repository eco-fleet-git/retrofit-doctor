# English demonstration pitch

Eight slides, updated and reviewed 7 November 2026: implemented comparison interface, dataset/splits, diagnostic gains and remaining error, train results with descriptive validation, baseline sensor ablation, proposed retrofit architecture, negative economics example and pilot pathway.

The editable presentation is saved in Spaces: Page `page_b0a41b6380bc81918599f90bafe95e60`, **Retrofit Doctor — engineering demo**. Current connection `artifact_external_d0ea7620-f0da-41c0-9050-feaf8287def9`, state version16. Reconnect by Page ID if the connection expires. Tables/text are editable; sources and qualifications are in speaker notes.

- `retrofit-doctor-pitch.pdf`: offline projection fallback, eight16:9 raster pages, refreshed from the inspected native slide renders. The earlier editor PDF export failed with an ArrayBuffer conversion error, so this fallback uses the actual renders; it is not intended for text extraction or editing.
- `deck-content.json`: full inspection of the eight slides, including speaker notes and image descriptions.
- `PITCH_SCRIPT.md`: three-minute English narration; timing is a target, not a completed spoken rehearsal.
- `JURY_QA.md`: evidence-backed answers and deployment limits.
- `../docs/tasks/015-handoff.md`: a60-second walkthrough of the new diagnosis comparison. `../docs/tasks/006-demo-script.md` covers the broader baseline/retrofit workflow.

The cover is an actual screenshot of the reviewed Task015 interface (`review/task015/01-pump04-at-alert-1440.png`), not a mockup. Slides3/4 show the selected Z995 gains: correct type8→10/26 on train, sensor type+channel3→4/8, unchanged detection/burden; descriptive validation4→5/9 with unchanged detection/burden. Validation had already been inspected, and its gain is waveform-only. The hydraulic gain has train-only support. P01's unchanged wrong diagnosis remains visible.

Sensor ablation still uses unchanged B1 and has mixed outcomes; it does not measure the new method's hardware benefit. The architecture is a proposal, not an installed device. The illustrative economics remain −EUR2,200 annually and −EUR15,500 over five years at zero discount. No field performance, certification or achieved customer savings are claimed.

All eight native slide renders were inspected. Updated cover and results/proposal slides were inspected again after PDF rendering; the PDF was reopened and verified as eight pages. The new UI passed coordinator review, but final user application feedback and a timed spoken rehearsal remain pending.

The frozen test export still uses causal B1:23 rows and42 prefix checks, quality unknown. Slide2 speaker notes retain the disclosed pre-gate PUMP-10 process-memory read during mutation testing. The Z995 research comparison does not replace that export, and no pristine blind-test or new test-quality claim is made.
