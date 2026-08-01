# Phase 1 QA: Fixed-cost waste

## Starter prompt

```
This is Phase 1 QA of the CI Speed packet.

Goal: adversarially verify Phase 1 did not weaken lint correctness, concurrency
safety, or pins, and that the fixed-cost targets are met or honestly deferred.

STEP 0: clean worktree on the Phase 1 branch (feature/ci-speed-fixed-costs or
the actual branch name). Sync latest release/** only if needed for comparison;
do not merge unrelated work mid-QA without noting it.

STEP 1: Explore agent reads docs/ci-speed/state.md, progress.md,
phase-01-fixed-cost-waste.md, the PR diff (gh pr diff), tests/ci_workflow.test.ts,
and the lint/browser/concurrency sections of ci.yml.

STEP 2: Verify each Phase 1 exit criterion with evidence:
- Lint: no fetch-depth: 0; base ref still correct for pull_request AND push
- Concurrency: cancel-in-progress true; release runs not cancellable by random PRs
  (quote the group key and reason about collision cases)
- Playwright cache: present; second run should hit or explain miss
- Pins: run npx vitest run tests/ci_workflow.test.ts; attempt at least one
  red-path thought experiment (what YAML edit would silently defeat a pin?)
- Timings: three lint checkout measurements ≤ 40s or FAIL/DEFER with numbers
- Packet docs present under docs/ci-speed/

STEP 3: Reviewers: privacy-security-review, test-coverage-auditor, then a
short qa-checklist pass scoped to Phase 1. Coverage-first.

STEP 4: Fix BLOCKING issues on the same branch. Update progress.md and
state.md. Mark the draft PR ready only on PASS (or PASS-WITH-FOLLOWUPS with
owner-visible DEFERRED rows).

Verdict format: PASS | FAIL | PASS-WITH-FOLLOWUPS with BLOCKING / SHOULD-FIX /
NICE-TO-HAVE lists and run ids.
```
