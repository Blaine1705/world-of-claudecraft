# The Reliquary: progress

**Worktree:** `/Users/fernando/Documents/wocc-reliquary`  
**Branch:** `feature/reliquary`  
**Base tip at worktree create:** `origin/release/v0.35.0` @ `de450dc41f`
(Merge pull request #2924 desktop Discord avatar CSP).

| Phase | Status | Notes |
|---|---|---|
| 0 Worktree + pull release | **done** | worktree created; plan packet present; re-pull release at every later phase |
| 1 Foundation (sim state + marks) | **done** | catalog types, sparse PlayerMeta.reliquary, markItemDiscovered hook, serialize omit-empty, pure completion helpers, tests |
| 1 QA | **done** | exit criteria verified; no defects; release still @ de450dc41f |
| 2 Conqueror catalog | **done** | 22 conqueror pages: dungeon N/H, raid, Thunzharr, delves, epic sets; pin tests |
| 2 QA | **done** | exit criteria verified; no defects; release still @ de450dc41f |
| 3 IWorld + wire thrift | **done** | IWorldReliquary facet, reliq heavy self, reliquaryUnlock, ClientWorld parity |
| 3 QA | **done** | exit criteria verified; pin defects fixed; release @ 5e83ba89d0 |
| 4 Window shell + Overview | **done** | pure view + cold window, Overview, shelf chrome, keybind Shift+X, minimap/More, i18n English |
| 4 QA | **done** | exit criteria verified; M16 + Options keybind defects fixed; release @ 5e83ba89d0 |
| 5 Page grids + live UX | **done** | grid cells, silhouettes, unlock toast, Illumination, ownershipDigest |
| 5 QA | **done** | exit criteria verified; pin holes closed; release @ 413de574cf |
| 6 Curator ranks + cosmetics | **done** | pure ranks, seals, rank-up celebration, zero-Renown deed bridges |
| 6 QA | **done** | exit criteria verified; same-event Illumination + pin holes closed; release @ 0d2d5d1833 |
| 7 Professions shelf | **done** | authored pages, lifetime marks, thin craft/gather call sites, UI |
| 7 QA | pending | same worktree + pull |
| 8 Horizons shelf | pending | same worktree + pull |
| 8 QA | pending | same worktree + pull |
| 9 Social, wiki, polish, gate, PR | pending | same worktree + pull |

## Verified outcomes

- Phase 0: `git worktree add -b feature/reliquary /Users/fernando/Documents/wocc-reliquary origin/release/v0.35.0` at `de450dc41f`.
- Phase 1: merged `origin/release/v0.35.0` (already up to date @ `de450dc41f`). Green:
  - `npx vitest run tests/reliquary_state.test.ts tests/deeds.test.ts tests/architecture.test.ts` (152 passed)
  - `npx tsc --noEmit`
- Phase 1 QA: re-pulled `origin/release/v0.35.0` (already up to date @ `de450dc41f`).
  Re-ran the same validation matrix: **152 passed**, `tsc --noEmit` clean.
  Checklist (all held):
  - Fresh reliquary empty; serialize omits empty key
  - First catalogued discover writes firstFind + recent; second is no-op
  - Non-catalogued discover does not grow firstFind
  - Retro ownership counts without inventing firstFind clears
  - No second full discovery set; no per-drop saveCharacter
  - Module-first (thin CharacterState pass-through on sim.ts only)
  - Sim purity: no Math.random / Date.now in new paths
  - No em dash / emoji in new copy/comments
  - Performance budget Phase 1 rows still checked in state.md
  No code defects; docs-only handoff update (no commit).
- Phase 2: merged `origin/release/v0.35.0` (already up to date @ `de450dc41f`). Green:
  - `npx vitest run tests/reliquary_content.test.ts tests/reliquary_state.test.ts` (37 passed)
  - `npx tsc --noEmit`
  Catalog: 22 Conqueror pages (5 dungeons N+H, Nythraxis N+H, Thunzharr,
  2 delves, 7 epic sets). Clear sources: dungeon / delve / deed_stat
  (thunzharrKills) / none. Phase 1 stub id `conquerors_hollow_crypt` kept and
  expanded; boundstone_helm moved to Gravewyrm Sanctum. No UI, no wire.
- Phase 2 QA: re-pulled `origin/release/v0.35.0` (already up to date @ `de450dc41f`).
  Re-ran validation: **37 passed**, `tsc --noEmit` clean.
  Checklist (all held):
  - Every page source maps to a real dungeon / delve / DEED_STAT_KEYS id
  - Every relic item id exists in ITEMS
  - Heroic pages include every non-mount HEROIC_BOSS_LOOT id per boss
  - Set pages match col_set_* collectItems lists exactly
  - Phase 1 stub `conquerors_hollow_crypt` absorbed (real Hollow Crypt uniques;
    boundstone_helm on Sanctum)
  - No heroic_<base> catalog entries; no mount reins on Conqueror pages
  - No trash / unbounded full-table scrape (content pins refuse known junk)
  - Clear sources: dungeon N/H, delve, deed_stat (thunzharrKills), none for sets
  - firstFind / sparse serialize / no second discovery set still green
  - No em dash / emoji in Phase 2 catalog, runtime, or pin tests
  - Performance budget Phase 2 row still checked in state.md
  No code defects; docs-only handoff update (no commit).
- Phase 3: merged `origin/release/v0.35.0` (advanced: fine-material bag UI) to
  tip `5e83ba89d0`. Green:
  - `npx vitest run tests/world_api_parity.test.ts tests/reliquary_wire.test.ts tests/reliquary_state.test.ts tests/reliquary_content.test.ts` (**351 passed**)
  - Targeted snapshots pins for `reliq` + TERSE map (**4 passed**)
  - `npx tsc --noEmit`
  Landed: `IWorldReliquary` facet (3 data + 4 methods), barrel + Sim + ClientWorld,
  parity pin 296 members / 32 facets, heavy-gated `reliq` sparse blob, id-only
  `reliquaryUnlock` SimEvent (HEAVY_SELF_EVENTS, no saveCharacter), wire thrift
  tests. No UI window.
- Phase 3 QA: merged `origin/release/v0.35.0` (training-buy-button afford) to tip
  `5e83ba89d0` (merge commit on feature). Green after pin fixes:
  - `npx vitest run tests/world_api_parity.test.ts tests/reliquary_wire.test.ts tests/reliquary_state.test.ts tests/reliquary_content.test.ts` (**353 passed**)
  - Snapshots delta-key + TERSE pins including `reliq` (ALL_DELTA_KEYS length 65)
  - `npx tsc --noEmit`
  Checklist (all held):
  - IWorldReliquary on Sim + ClientWorld; barrel; parity 296 / 32 facets
  - Online + offline completion identical for scripted state
  - reliquaryUnlock id-only (itemId / pageIds / illuminatedPageId); no English
  - Sparse `reliq` firstFind / marks[] / recent[]; heavy + dirty-only; omit-empty
  - No dual itemsDiscovered on reliq; ownership stays on dstats
  - No saveCharacter on pure relic fill (saveCharacter spy + deed contrast)
  - Module-first thin IWorld reads only; no UI window / styles / keybind
  - Sim purity; server observes; no em dash / emoji on Phase 3 surface
  - Performance budget Phase 3 wire row still checked in state.md
  Defects fixed (test-only): ALL_DELTA_KEYS count pin lagged reliq (+1); false-green
  saveCharacter pin replaced with GameServer.saveCharacter spy + deed contrast;
  marks[] / illuminatedPageId / presentation-only / absolute completion pins;
  bareClient defaults for reliquary mirrors; loadAccountFlair mock for join noise.
  Reviews: cross-platform-sync GREEN; database-performance PASS; test-coverage
  auditor BLOCKING/SHOULD-FIX addressed. No architecture second look required.

- Phase 4: merged `origin/release/v0.35.0` (already up to date @ `5e83ba89d0`).
  Green:
  - `npx vitest run tests/reliquary_view.test.ts tests/reliquary_window.test.ts tests/hud_update_drive.test.ts tests/hud_perf_budget.test.ts tests/architecture.test.ts` (**177 passed**, 4 skipped)
  - `npm run i18n:gen`
  - `npx tsc --noEmit`
  - biome on changed TS files
  Landed: `reliquary_view.ts` (UI_PURE_CORES), `reliquary_window.ts` cold painter
  (signature + focus_restore + scroll preserve + clearsDigest), Overview
  (totals, Curator rank placeholder, recent, nearly-complete), shelf nav
  chrome with page stub lists, keybind `reliquary` Shift+KeyX, minimap +
  mobile More launchers, `hudChrome.reliquary.*` English keys, desktop +
  mobile styles. No full silhouette grids / Illumination (Phase 5). Page
  content names still catalog English (content re-localize later); mark
  find labels deferred to Phase 7.
  Reviews: frontend-seam-reviewer YELLOW (SHOULD-FIX: clearsDigest + CSS banner
  + view/window tests addressed; page-name content i18n deferred); test-coverage
  auditor YELLOW (BLOCKING nearly-rank + cap pin fixed).

- Phase 4 QA: re-pulled `origin/release/v0.35.0` (already up to date @
  `5e83ba89d0`). Initial matrix green; specialist review found defects fixed
  test-first:
  - `BIND_ACTION_LABEL_KEYS.reliquary` -> `hudChrome.reliquary.title` (Options
    / gamepad keybind labels were falling back to raw English)
  - M16 non-Latin fills for wordy `hudChrome.reliquary.*` +
    `hudChrome.mobile.reliquary` (zh_CN, zh_TW, ja_JP, ko_KR, ru_RU)
  - Stronger pure-core pins: nearly best-five order, pageId tie-break, marks
    alone do not invent catalog progress, non-zero shelf totals; window
    clearsDigest must be an arg to `reliquaryRefreshSig` (comment-stripped)
  Green after fixes:
  - `npx vitest run tests/reliquary_view.test.ts tests/reliquary_window.test.ts tests/hud_update_drive.test.ts tests/hud_perf_budget.test.ts tests/architecture.test.ts tests/i18n_completeness.test.ts` (**189 passed**, 4 skipped)
  - `npm run i18n:gen`
  - `npx tsc --noEmit`
  - biome on changed TS files
  Checklist (all held):
  - Openable Reliquary: Overview + shelf chrome; page lists stub
  - `reliquary_view` in UI_PURE_CORES; cold window signature latch
  - `reliquaryRefreshSig` + `clearsDigest`; focus_restore; scroll preserve
  - Keybind `reliquary` Shift+KeyX; bare KeyX remains emote wheel
  - Minimap + More tray launchers; Options BIND map uses t()
  - Thin Hud compose only
  - English chrome + M16 non-Latin fills; Latin overlays pending (PR-tier OK)
  - Overview totals / Curator placeholder / recent / nearly from discovery
  - Fairness: no graphics-tier gate on owned/missing/clears
  - No silhouette grids / Illumination celebration (Phase 5)
  - No per-drop saveCharacter; no membership from reliquaryUnlock
  - No em dash / emoji
  - Performance budget Phase 4 cold-window row still checked in state.md
  Reviews: frontend-seam-reviewer BLOCKING (M16) fixed; qa-checklist BLOCKING
  (BIND map) fixed; test-coverage SHOULD-FIX pins addressed. architecture
  not re-run (no sim path change). Manual open/Esc/mobile smoke not run
  (static + unit pins only).

- Phase 5: merged `origin/release/v0.35.0` (material-usedby-tooltip) resolving
  generated `pending.ts` via `i18n:gen`; tip `93863f9a95`. Green:
  - `npx vitest run tests/reliquary_view.test.ts tests/reliquary_window.test.ts tests/hud_update_drive.test.ts tests/hud_perf_budget.test.ts tests/architecture.test.ts` (**193 passed**, 4 skipped)
  - `npm run i18n:gen`
  - `npx vitest run tests/i18n_completeness.test.ts -t "non-Latin player surfaces"`
  - `npx tsc --noEmit`
  - biome on changed TS files
  Landed: pure page grid cells + unlock/Illumination plan in `reliquary_view`,
  cold page detail painter (owned art vs quality silhouettes, tooltips,
  progress bar + clears, Illuminated badge), `ownershipDigest` in refresh sig,
  thin Hud `handleReliquaryUnlocks` (toast + celebration banner + force open
  window render), Phase 5 English chrome + M16 non-Latin fills, desktop +
  mobile grid styles. No Curator cosmetics (Phase 6); no profession mark
  authoring (Phase 7); SFX reuses `audio.achievement()` (no new sample assets).
  Reviews (pre-commit): frontend-seam YELLOW (SHOULD-FIX: drop dead just-filled
  CSS; page-name content i18n deferred as Phase 4); test-coverage BLOCKING/
  SHOULD-FIX pins addressed (scoped CSS, Illumination order, HUD plan body,
  firstFind + ownershipDigest wiring); qa-checklist READY for Phase 5 QA.
  Commit: `f7066ca009`.

- Phase 5 QA: merged `origin/release/v0.35.0` (profession skill-level toast PR
  #2934) to tip `413de574cf`. Conflict only in generated `pending.ts`, resolved
  via `npm run i18n:gen`. Merge commit `18985ba602`.
  Initial matrix green (**201 passed**, 4 skipped). Specialist review:
  - frontend-seam-reviewer: **GREEN** (0 BLOCKING / 0 SHOULD-FIX)
  - test-coverage-auditor: **YELLOW** high SHOULD-FIX pins closed test-first:
    - `buildReliquaryView` firstFind pass-through on pageDetail cells
      (owned clear# + spoof-without-ownership + retro-owned)
    - `handleReliquaryUnlocks` body must apply `plan.logs` / `plan.banner` /
      `showCelebrationBanner(..., plan.motion)` / illuminate + unlock toast
      keys (not only `plan.motion` token); presentation-only (no membership write)
  - qa-checklist: **READY** (architecture / cross-platform N/A for Phase 5 UI)
  Green after pin fixes:
  - `npx vitest run tests/reliquary_view.test.ts tests/reliquary_window.test.ts tests/hud_update_drive.test.ts tests/hud_perf_budget.test.ts tests/architecture.test.ts tests/i18n_completeness.test.ts` (**202 passed**, 4 skipped)
  - `npm run i18n:gen` (merge resolution)
  - `npx vitest run tests/i18n_completeness.test.ts -t "non-Latin player surfaces"`
  - `npx tsc --noEmit`
  - biome on changed test files
  Checklist (all held):
  - Open page: owned art vs quality silhouettes; progress X/Y; clear count
  - Tooltips: owned item catalog tip + firstFind clear#; missing name + status
  - Live unlock: toast + force open-window render; membership from mirrors
  - Illumination: last-wins banner; reduced-motion trims motion only
  - `ownershipDigest` + `clearsDigest` in `reliquaryRefreshSig`
  - Decisive grid / unlock plan / window wiring pins (firstFind feed, HUD body, CSS)
  - Desktop + mobile styles; touch targets >= 40px; DESIGN tokens
  - Ownership = `deedStats.itemsDiscovered` (+ marks when authored)
  - No per-drop saveCharacter; no membership invent from `reliquaryUnlock`
  - Cold window: signature latch; focus_restore; scroll preserve
  - Fairness: no graphics-tier gate on owned/missing/clears
  - Cosmetic only; luck never scores Renown
  - Thin Hud compose; `reliquary_view` in UI_PURE_CORES
  - No em dash / emoji on Phase 5 surface
  - No Phase 6 rank cosmetics / deed bridges; no Phase 7 profession marks
  - Page content names remain catalog English (deferred)
  - Cell fill-flash CSS intentionally not shipped
  Manual open/Esc/mobile/unlock smoke not run (static + unit pins only).

- Phase 6: merged `origin/release/v0.35.0` (already up to date @ `413de574cf`).
  Green:
  - `npx vitest run tests/reliquary_state.test.ts tests/reliquary_view.test.ts tests/reliquary_window.test.ts tests/architecture.test.ts tests/deeds_content.test.ts tests/deeds_completion.test.ts tests/deed_i18n.test.ts tests/deeds_view.test.ts tests/reliquary_wire.test.ts tests/language_fanout_registry.test.ts` (**235+ passed** under limited workers)
  - `npm run i18n:gen`
  - `npx vitest run tests/i18n_completeness.test.ts -t "non-Latin player surfaces"`
  - `npx tsc --noEmit`
  - biome on changed files (errors fixed; pre-existing warnings only)
  Landed:
  - `CURATOR_RANK_DEFS` thresholds [1, 10, 25, 50, 100] with seal ids
    apprentice/keeper/master/grand/eternal (pure; no power fields)
  - Rank from unique catalogued item fills only (`catalogItemCompletion`)
  - `reliquaryUnlock.curatorRank` on threshold cross (id-only numeric)
  - Rank-up banner priority: rankUp > Illumination > unlock; reduced-motion
    trims motion only; Illumination toast still logs under rank-up banner
  - Overview named ranks + window seal chrome (`data-seal` + CSS)
  - Zero-Renown manual deed bridges `col_reliquary_rank_2..5` (titles ranks
    2 to 4; border `reliquary_gilt` at rank 5); sticky = `deedsEarned` via
    `grantDeed` (no `rankRewardsGranted` blob)
  - Live grant on rank-up; join `retroFallbackGrants` sync for veterans
  - English chrome + M16 non-Latin fills for rank names / rank-up toast
  - Language fan-out registry row for `reliquary_window` (BLOCKING fix)
  Decisions: no sticky Reliquary blob field; deeds own durability. Rank 1 is
  chrome-only (no deed). No per-drop saveCharacter; grantDeed only when a
  title/border bridge actually unlocks. No Phase 7 profession marks.
  Manual rank-up smoke not run (static + unit pins only).
  Reviews: architecture GREEN (0 BLOCKING; SHOULD-FIX retro pin added);
  test-coverage SHOULD-FIX pins closed; frontend BLOCKING fan-out fixed.

- Phase 6 QA: merged `origin/release/v0.35.0` (tool-charm tooltips) to tip
  `0d2d5d1833`. Conflict only in generated `pending.ts`, resolved via
  `npm run i18n:gen`. Merge commit `8e5c2e6f13`.
  Initial matrix green (**252 passed**, 1 skipped). Specialist review:
  - architecture-reviewer: **GREEN** (0 BLOCKING; SHOULD-FIX catalog total
    >= 100 reachability pin closed)
  - frontend-seam-reviewer: **GREEN** (0 BLOCKING; SHOULD-FIX shared
    `curatorRankNameKey` for Hud + window closed)
  - test-coverage-auditor: **RED** then fixed:
    - **BLOCKING:** same-event rank-up + Illumination dropped
      `illuminatedPageId` in `buildReliquaryUnlockPlan` (production emit ships
      both on one event). Fixed: always capture Illumination for secondary log;
      banner priority still rankUp > Illumination > unlock. Decisive test added.
    - SHOULD-FIX pins closed: clears-alone never raise rank; join
      `retroFallbackGrants` source-guard for `syncCuratorRankDeeds`; no
      `rankRewardsGranted` on serialize; manual triggers for
      `col_reliquary_rank_2..5`; rank-5 boundary `100 -> 5`; catalog total
      >= 100.
  Green after fixes:
  - `npx vitest run tests/reliquary_state.test.ts tests/reliquary_view.test.ts tests/reliquary_window.test.ts tests/architecture.test.ts tests/deeds_content.test.ts tests/deeds_completion.test.ts tests/deed_i18n.test.ts tests/deeds_view.test.ts tests/reliquary_wire.test.ts tests/language_fanout_registry.test.ts` (**255 passed**, 1 skipped)
  - `npm run i18n:gen` (merge resolution)
  - `npx vitest run tests/i18n_completeness.test.ts -t "non-Latin player surfaces"`
  - `npx tsc --noEmit`
  - biome on changed files (warnings only; no errors)
  Checklist (all held):
  - Pure rank thresholds [1, 10, 25, 50, 100]; seals + deedId linkage pinned
  - Cosmetic only: titles/borders/seal chrome; no stats/dropRate/pity
  - Rank from unique catalogued item fills; non-catalog and clears-alone stay 0
  - Luck/rank bridges renown 0; sticky via deedsEarned / grantDeed only
  - Rank-up celebration: same-event Illumination log under rank-up banner;
    reduced-motion trims motion only; rankUp > Illumination > unlock
  - No rankRewardsGranted blob; serialize keys firstFind/marks/recent only
  - Overview named rank + seal; shared curatorRankNameKey
  - No per-drop saveCharacter; no second discovery set
  - Module-first; language fan-out includes reliquary_window
  - English + M16 non-Latin for Phase 6 wordy chrome
  - No em dash / emoji on Phase 6 surface
  - No Phase 7 profession marks / Phase 8 Horizons / Phase 9 wiki-PR
  - Catalog unique total >= 100 (Eternal rank reachable; currently 124)
  Manual rank-up smoke not run (static + unit pins only).
  Residual risks: page content names still catalog English (deferred);
  Latin overlays pending (PR-tier OK); mobile/browser E2E of seal chrome
  and reduced-motion not exercised live.

- Phase 7: merged `origin/release/v0.35.0` (bank instance marks) to tip
  `401bfdaccc` (feature merge commit `17e0e87c0f`). Green:
  - `npx vitest run tests/reliquary_content.test.ts tests/reliquary_state.test.ts tests/reliquary_view.test.ts tests/reliquary_window.test.ts tests/architecture.test.ts tests/reliquary_wire.test.ts tests/gather_rare_events.test.ts` (**190 passed**)
  - `npm run i18n:gen`
  - `npx vitest run tests/i18n_completeness.test.ts -t "non-Latin player surfaces"`
  - `npx tsc --noEmit`
  - biome on changed hand-authored TS files
  Landed:
  - 3 Professions pages (append-only): `professions_masterwork`,
    `professions_field_notes`, `professions_specimens` (25 total pages)
  - Masterwork marks: `masterwork:first` + five gear crafts (weaponcrafting,
    armorcrafting, tailoring, leatherworking, engineering); live craft only
    (no invented retro craft history)
  - Field notes: reuse `gather_event:pristine_vein|ancient_heartwood|moonlit_bloom|perfect_specimen`
  - Specimens: pristine corpse items + apex fine grades (item ownership via
    `itemsDiscovered`)
  - `noteReliquaryMark` + `syncReliquaryMarksFromVisited` (join silent retro
    of visited field notes only); `RELIQUARY_MARK_TO_PAGES` for Illumination
  - `catalogRelicCompletion` (items + marks) for Overview totals and Curator rank
  - Thin call sites: craft masterwork, gather rare announce, perfect specimen land
  - UI: markFind `t()` labels; epic/rare mark silhouettes; shelf progress
  - English chrome + M16 non-Latin for all markFind leaves
  Decisions: masterwork retro empty until next craft; field notes dual-write
  visited + marks Set; cooking/alchemy/etc. not catalogued for masterwork;
  page names still catalog English (deferred with Conquerors).
  Reviews: architecture 0 BLOCKING (SHOULD-FIX CRAFT_RING + call-site pins
  addressed); frontend 0 BLOCKING (SHOULD-FIX markFind completeness + mark
  grid pins addressed); test-coverage BLOCKING gather fakeCtx + literal pins
  fixed; database-performance **PASS**.
  Manual craft/gather smoke not run (static + unit pins only).
  Residual risks: no behavioral masterwork integration test beyond source pin
  (gather e2e pins marks); page-name content i18n deferred; Horizons still stub.

## Surprises / decisions during implementation

- Phase 1 ships one stub Conqueror page (`conquerors_hollow_crypt` / `boundstone_helm`) so the discovery hook and tests exercise a real catalogued id; Phase 2 expands the full Conqueror catalog and may replace or absorb the stub.
- Phase 2 absorbed the stub page id: Hollow Crypt now lists cryptbone / greyjaw / gravewoven uniques; `boundstone_helm` lives on Sanctum (its real drop).
- Heroic pages list `HEROIC_BOSS_LOOT` gear only; mount reins stay for Horizons. `heroic_<base>` variants are not catalogued (base discovery already credits the base id).
- World-boss clear meter uses existing `deedStats.counters.thunzharrKills` via a new `deed_stat` clearSource kind (no parallel counter).
- Epic set pages pin members to the same lists as `col_set_*` deeds; multi-page fill is intentional for shared set pieces.
- Phase 3: wire key `reliq` (omit-empty SavedReliquaryState). Fans out to three
  IWorld members so it is outside TERSE_TO_IWORLD (asserted directly like tal).
- Phase 3: `reliquaryUnlock` dirties heavy self only; detectActivity does not
  force saveCharacter (unlike deedUnlocked).
- Phase 4: default keybind confirmed free (`Shift+KeyX`; bare KeyX is emote wheel).
- Phase 4: launcher uses `data-icon="crown"` (SVG glyph; no painted chrome webp yet).
- Phase 4: page grids intentionally stub lists with live progress + clears;
  full silhouette grid is Phase 5.
- Phase 7: field-note mark ids are the same strings as deed `visited` marks
  (`gather_event:*`); ownership for Reliquary grids is the sparse `marks` Set
  (joined from visited on retro, dual-written on live rare finds).
- Phase 7: Curator rank / Overview totals now use `catalogRelicCompletion`
  (unique items + unique authored marks); prior Phase 6 item-only rank math
  is replaced so profession prestige can rank up.
- Phase 5: missing cells paint the item icon under a silhouette filter (quality
  border retained) so the grid reads as a museum silhouette, not an empty slot.
- Phase 5: owned item tooltips reuse full `itemTooltip` (catalog stats) and
  append first-find clear# when present; missing tips are name + status only
  (no invented power).
- Phase 5: Illumination celebration reuses the deed banner variant + achievement
  sound; motion flag honors reduced-motion (information always survives).
- Phase 5: page content names stay catalog English (same Phase 4 deferral;
  content re-localize is not Phase 5 scope). Cell fill-flash CSS was dropped
  rather than left unwired; celebration is banner + toast + sound.
- Phase 6: Curator rank thresholds stay [1, 10, 25, 50, 100]. Named ranks:
  Apprentice / Spoilskeeper / Master / Grand / Eternal Curator. Deed bridges
  at ranks 2 to 5 only (renown 0); rank 1 is seal chrome only. Sticky grants
  reuse `deedsEarned` (no `rankRewardsGranted` on ReliquaryState). Rank-up
  outranks Illumination for the single banner slot.
