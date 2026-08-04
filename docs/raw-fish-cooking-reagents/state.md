# Raw fish as cooking reagents: cross-phase state

Current phase: **Phase 2 complete; ready for Phase 2 QA** (2026-08-04).

Base: rebased onto latest `origin/release/v0.34.0` at Phase 2 start
(includes #2842 bear form and pending-registry fix). Re-pull at every phase.

Feature branch: `feature/raw-fish-cooking-reagents`  
Worktree: `/Users/fernando/Documents/wocc-raw-fish-cooking`

## Locked design decisions

1. **Product rule:** raw fishing catches are cooking reagents only. Players
   cannot eat them for a sit-heal. Cooking (or buying cooked food / vendor /
   conjured food) is how you recover with food.
2. **Catch set (complete for this packet):**
   - `raw_mirror_trout`
   - `raw_river_perch`
   - `raw_marsh_pike`
   - `raw_bog_eel`
   - `raw_frostgill_trout`
   - `raw_stonescale_carp` (display: Raw Slatefin Carp; id frozen)
   - `glimmerfin_koi` (display: Sunglint Koi)
3. **Content shape:** `kind: 'junk'`, **no** `foodHp`, same pattern as
   `game_meat` / `prime_cut`. Quality and names unchanged.
4. **No kebab lottery** on raw fish (rejected; specialty lottery food may be a
   future packet only).
5. **Cooking ladder unchanged** this packet: skillReq 0 / 25 / 50 recipes and
   cooked `foodHp` values stay. Skill 0 free rung remains the onboarding cook path.
6. **Vendor food + conjured food unchanged** (non-cook survival valve).
7. **Material taxonomy:** raw catches that recipes consume are honest materials
   (kind junk + recipe reagent). Bank "Deposit materials" and bags Materials
   chip include them; that is desired.
8. **Refuse-use:** not a silent no-op. Stable English sim error
   `That is raw. Cook it first.` (locked Phase 1), with **sim_i18n** EXACT
   matcher key `error.rawCatchCookFirst` in the same change (sim `ctx.error`
   path; not server_i18n).
9. **UI kind line:** honest materials show **Material**; fine grades keep
   **Fine Material**; non-material junk stays **Junk**.
10. **Tooltip:** raw catches show a cooking-ingredient / must-cook line; never
    a restore-health line. Prefer a pure model (keys / plain strings only) plus
    a **createElement** paint path. Reuse the *data* idea of
    `material_hint_view.ts` (id -> purpose key table, fine-grade shared-key
    pattern) but do **not** grow new HTML template-string / `innerHTML` debt
    for this feature. If a shared key table is enough, keep it data-only and
    paint through a generic tooltip-line component (see UI construction rule).
11. **Icons:** still read as fish after leaving `kind: 'food'`.
12. **Ids frozen** (shipped item ids are API). Display names may stay as today.
13. **No DB / wire shape change** expected. Error text uses the existing error
    pipeline + sim_i18n matcher.
14. **i18n:** English catalog only for new keys; M16 non-Latin fills for wordy
    values in the same change. Sim stays language-agnostic (English emit +
    client matcher).
15. **Bank deposit-all (release #2715):** `hudChrome.bank.depositAllTooltip`
    already says crafting reagents and junk move, while tools / gear / quest /
    consumables do not, and the button gates on `isMaterialItem`. Once catches
    are junk reagents they correctly deposit; no deposit-button reword is
    required unless a Phase 2 check finds the copy inaccurate.
16. **UI construction (no new innerHTML debt):** for every NEW player-visible
    surface this packet owns, prefer:
    - pure, DOM-free view models / decision helpers (Node-tested);
    - thin painters that build with `createElement`, `textContent`,
      `classList`, and `replaceChildren` (or PainterHost writers on hot paths);
    - **generic reusable components** when the same shape will serve more than
      one call site (tooltip line rows, material kind label resolution, etc.).
    Do **not** add new modules that return markup strings for `innerHTML`
    assignment when a createElement component can do the same job. Escaping
    player text still applies wherever text is set. Migrating the whole legacy
    `itemTooltip` / `attachTooltip(() => string)` stack off HTML strings is
    **out of scope** unless a tiny generic adapter is required so this feature
    can mount nodes into `#tooltip` without string HTML.
17. **Fishing proficiency (Phase 1 lock):** grey fishing junk (weed/boot) still
    stops teaching past skill 100; raw cooking catches still teach. Production
    predicate: `kind === 'junk' && !isRawCookingCatch(id)`.

## Non-negotiable constraints (root CLAUDE.md)

- `src/sim/` pure: no DOM/Three; determinism; no `Math.random`.
- Module-first: pure helpers for refuse decision, kind label, tooltip lines;
  thin coordinator wiring only.
- Every player-visible string is a `t()` key on the client; server/sim player
  errors get matcher rows.
- No em dashes, en dashes, or emojis in code, docs, commits, or copy.
- Conventional Commits with scope and body; explicit path staging.
- Prefer worktree + branch off latest `release/**`, not `main`.

## Validation matrix

| Change class | Commands |
|---|---|
| Sim / content / taxonomy | `npx tsc --noEmit`; `npx vitest run` on material_taxonomy, fishing, rod recipes, new raw-catch tests, localization_fixes |
| UI labels / tooltips / bags / icons | `npx tsc --noEmit`; item_kind_line, bags_view, bag_filter, new tooltip/icon tests, localization_fixes |
| Guide prose | `npm run wiki:content` if needed; `npx vitest run tests/guide.test.ts` |
| Any code change | `npm run ci:changed` |
| Packet complete | `npm run gate` |

## Key file paths

| Path | Role |
|---|---|
| `src/sim/content/items.ts` | Raw catch defs + fishing tables + `RAW_COOKING_CATCH_IDS` |
| `src/sim/content/recipes.ts` | Cooking + rod recipes consuming catches |
| `src/sim/content/profession_items.ts` | Cooked meal defs (control, do not weaken) |
| `src/sim/material_taxonomy.ts` | Honest materials derivation |
| `src/sim/items.ts` | `useItem` food branch + refuse arm |
| `src/sim/professions/fishing.ts` | Grey-junk gain carve-out |
| `src/ui/item_kind_label.ts` | Quality/kind tooltip line (string labels today; keep pure) |
| `src/ui/material_hint_view.ts` | **Data reuse (Phase 2):** id -> purpose key table pattern; avoid growing its HTML-string line builder for new work |
| `src/ui/quest_item_tooltip_view.ts` | Precedent: pure tooltip **model** (prefer this half), not HTML-string story blocks |
| New generic tooltip DOM helpers (if needed) | createElement-based `tt-desc` / `tt-sub` line components; reusable across item/material hints |
| `src/ui/hud.ts` | Thin wire only; do not grow HTML template banks |
| `src/ui/bags_view.ts` | Click/consume affordances |
| `src/ui/bag_filter.ts` | Materials chip via `isMaterialItem` |
| `src/ui/bank_view.ts` / `bank_window.ts` | Deposit materials (`isMaterialItem`); deposit-all tooltip |
| `src/ui/icons.ts` | Procedural item icons |
| `src/ui/sim_i18n.ts` | Sim error matchers (refuse-use) |
| `src/ui/server_i18n.ts` | Server error matchers (not used for this refuse) |
| `src/ui/i18n.catalog/` | New itemUi / materialHint keys; guide cooking prose |
| `tests/material_taxonomy.test.ts` | Exact material set pin |
| `tests/raw_cooking_catches.test.ts` | Non-edible + refuse + cooked control |
| `tests/material_hint_view.test.ts` | Material purpose-hint pins (extend in Phase 2) |
| `tests/professions_rod_recipes.test.ts` | Catch reagent detection |
| `tests/professions_fishing.test.ts` | Fishing behavior + grey-junk gain |
| `tests/item_kind_line.test.ts` | Kind label pins |

## Open decisions (non-blocking)

None. Refuse literal locked as `That is raw. Cook it first.`

## Explicitly deferred (future packets)

- Well Fed buffs on cooked food
- Party feasts
- Higher cooking skill rungs / new zone fish
- Specialty lottery food (kebab-like) as its own item
- Requiring cooking skill to *eat* cooked food (not desired)

## Ledger (fill as phases complete)

- New files:
  - `tests/raw_cooking_catches.test.ts`
  - `docs/raw-fish-cooking-reagents/*` (planning packet)
  - `src/ui/cooking_catch_hint_view.ts` (pure purpose-key table)
  - `src/ui/tooltip_line.ts` (createElement tt-desc / tt-sub factory)
  - `tests/cooking_catch_hint_view.test.ts`
  - `tests/raw_cooking_catch_icons.test.ts`
- New i18n keys:
  - `itemUi.kind.material` ("Material")
  - `hudChrome.materialHint.cookingCatch` ("Cooking ingredient. Must be cooked before eating.")
  - M16 non-Latin fills for both (zh_CN, zh_TW, ja_JP, ko_KR, ru_RU)
  - Phase 1 sim_i18n: `error.rawCatchCookFirst`
- New error literals: `That is raw. Cook it first.` (`error.rawCatchCookFirst`)
- Material set delta: +7 (`raw_mirror_trout`, `raw_river_perch`,
  `raw_marsh_pike`, `raw_bog_eel`, `raw_frostgill_trout`,
  `raw_stonescale_carp`, `glimmerfin_koi`); honest set size 52
- Pure export: `RAW_COOKING_CATCH_IDS` / `isRawCookingCatch` in
  `src/sim/content/items.ts` (Phase 2 UI reuse)
- Phase 2 UI:
  - Kind: Material for honest materials; Fine Material unchanged; grey Junk
  - Cooking line via pure key + `createTooltipLine` (not `materialHintLine` HTML)
  - `paintTooltipAt` accepts `string | Node`
  - Bags: no clickConsume on catches; petFeedBlocked
  - Icons: fish-like procedural fallback (`isRawCookingCatch` + name tokens)
  - Bank depositAllTooltip: no copy change (already correct)
- Screenshots: (pending Phase 3)
- Also: one-line parse fix in `src/ui/i18n.resolved.generated/pending.ts`
  (stray PR URL on `guildDormantHint` pt_BR row)
