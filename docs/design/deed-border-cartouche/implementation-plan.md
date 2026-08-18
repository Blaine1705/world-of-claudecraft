# Deed-border cartouche: implementation plan

Turn the Book of Deeds wearable border from a stroked outline into a small
forged name plaque (a cartouche). Cosmetic identity only. No power, no
actionable information, no new image assets.

Companion documents: `docs/design/deeds.md` (reward definition),
`docs/design/reliquary.md` (Eternal Spoils / `reliquary_gilt`),
`docs/design/graphics-settings-fairness.md` (identity vs bloom),
`DESIGN.md` sections 1, 3, 4, 7.13, and 13 (crafted fantasy, gold is
structural, nameplates, contracts), `docs/qa-gate.md`.

This packet does not change who earns a border, how it is stored
(`PlayerMeta.activeBorder` is still a deed id), or the wear command
(`deed_set_border`). It changes how a worn slug is drawn.

## Why four phases

The current accent is a 3-stroke rounded rect around the name row only
(`drawBorderAccent` in `src/render/nameplate_canvas.ts`). Making it feel like
a reward is a layout rewrite plus a family restyle. Those two build slices
each need a dedicated QA gate before the next slice starts:

1. **Chassis.** Layout, well, shared hardware, every edge case, on today's
   palettes.
2. **QA: chassis.** Coverage audit, graphics-tier fairness, screenshots,
   reviewers, selective gate. Stop if anything is missing.
3. **Identity and family.** Motifs, Catalogue brass, picker, inspect, ring.
4. **QA: identity and family.** Same rigor on the new surfaces, then the
   contribution is ready.

A motif pass on a still-crooked box will look like another UI bug. A
family restyle without a coverage audit will miss no-title, no-badge, or
low-tier shedding. QA is a phase, not a paragraph at the end of a build
phase.

One PR is allowed if each QA phase is green before the next build phase
starts on the same branch. Two PRs (chassis, then identity) are cleaner
for review.

## Current behavior (ownership)

| Surface | What it does today |
|---|---|
| `src/ui/deed_border_view.ts` | Slug -> `{ frame, edge, glow }`. Four slugs: `curators_gilt` (ivory), `reliquary_gilt` (rich gold), `deepward` (teal), `prestige_laurels` (green). |
| `src/render/nameplate_canvas.ts` `drawBorderAccent` | Dark contour + frame + inner hairline. Pad 5px x, 3px top, 0 bottom. Flush with the name-row floor. Title sits on the next line, outside the box. |
| `src/render/nameplate_painter.ts` | Resolves `entity.border` through `deedBorderSlug` on the same cadence as `title`. Players only. |
| `src/styles/hud.css` `.portrait-wrap[data-border]` | Circular 2px ring + outline + `--fx-shadow` bloom. |
| `src/styles/shell.css` `.inspect-name[data-border]` | CSS rounded rect, same three custom properties. |
| `src/ui/deeds_window.ts` Titles and Borders shelf | Text buttons, no preview swatch. |
| `scripts/pr_shot_targets.mjs` `nameplate-border` | Offline shot of rank-5 Curator border + portrait ring. `when` is incomplete (misses `nameplate_canvas`). |

Pinned today: shapes only (no per-slug sprite), "adds no vertical space" so
the emote walk stays exact (`tests/nameplate_canvas.test.ts`), unique hex
literals (`tests/deed_border_accent.test.ts`), forced-colors collapse to
`Canvas` / `CanvasText`, identity is tier-invariant and only bloom sheds.

## Desired behavior

A worn border draws a **cartouche**: a thin midnight well, the existing
three-layer metal edge, shared corner brackets, a top-center clasp, and
(Phase 3) a per-slug side motif. It wraps the **name row and the title**
as one plaque. Health, guild, cast bar, markers, combo pips, and raid
marks stay outside.

