# Phase 2: Epic packaging channel

Produce an epic distribution package path parallel to steam: loose `dir` outputs
under `release-epic/`, updater feed suppressed, Win+Mac only, stamp
`distribution: 'epic'`. Still no requirement that Epic org exists for website
CI; only the epic build entrypoint requires epic build ids (Steam pattern).

## Deliverables

1. `package.json` scripts:
   - `electron:build:epic`
   - `electron:pack:epic`
2. `scripts/electron-build.mjs`: accept `epic` distribution argument
3. `scripts/electron-builder-config.mjs`:
   - `distribution === 'epic'` branch:
     - `publish: null`
     - `directories.output = 'release-epic'`
     - mac target dir universal; win target dir x64
     - **no linux epic target** (D6)
     - stamp `wocDesktop.distribution = 'epic'` plus id fields (product /
       deployment / client as designed; names pinned in tests)
     - refuse build when required ids missing (positive non-empty strings),
       mirroring steam's `WOC_STEAM_APP_ID` refusal
     - reserve `files` / `asarUnpack` hooks for future EOS libs (can be empty
       array additions documented for Phase 4)
4. Tests in `tests/electron_builder_config.test.ts` (and build script tests if any)
   pin epic vs website vs steam differences
5. Short note in `docs/desktop-release.md` that epic channel exists and points at
   this packet for full BPT detail (Phase 8 expands)

## Env (build-time, epic channel only)

Propose and pin names (align with D16), for example:

- `WOC_EPIC_PRODUCT_ID`
- `WOC_EPIC_DEPLOYMENT_ID`
- `WOC_EPIC_CLIENT_ID`

Server secrets stay out of the client stamp.

## Out of scope

Vendoring real EOS binaries, BPT upload automation (Phase 8), server, UI.

## Acceptance

- `node scripts/electron-build.mjs pack epic` fails loudly without ids (unit-level
  config test is enough if full electron pack is too heavy for CI)
- website build path still needs no Epic env
- No linux epic target in derived config

## Starter prompt

```
This is Phase 2 of the Epic Games Store integration packet: Epic packaging channel.
Worktree: /home/fernandoramirez/Documents/woc-epic-games-integration
Branch: feature/epic-games-integration.

Goal: add electron:build:epic / pack:epic producing release-epic dir layouts with
updater off and Win+Mac only, refusing to package without build ids, without
affecting website/steam default paths.

STEP 0 - PRE-FLIGHT: git status clean. Confirm Phase 1 is done (progress.md).
Read state.md D1, D3, D4, D6, D7, D16, D24.

STEP 1 - LOAD CONTEXT:
  scripts/electron-build.mjs
  scripts/electron-builder-config.mjs
  package.json (scripts + build block)
  tests/electron_builder_config.test.ts
  the steam branch inside desktopBuilderConfig as the twin
  docs/desktop-release.md header channel table

STEP 2 - EXECUTE the Deliverables in phase-02-packaging-channel.md.
Keep the epic branch as close as possible to the steam branch structure for reviewability.
Do not add a linux epic target.
Do not vendor EOS yet; only leave clear hooks if needed.

INVARIANTS: D3 (website needs no epic env), D6, D7, D23.

OUT OF SCOPE: server/epic, electron/epic.cjs, UI, real BPT upload, Linux.

STEP 3 - VALIDATE:
  npx vitest run tests/electron_builder_config.test.ts tests/electron_desktop_config.test.ts
  npx tsc --noEmit
  npm run ci:changed
  Optionally smoke `node scripts/electron-build.mjs pack epic` with dummy ids if the
  environment can run electron-builder quickly; otherwise config unit tests must prove
  the refuse-without-ids and output path branches.

STEP 4 - DOCS: progress.md Phase 2 checkboxes; state.md created paths / env names.

STEP 5 - FINAL RESPONSE: handoff for Phase 3 (server dark surface).

STOPPING RULES:
  - Stop if epic packaging would break website builds without Epic env.
  - Stop if you add linux epic targets (D6).
```
