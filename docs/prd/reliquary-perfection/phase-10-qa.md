# Phase 10 QA: Verify sim correctness close-out

### QA Starter Prompt
```
ultracode

This is Phase 10 QA of the Reliquary Perfection packet.

Model: session default frontier at xhigh. Harness: Claude Code.
Worktree: /Users/fernando/Documents/wocc-reliquary-review, branch feature/reliquary-perfection.

Goal: audit Phase 10 (hidden-deed removal, retro-safe join, sim robustness) for
correctness, decisive tests, dead code, determinism, and parity.

STEP 0: canonical pre-flight + release sync (implementation-plan.md Step 0). Phase 10
must already be committed; if the tree is dirty, ask the user.

STEP 1: Explore agent summarizes state.md, progress.md, phase-10-sim-correctness.md,
and `git diff <phase-10-start>..HEAD` (find the start commit from the merge-sync commit
message). Return: every deliverable vs what actually landed.

STEP 2 - QA AUDIT (parallel agents, COVERAGE not filtering):
- Correctness agent: every Phase 10 acceptance criterion re-verified against the real
  code; specifically hunt (a) any remaining surface where a hidden deed's name, title
  text, or existence leaks (window cells, tooltips, aria, wiki, public sheet, chat),
  (b) any join-origin path that still emits an unflagged event or grants an unflagged
  bridge deed (trace seedItemDiscovery, retroFallbackGrants, syncReliquaryMarksFromVisited,
  the mount arm, AND the Horizons title-deed grant path), (c) the ownedMounts throw:
  confirm no production caller can now throw on a legitimately partial meta (search all
  callers), (d) the retro summary line: correct key, correct count, no banner/sound.
- Test-decisiveness agent (READ the test-pin trap index memory first): would each new
  test fail if the fix were reverted? Mutation-check the three load-bearing ones by
  actually reverting the guard in a scratch copy (never commit the revert): the retro
  flag thread, the hidden-title filter, the pushRecent guard. Prove the tests RAN.
- Cleanup agent: dead code, unused imports, orphaned test fixtures, comment accuracy
  (deeds.ts:600, module headers), literal totals consistency across every suite.
Dispatch reviewers per the matrix (sim + wire changed: architecture-reviewer,
cross-platform-sync) plus qa-checklist.

STEP 3 - FIX: apply every BLOCKING and SHOULD-FIX; run the Phase 10 validation matrix
plus node scripts/gate_select.mjs. Remember: the review-fix round is itself unreviewed
code; have a fresh agent read the fix diff before committing.

STEP 4 - DOCS: progress.md (Phase 10 QA verdict, fixes, deferrals), state.md drift.

STEP 5 - PUSH: on PASS, git push origin HEAD:feature/reliquary (never force; on
non-fast-forward, fetch + merge origin/feature/reliquary, re-gate, push). Babysit PR
#2976 CI (AI checks never gate; CANCELLED = failure).

STEP 6 - FINAL RESPONSE: verdict (PASS / PASS-WITH-FOLLOWUPS / FAIL), counts found and
fixed, deferred items, pushed or not, one-line handoff for Phase 11.

STOPPING RULES: stop and surface if any BLOCKING fix would change the locked retro
policy or the hidden-deed ruling.
```