Gold stays structural: a fine antique edge, never a thick yellow bar, never
a large gold fill (`DESIGN.md` 1.4 and 3). The well is ink, not gold.

The borderless plate is unchanged, including the "no panel background on
standard friendly plates" rule in `DESIGN.md` 7.13. A worn border is a
special identity state, not a new default plate.

## Locked decisions

1. **Chassis, QA, identity, QA.** Do not start Phase 3 until Phase 2 is
   green. Do not call the feature done until Phase 4 is green.
2. **Wrap name + title.** One plaque. When there is no title, the plaque
   hugs the name row only (still symmetrically padded). Guild stays outside,
   between the health bar and the cartouche.
3. **Shapes only.** No PNG/SVG frame per slug. The nameplate sprite-budget
   pin stays: flipping slugs must not mint a text or image sprite.
4. **Shared ink well.** One midnight fill (about 0.4 alpha) for every slug.
   Metal color is what distinguishes them at distance. Do not per-slug the
   well.
5. **Shared hardware, per-slug motif.** Four corner L-brackets and one
   top clasp are the chassis. Side motifs (book ticks, vault knot, ward
   key, laurel sprigs) land in Phase 3 and dispatch on slug.
6. **Catalogue color retune is Phase 3.** `curators_gilt` stays ivory until
   the chassis is screenshot-true, then moves to warmer antique brass
   (near `#c9b17a` / ink edge `#2a2214` / cream glow `#f3ead0`). Do not
   steal `reliquary_gilt`'s `#f4ca43`. The other two palettes stay.
7. **Optical centering.** Badge stack and name are one centered group
   (already true). Title stays centered on the plate center (`screenX`),
   including when badges make the name row left-heavy. Name-row text
   (name, AI, cheater) is vertically centered with the badges, not
   baseline-pinned to the row floor. Symmetric pad, about 8-10px x and
   4-5px y.
8. **Cartouche width is `max(nameRowWidth, titleWidth) + padX * 2`.** A
   title wider than the name row must widen the plaque, not clip or wrap.
9. **Documented extra lift, not "zero height".** Replace the current "adds
   no vertical space" pin with a named extra lift from the geometry module
   that `drawBase` and `drawEmote` both consume. Clasp and pad are part of
   that lift.
10. **Identity on every graphics tier.** The plaque, edge, well, hardware,
    and (Phase 3) motif render at low. Only bloom / clasp glint may ride
    `--fx-shadow`. Forced-colors still collapse every slug to the same
    `Canvas` / `CanvasText` pair. The cartouche core must not take a tier,
    governor, or effects-profile argument.
11. **Module-first.** New geometry and path primitives land in a sibling
    module, not as another block on `nameplate_canvas.ts`. Palettes and
    motif kind stay on `deed_border_view.ts` so CSS surfaces never import
    render. Shared numbers (pad, radius, well alpha, extraLift) are named
    exports the canvas and the tests both import. Do not duplicate them.
12. **Tests are written in the build phase, audited in the QA phase.**
    Phase 1 and Phase 3 land decisive Vitest coverage for every matrix row
    they touch. Phase 2 and Phase 4 refuse "it looks fine" as evidence.
13. **Screenshots are QA deliverables.** Before/after, desktop and mobile
    where the surface is not canvas-identical, committed under
    `docs/screenshots/deed-border-cartouche/`. Use the existing
    `nameplate-border` target in `scripts/pr_shot_targets.mjs` (extend its
    `when` and recipes). Seed the lowest graphics preset unless the shot's
    purpose is a tier comparison (`.claude/skills/pr-screenshots/SKILL.md`).
14. **No new player-facing copy** unless the picker grows a visible
    structure that needs a label. If a label is added, it is a `t()` key
    in the matching `src/ui/i18n.catalog/` module, English only.
15. **No sim, server, wire, or IWorld change is expected.** The slug
    already travels. If a phase thinks it needs one, stop and surface it.

