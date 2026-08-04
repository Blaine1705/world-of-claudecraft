# Quest Item Inventory UI: progress

| Phase | Status | Started | Completed |
|---|---|---|---|
| Planning packet | Complete | 2026-08-03 | 2026-08-03 |
| Phase 1: Bag visual identity | Complete | 2026-08-03 | 2026-08-03 |
| Phase 2: Story tooltip | Complete | 2026-08-03 | 2026-08-03 |
| Phase 3: Findability chrome | Complete | 2026-08-03 | 2026-08-03 |
| Phase 4: Cross-surface language | Complete | 2026-08-03 | 2026-08-03 |
| Phase 5: Interactive polish | Complete | 2026-08-03 | 2026-08-03 |
| Phase 6: Final QA + screenshots + gate | Complete | 2026-08-04 | 2026-08-04 |

## Phase 1 deliverables
- [x] `src/ui/bag_quest_mark_view.ts` pure core registered in architecture allowlists
- [x] Quest bag tokens (`--color-quest` if missing + bag rim/wash/seal tokens as needed)
- [x] CSS: `.bag-item.bag-quest`, `.bi-quest-seal` (rim, seal; always-on)
- [x] `bags_window.ts` wiring: class, seal, glyph priority, aria
- [x] English aria i18n key(s); M16 fills if wordy
- [x] `tests/bag_quest_mark_view.test.ts` decisive
- [x] Merge latest `origin/release/v0.34.0` before coding
- [x] frontend-seam-reviewer + test-coverage-auditor clean of BLOCKING
- [x] `progress.md` / `state.md` ledger updated

## Phase 2 deliverables
- [x] `src/ui/quest_item_tooltip_view.ts` pure model + decisive tests
- [x] `Hud.itemTooltip` thin composition for quest branch
- [x] Quest-gold title/kind; no redundant Common Quest Item double line
- [x] Related quest title, progress, rules footer, orphaned line
- [x] i18n keys + M16 as required
- [x] Merge latest `origin/release/v0.34.0` before coding
- [x] Reviews clean of BLOCKING

## Phase 3 deliverables
- [x] Quest filter count badge
- [x] Empty Quest filter copy
- [x] Soft Quest section only where `bagOrderIsManual` allows (state.md lock)
- [x] Pure helpers + tests; drop targets never break in All+recent
- [x] Merge latest `origin/release/v0.34.0` before coding
- [x] Reviews clean of BLOCKING

## Phase 4 deliverables
- [x] Shared item name color helper (quest override)
- [x] Chat item links + loot name surfaces wired
- [x] Tests for helper
- [x] Merge latest `origin/release/v0.34.0` before coding
- [x] Reviews clean of BLOCKING

## Phase 5 deliverables
- [x] Bag hover highlights matching tracker row
- [x] Ready-to-turn-in seal variant
- [x] Reduced-motion safe
- [x] Tests for mark kind extension
- [x] Merge latest `origin/release/v0.34.0` before coding
- [x] Reviews clean of BLOCKING

## Phase 6 deliverables
- [x] Full qa-checklist / woc-qa on branch diff
- [x] Desktop + mobile screenshots under `docs/screenshots/quest-item-inventory-ui/`
- [x] `npm run gate` green
- [x] Merge latest `origin/release/v0.34.0` before final gate
- [x] PR body ready (open only if user asks)
- [ ] Packet teardown only after explicit user confirmation

## Notes
- 2026-08-03: Worktree created at `/Users/fernando/Documents/wocc-quest-item-ui` from
  `origin/release/v0.34.0` (`c1c70f084e` at plan time). Branch
  `feature/quest-item-inventory-ui`. Planning packet written; no implementation yet.
- Research baseline: quest items already have `kind: 'quest'` + `questId`, bag filter
  chip, and sell/bank blocks; they paint as common/neutral in the grid and tooltips only
  say a plain "Quest Item" line. Design language wants `--color-quest` for quest moments.
