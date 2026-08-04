# Quest Item Inventory UI: progress

| Phase | Status | Started | Completed |
|---|---|---|---|
| Planning packet | Complete | 2026-08-03 | 2026-08-03 |
| Phase 1: Bag visual identity | Complete | 2026-08-03 | 2026-08-03 |
| Phase 2: Story tooltip | Pending | | |
| Phase 3: Findability chrome | Pending | | |
| Phase 4: Cross-surface language | Pending | | |
| Phase 5: Interactive polish | Pending | | |
| Phase 6: Final QA + screenshots + gate | Pending | | |

## Phase 1 deliverables
- [x] `src/ui/bag_quest_mark_view.ts` pure core registered in architecture allowlists
- [x] Quest bag tokens (`--color-quest` if missing + bag rim/wash/seal tokens as needed)
- [x] CSS: `.bag-item.bag-quest`, `.bi-quest-seal` (rim, wash, seal; always-on)
- [x] `bags_window.ts` wiring: class, seal, glyph priority, aria
- [x] English aria i18n key(s); M16 fills if wordy
- [x] `tests/bag_quest_mark_view.test.ts` decisive
- [x] Merge latest `origin/release/v0.34.0` before coding
- [x] frontend-seam-reviewer + test-coverage-auditor clean of BLOCKING
- [x] `progress.md` / `state.md` ledger updated

## Phase 2 deliverables
- [ ] `src/ui/quest_item_tooltip_view.ts` pure model + decisive tests
- [ ] `Hud.itemTooltip` thin composition for quest branch
- [ ] Quest-gold title/kind; no redundant Common Quest Item double line
- [ ] Related quest title, progress, rules footer, orphaned line
- [ ] i18n keys + M16 as required
- [ ] Merge latest `origin/release/v0.34.0` before coding
- [ ] Reviews clean of BLOCKING

## Phase 3 deliverables
- [ ] Quest filter count badge
- [ ] Empty Quest filter copy
- [ ] Soft Quest section only where `bagOrderIsManual` allows (state.md lock)
- [ ] Pure helpers + tests; drop targets never break in All+recent
- [ ] Merge latest `origin/release/v0.34.0` before coding
- [ ] Reviews clean of BLOCKING

## Phase 4 deliverables
- [ ] Shared item name color helper (quest override)
- [ ] Chat item links + loot name surfaces wired
- [ ] Tests for helper
- [ ] Merge latest `origin/release/v0.34.0` before coding
- [ ] Reviews clean of BLOCKING

## Phase 5 deliverables
- [ ] Bag hover highlights matching tracker row
- [ ] Ready-to-turn-in seal variant
- [ ] Reduced-motion safe
- [ ] Tests for mark kind extension
- [ ] Merge latest `origin/release/v0.34.0` before coding
- [ ] Reviews clean of BLOCKING

## Phase 6 deliverables
- [ ] Full qa-checklist / woc-qa on branch diff
- [ ] Desktop + mobile screenshots under `docs/screenshots/quest-item-inventory-ui/`
- [ ] `npm run gate` green
- [ ] Merge latest `origin/release/v0.34.0` before final gate
- [ ] PR body ready (open only if user asks)
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
