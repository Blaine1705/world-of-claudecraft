# State: Epic Games Store integration (cross-phase cheat sheet)

Current phase: Phase 8 complete (Ops docs + BPT runbook). Next: whole-packet
QA via `docs/epic-games-integration/qa-checklist.md`, then open a PR when
authorized. Live Epic portal credentials and BPT upload are not required for
the code PR while the feature stays dark (`EPIC_ENABLED` default off).

Read this first in every session. Locked decisions below override memory and
ad-hoc invention. Research background: `research-brief.md`.

## Locked decisions

- **D1 Steam-shaped channel.** Epic is a third `wocDesktop.distribution` value
  (`website` | `steam` | `epic`). Same Electron codebase. No second game client.
- **D2 No login with Epic.** Identity stays email + Discord only. An `epic_links`
  row is a cosmetic mirror pointer for achievements (and optional future ownership
  checks), never an identity or session source. Source-scan tests must pin this
  the way `tests/server/steam_routes.test.ts` pins Steam.
- **D3 Merge-safe dark default.** `EPIC_ENABLED` is off unless exactly `1`. With
  the flag off: every `/api/epic/*` route answers `epic.disabled`, the mirror is
  inert, `/api/status` advertises `epic: { enabled: false }`, and no client
  renders Epic link UI. Missing product id, deployment id, or client credentials
  never break server boot, website builds, steam builds, or the default test/CI
  gate. This is the Steam `STEAM_ENABLED` pattern.
- **D4 Updater off on epic.** `updaterAllowed` is true only for packaged
  `website`. Epic builds force publish null and never self-update (Epic BPT owns
  patches), same hard rule as Steam.
- **D5 Wallet closed on epic.** `walletConnectionSupported` stays website-only
  until a later product decision. Epic follows Steam here.
- **D6 Platforms for EGS v1.** Windows + macOS only. Linux stays website + Steam.
  Do not add a Linux epic depot, target, or store claim in this packet.
- **D7 Packaging shape.** Epic channel builds use electron-builder `dir` targets
  into `release-epic/` (mac universal `.app`, win x64 unpacked). Never upload
  NSIS/DMG/AppImage as the Epic store binary. Website installers stay website-only.
- **D8 Native EOS isolation.** EOS C SDK (or its thin adapter) ships only on the
  epic channel package (`files` + `asarUnpack`), never on website or steam
  artifacts. Unpackaged dev uses `WOC_EPIC_DEV=1` (and optional id env overrides)
  the way `WOC_STEAM_DEV=1` works. Packaged builds ignore runtime env for channel.
- **D9 Thin shell surface.** `electron/epic.cjs` is the ONLY desktop Epic surface:
  capability probe + mint link proof + settle/cancel cleanup. Injectable loader
  for tests. Never throws across IPC (null on every failure path).
- **D10 Server module layout.** `server/epic/` mirrors `server/steam/`:
  `config.ts`, `ticket.ts` (pure), `web_api.ts` (fetch shell), `epic_db.ts`,
  `routes.ts`, `mirror.ts`, `achievement_map.ts`, `index.ts` (routes only for
  registry). Everything else imports concrete modules, not the barrel.
- **D11 Token trust chain.** Server verifies the posted proof upstream and
  extracts the Epic account id. Client-supplied Epic ids are never trusted.
  VAC-style ban refusal mirrors Steam when the upstream reports a blocked account.
- **D12 Reclaim by proof.** If a fresh verified proof shows an Epic account currently
  linked to another WoCC account, displace the old row (Steam
  `displaceSteamLink` pattern). True owner of the Epic login wins in steady state.
- **D13 Achievement mirror is observer-only.** Sim decides deed unlocks. Server
  records them. Epic mirror copies outward fire-and-forget. Never grant, deny, or
  reorder a deed. World loop never awaits mirror IO.
- **D14 Achievement IDs permanent.** Mapped EOS/EGS achievement names may be
  added, never renamed or reused once shipped (Steam ACH rule).
