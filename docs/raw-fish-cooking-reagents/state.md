# Raw fish as cooking reagents: state

Current phase: **Phase 3 implement complete; ready for Phase 3 QA** (2026-08-04).

Feature branch: `feature/raw-fish-cooking-reagents`  
Worktree: `/Users/fernando/Documents/wocc-raw-fish-cooking`  
Base: `origin/release/v0.34.0` (re-pull at every phase).

## Locked design

1. Raw fishing catches are cooking reagents only (never a sit-heal). Cooked,
   vendor, and conjured food stay the recovery paths.
2. Catch set (ids frozen): `raw_mirror_trout`, `raw_river_perch`,
   `raw_marsh_pike`, `raw_bog_eel`, `raw_frostgill_trout`,
   `raw_stonescale_carp` (display Raw Slatefin Carp), `glimmerfin_koi`
   (display Sunglint Koi).
3. Content: `kind: 'junk'`, no `foodHp`, same shape as `game_meat` / `prime_cut`.
4. No kebab lottery. Cooking ladder and cooked `foodHp` unchanged this packet.
5. Honest materials: catches enter bank "Deposit materials" and bags Materials
   chip (desired).
6. Refuse-use English: `That is raw. Cook it first.` via sim_i18n EXACT
   `error.rawCatchCookFirst` (sim `ctx.error`, not server_i18n).
7. UI kind: honest materials **Material**; fine grades **Fine Material**;
   non-material junk **Junk**.
8. Tooltip: cooking-ingredient line via pure key table + `createTooltipLine`
   (createElement). Do not grow `materialHintLine` HTML for catches. Full
   legacy `itemTooltip` string rewrite out of scope.
9. Icons still read as fish after leaving `kind: 'food'`.
10. No DB / wire shape change. i18n: English catalog + M16 non-Latin for wordy
    keys. Sim language-agnostic.
11. Bank `depositAllTooltip` already correct for reagents/junk; no reword unless
    inaccurate.
12. Fishing proficiency: grey junk (weed/boot) stops teaching past skill 100;
    raw cooking catches still teach (`!isRawCookingCatch` carve-out).

## Deferred (future packets)

- Well Fed buffs, party feasts, higher cooking rungs / new zone fish
- Specialty lottery food (kebab-like)
- Requiring cooking skill to eat cooked food (not desired)

## Ledger

- New modules: `src/ui/cooking_catch_hint_view.ts`, `src/ui/tooltip_line.ts`
- New tests: `tests/raw_cooking_catches.test.ts`,
  `tests/cooking_catch_hint_view.test.ts`,
  `tests/raw_cooking_catch_icons.test.ts`
- i18n: `itemUi.kind.material`, `hudChrome.materialHint.cookingCatch` (+ M16);
  Phase 1 `error.rawCatchCookFirst`
- Pure export: `RAW_COOKING_CATCH_IDS` / `isRawCookingCatch` in
  `src/sim/content/items.ts`
- Material set: +7 catches (honest set size 52)
- Guide English (Phase 3): fishing gear body/food, fishing tablesNote, cooking
  materialsBody; no raw sit-and-eat claim remains in catalog English
- sellValue (Phase 3): **accepted unchanged**
  - Vale: perch 2c, trout 3c
  - Marsh: pike/eel 6c
  - Peak: frostgill/slatefin 10c
  - Rare koi 75c
  - Zone-tier monotonic; each raw floor below its primary cooked meal vendor
    value; pin in `tests/raw_cooking_catches.test.ts`
- Screenshots (Phase 3):
  - `docs/screenshots/raw-fish-cooking-reagents/raw-mirror-trout-tooltip-desktop.png`
  - `docs/screenshots/raw-fish-cooking-reagents/cooked-pan-seared-perch-tooltip-desktop.png`
  - `docs/screenshots/raw-fish-cooking-reagents/bags-materials-chip-fish-desktop.png`
  - Capture harness: `scripts/raw_fish_cooking_shots.mjs`

## Key paths

| Path | Role |
|---|---|
| `src/sim/content/items.ts` | Catch defs, `RAW_COOKING_CATCH_IDS` |
| `src/sim/items.ts` | `useItem` refuse |
| `src/sim/material_taxonomy.ts` | Honest materials |
| `src/sim/professions/fishing.ts` | Grey-junk skill carve-out |
| `src/ui/item_kind_label.ts` | Material kind line |
| `src/ui/cooking_catch_hint_view.ts` | Pure cooking purpose key |
| `src/ui/tooltip_line.ts` | createElement tt-desc / tt-sub |
| `src/ui/hud.ts` | Thin itemTooltip wire + `paintTooltipAt` |
| `src/ui/bags_view.ts` | No clickConsume on catches |
| `src/ui/icons.ts` | Fish procedural fallback |
| `src/ui/sim_i18n.ts` | Refuse matcher |
| `src/ui/i18n.catalog/guide.ts` | Fishing + cooking guide prose |

## Phase 2 QA notes (2026-08-04)

- Reviewers: qa-checklist, frontend-seam, test-coverage all **CLEAN with nits**
  (0 BLOCKING, 0 SHOULD-FIX after pin tighten).
- Coverage tighten: icon recipes pin trout droplet+fang vs fish fallback;
  depositAllTooltip full-sentence pin.
- Intentional nits/defer: outerHTML bridge into legacy string tooltip;
  `paintTooltipAt` Node arm unused by cooking wire (future migration).

## Phase 3 implement notes (2026-08-04)

- Guide catalog English only (locale overlays stay on prior wording until
  release fill; known staleness blind spot, not a PR-tier failure).
- `docs/design/professions.md` had no raw-fish-heal claim; no design doc edit.
- `npm run wiki:content` regenerated with no guide-content.generated delta
  (prose is runtime i18n, not baked content rows).