## Architecture (componentize first)

```
deed_border_view.ts            slug -> palette + motif kind (UI_PURE_CORE)
nameplate_cartouche_core.ts    layout + path primitives (RENDER_PURE_CORES)
nameplate_canvas.ts            thin consumer: fill, stroke, place content
hud.css / shell.css            ring + inspect, same custom properties
deeds_window.ts                picker swatches (Phase 3)
pr_shot_targets.mjs            nameplate-border (+ picker/inspect variants)
```

`src/render/nameplate_cartouche_core.ts` is DOM/Three/i18n-free. Register
it in `RENDER_PURE_CORES` (`tests/architecture.test.ts`). It takes
measured widths/heights and a slug, and fills a caller-owned result:

- outer `x, y, w, h`
- well rect
- edge / frame / inner hairline
- corner brackets, clasp
- content origins: name-row left/top, name baseline, title baseline
- `extraLift` (the y-walk delta both drawers must apply)
- Phase 3: motif primitives

Allocation rule: the core fills a caller-owned record. The nameplate
hot path allocates nothing per plate per frame. Pin this with
`tests/util/alloc_probe.ts` or an equivalent reference-stability check.

`BorderAccent` may gain a `motif` discriminant in Phase 3
(`catalogue` / `vault` / `ward` / `laurel`). Colors stay unique
repo-wide literals. A `well` fill is a named constant on the cartouche
module, not a fourth hex on every slug.

`src/ui/` already imports into the nameplate canvas
(`deed_border_view`, `text_sprite_cache`). Keep that direction. Do not
have `deed_border_view` import render.

Do not grow `nameplate_canvas.ts` past its monolith ceiling
(`tests/monolith_budget.test.ts`). The extraction is mandatory.

CSS family (Phase 3): inspect and the portrait clasp consume the same
`--border-accent-frame|edge|glow` custom properties the ring already
uses. Shared pad/radius numbers that CSS needs should be CSS variables
written by the painter from the same named exports, not restated hex or
magic px in `hud.css` / `shell.css`.

## Edge-case matrix

Every row is a Vitest with a decisive assertion (a wrong layout, a
missing primitive, or a leaked palette hex must fail the test). Visual
confirmation is extra, never a substitute. Combinations marked
"bordered + borderless" are run twice: once with a valid slug, once with
`border: ''`.

