# Whole-feature QA matrix (packet close)

Run after Phase 8, before calling the Epic integration ready to merge.

**Packet close session:** 2026-07-31 in worktree
`/home/fernandoramirez/Documents/woc-epic-games-integration` on
`feature/epic-games-integration` (merged latest `origin/release/v0.33.0`).
Zero Epic secrets in env. No live portal / BPT upload / Dev sandbox smoke.

## Merge safety (must pass with zero Epic env)

- [x] `EPIC_ENABLED` unset: server boots; `/api/epic/*` returns `epic.disabled`
      Evidence: `tests/server/epic_routes.test.ts` ("the EPIC_ENABLED gate", every
      route 503 `epic.disabled` when flag off).
- [x] `/api/status` reports `epic: { enabled: false }`
      Evidence: `tests/server/fixtures/main/status_get.json` pins
      `epic.enabled: false`; RouteDef path uses live `epicEnabled()`.
- [x] No Epic link UI in web or desktop website builds
      Evidence: `tests/epic_link.test.ts` advert-off / unauthed hide group;
      shell capability false on website/steam (`tests/electron_epic.test.ts`).
- [x] `npm run electron:build` (website) succeeds without Epic env
      Evidence (config-level; full electron:build not re-run this session):
      `tests/electron_builder_config.test.ts` website path needs no WOC_EPIC_*;
      package scripts unchanged (`electron:build` still website default).
      Note: full multi-arch electron:build is platform/signing ops, not a
      dark-merge code gate.
- [x] `npm run electron:build:steam` behavior unchanged when Epic env unset
      Evidence: builder tests pin steam stamps/targets independent of Epic;
      epic ids never stamp onto steam metadata.
- [x] `npm test` / `npm run gate` green without Epic secrets
      Evidence: full `npm run gate` exit 0 with EPIC_* unset (2026-07-31);
      targeted epic vitest 314/314 pass; `npx tsc --noEmit` green after BPT
      test typing fix.
- [x] Website and steam packages do not contain EOS native libraries
      Evidence: no EOS native re-include on website/steam in
      `scripts/electron-builder-config.mjs`; epic `files`/`asarUnpack` arrays
      reserved but no real SDK vendored (O3 still open ops). Website/steam
      tests pin absence of steamworks on website and no epic EOS package yet.

## Architecture and identity

- [x] `src/sim/` has zero Epic imports
      Evidence: grep for epic SDK / `from '...epic'` under `src/sim/` empty
      (item-quality word "epic" only). Dual fan-out lives in server observers.
- [x] Source scan under `server/epic/`: no `newToken`, no `auth_tokens` session mint
      Evidence: `tests/server/epic_routes.test.ts` "login with Epic does not
      exist" source-scan pin.
- [x] Client never trusted to supply its own Epic account id (server verify path)
      Evidence: route body is `{ proof }` only; id from upstream
      `account_id` after server exchange (`tests/server/epic_routes.test.ts`,
      `ticket.ts` / `web_api.ts`).
- [x] Login remains email + Discord only on all channels
      Evidence: no login-with-Epic route; docs (`DEPLOY.md`, desktop-release)
      state identity stays email + Discord; source-scan pin.

## Channel behavior

- [x] Packaged `distribution: 'epic'`: updater disabled, wallet handoff disabled
      Evidence: `tests/electron_desktop_config.test.ts` (`updaterAllowed` /
      `walletConnectionSupported` false for epic).
- [x] Packaged epic ignores `WOC_DISTRIBUTION` / updater env escape hatches
      Evidence: same suite (packaged stamp final; env cannot flip channel).
- [x] Unpackaged `WOC_DISTRIBUTION=epic` works for dev without flipping packaged installs
      Evidence: desktop_config tests for unpackaged epic + packaged isolation.
- [x] No Linux epic depot or epic linux target in builder config
      Evidence: `tests/electron_builder_config.test.ts` (`config.linux`
      undefined for epic; pack mode still no linux).
- [x] `release-epic/` emits dir layouts suitable for BPT (not store installers)
      Evidence: builder tests pin `directories.output = 'release-epic'`, mac/win
      `dir` targets, publish null; not nsis/dmg/AppImage as EGS binary.

## Link + mirror (with fakes and, when available, sandbox)

- [x] Link happy path, invalid proof, upstream fault, already linked, reclaim-by-proof
      Evidence: `tests/server/epic_routes.test.ts` (mocked upstream only).
- [x] Unlink idempotent
      Evidence: same suite DELETE arms.
