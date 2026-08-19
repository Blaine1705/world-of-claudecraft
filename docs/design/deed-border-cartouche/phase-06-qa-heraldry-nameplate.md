# Phase 6 starter: QA, world Deed Heraldry

Model: gpt-5.6-sol. Reasoning: xhigh. You are the independent QA and craft
review session. Do not start Phase 7. Fix forward only for confirmed Phase 5
gaps.

## Goal

Prove the world token is beautiful at normal nameplate distance, not merely
correct in a close crop. Audit E37-E46, the old-test supersession map, geometry,
declutter, tier fairness, forced colors, and the allocation contract. Capture
the live Phase 5 album and refuse the phase if the seal is generic, the ribbon
is another cartouche, or color is the only identity.

## Where to work

`/Users/fernando/Documents/wocc-deed-border-cartouche` on
`feature/deed-border-cartouche`, diff vs `origin/release/v0.39.0`.

Run `git status --short` first. Do not edit another worktree. Do not commit,
push, or open a PR unless explicitly asked.

## Read first

- Root and applicable directory `CLAUDE.md` files.
- `implementation-plan.md` Phase 6, standing QA, and E37-E46.
- `art-direction.md`, `progress.md`, and `state.md`.
- `docs/qa-gate.md` and `.agents/skills/woc-qa/SKILL.md`.
- The Phase 5 diff and every changed test.
- Existing `phase-01/` and `phase-03/` albums for before/current comparison.

Use `$woc-qa`. Dispatch the read-only `woc_test_coverage` and `woc_frontend`
reviewers after deterministic checks are available. The parent integrates and
verifies findings.

## Required evidence

Capture booted-client screenshots under
`docs/screenshots/deed-border-cartouche/phase-05/`:

- all four slugs at normal town distance on low graphics
- all four seal crops, only after the distance read passes
- Catalogue next to Eternal Spoils
- current-target-sized world plate
- title, no-title, long Unicode, and all-badge cases
- borderless control
- low vs high
- two nearby bordered players after declutter

Wear the rewards through the real Book of Deeds flow when practical. Judge the
world view first, then crop. Run a grayscale check on the four seals. Generated
concepts cannot substitute for live proof.

If a new direction image is genuinely needed to resolve a visual blocker, use
the `$imagegen` skill, reference the live screenshot, save the chosen result
under `docs/screenshots/deed-border-cartouche/direction/`, and record its final
prompt. Do not generate an image to conceal a weak implementation.

## Acceptance questions

1. Does the name read first, the seal second, and the metal third?
2. Are all four seal silhouettes distinct without color?
3. Is the ribbon quiet and shallow, with no full perimeter or thick yellow?
4. Are title, guild, bars, markers, and emotes outside and unchanged?
5. Is borderless clean?
6. Are low and high the same identity, with only bloom allowed to differ?
7. Does the hot path stay allocation-free and sprite-free?
8. Does it look worth enabling in a crowded MMORPG town?

## Checks

Run the Phase 5 list, the canonical selected regression set, and:

```text
node scripts/gate_select.mjs
```

Record exact commands, outcomes, screenshot paths, reviewer findings, and any
fix-forward work in `progress.md`.

## Handoff

Exit SHIP / SHIP WITH NOTES / NEEDS ANOTHER PASS for the world token. Only SHIP
or SHIP WITH NOTES may advance. Then point `state.md` at
`phase-07-social-reveal.md`. Do not open a PR; the feature is incomplete until
Phase 8.
