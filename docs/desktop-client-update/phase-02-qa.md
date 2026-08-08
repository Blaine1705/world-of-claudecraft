# Phase 2 QA: verify shell startup and window polish

### QA Starter Prompt
```
This is Phase 2 QA of the Desktop Client Update: verify shell startup and window polish.

Model: Opus 4.8, xhigh effort. Harness: Claude Code.

PROJECT RULES: work ONLY in /home/fernandoramirez/Documents/woc-desktop-client-update
(git -C always); LOCAL-ONLY, never push; first pull+merge origin/release/v0.36.0
(re-run electron suites on a non-trivial merge); git status clean or stop and ask.

Goal: audit phase 2 for correctness, regression risk in the login/crash paths, and pin
quality.

STEP 1 - LOAD CONTEXT: Explore agent (budget ~25 calls, report-first): state.md,
progress.md phase 2 checklist, phase-02-shell-startup-polish.md, the phase 2 diff.

STEP 2 - AUDIT (parallel, COVERAGE not filtering, ~30-call budgets, BLOCKING/
SHOULD-FIX/NICE-TO-HAVE/VERDICT):
- Correctness agent, focus points: (a) ready-to-show vs the crash-recovery reload in
  electron/crash_guard.cjs (a webContents reload after crash must not leave the window
  hidden forever; trace the show state through that path); (b) ready-to-show vs the
  cold-start deep link (pendingLoginCode delivery must not race an unshown window);
  (c) second-instance focus when the window is destroyed/recreating (activate path on
  macOS); (d) the menu change really is platform-guarded and macOS keeps its default
  menu; (e) the version derivation is build-time, not runtime-fetched, and the no-JS
  fallback hrefs stay consistent.
- Test-quality agent (test-coverage-auditor): the new text-scan pins anchor real code
  regions (not comments), each would fail on regression (scratch-mutation check AFTER
  committing), the version pin compares against package.json's live value rather than
  a copied literal (no self-comparison).
- Dead-code agent: the removed per-window setMenu left no orphans; no stray
  DESKTOP_VERSION references remain anywhere (grep the whole repo including index.html
  generation inputs).
- Dispatch per the implementation-plan.md matrix + qa-checklist agent.

STEP 3 - FIX all BLOCKING and SHOULD-FIX; rerun the electron/desktop suites,
`npx tsc --noEmit`, `node scripts/gate_select.mjs`. Separate fix commits.

STEP 4 - DOCS + MEMORY: progress.md, state.md, memory.

FINAL RESPONSE: verdict, finding counts, deferrals, handoff for phase 3.

STOPPING RULES: stop and surface if the crash-recovery interaction needs a design
change rather than a local fix.
```
