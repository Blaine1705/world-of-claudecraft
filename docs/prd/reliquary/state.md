# The Reliquary: cross-phase state

## Worktree (do not skip)

| | |
|---|---|
| **Path** | `/Users/fernando/Documents/wocc-reliquary` |
| **Branch** | `feature/reliquary` |
| **Created from** | `origin/release/v0.35.0` @ `de450dc41f` |

Every implementer and every subagent for this feature must `cd` to that path
before edits. Other checkouts are other sessions; do not mix.

### Pull release at every phase start (copy-paste)

```bash
cd /Users/fernando/Documents/wocc-reliquary
git status --short
git fetch origin release/v0.35.0
git merge --no-edit origin/release/v0.35.0
```

If merge conflicts: resolve in this worktree only, re-run the phase validation
matrix, then continue. If the release line advances past v0.35.0, fetch/merge
the new `origin/release/**` tip and note it here.

## Resume point

- **Current phase:** Phase 8 QA complete (Horizons shelf verified).
- **Next action:** in `/Users/fernando/Documents/wocc-reliquary`, pull
  `origin/release/v0.35.0`, then Phase 9 (social/wiki/polish/gate/PR). Do
  **not** skip the release pull. Do **not** open a PR until Phase 9 gate is
  green.
- **Blocker:** none.
- **Release tip after Phase 8 QA pull:** `origin/release/v0.35.0` @
  `d3190ff008` (editor camp cap / moderation / ground-object pool; feature
  merge `134267ba04`). Horizons surface was not moved by the merge.
- **Phase 8 feature tip (impl):** `4e13cac7b6`. QA defect fixes commit on
  top of the release merge.

## Locked design decisions

See `implementation-plan.md` and `docs/design/reliquary.md`. Restated for
session load:

1. Name: **The Reliquary**; code prefix `reliquary`.
2. Ship all shelves on one feature branch: Overview, Conquerors, Professions,
   Horizons, ranks, social/wiki polish.
3. Pair with Book of Deeds; do not merge systems.
4. Item ownership = `deedStats.itemsDiscovered` via `markItemDiscovered`.
5. Sparse `PlayerMeta.reliquary` only: firstFind (catalogued relics), marks,
   capped recent; omit-empty serialize.
6. firstFind clear# only on live first obtain; retro ownership without fake
   clear history.
7. No per-drop `saveCharacter`; ride 30s autosave / leave / existing deed
   durability saves.
8. Cosmetic-only Curator ranks; luck never scores Renown.
9. Module-first: `content/reliquary`, `sim/reliquary`, `world_api/reliquary`,
   pure `reliquary_view` + cold `reliquary_window`.
10. DESIGN.md grammar and tokens; cold signature-gated UI.
11. Same-change page authoring + content pin tests against live loot tables.
12. English-only new `t()` keys; no overlay hand-fills; no em dashes or emojis.
13. **Always** work in `/Users/fernando/Documents/wocc-reliquary` and merge
    latest `origin/release/v0.35.0` (or current release) at the start of
    **every** phase and QA pass.

## Symbol and path anchors (live code today)

| Concern | Anchor |
|---|---|
| Design contract | `docs/design/reliquary.md` |
| Catalog types + Conqueror pages | `src/sim/content/reliquary.ts` (`RELIQUARY_PAGES`, `RELIQUARY_HEROIC_GEAR`, `RELIQUARY_SET_MEMBERS`, `isCataloguedRelicItem`) |
| Runtime + serialize | `src/sim/reliquary.ts` (`ReliquaryState`, `onItemDiscovered`, pure completion, `deed_stat` clear reads, `reliquaryWireBlob`) |
| Discovery hub | `src/sim/deeds.ts` `markItemDiscovered` (calls `onItemDiscovered`) |
| Player state field | `PlayerMeta.reliquary` / `CharacterState.reliquary` in `src/sim/sim.ts` |
| IWorld facet | `src/world_api/reliquary.ts` (`IWorldReliquary`) |
| Wire event | `reliquaryUnlock` in `src/sim/types.ts` SimEvent union |
| Heavy self key | `reliq` in `server/game.ts` (HEAVY_SELF + `reliquaryUnlock` in HEAVY_SELF_EVENTS) |
| ClientWorld mirror | `src/net/online.ts` (`reliquaryFirstFind` / Marks / Recent + completion helpers) |
| Parity pin | `tests/world_api_parity.test.ts` (306 members, 33 facets after release union) |
| Wire thrift tests | `tests/reliquary_wire.test.ts` |
| Grant hub | `src/sim/sim.ts` `addItem` / `addItemInstance` |
| DeedStats | `src/sim/types.ts` `DeedStats` |
| Dungeon clears | `deedStats.dungeonClears`, `FINAL_BOSS_DUNGEONS` |
| Delve clears | `PlayerMeta.delveClears`, `grantDelveClearTo` |
| World boss kills | `deedStats.counters.thunzharrKills` (clearSource `deed_stat`) |
| Heroic loot | `src/sim/content/heroic_loot.ts` |
| Sets | `src/sim/content/item_sets.ts` + col_set_* deeds |
| World bosses | `src/sim/world_boss.ts` |
| Mounts | `src/sim/mounts.ts`, `src/sim/content/mounts.ts` |
| Weapon skins | `src/sim/content/weapon_skins.ts` + account cosmetics |
| Autosave | `server/game.ts` `AUTOSAVE_SECONDS = 30` |
| Heavy self | `server/game.ts` self wire / `dstats` / `reliq` |
| Deeds UI exemplar | `src/ui/deeds_view.ts`, `deeds_window.ts` |
| Interface standard | `DESIGN.md` |
| Deeds doctrine | `docs/design/deeds.md` |
| Phase 1 tests | `tests/reliquary_state.test.ts` |
| Phase 2 content pins | `tests/reliquary_content.test.ts` |

