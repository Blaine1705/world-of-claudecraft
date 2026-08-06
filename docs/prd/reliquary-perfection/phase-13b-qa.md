# Phase 13b QA: Verify complete source coverage

### QA Starter Prompt
```
ultracode

This is Phase 13b QA of the Reliquary Perfection packet.

Model: session default frontier at xhigh. Harness: Claude Code.
Worktree: /Users/fernando/Documents/wocc-reliquary-review, branch feature/reliquary-perfection.

STEP 0: canonical pre-flight + release sync. STEP 1: Explore agent on the phase diff.

STEP 2 - QA AUDIT (parallel, COVERAGE):
- Content truth: independently re-derive every authored hint against the live
  award tables (multi-boss loot, delve chests and shops, rift progression,
  quest rewards, the store catalog, the activity table); the pending list must
  be exactly the two owner-gap mounts and nothing else, both directions.
- Correctness: multi-source relics render EVERY source (tooltip lines and the
  joined aria) in authored order; boss+zone composes one line; a stale or
  fabricated id in any new arm renders '' and never raw text; the resolver
  never merges relic hints with a page default.
- i18n: every new key filled in all five non-Latin locales with real values;
  the aria join goes through a key, never hardcoded punctuation; bundles
  regenerated and committed together.
- Test-decisiveness: mutation-check at least one truth pin per NEW kind and
  one multi-source behavioral case (drop one boss from a dual-table relic in
  scratch; the suite must redden), proving the tests ran.
Dispatch: architecture-reviewer + frontend-seam-reviewer + test-coverage-auditor
+ qa-checklist.

STEP 3 - FIX + fresh-agent fix review + node scripts/gate_select.mjs.
STEP 4 - DOCS. STEP 5 - PUSH on PASS + CI babysit + recapture the page-detail
screenshots (desktop + mobile) per the pr-screenshots skill.
STEP 6 - FINAL RESPONSE: verdict, counts, deferrals, handoff to Phase 14.
```