- **D15 Env keys (server runtime).**
  - `EPIC_ENABLED` (exactly `1` to light the surface)
  - `EPIC_PRODUCT_ID`
  - `EPIC_SANDBOX_ID` (if required by the chosen verify path)
  - `EPIC_DEPLOYMENT_ID`
  - `EPIC_CLIENT_ID`
  - `EPIC_CLIENT_SECRET` (server only, never logged)
  Names may gain a `WOC_` prefix only if an existing collision forces it; prefer
  the short forms above for parity with `STEAM_*`. Finals documented in
  `DEPLOY.md` (Phase 8). BPT upload uses a separate `EPIC_BPT_*` family
  (`docs/epic-games-integration/bpt-upload.md`); never put BPT secrets on the
  game server or in the desktop stamp.
- **D16 Env keys (desktop build / dev).**
  - Build stamp for epic channel (required non-empty; refuse otherwise, like
    `WOC_STEAM_APP_ID` for steam):
    - `WOC_EPIC_PRODUCT_ID` -> `wocDesktop.epicProductId`
    - `WOC_EPIC_DEPLOYMENT_ID` -> `wocDesktop.epicDeploymentId`
    - `WOC_EPIC_CLIENT_ID` -> `wocDesktop.epicClientId`
  - Unpackaged only: `WOC_DISTRIBUTION=epic`, `WOC_EPIC_DEV=1`, optional id
    overrides
  Website and steam builds never require any Epic env. Server secrets (client
  secret) never land in the client stamp.
- **D17 Routes (registry-only, no legacy ladder twin).**
  - `POST /api/epic/link` (body proof)
  - `DELETE /api/epic/link`
  - `GET /api/epic/status`
  Feature gate FIRST (before auth). Link mutations use an `ip+account` rate
  policy twin of `STEAM_LINK_POLICY`.
- **D18 Status advert.** `/api/status` gains `epic: { enabled: boolean }` beside
  `steam`. RouteDef status path reads live `epicEnabled()`. Legacy arm hardcodes
  `enabled: false` if that is the Steam pattern still in force (keep parity with
  how steam is advertised on each arm).
- **D19 DDL.** Additive `epic_links` table in `server/db.ts` SCHEMA
  (`account_id` PK, `epic_account_id` TEXT UNIQUE, timestamps as Steam). Applied
  every boot under existing advisory lock. Empty table when feature is dark is fine.
- **D20 EOS adapter strategy.** Prefer a thin main-process adapter with injectable
  `requireEos` (or equivalent). Do not add a heavy framework. A third-party npm
  EOS package is allowed only if it is maintained, license-clean, and still
  channel-isolated; default plan is FFI/N-API over the official C SDK. If the SDK
  cannot be vendored yet, the shell still lands with fakes and degrades to null
  without the native lib (merge-safe).
- **D21 Dual mirror fan-out.** Deed recording and login reconcile call Steam and
  Epic observers independently. Either may be dark. One outage must not block the
  other. Prefer two direct imports (not a shared mega-bus) unless a third store
  appears.
- **D22 i18n.** Every new player-visible string is a catalog `t()` key (English
  only from contributors). No `?? 'English'` fallbacks. S3 guard
  (`tests/localization_fixes.test.ts`) must stay green.
- **D23 Copy rules.** No em dashes, en dashes, or emojis in code, comments, docs,
  commits, or player-facing copy.
- **D24 Zero new runtime deps on the website/steam paths.** Epic-only optional
  packaging deps are fine. Do not force EOS into default `npm ci` consumers that
  never build epic if it can be avoided (optionalDependency or build-time fetch).
- **D25 BPT is ops, not gameplay.** BuildPatchTool upload scripts and portal
  checklists land with packaging/docs phases. They are not required for server
  merge safety.
- **D26 Portal work is parallel.** Epic org, product creation, IARC, store page,
  and credentials proceed in parallel with coding. Phases must not block on them
  except final store submission smoke.

## Non-negotiable constraints

- `src/sim/` stays free of Epic, Steam, Electron, DOM, and network SDK imports.
  Achievements remain deeds in sim; mirrors are server-side observers only.
- Server authority: client never decides link validity or achievement unlocks.
- Secrets never committed; never logged (URLs that embed secrets, response bodies).
- Module-first: no growing `electron/main.cjs` or `src/main.ts` with Epic logic
  banks. Thin wiring only.
- New REST endpoints are RouteDefs in the registry, never inline in `server/main.ts`.
- Parameterized SQL only.
- Conventional Commits with scope and body; explicit paths when committing.

## Validation matrix (pick rows that match the diff)

