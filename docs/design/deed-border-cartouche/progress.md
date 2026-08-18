# Deed-border cartouche: progress

| Phase | Status | Notes |
|---|---|---|
| 1. Cartouche chassis | complete | Core + canvas rewire landed. extraLift is 14. Declutter Y is 32 / 34. |
| 2. QA: chassis | complete | Coverage map audited. Vacuous Object.keys pins replaced. E5/E7/E18/E22/E24 now have decisive assertions. Screenshots committed. Reviewers verified. `node scripts/gate_select.mjs` PASS (12 steps). |
| 3. Identity and family | complete | Motifs, Catalogue brass, picker swatches, inspect cartouche, ring clasp, E27-E36 tests. |
| 4. QA: identity and family | complete | Coverage map audited. Family screenshots under `phase-03/`. Reviewers READY WITH NOTES. `node scripts/gate_select.mjs` PASS (12 steps). |

Phase 4 closed 2026-08-18 on `feature/deed-border-cartouche`. The operator may open the PR.

## Coverage map (filled by QA phases)

Every E1-E26 row names the assertion that would fail on a wrong pad, a missing well, a title left outside, a 24px Discord portrait kissing the floor, a leaked palette hex under forced-colors, or a y-walk desync. Load-bearing numbers are literals. E27-E36 now name Phase 3 tests. E36 is still the no-IWorld pin.

