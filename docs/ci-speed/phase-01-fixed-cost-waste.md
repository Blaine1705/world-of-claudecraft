# Phase 1: Fixed-cost waste

Remove pure waste from non-test jobs and stop stacking PR runs, then land this
packet on the release base. No shard-count change.

## Outcome

- Lint checkout is shallow and typically ≤ 40s; Biome still diffs against the
  correct base.
- Pull request CI cancels superseded runs (D4).
- Browser-gate reuses a Playwright Chromium cache when possible.
- `docs/ci-speed/**` is in the tree so later phases do not bootstrap-copy.

## Scope

In: `.github/workflows/ci.yml` (lint, top-level concurrency, browser-gate),
`tests/ci_workflow.test.ts`, `docs/ci-speed/**`.

Out: matrix N, release-checks, path filters, test file splits, gate.mjs step
list changes (comments only if they mention lint checkout).

## Suggested branch / worktree

- Branch: `feature/ci-speed-fixed-costs`
- Worktree: off latest `release/**` (e.g.
  `/home/fernandoramirez/Documents/wt-ci-speed-phase-01`)
- Packet bootstrap: if `docs/ci-speed/` is missing, copy from
  `/home/fernandoramirez/Documents/world-of-claudecraft-ci-speed/docs/ci-speed`

## Starter prompt

```
This is Phase 1 of the CI Speed packet: Fixed-cost waste.

Goal: cut lint and browser fixed costs, add PR cancel-in-progress concurrency
without harming release runs, pin the new shapes, and land docs/ci-speed/ on
the release base. Do not change shard count or release-gate structure.

STEP 0 - PRE-FLIGHT:
- Create a clean worktree off the latest origin/release/** tip (fetch first).
  Suggested branch: feature/ci-speed-fixed-costs.
- If docs/ci-speed/ is absent, copy it from
  /home/fernandoramirez/Documents/world-of-claudecraft-ci-speed/docs/ci-speed.
- Read docs/ci-speed/state.md decisions D1 to D4, D12 to D14. Do not implement
  other phases.

STEP 1 - LOAD CONTEXT (Explore agent):
- docs/ci-speed/state.md, progress.md, brainstorm.md (lint and browser sections),
  this phase file
- .github/workflows/ci.yml (lint job, browser-gate, top of file triggers)
- tests/ci_workflow.test.ts
- scripts/gate.mjs (header comments only)
Return: exact lint checkout today; how base ref is resolved; whether any other
workflow already uses concurrency cancel-in-progress as a pattern
(desktop-publish, ota-publish, pr-ai); Playwright install line.

STEP 2 - EXECUTE:

1) Lint checkout (D12):
   - Remove fetch-depth: 0 from the lint checkout.
   - Keep default shallow checkout.
   - Ensure Biome --since still has a resolvable base:
     * pull_request: keep git fetch --depth=1 origin "$BASE_REF" and
       ref=origin/$BASE_REF
     * push: if BEFORE_SHA is all zeros or missing, use a shallow fetch of
       HEAD~1 or the default branch as needed; do not reintroduce full history
     * Prove locally that biome ci --changed --since works against the chosen
       ref shape when possible
   - Update the comment that currently claims full history is required.

2) Concurrency (D4):
   - Add a workflow-level concurrency block that cancels in-progress PR runs
     for the same ref/workflow.
   - Isolate release/** pushes and release-to-main PRs from ordinary PR
     cancellation (group key must include event name and/or ref kind).
   - Prefer matching an existing repo pattern from desktop-publish.yml or
     pr-ai.yml if one fits.

3) Browser-gate Playwright cache:
   - Cache the Playwright browser path (Chromium) keyed on the Playwright
     version from package-lock or the install output.
   - Keep npx playwright install --with-deps chromium but make it cheap on
     cache hit (install with a condition or rely on cache restore + install
     no-op). Document the chosen approach in the step name/comments.
   - Do not expand browser tests.

4) Pins (D13): same commit(s) as the YAML:
   - tests/ci_workflow.test.ts must fail if fetch-depth: 0 returns on lint
   - must require a concurrency: block with cancel-in-progress: true
   - must require a Playwright cache step (or the exact durable marker you add)
   - Keep existing pins green; do not weaken them

5) Land docs/ci-speed/** as they stand (this packet), plus progress/state
   updates for Phase 1.

STEP 3 - VALIDATE:
- npx vitest run tests/ci_workflow.test.ts
- npx @biomejs/biome check --write on touched TS/YAML if needed (changed files
  only; never whole-repo --write)
- Push branch; open DRAFT PR against the release base with the PR template
- Record three CI runs' lint checkout seconds in docs/ci-speed/progress.md
  (target: checkout ≤ 40s, job ≤ 90s typical). If GitHub is slow to schedule,
  record what you have and leave a clear gap for QA.

STEP 4 - REVIEW:
- privacy-security-review (ci.yml)
- test-coverage-auditor (pins)
- Do not mark ready; Phase 1 QA does that.

STEP 5 - HANDOFF:
- Update progress.md checklist and state.md current phase line
- Commit with Conventional Commits (ci(gate) / test(ci) / docs(ci-speed)); body
  required; no em/en dashes or emojis
- Explicit paths only

STOPPING RULES:
- If Biome --changed cannot see the base without full history, stop and record
  the failure mode; try fetch of the single base commit with depth 1 before
  any fetch-depth: 0 compromise. A compromise needs owner OK in state.md.
- Do not touch matrix.shard or release-gate structure.
```

## Tests

- Extend `tests/ci_workflow.test.ts` for lint depth, concurrency, browser cache.
- No new production modules expected.

## Validation commands

```bash
npx vitest run tests/ci_workflow.test.ts
# after push: gh run list --branch feature/ci-speed-fixed-costs --limit 5
```

## Exit criteria

- [ ] Lint no longer uses `fetch-depth: 0`
- [ ] Concurrency cancels PR supersessions; release isolated
- [ ] Playwright cache wired
- [ ] Pins green and red-path proven where practical
- [ ] Packet docs on the branch
- [ ] Three-run lint timing recorded (or gap noted for QA)
- [ ] Draft PR open

## State for Phase 2

Phase 2 assumes lint is no longer a multi-minute spike competitor on the same
run graph, so wall measurements reflect the test matrix.
