# Deed Heraldry: state

Resume here. The active direction is `art-direction.md`; the complete phased
contract is `implementation-plan.md`.

## Resume point

Phases 1-9 are complete on `feature/deed-border-cartouche`. Phase 9 merged
`origin/release/v0.40.0`, refined the family from a rounded ribbon into the
approved pointed plaque direction, and added E59-E63 without weakening E1-E58.
A subsequent five-pass craft session corrected Book preview alignment, gave the
world seal a protected plaque gap, and rebuilt Inspect as a centered ceremonial
mantle with one honor rail and a quieter paperdoll stage. Its final verdict is
**SHIP WITH NOTES**; both fresh specialist reviews are **READY**, and the exact
findings and fix-forward evidence are recorded in `progress.md`.

The final plaque album is
`docs/screenshots/deed-border-cartouche/phase-09/`. It proves normal-distance
world hierarchy, all four seals together and in grayscale, player and target
frames, picker, inspect, mobile, Parchment, forced colors, and unobscured
low/high bloom-only fairness. The retained `phase-07/` album continues to prove
the real Book equip/preview flow, None, borderless controls, slug swaps,
reconnect, and the long localized Cheater target. No sim, server, persistence,
wire, net, world API, or IWorld feature path changed.

Do not commit, stage, push, or open the PR unless the operator explicitly asks.

## Blocker

None in the Deed Heraldry implementation, v0.40 integration, or Phase 9
evidence. The branch is 0 commits behind and 17 commits ahead of
`origin/release/v0.40.0`.

## Next action

1. Preserve the current worktree and all Phase 1-9 changes.
2. Do not start another feature phase without operator direction.
3. Open a PR only when explicitly authorized.

## Active locked decisions

- The approved experience is two-scale Deed Heraldry: compact world seal plus
  shallow pointed name plaque, richer social reveal on interaction.
- Four slugs and motifs only: catalogue, vault, ward, laurel. No new deed,
  reward, title, slug, motif, or family silhouette.
- The world plaque owns the name row only. The selected title returns to the
  secondary line.
- No full nameplate perimeter, corner brackets, or central clasp. The motif is
  enlarged into the readable face of the forged seal.
- Guild, HP, resource, cast, combo, raid marks, quest markers, emotes, and all
  actionable/state information stay outside and unchanged.
- Player and target frames receive the seal at the portrait/name joint and a
  restrained pattern on the name header only. Portraits stay circular. No full
  HUD reskin.
- Inspect is the ceremonial reveal and uses real name/title/deed copy in a 60px
  centered mantle with an overlapping 56px seal. Existing standing and badges
  remain secondary in one responsive honor rail. Picker uses actual
  seals/materials plus live previews. `.deed-title-option`, focus, aria, and
  the 40x40 touch floor remain.
- Catalogue brass remains `#c9b17a` / `#2a2214` / `#f3ebcf`, distinct from
  Eternal Spoils `#f4ca43` and elite/quest `#f2c84b`.
- Borderless stays clean. Identity exists on every graphics tier. Only bloom
  may shed. Prefer no motion.
- World runtime stays code-native, sprite-free, and allocation-free per plate
  per frame. The generated concept is reference-only.
- The old radius is history. The accepted world values are plaque pad 7/1,
  fixed 8px tip, fixed 4px notch, midnight alpha 0.62, seal 18, protected
  seal/plaque gap 2, hidden joint overlap 2, extra lift 8, and declutter
  X/Y/stack 95/26/28. Both y-walks consume the same 8px lift.
- `PlayerMeta.activeBorder`, `deed_set_border`, eligibility, persistence, and
  the wire remain unchanged. No sim/server/IWorld work is expected.

## Phase status

- Phase 1 complete: cartouche geometry seam and canvas rewire.
- Phase 2 complete: chassis QA, E1-E26, screenshots, selective gate.
- Phase 3 complete: motifs/palettes and initial family surfaces.
- Phase 4 complete technically, visually superseded: E1-E36 and `phase-03/`
  album proved implementation but not desired reward feel.
- Phase 5 complete: world seal + ribbon, secondary title, one pure core,
  E37-E46, focused suite 196/196, TypeScript green, full and selective gates
  12/12, coverage and frontend reviews READY.
