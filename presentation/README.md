# English demonstration pitch

Eight slides, reviewed 7 November 2026: implemented interface, dataset/splits, diagnostic failures, original/causal comparison, measured sensor ablation, concrete measurement package, negative retrofit economics and proposed pilot.

The editable presentation is saved in Spaces: Page `page_b0a41b6380bc81918599f90bafe95e60`, **Retrofit Doctor — engineering demo**. Current connection `artifact_external_b64cafa1-47de-40f4-9fbf-613770efdb1c`, state version 11. Reconnect by Page ID if the connection expires. Tables and text remain editable; detailed sources and qualifications are in speaker notes.

- `retrofit-doctor-pitch.pdf`: offline projection fallback, eight 16:9 raster pages. It was composed from inspected native slide renders after the editor's native PDF export failed with an ArrayBuffer conversion error. It is not intended for editing or accessible text extraction.
- `deck-content.json`: local content inspection of all eight slides.
- `PITCH_SCRIPT.md`: timed three-minute English narration for the slide presentation.
- `JURY_QA.md`: longer evidence-backed answers and deployment limits.
- `../docs/tasks/006-demo-script.md`: alternative three-minute live application walkthrough, superseding the original UX proposal.

The cover uses the actual reviewed light interface from Task006, committed at c63efdb, not the unverified UX Pilot mockup. The sensor schematic and source evidence are visible. The baseline slide records the final decision: nine new candidates were rejected and causal B1 remains selected, with its environment and seed pinned. The ablation slide shows mixed effects on the same ten train events, not hardware ROI. The physical-package slide is a proposed field design, not an installed device. The economics example reproduces −EUR 2,200 annual net and −EUR 15,500 over five years at zero discount; its inputs are illustrative assumptions.

All slide layouts were visually inspected during authoring. Updated cover, baseline, ablation and hardware slides were also checked after PDF rendering; shifted slides were re-rendered. The final PDF was reopened and verified to contain eight pages. No field performance, certified reliability or achieved customer savings are claimed.

The local interface passed coordinator review after two correction rounds. Final user application feedback and a timed spoken rehearsal remain outstanding; the user has approved the light visual direction. Test-export readiness is recorded separately in the release package and must not be inferred from these slides.

Release update: slide 2 speaker notes disclose pre-gate PUMP-10 process-memory access during mutation testing and the subsequent fixed-model export (23 rows; 42 prefix checks). Slide 2 now labels the split “Test”; the eight-page PDF was regenerated to match. No pristine blind-evaluation claim is made; test diagnostic quality is unknown.