| Id | Test file / name | Status |
|---|---|---|
| E1 | `tests/nameplate_cartouche_core.test.ts` "hugs the name row with 9px x and 5px y pad and centers the name group" (`outer.w` 88, `outer.h` 26, `nameRowLeft` 285) | audited |
| E2 | `tests/nameplate_cartouche_core.test.ts` "keeps the title baseline 9px below the name row" (baseline 209 inside well); `tests/nameplate_canvas.test.ts` "E2: a worn border draws the title with the name, inside the well" (`text.draw` Y is `titleBaseline`, inside well) | audited |
| E3 | `tests/nameplate_cartouche_core.test.ts` "widens to the title and keeps the name group on screenX" (`outer.w` 118, name midpoint 320) | audited |
| E4 | `tests/nameplate_cartouche_core.test.ts` "centers the name baseline in the 24px row and keeps pad under the portrait" (pad under `nameRowTop + 24` is 5) | audited |
| E5 | `tests/nameplate_canvas.test.ts` "E5: a 15px holder badge stays inside the 16px row and does not kiss the well floor" (`outer.h` 26, clearance under 15 is 6); `tests/nameplate_ai_tag.test.ts` holder/dev badge `size` is 15 | audited |
| E6 | `tests/nameplate_cartouche_core.test.ts` "starts the name row after the top-left L-bracket arm" (`nameRowLeft` after arm, pad 9) | audited |
| E7 | `tests/nameplate_canvas.test.ts` "E7: AI and Cheater chips draw on the shared name baseline inside the well" (`[AI]` and `< Cheater >` Y === `nameBaseline`) | audited |
| E8 | `tests/nameplate_cartouche_core.test.ts` "does not clip a long measured name row" (`outer.w` 238) | audited |
| E9 | `tests/nameplate_canvas.test.ts` "E9: draws the dev-tier name outline after the well, never under it" (comment-stripped source order + well `fill` invocation before `devStyle` draw); `tests/nameplate_dev_glow.test.ts` outline-then-fill | audited |
| E10 | `tests/nameplate_cartouche_core.test.ts` "uses the 18px row height instead of a second layout" (`outer.h` 28) | audited |
| E11 | `tests/nameplate_canvas.test.ts` "E11: guild stays outside the plaque..." (`<The Testers>` Y > well bottom) | audited |
| E12 | `tests/nameplate_canvas.test.ts` "E12: HP, cast, combo, and raid-mark slots stay on their existing y-steps" (literal 10/7/9/31/47) plus raid-mark blit Y < clasp Y | audited |
| E13 | `tests/nameplate_canvas.test.ts` "E13: a dead player still draws the plaque when a border is worn" (well fill + 6 strokes, `hpVisible` false) | audited |
| E14 | `tests/nameplate_canvas.test.ts` "E14: stealth opacity applies to the plaque as well as the text" (0.55 and 0.55 * 0.4) | audited |
| E15 | `tests/nameplate_cartouche_core.test.ts` "returns an inactive record for an empty slug"; `tests/nameplate_canvas.test.ts` "E15: unknown and empty slugs draw no plaque"; `tests/nameplate_ai_tag.test.ts` title-deed `prog_veteran` -> `''` | audited |
| E16 | `tests/nameplate_canvas.test.ts` "uses system colors for actionable shapes and text in forced-colors mode" (no palette hex, no `#14110c`); `tests/deed_border_accent.test.ts` canvas forced-colors arm | audited |
| E17 | `tests/nameplate_cartouche_core.test.ts` "takes no dpr / uiScale field..." (comment-stripped source + input interface regex, extraLift 14); `tests/nameplate_canvas.test.ts` "E17: extraLift is applied in CSS pixels..." (no `cartoucheLift(state) *`, well Y identical at DPR 1 and 2) | audited |
| E18 | `tests/nameplate_ai_tag.test.ts` "E18: a hidden self plate with an emote never keeps a worn slug" (`border` `''`, emote url present) | audited |
| E19 | `tests/nameplate_canvas.test.ts` "E19: hostile name stays red inside the same slug metal..." (slug hexes on strokes, name `style.fill` is `#ff5555`) | audited |
| E20 | `tests/nameplate_ai_tag.test.ts` "resolves the border slug per entity..." (mob, NPC, and object planted with `col_reliquary_rank_5` still resolve `''`) | audited |
| E21 | `tests/nameplate_cartouche_core.test.ts` "leaves title geometry on the existing 11px / 9px step when inactive"; `tests/nameplate_canvas.test.ts` "E21: a borderless plate draws no well and no hardware" | audited |
| E22 | `tests/nameplate_canvas.test.ts` "E22: drawEmote and drawBase share extraLift..." (name Y and emote blit both move by 14; emote blit Y < clasp Y) | audited |
| E23 | `tests/nameplate_canvas.test.ts` "strokes the Book of Deeds accent as shapes, minting no new text sprite" (6 strokes, sprite count flat on every slug twice) | audited |
| E24 | `tests/nameplate_cartouche_core.test.ts` "bumps the same-row threshold and stack pitch by the extra lift" (32 / 34 literals); `tests/nameplate_declutter.test.ts` "E24: two plates 25px apart vertically now collide" (stack gap 34) | audited |
| E25 | `tests/nameplate_cartouche_core.test.ts` "takes no gfx, governor, or effects-profile argument"; `tests/deed_border_accent.test.ts` fairness path includes the core and forbids `--fx-shadow` / `gfxTier` / `data-fx-level` | audited |
| E26 | same fairness scan: identity strokes have no tier input; ring and inspect each have exactly one `--fx-shadow` `box-shadow`. Clasp has none. Low-preset screenshots show the well and hardware; high-preset ring shows bloom. | audited |
| E27 | `tests/deed_border_accent.test.ts` "E27: canvas metal is static; inspect and picker metal still read on parchment" (`PRESET_ORDER` classic/midnight/parchment/highContrast; theme emits no `--border-accent-*`; inspect and picker rules consume `var(--border-accent-*)` with no hex) | audited |
| E28 | `tests/deeds_border_picker.test.ts` "E28: picker None is empty, not a fake metal swatch"; "E28: the empty swatch rule paints no metal" (empty class, no style hex, `background: none`) | audited |
| E29 | `tests/deeds_border_picker.test.ts` "E29: earned options show the live 3-color swatch; active and 40x40 stay" (live palette vars, Deepward frame `#4fb3c8`, `.active`, `:focus-visible`, `body.mobile-touch .deed-title-option` 40x40) | audited |
| E30 | `tests/deed_border_accent.test.ts` "E30: inspect header is a CSS cartouche (well + edge + clasp) with forced-colors" (`--cartouche-pad-x:9px` / well `#14110c` / radius `6px`); `tests/inspect_window.test.ts` rendered style contains `--cartouche-well-fill:#14110c` and `--border-accent-frame:#f4ca43` | audited |
| E31 | `tests/deed_border_accent.test.ts` "E31: portrait ring stays a circle; clasp sits at 12 o clock under the level chip" (`::after` `border-radius: 50%`, clasp `left: 30px` / `top: -6px` / `transform: translate(-50%, -50%)` / `border-radius: 2px` / `z-index: 2`, chip 3, flash 4) | audited |
| E32 | `tests/nameplate_cartouche_core.test.ts` "dispatches four different motif kinds and four different line sets"; "would fail if two slugs emitted the same side-primitive set"; canvas E23 stroke count is 6 | audited |
| E33 | `tests/deed_border_accent.test.ts` "E33: Catalogue brass does not collide with Eternal Spoils gold or elite gold" (`#c9b17a` / `#2a2214` / `#f3ebcf` vs `#f4ca43` and `#f2c84b`); single-source color scan still green | audited |
| E34 | `tests/deed_border_accent.test.ts` "E34: cartouche identity adds no motion" (inspect, clasp, swatch, ring clasp have no animation/transition) | audited |
| E35 | `tests/deed_border_accent.test.ts` "E35: changing activeBorder busts the character sheet refresh signature" (`charSheetRefreshSig` moves on wear and on slug swap) | audited |
| E36 | `tests/deed_border_accent.test.ts` "E36: worn slug still arrives on entity.border with no world_api change"; `tests/nameplate_ai_tag.test.ts` `prog_prestige_10` -> `prestige_laurels`. `git diff --name-only origin/release/v0.39.0` still has no `src/world_api*`, `src/net/`, `server/`, or `src/sim/` files. | audited |