- 2026-08-03 Phase 1: Landed bag visual identity. Pure core `bagQuestMarkKind`, tokens
  `--color-quest` / rim / wash / seal, CSS `.bag-item.bag-quest` + `.bi-quest-seal`,
  bags_window class/seal/glyph priority/aria, English `hudChrome.bags.itemAriaQuest` with
  M16 fills (zh_CN, zh_TW, ja_JP, ko_KR, ru_RU). Validation: tsc, pure-core + bags marker
  + architecture + localization tests, `npm run ci:changed`.
- 2026-08-03 Phase 2: Story tooltip. Pure core `questItemTooltipModel` (quest gold title
  mode, showQuality false, related quest id, collect/gather progress from plain log +
  objectives, rules + orphaned keys). Thin `Hud.itemTooltip` composition: title/kind gold,
  no Common Quest Item double line, story block via host escape + tEntity. English keys
  `itemUi.tooltip.questRelated` / `questRules` / `questOrphaned` with M16 fills. Progress
  reuses `questUi.detail.objectiveProgress`. Merged latest release base first.
- 2026-08-03 Phase 3: Findability chrome. Metric lock: Quest chip badge uses total stack
  count of quest pieces (`bagQuestItemCount`, sum of counts). Empty Quest filter uses
  warm `hudChrome.bags.noQuestItems`. Soft Quest section via `buildBagListRows` only when
  `!bagOrderIsManual` and the list mixes quest + non-quest; manual All+recent keeps the
  real cell stream (rim/seal only, no header nodes). i18n EN + M16 for count aria and
  empty copy. Merged latest release base first.
- 2026-08-03 Phase 4: Cross-surface language. Pure helper `itemNameColor` in
  `item_name_color.ts`: kind === 'quest' returns `var(--color-quest)`; otherwise
  QUALITY_COLOR with hasOwn + `var(--color-quality-default)` fallback. Chat item links
  and loot-roll names (need/greed, watch, master) use the helper; tooltip title color
  also routes through it so surfaces cannot drift. QUEST_ITEM_TOOLTIP_COLOR aliases
  QUEST_ITEM_NAME_COLOR. Registered in UI_PURE_CORES + BARE_NAMED + EXPECTED_BARE_NAMED.
  Merged latest release base first (already up to date).
- 2026-08-03 Phase 5: Interactive polish. Merged latest `origin/release/v0.34.0` first.
  `bagQuestMarkKind` + `bagQuestMarkProgressFromLog` return `questReady` from plain log
  state ready or complete matching collect/gather rows (never invent ready from kind
  alone). Bags paint `.bag-quest-ready` / `.bi-quest-seal-ready` with brighter seal
  token; optional pulse drops under prefers-reduced-motion (seal/rim stay). Bag hover
  uses pure `bagQuestTrackerHighlightId` + thin `BagQuestTrackerHighlight` to toggle
  `.qt-bag-hover` on matching `#quest-tracker .qt-title[data-quest]`; clear on leave,
  tooltip hide (drag/peek), rebuild, and close. Tokens:
  `--color-bag-quest-seal-ready`, `--color-quest-tracker-bag-hover`. No new player
  strings. Validation: tsc, mark + highlight + bags marker + architecture tests,
  `npm run ci:changed`.
- 2026-08-04 Phase 6: Final QA + screenshots + gate. Merged latest
  `origin/release/v0.34.0` (i18n pending conflict resolved via regen). Closed
  Phase 5 ready-seal gap with DOM paint tests against a real `questLog` for
  `q_boars`/`boar_hide`. Added bags_window source pin for tracker highlight
  wiring + hover CSS fairness. Reviewers (frontend-seam, test-coverage, qa-checklist)
  returned READY WITH NOTES (no BLOCKING code). Screenshots:
  `docs/screenshots/quest-item-inventory-ui/before|after-bags-mixed-{desktop,mobile}.png`.
  Full `npm run gate` PASS (all 10 steps; vitest workers=2 after quieter re-run).
  Packet teardown deferred until user confirmation. PR not opened (await ask).