| When the diff touches | Run |
|---|---|
| `electron/desktop_config.cjs` or builder scripts | `npx vitest run tests/electron_desktop_config.test.ts tests/electron_builder_config.test.ts` |
| `electron/epic.cjs` / preload / main IPC | `npx vitest run tests/electron_epic.test.ts tests/electron_ipc_channels.test.ts` (names as created) |
| `server/epic/**` | `npx vitest run tests/server/epic_*.test.ts` plus any shared http spine tests touched |
| DDL / `epic_links` | migration-safety review + `tests/server/epic_db.test.ts` |
| UI / i18n | `npx vitest run tests/epic_link.test.ts tests/localization_fixes.test.ts` |
| Any of the above near done | `npx tsc --noEmit`, `npm run ci:changed`, scoped biome write on touched files |
| Phase complete / packet close | matching rows + `npm run gate` |

## Key file paths (existing anchors)

Desktop:

- `electron/desktop_config.cjs`, `electron/steam.cjs`, `electron/main.cjs`, `electron/preload.cjs`
- `scripts/electron-build.mjs`, `scripts/electron-builder-config.mjs`
- `docs/desktop-release.md`

Server Steam twin (copy shape, do not edit unless dual-wiring requires it):

- `server/steam/` entire directory
- `server/deeds_records.ts` (observer hook)
- `server/game.ts` (`reconcileOnLogin`)
- `server/leaderboard.ts` (status advert)
- `server/db.ts` (`steam_links` DDL exemplar)
- `server/http/registry.ts`, `server/http/error_codes.ts`

Client:

- `src/ui/steam_link.ts`, `src/runtime.ts` (`DesktopBridge`)
- `tests/steam_link.test.ts`, `tests/electron_steam.test.ts`

## Created by this packet

(Update as phases land.)

- Modules:
  - Phase 1: extended existing `electron/desktop_config.cjs` only
  - Phase 2: extended builder scripts, no new runtime module
  - Phase 3 `server/epic/`: `config.ts`, `routes.ts`, `epic_db.ts`,
    `mirror.ts` (inert stubs), `index.ts` (routes only), `CLAUDE.md`
  - Phase 4: `electron/epic.cjs` (+ `epic.d.cts`); thin wire in
    `electron/main.cjs`, `electron/preload.cjs`, `src/runtime.ts`
    `DesktopBridge`
  - Phase 5: `server/epic/ticket.ts` (pure), `server/epic/web_api.ts`
    (fetch shell); full link arms + reclaim-by-proof in `routes.ts`;
    `mirror.reconcileLink` stub for Phase 6
  - Phase 6: `server/epic/achievement_map.ts` (75-deed launch set, same ACH
    vocabulary as Steam); full `mirror.ts` worker (FIFO, dedupe, retries,
    reconcile-on-link/login, link cache, injectable deps, `stopEpicMirror`);
    `web_api.pushAchievementUnlocks` (O2 server-trusted path); dual fan-out
    from `deeds_records.ts` + `game.ts` login + `main.ts` shutdown
  - Phase 7: `src/ui/epic_link.ts` (advert + shell capability gate; twin of
    `steam_link.ts`); client API helpers on `Api` (`epicAdvert`, `epicStatus`,
    `epicLink`, `unlinkEpic`); markup `#cs-epic-group` in `index.html` and
    `play.html`; thin wire in `src/main.ts` (same refresh lifecycle as Steam)
- Tests:
  - epic pins in `tests/electron_desktop_config.test.ts` and full epic
    packaging pins in `tests/electron_builder_config.test.ts`
  - Phase 3: `tests/server/epic_routes.test.ts` (dark default, source-scan
    no-login, rate policy, DDL pins), `tests/server/epic_db.test.ts`
    (displace transaction)
  - Phase 4: `tests/electron_epic.test.ts` (fakes, no real EOS SDK);
    IPC allowlist + bridge pins in `tests/electron_ipc_channels.test.ts`
  - Phase 5: `tests/server/epic_ticket.test.ts`,
    `tests/server/epic_web_api.test.ts` (mocked fetchImpl, no live Epic),
    extended `tests/server/epic_routes.test.ts` (every link arm + reclaim)
  - Phase 6: `tests/server/epic_mirror.test.ts`,
    `tests/epic_achievement_map.test.ts`, unlock pins in
    `tests/server/epic_web_api.test.ts`; dual fan-out pins in
    `tests/deed_records.test.ts` and `tests/deeds_reconcile.test.ts`
  - Phase 7: `tests/epic_link.test.ts` (advert/auth/capability matrix,
    linked/unlinked, link/unlink error flash, settle signal, double-click
    latch), `tests/epic_link_markup.test.ts` (index/play parity + data-i18n
    keys); `UI_DOM_MODULES` pin for `src/ui/epic_link.ts`
