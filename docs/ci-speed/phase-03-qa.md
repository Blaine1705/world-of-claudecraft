# Phase 3 QA: Shard rebalance

## Starter prompt

```
This is Phase 3 QA of the CI Speed packet.

Goal: prove splits were pure (no assertion loss), balance meets D11, and
completeness still holds under locked N.

Checks:
1. Diff is test moves/splits only (or justified util extract); no silent test
   deletions (compare test name counts or it() counts before/after on touched
   suites)
2. Shard simulation evidence exists in progress.md or the PR body
3. Worst Duration within 20% of median on recorded runs
4. Completeness arithmetic
5. Wall ≤ 8 min; note stretch ≤ 6
6. No N change; no bare vitest; gate still unsharded

Reviewers: test-coverage-auditor, qa-checklist. Fix BLOCKING. Mark ready on PASS.
```
