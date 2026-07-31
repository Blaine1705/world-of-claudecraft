# Implementation Plan: Epic Games Store integration

Eight implementation phases. Each is a vertical, testable slice that stays
merge-safe when Epic org credentials are missing (D3). Research:
`research-brief.md`. Locked decisions: `state.md`.

## Canonical workflow (every phase)

1. **Pre-flight**: `git status` clean in
   `/home/fernandoramirez/Documents/woc-epic-games-integration` (branch
   `feature/epic-games-integration`). Ask before touching foreign dirty work.
2. **Load context**: read `state.md`, `progress.md`, this phase file, and the
   listed Steam twin files. Prefer Explore-style summary over dumping whole files
   into the main loop when the phase is large.
3. **Execute**: module-first behind existing seams. Mirror Steam shapes. Do not
   invent a second architecture.
4. **Validate + review**: run the matching `state.md` validation rows. Dispatch
   reviewers per the matrix below (matching rows only). No commit while BLOCKING
   findings remain (if the session is authorized to commit).
5. **Docs**: update `progress.md` + `state.md` "Current phase" / "Created by"
   in the same change as the work.

**Code hygiene**: decisive tests; delete replaced dead code; no generated-file
hand-edits; Conventional Commits with scope and body; no em dashes, en dashes,
or emojis; explicit paths when staging.

## Review Dispatch Matrix

| Agent / skill | Spawn ONLY when the diff touches | Skip when |
|---|---|---|
| privacy-security-review | `server/`, secrets/env/CI/deploy/DEPLOY.md, auth, token verify | pure electron config tests with no secret handling |
| migration-safety | `server/db.ts` DDL, `epic_links`, persisted shape | no DDL |
| database-performance-reviewer | SQL call sites, indexes, cadence, growth | no DB work |
| frontend-seam-reviewer | `src/ui/`, styles, HUD markup | server/electron-only |
| cross-platform-sync | `src/world_api*`, wire, `src/net/online.ts` sim parity | expected epic work should not need this |
| architecture-reviewer | `src/sim/` | must not match; stop if it does |
| test-coverage-auditor | new/changed tests or coverage claims | trivial doc-only |
| qa-checklist / `$woc-qa` | phase complete | mid-phase |

If no row matches, still run the phase's listed vitest files + `tsc` +
`ci:changed`.

## Phase summary

### Phase 1: Desktop channel plumbing
Teach the shell and builder config that `epic` exists, with updater and wallet
hard-denied, without packaging EOS yet.
- Extend `DISTRIBUTIONS` and resolvers in `electron/desktop_config.cjs`
- Extend `scripts/electron-builder-config.mjs` / `electron-build.mjs` argument
  validation so `epic` is a known distribution (full packaging rules can land in
  Phase 2; Phase 1 at least must not throw on the name in pure config tests)
- Pin tests in `tests/electron_desktop_config.test.ts` (and builder config tests
  as needed): epic packaged updater false, wallet false, env override unpackaged
  only, unknown still collapses to website
Out of scope: EOS SDK, server routes, UI, BPT. Commits: `feat(electron)` + `test(electron)`.

### Phase 2: Epic packaging channel
Make `npm run electron:build:epic` / `electron:pack:epic` produce `release-epic/`
dir layouts with the correct stamp and no updater feed.
- Scripts and package.json script entries
- Builder: publish null, output `release-epic`, mac/win dir targets (no linux epic
  target per D6), stamp `distribution: 'epic'` plus optional product/deployment
  metadata fields
- Refuse epic package when required build ids are missing (Steam app id pattern),
  without affecting website/steam
- Asar/files hooks prepared for later EOS libs (can be empty placeholders)
- Tests pin channel differences
Out of scope: real EOS binary vendor, server, UI. Commits: `feat(electron)` +
`test(electron)` + optional `docs(desktop)`.

### Phase 3: Server dark surface (`server/epic/` skeleton)
Land the env-gated API surface so main stays green with no Epic credentials.
- `server/epic/config.ts` live reads (`EPIC_ENABLED === '1'`)
- `routes.ts` with gate-first handlers answering `epic.disabled` when dark;
  when enabled but unconfigured, stable `epic.upstream` / invalid arms can be
  stubs until Phase 5 fills verify
- `epic_db.ts` + DDL `epic_links` (additive)
- Error codes, rate limit policy twin, registry registration
- Status advert `epic: { enabled }`
- Tests: disabled by default, source-scan no login mint, DDL pins
- Mirror module can be a no-op stub exported for later wiring
Out of scope: real EOS HTTP verify, achievement push, UI. Commits: `feat(server)` +
`test(server)`.

