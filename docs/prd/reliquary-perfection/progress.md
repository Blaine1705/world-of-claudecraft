# Progress: Reliquary Perfection Packet

## Status

| Phase | Status | Started | Completed |
|---|---|---|---|
| 10 Sim correctness close-out | complete | 2026-08-05 | 2026-08-05 |
| 10 QA | complete | 2026-08-05 | 2026-08-05 |
| 11 Page-name localization + i18n hygiene | complete | 2026-08-05 | 2026-08-05 |
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

### Phase 10 QA (2026-08-05)
- Verdict: PASS-WITH-FOLLOWUPS (one follow-up, the Phase 11 plural rider below; all
  other findings fixed in this round). The QA round closes by pushing this commit set
  to origin/feature/reliquary (PR 2976).
- Release sync brought the pnpm-audit corrections (PR 2966); the six eastbrook
  evidence/pin conflicts resolved to the release side (its re-mint matches the merged
  lockfile; our Phase 9 local re-pins were computed against the old lockfile and are
  superseded). Both eastbrook suites now pass locally, clearing the old local-only red.
- Audit shape: ultracode workflow (correctness, mutation-proven test decisiveness in a
  detached scratch worktree, cleanup; every finding adversarially verified, zero
  refuted, zero unverified) plus four direct reviewers (architecture, cross-platform
  sync, frontend seam, qa-checklist). Mutation evidence: baseline 412 green; the retro
  guards, the hidden-title filter, and the pushRecent guard each reddened their named
  tests when reverted.
- Found and fixed: 1 blocking (Biome format diff, the only error in the changed set);
  4 unique should-fix (retro summary emission unpinned in the window test; masterwork
  header claimed a crash-recovery mechanism the single-blob save path rules out;
  golden re-record provenance comment missing from scenarios.ts against the packet
  re-pin ruling; ownedMounts blast-radius question, judged no-change); 16 actionable
  nice-to-haves (Readonly retro opts, dead undefined-check removal, import
  consolidation, creation-disjoint pin, reload event assertion, comment-stripped
  craft pin, doc/comment accuracy across brainstorm/design/phase-10/types/mounts).
- QA-round test additions: the emission pin (log + announcer inside the reliquary
  handler body), the creation-disjoint pin (no class starter kit id is catalogued,
  with field-liveness guards), the reload-emits-nothing assertion, and the
  comment-strip hardening of the craft source pin.
- Decisions recorded in state.md Phase 10 QA: item-fills-only summary count;
  ownedMounts stays strict; four no-action observations.
- Rider filed in phase-11-page-i18n.md: plural forms for BOTH retro summaries
  (reliquary and deeds) via tPlural, moved together.

### Phase 11: Page-name localization + i18n hygiene (2026-08-05)
- All acceptance criteria met. Every Reliquary page name (window shelf/nearly/detail
  plus aria, hud illuminate toasts and banners) resolves through the new
  src/ui/reliquary_i18n.ts channel (deed_i18n clone, lazy per-locale chunks, pseudo
  port, manifest), with all 28 names filled in ja_JP/ko_KR/ru_RU/zh_CN/zh_TW anchored
  to existing entity/itemSet/deed translations (details and deviation rulings in
  state.md). pageStubNote is gone end to end; shelf terminology is aligned and locked
  in the glossary; nav counts use progressText; the loading tip names no chord; both
  retro summaries render through tPlural with count-correct English.
- The catalog holds 28 pages (the phase file's "27 after Phase 10" line was stale;
  its own title line said 28). The i18n baseline memory's sha256 re-mint step is
  retired: regeneration via npm run i18n:gen and committing the slices is the whole
  obligation.
- Review dispatch: frontend-seam-reviewer, qa-checklist, test-coverage-auditor
  (named by the QA gate), plus a fresh reviewer over the fix round itself. Zero
  behavioral blocking across all three; the one BLOCKING was a coverage gap (the hud
  reliquaryPageName routing had no pin). All findings applied in the consolidated
  fix round (5d83778ba8, 21 items, mutation-proven); three declined with recorded
  rulings in state.md (Latin .one seeding vs the Phase 10 QA rider, unreachable
  few/many rows, the 28-pin dedupe). The fresh review of the fix round found 0
  blocking (extraction proven behavior-preserving and PROD-tree-shaken by a real
  esbuild bundle; tier delisting consistent three ways with no fourth list) and 2
  should-fix pin gaps plus nits, applied in the tightening commit that follows it
  (changeLanguage await-precedes-flip ordering, two-sink sentinel occurrence
  floors, widened chord guard, dialect-residency and tier-scan comment cautions).
- Validation: npx tsc clean; 23-suite battery green (627 passed) before the fix
  round and the 17-suite fix-round battery green after (407 passed); ci:changed
  clean; release-tier arms green for the new suites (known mid-cycle tier reds in
  the deed arm and pending set are inherited, not this phase).
- Deferred (recorded, do not re-raise as new findings): ja screenshot spot-check to
  Phase 11 QA (the sentinel test covers the criterion behaviorally; the pr-screenshots
  requirement applies at the PR); desc rendering and its fills to Phase 13/22;
  Latin page-name chunks and plural .one singulars to the Phase 22 release fill;
  the observed pre-existing terminology splits (ko/ja/ru Nythraxis and NPC
  transliterations, raidLockout heroic prefix, guide.nav.professions third term) to
  a maintainer call, recorded in state.md.
