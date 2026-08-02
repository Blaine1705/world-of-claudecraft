# Phase 12 (impl) starter: Final QA and packet close

Paste the fenced block below into a fresh agent session.

### Starter Prompt

```
This is Phase 12 of the Local Gate Performance packet: final QA, doc sync, and teardown offer.

GOAL: Prove the evolved local gate path is green, documentation matches reality, experiment-log is complete, and decide whether to keep or slim the packet directory for the PR.

WORKTREE AND BASE (mandatory):
1. /Users/fernando/Documents/wocc-gate-perf-research
2. git fetch origin release/v0.34.0 && git merge origin/release/v0.34.0
3. feature/local-gate-perf

READ:
- progress.md all phases
- experiment-log.md
- state.md ledger
- docs/qa-gate.md, CONTRIBUTING.md, README.md (root) for drift

QA CHECKLIST:
1. Full merge-bar command green: npm run gate (or pnpm run gate if migrated) with documented workers
2. gate:fast (or equivalent) green and documented
3. CI workflow still consistent with local scripts (shards, package manager)
4. No em/en dashes or emojis introduced by this packet
5. tests/ci_workflow.test.ts and gate_workers tests green if those files changed earlier
6. Run $woc-qa / qa-checklist style review over the cumulative diff vs origin/release/v0.34.0
7. baselines.md has at least one complete machine story and post-phase deltas where work was kept

TEARDOWN OFFER:
- Option A: keep docs/local-gate-perf as living contributor guidance (trim phase starters later)
- Option B: move a short permanent note to docs/qa-gate.md / CONTRIBUTING and delete phase starters
- Record owner choice in state.md; do not delete without decision

DELIVERABLES:
- progress Phase 12 complete
- state.md current phase = complete / ready for PR
- PR-oriented summary in state.md or a SHORT docs/local-gate-perf/HANDOFF.md (what changed, how to measure, remaining OPEN)
- Commit

DO NOT: force-push release; open PR unless user asks.

STOP IF: full gate red for reasons unrelated to this packet; bisect and fix or document blocker.
```
