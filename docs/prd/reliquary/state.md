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

- **Current phase:** Phase 2 complete. Ready for Phase 2 QA, then Phase 3
  (IWorld + wire thrift).
- **Next action:** in `/Users/fernando/Documents/wocc-reliquary`, pull
  `origin/release/v0.35.0`, run Phase 2 QA (content + state pins, tsc, checklist
  in progress.md), then Phase 3: IWorld facet, sparse wire, ClientWorld parity.
- **Blocker:** none.
- **Release tip at Phase 2:** `de450dc41f` (already up to date on merge).

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
| Runtime + serialize | `src/sim/reliquary.ts` (`ReliquaryState`, `onItemDiscovered`, pure completion, `deed_stat` clear reads) |
| Discovery hub | `src/sim/deeds.ts` `markItemDiscovered` (calls `onItemDiscovered`) |
| Player state field | `PlayerMeta.reliquary` / `CharacterState.reliquary` in `src/sim/sim.ts` |
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
| Heavy self | `server/game.ts` self wire / `dstats` |
| Deeds UI exemplar | `src/ui/deeds_view.ts`, `deeds_window.ts` |
| Interface standard | `DESIGN.md` |
| Deeds doctrine | `docs/design/deeds.md` |
| Phase 1 tests | `tests/reliquary_state.test.ts` |
| Phase 2 content pins | `tests/reliquary_content.test.ts` |

## Naming ledger (fill as Phase 1 lands)

| Symbol | Path | Status |
|---|---|---|
| `RELIQUARY_PAGES` / shelves | `src/sim/content/reliquary.ts` | **landed** (22 Conqueror pages) |
| `RELIQUARY_HEROIC_GEAR` / `RELIQUARY_SET_MEMBERS` | `src/sim/content/reliquary.ts` | **landed** (pin targets) |
| `ReliquaryClearSource` deed_stat | `src/sim/content/reliquary.ts` | **landed** (Thunzharr) |
| `ReliquaryState` / `SavedReliquaryState` | `src/sim/reliquary.ts` | **landed** |
| `onItemDiscovered` / `noteRelicItemFind` | `src/sim/reliquary.ts` | **landed** |
| `pageCompletion` / `catalogItemCompletion` / `curatorRankFromOwned` | `src/sim/reliquary.ts` | **landed** |
| `RELIQUARY_RECENT_CAP` (12) | `src/sim/reliquary.ts` | **landed** |
| `reliquaryUnlock` SimEvent | `src/sim/types.ts` | planned (Phase 3) |
| `IWorldReliquary` | `src/world_api/reliquary.ts` | planned (Phase 3) |
| `buildReliquaryView` | `src/ui/reliquary_view.ts` | planned (Phase 4) |
| `ReliquaryWindow` | `src/ui/reliquary_window.ts` | planned (Phase 4) |
| `hudChrome.reliquary.*` | `src/ui/i18n.catalog/hud_chrome.ts` | planned (Phase 4) |

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
- [ ] Wire event id-only; sparse blob dirty-gated (Phase 3)
- [ ] Cold window: signature latch; no per-frame full rebuild (Phase 4+)

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

## Research notes (plan-time)

Cross-MMO patterns informing UX (not for player copy): unified boss unique
grids + kill counts, silhouette have/need, recent finds, cosmetic completion
ranks, Adventure-Tome style zone pull (used lightly via nearly-complete),
and the failure mode of split journals that force external trackers.
WoC already has discovery + clears; the product is the museum layer and
bounded first-find meta.
