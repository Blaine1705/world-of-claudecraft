# Progress: Reliquary Perfection Packet

## Status

| Phase | Status | Started | Completed |
|---|---|---|---|
| 10 Sim correctness close-out | complete | 2026-08-05 | 2026-08-05 |
| 10 QA | complete | 2026-08-05 | 2026-08-05 |
| 11 Page-name localization + i18n hygiene | complete | 2026-08-05 | 2026-08-05 |
| 11 QA | complete | 2026-08-06 | 2026-08-06 |
| 12 Test integrity + catalog pins + records | complete | 2026-08-06 | 2026-08-06 |
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

### Phase 11 QA (2026-08-06)
- Verdict: PASS-WITH-FOLLOWUPS (follow-ups are the release-fill native-pass notes,
  the deliberate release-tier red, and the Phase 22 BUNDLES step, all in state.md;
  nothing blocks the push). Closes by pushing this commit set to
  origin/feature/reliquary (PR 2976).
- Release sync 0ed5a09b97 (28 commits): deed catalog union resolved append-only
  (release chronicle block first, Curator ranks re-appended at the tail; count,
  renown, category, tail, and sha256 pins recomputed for the 263-deed / 3060-Renown
  union), corpse-harvest fixtures took the release side (claw/tusk supersede the
  branch's older seed re-pins; suites green unchanged), the 21 both-side-minted
  parity goldens re-minted from the merged tree (UPDATE_PARITY=1 touched exactly
  those 21), pending.ts and guide content regenerated. release-merge-audit (5
  slices): two branch-owned drifts found, fixed this round (pristine_claw specimen
  slot; the reliquary keybind missing from the guide controls reference); three
  release-internal notes recorded with no action (error.uniqueEquipped fills ride
  the release fill; the corpse_harvest_sim db mock covers 11 of 26 game.ts db
  imports, latent only; the mob_component_tags census complement is
  self-referential).
- Audit shape: Explore context load; ultracode workflow (correctness sweep,
  i18n-trap agent over the trap memories); frontend-seam-reviewer and qa-checklist
  dispatched fresh; serial main-loop mutation pass; fresh-agent review of the fix
  round; second mutation pass over the new pins.
- Mutation evidence: 4/4 phase pins decisive (window shelf-row render, both hud
  source-scrape arms, resolver passthrough reddened 5 tests) and 3/3 fix-round pins
  decisive (registry identity drop, specimen bidirectional drop, ja anchor break);
  green baselines proven before and after every run.
- Found and fixed: 0 blocking. Should-fix set: the lazy-loader third copy
  (extracted to makeLazyLocaleChannel + the CONTENT_LOCALE_CHANNEL_ENSURERS
  registry), the en-only chord guard (now every locale plus localized modifier
  spellings), the spot-check-only entity anchors (now a derived 95-cell sweep), the
  unvalidated shipped glossary (keyPatterns pinned to the live key union), the
  missing release-tier bar for the Latin page-name fill (18-locale full-manifest
  runIf arm, registered three ways, deliberately red at release tier until Phase
  22), and the ko feature-name split (unified on 성물고 with a glossary row and a
  per-locale one-term guard). Applied nits: esc() on focus-key attributes,
  prototype-key hasOwn guards in both channels, scrape and regex-pin hardening,
  jsdoc truth-ups. The fresh review of the fix round then found 2 should-fix (the
  ko Delve Day note pointing at the museum instead of the delve; glossary patterns
  under-covering their own note) and 8 nits; applied in 064292546a with rulings for
  the rest recorded in state.md.
- Validation: npx tsc clean; ci:changed clean; full vitest 30983 passed with
  exactly 3 failures proven INHERITED (they reproduce at the release tip
  303be34548: PR 2905 landed without updating loot_window_controller and
  material_profession_affinity; release-owned, not this branch); malware scan,
  i18n freshness, and the full five-entry build all green; targeted batteries
  green across every touched suite.
- ja_JP screenshot spot-check (deferred criterion 1): PASS. Before/after desktop
  and mobile committed under docs/screenshots/reliquary-page-i18n (before shows
  English page names inside a Japanese window at the phase base; after is fully
  localized and reflects the pristine_claw append at 3/213).
- Second base sync before push (575b5ceb88): the AAA-enhancements landing (PR 2947)
  moved the base again; 29 both-side parity goldens plus pet_ai re-minted from the
  merged tree, pending.ts regenerated, and the 3015 claw/tusk craft consumers clear
  the three inherited reds recorded above. Full gate re-run green (the one browser
  regression failure was a dynamic-import cold-start flake, 16/16 files green
  standalone; typecheck and all builds green).

## Phase 12: Test integrity + catalog pins + record corrections (2026-08-06)

- Ultracode implementation phase per the plan. Release sync fb6e012255 (CI-only
  incoming: merge-queue PR 3016; no conflicts, incoming CI suites green at the
  merged tip). Commits: 4dc750388a (three drops + guide regen), 05753664a6
  (content-test derivations + growth sweeps + totals), bf42fa5b80 (state, server,
  and UI pins), 314187312e (record correction), then the review fix round
  688de2e2e8 (delve-clears sim fix, test-first), edccbd0cef (coverage gaps),
  7bd8f7fb70 (desc reword), 871d292ab2 (final review batch).
- Catalog: gravewyrm_bone_quiver, direfang_quiver, selthes_seastriders were the
  ONLY uncatalogued rare+ instance drops (proven exhaustive by the new equality
  regime); totals 213 to 216 and 184 to 187, literal-pinned through the
  production completion math. The phase file's 215/186 arithmetic was stale as
  the runner prompt warned; everything was derived from the live table.
- Found and fixed (test-first, from the coverage audit's one BLOCKING finding):
  the delve arm of clearCountForSource read a delveClears key no writer
  produces, so delve page clears and delve first-find provenance were
  permanently 0 on every host; the fix prefix-sums the tiered keys like
  delveShopGateUnlocked, and a cross-module test drives a real clear through
  grantDelveClearTo holding all three readers to one count.
- Phase-file corrections discovered in execution: items 11 and 12 were mostly
  moot (the Phase 10 sync had already corrected all but ONE comment block;
  frostveil was already resolved release-side with the strict contract live;
  the corpse_harvest 60s timeout never existed, proven via git log -S). The
  "hides rank line when unranked" expectation in item 9 contradicts the server,
  which always renders an Unranked fallback; reality pinned, no behavior change.
- Reviews: qa-checklist READY (0 blocking, 2 should-fix); test-coverage-auditor
  1 blocking + 4 should-fix + 8 notes; fix round fresh-reviewed (0 blocking,
  3 should-fix, 4 notes) and its batch applied; architecture-reviewer SHIP
  (0 blocking, the delve-reader divergence judged acceptable-and-pinned). Every
  finding across all four reports applied or explicitly ruled in state.md.
- Mutation proof: 40/40 executed red-then-restored across three batteries
  (23 + 11 + 6), each run proving the patch applied and tests actually ran,
  with green final baselines and a clean tree after every battery.
- Validation: npx tsc --noEmit clean throughout; npm run ci:changed exit 0;
  guide freshness green post-commit; 17-suite sweep 1161 passed / 4 known
  skips; sim blast-radius suites (architecture, parity, wire, snapshots,
  delves, delve_shop, deeds) all green after the sim fix.
- Commits stay LOCAL per the plan; push happens after Phase 12 QA passes.

## Phase 12 QA: Verify test integrity + catalog pins (2026-08-06)

- Ultracode QA phase per the plan. Pre-flight: the release tip e8330dbf11
  (merge-queue PR 3016) was already the sync merge fb6e012255's first parent,
  so no new sync merge was owed; tree clean at f928641226 before work began.
- Adversarial mutation audit, the phase's core: 33 gated mutations executed
  red-then-restored across three central serial batteries (18 + 9 + 6), every
  one KILLED. Harness: per-mutation anchor-count gates (exactly one match
  required before patching), cp-restore (never checkout), patch-applied proof
  via git diff, tests-ran proof from vitest JSON reporters, and a
  porcelain-clean tree proven after every mutation. One extra exploratory
  mutation (deleting the restore recent-ring catalog filter) confirmed existing
  coverage in two tests rather than a gap.
- Separations proven, not assumed: a page-side drop reds the totals literal
  plus the equality while the vacuity floor stays green; a loot-side drop reds
  the floor (failure-message verified) while the totals stay green; a
  BOTH-sides drop still reds floor plus totals (the context pass had
  hypothesized equality-invisibility; the hand-literal floors refute it); the
  floored-readout pin alone carries the per-entry floor claim (the cross-module
  writer test stays green under a floor regression); the bag and bank sheet
  arms red independently; a synthetic sixth Curator rank reds ONLY the new
  growth cross-pins; deleting a signature rare from the delve shop stock is
  invisible to the page equality (the chest still derives it) and is caught
  only by the strengthened stock pin.
- Reviews (all read-only, coverage-prompted): architecture-reviewer SHIP
  (0 blocking; 1 comment-precision should-fix, applied); cross-platform-sync
  0 blocking / 0 should-fix (no host or IWorld drift; both worlds call the one
  clearCountForSource); qa-checklist READY (0 blocking; confirmed the delve arm
  was the ONLY reader/writer key mismatch in the file and that no shipped save
  carries a bad clears stamp, the Reliquary having never shipped);
  test-coverage-auditor PASS (1 should-fix: the server rank-6 boundary was a
  hand literal, closed with CURATOR_RANK_DEFS growth cross-pins on BOTH the
  server and client arms); comment-accuracy verifier: every 314187312e
  correction ACCURATE with full git provenance (the seed-1 branch hunt vs
  seed-5 release hunt history verified back to 3c0931fcdf and 58bf16476d).
- Fix rounds: a381a6a391 applied every finding (new pins: observer-throw
  propagation, string-clears and non-object restore arms, bidirectional
  heroic-gear keys, desc staleness pins, portal-loot premise guard, rank
  growth cross-pins, a line-adjacent cap literal, the border-kind pin; comment
  corrections including the finding that reagent parity between the masterwork
  arms is impossible by design, the 1145 self-signed reduction). The fresh
  review of that round found 1 BLOCKING: the Thunzharr comment reword (sourced
  from the comment verifier) was itself wrong, because the world-boss path caps
  gear at one piece per kill via rollWorldBossLoot's gearWon discard; verified
  in-source and restored with the both-groups-drawn / one-award wording in
  1108acd6aa, together with that review's six should-fixes (range/int/pick
  propagation arms, the client-side rank pin, the DESC_BOSSES table over every
  page naming a full live boss, the portal vacuity floor, heroicClear gate
  pins, module-private wording in the CLAUDE.md row, the file's last em dash).
  All round-2 pins re-proven by mutation (6 further kills in the 33). A final
  delta review of round 2 returned GO with one correction (the gear cap is per
  CONTRIBUTOR; gearWon is declared inside the contributor loop) and flagged the
  pre-existing zone3 Thunzharr comment as arithmetically stale (the vestments
  chest joined the first group after it was written); round 3 (4b86153f0f)
  applied both, trued the zone3 numbers in-source (40 percent gear group, ~19
  percent effective belt), and made the DESC_BOSSES table self-checking by
  deriving the (page, full-name) pair set from the live catalog, itself
  mutation-proven (a heroic desc gaining a full boss name reds the guard; 34
  gated kills total).
- Validation: npx tsc clean throughout; node scripts/gate_select.mjs PASS on
  a381a6a391 (all 8 steps green; full vitest 31572 passed with zero unexpected
  failures, the previously inherited 3 reds cleared by the release-side red-tip
  repair) and re-run on the final tree before push; biome clean on every
  touched file.
- Verdict: PASS. Pushed to origin feature/reliquary (PR 2976) after the final
  gate run; CI babysat per the plan (AI-assist checks never gate; CANCELLED
  counts as failure). NEXT: Phase 13 (window structure + information UX, plain
  xhigh per the plan, not an ultracode phase).
