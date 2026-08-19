# Phase 7 starter: Deed Heraldry social reveal

Model: gpt-5.6-sol. Reasoning: xhigh. Do not lower the model or reasoning
setting. Do not start until Phase 6 has accepted the world token. Do not perform
Phase 8 final QA in this session.

## Goal

Carry the accepted world identity into the player and target HUD, inspect, and
Book of Deeds picker. The same seal and material must feel richer on interaction
without reskinning gameplay bars. Land decisive E47-E58 tests.

## Where to work

`/Users/fernando/Documents/wocc-deed-border-cartouche` on
`feature/deed-border-cartouche`, diff vs `origin/release/v0.39.0`.

Run `git status --short` first. Preserve unrelated work. Do not edit another
worktree, base on `main`, commit, push, or open a PR unless explicitly asked.

## Read first

- Root and applicable directory `CLAUDE.md` files, especially `src/ui/CLAUDE.md`
  and `src/styles/CLAUDE.md`.
- `implementation-plan.md` Phase 7, E47-E58, and standing QA.
- `art-direction.md`, the accepted `phase-05/` album, `progress.md`, and
  `state.md`.
- `DESIGN.md` sections 1, 3, 4, 7.2, 7.13, 8, 12, and 13.
- Live seams: `src/ui/deed_border_view.ts`, `src/ui/unit_frame.ts`,
  `src/ui/unit_frame_painter.ts`, `src/ui/hud.ts`, `index.html`,
  `src/styles/hud.css`, `src/ui/inspect_view.ts`,
  `src/ui/inspect_window.ts`, `src/styles/shell.css`,
  `src/ui/deeds_view.ts`, `src/ui/deeds_window.ts`,
  `src/styles/components.css`, and their focused tests.

## Authorized

- Add motif/custom-property fields required by cold surfaces while keeping one
  canonical slug mapping.
- Add a player/target name-header host through the existing unit-frame painter
  seam and elided writers.
- Place the canonical seal at the portrait/name joint. Pattern only the name
  header. Refine the circular ring and remove the hollow top clasp.
- Extend inspect view data with the existing localized granting-deed name and
  build the ceremonial banner.
- Replace picker stripes with the canonical seal and material sample, keep None
  empty, and add event-driven world + interaction previews.
- Add necessary localized/a11y copy under the current M16 contract.
- Update deeds, Reliquary, and graphics-fairness design docs to the implemented
  Deed Heraldry behavior.
- Extend screenshot recipes for Phase 8.
- Add decisive E47-E58 tests and update `progress.md` / `state.md`.

## Not authorized

- New slugs, deeds, motifs, family silhouettes, lore, or reward eligibility.
- Full player/target frame restyle; HP, resource, absorb, cast, elite, level,
  combat, sanctions, debuffs, and target-of-target remain standard.
- Party, pet, NPC, mob, or object heraldry.
- 3D capes, mounts, sparkles, or continuous animation.
- Generated runtime art. Reuse the code-native seal identity accepted in Phase 6.
- Sim, server, wire, world API, or `IWorld` changes.
- Equipping a reward merely because a picker row receives hover/focus/preview.
- Committing Phase 8 screenshots unless the operator specifically asks.

## Implementation contract

1. Write failing E47-E58 tests before each surface.
2. One palette/motif mapping drives world, player, target, inspect, and picker.
3. Player and target use the same painter family. Only player and valid player
   targets receive heraldry; optional element refs keep other instances free.
4. Portraits remain circles. The joint seal is the hardware focus. Keep level and
   combat overlays above the ring and seal where their semantics require it.
5. The target name retains ellipsis, title, sanction, and reaction color.
6. Inspect uses the real deed name and existing title. Pattern is quiet, gold is
   a hairline, and the paperdoll remains the main content.
7. Picker rows retain `.deed-title-option`, focus-visible, aria-pressed, and the
   40x40 mobile floor. Preview is event-driven and does not equip.
8. Parchment and forced colors are first-class. Only bloom may scale by tier.
9. Any new visible string uses `t()` and completes the required locale work.

## Checks

```text
npx tsc --noEmit
npx vitest run tests/deed_border_accent.test.ts tests/nameplate_heraldry_core.test.ts tests/nameplate_canvas.test.ts tests/deeds_border_picker.test.ts tests/inspect_window.test.ts tests/inspect_view.test.ts tests/unit_frame_painter.test.ts tests/unit_frame.test.ts tests/localization_fixes.test.ts tests/i18n_completeness.test.ts tests/architecture.test.ts tests/monolith_budget.test.ts
npx @biomejs/biome check --write <changed files>
```

Run additional proportional tests selected by the real diff and report exact
outcomes.

## Handoff

Phase 7 ends when E47-E58 pass, the same family mapping drives every surface,
all gameplay semantics are untouched, and no Phase 8 evidence is being claimed.
Point `state.md` at `phase-08-qa-heraldry-family.md`.
