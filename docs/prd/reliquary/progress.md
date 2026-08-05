# The Reliquary: progress

**Worktree:** `/Users/fernando/Documents/wocc-reliquary`  
**Branch:** `feature/reliquary`  
**Base tip at worktree create:** `origin/release/v0.35.0` @ `de450dc41f`
(Merge pull request #2924 desktop Discord avatar CSP).

| Phase | Status | Notes |
|---|---|---|
| 0 Worktree + pull release | **done** | worktree created; plan packet present; re-pull release at every later phase |
| 1 Foundation (sim state + marks) | **done** | catalog types, sparse PlayerMeta.reliquary, markItemDiscovered hook, serialize omit-empty, pure completion helpers, tests |
| 1 QA | pending | same worktree + pull |
| 2 Conqueror catalog | pending | same worktree + pull |
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

## Surprises / decisions during implementation

- Phase 1 ships one stub Conqueror page (`conquerors_hollow_crypt` / `boundstone_helm`) so the discovery hook and tests exercise a real catalogued id; Phase 2 expands the full Conqueror catalog and may replace or absorb the stub.
- No `reliquaryUnlock` SimEvent and no wire keys yet (Phase 3).
- No UI (Phase 4+).
