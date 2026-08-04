# Raw fish as cooking reagents: progress

| Phase | Status | Started | Completed |
|---|---|---|---|
| Planning packet | Complete | 2026-08-03 | 2026-08-03 |
| Phase 1: Sim truth | Complete | 2026-08-04 | 2026-08-04 |
| Phase 1 QA | Pending | | |
| Phase 2: UI/UX | Pending | | |
| Phase 2 QA | Pending | | |
| Phase 3: Guide, economy, screenshots | Pending | | |
| Phase 3 QA (gate + PR readiness) | Pending | | |

## Phase 1 deliverables

- [x] All raw catch item defs: `kind: 'junk'`, no `foodHp`
- [x] Pure raw-catch id set exported for sim + tests + UI reuse (`RAW_COOKING_CATCH_IDS` / `isRawCookingCatch` in `src/sim/content/items.ts`)
- [x] `useItem` refuses raw catches with pinned English error (no consume, no eat)
- [x] Matcher for that error (`sim_i18n` EXACT `error.rawCatchCookFirst`; sim emit, not server)
- [x] `MATERIAL_ITEM_IDS` / `HONEST_MATERIALS` re-pinned with catches in
- [x] material_taxonomy and items comments updated
- [x] Rod/fishing tests updated (no `kind === 'food'` as sole catch detector; fishing grey-junk carve-out)
- [x] Control: cooked meal still edible
- [x] Tests green; ci:changed green; architecture + coverage review clean

## Phase 2 deliverables

- [ ] `itemKindLabel`: honest materials read Material
- [ ] Raw-catch cooking-ingredient purpose line (pure key table + createElement
      paint; generic tooltip line component if reusable)
- [ ] No new feature-owned `innerHTML` / HTML-string builders for these surfaces
- [ ] Bags: no consume affordance on raw catches
- [ ] Icons: fish-like recipes for raw catch names/ids
- [ ] i18n English keys (+ M16 if wordy)
- [ ] Tests green; frontend-seam + coverage review clean

## Phase 3 deliverables

- [ ] Guide cooking materials prose accurate
- [ ] sellValue floor check (change only if needed) + pin if changed
- [ ] Screenshots under `docs/screenshots/raw-fish-cooking-reagents/`
- [ ] progress/state ledgers final; ready for gate

## Notes

Planning (2026-08-03):

- Checked out and fast-forwarded local `release/v0.34.0` to
  `4276b21118` before writing this packet.
- Current code treats raw fish as `kind: 'food'` with `foodHp`; `game_meat`
  is already non-edible junk. Material taxonomy intentionally drops kind-food
  reagents today; flipping kind to junk admits them as honest materials.
- `useItem` silently no-ops for junk without a use type; Phase 1 must add a
  loud refuse for raw catches so right-click is not dead.
- Fine material kind label already exists; Phase 2 generalizes the honest
  material line.
- Kebab lottery and Well Fed/feasts are out of scope by product decision.

Planning refresh (2026-08-04):

- Re-pulled `release/v0.34.0` at `086545b883` (quest-item inventory UI merge
  and later release work). Raw fish defs are still `kind: 'food'` + `foodHp`.
- **Reuse for Phase 2 tooltips:** `src/ui/material_hint_view.ts` has the id ->
  purpose **key** table pattern (fine grades share one key). Reuse that data
  idea for cooking catches. Prefer createElement paint over growing
  `materialHintLine`'s HTML-string path for new work.
- **UI construction lock (user, 2026-08-04):** no new innerHTML if avoidable;
  pure models + createElement components; extract generic reusable ones
  (tooltip lines) when the shape is shared. Full legacy tooltip HTML migration
  stays out of scope unless a tiny node-capable adapter is needed.
- **Bank deposit-all (#2715):** copy and `isMaterialItem` gate already match
  "crafting reagents and junk"; catches will deposit once they are honest
  materials. No Phase 1 work.

Phase 1 implementation (2026-08-04):

- Worktree: `/Users/fernando/Documents/wocc-raw-fish-cooking` on
  `feature/raw-fish-cooking-reagents` from `origin/release/v0.34.0` tip
  `22ec14cfde`.
- Refuse literal locked: `That is raw. Cook it first.` via
  `error.rawCatchCookFirst` in **sim_i18n** (sim `ctx.error` path; not
  server_i18n).
- Fishing proficiency: grey junk (weed/boot) still cut off past skill 100;
  raw cooking catches still teach (`isGreyFishingJunk` carve-out).
- Also fixed pre-existing parse corruption in
  `src/ui/i18n.resolved.generated/pending.ts` (stray PR URL in pt_BR list)
  that blocked vitest transforms of the UI tree.
