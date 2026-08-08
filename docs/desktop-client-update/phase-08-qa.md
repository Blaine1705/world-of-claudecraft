# Phase 8 QA: verify display modes and power

### QA Starter Prompt
```
This is Phase 8 QA of the Desktop Client Update: verify display modes and the
gamepad display-sleep blocker.

Model: Opus 4.8, xhigh effort. Harness: Claude Code.

PROJECT RULES: work ONLY in /home/fernandoramirez/Documents/woc-desktop-client-update
(git -C always); LOCAL-ONLY, never push; first pull+merge origin/release/v0.36.0;
git status clean or stop and ask.

Goal: audit phase 8. The two risk centers: web/mobile fullscreen regressions from the
desktop branching, and a leaked powerSaveBlocker.

STEP 1 - LOAD CONTEXT: Explore agent (~30 calls, report-first): state.md, progress.md
phase 8 checklist, phase-08-display-modes-powersave.md, the diff, and the phase's
fullscreen-reader audit notes.

STEP 2 - AUDIT (parallel, COVERAGE not filtering, ~30-call budgets):
- Web-parity agent: independently enumerate EVERY reader/writer of the fullscreen
  setting and the browser fullscreen API on web and mobile paths; prove the non-desktop
  behavior is unchanged (including boot-time auto-fullscreen and any keybind); verify
  the desktop options row renders only with the bridge present and the web row renders
  only without it (both directions pinned).
- Blocker-lifecycle agent: enumerate every path that starts the blocker and every path
  that must stop it (debounce, hidden, quit, crash recovery reload); look for a start
  with no matching stop; verify the rate limits on both sides; verify stop is
  idempotent and the blocker id handling cannot double-start.
- Display-mode agent: startup apply order vs phase 7 bounds restore vs phase 2
  ready-to-show (the window must appear once, in the right mode, at the right size);
  live toggle from each state; enum validation rejects garbage from the channel AND
  from a hand-edited store file.
- Test-quality agent (test-coverage-auditor): transitions each have decisive tests;
  the desktop-only-render pin exercises both directions; scratch-mutation AFTER
  committing.
- Dispatch per the implementation-plan.md matrix + qa-checklist agent.

STEP 3 - FIX all BLOCKING and SHOULD-FIX; rerun the phase 8 validation set +
`node scripts/gate_select.mjs`. Separate fix commits.

STEP 4 - DOCS + MEMORY: progress.md, state.md, memory.

FINAL RESPONSE: verdict, counts, deferrals, handoff for phase 9.

STOPPING RULES: stop and surface macOS Space-fullscreen findings as a per-OS decision
rather than choosing silently.
```
