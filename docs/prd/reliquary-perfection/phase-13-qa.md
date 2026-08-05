# Phase 13 QA: Verify window structure + information UX

### QA Starter Prompt
```
This is Phase 13 QA of the Reliquary Perfection packet.

Model: session default frontier at xhigh. Harness: Claude Code.
Worktree: /Users/fernando/Documents/wocc-reliquary-review, branch feature/reliquary-perfection.

STEP 0: canonical pre-flight + release sync. STEP 1: Explore agent on the phase diff.

STEP 2 - QA AUDIT (parallel, COVERAGE):
- Correctness: source hints resolve for every authored sourceId in every overlay
  locale; the nearly rule boundary cases (remaining exactly 3, ratio exactly 0.6);
  search matches localized names not raw ids; the owned filter and search compose;
  focus restore across a filtered rebuild.
- Perf/contract: hud_perf_budget still sorts the window cold; the search box does not
  introduce a per-keystroke full rebuild without debounce or signature short-circuit;
  no new forced-reflow reads (check offsetHeight/scrollTop/getBoundingClientRect in the
  diff).
- A11y: roving tabindex or aria-label completeness actually delivers clear#, source,
  and owned state without hover; run the browser a11y suite if runnable.
- Test-decisiveness: mutation-check the source-hint coverage test and one behavioral
  case (break focus restore in scratch; the suite must redden).
Dispatch: frontend-seam-reviewer + test-coverage-auditor + qa-checklist.

STEP 3 - FIX + fresh-agent fix review + node scripts/gate_select.mjs.
STEP 4 - DOCS. STEP 5 - PUSH on PASS + CI babysit + capture updated window screenshots
(desktop + mobile) into docs/screenshots/reliquary/ per the pr-screenshots skill.
STEP 6 - FINAL RESPONSE: verdict, counts, deferrals, handoff to Phase 14.
```
