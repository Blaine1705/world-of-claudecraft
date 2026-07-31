# Phase 5: Server link verification

Complete the Steam-equivalent link flow: pure token helpers, fetch shell, full
route arms, reclaim-by-proof. Still dark by default without `EPIC_ENABLED=1`.

## Deliverables

1. `server/epic/ticket.ts` (pure, IO-free):
   - Proof shape clamp (charset + length bounds)
   - Request builders for the chosen Epic verify API (OIDC userinfo / token
     introspection / Auth Web API: confirm against current official docs; pin
     hosts and path literals in tests)
   - Verdict parse: ok + epicAccountId | invalid | banned | malformed
2. `server/epic/web_api.ts`:
   - One place that fetches upstream
   - Timeout (Steam uses 5s: match order of magnitude)
   - Map network faults to `upstream`
   - Never log URL/body that may contain secrets
3. Finish `routes.ts` link handler arms (replace stubs):
   - shape fail -> invalid
   - enabled but missing credentials -> upstream
   - already linked -> 409
   - verify outcomes
   - reclaim-by-proof displace (D12)
   - reconcileLink call (may be no-op until Phase 6)
4. Rate limit policy fully enforced on POST
5. Tests covering every arm with mocked web_api and epic_db
6. Update `server/epic/CLAUDE.md` with trust chain notes (Steam ticket.ts tone)

## Out of scope

Achievement push implementation (Phase 6), UI, electron changes unless a proof
field name must align.

## Acceptance

- Decisive tests for disabled / invalid / upstream / success / conflicts / reclaim
- No EPIC env required for green default suite
- privacy-security review clean on token handling

## Starter prompt

```
This is Phase 5 of the Epic Games Store integration packet: Server link verification.
Worktree: /home/fernandoramirez/Documents/woc-epic-games-integration
Branch: feature/epic-games-integration.

Goal: implement pure Epic proof verification helpers and full /api/epic/link arms
mirroring server/steam, env-gated and tested without live Epic calls.

STEP 0 - PRE-FLIGHT: git status clean. Phase 3 required. Phase 4 recommended for
proof field alignment.
Read state.md D2, D3, D11, D12, D15, D17.

STEP 1 - LOAD CONTEXT:
  server/steam/ticket.ts
  server/steam/web_api.ts
  server/steam/routes.ts
  server/epic/* (from Phase 3)
  tests/server/steam_routes.test.ts
  tests/server/steam_web_api.test.ts
  Official Epic Auth Web API / OIDC userinfo docs (fetch current; pin literals)

STEP 2 - EXECUTE Deliverables. Keep pure vs fetch split. Client never supplies
epic account id as authority. Reclaim-by-proof on displace.
Record the final proof field name and upstream endpoints in state.md (close O1).

INVARIANTS: D2, D3, D11, D12. Secrets never logged.

OUT OF SCOPE: achievement mirror push bodies, UI, BPT.

STEP 3 - VALIDATE:
  npx vitest run tests/server/epic_routes.test.ts tests/server/epic_web_api.test.ts
  (and any new pure ticket tests)
  npx tsc --noEmit
  npm run ci:changed
  privacy-security-review on server/epic token paths.

STEP 4 - DOCS: progress.md Phase 5; state.md O1 resolution.

STEP 5 - FINAL RESPONSE: handoff for Phase 6 (achievement mirror).

STOPPING RULES:
  - Stop if verify design would require trusting client-provided account ids.
  - Stop if login-with-Epic appears.
```
