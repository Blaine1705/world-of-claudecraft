# Phase 8: Ops docs + BuildPatchTool runbook

Make the epic channel operable for the maintainer once the Epic org and product
exist. No requirement that credentials exist in this session: document the
steps, scripts, and env keys so packaging and upload are mechanical.

## Deliverables

1. Expand `docs/desktop-release.md`:
   - Channel table gains epic row (command, output dir, updates owner)
   - Build env keys for epic packaging
   - Note: Win+Mac only; Linux stays website/Steam
   - Point to BPT upload section
2. BPT runbook (section in desktop-release.md and/or
   `docs/epic-games-integration/bpt-upload.md`):
   - Install/obtain BuildPatchTool
   - Upload loose `release-epic` trees per OS
   - Sandbox vs Live
   - What not to upload (installers)
3. Optional script skeleton `scripts/epic-bpt-upload.mjs` (or shell) that fails
   with a clear message when credentials missing; does not run in default gate
4. `DEPLOY.md`:
   - `EPIC_ENABLED` default off
   - product/deployment/client/secret keys
   - note that link + mirror are cosmetic; no login with Epic
5. Portal checklist (maintainer):
   - Create product, sandboxes, clients
   - IARC
   - Store page assets
   - Achievements matching `achievement_map.ts`
   - Submit for review only after Phase 6-7 smoke in Dev sandbox
6. Packet close:
   - progress.md Phase 8 done
   - state.md current phase = packet ready for QA
   - Run `qa-checklist.md` (or schedule a dedicated QA session)

## Out of scope

Actually submitting the store page, paying the fee, or uploading production
binaries unless the user explicitly asks in-session with credentials available.

## Acceptance

- A new maintainer can follow docs without reading chat history
- Default CI still needs no Epic secrets
- Docs obey copy rules (no em/en dashes, no emojis)

## Starter prompt

```
This is Phase 8 of the Epic Games Store integration packet: Ops docs + BPT runbook.
Worktree: /home/fernandoramirez/Documents/woc-epic-games-integration
Branch: feature/epic-games-integration.

Goal: document epic packaging, server env, portal checklist, and BuildPatchTool
upload so the channel is operable when org credentials arrive, without putting
secrets in the repo or the default gate.

STEP 0 - PRE-FLIGHT: git status clean. Implementation phases 1-7 should be complete
or explicitly deferred with notes in progress.md.
Read state.md D6, D7, D15, D16, D25, D26 and docs/desktop-release.md.

STEP 1 - LOAD CONTEXT:
  docs/desktop-release.md
  docs/desktop-ship-notes.md
  DEPLOY.md Steam section
  scripts related to steam deploy if any
  server/epic/config.ts (final env names)
  docs/epic-games-integration/qa-checklist.md
  Current BuildPatchTool instructions from Epic docs (fetch official)

STEP 2 - EXECUTE Deliverables. Keep docs accurate to the code that shipped.
Do not invent portal UI clicks that you cannot verify; prefer stable concepts
(product, sandbox, artifact, BPT modes).

INVARIANTS: D3, D6, D23, D25. Never commit secrets.

OUT OF SCOPE: live production upload unless user provides credentials and asks.

STEP 3 - VALIDATE:
  Doc-only: read-through for contradictions with state.md
  If a script was added: unit test or --help dry run without credentials
  npm run ci:changed if code/scripts touched
  Optionally run qa-checklist.md items that are automatable

STEP 4 - DOCS: progress.md Phase 8 + packet close note; state.md next action =
run whole-feature QA / open PR when authorized.

STEP 5 - FINAL RESPONSE: summary of doc paths, remaining maintainer portal steps,
and whether code is ready to PR.

STOPPING RULES:
  - Stop before any real upload or secret paste into the repo.
  - Stop if docs would claim Linux EGS support (D6).
```