- Client UI + i18n (Phase 7):
  - Catalog module: `src/ui/i18n.catalog/hud_chrome.ts` under `hudChrome.epic.*`
  - Key prefixes: `hudChrome.epic.*` (title, link, unlink, linked, benefits,
    noProof); `apiError.epic.*` already from Phase 3/5
  - M16 non-Latin fills for wordy keys in
    `src/ui/i18n.locales/{zh_CN,zh_TW,ja_JP,ko_KR,ru_RU}.ts` (Steam verb
    vocabulary; Epic brand stays Latin). Other locales stay English pending
    maintainer release fill.
  - Gate order: unauthenticated hide -> `/api/status` `epic.enabled` advert
    -> `GET /api/epic/status` enabled -> shell `epicLinkSupported` (or
    proof-method fallback) for Link button only; Unlink when linked
  - Markup selectors: `#cs-epic-group`, `#btn-epic-link`, `#epic-status`,
    `#btn-epic-unlink`, `#epic-help`, `#epic-label`
  - CSS family: `.cs-epic-group` stacked with wallet/github/steam cards
- Desktop Epic shell (Phase 4):
  - Facade: `epicIntegrationEnabled`, `resolveEpicIds`,
    `parseLauncherExchangeCode`, `createEpicShell` returning
    `{ enabled, productId, deploymentId, clientId, getLinkProof,
    cancelLinkProof }`
  - Injectable `requireEos` (optional; omitted means no native load) and
    `readArgv` for tests. Missing adapter: argv exchange-code fallback,
    then null. Never throws across IPC.
  - IPC channels: `desktop-epic-capability`, `desktop-epic-link-proof`,
    `desktop-epic-link-settled`
  - DesktopBridge methods: `epicLinkSupported`, `epicLinkProof`,
    `epicLinkSettled`
  - Capability true on epic stamp or unpackaged `WOC_EPIC_DEV=1`; false
    on packaged website/steam. Website/steam never call `requireEos`.
  - No EOS native vendored yet; no new runtime deps on website/steam (D24)
- Env keys (build-time, epic channel only; D16):
  - `WOC_EPIC_PRODUCT_ID` -> stamp `wocDesktop.epicProductId`
  - `WOC_EPIC_DEPLOYMENT_ID` -> stamp `wocDesktop.epicDeploymentId`
  - `WOC_EPIC_CLIENT_ID` -> stamp `wocDesktop.epicClientId`
  Server secrets (client secret) are never stamped. Unpackaged
  `WOC_DISTRIBUTION=epic` works for dev; packaged stamp wins (same hatch rule
  as steam). Website and steam builds require none of these.
- Env keys (server runtime; D15 finals):
  - `EPIC_ENABLED` (exactly `1` to light; default off)
  - `EPIC_PRODUCT_ID`
  - `EPIC_SANDBOX_ID` (optional)
  - `EPIC_DEPLOYMENT_ID`
  - `EPIC_CLIENT_ID`
  - `EPIC_CLIENT_SECRET` (server only, never logged)
- Routes (D17, registry-only):
  - `POST /api/epic/link` (body `proof`; gate first; `EPIC_LINK_POLICY`)
  - `DELETE /api/epic/link`
  - `GET /api/epic/status`
- Error codes: `epic.disabled`, `epic.invalid_token`, `epic.banned`,
  `epic.already_linked`, `epic.account_taken`, `epic.upstream`
- DDL: additive `epic_links` (`account_id` PK, `epic_account_id` UNIQUE,
  `created_at`); never identity
- Status advert: `epic: { enabled: epicEnabled() }` on RouteDef path; legacy
  arm hardcodes `enabled: false` (Steam parity)
- Builder (Phase 2):
  - Scripts: `electron:build:epic`, `electron:pack:epic`
  - `publish: null`, `directories.output = 'release-epic'`
  - mac dir universal + win dir x64; **no linux** (D6; linux block deleted)
  - Refuses epic pack/build without all three non-empty ids (whitespace-only
    refused too)
  - `files` / `asarUnpack` kept as arrays for Phase 4 EOS native re-include;
    no real SDK vendored yet
