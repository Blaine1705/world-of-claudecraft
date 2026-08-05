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
| 2 QA | pending | same worktree + pull |
| 3 IWorld + wire thrift | pending | same worktree + pull |
| 3 QA | pending | same worktree + pull |
| 4 Window shell + Overview | pending | same worktree + pull |
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

## Surprises / decisions during implementation

- Phase 1 ships one stub Conqueror page (`conquerors_hollow_crypt` / `boundstone_helm`) so the discovery hook and tests exercise a real catalogued id; Phase 2 expands the full Conqueror catalog and may replace or absorb the stub.
- Phase 2 absorbed the stub page id: Hollow Crypt now lists cryptbone / greyjaw / gravewoven uniques; `boundstone_helm` lives on Sanctum (its real drop).
- Heroic pages list `HEROIC_BOSS_LOOT` gear only; mount reins stay for Horizons. `heroic_<base>` variants are not catalogued (base discovery already credits the base id).
- World-boss clear meter uses existing `deedStats.counters.thunzharrKills` via a new `deed_stat` clearSource kind (no parallel counter).
- Epic set pages pin members to the same lists as `col_set_*` deeds; multi-page fill is intentional for shared set pieces.
- No `reliquaryUnlock` SimEvent and no wire keys yet (Phase 3).
- No UI (Phase 4+).
