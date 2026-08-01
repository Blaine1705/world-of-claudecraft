# Phase 5: Path filters and packet close

Skip the full test matrix for docs/markdown/screenshot-only pull requests
while keeping full enforcement for any code-path change. Close the packet
with whole-packet QA; offer teardown of `docs/ci-speed/` only on owner
confirmation.

## Outcome

- A changes/filter job (or equivalent) classifies PRs as `code` vs docs-only.
- Docs-only PRs: lint (and cheap jobs) run; pr-gate matrix and heavy checks
  skip safely.
- Any `code` path change: full PR tier as today.
- Release/** pushes: always full release tier (no filter shortcuts).
- Whole-packet QA recorded; teardown offered, not forced.

## Scope

In: `.github/workflows/ci.yml`, `tests/ci_workflow.test.ts`, progress/state/
qa-checklist updates, optional tiny docs note in README of the packet.

Out: changing N; rebalancing files; larger runners; deleting the packet
without owner OK.

## Suggested branch

`feature/ci-speed-path-filters` off latest release/** after Phases 1 to 4
merge (or after 1, 2, 4 if 3 still open: path filters do not depend on
rebalance).

## Starter prompt

```
This is Phase 5 of the CI Speed packet: Path filters and packet close.

Goal: docs-only PRs skip the expensive test matrix without weakening code-PR
or release enforcement (D8, D10). Finish whole-packet QA. Offer teardown.

STEP 0 - PRE-FLIGHT:
- Worktree off latest release/**. Branch: feature/ci-speed-path-filters.
- Prefer Phases 1, 2, 4 merged so the final graph is stable.

STEP 1 - LOAD CONTEXT:
- state.md D8, D10, OPEN item 5; this phase file; qa-checklist.md
- Full ci.yml job graph after Phases 1 to 4
- Whether the org's branch protection treats skipped required checks as OK
  (if unknown, design an always-green-or-red aggregator job: ci-result)
- Prefer zero new third-party actions; dorny/paths-filter is allowed only with
  a one-line justification in progress.md (D10)

STEP 2 - DESIGN then implement:

Path sets (minimum):
- code: src/**, server/**, tests/**, headless/**, bot/**, scripts/**,
  package.json, package-lock.json, tsconfig*, vite*, vitest*, biome.json,
  .github/workflows/**, electron/**, android/**, ios/**, public/** (if
  gameplay-affecting assets should force tests; when unsure, include public/**
  in code to be safe)
- docs_only meaningful when code is false: docs/**, **/*.md, docs/screenshots/**

Behavior:
- pull_request + code false: skip pr-gate matrix, skip pr-checks (or keep a
  tiny subset if freshness is irrelevant); KEEP lint; browser-gate may skip
  if no browser tests/code touched
- pull_request + code true: full PR tier
- push to release/** or release-to-main PR: full release tier always
- push to main/dev: full PR tier (or same filters if safe; default full)

Branch protection:
- If skipped required checks fail the PR, add jobs.<name> aggregator
  `ci-result` that always runs, needs the conditional jobs with
  if: always(), and exits 0 only when every required job succeeded or was
  intentionally skipped. Pin this carefully.
- Document check names in the PR body (OPEN item 3/5).

Pins:
- Filter job outputs (or equivalent) covered by tests/ci_workflow.test.ts
  structure pins
- Assert release jobs do not gain path skip conditions
- Assert pr-gate has an if that includes the code filter without dropping the
  existing release-exclusion logic (compose carefully; do not break
  release-to-main routing)

STEP 3 - PROBES:
1) Docs-only commit on a probe branch/PR: pr-gate skipped, lint green
2) Code touch: full matrix runs
3) Do not use a real release/** push for filter tests if it would confuse
   version gates; reason about YAML instead or use a scratch branch

STEP 4 - WHOLE-PACKET QA:
- Fill docs/ci-speed/qa-checklist.md with PASS/FAIL/DEFERRED and evidence
- Reviewers: privacy-security-review, test-coverage-auditor, qa-checklist
- Update progress.md / state.md final status

STEP 5 - TEARDOWN OFFER:
- In the PR body and progress.md, offer to delete docs/ci-speed/ after all
  phase PRs merge, on explicit owner confirmation only. Do not delete in this
  phase unless the owner already confirmed in-session.

STOPPING RULES:
- Never path-filter away release-tier on release/**
- Never skip malware/typecheck/builds on code PRs
- Do not add dependencies other than an optional paths-filter action
```

## Exit criteria

- [x] Docs-only probe skips test matrix (design + probe; run ids in progress.md)
- [x] Code PR full matrix (phase push under code path set)
- [x] Release path unfiltered (exact RELEASE_IF_LINE; no needs.changes)
- [x] Pins green; aggregator only if needed (**not needed**: skipped release jobs already OK)
- [x] qa-checklist filled
- [x] Teardown offer recorded
- [x] Draft PR open (#2737); ready after Phase 5 QA