- Phase 6 complete, SHIP: normal-distance and grayscale craft review, complete
  live `phase-05/` album, E1-E46 audit, test-only fix-forward, focused suite
  203/203, final full selected gate 12/12, coverage and frontend reviews READY.
- Phase 7 complete: player/target, inspect, picker previews, E47-E58, and its
  requested implementation checks green before the independent final phase.
- Phase 8 complete: **READY WITH NOTES / SHIP WITH NOTES**. E1-E58, final live
  family album, art direction, accessibility/themes, responsive behavior,
  bloom-only fairness, full selective gate, and specialist reviews passed.
- Phase 9 complete: **SHIP WITH NOTES**. v0.40 is integrated, E59-E63 are
  audited, the pointed plaque family is live across
  world/player/target/picker/inspect, the full-mode 12-step gate is green, and
  both fresh specialist reviews are READY.
- Post-Phase 9 five-pass craft polish complete: Book motifs are optically
  centered, world and picker plaques preserve the 2px seal gap, Inspect is one
  responsive ceremonial composition, the final full-mode 12-step gate is green,
  and both post-fix specialist reviews are READY. Final verdict: **SHIP WITH
  NOTES**. No new feature phase was begun.

## Phase 8 closeout evidence

- Active Phase 5 list:
  `npx vitest run tests/nameplate_heraldry_core.test.ts tests/nameplate_canvas.test.ts tests/nameplate_ai_tag.test.ts tests/nameplate_declutter.test.ts tests/deed_border_accent.test.ts tests/architecture.test.ts tests/monolith_budget.test.ts`
  passed 7 files and 207 tests.
- Active Phase 7 list:
  `npx vitest run tests/deed_border_accent.test.ts tests/nameplate_heraldry_core.test.ts tests/nameplate_canvas.test.ts tests/deeds_border_picker.test.ts tests/inspect_window.test.ts tests/inspect_view.test.ts tests/unit_frame_painter.test.ts tests/unit_frame.test.ts tests/localization_fixes.test.ts tests/i18n_completeness.test.ts tests/architecture.test.ts tests/monolith_budget.test.ts`
  passed 12 files and 341 tests, with 3 expected skips.
- Proportional responsive/i18n/style list:
  `npx vitest run tests/mobile_window_coverage.test.ts tests/mobile_window_layout.test.ts tests/mobile_window_transform.test.ts tests/i18n_completeness.test.ts tests/localization_fixes.test.ts tests/styles_extraction.test.ts tests/css_value_validity.test.ts tests/focus_visible_guard.test.ts tests/theme.test.ts tests/ui_effects_profile.test.ts tests/ui_effects_wiring.test.ts`
  passed 11 files and 216 tests, with 1 expected skip.
- `npx tsc --noEmit`, `git diff --check`, and
  `GATE_SELECT_BASE=origin/release/v0.39.0 node scripts/gate_select.mjs` passed.
  The selective gate reported all 12 steps green.
- The live album is
  `docs/screenshots/deed-border-cartouche/phase-07/`. Required evidence is world
  distance 12-13, all-four Book equip 14-17, focus-only preview 18-21,
  player/target and low/high 01-05, picker and Parchment 06-08, inspect and
  Parchment 09-11, peer/reconnect/None/forced-colors/localized-target 22-29.
  `live-qa-evidence.json` records the exact live state assertions.
- Final `woc_test_coverage` result was **READY**, final `woc_frontend` result was
  **READY WITH NOTES / SHIP WITH NOTES**, and final
  `gate-integrity-reviewer` result was **READY**. Their confirmed findings were
  fixed in owning CSS, screenshot recipes, and source-linked tests: preview
  stacking, touch layout, forced-color edges, Parchment contrast, explicit
  tier/daylight staging, E47-E58 invariant pins, and sparse-checkout deletion
  handling. No actionable finding remains.
- Remaining risks are release-branch drift, 18 logged but unrelated mobile NPC
  asset skips, and no separate axe/mobile E2E/ARM3 wall-clock rerun. The
  canonical browser suite, deterministic accessibility/responsive/style
  coverage, hot-path guards, and final selective gate passed.

## Phase 9 closeout evidence

