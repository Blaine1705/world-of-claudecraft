# Research brief: Epic Games Store desktop integration

Research date: 2026-07-31.
Branch: `feature/epic-games-integration` off `release/v0.33.0`.
Worktree: `/home/fernandoramirez/Documents/woc-epic-games-integration`.

This document captures the research that feeds the phase packet. It is not an
implementation plan. Architecture decisions and phase slices live in
`implementation-plan.md` and `state.md`.

## Goal

Ship World of ClaudeCraft on the Epic Games Store for desktop clients, matching
the quality and safety bar of the existing Steam channel, without requiring Epic
org credentials for the main branch to stay green after merge.

## What Steam already does (the template)

Steam is already a third host for the same Electron shell, not a second game.

| Layer | Behavior |
|---|---|
| Channel stamp | `wocDesktop.distribution` is `website` or `steam` (`electron/desktop_config.cjs`) |
| Build | `npm run electron:build:steam` writes loose `dir` layouts to `release-steam/` |
| Updater | Off for steam (SteamPipe owns patches). On only for packaged website |
| Native SDK | `steamworks.js` optionalDependency, shipped only on the steam channel |
| Shell surface | `electron/steam.cjs` mints a link ticket only. No Steam login |
| Server | `server/steam/`: env-gated link routes + Book of Deeds achievement mirror |
| Identity | Email + Discord only. A `steam_links` row is a cosmetic mirror pointer |
| Merge safety | `STEAM_ENABLED` default off. Missing app id / key never breaks boot or CI |

Canonical anchors:

- `docs/desktop-release.md`, `docs/desktop-ship-notes.md`, `ELECTRON-DESKTOP-AUDIT.md`
- `electron/steam.cjs`, `electron/desktop_config.cjs`
- `scripts/electron-build.mjs`, `scripts/electron-builder-config.mjs`
- `server/steam/` (especially `CLAUDE.md`, `config.ts`, `routes.ts`, `ticket.ts`, `mirror.ts`)
- Tests: `tests/electron_steam.test.ts`, `tests/electron_desktop_config.test.ts`,
  `tests/server/steam_routes.test.ts`, `tests/server/steam_mirror.test.ts`

## Epic Games Store findings

### Publishing model

- Self-publishing is open via the Epic Developer Portal (not invite-only).
- Submission fee is about USD 100 per product (not refundable the Steam way).
- Free IARC age rating is available through the portal.
- Revenue share is 88/12 (developer keeps 88%).
- Binaries upload with **BuildPatchTool (BPT)**, Epic's SteamPipe analog.
  Upload a loose install tree, never an NSIS/DMG installer as the store binary.
- Review expects install/launch quality, content guidelines compliance, IARC,
  multiplayer PC crossplay when multiplayer exists, and achievement parity when
  achievements exist on other PC storefronts.
- There is no formal Early Access program. Treat store launch as a real launch.

Sources consulted: Epic Developer docs (publishing workflow, BPT instructions,
Ecom overview, Auth interface, Auth Web APIs), Epic self-publishing
announcements, developer postmortems (Steam + Epic 2025), Game World Observer
summary of self-publish requirements.

### Platform matrix

| OS | Epic reality | WoCC recommendation |
|---|---|---|
| Windows | First-class EGS + EOS | Ship |
| macOS | Supported store binary + launcher | Ship |
| Linux | No first-class native Epic Launcher path for most titles | **Do not** promise EGS Linux in v1. Keep Linux on website + Steam |

Linux players already have website AppImage/deb and Steam. Blocking Epic work on
Linux EGS parity is a false dependency.

### Epic Online Services (EOS)

Relevant surfaces for this product:

| EOS surface | Why it matters for WoCC |
|---|---|
| Auth | Proves the player controls an Epic account (launcher exchange code / ID token) for link |
| Achievements | Store parity with Steam Book of Deeds mirror |
| Ecom ownership | Optional later if store-only SKUs or DLC appear |
| Connect / social | Out of scope for v1 |

Auth trust chain (parallel to Steam tickets):

1. Desktop shell obtains a short-lived proof from EOS (prefer launcher Exchange Code when Epic launches the app).
2. Client posts the proof to the game server while already logged in (email/Discord session).
3. Server verifies upstream with trusted credentials and extracts the Epic account id.
4. Client is never trusted to name its own Epic account id.
5. A row in `epic_links` is a cosmetic mirror pointer, never a session source.

