# Phase 1: Desktop channel plumbing

Teach the desktop shell that `epic` is a first-class distribution value, with the
same hard safety rails Steam already has: packaged stamp wins, updater denied,
wallet denied. No EOS, no server, no UI.

## Why this phase first

Every later phase stamps or reads `distribution === 'epic'`. Landing the pure
config + tests first keeps packaging and shell work from inventing parallel flags.

## Deliverables

1. `electron/desktop_config.cjs`
   - Add `epic` to `DISTRIBUTIONS`
   - `updaterAllowed`: false for epic (packaged or not)
   - `walletConnectionSupported`: false for epic
   - Comments updated so they no longer say "website vs Steam" only
2. Tests in `tests/electron_desktop_config.test.ts`
   - resolveDistribution reads epic stamp
   - unpackaged `WOC_DISTRIBUTION=epic` works; packaged env cannot flip epic to website
   - updaterAllowed false for epic
   - walletConnectionSupported false for epic
   - unknown values still collapse to website
3. Touch `scripts/electron-builder-config.mjs` / `electron-build.mjs` only if needed
   so the pure config module does not throw on `distribution: 'epic'` in unit tests.
   Full packaging behavior is Phase 2; if the builder currently hard-rejects non
   website/steam, extend the allow-list with a minimal epic branch that can be
   completed in Phase 2 (or stub with a clear TODO only if tests require it). Prefer
   finishing enough of the allow-list that `desktopBuilderConfig({ distribution: 'epic', ...})`
   does not throw for a basic call used by tests.

## Out of scope

EOS SDK, `server/epic`, IPC, UI, BPT, package.json epic scripts (Phase 2), Linux targets.

## Acceptance

- All new/updated electron desktop config tests green
- `npx tsc --noEmit` green
- No Epic env required
- Website/steam behaviors unchanged

## Starter prompt

```
This is Phase 1 of the Epic Games Store integration packet: Desktop channel plumbing.
Worktree: /home/fernandoramirez/Documents/woc-epic-games-integration
Branch: feature/epic-games-integration (off release/v0.33.0).

Goal: add distribution value "epic" to desktop_config with updater and wallet hard-denied,
merge-safe, fully tested, without EOS or server work.

STEP 0 - PRE-FLIGHT: git status clean in the worktree. Do not switch branches in other
worktrees. Read docs/epic-games-integration/state.md decisions D1, D3, D4, D5, D23.

STEP 1 - LOAD CONTEXT: read
  docs/epic-games-integration/state.md
  docs/epic-games-integration/phase-01-channel-plumbing.md
  electron/desktop_config.cjs
  tests/electron_desktop_config.test.ts
  scripts/electron-builder-config.mjs (distribution guard only)
  scripts/electron-build.mjs (argv distribution allow-list only)

STEP 2 - EXECUTE:
  - Extend DISTRIBUTIONS and comments in electron/desktop_config.cjs for epic.
  - Ensure updaterAllowed and walletConnectionSupported deny epic.
  - Extend tests with decisive assertions (literals, packaged env hatch closed).
  - If builder/build scripts reject unknown distribution names, allow "epic" without
    implementing full packaging (Phase 2 owns release-epic details).

INVARIANTS: D1, D3, D4, D5, D23. No new npm deps. No server changes.

OUT OF SCOPE: EOS, server/epic, IPC, UI, BPT, Linux epic targets, DEPLOY.md.

STEP 3 - VALIDATE:
  npx vitest run tests/electron_desktop_config.test.ts
  npx vitest run tests/electron_builder_config.test.ts
  npx tsc --noEmit
  npm run ci:changed
  Scoped biome write on files you touched if needed.

STEP 4 - DOCS: mark Phase 1 checkboxes in docs/epic-games-integration/progress.md;
set state.md Current phase to Phase 1 complete / next Phase 2.

STEP 5 - FINAL RESPONSE: files touched, command results, handoff line for Phase 2.

STOPPING RULES:
  - Stop if making epic work requires Epic credentials in default tests.
  - Stop if you need to edit src/sim or add login-with-Epic.
```
