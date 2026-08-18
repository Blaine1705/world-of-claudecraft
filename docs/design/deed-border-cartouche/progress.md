# Deed-border cartouche: progress

| Phase | Status | Notes |
|---|---|---|
| 1. Cartouche chassis | complete | Core + canvas rewire landed. extraLift is 14. Declutter Y is 32 / 34. |
| 2. QA: chassis | complete | Coverage map audited. Vacuous Object.keys pins replaced. E5/E7/E18/E22/E24 now have decisive assertions. Screenshots committed. Reviewers verified. `node scripts/gate_select.mjs` PASS (12 steps). |
| 3. Identity and family | blocked on operator | Motifs, Catalogue brass, picker, inspect, ring clasp, E27-E36 tests. |
| 4. QA: identity and family | blocked on Phase 3 | Full matrix, family screenshots, reviewers, merge bar. |

Phase 2 closed 2026-08-18 on `feature/deed-border-cartouche`. Resume at Phase 3 (`phase-03-identity.md`) only when asked.

## Coverage map (filled by QA phases)

Every E1-E26 row names the assertion that would fail on a wrong pad, a missing well, a title left outside, a 24px Discord portrait kissing the floor, a leaked palette hex under forced-colors, or a y-walk desync. Load-bearing numbers are literals. E27-E35 stay Phase 3. E36 is the Phase 2 "no IWorld change" pin.

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
| E13 | `tests/nameplate_canvas.test.ts` "E13: a dead player still draws the plaque when a border is worn" (well fill + 5 strokes, `hpVisible` false) | audited |
| E14 | `tests/nameplate_canvas.test.ts` "E14: stealth opacity applies to the plaque as well as the text" (0.55 and 0.55 * 0.4) | audited |
| E15 | `tests/nameplate_cartouche_core.test.ts` "returns an inactive record for an empty slug"; `tests/nameplate_canvas.test.ts` "E15: unknown and empty slugs draw no plaque"; `tests/nameplate_ai_tag.test.ts` title-deed `prog_veteran` -> `''` | audited |
| E16 | `tests/nameplate_canvas.test.ts` "uses system colors for actionable shapes and text in forced-colors mode" (no palette hex, no `#14110c`); `tests/deed_border_accent.test.ts` canvas forced-colors arm | audited |
| E17 | `tests/nameplate_cartouche_core.test.ts` "takes no dpr / uiScale field..." (comment-stripped source + input interface regex, extraLift 14); `tests/nameplate_canvas.test.ts` "E17: extraLift is applied in CSS pixels..." (no `cartoucheLift(state) *`, well Y identical at DPR 1 and 2) | audited |
| E18 | `tests/nameplate_ai_tag.test.ts` "E18: a hidden self plate with an emote never keeps a worn slug" (`border` `''`, emote url present) | audited |
| E19 | `tests/nameplate_canvas.test.ts` "E19: hostile name stays red inside the same slug metal..." (slug hexes on strokes, name `style.fill` is `#ff5555`) | audited |
| E20 | `tests/nameplate_ai_tag.test.ts` "resolves the border slug per entity..." (mob, NPC, and object planted with `col_reliquary_rank_5` still resolve `''`) | audited |
| E21 | `tests/nameplate_cartouche_core.test.ts` "leaves title geometry on the existing 11px / 9px step when inactive"; `tests/nameplate_canvas.test.ts` "E21: a borderless plate draws no well and no hardware" | audited |
| E22 | `tests/nameplate_canvas.test.ts` "E22: drawEmote and drawBase share extraLift..." (name Y and emote blit both move by 14; emote blit Y < clasp Y) | audited |
| E23 | `tests/nameplate_canvas.test.ts` "strokes the Book of Deeds accent as shapes, minting no new text sprite" (5 strokes, sprite count flat on every slug twice) | audited |
| E24 | `tests/nameplate_cartouche_core.test.ts` "bumps the same-row threshold and stack pitch by the extra lift" (32 / 34 literals); `tests/nameplate_declutter.test.ts` "E24: two plates 25px apart vertically now collide" (stack gap 34) | audited |
| E25 | `tests/nameplate_cartouche_core.test.ts` "takes no gfx, governor, or effects-profile argument"; `tests/deed_border_accent.test.ts` fairness path includes the core and forbids `--fx-shadow` / `gfxTier` / `data-fx-level` | audited |
| E26 | same fairness scan: identity strokes have no tier input; only the CSS ring bloom uses `--fx-shadow` (exactly one `box-shadow`). Phase 1 canvas has no clasp glint. Low-preset screenshots show the well and hardware. | audited |
| E27 | | pending (Phase 3) |
| E28 | | pending (Phase 3) |
| E29 | | pending (Phase 3) |
| E30 | | pending (Phase 3) |
| E31 | | pending (Phase 3) |
| E32 | | pending (Phase 3) |
| E33 | | pending (Phase 3) |
| E34 | | pending (Phase 3) |
| E35 | | pending (Phase 3) |
| E36 | `git diff --name-only origin/release/v0.39.0...HEAD` has no `src/world_api*`, `src/net/`, `server/`, or `src/sim/` files. Worn slug still resolves (`tests/nameplate_ai_tag.test.ts` `prog_prestige_10` -> `prestige_laurels`). | audited (Phase 2) |

## Phase 2 notes

- extraLift is 14. Declutter Y is 32 / 34. Well fill is `#14110c` at 0.4.
- Phase 2 fixed confirmed chassis gaps only: vacuous `Object.keys(input())` pins, missing 15px / AI-Cheater / self-hide / 25px declutter / shared-lift assertions. No Phase 1 test was weakened or deleted.
- Fairness: core and canvas take no gfx / governor / effects-profile argument. Identity draws on every tier. Only the existing portrait-ring bloom rides `--fx-shadow`.
- Forced-colors: unit pin is the evidence (OS setting was not toggled). No palette hex survives.
- Screenshots live under `docs/screenshots/deed-border-cartouche/phase-01/`. Seeded at `graphicsPreset: 1`. A headless SwiftShader boot of preset 5/6 did not reach the world hook, so the high-preset bloom comparison is the existing unit pin (identity has no tier input; only the CSS ring bloom reads `--fx-shadow`). Forced-colors uses the same unit pin.
- Reviewers (fresh, read-only, vs `origin/release/v0.39.0`): `qa-checklist`, `test-coverage-auditor`, `frontend-seam-reviewer`. Confirmed findings were fixed and re-tested.
- No sim / server / wire / IWorld change. No new player-facing strings. No Phase 3 identity in the tree.