| Id | Case | Required read | Phase |
|---|---|---|---|
| E1 | Name only | Tight plaque, symmetric pad, name optically centered. | 1 |
| E2 | Name + title | Title inside the well, centered on `screenX`, about 2px gap above the title. | 1 |
| E3 | Title wider than name | Plaque grows to the title. Name row stays a centered group. | 1 |
| E4 | Discord portrait (24px) | Row height follows the portrait. Name/chips vertically centered with it. Portrait does not kiss the well floor. | 1 |
| E5 | Holder and/or dev badge (15px), no portrait | Same centering against the 15px stack. | 1 |
| E6 | All badges (holder + dev + Discord) | Group still centered. Horizontal pad keeps hardware off the first badge. | 1 |
| E7 | AI chip and/or Cheater chip | Stay in the name row, inside the well, vertically centered. | 1 |
| E8 | AFK prefix and/or `[ROLE]` in the name | Width follows the measured string. No clip. | 1 |
| E9 | Dev-tier name outline | Drawn on top of the well, never under it. | 1 |
| E10 | Current target | 14px name / 18px min row (existing). Plaque scales with the row, not a second layout. | 1 |
| E11 | Guild present | Guild line stays outside, below the health bar and above the cartouche. Clearance preserved. | 1 |
| E12 | HP / cast / combo / raid mark | Unchanged slots, outside the plaque. Raid mark and emote clear the clasp. | 1 |
| E13 | Dead player | HP hidden (existing). Plaque still draws if a border is worn. | 1 |
| E14 | Stealth | Existing 0.55 opacity applies to the whole plate, plaque included. | 1 |
| E15 | Unknown / empty / title-deed slug | No plaque (existing `borderAccent` null / `deedBorderSlug` `''`). | 1 |
| E16 | Forced colors | Well, hardware, and metal collapse to `Canvas` / `CanvasText`. No palette hex survives. | 1 |
| E17 | `uiScale` / DPR | Existing canvas backing-store path. Geometry in CSS pixels. extraLift does not double-scale. | 1 |
| E18 | Self plate hidden | Existing suppress. No plaque leak. | 1 |
| E19 | Hostile player with a border | Red name inside the same plaque. Border does not recolor to hostile. | 1 |
| E20 | Mob / NPC / object | Never a border (existing player-only resolve). | 1 |
| E21 | Borderless plate | No well, no hardware, title stays on its own line. Screenshot-identical in spirit. | 1 |
| E22 | Emote y-walk | `drawEmote` uses the same `extraLift` as `drawBase`. Bubble sits above the clasp. | 1 |
| E23 | Flip every slug | Sprite count stays flat. No per-slug raster. | 1 |
| E24 | Two bordered players stacked | Declutter Y threshold / stack offset clear the new extra lift. Pin the numbers. | 1 |
| E25 | Low graphics preset | Well, edge, hardware (and Phase 3 motif) still draw. Bloom is 0. | 1 / 3 |
| E26 | Higher graphics preset | Identity unchanged. Bloom / clasp glint may appear via `--fx-shadow`. | 1 / 3 |
| E27 | Theme presets (classic, midnight, parchment, highContrast) | Canvas metal is static (already). Inspect/picker metal still reads on parchment (the light-panel acid test). | 3 |
| E28 | Picker None | Empty, not a fake metal swatch. | 3 |
| E29 | Picker earned + active | Swatch uses the live palette. Active + focus-visible rules stay. Mobile tap target 40x40. | 3 |
| E30 | Inspect header | Same family (well + edge + clasp). Forced-colors arm stays. | 3 |
| E31 | Portrait ring + clasp | Circle stays a circle. Clasp at 12 o'clock. Level chip and combat flash stay above (`z-index` 3 and 4). | 3 |
| E32 | Motif distinctness | Four slugs emit four different side-primitive sets. Color uniqueness scan still green. | 3 |
| E33 | Catalogue brass vs Eternal Spoils gold | `curators_gilt` does not collide with `reliquary_gilt` or `#f2c84b`. | 3 |
| E34 | Reduced motion | No new motion. If any glint is animated, it honors `prefers-reduced-motion`. Prefer no animation. | 3 |
| E35 | Char sheet refresh | `activeBorder` still busts the sheet sig (`char_sheet_sig_core.ts`). No visual regression required beyond that. | 3 |
| E36 | ClientWorld / online | No IWorld change. Worn slug still arrives on the entity. If a phase touches `world_api` or the wire, stop. | 2 / 4 |

Declutter: `nameplate_declutter.ts` uses a fixed 18px Y overlap and 20px
stack. Phase 1 must measure `extraLift` and bump those constants if two
bordered player plates can now overlap. Pin the new numbers (E24).

## Standing QA contract (every phase)

Build phases write the tests. QA phases prove the tests are real.

A test is decisive when a wrong implementation fails it. Forbidden:
constant-self-comparison, asserting a function equals itself, pinning
only that a function was called, or a snapshot of an object the test
just built. Load-bearing numbers (pad, extraLift, badge sizes 15 and 24,
title gap, well alpha) are pinned to literals.

Graphics-tier contract, pinned, not implied:

- Identity primitives (well, three-layer edge, hardware, Phase 3 motif)
  have no `gfx` / `governor` / `ui_effects_profile` / `data-fx-level`
  input. Extend the existing path scan in
  `tests/deed_border_accent.test.ts`.
