# Phase 16 QA: Verify launcher + cell art

### QA Starter Prompt
```
ultracode

This is Phase 16 QA of the Reliquary Perfection packet.

Model: session default frontier at xhigh. Harness: Claude Code.
Worktree: /Users/fernando/Documents/wocc-reliquary-review, branch feature/reliquary-perfection.

STEP 0: canonical pre-flight + release sync. STEP 1: Explore agent on the phase diff.

STEP 2 - QA AUDIT (parallel, COVERAGE):
- Visual: view the actual rendered launcher (both entries, desktop + mobile tray) and
  one page per relic kind, owned and missing states, on a warm dev server; pixels, not
  DOM. Compare style coherence against sibling painted icons (book, professions).
- Pipeline: manifests regenerated via owning steps only (no hand-edits); asset budget
  green; webp sizes in family range.
- Contract: fallback compositor still reachable for genuinely unknown ids (runtime
  safety intact); silhouette CSS still communicates missing state for every kind;
  the per-kind resolver (if extracted) is registered as a pure helper with tests.
Dispatch: frontend-seam-reviewer + qa-checklist.

STEP 3 - FIX + fresh-agent fix review + node scripts/gate_select.mjs.
STEP 4 - DOCS. STEP 5 - PUSH on PASS + CI babysit + commit the art screenshots.
STEP 6 - FINAL RESPONSE: verdict, counts, deferrals, handoff to Phase 17.
```
