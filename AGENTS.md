# Retrofit Doctor working agreement

User-approved goal: first working demo by 2026-11-07 12:00 Europe/Berlin; two review iterations afterwards. English product/pitch; Russian collaboration. No physical hardware build.

Claude Code implements application and diagnostic code. Codex owns scope, task packets, experiments protocol, product decisions and focused verification. One active code writer; helper chats own only their assigned documentation directories. Do not spawn additional chats without coordinating with the main chat.

Default stage WORKING PROTOTYPE: useful vertical slice, focused checks, smoke, review. No speculative infrastructure. Timebox small/medium/large slices at 20/45/90 minutes; preserve progress and split at the limit. Todoist is the status source; Obsidian stores context and decisions; Git stores code/evidence. Return changed files, verification, limitations and next action. Never mark a task done based on build success alone.

Scientific boundaries: vendor/benchmark is immutable. Train PUMP-01..07, validation08..09, blind test10..12. Use test metadata only until a frozen one-shot evaluation/export. Never load test telemetry or labels for development. Validation already inspected; describe subsequent diagnosis work as development-informed, not untouched validation. Tune parameters on train only. Prefix invariance and closed-minute timestamps required. No backward fill, whole-series baseline, centered rolling features, or future data in evidence.

All benchmark measurements are synthetic. Distinguish simulated measurement, derived value, missing channel, proposed sensor and assumption. Do not fabricate diagnosis gains, ROI, certification, actual ship topology, six paired pump groups or streaming implementation. Display UNKNOWN/INSUFFICIENT_REFERENCE/stale distinctly from healthy. Demo is advisory/read-only; no equipment controls.

Run only relevant checks; preserve baseline evidence. No secrets in Git. No blanket bypass of Claude permissions, changes to security settings, public deployments or purchases. Private repo creation/push and local development are authorized. User visual review remains pending until actually obtained.