- The only tier-scaled quantity is bloom / clasp glint via `--fx-shadow`
  (already 0 at low). Phase 3 must not add a second shed path that can
  hide the plaque.
- QA screenshots seed `graphicsPreset: 1` unless the shot is a deliberate
  low-vs-high comparison.

Commands that close a QA phase:

```
npx tsc --noEmit
npx vitest run <the phase test list>
npx vitest run tests/architecture.test.ts tests/localization_fixes.test.ts tests/monolith_budget.test.ts
npx @biomejs/biome check <changed files>
node scripts/gate_select.mjs
```

Reviewers (read-only, fresh, not the implementer):

| Reviewer | When |
|---|---|
| `qa-checklist` | Every QA phase. |
| `test-coverage-auditor` | Every QA phase. Map each matrix id in play to a named test. |
| `frontend-seam-reviewer` | Every QA phase (render / UI / CSS). |
| `architecture-reviewer` | Only if `src/sim/` was touched (it should not be). |
| `cross-platform-sync` | Only if `world_api`, wire, or `ClientWorld` was touched (it should not be). |

A QA phase is red if any matrix id in play has no decisive test, if the
selective gate is red, if screenshots are missing, or if a reviewer
finds a coverage gap the implementer cannot refute from the diff.

## Phase 1: cartouche chassis

**Outcome.** A worn border is a centered ink plaque around name + title,
with shared corner brackets and a top clasp, on today's palettes. Every
Phase 1 matrix row (E1-E26 as applicable) has a decisive test. Emote and
raid-mark anchors stay correct.

**In scope.**

- Add `src/render/nameplate_cartouche_core.ts` and
  `tests/nameplate_cartouche_core.test.ts`.
- Register the core in `RENDER_PURE_CORES`.
- Rewire `drawBorderAccent` / `drawNameRow` / `drawBase` / `drawEmote`
  to consume `extraLift` and the content origins. Title is drawn inside
  the plaque when a slug is active; the borderless title path is
  unchanged.
- Vertically center name-row text with badges.
- Symmetric pad. Shared hardware (brackets + clasp) as canvas shapes.
- Shared ink well fill.
- Replace the "adds no vertical space" pin with the shared-lift pin.
- Review declutter Y constants (E24).
- Forced-colors: well + hardware use the same system pair.
- Update `tests/nameplate_canvas.test.ts` (stroke family, no new sprites,
  emote walk, forced-colors, title-inside, slug flip).
- Touch `tests/deed_border_accent.test.ts` so the canvas source-scan
  still describes the real drawer, and so the fairness scan still proves
  no tier input.
- Allocation / reference-stability pin on the core result record.
- Extend `nameplate-border` in `scripts/pr_shot_targets.mjs` `when` to
  include `render/nameplate_canvas` and `render/nameplate_cartouche_core`
  so later diffs actually shoot the plate.

**Out of scope.** Motifs, palette retune, picker swatches, inspect/ring
clasp, new i18n, sim/server/wire, committing screenshots (that is Phase 2).

**Validation (implementer, before handing to QA).**

```
npx tsc --noEmit
npx vitest run tests/nameplate_cartouche_core.test.ts tests/nameplate_canvas.test.ts tests/nameplate_ai_tag.test.ts tests/deed_border_accent.test.ts tests/architecture.test.ts tests/monolith_budget.test.ts
npx @biomejs/biome check --write src/render/nameplate_cartouche_core.ts src/render/nameplate_canvas.ts tests/nameplate_cartouche_core.test.ts
```

**Exit into Phase 2.** Matrix E1-E26 tests exist and are green. Emote walk
locked to `extraLift`. No new sprites. Borderless path has an explicit
"no well / no hardware" pin. Fairness scan still green. `progress.md`
and `state.md` updated. No Phase 3 work in the tree.

Starter prompt: `phase-01-chassis.md`.

## Phase 2: QA, chassis

