# Phase 4: Desktop Epic shell

Add `electron/epic.cjs` as the Steam twin for capability + link-proof minting.
CI must not need a real EOS SDK: injectable loader and null degradation.

## Deliverables

1. `electron/epic.cjs` (CJS, Node-testable, no electron imports in pure helpers):
   - `epicIntegrationEnabled({ distribution, env, isPackaged })`
   - `resolveEpicIds({ packagedMetadata, env, isPackaged })`
   - `createEpicShell({ ... injectables })` returning
     `{ enabled, getLinkProof, cancelLinkProof }` (names may match final API;
     pin in tests)
   - Lazy load EOS only when enabled; catch init failures; never throw from
     getLinkProof
2. Wire in `electron/main.cjs` (thin): IPC handlers
   - `desktop-epic-capability`
   - `desktop-epic-link-proof` (or equivalent)
   - `desktop-epic-link-settled`
3. `electron/preload.cjs` + `src/runtime.ts` `DesktopBridge` optional methods
4. Packaging: if EOS libs exist later they unpack on epic channel only; for now
   document that missing native module returns null. Optional: add optionalDependency
   or a stub module path. Prefer not hard-failing `npm ci` for non-epic developers (D24).
5. Tests: `tests/electron_epic.test.ts` with fake loader; IPC channel allowlist
   updates if the repo pins channel names

## Proof shape (provisional)

Prefer whatever Epic documents for "game launched from Epic Games Launcher"
(Exchange Code -> auth token / ID token). Exact field names are O1: confirm
against current docs while implementing, and keep pure parsing on the server in
Phase 5. The shell's job is to mint bytes/string proof for POST /api/epic/link.

## Out of scope

Server verify completion, UI button, achievement unlocks, BPT.

## Acceptance

- Website distribution: capability false, no EOS load
- Epic distribution or WOC_EPIC_DEV=1: enabled true even if getLinkProof returns null
  without native lib
- Tests green without EOS SDK installed

## Starter prompt

```
This is Phase 4 of the Epic Games Store integration packet: Desktop Epic shell.
Worktree: /home/fernandoramirez/Documents/woc-epic-games-integration
Branch: feature/epic-games-integration.

Goal: land electron/epic.cjs + IPC/preload/bridge types mirroring electron/steam.cjs,
injectable and merge-safe without a real EOS SDK in CI.

STEP 0 - PRE-FLIGHT: git status clean. Phase 1 required. Phase 2 recommended.
Read state.md D8, D9, D16, D20, D24.

STEP 1 - LOAD CONTEXT:
  electron/steam.cjs
  electron/main.cjs (steam IPC block)
  electron/preload.cjs
  src/runtime.ts DesktopBridge
  tests/electron_steam.test.ts
  tests/electron_ipc_channels.test.ts
  docs/epic-games-integration/phase-04-desktop-epic-shell.md
  Current Epic Auth docs for launcher exchange code (fetch official pages; do not invent)

STEP 2 - EXECUTE Deliverables. Keep main.cjs thin. Pure decisions in epic.cjs.
If EOS native binding is not ready, implement the facade + fake loader path fully
and degrade getLinkProof to null when require fails.

INVARIANTS: D3, D8, D9, D20, D23. Never throw across IPC.

OUT OF SCOPE: server verify, UI, mirror, BPT, login-with-Epic.

STEP 3 - VALIDATE:
  npx vitest run tests/electron_epic.test.ts tests/electron_steam.test.ts tests/electron_ipc_channels.test.ts
  npx tsc --noEmit
  npm run ci:changed

STEP 4 - DOCS: progress.md Phase 4; state.md O1 notes if proof shape was confirmed.

STEP 5 - FINAL RESPONSE: handoff for Phase 5 (server link verification).

STOPPING RULES:
  - Stop if CI would require downloading proprietary EOS SDK without a documented optional path.
  - Stop if website builds start loading Epic native code.
```
