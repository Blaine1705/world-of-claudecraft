# Phase 6: Achievement mirror

Copy Book of Deeds unlocks to Epic achievements for linked accounts. Observer
only. Independent of the Steam mirror (D21). Dark when `EPIC_ENABLED` is unset.

## Deliverables

1. `server/epic/achievement_map.ts`
   - deed id -> Epic achievement id map
   - hard cap policy like Steam (document permanent IDs, D14)
   - start with the same deed set Steam maps where practical; empty map is ok
     only if tests pin "unmapped deeds are no-ops"
2. `server/epic/mirror.ts`
   - FIFO, in-flight dedupe, capped retries, drop + warn
   - reconcile-on-link, reconcile-on-login (throttled)
   - link cache with TTL
   - injectable deps for tests (Steam mirror pattern)
3. `web_api.ts` achievement unlock push (server-trusted path per O2; confirm docs)
4. Wire observers:
   - `server/deeds_records.ts`: also call epic `onDeedRecorded` (direct import,
     not steam barrel)
   - `server/game.ts`: epic `reconcileOnLogin` beside steam
   - Shutdown hook if steam has `stopSteamMirror` twin
5. Tests: dark default, push batching, failure drop, no await on recorder path
6. Resolve O2 in state.md

## Out of scope

Portal achievement art/XP configuration (maintainer). Client UI.

## Acceptance

- STEAM and EPIC mirrors independent
- Hot path does not await Epic network
- Default off with no env

## Starter prompt

```
This is Phase 6 of the Epic Games Store integration packet: Achievement mirror.
Worktree: /home/fernandoramirez/Documents/woc-epic-games-integration
Branch: feature/epic-games-integration.

Goal: implement server/epic achievement mirror as an observer twin of
server/steam/mirror.ts, wired from deeds_records and login reconcile, dark by default.

STEP 0 - PRE-FLIGHT: git status clean. Phases 3 and 5 required.
Read state.md D13, D14, D21, D3 and server/steam/CLAUDE.md.

STEP 1 - LOAD CONTEXT:
  server/steam/mirror.ts
  server/steam/achievement_map.ts
  server/steam/web_api.ts
  server/deeds_records.ts
  server/game.ts (reconcileOnLogin site)
  tests/server/steam_mirror.test.ts
  tests/steam_achievement_map.test.ts
  Epic Achievements / Ecom server docs for unlock API (fetch current; resolve O2)

STEP 2 - EXECUTE Deliverables. Do not put Epic imports in src/sim.
Keep fire-and-forget. Direct imports only (avoid barrel drag into game.ts).

INVARIANTS: D13, D14, D21, D3, D23.

OUT OF SCOPE: UI, portal art, electron.

STEP 3 - VALIDATE:
  npx vitest run tests/server/epic_mirror.test.ts tests/server/steam_mirror.test.ts
  npx vitest run tests/server/epic_routes.test.ts
  npx tsc --noEmit
  npm run ci:changed
  database-performance-reviewer if new query cadence appears; privacy-security if new secrets.

STEP 4 - DOCS: progress.md Phase 6; state.md O2 closed; list mapped deed count without
rotting line numbers.

STEP 5 - FINAL RESPONSE: handoff for Phase 7 (UI + i18n).

STOPPING RULES:
  - Stop if mirror becomes authoritative over deeds.
  - Stop if world loop awaits Epic IO.
```
