# Phase 4 QA: verify presentation lifecycle

### QA Starter Prompt
```
This is Phase 4 QA of the Desktop Client Update: verify the hidden-window skip and
display-change handling.

Model: Fable 5, xhigh effort. Harness: Claude Code.
ultracode. Orchestrate this audit as a deterministic Workflow: parallel audit
agents per focus area, findings adversarially verified by independent skeptics
before they count.

PROJECT RULES: work ONLY in /home/fernandoramirez/Documents/woc-desktop-client-update
(git -C always); LOCAL-ONLY, never push; first pull+merge origin/release/v0.36.0;
git status clean or stop and ask.

Goal: audit phase 4; the two failure modes that matter most are (a) anything that stops
ticking while hidden (backlog freeze regression) and (b) a render skip that leaks into
visible states.

STEP 1 - LOAD CONTEXT: Explore agent (~25 calls, report-first): state.md, progress.md
phase 4 checklist, phase-04-presentation-lifecycle.md, the diff.

STEP 2 - AUDIT (parallel, COVERAGE not filtering, ~30-call budgets):
- Correctness agent: trace the hidden path end to end: sim tick runs, net drain runs,
  event queues do NOT grow while hidden (find the drain call and prove it is inside the
  still-running section); render/paint truly skipped; refocus resumes within one frame;
  the graphicsRebuildPaused interaction is preserved; offline mode (no net) also
  behaves; the display-change re-apply cannot fight the dynamic-resolution governor
  (both write pixel ratio; check ordering/idempotence).
- Test-quality agent (test-coverage-auditor): the decision core tests cover EVERY input
  combination including desktopApp=false; the render-skip evidence is real measurement,
  not narrative; pins fail on regression (scratch-mutation AFTER committing).
- Fairness check: confirm nothing in the diff gates on the FPS governor or hides
  actionable info in a visible state (the skip must key on document.hidden only).
- Dispatch per the implementation-plan.md matrix + qa-checklist agent.

STEP 3 - FIX all BLOCKING and SHOULD-FIX; rerun phase 4 validation +
`node scripts/gate_select.mjs`. Separate fix commits.

STEP 4 - DOCS + MEMORY.

FINAL RESPONSE: verdict, counts, deferrals, handoff for phase 5.

STOPPING RULES: stop and surface if event-queue growth while hidden is discovered (that
is a locked-decision violation, not a tweak).
```