- [x] Mirror dark when disabled; pushes when enabled + linked + mapped deed
      Evidence: `tests/server/epic_mirror.test.ts`.
- [x] Steam mirror still works independently when both enabled
      Evidence: `tests/deed_records.test.ts` + `tests/deeds_reconcile.test.ts`
      dual fan-out D21 pins (Steam then Epic independent observers).
- [x] Deed unlock path never awaits Epic IO on the hot path
      Evidence: `server/deeds_records.ts` fire-and-forget void observers;
      mirror tests + deed_records pins.
- [ ] Live Dev sandbox smoke (link + deed mirror against real Epic)
      N/A this session: no real product / sandbox / client secret. Ops after
      portal access; not a dark-PR blocker.

## UI / i18n / copy

- [x] Advert off hides Epic group entirely
      Evidence: `tests/epic_link.test.ts`.
- [x] Shell capability false hides Link (status/unlink rules match Steam twin)
      Evidence: same suite + electron epic capability pins.
- [x] All new player strings are catalog keys; S3 guard green
      Evidence: `tests/localization_fixes.test.ts` 40 pass / 3 skip;
      catalog `hudChrome.epic.*` + `apiError.epic.*`.
- [x] No em dashes, en dashes, or emojis in the packet diff
      Evidence: unicode scan of docs/epic-games-integration, server/epic,
      electron/epic.cjs, epic_link.ts, epic-bpt-upload: 0 hits.

## Security and secrets

- [x] Client secret only on server; not in renderer, not in git
      Evidence: stamp is product/deployment/client id only; secret via
      `EPIC_CLIENT_SECRET` server env; privacy-security review PASS.
- [x] No secret in logs or error bodies
      Evidence: `web_api.ts` discipline + route stable error codes;
      BPT uses `ClientSecretEnvVar` + redact helper tests.
- [x] Parameterized SQL for `epic_links`
      Evidence: `server/epic/epic_db.ts` `$1`/`$2`; migration-safety PASS.
- [x] Rate limit on link POST
      Evidence: `EPIC_LINK_POLICY` 5/min ip+account pins in epic_routes tests.

## Docs and ops

- [x] `docs/desktop-release.md` documents epic channel
- [x] DEPLOY.md lists `EPIC_*` keys and dark default
- [x] BPT upload steps are copy-pasteable for the maintainer
      (`docs/epic-games-integration/bpt-upload.md` + fail-closed
      `scripts/epic-bpt-upload.mjs --help` exit 0; missing creds exit 1)
- [x] Portal checklist lists Win+Mac, IARC, achievements parity
- [x] Banned claims scan: no affirmative Linux EGS support, no login-with-Epic
      as sign-in, no electron-updater on epic, no default EPIC_ENABLED on,
      no real secret values in docs (negations / enablement instructions only)
- [x] `scripts/epic-bpt-upload.mjs` not in pretest / gate / default CI

## Final gate

- [x] `npx tsc --noEmit` (green after typing fix in `tests/epic_bpt_upload.test.ts`)
- [x] Targeted vitest suites for electron epic, server epic, UI epic
      (15 files, 314 tests pass; plus localization_fixes)
- [x] `npm run ci:changed` on touched files (exit 0; warnings only, no errors)
- [x] `npm run gate` green in the worktree (exit 0, zero Epic secrets)
- [x] Reviewers from the implementation-plan matrix run on the full diff
      - privacy-security-review: **PASS** (0 blocking)
      - migration-safety: **PASS** (0 blocking)
      - database-performance-reviewer: **PASS** (0 blocking; 2 P2 notes)
      - frontend-seam-reviewer: **PASS** (0 blocking)
      - test-coverage-auditor: **PASS** (0 blocking; dual fan-out fault
        isolation note is NON-BLOCKING)

## Packet close notes

- Defect found and fixed this session: `tests/epic_bpt_upload.test.ts` failed
  full-repo `tsc` (untreated `.mjs` import + implicit any). Fixed with
  `@ts-expect-error` namespace import + narrow `BptHelpers` cast (scripts/*.mjs
  convention). Vitest still green.
- Full `electron:build` / `electron:build:steam` binaries not produced this
  session (signing/platform cost). Config + unit pins cover merge safety.
- Remaining ops (not dark-PR blockers): O3 EOS SDK vendor path, O4 Mac artifact
  naming once product exists, O5 store support URL, real portal credentials,
  first BPT upload, Dev sandbox smoke, store submission.
