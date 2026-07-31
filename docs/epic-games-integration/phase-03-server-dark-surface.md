# Phase 3: Server dark surface (`server/epic/` skeleton)

Land the env-gated Epic API surface so it can merge to main with **no** Epic
credentials. Default dark. Structure mirrors `server/steam/`.

## Deliverables

1. `server/epic/` modules:
   - `config.ts`: `epicEnabled()` live read of `EPIC_ENABLED === '1'`; helpers for
     product/deployment/client ids and secret returning null when unset
   - `routes.ts`: gate-first middleware; `POST/DELETE/GET` paths per D17
     - When disabled: `HttpError(503, 'epic.disabled')` before auth
     - When enabled but not provisioned: stable `epic.upstream` on link (Steam twin)
     - Handlers may stub verify until Phase 5, but must not mint sessions
   - `epic_db.ts`: accessors for `epic_links` (insert, delete, lookup, displace)
   - `index.ts`: export `routes` only
   - Optional no-op `mirror.ts` exports (`onDeedRecorded`, `reconcileOnLogin`,
     `onLinkChanged`) as inert stubs so Phase 6 is additive
2. DDL in `server/db.ts` SCHEMA: `epic_links` additive (`account_id` PK,
   `epic_account_id` TEXT UNIQUE, created_at), comments that it is never identity
3. `server/http/registry.ts`: register epic routes
4. `server/http/error_codes.ts`: epic.* family codes (disabled, invalid_token,
   upstream, banned, already_linked, account_taken, ...)
5. Rate limit: `EPIC_LINK_POLICY` twin of steam in middleware/ratelimit
6. Status advert: `epic: { enabled: epicEnabled() }` on the RouteDef status path;
   keep legacy arm consistent with how steam is advertised today
7. `server/epic/CLAUDE.md` short local guide (copy steam tone)
8. Tests:
   - `tests/server/epic_routes.test.ts`: disabled by default; source-scan forbids
     login mint patterns under `server/epic/`
   - `tests/server/epic_db.test.ts` or DDL pins as appropriate
   - Default suite needs **no** `EPIC_*` env

## Out of scope

Real EOS HTTP verification (Phase 5), achievement push (Phase 6), UI, electron shell.

## Acceptance

- Server boots with zero Epic env
- `EPIC_ENABLED` unset => all epic routes `epic.disabled`
- No credential minting
- migration-safety: additive DDL only

## Starter prompt

```
This is Phase 3 of the Epic Games Store integration packet: Server dark surface.
Worktree: /home/fernandoramirez/Documents/woc-epic-games-integration
Branch: feature/epic-games-integration.

Goal: add server/epic env-gated routes and epic_links DDL that stay fully dark and
merge-safe with no Epic credentials, mirroring server/steam.

STEP 0 - PRE-FLIGHT: git status clean. Phase 1-2 should be done or at least not
block this phase (server is independent). Read state.md D2, D3, D10, D15, D17,
D18, D19, D23.

STEP 1 - LOAD CONTEXT (Steam twin is the blueprint):
  server/steam/CLAUDE.md
  server/steam/config.ts
  server/steam/routes.ts
  server/steam/steam_db.ts
  server/steam/index.ts
  server/db.ts (steam_links DDL)
  server/http/registry.ts
  server/http/error_codes.ts
  server/leaderboard.ts (status advert)
  server/main.ts (legacy status steam hardcode pattern)
  tests/server/steam_routes.test.ts
  server/http/CLAUDE.md
  docs/epic-games-integration/state.md

STEP 2 - EXECUTE Deliverables in phase-03-server-dark-surface.md.
Module-first. Registry RouteDefs only. Feature gate FIRST on every route.
Source-scan test: linking allowed, LOGIN WITH EPIC DOES NOT EXIST.
Do not wire deeds_records yet (Phase 6).

INVARIANTS: D2, D3, D10, D17, D19. Parameterized SQL. No secrets in logs.

OUT OF SCOPE: real token verify implementation details beyond stubs, mirror push,
UI, electron, BPT.

STEP 3 - VALIDATE:
  npx vitest run tests/server/epic_routes.test.ts
  (plus epic_db / related new tests)
  npx tsc --noEmit
  npm run ci:changed
  Dispatch migration-safety + privacy-security-review (server + DDL).

STEP 4 - DOCS: progress.md Phase 3; state.md modules/env keys created.

STEP 5 - FINAL RESPONSE: handoff for Phase 4 (desktop shell) or Phase 5 if shell
is deferred; default order is Phase 4 next.

STOPPING RULES:
  - Stop if default tests require EPIC_ENABLED=1 or secrets.
  - Stop if any code path mints auth tokens from Epic.
```
