# Phase 22 QA: Final packet QA + teardown offer

### QA Starter Prompt
```
ultracode

This is Phase 22 QA of the Reliquary Perfection packet: the FINAL phase.

Model: session default frontier at xhigh. Harness: Claude Code.
Worktree: /Users/fernando/Documents/wocc-reliquary-review, branch feature/reliquary-perfection.

Goal: whole-feature verification of everything phases 10 to 22 shipped, the full gate,
and the packet close.

STEP 0: canonical pre-flight + release sync (final release-merge-audit).

STEP 1: Explore agent on state.md (the full surfaces ledger), progress.md, and
docs/prd/reliquary-perfection/qa-checklist.md (the whole-feature matrix: this QA
executes it item by item).

STEP 2 - WHOLE-FEATURE AUDIT (Workflow: one verifier per qa-checklist.md line, plus):
- Re-run the ORIGINAL review's checklist: every item the maintainer asked for on
  2026-08-05 (character panel, nameplate/portrait chrome, inspect, tracker, clickable
  combat log, recent section, obtain counts, rewards, coverage, performance) must now
  verify as implemented with file:line evidence: produce the closing table.
- Full gate: npm run gate (release-tier fires on nothing here; the branch targets
  release/v0.35.0). Run it via the background-gate memory rules (no tail pipe; flakes
  rotate: isolate and re-run contended suites).
- A fresh qa-checklist agent over the WHOLE packet diff
  (git diff e0445ff5d4..HEAD) at flagship depth, plus one final adversarial
  "what is missing" sweep seeded with the unverifiedClaims list from the original
  review workflow (in the session record) to confirm each was resolved by some phase.
- CI: after the final push, PR #2976 fully green (AI checks excluded).

STEP 3 - FIX anything found (fresh-agent fix review; re-gate).

STEP 4 - DOCS: progress.md complete; state.md final; the closing checklist table into
the PR body (via the Phase 22 draft process: show the maintainer, then gh pr edit).

STEP 5 - PUSH: final git push origin HEAD:feature/reliquary; babysit CI to green.

STEP 6 - PACKET TEARDOWN: surface every deferred rider first (release re-pin chore
text, i18n locale-fill worklist, Steam/Epic portal task, the bags-only mounts
follow-up if the maintainer wants it, anything progress.md deferred). Then ask the
maintainer explicitly: "All phases are complete and green. OK to delete
docs/prd/reliquary-perfection/ before merge?" Delete ONLY on confirmation
(git rm -r docs/prd/reliquary-perfection/ + commit "docs: remove reliquary-perfection
planning scaffolding"). If declined, leave it.

STEP 7 - FINAL RESPONSE: verdict (PASS / FAIL), the closing checklist table, gate +
CI status, rider list, teardown state, and "packet complete". Merging the PR remains
the maintainer's action (never gh pr merge unasked).

STOPPING RULES: stop and surface if the full gate is red for a cause outside the
packet (inherited release drift gets reported, not silently re-pinned).
```
