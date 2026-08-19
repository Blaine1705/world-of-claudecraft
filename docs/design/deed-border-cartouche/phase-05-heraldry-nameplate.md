# Phase 5 starter: world Deed Heraldry

Model: gpt-5.6-sol. Reasoning: xhigh. Do not lower the model or reasoning
setting. This is the active implementation phase after the Phase 4 visual pivot.
Do not start Phase 6 QA or Phase 7 social-surface work.

## Goal

Replace the technically correct but visually rejected world cartouche with the
approved Deed Heraldry token: one readable forged seal attached to a quiet
midnight name ribbon. The name remains the hero. The title returns to its
secondary line. Land decisive tests for E37-E46 and an honest supersession map
for the old cartouche pins.

## Where to work

Worktree: `/Users/fernando/Documents/wocc-deed-border-cartouche`
Branch: `feature/deed-border-cartouche`
Diff base: `origin/release/v0.39.0`

Do not edit another worktree. Do not base on `main`. Run
`git status --short` first and preserve unrelated work. Do not commit, push, or
open a PR unless the operator explicitly asks.

## Read first

- Root `CLAUDE.md` and the local `CLAUDE.md` for every directory touched.
- `implementation-plan.md` active direction, E37-E46, Phase 5, and standing QA.
- `art-direction.md` and its approved concept image.
- `progress.md` and `state.md`.
- `DESIGN.md` sections 1, 3, 4, 7.13, and 13.
- Live code and tests: `src/ui/deed_border_view.ts`,
  `src/render/nameplate_cartouche_core.ts`,
  `src/render/nameplate_canvas.ts`, `src/render/nameplate_declutter.ts`,
  `tests/nameplate_cartouche_core.test.ts`,
  `tests/nameplate_canvas.test.ts`, `tests/nameplate_ai_tag.test.ts`,
  `tests/nameplate_declutter.test.ts`, `tests/deed_border_accent.test.ts`,
  `tests/architecture.test.ts`, and `tests/monolith_budget.test.ts`.

Judge the approved image's hierarchy, not its incidental mockup text. Do not
invent a new name, slug, deed, title, motif, or lore label.

## Authorized

- Add `src/render/nameplate_heraldry_core.ts` and its focused test.
- Move normalized seal primitives to one static, allocation-free owner that the
  renderer can consume without reversing the existing dependency direction.
- Rewire the nameplate canvas to draw seal + shallow ribbon + fine structural
  edge and approved minimal joint/rivet details.
- Remove the world perimeter, corner brackets, central clasp, and tiny side
  motif after the new path is active.
- Restore title-on-secondary-line behavior for a worn reward.
- Remeasure named pad, seal, radius, alpha, `extraLift`, and declutter values.
- Replace intentionally obsolete cartouche tests with decisive E37-E46 tests;
  record every replacement in `progress.md`.
- Update the nameplate screenshot target label/dependencies for Phase 6.
- Update `progress.md` and `state.md` at handoff.

## Not authorized

- Player/target DOM header, portrait restyle, inspect banner, picker redesign,
  new i18n, or Phase 7 work.
- New slugs, deeds, motifs, silhouettes, 3D rewards, sparkles, or animation.
- Wrapping or recoloring guild, HP, resource, cast, combo, markers, or emotes.
- Runtime PNG/SVG frames or generated art. The approved concept is reference
  only; shipping world UI remains code-native shapes.
- Sim, server, wire, world API, or `IWorld` changes. Stop if one seems needed.
- Keeping the old and new geometry as parallel active implementations.
- Weakening an old test without documenting which new acceptance row replaces
  its invariant.

## Implementation contract

1. Write failing E37-E46 tests first.
2. The new pure core fills caller-owned geometry. No per-plate allocation.
3. The forged seal is about 16-18 CSS px and sits left of the name ribbon. Its
   motif silhouette must use the existing catalogue/vault/ward/laurel identity.
4. The ribbon owns the name row only. It uses the shared midnight material and
   at most a fine antique edge. It cannot close into a full perimeter around
   name + title.
5. Center the text/badge group on `screenX`; attach the seal without letting it
   pull the readable name off center.
6. Both y-walks consume one named `extraLift`. Remeasure declutter from the new
   extents and pin accepted literals.
7. Preserve low-tier identity, forced colors, borderless behavior, reaction
   color, current-target sizing, dead/stealth/self-hide, and no-sprite behavior.
8. Keep `nameplate_canvas.ts` below its monolith ceiling.

## Checks

```text
npx tsc --noEmit
npx vitest run tests/nameplate_heraldry_core.test.ts tests/nameplate_canvas.test.ts tests/nameplate_ai_tag.test.ts tests/nameplate_declutter.test.ts tests/deed_border_accent.test.ts tests/architecture.test.ts tests/monolith_budget.test.ts
npx @biomejs/biome check --write <changed files>
```

Run additional proportional tests selected by the real diff. Report exact
commands and outcomes. If a check cannot run, say why.

## Handoff

Phase 5 ends when E37-E46 are green, there is one active geometry core, the old
test supersession map is explicit, and no social-surface work leaked in. Update
`state.md` to `phase-06-qa-heraldry-nameplate.md`. Do not start Phase 6 in the
same session unless the operator asks.
