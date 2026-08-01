# Progress: Epic Games Store integration

## Status

| Phase | Status | Started | Completed |
|---|---|---|---|
| Phase 1: Desktop channel plumbing | complete | 2026-07-31 | 2026-07-31 |
| Phase 2: Epic packaging channel | complete | 2026-07-31 | 2026-07-31 |
| Phase 3: Server dark surface | complete | 2026-07-31 | 2026-07-31 |
| Phase 4: Desktop Epic shell | complete | 2026-07-31 | 2026-07-31 |
| Phase 5: Server link verification | complete | 2026-07-31 | 2026-07-31 |
| Phase 6: Achievement mirror | complete | 2026-07-31 | 2026-07-31 |
| Phase 7: Client UI + i18n | complete | 2026-07-31 | 2026-07-31 |
| Phase 8: Ops docs + BPT runbook | complete | 2026-07-31 | 2026-07-31 |
| Packet close QA (`qa-checklist.md`) | not started | | |

## Deliverable checklists

### Phase 1
- [x] `epic` accepted in `resolveDistribution` / `DISTRIBUTIONS`
- [x] `updaterAllowed` false for epic
- [x] `walletConnectionSupported` false for epic
- [x] Packaged env override still closed for epic (stamp final)
- [x] Tests extended and green

### Phase 2
- [x] `electron:build:epic` / `electron:pack:epic` scripts
- [x] `release-epic/` output, publish null, dir targets Win+Mac only
- [x] Stamp fields for epic ids; refuse pack without required ids
- [x] Website/steam builds unchanged without Epic env
- [x] Builder config tests pin epic channel

### Phase 3
- [x] `server/epic/` skeleton with live `EPIC_ENABLED` gate
- [x] Routes registered; dark answers `epic.disabled`
- [x] `epic_links` DDL additive
- [x] Status advert `epic.enabled`
- [x] Error codes + rate policy stubs/twins
- [x] Source-scan: no login mint
- [x] Default tests green with no Epic env

### Phase 4
- [x] `electron/epic.cjs` facade (injectable, never throws)
- [x] IPC + preload + DesktopBridge types
- [x] Capability false on website/steam; true on epic (or WOC_EPIC_DEV)
- [x] Missing native EOS degrades to null
- [x] Unit tests with fakes (no real SDK required)

### Phase 5
- [x] Pure token helpers + web_api shell
- [x] Full link/unlink/status arms + reclaim-by-proof
- [x] Rate limit wired
- [x] Decisive route tests

### Phase 6
- [x] Achievement map + mirror worker
- [x] Wired from deeds_records + login reconcile (independent of Steam)
- [x] Dark when disabled; fire-and-forget
- [x] Mirror tests

### Phase 7
- [x] `src/ui/epic_link.ts` + markup hooks
- [x] English catalog keys
- [x] UI tests for advert/capability/linked arms

### Phase 8
- [x] desktop-release epic section (channel table, build env, Win+Mac only, BPT pointer)
- [x] BPT runbook (`docs/epic-games-integration/bpt-upload.md`) + fail-closed
      `scripts/epic-bpt-upload.mjs` (not in pretest/gate/CI)
- [x] DEPLOY.md `EPIC_*` keys + dark default; docker-compose pass-through
- [x] Portal checklist (`docs/epic-games-integration/portal-checklist.md`)
- [x] progress/state closed for Phase 8; next is whole-packet QA

## Notes

- Packet authored 2026-07-31 from research + Steam twin audit.
- Epic org credentials intentionally not required to start Phases 1 to 8 docs.
- Phase 8 does not claim live BPT upload or store submission; those need real
  org access later. Whole-packet QA is `docs/epic-games-integration/qa-checklist.md`
  (not marked complete until a dedicated QA session runs it).
