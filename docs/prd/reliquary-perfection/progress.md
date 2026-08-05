# Progress: Reliquary Perfection Packet

## Status

| Phase | Status | Started | Completed |
|---|---|---|---|
| 10 Sim correctness close-out | complete | 2026-08-05 | 2026-08-05 |
| 10 QA | not started | | |
| 11 Page-name localization + i18n hygiene | not started | | |
| 11 QA | not started | | |
| 12 Test integrity + catalog pins + records | not started | | |
| 12 QA | not started | | |
| 13 Window structure + information UX | not started | | |
| 13 QA | not started | | |
| 14 Overview flagship + celebration | not started | | |
| 14 QA | not started | | |
| 15 Deep links, chat, tracker, guide search | not started | | |
| 15 QA | not started | | |
| 16 Art: launcher + owned cells | not started | | |
| 16 QA | not started | | |
| 17 Obtain counts + wire perf | not started | | |
| 17 QA | not started | | |
| 18 Rewards ladder | not started | | |
| 18 QA | not started | | |
| 19 Borders in-world | not started | | |
| 19 QA | not started | | |
| 20 Inspect + social surfaces | not started | | |
| 20 QA | not started | | |
| 21 Catalog growth | not started | | |
| 21 QA | not started | | |
| 22 Population rarity + close-out | not started | | |
| 22 QA (final; teardown offer) | not started | | |

Per-phase deliverable checklists live in each phase file's acceptance criteria; mirror
them here as phases complete. QA phases record: fixes applied, tests added, dead code
removed, verdict, deferred items, and whether the push to `origin/feature/reliquary`
happened.

## Notes per phase

(append as completed)

### Phase 10: Sim correctness close-out (2026-08-05)
- All acceptance criteria met. The hidden deed's reward title text (DEEDS
  hid_saul_footnote reward.text) is gone from the generated guide bundle
  (the only occurrence was the wiki reliquary arm's reward.text emit); the guide
  needles now cover reward.text on all three guards with liveness preconditions; the
  wiki emitter throws on a hidden title relic before writing.
- The join-time retro path is behavioral-tested end to end (real Sim.addPlayer with a
  veteran save): every reliquaryUnlock and rank-bridge deedUnlocked carries retro
  true, recent stays empty, firstFind entries carry no clears key (asserted by key
  absence, including through a serialize round-trip), and a live post-join fill still
  celebrates. Both old source-scrapes deleted, subsumed.
- Review dispatch: architecture-reviewer, cross-platform-sync, qa-checklist, plus
  test-coverage-auditor and migration-safety (named by the QA gate). Zero blocking on
  the implementation; a 19-item consolidated fix round applied every should-fix and
  nit, each fix mutation-proven red-then-green; the fix round was itself re-reviewed
  by a fresh agent.
- Notable review outcome: the phase doc's W3 emit unification was implemented, then
  DELETED on three-reviewer convergence (inert on every host, primaryId identity
  unsound on the server); replaced by the single-kind-pages structural pin. See
  state.md Phase 10 surfaces for the full record.
- Release-sync note: the release re-hunted the same inherited-red seed suites this
  branch re-pinned in Phase 9 (4c2b43f8f7) and root-caused the frostveil HP loss
  (Rime Elementals, not terrain); conflicts resolved keeping branch seeds, stale
  provenance comments trued up, false "Reliquary world-gen" attributions stripped
  (the branch adds no world-gen draws; identical recordings on both sides prove it).
- Deferred (recorded, do not re-raise as new findings): per-relic ownership rebuild
  cost on the join seed (Phase 17 wire/serialize perf owns it); a reverse pin that
  every gear-capable craft has a catalog masterwork mark (Phase 21 catalog growth);
  the wiki hidden-throw is belt-and-braces and deliberately untested (the content pin
  makes the state unreachable); no screenshot for the retro summary chat line (single
  log line, mirrors the deeds precedent which has none).