## Phase 3 notes

- Motif kinds: catalogue / vault / ward / laurel. Four distinct line sets in the cartouche core. Canvas strokes those primitives; no second layout.
- `curators_gilt` is antique brass `#c9b17a` / `#2a2214` / `#f3ebcf`. Does not collide with `reliquary_gilt` `#f4ca43` or elite/quest `#f2c84b`.
- Inspect header is a CSS cartouche (well + edge + clasp). Portrait ring stays a circle; clasp is `::before` at 12 o'clock, z-index 2.
- Picker reuses `.deed-title-option`. Earned options show a 3-color swatch. None is empty.
- Shot recipes added: `deed-border-picker` and `inspect-border-cartouche`. Phase 4 owns the album.
- No sim / server / wire / IWorld change. No new player-facing strings. No Phase 4 screenshots.

## Phase 4 notes

- E1-E36 each name a decisive test. Phase 1 rows still pass after motifs and Catalogue brass. No Phase 1-3 test was weakened or deleted.
- Phase 4 fix-forward: E29 Deepward `#4fb3c8` literal; E30 chrome literals (`9px` / `#14110c` / `6px`); E31 clasp `transform: translate(-50%, -50%)` and `border-radius: 2px`; Reliquary rewards-ladder wording now says cartouche; picker `when` no longer lists the shared `components.css` sheet; CI sparse cone includes `docs/screenshots/deed-border-cartouche/`.
- Fairness: identity on every tier. Low preset tokens were `data-fx-level=low` / `--fx-shadow: 0`. High preset 3 booted (`data-fx-level=high` / `--fx-shadow: 1`). Forced-colors OS setting was not toggled; the unit pin is the evidence (Puppeteer rejected `forced-colors` emulation).
- Screenshots live under `docs/screenshots/deed-border-cartouche/phase-03/`. Official recipes: `nameplate-border`, `deed-border-picker` (desktop / mobile / parchment), `inspect-border-cartouche` (desktop / mobile / parchment). Extra album via the same `enter_offline_game` + low-preset seed: four slugs, Catalogue vs Eternal Spoils, borderless control, player and target rings, inspect name crop, high-preset pair.
- Reviewers (fresh, read-only, vs `origin/release/v0.39.0`): `qa-checklist`, `test-coverage-auditor`, `frontend-seam-reviewer`. Confirmed gate and coverage findings were fixed and re-tested. Non-blocking notes: motif writers mint a small per-plate array/closure; the ring painter writes unused pad/radius/alpha chrome vars that elide after first paint.
- `node scripts/gate_select.mjs` PASS (12 steps, selective, 8 workers).
- No sim / server / wire / IWorld change. No new player-facing strings.

## Phase 2 notes

- extraLift is 14. Declutter Y is 32 / 34. Well fill is `#14110c` at 0.4.
- Phase 2 fixed confirmed chassis gaps only: vacuous `Object.keys(input())` pins, missing 15px / AI-Cheater / self-hide / 25px declutter / shared-lift assertions. No Phase 1 test was weakened or deleted.
- Fairness: core and canvas take no gfx / governor / effects-profile argument. Identity draws on every tier. Only the existing portrait-ring bloom rides `--fx-shadow`.
- Forced-colors: unit pin is the evidence (OS setting was not toggled). No palette hex survives.
- Screenshots live under `docs/screenshots/deed-border-cartouche/phase-01/`. Seeded at `graphicsPreset: 1`. A headless SwiftShader boot of preset 5/6 did not reach the world hook, so the high-preset bloom comparison is the existing unit pin (identity has no tier input; only the CSS ring bloom reads `--fx-shadow`). Forced-colors uses the same unit pin.
- Reviewers (fresh, read-only, vs `origin/release/v0.39.0`): `qa-checklist`, `test-coverage-auditor`, `frontend-seam-reviewer`. Confirmed findings were fixed and re-tested.
- No sim / server / wire / IWorld change. No new player-facing strings. No Phase 3 identity in the tree.
