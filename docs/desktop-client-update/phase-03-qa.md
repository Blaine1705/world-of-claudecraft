# Phase 3 QA: verify hybrid-GPU visibility

### QA Starter Prompt
```
This is Phase 3 QA of the Desktop Client Update: verify hybrid-GPU visibility.

Model: Fable 5, xhigh effort. Harness: Claude Code.
ultracode. Orchestrate this audit as a deterministic Workflow: parallel audit
agents per focus area, findings adversarially verified by independent skeptics
before they count.

PROJECT RULES: work ONLY in /home/fernandoramirez/Documents/woc-desktop-client-update
(git -C always); LOCAL-ONLY, never push; first pull+merge origin/release/v0.36.0;
git status clean or stop and ask.

Goal: audit phase 3 for correctness, trust-boundary quality, and i18n compliance.

STEP 1 - LOAD CONTEXT: Explore agent (~25 calls, report-first): state.md, progress.md
phase 3 checklist, phase-03-gpu-visibility.md, the phase 3 diff.

STEP 2 - AUDIT (parallel, COVERAGE not filtering, ~30-call budgets):
- Correctness agent: the payload reducer drops unknown fields and caps strings; the
  push fires on did-finish-load AND on a re-fire after GPU-process crash; the renderer
  merge cannot double-fire the notice when BOTH the renderer-side detection and the
  shell verdict trip; dismissal re-arm logic matches the spec (verdict change re-arms,
  same verdict does not); web build path is a true no-op.
- Test-quality agent (test-coverage-auditor): channel pins updated in the EXACT arrays
  (not arrayContaining where exact equality was pinned); the new pure modules' tests
  fail on regression (scratch-mutation AFTER committing); the notice tests cover both
  dismissal directions, not just one arm.
- i18n agent: new keys English-only in the catalog, five non-Latin fills present for
  wordy values, S3 guard green, no locale overlay edits beyond M16, no raw English in
  the renderer paths.
- Dispatch per the implementation-plan.md matrix + qa-checklist agent.

STEP 3 - FIX all BLOCKING and SHOULD-FIX; rerun the phase 3 validation set +
`node scripts/gate_select.mjs`. Separate fix commits.

STEP 4 - DOCS + MEMORY.

FINAL RESPONSE: verdict, counts, deferrals, handoff for phase 4.

STOPPING RULES: stop and surface if the double-fire interaction needs a redesign of the
existing notice trigger rather than a merge-point fix.
```
