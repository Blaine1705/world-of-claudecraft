# Phase 4 QA: Release-checks split

## Starter prompt

```
This is Phase 4 QA of the CI Speed packet.

Goal: prove release-tier enforcement is intact and parallelized correctly.

Checks:
1. release-checks if-condition matches release-gate; no needs edges
2. Every former shard-1 step lives on release-checks exactly once
3. release-gate has I18N_RELEASE_TIER job-level env and only test steps
4. pr-checks / pr-gate unchanged in enforcement
5. tests/ci_workflow.test.ts green; count pins match YAML
6. Live release probe green OR explicit DEFERRED note with owner-visible risk
7. gate.mjs still serial full suite

Reviewers: privacy-security-review, test-coverage-auditor, qa-checklist.
Fix BLOCKING. Mark ready on PASS.
```
