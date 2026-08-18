# Phase 2 starter: QA, chassis

Model: grok-4.6. Reasoning: xhigh. You are a QA session, not the
implementer of Phase 3. Fix confirmed Phase 1 gaps. Do not start motifs
or color retune.

## Goal

Prove Phase 1 did not miss a matrix row, a graphics-tier leak, a y-walk
desync, or a vacuous test. Commit before/after screenshots. Dispatch the
named reviewers. Close only when the coverage map and the selective gate
are green.

## Where to work

`/Users/fernando/Documents/wocc-deed-border-cartouche` on
`feature/deed-border-cartouche`.

## Read first

`implementation-plan.md` (Phase 2 + standing QA contract + matrix),
`progress.md`, `state.md`, the Phase 1 diff vs `origin/release/v0.39.0`,
`docs/qa-gate.md`, `.claude/skills/pr-screenshots/SKILL.md`,
`.agents/skills/woc-qa/SKILL.md`.

## Authorized

- Read-only review first. Then fix-forward only for confirmed coverage
  or correctness gaps in the chassis (tests, extraLift, declutter, scan).
- Capture and commit screenshots under
  `docs/screenshots/deed-border-cartouche/phase-01/` if the operator
  has authorized commits for this phase.
- Update the coverage map in `progress.md`.
- Run `node scripts/gate_select.mjs`.
- Spawn `qa-checklist`, `test-coverage-auditor`, `frontend-seam-reviewer`.

## Not authorized

- Phase 3 identity work.
- Weakening or deleting a Phase 1 test to go green.
- Push, PR, or issue unless the operator asks.

## Checks

The standing QA contract in `implementation-plan.md`. Fill every E1-E26
row in the coverage map with a real test name. Seed screenshot captures
at `graphicsPreset: 1` unless the shot is a low-vs-high comparison.

## Handoff

Phase 2 green: `state.md` points at `phase-03-identity.md`.
Phase 2 red: list the missing matrix ids and reviewer findings. Do not
open Phase 3.
