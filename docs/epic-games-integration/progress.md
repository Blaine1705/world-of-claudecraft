# Progress: Epic Games Store integration

## Status

| Phase | Status | Started | Completed |
|---|---|---|---|
| Phase 1: Desktop channel plumbing | complete | 2026-07-31 | 2026-07-31 |
| Phase 2: Epic packaging channel | not started | | |
| Phase 3: Server dark surface | not started | | |
| Phase 4: Desktop Epic shell | not started | | |
| Phase 5: Server link verification | not started | | |
| Phase 6: Achievement mirror | not started | | |
| Phase 7: Client UI + i18n | not started | | |
| Phase 8: Ops docs + BPT runbook | not started | | |
| Packet close QA (`qa-checklist.md`) | not started | | |

## Deliverable checklists

### Phase 1
- [x] `epic` accepted in `resolveDistribution` / `DISTRIBUTIONS`
- [x] `updaterAllowed` false for epic
- [x] `walletConnectionSupported` false for epic
- [x] Packaged env override still closed for epic (stamp final)
- [x] Tests extended and green

### Phase 2
- [ ] `electron:build:epic` / `electron:pack:epic` scripts
- [ ] `release-epic/` output, publish null, dir targets Win+Mac only
- [ ] Stamp fields for epic ids; refuse pack without required ids
- [ ] Website/steam builds unchanged without Epic env
- [ ] Builder config tests pin epic channel

### Phase 3
- [ ] `server/epic/` skeleton with live `EPIC_ENABLED` gate
- [ ] Routes registered; dark answers `epic.disabled`
- [ ] `epic_links` DDL additive
- [ ] Status advert `epic.enabled`
- [ ] Error codes + rate policy stubs/twins
- [ ] Source-scan: no login mint
- [ ] Default tests green with no Epic env

### Phase 4
- [ ] `electron/epic.cjs` facade (injectable, never throws)
- [ ] IPC + preload + DesktopBridge types
- [ ] Capability false on website/steam; true on epic (or WOC_EPIC_DEV)
- [ ] Missing native EOS degrades to null
- [ ] Unit tests with fakes (no real SDK required)

### Phase 5
- [ ] Pure token helpers + web_api shell
- [ ] Full link/unlink/status arms + reclaim-by-proof
- [ ] Rate limit wired
- [ ] Decisive route tests

### Phase 6
- [ ] Achievement map + mirror worker
- [ ] Wired from deeds_records + login reconcile (independent of Steam)
- [ ] Dark when disabled; fire-and-forget
- [ ] Mirror tests

### Phase 7
- [ ] `src/ui/epic_link.ts` + markup hooks
- [ ] English catalog keys
- [ ] UI tests for advert/capability/linked arms

### Phase 8
- [ ] desktop-release epic section
- [ ] BPT runbook / script
- [ ] DEPLOY.md env keys
- [ ] Portal checklist
- [ ] progress/state closed for packet

## Notes

- Packet authored 2026-07-31 from research + Steam twin audit.
- Epic org credentials intentionally not required to start Phases 1 to 7.