## Naming ledger (fill as Phase 1 lands)

| Symbol | Path | Status |
|---|---|---|
| `RELIQUARY_PAGES` / shelves | `src/sim/content/reliquary.ts` | **landed** (22 Conqueror + 3 Profession + 3 Horizons) |
| Horizons hand lists | `src/sim/content/reliquary.ts` | **landed** (`RELIQUARY_HORIZON_MOUNTS` / `_WEAPON_SKINS` / `_TITLES`) |
| `catalogRankOwned` | `src/sim/reliquary.ts` | **landed** (character-durable rank; excludes account skins) |
| `characterReliquaryOwnership` | `src/sim/reliquary.ts` | **landed** (uses `ownedMounts` live seam) |
| `maybeSyncCuratorRankDeeds` | `src/sim/reliquary.ts` | **landed** (Phase 8 QA: mount first-discover + title grant) |
| `isHorizonsTitleDeed` | `src/sim/reliquary.ts` | **landed** (Phase 8 QA; grantDeed rank hook) |
| Account-scope chrome | `hudChrome.reliquary.accountScope*` | **landed** (English + M16 non-Latin) |
| Profession mark constants | `src/sim/content/reliquary.ts` | **landed** (`RELIQUARY_PROFESSION_MARKS`, specimens) |
| `RELIQUARY_MARK_TO_PAGES` | `src/sim/content/reliquary.ts` | **landed** (Phase 7) |
| `noteReliquaryMark` / `syncReliquaryMarksFromVisited` | `src/sim/reliquary.ts` | **landed** (Phase 7) |
| `catalogRelicCompletion` | `src/sim/reliquary.ts` | **landed** (items + marks for rank/Overview) |
| Craft/gather mark call sites | `crafting.ts` / `gather_events.ts` / `interaction.ts` | **landed** (thin post-success) |
| Mark find i18n | `hudChrome.reliquary.markFind.*` | **landed** (English + M16 non-Latin) |
| `RELIQUARY_HEROIC_GEAR` / `RELIQUARY_SET_MEMBERS` | `src/sim/content/reliquary.ts` | **landed** (pin targets) |
| `ReliquaryClearSource` deed_stat | `src/sim/content/reliquary.ts` | **landed** (Thunzharr) |
| `ReliquaryState` / `SavedReliquaryState` | `src/sim/reliquary.ts` | **landed** |
| `onItemDiscovered` / `noteRelicItemFind` | `src/sim/reliquary.ts` | **landed** |
| `pageCompletion` / `catalogItemCompletion` / `curatorRankFromOwned` | `src/sim/reliquary.ts` | **landed** |
| `RELIQUARY_RECENT_CAP` (12) | `src/sim/reliquary.ts` | **landed** |
| `reliquaryUnlock` SimEvent | `src/sim/types.ts` | **landed** (id-only) |
| `IWorldReliquary` | `src/world_api/reliquary.ts` | **landed** |
| `reliq` wire key | `server/game.ts` / `src/net/online.ts` | **landed** (heavy-gated sparse) |
| `reliquaryWireBlob` | `src/sim/reliquary.ts` | **landed** |
| `buildReliquaryView` / `reliquaryRefreshSig` | `src/ui/reliquary_view.ts` | **landed** (UI_PURE_CORES; Phase 5 grid + unlock plan) |
| `buildReliquaryPageCells` / `buildReliquaryUnlockPlan` | `src/ui/reliquary_view.ts` | **landed** (Phase 5 + Phase 6 rankUp banner) |
| `CURATOR_RANK_DEFS` / `curatorSealIdForRank` / `syncCuratorRankDeeds` | `src/sim/reliquary.ts` | **landed** (Phase 6) |
| `col_reliquary_rank_2..5` | `src/sim/content/deeds.ts` | **landed** (Phase 6; renown 0 manual) |
| `reliquaryUnlock.curatorRank` | `src/sim/types.ts` | **landed** (Phase 6 id-only rank-up) |
| `reliquaryOwnershipDigest` | `src/ui/reliquary_view.ts` | **landed** (Phase 5 open-window grid live) |
| `ReliquaryWindow` | `src/ui/reliquary_window.ts` | **landed** (cold; Overview + page grids + rank seals) |
| Hud `handleReliquaryUnlocks` | `src/ui/hud.ts` | **landed** (presentation toast + Illumination + rank-up) |
| `hudChrome.reliquary.*` | `src/ui/i18n.catalog/hud_chrome.ts` | **landed** (English chrome + Phase 5/6 rank keys) |
| Keybind `reliquary` | `src/game/keybinds.ts` | **landed** (default Shift+KeyX) |
| Options BIND map | `src/ui/options_window.ts` `BIND_ACTION_LABEL_KEYS.reliquary` | **landed** (Phase 4 QA) |
| M16 non-Latin chrome | `src/ui/i18n.locales/{zh_CN,zh_TW,ja_JP,ko_KR,ru_RU}.ts` | **landed** (Phase 4 + Phase 5 wordy keys) |

