# Phase 2 QA: Shard count

## Starter prompt

```
This is Phase 2 QA of the CI Speed packet.

Goal: verify N is justified by measurement, pins cannot silently shrink the
suite, completeness holds, and the ≤ 8 min bar is met or cleanly deferred.

Checks:
1. state.md records locked N and the measurement rows exist in progress.md
2. pr-gate and release-gate both use the same N; fail-fast false; npm test
   shard lines; half-core maxWorkers still present
3. tests/ci_workflow.test.ts green; attempt to describe two YAML regressions
   the pins would catch (wrong /N, missing matrix entry)
4. gate.mjs has no --shard
5. Three consecutive green walls ≤ 480s, or DEFERRED to Phase 3 with numbers
   (not a silent PASS)
6. Completeness arithmetic shown for at least one release-tier or PR-tier run
7. Branch-protection note present in PR body

Reviewers: privacy-security-review, test-coverage-auditor, qa-checklist (scoped).
Fix BLOCKING on branch. Mark ready only on PASS / PASS-WITH-FOLLOWUPS.
```
