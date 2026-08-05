# Phase 11 QA: Verify page-name localization + i18n hygiene

### QA Starter Prompt
```
This is Phase 11 QA of the Reliquary Perfection packet.

Model: session default frontier at xhigh. Harness: Claude Code.
Worktree: /Users/fernando/Documents/wocc-reliquary-review, branch feature/reliquary-perfection.

Goal: audit Phase 11 (reliquary_i18n channel, dead key removal, glossary alignment).

STEP 0: canonical pre-flight + release sync. STEP 1: Explore agent on state.md,
progress.md, phase-11-page-i18n.md, and the phase diff.

STEP 2 - QA AUDIT (parallel, COVERAGE):
- Correctness agent: grep-sweep for any remaining raw page-name render (`.name` reads
  on page/nearly/detail models feeding esc()/aria/t() params); verify the resolver
  falls back safely for an unknown page id; verify dungeon-name consistency between
  reliquary_i18n overlays and tEntity for every dungeon-backed page in all five
  overlay locales; verify the i18n regen left no stray diff (i18n baseline memory:
  the sha256 re-baseline must be in the same commit).
- i18n-trap agent (read the i18n trap memories first): catalog locale blocks are inert
  (confirm fills landed in the right files); no English left in overlays; pending.ts
  delta is exactly the removed key; M16 satisfied for any new wordy leaf.
- Test-decisiveness agent: mutation-check the "no unresolved page name" pin (revert one
  render site in scratch; the test must fail; prove it ran).
Dispatch: frontend-seam-reviewer + qa-checklist.

STEP 3 - FIX (fresh-agent review of the fix diff), validation matrix +
node scripts/gate_select.mjs. STEP 4 - DOCS. STEP 5 - PUSH on PASS
(git push origin HEAD:feature/reliquary; babysit CI).

STEP 6 - FINAL RESPONSE: verdict, counts, deferrals, pushed or not, handoff to Phase 12.
```