Official SDKs are C and C#. Unreal/Unity plugins exist. There is **no** mature
`steamworks.js`-class Node package. Electron integration means a thin main-process
adapter over the EOS C SDK (FFI such as koffi, or a small N-API wrapper), loaded
only on the epic channel.

### Multiplayer and achievements policy

- Multiplayer titles must support crossplay across PC stores. WoCC already does:
  one authoritative server for website, Steam, and desktop.
- If achievements exist on other platforms, Epic expects them on EGS too.
  Book of Deeds + Steam achievement mirror implies Epic achievements are required
  for a clean store review once Steam achievements are live.

### What is NOT required for a green main merge

Epic org setup (product id, client secret, deployment id, BPT credentials) is
**operator configuration**, not a compile-time dependency of the website channel,
the server boot path, or the Vitest suite. The same rule Steam already uses:

- Surface dark unless `EPIC_ENABLED=1`
- Missing product/deployment/client credentials degrade gracefully
- Website and steam builds never load EOS native code
- Default CI and `npm run gate` never require Epic secrets

## Alternative approaches considered

| Approach | Verdict |
|---|---|
| A. Pure distribution only (no EOS, no link, no achievements) | Insufficient for final review if Steam achievements are live. Fine as an intermediate packaging milestone |
| B. Full EOS online subsystem (friends, overlay, matchmaking) | Overkill. WoCC already has its own online stack |
| C. Login with Epic as an identity provider | Rejected. Identity stays email + Discord (matches Steam decision) |
| D. **Steam-shaped channel + link + achievement mirror** | **Chosen.** Reuses proven seams, merge-safe gating, and review-relevant parity |

## Recommended architecture (summary)

Add a third distribution value `epic` beside `website` and `steam`.

1. **Packaging:** `electron:build:epic` produces `dir` trees in `release-epic/`, stamps
   `distribution: 'epic'`, forces updater off, ships EOS libs only on that channel.
2. **Shell:** `electron/epic.cjs` is the only Epic surface (capability + link proof mint).
   Injectable loader for tests. Never throws across IPC.
3. **Server:** `server/epic/` mirrors `server/steam/`: env gate, pure token helpers,
   fetch shell, SQL boundary, routes, mirror worker. Registry-only routes.
4. **UI:** capability-gated Epic link card, server advert first, shell capability second.
5. **Ops:** BPT upload runbook, DEPLOY.md env keys, portal checklist for the maintainer.

## External dependencies and secrets (when enabled)

| Item | Where it lives | Required for |
|---|---|---|
| Epic org + product in Developer Portal | Maintainer | Publishing |
| Product Id, Sandbox Id, Deployment Id, Client Id | Build stamp / server env | EOS init + server verify |
| Client secret / trusted server credentials | Server env only | Token verify + achievement push |
| BuildPatchTool + upload credentials | CI / maintainer machine | Binary upload |
| IARC rating + store page assets | Portal | Review |
| EOS C SDK binaries | Epic channel package only | Runtime link + achievements |

Never commit secrets. Never log token URLs or response bodies that carry secrets.

## Open items that do not block coding

These need the Epic org eventually, but phases 1 to 7 can land dark:

- Exact product / deployment / client ids
- Final achievement icon assets and XP values in the portal
- BPT sandbox smoke install from the Epic Launcher
- Whether Mac universal vs arch-split artifacts are preferred in the portal UI
- Confirmation Linux artifact is unavailable (expected)

## Risk register

| Risk | Mitigation |
|---|---|
| No mature Node EOS binding | Own a thin adapter; pure facades stay Node-testable with injected fakes |
| Native lib packaging on Electron | Mirror steamworks asarUnpack pattern; epic channel only |
| Two updaters fighting | Hard-deny electron-updater when distribution is epic |
| Identity creep | Source-scan tests forbid login minting under `server/epic/` |
| Linux expectation drift | Explicit non-goal in state.md and README |
| Merge without portal | Default `EPIC_ENABLED` off; builds and tests need no Epic secrets |
| Achievement ID permanence | Same Steam rule: shipped ACH names never renamed or reused |

## Sources (non-exhaustive)

- Epic Developer docs: publishing workflow, BuildPatchTool instructions, Auth interface,
  Auth Web APIs, Ecom overview, Achievements setup
- Epic self-publishing announcement and requirement summaries (crossplay, achievements, IARC)
- Existing WoCC Steam implementation and `docs/desktop-release.md`
- Developer postmortems comparing Steam and Epic publishing in 2025
