# Phase 1 QA: verify Electron runtime plumbing

### QA Starter Prompt
```
This is Phase 1 QA of the Desktop Client Update: verify Electron runtime plumbing.

Model: Fable 5, xhigh effort. Harness: Claude Code.
ultracode. Orchestrate this audit as a deterministic Workflow: parallel audit
agents per focus area, findings adversarially verified by independent skeptics
before they count.

PROJECT RULES: work ONLY in /home/fernandoramirez/Documents/woc-desktop-client-update
(git -C always); LOCAL-ONLY, never push; first pull+merge origin/release/v0.36.0 and
re-run the electron suites if the merge was non-trivial; git status clean (phase 1
committed) or stop and ask.

Goal: audit phase 1 for correctness, pin quality, and anything missed.

STEP 1 - LOAD CONTEXT: Explore agent (budget ~25 calls, report-first) summarizes
state.md, progress.md phase 1 checklist, phase-01-electron-runtime.md (what was
promised), and `git -C <worktree> diff <phase-start>..HEAD` file list + diffs.

STEP 2 - AUDIT (parallel agents, COVERAGE not filtering, budget ~30 calls each,
BLOCKING/SHOULD-FIX/NICE-TO-HAVE/VERDICT):
- Correctness agent: versions really resolve to 43.3.0/26.15.7 in node_modules (not
  just package.json); lockfile diff contains ONLY the intended moves (no stray
  transitive churn beyond the electron packages); vendor bundles unchanged;
  codeCache landed in the right privileges object (there is exactly one
  registerSchemesAsPrivileged call); pack smoke result honestly recorded.
- Test-quality agent (test-coverage-auditor): the new privileges pin actually fails on
  regression (temporarily delete codeCache:true in a scratch copy and confirm the scan
  catches it; remember: commit everything BEFORE any mutation probe, then restore);
  check the pin is not a self-comparison and anchors the real privileges object, not a
  comment.
- Review dispatch per the implementation-plan.md matrix: privacy-security-review only
  if the audit itself changes electron/ files; qa-checklist agent for the phase gate.

STEP 3 - FIX all BLOCKING and SHOULD-FIX; rerun
`npx vitest run tests/electron_*.test.ts tests/desktop_*.test.ts`, `npx tsc --noEmit`,
`node scripts/gate_select.mjs`. Separate fix commits with explicit paths.

STEP 4 - DOCS + MEMORY: progress.md (phase 1 QA row), state.md (drift found), memory.

FINAL RESPONSE: verdict (PASS / PASS-WITH-FOLLOWUPS / FAIL), finding counts, deferrals,
one-line handoff for phase 2.

STOPPING RULES: stop and surface if a BLOCKING fix would change phase scope.
```
