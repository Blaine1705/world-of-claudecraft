# Phase 7 QA: verify the prefs store and window memory

### QA Starter Prompt
```
This is Phase 7 QA of the Desktop Client Update: verify the desktop preferences store,
window memory, and the GPU-force opt-out.

Model: Fable 5, xhigh effort. Harness: Claude Code.
ultracode. Orchestrate this audit as a deterministic Workflow: parallel audit
agents per focus area, findings adversarially verified by independent skeptics
before they count.

PROJECT RULES: work ONLY in /home/fernandoramirez/Documents/woc-desktop-client-update
(git -C always); LOCAL-ONLY, never push; first pull+merge origin/release/v0.36.0;
git status clean or stop and ask.

Goal: audit phase 7 with the trust boundary front and center: the store file is
attacker-writable local state feeding the pre-ready startup path.

STEP 1 - LOAD CONTEXT: Explore agent (~30 calls, report-first): state.md, progress.md
phase 7 checklist, phase-07-prefs-window-memory.md, the diff.

STEP 2 - AUDIT (parallel, COVERAGE not filtering, ~30-call budgets):
- Security agent (this is the headline): enumerate every field read from the store and
  verify each is validated AND clamped before use; try to construct a store file that
  (a) crashes startup, (b) places the window off-screen unrecoverably, (c) influences
  anything beyond bounds/display/maximized/gpu opt-out (origins, feeds, channels,
  paths), (d) grows unbounded. The atomic-write claim: verify temp+rename, same
  directory (cross-device rename fails), and behavior when the rename itself fails.
- Correctness agent: bounds save debounce does not drop the final resize before quit;
  restore honors minWidth/minHeight and the ready-to-show flow (no flash at default
  size); multi-display fallback centers on the NEAREST display; the GPU opt-out
  genuinely skips all three mechanisms (registry, switches, PRIME env) and ONLY those;
  the renderer toggle reflects the shell store rather than overwriting it; older-shell
  behavior (no bridge methods) leaves the row hidden.
- Test-quality agent (test-coverage-auditor): each corrupt-store case has its own
  decisive test (not one happy-path blob); the clamp tests cover boundary values;
  the options doctrine pins are all three present; scratch-mutation check AFTER
  committing.
- Dispatch per the implementation-plan.md matrix + qa-checklist agent.

STEP 3 - FIX all BLOCKING and SHOULD-FIX; rerun the phase 7 validation set +
`node scripts/gate_select.mjs`. Separate fix commits.

STEP 4 - DOCS + MEMORY: progress.md, state.md (store schema as shipped), memory.

FINAL RESPONSE: verdict, counts, deferrals, handoff for phase 8.

STOPPING RULES: stop and surface any store-driven startup crash you cannot fix locally;
that is a BLOCKING design issue.
```
