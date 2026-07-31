# server/epic

Env-gated Epic Games Store integration: link-not-login account association plus
(eventually) the deed-to-Epic achievement mirror. The registry entry point is
`index.ts`, and it exports `routes` ONLY; everything else imports the concrete
module (`./config` for the flag, `./mirror` for the observer), because the
barrel drags `routes.ts` into the importer's graph and breaks tests that
partial-mock the db module.

## Why this exists where it does
Epic is a MIRROR, never an authority. The sim decides deed unlocks,
`server/deeds_records.ts` records them into `character_deeds`, and this
subsystem will copy a linked account's unlocks outward (Phase 6). Nothing here
can grant, deny, or reorder a deed, and the 50 ms world loop never awaits any
of it.

## Layout
- `routes.ts` - three registry-only `RouteDef`s (no legacy-ladder twin, by
  design): `POST /api/epic/link` (verify + insert/displace + reconcile),
  `DELETE /api/epic/link` (idempotent), `GET /api/epic/status`. The feature
  gate runs FIRST on every route (before auth); link attempts take
  `EPIC_LINK_POLICY` (`ip+account`, 5 per minute).
- `ticket.ts` - pure (IO-free) helpers: the proof shape clamp, the Auth Web API
  `exchange_code` token request builder, the success/error verdict parse (the
  same pure-versus-fetch split `server/steam/ticket.ts` keeps).
- `web_api.ts` - the fetch shell: the ONE place server code talks to the Epic
  Auth Web API for link verify (official host, 5 s timeout, 'upstream' on any
  network or server fault). Never logs URL/body (client secret rides in the
  form body).
- `epic_db.ts` - the `epic_links` SQL boundary (DDL in `db.ts` SCHEMA):
  `account_id` PK, `epic_account_id` UNIQUE, plain INSERT (replacing a link is
  an explicit unlink-then-link, never an upsert). Reclaim-by-proof uses
  `displaceEpicLink` in one transaction.
- `config.ts` - the env gate, read LIVE per call (never a boot-time snapshot).
- `mirror.ts` - Phase 3/5 inert stubs (`onDeedRecorded`, `reconcileOnLogin`,
  `onLinkChanged`, `reconcileLink`); Phase 6 fills the real push worker. Do not
  wire `deeds_records` until then.
- Phase 6 will add `achievement_map.ts`.

## Trust chain (link proof)
1. Desktop shell mints a non-empty **string** proof for `POST /api/epic/link
   { proof }` (preferred: Epic Games Launcher exchange code from argv
   `AUTH_TYPE=exchangecode` + `AUTH_PASSWORD`; optional EOS adapter may mint
   an id-token style string later).
2. Server shape-clamps the proof (charset + length), never trusts a
   client-supplied Epic account id.
3. Server POSTs `grant_type=exchange_code` to
   `https://api.epicgames.dev/epic/oauth/v2/token` with `exchange_code`,
   `deployment_id`, `client_id`, and `client_secret` (confidential client).
4. Epic responds with `account_id`; that becomes `epic_links.epic_account_id`.
5. If that Epic id is already linked to another WoCC account, **reclaim by
   proof**: displace the old row (`displaceEpicLink`). Fresh verified control
   wins over a stale (possibly stolen) link.
6. A `epic_links` row is a cosmetic-mirror pointer only. It is never used to
   mint `auth_tokens` or any session.

## Rules
- **Linking is allowed; LOGIN WITH EPIC DOES NOT EXIST.** Nothing here calls
  `newToken` or touches `auth_tokens`; a `epic_links` row is a cosmetic-mirror
  pointer, never an identity or credential source.
  `tests/server/epic_routes.test.ts` source-scans the directory for this.
- The client is never trusted to name its own Epic id: the server verifies
  the posted proof upstream with the client secret and takes the id from the
  verified token response (`account_id`).
- Secrets: the client secret rides only inside request builders; never log a
  URL, a request body, or an upstream response body.
- Every future push is fire-and-forget: an Epic outage must never fault or slow
  the deeds recorder or the game loop.

## Config
`EPIC_ENABLED=1` turns the surface on; default off, every route answers
`epic.disabled` and the mirror is inert. `EPIC_PRODUCT_ID`,
`EPIC_DEPLOYMENT_ID`, `EPIC_CLIENT_ID`, and `EPIC_CLIENT_SECRET` are required
when enabled for link verification; `EPIC_SANDBOX_ID` is optional. Enabled
without them, the link route answers `epic.upstream`.