### Phase 4: Desktop Epic shell (capability + link proof)
`electron/epic.cjs` parallel to `electron/steam.cjs`.
- Integration enabled only for epic distribution (or unpackaged `WOC_EPIC_DEV=1`)
- Resolve product/deployment ids from stamp (packaged) or env (unpackaged)
- Injectable EOS loader; missing native lib degrades to null
- IPC: capability, mint link proof, settle/cancel
- preload + `DesktopBridge` types
- Tests with fakes; never require real EOS for CI
Out of scope: server verify completion (Phase 5 can finish pure helpers if Phase 3
left stubs), UI button wiring. Commits: `feat(electron)` + `test(electron)`.

### Phase 5: Server link verification
Complete the Steam-equivalent link flow.
- Pure `ticket.ts` (shape clamp, request builders, verdict parse) against current
  Epic Auth Web API / OIDC docs (resolve O1 here; pin literals)
- `web_api.ts` fetch shell (timeout, upstream faults, never log secrets)
- Full route arms: already linked, reclaim-by-proof, banned/invalid/upstream
- Rate limit wired
- Tests decisive on every arm
Out of scope: achievement mirror push. Commits: `feat(server)` + `test(server)`.

### Phase 6: Achievement mirror
Observer that copies Book of Deeds unlocks to Epic achievements when linked.
- `achievement_map.ts` (deed id to EOS achievement id), hard cap policy like Steam
- `mirror.ts` FIFO, dedupe, retries, drop, reconcile-on-link, reconcile-on-login
- Wire from `deeds_records.ts` and `game.ts` independently of Steam (D21)
- Enabled only when `EPIC_ENABLED` and credentials present; otherwise inert
- Tests: queue arms, dark-by-default, no world-loop await
Out of scope: portal achievement icon art (ops). Commits: `feat(server)` + `test(server)`.

### Phase 7: Client UI + i18n
Capability-gated Epic link card beside Steam.
- `src/ui/epic_link.ts` (steam_link twin)
- Markup hooks in the character-select / account area (minimal, existing shell)
- Catalog English keys only
- Tests for advert off, shell unsupported, linked/unlinked
Out of scope: redesign of character select. Commits: `feat(ui)` + `test(ui)` +
i18n catalog.

### Phase 8: Ops docs, BPT runbook, deploy notes
Make the channel operable when the org is ready.
- `docs/desktop-release.md` epic channel section
- BPT upload script or documented command sequence under `scripts/`
- `DEPLOY.md` env keys for server
- Portal checklist (IARC, store page, Win/Mac artifacts)
- Optional CI notes (not necessarily a full workflow yet)
- Packet progress close-out
Out of scope: live store submission (maintainer). Commits: `docs(desktop)` +
`chore(scripts)` as needed.

## Completion criteria (whole feature)

- Website and steam builds, server boot, and `npm run gate` succeed with **no**
  Epic env vars set.
- With `EPIC_ENABLED` unset, no client shows Epic link UI and all epic routes are
  dark.
- Epic channel pack produces stamped `release-epic/` trees with updater off.
- With full credentials and a linked account, a deed unlock mirrors to Epic
  (manual sandbox proof when org exists; automated tests cover the worker with
  fakes).
- No login-with-Epic path exists (source-scan pin).
- Linux is not claimed as an EGS target in code or docs for this packet.

## Starter prompt skeleton (phase files fill braces)

```
This is Phase N of the Epic Games Store integration packet: {title}.
Worktree: /home/fernandoramirez/Documents/woc-epic-games-integration
Branch: feature/epic-games-integration (off release/v0.33.0).

Goal: {one sentence}

STEP 0 - PRE-FLIGHT: git status clean; do not switch other worktrees or branches.

STEP 1 - LOAD CONTEXT: state.md, progress.md, this phase file, and: {files}.
Focus on Steam twins and merge-safe defaults (D3).

STEP 2 - EXECUTE: {deliverables}.

INVARIANTS: D1-D3, D23, plus {phase D-numbers}.

OUT OF SCOPE: {exclusions}.

STEP 3 - VALIDATE: {commands}. Reviewers per implementation-plan.md matrix.

STEP 4 - DOCS: update progress.md and state.md.

STEP 5 - FINAL RESPONSE: status, files, commands, handoff for next phase.

STOPPING RULES: stop if Epic credentials become required for default tests/gate;
stop if src/sim gains Epic imports; stop if login-with-Epic appears.
```