**Outcome.** An independent pass proves Phase 1 did not miss a matrix
row, a graphics-tier leak, a y-walk desync, or a "looks fine" test.
Before/after screenshots exist. Reviewers are clean or their findings
are fixed and re-checked.

**In scope (read-only first, then fix-forward only for confirmed gaps).**

- Coverage map: every E1-E26 id to a test name in
  `progress.md`. Any unmapped id is a Phase 2 defect.
- Re-run the Phase 1 test list plus `tests/localization_fixes.test.ts`.
- `node scripts/gate_select.mjs`.
- Dispatch `qa-checklist`, `test-coverage-auditor`,
  `frontend-seam-reviewer` on the real diff.
- Screenshots, lowest graphics preset, per
  `.claude/skills/pr-screenshots/SKILL.md`:
  - before (release outline) and after (cartouche) of the own nameplate
    with title, without title, with Discord portrait, without badges
  - current-target plate
  - borderless control (must not grow a well)
  - player-frame portrait ring (still the old circle; confirm no
    accidental CSS change)
  Desktop required. Mobile nameplate is the same canvas; one mobile HUD
  frame is enough to prove the plate still fits the compact viewport.
  Commit under `docs/screenshots/deed-border-cartouche/phase-01/`.
- Manual graphics-tier check: seed preset 1 and a high preset. Identity
  present on both. Bloom only on the high preset.
- Manual forced-colors (or the existing unit pin if a browser OS setting
  cannot be toggled): no palette hex.
- Adversarial "what is missing" pass: long Unicode name, title-only
  width, stealth + emote + border together, two nearby bordered players.

**Out of scope.** Starting Phase 3. "While I am here" motif or color work.

**Exit into Phase 3.** Coverage map complete. Gate green. Screenshots
committed. Reviewer findings fixed or recorded as non-blocking with
evidence. `state.md` lists the first Phase 3 action.

Starter prompt: `phase-02-qa-chassis.md`.

## Phase 3: identity and family

**Outcome.** Each slug has a distinct side motif. Catalogue brass is
retuned. Inspect, portrait ring, and the Book of Deeds picker read as
the same family. Matrix E27-E36 have decisive tests.

**In scope.**

- Extend `BorderAccent` with a `motif` kind. Dispatch four shape sets
  from the cartouche core (still no sprites).
- Retune `curators_gilt` only. Re-pin uniqueness in
  `tests/deed_border_accent.test.ts`. Do not collide with elite/quest
  gold `#f2c84b`.
- Inspect header: CSS cartouche (well + edge + optional clasp), still
  driven by `--border-accent-*`. Forced-colors arm stays.
- Portrait ring: keep the circle. Add a 12-o'clock clasp via an extra
  `::before` or equivalent, still under the level chip (`z-index: 2`).
  Do not put a rectangle on a circular portrait.
- Picker: each earned option shows a 3-color swatch (frame / edge /
  glow) plus the deed name. The None option is empty, not a fake metal.
  Mobile tap floor stays 40x40 (`body.mobile-touch .deed-title-option`).
  Reuse `.deed-title-option`; do not invent a second button class that
  drops the existing a11y/focus rules (`tests/deeds_border_picker.test.ts`).
- Fairness doc: one sentence that the motif is identity (tier-invariant)
  and only glint sheds.
- Deeds / Reliquary design docs: the in-world border is a cartouche, not
  a "slug-keyed accent" outline.
- Shot targets: add or extend recipes for the picker shelf and the
  inspect header so Phase 4 can capture them from the diff.
- Tests: motif distinctness, Catalogue uniqueness, picker swatch markup
  (None vs earned vs active), inspect well, ring clasp z-index, theme
  parchment still consumes custom properties (no raw hex in the CSS
  rule), i18n guard if any key was added.

**Out of scope.** New slugs, new deeds, animated sparkle, wrapping the
health bar, per-slug silhouettes (wings, full wreath, arch).

