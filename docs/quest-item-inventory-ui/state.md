# Quest Item Inventory UI: cross-phase state

Current phase: **Phase 4 complete; Phase 5 ready to start**
Worktree: `/Users/fernando/Documents/wocc-quest-item-ui`
Branch: `feature/quest-item-inventory-ui`
Base: `release/v0.34.0` (merge latest at the start of every phase)

## Locked design decisions

1. **Purpose class, not rarity.** Quest treatment never uses quality greens/blues/purples.
2. **Quest gold language.** Use DESIGN.md `--color-quest` (`#ffd12d` lineage). Land the
   token if missing. Thin rim + soft wash + small seal. No filled yellow cells, no heavy
   particles.
3. **Shape + color.** Seal glyph is primary; tint is redundant (color independence).
4. **Always on.** Identical on every graphics preset. No `--fx-*` gate on rim or seal.
5. **Glyph priority.** masterwork > quest seal > enchanted / signed / bound > generic
   instance wedge.
6. **Tooltip hierarchy.** Quest-gold title; single "Quest Item" kind (no "Common Quest
   Item"); related quest title; live progress when applicable; rules footer; orphaned line
   when not needed for an active quest.
7. **Section headers vs drops.** Soft "Quest" section headers must not break bag cell drop
   indices. In All + recent (`bagOrderIsManual` true), do **not** insert section header
   nodes into the drop-target cell stream. Use rim/seal only there. Headers are allowed
   when the grid is a derived list (`bagOrderIsManual` false) or when category is `quest`.
8. **No Key Items inventory** in this packet (no non-slot quest bag).
9. **No sim / server / wire / IWorld changes** expected. Client-readable quest log + item
   defs are enough. Stop and re-plan if that proves false.
10. **Every phase starts by merging latest `origin/release/v0.34.0`.**

## Non-negotiable constraints (root CLAUDE.md)

- Module-first pure cores; do not grow `hud.ts` or `bags_window.ts` with large logic blocks.
- Register new `*_view.ts` / pure cores in `tests/architecture.test.ts` allowlists.
- Every player-visible string is a `t()` key in English catalog modules; M16 non-Latin
  fills for wordy values in the same change.
- No em dashes, en dashes, or emojis anywhere.
- Conventional Commits with scope and body; commit explicit paths only.
- Fairness: never hide actionable info behind graphics tiers.
- Prefer tokens over raw hex in painters and new CSS.

## Validation matrix

| Change type | Commands |
|---|---|
| Pure UI cores | `npx tsc --noEmit` + `npx vitest run tests/<core>.test.ts tests/architecture.test.ts` |
| i18n keys | add `tests/localization_fixes.test.ts` |
| CSS / bags painter | above + `npm run ci:changed`; manual bags open |
| Full phase done | `npm run ci:changed`; dispatch frontend-seam-reviewer + test-coverage-auditor + qa-checklist |
| Packet complete | `npm run gate`; screenshots under `docs/screenshots/quest-item-inventory-ui/` |

## Key file paths

### Existing (read first)
- `src/ui/bags_window.ts` (`buildStackCell`, filter chips, tooltips)
- `src/ui/bags_view.ts`, `src/ui/bag_filter.ts`, `src/ui/bag_instance_glyph_view.ts`
- `src/ui/hud.ts` (`itemTooltip` quest branch only; do not load whole file)
- `src/ui/item_kind_label.ts`, `src/ui/item_instance_tooltip.ts`
- `src/ui/i18n.catalog/items.ts` (`itemUi.kind.quest`, `itemUi.tooltip.questItem`, bags aria)
- `src/styles/components.css` (`.bag-item`, `.bi-glyph*`)
- `src/styles/tokens.css`, `src/ui/theme.ts` (quest-related tokens)
- `src/styles/hud.css` (`#quest-tracker .qt-title`)
- `src/ui/hud/quest/quest_tracker_controller.ts`
- `src/ui/hud/loot/loot_roll_controller.ts` (name colors)
- `src/sim/content/items.ts` quest item samples (`boar_hide`, `greyjaw_fang`, …)
- `src/sim/types.ts` `ItemDef.questId`, `QuestObjective` collect/gather
- `DESIGN.md` principles + `--color-quest`
- `tests/architecture.test.ts` pure-core registration

### Expected new modules
- `src/ui/bag_quest_mark_view.ts` + `tests/bag_quest_mark_view.test.ts` (**done Phase 1**)
- `src/ui/quest_item_tooltip_view.ts` + `tests/quest_item_tooltip_view.test.ts` (**done Phase 2**)
- `src/ui/item_name_color.ts` + `tests/item_name_color.test.ts` (**done Phase 4**)
- Optional Phase 5: small bag-tracker highlight helper

## Progress resolution notes (for Phase 2)

- Quest items carry `questId` on the def.
- Objectives use `type: 'collect'` with `itemId`, and some `gather` forms with `itemId`.
- Quest log progress is available client-side via world/questLog APIs already used by the
  tracker; pure core should take plain inputs (counts map, objective list) so tests do not
  need a full Sim.
- Bag mark class `.bag-quest` and seal `.bi-quest-seal` are stable; tooltip can reuse
  `--color-quest` / quest gold language.
- Phase 2 model: `questItemTooltipModel` returns titleColorMode, showQuality false,
  kindLineKey, relatedQuestId, progress (objectiveIndex/current/required), rulesKey,
  orphaned. Host localizes related title via tEntity quest channel and progress via
  questUi.detail.objectiveProgress; rules/orphaned via itemUi.tooltip keys.

## Progress resolution notes (for Phase 3)

- **Quest filter count metric (locked):** total stack count of quest pieces, sum of
  `slot.count` for every stack with `kind === 'quest'` (`bagQuestItemCount` in
  `bag_filter.ts`). Prefer stack count over unique-stack count so "Boar Hide x5" reads 5.
  Badge paints only when N > 0; aria uses `hudChrome.bags.filterQuestCountAria`.
- **Empty Quest copy:** `bagNoMatchKind` returns `'quest'` when category is quest; painter
  maps to `hudChrome.bags.noQuestItems` (warm purpose-class line). Other filters keep
  `hudChrome.bags.noMatch`.
- **Soft section model:** `bagQuestSectionHeadersAllowed` is `!bagOrderIsManual`.
  `buildBagListRows` emits a single Quest header then quest stacks then rest only when
  headers are allowed AND the visible list mixes quest and non-quest. Manual All+recent
  paints `model.cells` only (no header nodes; drop indices stay 1:1 with capacity).
  Section label reuses `hudChrome.bags.filterQuest`.

## Beauty checklist (every visual phase)

- [x] Looks premium next to quality borders and masterwork seals (Phase 1 rim/seal)
- [x] Quest gold, not chrome gold wash over everything (`--color-quest` #ffd12d)
- [x] Mobile long-press / desktop hover both honest (tooltip Phase 2 model + host)
- [x] Reduced motion never removes the rim or seal (no motion gate on Phase 1)
- [ ] Screenshots planned or taken for the PR

## Ledger (fill as phases complete)

- New files:
  - `src/ui/bag_quest_mark_view.ts`
  - `tests/bag_quest_mark_view.test.ts`
  - `src/ui/quest_item_tooltip_view.ts`
  - `tests/quest_item_tooltip_view.test.ts`
  - `src/ui/item_name_color.ts`
  - `tests/item_name_color.test.ts`
  - `docs/quest-item-inventory-ui/*` (planning packet)
- New tokens:
  - `--color-quest: #ffd12d`
  - `--color-bag-quest-rim`
  - `--color-bag-quest-wash`
  - `--color-bag-quest-seal`
- New i18n keys:
  - `hudChrome.bags.itemAriaQuest` (EN + M16: zh_CN, zh_TW, ja_JP, ko_KR, ru_RU)
  - `itemUi.tooltip.questRelated` (EN + M16)
  - `itemUi.tooltip.questRules` (EN + M16)
  - `itemUi.tooltip.questOrphaned` (EN + M16)
  - `hudChrome.bags.filterQuestCountAria` (EN + M16)
  - `hudChrome.bags.noQuestItems` (EN + M16)
- Architecture allowlist entries:
  - `src/ui/bag_quest_mark_view.ts` in `UI_PURE_CORES`
  - `src/ui/quest_item_tooltip_view.ts` in `UI_PURE_CORES`
  - Phase 3 extended existing pure cores `bag_filter.ts` and `bags_view.ts` (already
    registered); no new `*_view.ts` file required.
  - `src/ui/item_name_color.ts` in `UI_PURE_CORES`, `BARE_NAMED`, and
    `EXPECTED_BARE_NAMED` (bare name, not `*_view` / `*_core`).
- Known gotchas discovered:
  - `.bag-item.q-common` uses `border-color: ... !important`; quest rim rule must follow
    it (or also use `!important`) so purpose gold wins on common quest stacks.
  - Glyph priority composition lives in `bags_window` buildStackCell, not inside either
    pure core (keeps bag_quest_mark free of instance-glyph imports).
  - Tooltip progress reuses `questUi.detail.objectiveProgress` so tracker and item
    tooltips share one number format; do not invent a parallel progress key.
  - Kind line uses `itemUi.kind.quest` alone (showQuality false); the legacy
    `itemUi.tooltip.questItem` desc line is no longer composed for quest kinds.
  - `fillGrid` must not use `continue` (R34 unknown-cell pin); section vs stack branches
    use if/else. Soft section headers use `grid-column: 1 / -1` on `.bag-grid`.
  - Loot roll events carry quality on the wire but kind only via knownItemDef; pass
    `{ kind: item?.kind, quality }` into `itemNameColor` so unknown ids stay on the
    quality path and quest defs paint quest gold.
  - Bare-named pure cores need three list entries: UI_PURE_CORES, BARE_NAMED, and
    EXPECTED_BARE_NAMED (architecture cross-check).

## Resume point

**Next action:** Phase 5 interactive polish. Merge latest `origin/release/v0.34.0`
first. Bag hover highlight for matching tracker rows and ready-to-turn-in seal
variant (`bag_quest_mark_view` extension), reduced-motion safe.