## Validation matrix (default commands)

| Change type | Commands |
|---|---|
| Sim foundation | `npx vitest run tests/reliquary_state.test.ts tests/deeds.test.ts tests/architecture.test.ts` |
| Catalog | `npx vitest run tests/reliquary_content.test.ts` |
| Wire / parity | `npx vitest run tests/world_api_parity.test.ts tests/reliquary_wire.test.ts` |
| UI pure + perf | `npx vitest run tests/reliquary_view.test.ts tests/hud_update_drive.test.ts tests/hud_perf_budget.test.ts` |
| Types | `npx tsc --noEmit` |
| Format | `npx @biomejs/biome check --write <changed files only>` |
| i18n | `npm run i18n:gen` + `npx vitest run tests/localization_fixes.test.ts` when strings ship |
| Full pre-merge | `npm run gate` (Phase 9 / PR) |

## Performance budget checklist (every phase that touches state or wire)

- [x] No new immediate `saveCharacter` on pure relic fill
- [x] No second full item discovery Set
- [x] Serialize omits empty Reliquary fields
- [x] firstFind / marks only catalog ids
- [x] recent ring buffer capped (plan: 12)
- [x] Content pins prevent unbounded auto-scrape of entire loot tables (Phase 2)
- [x] Wire event id-only; sparse blob dirty-gated (Phase 3)
- [x] Cold window: signature latch; no per-frame full rebuild (Phase 4)
- [x] Open-window grid live: ownershipDigest + clearsDigest in refresh sig (Phase 5)
- [x] Profession marks catalog-capped; sparse serialize; no per-drop save (Phase 7)
- [x] Field-note retro from visited only; no invented masterwork craft history (Phase 7)
- [x] Horizons ownership from live seams only (ownedMounts / account skins / deedsEarned); no dual discovery (Phase 8)
- [x] Curator rank excludes account skins (grant/display aligned); Overview totals include skins (Phase 8)
- [x] Live mount first-discover + Horizons title grant re-sync rank deeds (Phase 8 QA)

## Gotchas

- `markItemDiscovered` also runs on buyback silent path: Reliquary logic must
  live **inside** that hub (or only callee), not only in `addItem`.
- Heroic variants credit base ids for discovery; page authoring must decide
  base vs heroic row display without double-counting completion incorrectly.
  Phase 2 catalogs base ids only (never `heroic_<base>`).
- Character autosave already full-rewrites JSONB every 30s for all online
  sessions; Reliquary must stay sparse so veterans do not inflate every tick's
  serialize cost.
- Weapon skins are account cosmetics, not character loot: Horizon UI must
  label account scope.
- Masterwork lifetime may be empty for veterans until next craft (no false
  retro) unless a durable craft log is found later.
- `collapsed_reliquary` is a **delve id**, not this feature; do not overload
  that string for the window title key.
- Do not grow `hud.ts` or `sim.ts` with markup or method banks.
- Retro veterans with items already in `itemsDiscovered` own the relic for
  completion math but do **not** receive invented firstFind clear history.
- Mount reins appear on `HEROIC_BOSS_LOOT` but stay off Conqueror pages
  (Horizons Phase 8).
- Phase 3: `reliquaryUnlock` is presentation-only; membership authority is
  `dstats.itemsDiscovered` + sparse `reliq`. Do not mutate ClientWorld mirrors
  from the event.

## Research notes (plan-time)

Cross-MMO patterns informing UX (not for player copy): unified boss unique
grids + kill counts, silhouette have/need, recent finds, cosmetic completion
ranks, Adventure-Tome style zone pull (used lightly via nearly-complete),
and the failure mode of split journals that force external trackers.
WoC already has discovery + clears; the product is the museum layer and
bounded first-find meta.