**Validation (implementer, before handing to QA).**

```
npx tsc --noEmit
npx vitest run tests/deed_border_accent.test.ts tests/nameplate_cartouche_core.test.ts tests/nameplate_canvas.test.ts tests/deeds_border_picker.test.ts tests/inspect_window.test.ts tests/inspect_view.test.ts tests/unit_frame_painter.test.ts tests/localization_fixes.test.ts tests/architecture.test.ts
npx @biomejs/biome check --write <changed files>
```

**Exit into Phase 4.** E27-E36 tests exist and are green. Four motifs
readable in the core's primitive lists. Catalogue uniqueness re-pinned.
No Phase 4 screenshot work left to the implementer except smoke.

Starter prompt: `phase-03-identity.md`.

## Phase 4: QA, identity and family

**Outcome.** The full vision is proven: chassis still holds, identity is
distinct, family surfaces agree, every graphics tier shows the plaque,
screenshots cover the new surfaces, reviewers are clean, selective gate
is green. The contribution may be called ready.

**In scope.**

- Coverage map: every E1-E36 id to a test name. Phase 1 rows must still
  pass after the motif/color change.
- Re-run the Phase 3 test list plus the Phase 1 list.
- `node scripts/gate_select.mjs` (merge bar). Record the exact command
  and outcome.
- Dispatch `qa-checklist`, `test-coverage-auditor`,
  `frontend-seam-reviewer` on the full diff vs `release/v0.39.0`.
- Screenshots under `docs/screenshots/deed-border-cartouche/phase-03/`:
  - all four slugs on the nameplate (desktop, lowest preset)
  - Catalogue vs Eternal Spoils side by side (brass vs capstone gold)
  - low preset vs high preset (identity same, bloom only on high)
  - inspect header
  - Book of Deeds picker (desktop + mobile)
  - player and target portrait rings with clasp
  - parchment theme inspect/picker (light-panel acid test)
  - borderless control still clean
- Manual: flip all four borders in the Book of Deeds, inspect a bordered
  player, current-target plate, forced-colors if available,
  `prefers-reduced-motion` if any glint landed.
- Confirm no IWorld / sim / server drift (E36).
- PR body checklist: gate command, screenshot links, matrix coverage
  pointer to `progress.md`.

**Out of scope.** New motifs, extra slugs, drive-by HUD restyles.

**Exit (feature ready).** Coverage map complete. Gate green. Screenshots
committed and referenced. Reviewers READY or READY WITH NOTES that do
not block. `progress.md` marks Phases 1-4 complete.

Starter prompt: `phase-04-qa-identity.md`.

## Risks

- Extra lift colliding with raid marks or emotes if only `drawBase` is
  updated. Mitigation: one `extraLift` constant, both walks, one test (E22).
- Declutter under-stacking bordered players. Mitigation: measure and
  bump in Phase 1 (E24).
- Growing `nameplate_canvas.ts` past its monolith ceiling. Mitigation:
  the core extraction is mandatory.
- Catalogue brass colliding with `reliquary_gilt` or `#f2c84b`.
  Mitigation: uniqueness scan already exists; retune in Phase 3 only.
- Picker markup breaking the shared title-option contract. Mitigation:
  keep the class, add an inner swatch span.
- QA skipped because "the tests are already there." Mitigation: Phase 2
  and Phase 4 are named phases with a coverage map and reviewers. A
  build phase cannot close itself.
- Identity accidentally shed on low. Mitigation: core takes no tier
  argument; fairness scan; low-preset screenshot.

## Worktree and branch

```
git worktree add ../wocc-deed-border-cartouche -b feature/deed-border-cartouche origin/release/v0.39.0
cd ../wocc-deed-border-cartouche
pnpm install --frozen-lockfile
```

Do not implement on `release/v0.39.0` itself. Do not base on `main`.
