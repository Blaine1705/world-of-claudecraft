# Progress: Reliquary Perfection Packet

## Status

| Phase | Status | Started | Completed |
|---|---|---|---|
| 10 Sim correctness close-out | complete | 2026-08-05 | 2026-08-05 |
| 10 QA | complete | 2026-08-05 | 2026-08-05 |
| 11 Page-name localization + i18n hygiene | complete | 2026-08-05 | 2026-08-05 |
| 11 QA | complete | 2026-08-06 | 2026-08-06 |
| 12 Test integrity + catalog pins + records | complete | 2026-08-06 | 2026-08-06 |
| 12 QA | complete | 2026-08-06 | 2026-08-06 |
| 13 Window structure + information UX | complete | 2026-08-06 | 2026-08-06 |
| 13 QA | complete | 2026-08-06 | 2026-08-06 |
| 13b Complete source coverage | complete | 2026-08-07 | 2026-08-07 |
| 13b QA | complete | 2026-08-07 | 2026-08-07 |
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

## Phase 13: Window structure + information UX (2026-08-06)

- Pre-flight: tree clean at abeafbe99c; origin/release/v0.35.0 (50c78b3e61)
  was already an ancestor of HEAD, so no sync merge was owed and no
  release-merge-audit applied. BEFORE screenshots captured first (the
  pre-change tree), including a new reliquary-page detail target added to
  scripts/pr_shot_targets.mjs for the purpose (Phase 22's recapture needs it).
- Source hints (sim content, data-only): ReliquarySourceKind
  ('boss'|'zone'|'profession'|'deed'|'vendor'), ReliquarySourceHint
  {sourceKind, sourceId}, source? on all five relic-def arms, sourceDefault?
  on ReliquaryPageDef, and ONE exported resolver reliquaryRelicSource(page,
  relic) that the client (reliquary_view) calls, so exactly one precedence
  implementation exists. 183 of 242 slots resolve (137 boss, 33 deed, 11
  profession, 2 vendor) as built; Phase 13 QA retired the wyrmcult_grand_robe
  hint (see the QA record), so the live numbers are 182 of 242 and 136 boss.
  sourceDefault on the true single-source pages
  (hollow_crypt, nythraxis, thunzharr, the six heroics), per-relic on the four
  multi-boss dungeon pages, all SEVEN set pages (the packet docs said six),
  the three professions pages, and horizons_titles. 59 slots were pinned in
  SOURCE_PENDING_RULING pending a maintainer ruling (60 after the QA
  retirement; see state.md OPEN items): most are precisely-known sources with
  no representable kind (delve chests, the Drowned Litany rite, Rift
  progression, quest/vendor mounts, the Claudium store), plus the Gravewyrm
  multi-route drops (6 as built; 7 after QA, the robe's second route being a
  quest rather than a loot table), 6 corpse-harvest specimens no gathering
  profession owns, and masterwork:first.
- Content-truth pins: every authored sourceId resolves against its kind's
  live table (MOBS membership, not rank flags: the credited mid-bosses are
  elite-only); boss hints walk into MOBS[].loot / HEROIC_BOSS_LOOT (137
  rows, 0 defects; 136 after the QA retirement, and the walk is
  difficulty-aware since the QA); vendor hints into DELVE_SHOPS via the board NPC;
  profession hints DERIVED from NODE_HARVEST_TABLE / NODE_MATERIAL_TABLE /
  MATERIAL_GRADES / gatherRareEventFlavor (0 defects); pending list pinned
  bidirectionally with page-scoped pageId:slotId keys; cross-page agreement
  for set members; multi-source pages pinned by a literal 28-page
  distinct-count map. 13 content mutations executed red-then-restored.
- Window UX: missing-cell tooltips AND aria labels carry a localized source
  line (tEntity/zone/dungeon/deed channels; the shipped key family is
  hudChrome.reliquary.sourceBossDungeon / sourceBoss / sourceZone /
  sourceProfession / sourceDeed / sourceVendor, not the plan's sourceLine*
  spelling); page descs render under the page header (reliquaryPageDesc's first
  production call site) and as the shelf-row second line (CSS-truncated);
  the shelf list is a real ul/li (professions pattern); the relic grid is ONE
  roving tab stop (rovingTarget 'both', Home/End, wrap) with an SR-only usage
  hint and aria-keyshortcuts stamped per cell; a persistent polite live
  region announces narrowing results (ReannounceMarker, count-neutral plural,
  gated on what the painted surface narrowed, world-driven repaints with an
  unchanged count never re-announce); deeds-parity search (locale-folded via
  toLocaleLowerCase(languageTag), matches page name + desc + contained relic
  names on every page-listing surface) plus owned/missing chips (sticky for
  the session; search is per-visit, the bank PR 2838 policy); caret survives
  rebuilds; the recent-strip title= attr is gone (tooltip + data-recent-name).
- One display-name ladder: NEW src/ui/reliquary_labels.ts
  (mount_labels/armory_labels family) owns reliquaryRelicDisplayName /
  reliquaryRelicSearchText / reliquarySourceLineText; all four former ladder
  sites (cellDisplayName, findDisplayName, both hud.ts handleReliquaryUnlocks
  ladders) route through it; the humanized id.replace fallback is GONE
  everywhere (terminal arm is hudChrome.reliquary.unknownRelic); every arm is
  membership-guarded so a stale id can never render as raw text; the painter's
  .name-read pin is now ZERO (was 1). hud.ts net -15 lines including the dead
  reliquaryWindowOpen getter (was at :15287, not the packet's stale :15253).
- Nearly-complete rule: remaining <= RELIQUARY_NEARLY_MAX_REMAINING (3) OR
  fraction >= RELIQUARY_NEARLY_MIN_FRACTION (0.6), both inclusive, owned >= 1
  floor kept, sort and slice(5) unchanged; a 1/31 page no longer qualifies
  (visible in the before/after screenshots).
- CSS: the four never-defined pseudo-tokens are gone (deeds-style literals;
  the inset kept its two per-role values matching deeds; themeCssVars debt
  recorded in the section banner); .reliquary-count got a real rule; the
  inert cell cursor is gone and cells got an honest hover; search field 16px
  iOS floor + 40px mobile min-height (.bag-search precedent); chips 40x40.
- i18n: 18 new hudChrome.reliquary.* keys + the reliquarySearchResults plural
  base (registered in the pinned plural-base list), English + all five
  non-Latin fills in the same change (M16; ru plurals three distinct forms);
  i18n bundles regenerated via npm run i18n:gen (deterministic, verified
  byte-identical on a second run; rides the same commits as the catalog).
- Tests: tests/reliquary_window_behavior.test.ts NEW (10 describes, 60+
  cases, happy-dom, live catalog, 31/31 seeded mutants caught by a
  scratch-dir harness that proves tests ran); reliquary_view.test.ts +~450
  (nearly boundaries, source-line arms, search/filter incl. tr_TR casefold
  and localized-name injection, resolver arms incl. prototype keys);
  reliquary_window.test.ts +~380 source pins (zero .name, no toLowerCase, no
  dynamic t() casts, roving pin, sliced sig scrapes, value-level fill pins);
  reliquary_content.test.ts 59 -> 63; two axe-suite entries added to
  tests/browser/a11y.browser.test.ts (not run locally; CI/browser-suite
  scope).
- Reviews (all read-only, coverage-prompted, every finding applied or
  recorded): mid-state frontend-seam (8 SF + 11 N), architecture-reviewer on
  sim (0 blocking, 3 SF + 5 NTH; independently verified all 137 boss hints
  against live loot), test-coverage-auditor (1 blocking: the unpinned
  haystack casefold, closed; 6 SF incl. the filterEmpty copy defect and the
  profession truth gap, all closed), final fresh frontend-seam (1 blocking:
  biome format on the new shot target, closed; live-region cluster closed),
  qa-checklist (NOT READY verdict whose six items were all closed), and a
  fix-round verifier (8/9 fixes correct; its 1 regression finding, the
  world-driven re-announce, closed with a behavioral pin; its nearly-strip
  asymmetry ruling applied as deep match on Overview too).
- Deliberate skips, recorded not silent: deed/reliquary search+chip CSS
  duplication stays at copy #2 (rule of three); role=group + aria-pressed
  chips stay (deeds consistency); no search debounce and per-cell keydown
  stay (deeds parity, cold path); .deed-search mobile floor untouched
  (cross-window scope); gridIndex not written back during paint;
  -webkit-search-cancel-button styling; GRID_HINT_ID single-instance seam;
  row-wise arrow movement + arrows-reach-avatar (pre-existing across all
  five roving windows).
- Validation: npx tsc --noEmit clean throughout; targeted battery 13 files
  512 tests green; behavior+view+window+content 369 green post-fix-round;
  npm run ci:changed exit 0. Pre-commit gate_select failed only at i18n
  freshness (regen vs committed copies, by design on an uncommitted
  catalog+bundle change). The post-commit full-suite run then caught ONE real
  item in 31838 tests: the new lastAnnounced field is a repaint memo, and
  tests/language_fanout_registry.test.ts demands the language question
  answered for every memo a classified module carries; registered with the
  rationale (the fan-out render is argument-less, the player-driven arm, so
  it always rewrites the region in the new language) in e3b1802d10. Final
  node scripts/gate_select.mjs on the finished tree: PASS, all 8 steps green.
  Screenshots committed under docs/screenshots/reliquary-window-information/
  (before/after, desktop + mobile landscape; the after page shot shows the
  live source line "Drops from Sanctum Scaleguard in Gravewyrm Sanctum").
- Commits stay LOCAL per the plan; push happens after Phase 13 QA passes.
  NEXT: Phase 13 QA (docs/prd/reliquary-perfection/phase-13-qa.md, ultracode,
  fresh session).

## Phase 13 QA: Verify window structure + information UX (2026-08-06)

- Verdict: PASS. Pushed to origin/feature/reliquary after the fix rounds
  below; CI babysat on PR #2976.
- Release sync: the base moved mid-QA (Fernando merged the CI/CD packet PRs
  3020/3022/3023/3024 and the elixir tooltip PR 3021). Merged
  origin/release/v0.35.0 at 3d94a97586 as 367f6e2968; the one conflict was
  the generated i18n pending bundle, resolved by re-running npm run i18n:gen
  (every other bundle reproduced byte-identically). release-merge-audit ran
  clean: both sides intact in the four genuine overlaps (hud.ts,
  pr_shot_targets.mjs, architecture.test.ts, localization_coverage.test.ts),
  no premise invalidated, zero new db-mock sites.
- Verification executed: tsc clean; the 12-file battery green pre- and
  post-merge; npm run ci:changed exit 0; the browser a11y suite RUN LOCALLY
  for the first time (29 passed, closing the build's one deferred acceptance
  criterion); an all-locales scratch sweep (22 locales x every hinted slot:
  every source line and display name non-empty, zero snake_case id leaks);
  EIGHT new-angle mutations, each killed by named tests (hint dropped: 5
  tests; the original wyrmcult bug re-added: the new sweep names
  quest:q_gravewyrm; syncGridRoving deleted: the chip-reset pin; both nearly
  boundary flips; the pre-cap filter deleted; the quest arm deleted: the
  per-family floor; the applySearch equality guard deleted: the either-order
  IME case).
- QA round 1 (four fresh reviewers: frontend-seam, architecture,
  test-coverage, qa-checklist): 0 blocking anywhere. Confirmed and fixed:
  wyrmcult_grand_robe's boss hint violated the model's own two-comparable-
  routes rule (quest q_gravewyrm names Korzul, the loot row names Korgath):
  retired to SOURCE_PENDING_RULING (59 -> 60; Phase 13b authors its
  multi-hint, boss + quest); the Overview nearly strip filtered AFTER its
  top-five cap, hiding sixth-ranked matches: now narrows before the cap; the
  hud unlock drain called bare render(), defeating the world-driven announce
  guard (found independently by two reviewers in hud.ts, the one file the
  six build rounds never re-read): now refreshIfChanged() with a source pin;
  announce gating now asks the model what the paint narrowed (model.filtered;
  a needle matching everything stays silent); the window-opening render is
  silent by design (suppressAnnounceOnce; close() clears region state); IME
  compositions are never rebuilt over (isComposing guard + composing flag
  holding the slow band, either event order a no-op via the applier's
  equality guard); recent chips wrap instead of truncating (ellipsis was
  keyboard-unreachable on a non-interactive span) with overflow-wrap for
  unbreakable compounds; a competing-route sweep now walks six award-path
  families with per-family vacuity floors, a profession-acknowledged recipe
  arm, curated consumed-checked exceptions for the two 250-to-1 set-member
  trash routes, and named exclusions (Rift payout: a 13b 'rift'-kind ruling
  QA must not pre-empt; chest pools and heroic-variant swap: zero hinted
  overlap today); difficulty-aware boss loot truth (extracted predicate with
  synthetic negatives); dead-sourceDefault, non-item-kind hint, pending
  derivation-identity, and prototype-key pins; data-cell-source stamped on
  source-bearing cells with behavior + cross-file pins replacing the shot
  picker's English aria match; test decisiveness hardening per the
  test-coverage audit (reset-marker exact equality, clear-silence,
  shelf deep-match with premises, overview filtered arms each decided
  alone including the equal-length identity swap, tabStop exactness, two
  honest retitles incl. the Turkish platform-contract test).
- QA round 2 (three fresh reviewers over the fix commits): tcov found the
  one BLOCKING of the whole QA (a single 150-route floor let the vendor,
  quest, and recipe sweep arms be deleted silently; the quest arm is the one
  that caught the robe): closed with per-family floors, mutation-proven.
  arch measured the Rift overlap (72 of 141 hinted slots) and verified the
  robe's two routes independently; fe-seam caught the IME double-announce
  ordering and the online-immediacy overclaim in the hud comment (the event
  frame precedes the heavy snapshot online; the comment now says convergence,
  not immediacy).
- Refuted with the file open, not applied: the round-1 proposal to stamp
  aria-describedby only on the active cell (the attribute is inert on
  non-focused cells, so the proposed re-stamp announces identically; the
  per-cell design's in-code rationale stands).
- Considered skips, recorded not silent: the second buildNearlyComplete
  sweep for the narrowing flag stays (cold path, honest comment, simpler
  seam than a paired return); wrapped chips may grow the recent strip row
  (information over fixed height; the truncation it replaced was the a11y
  defect); the noNonNullAssertion warning in the a11y browser test keeps the
  file's assert-then-bang idiom; close()'s lastAnnounced/marker resets are
  belt-and-braces under the suppress branch; stampGridTabIndex write-elision
  is behaviorally unpinnable (correct by inspection).
- Screenshots: unchanged. The committed overview captures contain no recent
  chips (empty demo ring) and the page captures cannot show a data
  attribute, so the chip-wrap CSS and cell marker alter no pixels; no
  recapture owed. docs/screenshots/reliquary-window-information/ stands.
- Deferred to CI / E2E (pre-existing VERIFY items, unchanged by this QA):
  the ARM 3 wall-clock perf tour and the scripts/mobile_*.mjs E2E suite. No
  new E2E for the search flow is owed (the happy-dom behavior suite plus the
  axe cases cover it; decision recorded per the round-1 gate).
- Validation on the finished tree: tsc clean, 8-suite battery 468 green,
  browser a11y 29 green, ci:changed exit 0. node scripts/gate_select.mjs:
  every step green EXCEPT the full-suite vitest arm, which ran twice on a
  box another session held at load 48 to 95 (16 cores) and failed 15 then 7
  tests, every one a pure timeout in a suite this diff does not touch, with
  the failing SET shifting between runs (the contention signature); every
  failing file re-run green on a quiet box (173/173 for the persistent
  four), 31810 of 31817 passed with zero assertion failures. Ruled
  machine-contention noise per the recorded judge-by-CI policy for
  borderline local timeouts; PR CI on clean runners is the arbiter. Full
  history: abeafbe99c -> 367f6e2968 (sync) -> 2d084fe341 + 71d2369d76 +
  b9777879b3 (round 1) -> 7a574c6608 (round 2) -> the docs commit.

## Phase 13b: Complete source coverage (2026-08-07)

Executes the settled source ruling plus the Phase 13 QA's additions: every
silhouette now lists every real door, and SOURCE_PENDING_RULING holds exactly
the two genuine content gaps.

- Sync: 2ce5f87134 merges release/v0.35.0 at 7a7132e15c (the CI/CD packet tail
  plus the market wire cadence). release-merge-audit clean: the three
  branch-owned overlaps (server/game.ts, src/sim/sim.ts, src/ui/CLAUDE.md)
  keep both sides' intent, no new routes, no stale db-mock shape, no premise
  invalidated.
- Vocabulary (b7e72b7d6f): ReliquarySourceKind gains delve, rift, quest,
  store, and activity; a relic's source accepts one hint or a NON-EMPTY
  readonly list (tsc rejects an authored empty list); reliquaryRelicSource
  returns a frozen readonly list, own hints winning wholesale over the page
  default. Pinned id spaces: RELIQUARY_STORE_SOURCE_ID ('woc_store'),
  RELIQUARY_ACTIVITY_SOURCE_IDS (corpse_harvest, masterwork_craft),
  RELIQUARY_RIFT_RANK_SOURCE_IDS (B, A, S; C rolls no mount). 'boss' KEPT as
  the mob-loot arm name (the QA's 'mob' consideration declined: the id space
  is MOBS either way, the rendered copy never says "boss", and a rename would
  churn 136 authored rows for zero player-visible change).
- Authoring, 58 of 60 (all verified against live tables): the seven Sanctum
  shared drops (both mobs each; the two crafted combo pieces add their
  recipe's own craft; wyrmcult_grand_robe carries korgath_the_bound plus
  q_gravewyrm); the Collapsed Reliquary pair (delve + vendor); the six
  Drowned Litany rite rows (delve); masterwork:first and the six
  corpse-harvest trophies (activity); seven of nine mounts (heroic reins name
  every dropping boss plus their rift rank, the epic pair rift-only,
  valorsteed vendor-only); all 29 skins via the skins page's store
  sourceDefault; the two open-world rares add their camp zone.
- DEVIATION from the phase prose, listed per the stopping rules: valorsteed
  carries NO quest hint. q_riding_lessons awards no item (itemRewards is
  empty; the reins are a separate 10g purchase from Marla), so the prescribed
  quest hint would fail its own truth pin. The stale mounts_training.ts
  header claiming the quest grants the reins is corrected in the same change.
- RULING (delegated to 13b, recorded as permanent): the Rift clear GEAR pools
  stay excluded from source lines. riftNormalClearPool / riftHeroicClearPool
  are derived mirrors of the whole five-man tier paid as one uniform pick, so
  they are the tier's background luck, not a route a player can aim at one
  relic; the rift MOUNT ladder names its exact reins per rank and IS listed.
  The sweep's rift arm walks the reins tables, and a liveness pin keeps the
  excluded pools' catalog overlap measured (69 of 73 pool ids are hinted
  slots today).
- Rendering (34cd2ce9e6): reliquarySourceLinePlan is list-in/list-out, one
  line per door in authored order with no cap (grag_bear and
  stalkglider_snail are the four-line maximum); exactly one boss plus exactly
  one zone composes the single bossZone line at the boss position, and the
  page dungeon wins where both could apply; no either-boss merging (one line
  per door everywhere). Tooltip paints every resolved line; the aria label
  folds them through formatList (Intl.ListFormat conjunction) so CLDR owns
  every locale's separators including the final-conjunction shapes a pairwise
  key cannot express (the interim sourceAriaJoin key was retired inside the
  phase after review). Seven new hudChrome.reliquary keys with five non-Latin
  fills each (M16), bundles regenerated in-change. data-cell-source now
  carries the RESOLVED line count and scripts/pr_shot_targets.mjs prefers the
  richest cell, so the flagship capture lands on gravewyrm_gauntlets at three
  lines.
- Tests (e462c15718): per-kind truth pins with exact floors (boss 159 with a
  10-floor mount arm through the reins seam, vendor 5, profession 8 with the
  recipe-derived crafted arm, delve 8 enumerated behaviorally over every
  tier/class/bountiful/rng branch, rift 6 rank-exact, quest 1 with the
  q_riding_lessons negative premise, store 29, activity 7 bidirectional, zone
  2 through camp centers and the production zoneContaining requiring exactly
  one boss and one zone). The acknowledgment sweep walks nine families via a
  module-scope pure judge; per-family doctored-miss negatives prove every arm
  can fail; the delve-fronting vendor disjunct has positive coverage; the two
  pending mounts carry an inverse zero-routes sweep plus watch rows in the
  self-checking exclusions (heroic vendor stock, dungeon ground objects,
  RIFT_ITEMS, each with a liveness floor). Behavioral: the three-door helm
  and four-door reins render every line in tooltip and joined aria, the
  bossZone pair renders one line, the un-hinted mount renders nothing, and
  the ja case pins the locale join against an independent Intl.ListFormat
  oracle. Mutation kills: nine content-side (one per new kind plus freeze,
  always-true judge family, swapped activities) and three UI-side (dropped
  tooltip line, hardcoded join, unguarded arm), all restored from saved
  copies.
- Reviews: five dispatched, five delivered (architecture, frontend seam,
  test coverage, qa-checklist, plus a fresh fix-round auditor), zero BLOCKING
  anywhere; every SHOULD-FIX and nit applied except three recorded decisions:
  the combo-craft relics name only their recipe's home craft (two "Earned
  through" lines would imply either craft alone suffices); the dungeon name
  repeats per boss line on dungeon pages (the phase file mandates the
  bossDungeon composition per line; eyeballed in the capture, reads fine);
  reliquarySourceLinePlan keeps its singular name (cosmetic, the pins spell
  it). The mounts-page place question (boss lines name no dungeon on
  horizons_mounts) is recorded in state.md as a maintainer call.
- Validation on the committed tree: tsc clean, the 11-suite battery 566
  green, ci:changed exit 0, browser-independent i18n freshness proven
  byte-identical by the QA reviewer pre-commit and by the gate's own arm
  post-commit. node scripts/gate_select.mjs: every step green EXCEPT the
  full-suite vitest arm, which failed 7 files, every one a 20-to-230-second
  pure timeout in a suite this diff does not touch (charge recharge, dungeon
  finder, eastbrook integration, escort ambush, frost procs, physics
  zonewalls, respawn policy); all seven re-run green in isolation (142/142).
  Ruled machine-contention noise per the recorded judge-by-CI policy, the
  same signature and ruling as the Phase 13 QA's gate runs.
- Screenshots: docs/screenshots/reliquary-phase13b/ before/after, desktop
  and mobile. The before shows the old picker settling for a single-line
  cell; the after shows the gauntlets' three-line collection-log entry.
- History: 2ce5f87134 (sync) -> b7e72b7d6f (vocabulary + authoring) ->
  34cd2ce9e6 (rendering + i18n) -> e462c15718 (tests) -> the docs commit.
  Commits stay LOCAL; the Phase 13b QA session owns the push.

## Phase 13b QA (2026-08-07)

Verdict: PASS after one ruling and two fix rounds. 239/242 slots resolve;
the pending set grew to three by ruling, every other claim verified.

- Sync: 430347a1e0 merges release/v0.35.0 at 74315f3d68 (the ossbrain base
  sync with the Galecrest private-scatter stream move and its seed
  re-hunts, potion stacking, the CI required-shard and Node-pin fixes, and
  the gathering node placement fix). An earlier session's abandoned
  mid-conflict sync targeting a stale tip was aborted on the user's call
  and redone fresh. Conflict resolutions: parity goldens theirs + in-merge
  re-mint; professions_fishing taken WHOLESALE from release per the
  recorded divergence caveat after a per-hunk resolution proved incoherent
  (release renamed the recording constants; the release tip was verified
  green in a throwaway worktree first, then 67/67 on the merged tree);
  whirlwind_echo per-hunk theirs; scenarios.ts hand-merged keeping the
  release seed-5 history plus the branch's golden-provenance paragraph.
- Sync fallout, two commits: 462bb05658 follows the masterwork
  signed-reagent window re-hunt (seed 151 to 21, prescribed by the test's
  own comment); a945608a4d re-mints the FULL parity golden set (the
  in-merge mint covered only the coverage_a/b scenario subset, leaving 38
  goldens across parity_a..g line-spliced or release-minted; caught by the
  9-agent release-merge-audit workflow, which also verified every changed
  golden keeps identical event and frame counts, the state hashes moving
  only for the branch's reliquary meta field).
- Reviews: seven FRESH agents over the build diff (architecture, frontend
  seam, test coverage, qa-checklist, plus content-truth, rendering
  correctness, and i18n audits), all seven delivered; zero BLOCKING from
  six of them. The content-truth audit hit the STOPPING RULE:
  masterwork:engineering is unearnable (every engineering recipe is a
  slotless statless tool; masterworkBonusStats null for all eight; the
  proc can never fire) yet carried a Phase 13a fromProfession hint and was
  not pended. Verified independently in the main thread (the derivation
  re-run by hand), STOPPED, and the maintainer ruled: PEND IT (the
  two-mounts precedent).
- Fix round 1 (f6cc5df5ba): the pend (bare marks() entry, third
  SOURCE_PENDING_RULING row, gear-capability pin deriving eligible crafts
  through masterworkBonusStats, inverse sweep coverage, floors 240 to 239
  and friends); composed source lines (bossZone, bossDungeon) degrade to
  the surviving authored half instead of deleting a live door
  (asymmetric: a stale page dungeon falls back to the boss sentence, a
  stale boss drops the line); hint objects frozen at their constructors;
  MOUNT_SOURCES / SET_MEMBER_SOURCES keys typed against the live unions;
  withProfessions fallback made required (dead branch); sourceRift
  reworded to the drop register (en + five fills; it is a 0.1-0.5% roll,
  not a clear reward); zh_CN curly quotes on sourceDeed/sourceDelve/
  sourceQuest; ja/ko masterwork term aligned to the crafting surfaces
  with a new glossary category; test hardening (title-deed identity pin,
  dungeon-page clearSource pin, zone-sweep shape predicate + synthetic
  trips, owned-cell attribute-absent pin, NO_SOURCE_LINES frozen pin,
  activity key completeness loop, comment-stripped M16 scrape, guide
  boss-name leak pin extended to the reliquary page).
- Fix round 2 (819e583046), from a fresh fix-round reviewer (request
  changes: 1 blocking, 4 should-fix): the ja/ko gallery PAGE NAME lives
  in reliquary_i18n.locales/ and still carried the retired term
  (名作ギャラリー / 명작 갤러리 to 傑作ギャラリー / 걸작 갤러리, comments
  and ja pin updated; the glossary note now records that this surface
  sits outside its patterns' reach); the leak pin's derived carve-out had
  excused Zulgar of all names, replaced by the strictly stronger
  catalog-strip PROSE scan with no carve-out, English plus every
  translated locale; glossary patterns grew the crafting toast/zone line,
  both bags aria keys, and the guide masterwork prose; two comments trued
  up. Round-2 declines: none. S4 (doc premises) is this record.
- Mutation kills: ten this pass, all restored from saved copies with
  proven test tallies: one per new kind (delve, rift, quest, store,
  activity), the dual-table boss drop (content + behavioral both red),
  un-pend engineering (gear-capability pin reds), bossZone degrade revert,
  owned-cell stamp, and the guide prose pin (via the resolved en bundle;
  mutating the catalog alone proved nothing, the runtime reads the
  bundles).
- Recorded, not implemented (state.md OPEN rulings): heroic difficulty
  under-specification on bossDungeon lines (decide with the mounts-place
  ruling; covers set pages and Thunzharr too); the quest class-gate
  omission (one hint affected); the native-shell sourceStore question
  (with the {store} interpolation rider). The arch reviewer's
  quest-first-pickup distinction (velkhar class rewards) was examined and
  the carve-out kept: the elision rule is consistent and now documented
  for all four Sanctum quest elisions in the catalog comment.
- Validation: tsc clean; the fix-round battery 948 green across 17 files;
  parity 193/194 green post-re-mint; biome 0 errors and no format drift
  on every touched file; no em/en dash or emoji introduced (perl scan;
  BSD grep has no -P). SOURCE_PENDING_RULING key order is load-bearing in
  the exact-equality pin (deliberate). The pended mark caps catalog
  completion at 215/216 until the owner acts (recorded in state.md).
- Gate: node scripts/gate_select.mjs (planner fell back to the full
  suite) surfaced ONE real red the audits had missed: the Harrow fear
  case in tests/fear_break_chance.test.ts, an assertion failure (not a
  timeout), isolated-reproducible, GREEN at both merge parents and red
  only at their combination: the branch's seed-1 hunt went stale when the
  private-scatter sync moved the late Galecrest camps off the shared
  stream. Followed to the release side's own recorded seed 4 in
  6391de2fef (the same fallout class as the masterwork window). The
  re-run gate is PASS, all 8 steps green: full suite 32088 tests across
  2315 files (2 expected fail, 108 skipped), browser suite 110 green,
  builds, i18n freshness, biome, and the malware scan all clean.

## Phase 14 (2026-08-07)

Overview flagship + Illumination celebration + refresh-elide cleanup.
Base ROLLOVER: this phase moved the integration base to release/v0.36.0
(PR #2976 retargeted on GitHub; implementation-plan.md Step 0 and the
state.md delivery decision trued up in this record's commit).

- Sync aa824dc814 merges release/v0.36.0 at 911325a95f: the v0.35.0
  release i18n fill (6510 rows), the modular character creator with the
  setHelmHidden cosmetics member (parity pin re-unioned 307/79/228), the
  boot preload/locale-fetch overlap, the js-yaml pin. Generated i18n
  resolved by regeneration (branch reliquary rows stay pending); parity
  goldens untouched by the merge and verified green (193/194), so no
  re-mint was needed. The 13b stale-suspect seed suites (masterwork
  window, professions_fishing, fear_break_chance) were green in
  isolation this time.
- Release-merge audit (three read-only agents plus the skill steps):
  every both-sides file verified a lossless union. Two fallout commits:
  4fd5dba7ea reflow-proofs the release-authored defer_launcher_preloads
  boot pin (its one-line literal predated the branch's Phase 11
  multi-line loader block; red only at the merge combination), and
  42f10972b7 fills the four Curator-rank deeds (col_reliquary_rank_2..5)
  in the five non-Latin deed_i18n.locales overlays: the release fill
  sized itself to the release-side catalog (262) and never saw the
  branch's four deeds, and the deed content channel has NO pending
  tracker, so the 13 Latin overlays are now tracked on the state.md
  Phase 22 worklist (release-tier deed arm reds on
  es.col_reliquary_rank_2.name until that fill, the reliquary_i18n
  Latin-chunk precedent). Also trued up the command_schema set_helm
  comment the merge falsified.
- Feature ef48d80446 (one commit, not the phase file's three: render()
  interleaves the flash consumption with the elide restructure line by
  line, so a split would have fabricated untested intermediate states):
  recent strip = icon jump buttons on the existing data-page wiring
  (view model gains pageId: firstFind hint wins, catalog-order scan
  falls back, null renders an inert chip), per-strip hints
  (recentEmpty, nearlyEmpty), nearly mini bars + reliquaryToGo plural,
  three shelf cards (RELIQUARY_SHELF_ORDER, data-nav, aria-describedby
  folds the latest line into the accessible name), sharedUniquesNote,
  and the retired overviewEmpty key deleted end to end (pageStubNote
  precedent). New keys: hudChrome.reliquary.{recentJumpAria,
  recentEmpty, nearlyEmpty, shelfRecent, shelfNoFinds, shelfOpenAria,
  sharedUniquesNote} + hudChrome.plurals.reliquaryToGo, all with five
  non-Latin fills, Latin pending for Phase 22. Celebration classes:
  reliquary-page-celebrate (1.6s page frame + grid brightness shimmer),
  reliquary-cell-flash (1s fill pulse), standing is-illuminated gold
  frame + filled badge replacing the letter-spacing-only rule; sticky
  one-shot celebrateIllumination(pageId) gated on the model reporting
  the page complete, flashRelics(ids) cleared by the consuming render,
  animationend removal with a bubbling-target guard, close() drops
  unspent moments, reduced motion = static frames (declaration-level
  content-bound pins). Elide: ownership Sets out of buildInput (an
  elided poll reads NEITHER ownership seam, call-count pinned; the
  signature never read those sets, so semantics are unchanged),
  first-find count allocation-free with Object.hasOwn, both bars plus
  the two new meters on --reliquary-fill.
- The Horizons truth rule (QA blocking find, fixed): the recent ring
  receives ONLY item and mark first-finds (pushRecent's two call
  sites), so a Horizons find (mounts, skins, titles) can never reach
  it, and a retro-seeded veteran has owned > 0 with an empty ring on
  any shelf. The card's latest line is three-way: the find when the
  ring knows one, shelfNoFinds only when owned is 0, otherwise omitted.
  Follow-up option recorded, not built: derive the Horizons latest from
  firstFind (which does record mounts/skins/titles) if the card should
  regain a third line there.
- Reviews: frontend-seam (0 blocking, 4 should-fix, 11 nits),
  qa-checklist (2 blocking: the Horizons rule above and the then-absent
  screenshots/docs; 5 should-fix, 6 nits), and a FRESH fix-round
  reviewer over the applied fixes (0 blocking, 3 should-fix, 5 nits).
  Every finding applied except recorded decisions: the seal-rule
  reduced-motion deletion is DELIBERATE and was never dead (it
  suppressed a STATIC glow, decoration not motion; rationale now sits
  at the seal rules, and the phase file's "dead query" premise was
  wrong); shelf cards do NOT narrow under an active search (cards are
  navigation, not results; pinned by two tests); the reduced-motion
  static ring standing until the next signature-driven repaint is the
  deeds contract and reads only true statements (comment updated); the
  unknown-kind recovery idea is moot after the three-way rule (the
  latest line only renders for real ring finds); the fourth #171309 is
  the section's recorded surface-literal debt; the ru sharedUniquesNote
  phrasing nit was noted for the release fill's native pass. The
  "allocates nothing" acceptance wording is recorded here precisely:
  the elided poll performs no ownership-seam reads and no O(catalog)
  copies; small constant-size locals (the input literal, closures, the
  signature strings) remain.
- Observations recorded for later phases: Horizons ownership rides ONE
  signature dimension (reliquaryCatalogCompletion().owned; genuinely
  covered on both hosts today, but a future cached/narrowed read would
  stale the card with nothing else to catch it); mutating an existing
  firstFind row's pageId in place would not move the signature (only
  the count is digested; unreachable in production).
- Screenshots 2558a0da94: docs/screenshots/reliquary-phase14/, desktop
  and mobile, fresh (hints + cards vs the old stub) and seeded (icon
  chips, mini bar, to-go, truthful card lines). The capture tooling
  gained a reliquary-overview-fresh target and the seeded target now
  fills the recent ring the way a live find would.
- Validation: tsc clean; the seven-suite battery 465 green post-fixes;
  ci:changed exit 0; i18n equivalence green on the committed tree (its
  two reds pre-commit were the documented uncommitted-tree artifact).
  Mutation proofs: six by the test agent (celebration one-shot, elide
  zero-call, pre-filter capture, flash one-shot, bar contract, plus the
  accumulation-across-elided-poll rewrite that caught its own first
  version being gameable), all restored with hash-verified copies.
- Commits: aa824dc814 (sync) -> 4fd5dba7ea (boot pin) -> 42f10972b7
  (deed fills) -> ef48d80446 (feature) -> 2558a0da94 (screenshots) ->
  the docs commit. Commits stay LOCAL; the Phase 14 QA session owns the
  push.