- Docs (Phase 8):
  - `docs/desktop-release.md`: epic channel table row + full Epic section
    (build keys, `release-epic/` layouts, BPT pointer, Win+Mac only)
  - `docs/epic-games-integration/bpt-upload.md`: BPT install, UploadBinary
    shape, Dev vs Live, what not to upload, credential placeholders
  - `docs/epic-games-integration/portal-checklist.md`: product, sandboxes,
    clients, IARC, store assets, achievements from `achievement_map.ts`,
    Dev smoke before store review
  - `DEPLOY.md`: `EPIC_*` server keys + dark default; no login-with-Epic
  - `docker-compose.yml`: pass-through for `EPIC_*` (same pattern as Steam)
  - Optional ops script: `scripts/epic-bpt-upload.mjs` +
    `tests/epic_bpt_upload.test.ts`; package.json `epic:bpt-upload` (not in
    pretest / gate / default CI)
- Maintainer still needs (real org access; not code gates):
  - Epic org + product + Dev/Live sandboxes
  - EOS server client secret + BPT credentials (separate)
  - Windows + Mac artifacts; IARC; store page assets
  - Portal achievement ids matching `server/epic/achievement_map.ts`
  - First real BPT upload + Dev smoke + store submission when ready

## Open items (do not invent answers mid-phase)

- O1 Link proof shape: **CLOSED (Phase 5)**.
  - Body field: `POST /api/epic/link { proof: string }` (never a client-supplied
    Epic account id; D11).
  - Preferred mint (desktop Phase 4): launcher **exchange code** from argv
    (`-AUTH_TYPE=exchangecode` + `-AUTH_PASSWORD=<code>` via
    `parseLauncherExchangeCode` in `electron/epic.cjs`). Optional EOS adapter
    may still return a string or `{ proof, cancel }`; server verifies the
    string as `exchange_code` today.
  - Shape clamp (pure, `server/epic/ticket.ts`): length 8 to 16384, charset
    `A-Za-z0-9._~+/=-` (OAuth-safe, no whitespace).
  - Upstream verify (official Epic Auth Web APIs):
    - `POST https://api.epicgames.dev/epic/oauth/v2/token`
    - form: `grant_type=exchange_code`, `exchange_code=<proof>`,
      `deployment_id`, `client_id`, `client_secret`
    - Success claim: JSON `account_id` (string) -> `epic_links.epic_account_id`
    - 5 s timeout; network / 5xx / malformed / invalid_client -> `epic.upstream`;
      invalid_grant-class -> `epic.invalid_token`; access_denied-class ->
      `epic.banned`
  - Literals pinned in `tests/server/epic_ticket.test.ts` and
    `tests/server/epic_web_api.test.ts`. No live Epic calls in CI.
- O2 Achievement unlock path: **CLOSED (Phase 6)**. Server-trusted Web API only
  (never client-reported unlocks; never a native EOS SDK process in Node).
  - Auth: `POST https://api.epicgames.dev/auth/v1/oauth/token` with
    `grant_type=client_credentials` (Basic `clientId:clientSecret`). Field:
    `access_token`.
  - Map linked Epic account id to product user id:
    `GET https://api.epicgames.dev/user/v1/accounts?accountId=<epic_account_id>&identityProviderId=epicgames`
    Response field: `ids` map (`epic_account_id` -> product user id).
  - Unlock batch (Stats Achievements service base `https://api.epicgames.dev/stats`):
    `POST https://api.epicgames.dev/stats/v1/{deploymentId}/players/{productUserId}/achievements/unlock`
    Body field: `achievementIds` (string array of permanent portal ids from
    `server/epic/achievement_map.ts`).
  - Literals pinned in `tests/server/epic_web_api.test.ts`. No live Epic calls
    in CI. Unmapped product users / upstream faults return false; mirror drops
    after capped retries; reconcile heals.
- O3 Vendor vs download path for EOS C SDK binaries in CI (Phase 2/4).
- O4 Final portal artifact naming for Mac (universal vs per-arch) once the product exists.
- O5 Whether a public status page or support URL must appear in the EGS store listing
  (ops, not code).
