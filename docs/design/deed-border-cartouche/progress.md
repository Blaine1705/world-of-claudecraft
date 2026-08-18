# Deed-border cartouche: progress

| Phase | Status | Notes |
|---|---|---|
| 1. Cartouche chassis | complete | Core + canvas rewire landed. extraLift is 14. Declutter Y is 32 / 34. E1-E26 have decisive tests. No Phase 3 identity in the tree. |
| 2. QA: chassis | not started | Coverage map, graphics-tier check, before/after screenshots, reviewers, `gate_select`. |
| 3. Identity and family | blocked on Phase 2 | Motifs, Catalogue brass, picker, inspect, ring clasp, E27-E36 tests. |
| 4. QA: identity and family | blocked on Phase 3 | Full matrix, family screenshots, reviewers, merge bar. |

Phase 1 implemented 2026-08-18 on `feature/deed-border-cartouche`. Resume at Phase 2 (`phase-02-qa-chassis.md`).

## Coverage map (filled by QA phases)

Phase 1 wrote the E1-E26 tests below. Phase 2 audits that each row is decisive. Phase 4 fills E1-E36.

| Id | Test file / name | Status |
|---|---|---|
| E1 | `tests/nameplate_cartouche_core.test.ts` "hugs the name row with 9px x and 5px y pad and centers the name group" | written |
| E2 | `tests/nameplate_cartouche_core.test.ts` "keeps the title baseline 9px below the name row"; `tests/nameplate_canvas.test.ts` "a worn border draws the title with the name, inside the well" | written |
| E3 | `tests/nameplate_cartouche_core.test.ts` "widens to the title and keeps the name group on screenX" | written |
| E4 | `tests/nameplate_cartouche_core.test.ts` "centers the name baseline in the 24px row and keeps pad under the portrait" | written |
| E5 | `tests/nameplate_cartouche_core.test.ts` "centers the name on a 16px min row that already clears a 15px badge" | written |
| E6 | `tests/nameplate_cartouche_core.test.ts` "starts the name row after the top-left L-bracket arm" | written |
| E7 | `tests/nameplate_cartouche_core.test.ts` "places the shared name-row baseline inside the row box, not on the well floor" | written |
| E8 | `tests/nameplate_cartouche_core.test.ts` "does not clip a long measured name row" | written |
| E9 | `tests/nameplate_canvas.test.ts` "draws the dev-tier name outline after the well, never under it"; `tests/nameplate_dev_glow.test.ts` outline-then-fill pin | written |
| E10 | `tests/nameplate_cartouche_core.test.ts` "uses the 18px row height instead of a second layout" | written |
| E11 | `tests/nameplate_canvas.test.ts` "guild stays outside the plaque, below the health bar and above the cartouche" | written |
| E12 | `tests/nameplate_canvas.test.ts` "HP, cast, combo, and raid-mark slots stay on their existing y-steps" | written |
| E13 | `tests/nameplate_canvas.test.ts` "a dead player still draws the plaque when a border is worn" | written |
| E14 | `tests/nameplate_canvas.test.ts` "stealth opacity applies to the plaque as well as the text" | written |
| E15 | `tests/nameplate_cartouche_core.test.ts` "returns an inactive record for an empty slug"; `tests/nameplate_canvas.test.ts` "unknown and empty slugs draw no plaque" | written |
| E16 | `tests/nameplate_canvas.test.ts` "uses system colors for actionable shapes and text in forced-colors mode"; `tests/deed_border_accent.test.ts` canvas forced-colors arm | written |
| E17 | `tests/nameplate_cartouche_core.test.ts` "takes no dpr / uiScale field"; `tests/nameplate_canvas.test.ts` "extraLift is applied in CSS pixels, not multiplied by DPR" | written |
| E18 | `tests/nameplate_canvas.test.ts` "self-hide and non-player paths never assign a worn slug after reset" | written |
| E19 | `tests/nameplate_canvas.test.ts` "hostile name stays red inside the same slug metal, not a hostile recolor" | written |
| E20 | `tests/nameplate_canvas.test.ts` "self-hide and non-player paths never assign a worn slug after reset" | written |
| E21 | `tests/nameplate_cartouche_core.test.ts` "leaves title geometry on the existing 11px / 9px step when inactive"; `tests/nameplate_canvas.test.ts` "a borderless plate draws no well and no hardware" | written |
| E22 | `tests/nameplate_canvas.test.ts` "drawEmote and drawBase share extraLift so the bubble sits above the clasp" | written |
| E23 | `tests/nameplate_canvas.test.ts` "strokes the Book of Deeds accent as shapes, minting no new text sprite" | written |
| E24 | `tests/nameplate_cartouche_core.test.ts` "bumps the same-row threshold and stack pitch by the extra lift"; declutter constants 32 / 34 | written |
| E25 | `tests/nameplate_cartouche_core.test.ts` "takes no gfx, governor, or effects-profile argument"; `tests/deed_border_accent.test.ts` fairness path scan now includes the core | written |
| E26 | same fairness scan: identity strokes/fills have no tier input; only CSS ring bloom may use `--fx-shadow` | written |
| E27 | | pending (Phase 3) |
| E28 | | pending (Phase 3) |
| E29 | | pending (Phase 3) |
| E30 | | pending (Phase 3) |
| E31 | | pending (Phase 3) |
| E32 | | pending (Phase 3) |
| E33 | | pending (Phase 3) |
| E34 | | pending (Phase 3) |
| E35 | | pending (Phase 3) |
| E36 | | pending (Phase 2 / 4) |

## Phase 1 notes

- `extraLift` is 14 (5+5 pad plus 4px clasp protrusion).
- Declutter `OVERLAP_THRESHOLD_Y_PX` is 32, `STACK_OFFSET_PX` is 34, both derived from 18/20 + extraLift.
- Shared well fill is `#14110c` at 0.4 alpha, not a per-slug hex.
- Catalogue brass, motifs, picker, inspect, and ring clasp were not touched.
- Screenshots are Phase 2. The `nameplate-border` shot-target `when` list now includes `render/nameplate_canvas` and `render/nameplate_cartouche_core`.
- No matrix row was left unpinned.
