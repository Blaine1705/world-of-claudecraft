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
| 4 QA | pending | same worktree + pull |
| 5 Page grids + live UX | pending | same worktree + pull |
| 5 QA | pending | same worktree + pull |
| 6 Curator ranks + cosmetics | pending | same worktree + pull |
| 6 QA | pending | same worktree + pull |
| 7 Professions shelf | pending | same worktree + pull |
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
  + window/window tests addressed; page-name content i18n deferred); test-coverage
  auditor YELLOW (BLOCKING nearly-rank + cap pin fixed).

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