- `origin/release/v0.40.0@14ab2e8630` merged as `2e15170f9c` with no conflict.
  `git rev-list --left-right --count origin/release/v0.40.0...HEAD` returned
  `0 17`.
- The shared plaque authority is `src/ui/deed_heraldry_plaque_core.ts`: compact,
  mirrored, and ceremonial clip paths use fixed 8px tips and 4px notches. The
  world core imports the same measurements and remains caller-owned.
- The world painter uses one six-point Canvas2D path, one inset glint, the
  existing seal and frozen motif primitives, and no image, gradient, filter,
  animation, tier, governor, or per-call container allocation.
- The Phase 9 album is
  `docs/screenshots/deed-border-cartouche/phase-09/`. Normal distance was judged
  before `all-four-world-crop.png`; the grayscale comparison remains distinct.
  Low/high, mobile, Parchment, picker, inspect, and real forced-colors evidence
  are enumerated in `live-qa-evidence.json`.
- `GATE_SELECT_BASE=origin/release/v0.40.0 node scripts/gate_select.mjs` selected
  full mode and passed all 12 steps: 2,986 test files passed with 12 skipped,
  41,995 tests passed with 2 expected failures and 115 skipped, 28 browser test
  files passed, and types/build/artifacts/security checks were green.
- Fresh `woc_test_coverage` and `woc_frontend` reviews both returned **READY**.
  The confirmed E63 ordering gap was fixed so every page-creation arm now pins
  `newPage`, probe cleanup, then storage seed/navigation. An unused plaque
  string getter and its misleading primitive-identity assertion were removed.
  The final focused suite passed 13 files and 385 tests; TypeScript,
  `git diff --check`, and `npm run ci:changed` also passed.
- No generated concept was used as QA evidence and no runtime image, deed, slug,
  motif, title, lore, or player-facing string was added.
- Remaining notes are non-blocking: offline captures logged proxy 502s and
  seven unrelated skipped mobile NPC models, and no separate browser axe,
  dedicated mobile E2E, or ARM3 wall-clock run was performed. Canonical browser,
  accessibility/responsive, allocation, typecheck, build, and full-gate
  coverage passed.

## Existing implementation surfaces

- `src/ui/deed_border_view.ts`: one slug -> palette + normalized static motif owner.
- `src/render/nameplate_heraldry_core.ts`: caller-owned world seal/plaque
  geometry. The Phase 4 cartouche core is deleted.
- `src/render/nameplate_canvas.ts`: thin world consumer.
- `src/render/nameplate_painter.ts`: border slug resolution.
- `src/render/nameplate_declutter.ts`: remeasure after new world extents.
- `src/ui/unit_frame.ts` + `src/ui/unit_frame_painter.ts`: player/target reveal
  seam with optional heraldry hosts and elided token writes.
- `src/ui/hud.ts`, `index.html`, `play.html`, `src/styles/hud.css`: player and
  valid-player-target seal/header markup and style.
- `src/ui/inspect_view.ts`, `src/ui/inspect_window.ts`,
  `src/styles/shell.css`: centered ceremonial Inspect mantle, standing row,
  responsive honor rail, and quiet class-hazed paperdoll stage.
- `src/ui/deeds_view.ts`, `src/ui/deeds_window.ts`,
  `src/styles/components.css`: canonical picker samples and event previews.
- `scripts/pr_shot_targets.mjs`: Phase 8 recipes for world, unit frames,
  inspect, picker, mobile, parchment, and low/high comparison.
- Tests and coverage maps are listed in `progress.md`.

## Review dispatch for active QA phases

- Use `$woc-qa` or follow `docs/qa-gate.md`; parent runs deterministic commands
  once and integrates findings.
- `woc_test_coverage` in Phases 6 and 8.
- `woc_frontend` in Phases 6 and 8.
- `woc_sim_architecture` only if `src/sim/` changes unexpectedly; stop first.
- `woc_cross_platform` only if world API/wire state changes unexpectedly; stop
  first.

## Image direction

Approved imagegen reference:
`docs/screenshots/deed-border-cartouche/direction/deed-heraldry-concept.png`.

If a later phase truly needs another visual option, use `$imagegen`, ground it
in a live client screenshot, save the selected project-bound output under the
same `direction/` folder, record the final prompt, and never treat generated art
as runtime UI or QA evidence.
