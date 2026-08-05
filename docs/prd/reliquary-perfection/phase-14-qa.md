# Phase 14 QA: Verify Overview flagship + celebration

### QA Starter Prompt
```
ultracode

This is Phase 14 QA of the Reliquary Perfection packet.

Model: session default frontier at xhigh. Harness: Claude Code.
Worktree: /Users/fernando/Documents/wocc-reliquary-review, branch feature/reliquary-perfection.

STEP 0: canonical pre-flight + release sync. STEP 1: Explore agent on the phase diff.

STEP 2 - QA AUDIT (parallel, COVERAGE):
- Visual: open the real Overview on a warm dev server, desktop and mobile viewports,
  empty ring AND populated ring states; compare against the committed screenshots
  (screenshot-dom-check-is-not-a-frame-check memory: verify pixels, not DOM).
- Contract: cold-painter discipline (no timers, animationend cleanup verified, no
  forced reflow added), signature dimensions complete (a shelf-card recent change with
  identical totals must repaint; mutation-check), write-elision unaffected.
- i18n: the two new notes + hints in the catalog, M16 evaluated, no concat.
- A11y: strips and cards keyboard-navigable; celebration conveys state change to
  screen readers (the polite announcer or aria-live equivalent already used by
  banners).
Dispatch: frontend-seam-reviewer + qa-checklist.

STEP 3 - FIX + fresh-agent fix review + node scripts/gate_select.mjs.
STEP 4 - DOCS. STEP 5 - PUSH on PASS + CI babysit + refresh the committed Overview
screenshots if fixes changed pixels.
STEP 6 - FINAL RESPONSE: verdict, counts, deferrals, handoff to Phase 15.
```
