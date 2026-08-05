# Phase 15 QA: Verify deep links, chat, tracker, guide search

### QA Starter Prompt
```
This is Phase 15 QA of the Reliquary Perfection packet.

Model: session default frontier at xhigh. Harness: Claude Code.
Worktree: /Users/fernando/Documents/wocc-reliquary-review, branch feature/reliquary-perfection.

STEP 0: canonical pre-flight + release sync. STEP 1: Explore agent on the phase diff.

STEP 2 - QA AUDIT (parallel, COVERAGE):
- Correctness: openWithPage from every entry point (chat relic line, illumination line,
  rank line, recent chip, nearly row, shelf card) including while the window is already
  open on another page; focus placement; the retro summary line stays non-clickable.
- Perf: the tracker in the per-frame bucket with write-elision PROVEN (mutation-check:
  make the view always-dirty in scratch; the elision pin must redden); no per-frame
  allocation in the tracker paint path; hud_perf_budget green.
- Parity: if any facet member was added, both worlds implement it and the pin moved;
  if pinned pages live in settings, confirm offline and online sessions both persist.
- Guide: search corpus regenerated, freshness gate green, hidden-filter intact.
Dispatch: frontend-seam-reviewer + test-coverage-auditor + qa-checklist (+
cross-platform-sync if the facet moved).

STEP 3 - FIX + fresh-agent fix review + node scripts/gate_select.mjs.
STEP 4 - DOCS. STEP 5 - PUSH on PASS + CI babysit + tracker screenshots.
STEP 6 - FINAL RESPONSE: verdict, counts, deferrals, handoff to Phase 16.
```
