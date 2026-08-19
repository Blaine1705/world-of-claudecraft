# Phase 8 starter: QA, full Deed Heraldry family

Model: gpt-5.6-sol. Reasoning: xhigh. Final contribution QA and art-direction
gate. Fix forward only for confirmed gaps. Do not invent another design.

## Goal

Prove Deed Heraldry is a beautiful, coherent MMORPG reward across world,
player/target HUD, inspect, and picker while preserving accessibility,
fairness, performance, mobile behavior, and borderless cleanliness. Technical
green is necessary but not sufficient.

## Where to work

`/Users/fernando/Documents/wocc-deed-border-cartouche` on
`feature/deed-border-cartouche`, diff vs `origin/release/v0.39.0`.

Run `git status --short` first. Do not touch another worktree, base on `main`,
commit, push, or open a PR unless explicitly asked.

## Read first

- Root and applicable directory `CLAUDE.md` files.
- `implementation-plan.md` Phase 8, standing QA, E37-E58, and retained
  invariants from E1-E36.
- `art-direction.md`, `progress.md`, `state.md`, and both active-phase diffs.
- `docs/qa-gate.md` and `.agents/skills/woc-qa/SKILL.md`.
- `phase-01/`, `phase-03/`, and accepted `phase-05/` screenshots.

Use `$woc-qa`. Dispatch `woc_test_coverage` and `woc_frontend` after the parent
has deterministic evidence. Add another specialist only if the actual diff
touches its domain.

## Required live album

Capture under `docs/screenshots/deed-border-cartouche/phase-07/`:

- all four world seals at normal distance and tight crop
- Catalogue vs Eternal Spoils
- low vs high
- player and target frames wearing the same heraldry
- target with long localized title and Cheater tag
- inspect desktop, mobile, and parchment
- picker desktop, mobile, parchment, focus-visible, active, and None
- live preview of all four choices
- borderless world/player/target/inspect/picker controls

Wear each reward through the real Book of Deeds. Inspect a bordered player,
swap slugs, unequip, and reconnect. Judge nameplate distance before close craft.
Generated concepts never count as final evidence.

If a new visual option is truly required, use `$imagegen`, reference the failing
live screenshot, save the selected result under `direction/`, and record the
prompt. Do not use generated pixels in the runtime implementation.

## Craft gate

For nameplate, player frame, target frame, inspect, and picker, answer:

1. Crafted fantasy reward: midnight material, fine metal, believable hardware.
2. Same family: one seal/material system expressed at appropriate scale.
3. Four-way identity: color, seal silhouette, and pattern are distinct.
4. Still the original gameplay surface: no bar, marker, title, or state loss.
5. Worth enabling: passive recognition plus a satisfying interaction reveal.

Reject cheap yellow, thick chrome, motif noise over the name, checkbox hardware,
weak parchment contrast, generic badges, or a picker that hides the outcome.

## Checks and reviewers

Run both active-phase focused lists, proportional responsive/i18n/style tests,
and the canonical gate:

```text
node scripts/gate_select.mjs
```

Map E37-E58 to named decisive tests and audit every intentionally retired
E1-E36 literal. Record exact commands and outcomes, all reviewer findings, every
fix, screenshot paths, and remaining risks.

## Exit

Return READY / READY WITH NOTES / NOT READY plus the visual verdict SHIP / SHIP
WITH NOTES / NEEDS ANOTHER PASS. Mark Phase 8 complete only when both technical
and visual verdicts allow shipping. Only then may the operator open the PR.
