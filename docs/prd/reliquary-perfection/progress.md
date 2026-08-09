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
| 14 Overview flagship + celebration | complete | 2026-08-07 | 2026-08-07 |
| 14 QA | complete | 2026-08-07 | 2026-08-07 |
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
  the page complete, flashRelics(keys, kind:id since the Phase 14 QA
  round) cleared by the consuming render,
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

## Phase 14 QA (2026-08-07)

Verdict: PASS-WITH-FOLLOWUPS. Zero BLOCKING findings across six audit
sources (release-merge audit x3, frontend-seam-reviewer, qa-checklist,
contract/mutation audit, i18n+a11y audit, visual pixel QA); every
should-fix and nit applied in two reviewed fix rounds. The QA session
owns the push.

- Sync: second v0.36.0 sync this phase, merge e8570107ce
  (origin/release/v0.36.0 at ffde6dc349; 35 commits: arena PvP fix set
  PR 2885, four bespoke animation PRs, retention sweeps PR 2911).
  Conflicts were generated files only, resolved by REGENERATION:
  pending.ts via i18n:gen (union), the two arena goldens re-minted on
  the merged tree via UPDATE_PARITY=1 (only those two goldens moved;
  the merged traces carry BOTH the release level gate and the branch
  reliquary meta, verified independently). Auto-merged both-sides
  unions (icons.ts, scenarios.ts, arena_pet_return.test.ts, hud_chrome
  catalog, five non-Latin overlays) all verified: no side's intent
  lost. Release-merge audit: no new endpoints/SimEvents, no stale
  injected bindings (the retention pruneBatch two-shape near-miss
  checked and clean), no db-mock trap; deed overlay counts exact
  (curator fills intact 5x4); premise re-check trued up the parity
  anchor, retired the resolved inherited-red trio, and flagged
  hudChrome.arenaGate.minLevelNote's 15 Latin pending rows as
  RELEASE-owned (the Phase 22 worklist must not absorb them).
- Inherited red at the tip (recorded, not fixed): tests/
  anim_pipeline_hunter_ghost.test.ts, 2 tests; its manifestBlock
  anchors ("player_hunter: {") reference a manifest shape that no
  longer exists; every input byte-identical to the release tip.
  Flake adjudications: drowned_litany coverage red in the mint run
  only, green isolated (the per-merge seed class, 13b precedent);
  corpse_harvest_sim 20s timeout and one i18n_resolved_equivalence
  batch timeout are the known contention shapes, judge by CI.
- ARM 3 perf tour (HUD_PERF_BUDGET_TOUR=1, PERF_GPU=1, both
  viewports): tourMinFrames, hudHotDomWrites desktop (603), FCT pool
  all within anchors; hudSkip 100 percent. TWO anchor overages
  reproduce IDENTICALLY at the release tip in a clean worktree, so
  they are base-owned, not this branch: mobile hudHotDomWrites 696-698
  vs anchor 640 (frame-count-independent across 1232 and 3007-frame
  runs; the branch adds zero writes, 603/603 and 696/696 vs tip), and
  desktop frameLong50 14-17 vs anchor 12 under load. Baseline NOT
  re-pinned (release-owned; surface upstream).
- Real-run VERIFY items: npm run test:browser 16 files / 110 green
  (axe over every window incl. the new Overview, keyboard nav, target
  size). Visual pixel QA on the live Overview: desktop chips measure
  exactly 28px (20px icon + 3px pad + 1px border), mobile chips and
  cards hold the 48px floor, all three truth-rule arms render
  truthfully, bars ride --reliquary-fill including a 0-width fill,
  committed-screenshot diffs show surface-identical rendering (all
  red = world bleed through the translucent window + count deltas from
  seeding), reduced-motion celebration renders the static ring
  (animation none, classes clear on the next rebuild) and the normal
  path runs the 1.6s celebrate + shimmer.
- Fix round 1 (all findings applied): per-strip search hint (new key
  hudChrome.reliquary.stripNoMatch + five non-Latin fills; adds its 15
  Latin pending rows to the Phase 22 fill); focus fallback for jump
  controls destroyed by their own jump (card:X to nav:X, page jumps to
  back; pure reliquaryFocusFallbackKey + tests); flash keys
  kind-namespaced end to end (bare ids could collide across kinds);
  is-illuminated frame recolors a transparent base border so the grid
  no longer jumps at the celebration moment; jump-family hover/focus
  blocks unified; three redundant animation-iteration-count lines
  folded into the shorthand; stale comments fixed; pr_shot_targets
  seeding now records firstFind so chips exercise the hinted path;
  reliquaryFillPct extracted to the pure core. New pins: the hud
  arming order (one-shots armed BEFORE refreshIfChanged, inside
  isOpen), the illuminated-gate short-circuit order (armed across a
  repaint of its own incomplete page), close() dropping an
  elided-armed flash, full key-and-value catalog literals, the
  identical-totals ring-digest fixture.
- Fix round 2 (fresh-reviewer findings, two round-1 choices REVERSED
  with rationale): the sharedUniquesNote owned-gate was WRONG (the
  shelf denominators disagree with the catalog total at owned 0
  already: 245 slots over 219 relics), so the note is unconditional
  again and the committed fresh screenshots stay truthful; the
  reduced-motion rings went back to var(--gold) (the deed precedent's
  --gold-dim has no salience against the standing --gold-dim
  is-illuminated frame; rationale comment at the rule); stripNoMatch
  now keys on per-strip model flags (recentEmptiedBySearch /
  nearlyEmptiedBySearch), so a STRUCTURALLY empty strip keeps its own
  hint while a needle is live instead of claiming a false no-match;
  summary bar routed through the shared percent; reliquaryFlashKey
  single-sources the kind:id shape (hud arming + cell match).
- Follow-up candidates recorded, NOT built: derive the Horizons card
  latest line from firstFind; the Horizons single-signature-dimension
  observation; setTimeout is absent from the perf gate's FRAME_DRIVERS
  (a timer added to a cold painter would pass; repo-wide gate, not
  this packet's); forced-colors drops the celebration's visual arrival
  cue (the news survives as text; observation only); the release-side
  arena unqueue double-message (hud arenaUnqueued line + sim log line
  disagree for team queues; pre-existing release pattern, surface
  upstream); mobile page-detail width cost of the celebration frame
  fix (18px, graceful auto-fill reflow, unverified visually at
  boundary widths).
- OPEN rulings surfaced again at this QA, no call received, nothing
  implemented against them: mounts-place + heroic difficulty (decide
  together), quest class-gate, native-shell sourceStore.

## Phase 15 (2026-08-07): Deep links, clickable chat, tracker, guide search

- Commits (LOCAL, Phase 15 QA session owns the push): ace14e32a4 release sync
  (history-only: the tip reverted the PR #3094 chain, zero-file net diff),
  153a67d80e guide search, 0c8941f119 deep link + chat lines, f4c2a81cac
  tracker, 8578d0861d review fix round, ee836e061a screenshots + capture
  target, 972fd44922 fix-round-review round, then this docs commit.
- Deep links: openWithPage(pageId) owns the jump state transition through the
  shared gotoPage helper the in-window data-page delegation now also calls;
  it clears the needle and ownership chip (the openWithDeed doctrine) and
  one-shot-focuses the page header on warm AND cold opens. open(nav) closes
  the recorded Phase 13 QA contract: it clears a persisted off-shelf pageId,
  clears search/ownedFilter, and arms a focusNavId one-shot at the rail so
  the rank-up link is perceivable for keyboard and screen-reader users even
  when the window is already open. Unknown and prototype-key ids open the
  window wherever it last was, unfocused, without a nav switch.
- Chat: relic gain, both Illumination emitters, and rank-up lines are
  node-built on the deed_chat_line family (gold kept, labels resolved from
  the local catalog, one fresh link node per token). The retro summary and
  the celebration banner stay plain, pinned. Relic-to-page resolution was
  factored OUT of buildReliquaryView (reliquaryRelicPageIndex /
  reliquaryRelicPageId) so the chat link and the recent strip share one
  resolver; a relic the catalog lost renders a plain line.
- Tracker: the deed-tracker recipe cloned end to end (chrome in both
  entries, pure view core, write-elided painter, slow band, delegation,
  collapse persistence, compact count chip opening the window, safe-area via
  the stack wrapper). Pin toggles live on shelf rows (sibling button) and
  the page-detail header, per-character localStorage on the deeds watchlist
  shape, pruned on Illumination. Default selection = the Overview strip's
  own nearly-complete rule via the extracted shared predicate + ranking.
  The whole-catalog default scan memoizes on a five-surface ownership
  signature delivered as a thunk read only on the nothing-pinned branch
  (Sim.ownedMounts() copies bags plus bank per read, so a pinned player
  pays zero ownership reads per slow build; laziness pinned by test).
  Delta-flash is slot-independent (keyed by page id), first sighting and
  returns never flash, the completing relic deliberately never flashes (the
  Illumination celebration owns that moment; module header records it).
- Guide search: GUIDE_RELIQUARY pages and relics indexed onto the page
  anchor with the page name in the relic haystack; the acceptance names
  (Gravewyrm Sanctum, Gravewyrm Mantle) resolve through the real rank();
  hidden-deed prose swept absent from labels AND haystacks with
  non-vacuity guards; a dual-page relic indexes once per page (26 such
  relics), matching the in-game counting rule.
- i18n: nine hudChrome.reliquary keys + two guide.search type labels, all
  M16-wordy, real fills in the five non-Latin overlays in-change (terms
  reuse each locale's established Reliquary vocabulary); Latin pends to the
  Phase 22 worklist. i18n:gen re-run after each catalog edit; freshness
  clean on the committed tree.
- Reviews: frontend-seam, test-coverage, and qa-checklist over the phase
  diff: ZERO blocking across all three (QA verdict READY). Every finding
  applied: fix round 8578d0861d (15 findings, 17 mutation proofs), itself
  freshly reviewed (0 blocking, 3 should-fix, 7 nice-to-have), those
  applied in 972fd44922 (lazy signature, nav-arm needle clear, close()
  one-shot resets, two comment corrections, four test hardenings, all
  mutation-proven). Screenshots agent, QA reviewer, and one context agent
  died on the 6pm session usage limit mid-run and were resumed from their
  transcripts; deliverables completed after reset.
- Gate: node scripts/gate_select.mjs (planner fell back to the FULL suite):
  2347 files / 32794 tests passed; red ONLY the inherited
  anim_pipeline_hunter_ghost pair (manifestBlock anchor "player_hunter: {"
  gone at the release tip), confirmed deterministic by isolated re-run.
  ci:changed exit 0. The gate was re-run after the last fix commit
  (972fd44922): identical result, the inherited pair is the ONLY red.
- Screenshots: docs/screenshots/reliquary-phase15 (desktop strip clipped +
  in-place, mobile compact chip, pin control both states) plus a
  reliquary-tracker entry in scripts/pr_shot_targets.mjs scoped to the two
  tracker modules. No before shots: the strip is new and a base checkout in
  the shared worktree was unsafe while other sessions edit it.
- Follow-up candidates recorded, NOT built: the pre-existing compact-tier
  collision (minimap coords y=100 / clock y=122 overlap the tracker stack
  top at y=96; the always-on strip makes it visible to everyone; owner:
  the compact top: max(96px, ...) rule); #right-tracker-stack has no
  max-height/overflow story with five populated trackers on short
  landscape phones (unverified visually); back-to-back fills inside the
  flash hold show one pulse (class never toggles off; cosmetic); the
  tally chip can read 5 while the mobile 88px clip shows about four rows
  (shared with the deed tracker); reliquaryFocusFallbackKey has no pin:
  arm (matches the deeds precedent; change both together if ever); wiki
  search serves raw catalog English page/relic names in every locale
  while the in-game window localizes them (pre-existing packet-level
  divergence, search now agrees with the page it links to); a 2x clipped
  screenshot needs a shoot() scale change in scripts/pr_screenshots.mjs.
- Release-tier note: fifteen Latin locales pend on the eleven new keys;
  joins the standing i18n-locale-fill chore before v0.36.0 ships.
- OPEN rulings surfaced again at phase start and close, no call received,
  nothing implemented against them: mounts-place + heroic difficulty
  (decide together), quest class-gate (wyrmcult_grand_robe), native-shell
  sourceStore, clears-0 provenance (due before Phase 17).

## Phase 15 QA (2026-08-08): Verify deep links, chat, tracker, guide search

- Verdict: PASS. Zero blocking findings across seven fresh review passes;
  every should-fix and every applied nit landed across three fix rounds,
  each round fresh-reviewed before the next; eight scratch mutations proved
  the load-bearing pins decisive (each reddened exactly its target test with
  a clean revert).
- Sync (03622bb782): merged origin/release/v0.36.0 (tip 895b906d2e). The
  release-merge-audit found both branch-owned overlap files
  (scripts/pr_shot_targets.mjs, tests/architecture.test.ts) merged with both
  sides intact and no legacy arms, endpoints, db-mock sites, or injection
  seams in the delta. PR #3111 inside the sync FIXED the inherited
  tests/anim_pipeline_hunter_ghost.test.ts pair: green in isolation and in
  the full suite, which ran fully green for the first time in this branch's
  history (2352 files, 32848 tests).
- The masked browser red that fix exposed: gate_select stops at its first
  failing step, so the browser step never ran while the full suite carried
  the inherited red. With the pair fixed the browser step ran for the first
  time and both reliquary axe tests threw: the rig's world stub predated the
  pin store and lacked cfg.playerClass / player.name, which pinKey reads at
  render. Fixed at b0dbee80f8; the suite is 29/29 and axe judges the
  aria-disabled pin markup clean.
- Audit fan-out, all zero blocking: frontend-seam-reviewer,
  test-coverage-auditor, and qa-checklist as fresh agents, plus a 23-agent
  workflow (jump-correctness, perf-alloc, guide-search, and completeness
  arms; every finding adversarially verified with the file open, 19 of 19
  upheld). Write-elision PROVEN by two scratch mutations (facet-bypass and
  always-dirty painter both redden exactly the elision pin in
  tests/reliquary_tracker_painter.test.ts). Parity arm: zero src/world_api/
  or src/net/ files in the phase range, and ClientWorld carries the same
  cfg.playerClass / player.name surface the pin key reads, so pins persist
  identically offline and online. Guide arm: corpus freshness and the
  hidden-deed filter green; the search deep-link anchors ride the same
  hash-anchor mechanism six pre-existing search types use (guide/app.ts
  scrolls the target on route), so no browser run was needed to settle it.
- Fix round 1 (29ebc7d3ae): both Illumination chat emitters apply the relic
  line's inert-link policy to a catalog-unknown page; the at-cap pin control
  keeps its tab stop (aria-disabled, never native disabled) with the refusal
  on a shared aria-describedby cap note and a polite-region announcement on
  a refused activation; the tracker drive reuses one input object (the deed
  tracker's allocation-free precedent); the ownership signature mixes with
  Math.imul; the pin prune is single-pass; the painter clears dt-flash from
  recycled pool slots; the guide-search tie-break collates in the active
  locale. Test side: the tracker pair joined the window hygiene scans, the
  banner text arguments and the gridIndex success-arm anchoring were pinned,
  prune persist-plus-nudge asserts, drift-guard tests on both arms, a cold
  all-empty-shape test, a private-mode persistPins test, the dual-relic
  floor, dt-header target-guard pins, and the capture target's cross-file
  spelling pins.
- Fix round 2 (987749dff3), closing the fresh review of round 1 (frontend
  seam: 0 blocking, 5 should-fix, 8 nits; coverage audit: 2 BLOCKING gaps
  proven by mutant runs): the cap note goes EMPTY on a paint with no at-cap
  control (an unconditional sentence read a false full state to browse-mode
  AT; anyAtCap raised during the markup build, reset per render); the prune
  back-fill arm and the per-build input.pinned re-read gained decisive tests
  (both had been deletable with the suite green: the rigs mutated one shared
  Set while production reassigns it); the imul rationale is pinned at the
  8691-count float-collision pair; the recycled-slot test drives a
  core-reachable shrink shape; the private-mode persist test spies the
  localStorage INSTANCE (the prototype spy never fired in happy-dom, so its
  first draft passed vacuously, caught by the fresh review); plus the CSS
  dimming pin for both refusal spellings, whole-statement comment-stripped
  closest() pins, the double-refusal reannounce assert, and banner
  timestamp typing.
- Fix round 3 (d757d7423f), settling the round-2 fresh review (0 blocking,
  ship-it): the drift guard adopts Object.hasOwn(RELIQUARY_PAGES_BY_ID, id)
  (the reliquary_i18n pageDef idiom, O(1) and prototype-safe); close()
  clears the cap note for symmetry with the live region; comment-accuracy
  fixes (pin-toggle result doc, positive-anchor rationale, tie-break strip
  strength, a11y-rig cast warning); the painter shrink test derives its
  bounds from RELIQUARY_TRACK_CAP.
- Record corrections to the Phase 15 entry above (imprecision, not defects):
  open(nav) DOES early-return when already open; the warm jump works because
  render() consumes the armed one-shots last, and the cited jump test :342
  pins the warm open(nav) arm while the warm openWithPage arm is pinned at
  :158/:168/:206. "Shelf card" in the entry-point list means the shelf PAGE
  ROW ([data-page]); the actual shelf cards are [data-nav] and never call
  gotoPage. "openWithPage jumps at 2" counts the jumpId form only; hud.ts
  has three openWithPage sites and all three are pinned.
- Considered and declined, with rationale: a chip-mode row-loop skip and a
  lastChip initializer (family divergence from the deed painter for no
  user-visible gain); dropping the per-row ensurePinsLoaded (defensive
  re-check behind an early return); suppressing the banner prose on a
  drifted Illumination (text, not a jump; a drift drain is a dev/ops anomaly
  worth seeing, and the raw-id echo is flagged below for a ruling); a
  white-box pin of close()'s one-shot clearing (defense-in-depth for a
  throw mid-render; both auditors split and the unreachable-path argument
  won).
- Follow-up candidates ADDED by this QA (recorded, not built): a batch
  ownership facet read (one bag, N page reads) would remove the
  per-pinned-page bags-plus-bank copies on the 500ms band, natural Phase 17
  material next to the documented sig-gather copy; duplicate relic labels
  render indistinguishable guide-search rows (dual-page names share label
  and type; needs a renderer-level page hint); haystack-only search matches
  surface at score 0 with no highlight mark (guide-wide scoring shape);
  warm deep links play no audio.click while equivalent in-window clicks do
  (design call); deed_chat_line's role=button accessible name carries no
  action context (shared with the deeds chat lines; a fix-all-consumers
  key); the refused pin click gives sighted users no feedback beyond the
  dimmed control (SR users get the announce); pin-from-Overview (the nearly
  strip shows the right candidates but cannot pin them); the alloc-probe
  gap on slow-band cores (shared with deeds_view); the a11y browser rig's
  as-never cast erases missing-member checking (a typed partial or shared
  world-stub factory would catch the next pinKey-style read at tsc time);
  the reliquary chat-link suite's audio import prints harmless ECONNREFUSED
  noise when run alone (pre-existing).
- Needs a maintainer ruling, surfaced by this QA: (1) the compact-tier
  minimap coords/clock collision over the tracker chip is VISIBLE IN THE
  COMMITTED after-tracker-mobile.png (owner: the compact top: max(96px,
  ...) rule); the Phase 15 deferral should be an explicit call, not a
  silent ride-along. (2) On catalog drift the banner and plain toast echo
  the RAW wire page id via reliquaryPageName's fallback: injection-safe
  (text nodes) but an untranslated server-supplied identifier in player
  text, which brushes the i18n render-sink rule; pre-existing, now
  documented at the guard sites.
- Gate: node scripts/gate_select.mjs PASS, all 8 steps green, first at
  987749dff3 and re-run at the final tip d757d7423f (the full-suite step
  green including the formerly inherited pair, the browser step green for
  the first time). tsc clean and biome errors zero on every touched file
  throughout; ci:changed clean.
- OPEN rulings surfaced again at QA start and close, no call received,
  nothing implemented against them: mounts-place + heroic difficulty
  (decide together), quest class-gate (wyrmcult_grand_robe), native-shell
  sourceStore, clears-0 provenance (due before Phase 17).

## Phase 16 (2026-08-08): Art: painted launcher icon + owned cell art

- Sync (ecdacc8769): merged origin/release/v0.36.0 (tip 4fe38b799d, 31
  commits: the bag sort PR 3128, the v0.35.1 back-merge, the nanoid pin,
  the tickPerf i18n fill). Conflicts resolved: parity pins 308/79/229
  (sortInventory joins pure release at 301, the reliquary facet stays +7),
  command schema 192/205 (inv_sort send + dispatch), the
  NOT_A_LANGUAGE_GATE floor to 8 (both sides added a row: the reliquary
  tracker lastChip and the bags lastSortBaseline), pending.ts regenerated
  via i18n:build. The release-merge-audit (fresh agent) returned CLEAN:
  both-sides files merged with both intents intact, no legacy arms, the
  new inv_sort/set_helm commands corpus-covered, no injection-seam or
  db-mock drift, and the chrome pipeline byte-untouched. Two premise
  notes: tests/chrome_icons.test.ts gained 'sort' in SECONDARY_CONTROLS
  and ui_icons.ts gained the 'sort' glyph. i18n:scan refreshed the
  LOCAL-ONLY status registry (gitignored) after the sync's new keys.
- Launcher art (dc49aa721b): both entries already carried
  data-icon="crown", so the whole change is public/ui/chrome/crown.webp
  plus the CHROME_ART_IDS row, the mapping.json row, and a membership pin
  in tests/chrome_icons.test.ts (guards A-E all pass; SECONDARY_CONTROLS
  untouched). No image-generation key is available in this environment
  (the Gemini key has zero image quota), so the icon is authored in-repo:
  a layered SVG to the directory's shared art direction (sibling-palette
  sampled: gold #e8c858 family, bronze, cream, near-black outline,
  top-left light), rendered onto the magenta key by
  scripts/assets/chrome_crown/render_source.mjs and encoded by the normal
  assets:chrome converter. Judged against the committed siblings at 128px
  and 24px on contact sheets before shipping (DESIGN.md: procedural only
  at the painted bar). mapping.json's directory-level source line now
  says "except where an entry names its own source" and the crown row
  carries its own provenance; CREDITS.md row amended the same way;
  scripts/assets/CLAUDE.md names chrome_crown/ as the one sanctioned 2D
  exception in the GLB pipeline directory.
- Cell art (2412654f3b): new pure resolver src/ui/reliquary_cell_art.ts
  (UI_PURE_CORES + BARE_NAMED + EXPECTED_BARE_NAMED), descriptor union
  {item|url|crest} with null = keep the old fallback. Mounts route
  mountItemId to the reins ItemDef and out through deps.itemIcon (cell ==
  bag, 9/9 painted 3D head renders); skins route armorySkinArt behind a
  WEAPON_SKINS membership gate (29/29 store thumbnails); titles route
  deedCrestId (total: painted crest or display-category crest; the 7
  crest-pending title deeds render their category crest, never the
  ghost); marks route the masterwork seal, prof_<craft> art, or
  gather_<profession> art via the newly exported (and now frozen)
  FIELD_NOTE_PROFESSIONS; gather_event:perfect_specimen (corpse harvest,
  no committed art BY DESIGN) gets the authored specimen-flask SVG data
  URL (percent-encoded, apostrophe-free so it survives esc(), marker id
  woc-specimen-glyph). The window is a thin consumer emitting the shared
  itemIconImgHtml shape (extracted from unknownItemIconHtml) so the
  .item-icon CSS keeps sizing and silhouetting all art; crestIconSrc
  carries the never-a-throw swallow. Missing weapon-skin cells get a
  grayscale(1) brightness(0.45) carve-out (their card art is OPAQUE, the
  item treatment reads as a black tile); declaration-level pin in
  tests/reliquary_window.test.ts.
- Tests: tests/reliquary_cell_art.test.ts (25). The acceptance sweep
  drives all 245 catalog relics through the resolver and forbids null
  (anti-vacuity floor + all-five-kinds arm), per-kind literal pins with
  content premises asserted first, negative and prototype-key arms per
  table-backed kind, a file-existence sweep over every emitted URL
  family, five window-level arms on the real ReliquaryWindow (happy-dom),
  the recent-chip shared-path arm (mark chip == grid cell byte-identical),
  and the mount-rarity vs reins-quality agreement pin. Three scratch
  mutants proved the pins redden (mount arm nulled: 5 red; titles forced
  per-deed: 3 red; specimen arm deleted: 3 red).
- Reviews, all fresh agents: architecture-reviewer PASS (0/0/2: both
  nice-to-haves applied: FIELD_NOTE_PROFESSIONS frozen,
  SPECIMEN_PROFESSIONS stays-private comment); frontend-seam-reviewer
  PASS (0 blocking, 5 should-fix, 6 nice-to-have, ALL applied except two
  recorded calls below): the icons.ts crest-exclusivity comment now names
  the Reliquary, the stale local slot type replaced by the resolver's
  exported ReliquaryArtSlot, the window's bare ITEMS index now
  knownItemDef, the SVG literal carries the no-apostrophe rule, the ui
  CLAUDE.md bullet header names the module, and the sim comment drops its
  ui path.
- Recorded calls (not built, deliberate): (a) the 29 armory thumbnails
  are 512px painted into 48-56px cells; the cost that matters is DECODE
  memory (about 30 MB of decoded RGBA for the one shelf; transfer is
  325 KB), and it duplicates the identical peak the Armory store window
  already pays with the same 29 files rather than creating a new one; a
  128px derivative set stays an option if the weight ever matters,
  recorded rather than duplicating 29 assets now. (b) The new test file's window rig drives one Sim-shaped stub
  only; the facet types pin reliquaryRecent/reliquaryMarks to identical
  shapes in both hosts and the dual-host source pin lives in
  tests/reliquary_window.test.ts, so a second stub shape would assert
  nothing new.
- Validation: tsc clean throughout; the affected suites
  (reliquary_cell_art, reliquary_window, reliquary_window_behavior,
  architecture, chrome_icons, reliquary_content, i18n_status_registry,
  styles quartet, weapon_skins) 358 green post-fix-round; ci:changed
  exit 0; agent-side sweeps: 19 reliquary suites + adjacent guards + seam
  guards all green (1175 tests across the three groups).
- Screenshots: docs/screenshots/reliquary-phase16/ before/after pairs
  (desktop mounts, titles, skins, gallery; mobile mounts; the launcher
  rail and the mobile More tray from the change-aware picker). Ownership
  seeded through the real dev-command path (/dev mounts; 170 /dev give
  discoveries firing col_discovery_150 and, at 24 relics, the rank-2
  bridge deed, so the titles page shows BOTH owned-crest tiers). The
  capture rig tops up the chat token bucket between gives (burst 8,
  refill 2/s throttles a scripted give loop; TS privacy is compile-time
  only).
- OPEN rulings surfaced at phase start, no call received, nothing
  implemented against them: mounts-place + heroic difficulty (decide
  together; would change the mounts page source LINES, not this phase's
  cell art), quest class-gate (wyrmcult_grand_robe), native-shell
  sourceStore, clears-0 provenance (due before Phase 17), compact-tier
  minimap/clock collision over the tracker chip, drift-drain banner raw
  page id.
- Phase-brief corrections for the record: Horizons mounts are 9 (not
  12), non-item Horizons slots are 74 (post-warfare growth), and there
  is NO unknown-ghost marker class (the ghost is which SRC resolves plus
  state CSS), so the acceptance pin asserts art descriptors and URLs
  instead. The per-kind resolver extraction rule was checked and NOT
  triggered for reliquaryRelicPageId/PageIndex (2 production call sites
  each, not 3).
- QA gate (qa-checklist, fresh agent): READY, zero blocking, 2 should-fix
  + 4 nice-to-have, every finding applied in the reviewed fix round: the
  two execution-coverage arms (the window's crest branch driven through a
  painted title on horizons_titles, and a weapon-skin cell asserted to
  MATCH the missing-state carve-out selector, joining the CSS pin to real
  markup), cellQuality upgraded to each table's canonical resolver
  (knownItemDef / mountDef / ownEntry, matching cellIconHtml), the
  icons.ts comment re-wrapped, a crown.svg-to-crown.webp sha256 lockstep
  pin in chrome_icons (with the re-render recipe in the comment; the SVG
  also gained a title element for biome's error-tier noSvgWithoutTitle,
  which surfaced when the source file became tracked), and the armory
  weight note reframed to decode memory. The QA's VERIFY items: the full
  gate ran green after the fix (below); mobile evidence is the committed
  3x screenshots; perf:tour and the deeper mobile E2E belong to the
  Phase 16 QA session.
- Gate: node scripts/gate_select.mjs PASS, all 8 steps green (full-suite
  fallback mode: 2364 files / 33031 tests passed, 2 expected fails, the
  browser step 16 files / 110 tests, typecheck and all five builds
  clean). One red on the first run: biome's noSvgWithoutTitle on the
  newly committed crown.svg (untracked files are invisible to
  ci:changed, so the pre-commit manual run could not see it); fixed with
  the title element and the gate re-ran fully green.
- Coverage audit (test-coverage-auditor, fresh agent, centered on the QA
  fix round): PASS, zero blocking, 3 should-fix + 7 nice-to-have, all
  applied in a second reviewed round: the CSS-to-markup join is now BY
  CONSTRUCTION (the skin arm reads the carve-out selector out of the live
  components.css and feeds it to img.matches, so the two pins cannot
  drift independently), the cellQuality arms gained rung pins (skin img
  q-uncommon; mount CELL frame q-epic, distinct from the reins img rung),
  the mountDef comment now states accurately that it is NOT own-property
  gated and why that is harmless, the crest-pending title list is DERIVED
  from deedImageUrl with a floor (self-maintaining as commissioned art
  lands), the titles-shelf totality arm pins every cell paints an img
  (making the crestIconSrc swallow explicit), the specimen glyph gained a
  sha256 byte pin, the mount-agreement arm asserts the reins def exists
  before comparing, FIELD_NOTE_PROFESSIONS's freeze is pinned, and the
  crown is tied to the mm-reliquary / mobile-reliquary buttons in both
  entry documents (guard D only proves SOME placeholder). The lockstep
  concern resolved cleanly: re-running render_source.mjs + assets:chrome
  from the titled SVG reproduces the committed webp BYTE-IDENTICALLY
  (sharp is deterministic; the title element does not raster), so the
  pinned pair is genuinely produced from the pinned source and no hash
  moved.

## Phase 16 QA (2026-08-08): Verify launcher + cell art

- Pre-flight: HEAD a4537e14e9, clean, 7 ahead of the remote tip 86d9dafe70,
  exactly as the Phase 16 close recorded. Open rulings surfaced at start and
  close, none decided this session: mounts-place + heroic difficulty
  (together), quest class-gate (wyrmcult_grand_robe), native-shell
  sourceStore, clears-0 provenance (due before Phase 17 ships obtain
  counts), compact-tier minimap/clock collision, drift-drain banner raw wire
  page id.
- Second sync merge 75dca4ba7c (origin/release/v0.36.0 tip 6ed4d7e12c,
  incoming 400 files: gate-perf test trims, bespoke mob anim clips, KTX2
  atlases, character-sheet playtime, the IP-safe honor title recut).
  Conflict resolution: parity pins to 309/80/229 (playtimeSeconds joins the
  pure-release 302), delta keys to 68 (both sides added one: ptime and
  reliq), plural bases merge the playtime trio beside the reliquary trio,
  online.ts keeps the reliq self-decode block and adds the ptime mirror,
  pending.ts + translation_keys regenerated via i18n:gen. Post-merge drift
  fixes: 984c938c24 (release playtime test rig lacked the branch's
  openReliquary dep; tsc caught it), 8467a8b6a1 (guide regen: the recut
  renamed three honor titles to Linebreaker / Fieldreaver / Warcrowned and
  the branch-generated GUIDE_RELIQUARY still carried the old names).
- release-merge-audit (7-dimension workflow, 777k tokens): one blocking
  (the guide regen above), bare_client playtimeSeconds mirror, the
  release's dangling deeds.ts comment fragment (applied), doc anchor rot
  (state.md parity row, wire/hud line offsets, phase-17 addItem offsets:
  all de-rotted to symbol anchors). Cleared: sim/server/ui overlaps read
  against both parents with nothing dropped, deed ids and crest derivation
  unaffected by the recut (names only), parity/goldens/i18n bundles clean.
  cross-platform-sync over the merge: PASS, zero should-fix; notes
  recorded: RL env supplies no calendar (pre-existing arm), playtime
  precision differs per host by design (snapshots pin renders them
  identically), ReliquaryFirstFind / ReliquaryFirstFindView dual naming.
- Visual QA on a warm dev server (fresh vite on 127.0.0.1:5203, pixels not
  DOM, rect + elementFromPoint gates, overlays cleared per shot): launcher
  crown verified in the desktop rail beside its siblings and in the mobile
  More tray at 3x; contact sheet vs siblings at 128px and 24px on dark and
  light plates (style-coherent, silhouette legible; the crown vs the Ranks
  podium-crown at tray size ruled distinct enough). Every kind verified in
  BOTH states: mounts 9/9 owned via /dev mounts (reins art, Illuminated
  badge) and missing (dark silhouettes); skins 29/29 owned (staged through
  accountCosmetics.weaponSkinIds; full-color cards) and missing (grayscale
  carve-out, weapon shapes legible at 34px mobile cells); titles owned
  (six painted crests staged through the deed surfaces) and missing;
  marks 6/6 owned and missing; field notes 4/4 owned including the
  authored specimen flask (reads as a flask at cell size beside its three
  borrowed-profession neighbors); a Conquerors item page missing state
  (dark-card item ghosts read correctly).
- The QA round's real find: the missing-state carve-out was keyed on the
  weapon_skin kind literal, and the seven category-fallback title crests
  (deed_cat_* procedural composites, opaque by construction) rendered as
  flat tinted tiles, confirmed on pixels. Fixed across three reviewed
  rounds (7af2ca97f5, 4dfa89db66, 3ec72deab8): the window stamps
  data-cell-art="opaque" from the resolver's own family answer
  (reliquaryCellArtOpaque: Armory prefix for urls, painted-art MEMBERSHIP
  via deedCrestHasPaintedArt for crests, so a bespoke crest whose art
  trails also rides it), the CSS keys on the attribute, and forced-colors
  drops the filters plus gains a dashed missing cue (box-shadow, the owned
  ring, is stripped there), verified at runtime via a CDP emulated-media
  probe (filters none, border dashed).
- Premise pins the fix round added: the per-family opacity premise read
  off the shipped WebP headers (professions + painted deed crests all
  alpha; Armory all opaque; helper shared in tests/helpers/webp_header.ts,
  which also fixed chrome_icons' VP8L alpha read that masked a height
  bit); every catalogued item relic must resolve to a committed dark-card
  pipeline (items webp or weapons jpg), so the first procedural item relic
  reds instead of landing on the wrong filter. ACCEPTED GAP, recorded: the
  item family is exempt from the opacity attribute because both of its
  committed pipelines are dark-card (weapons jpgs measured mean luma
  ~25/255) and 643 of 698 item webps carry no alpha, so an alpha rule
  cannot express the real premise (bright vs dark backgrounds); an item-art
  restyle to bright cards would need the predicate extended, and only the
  premise sweep would notice. A review claim that 13 Conquerors weapons
  composite procedurally was REFUTED with the file open: all 13 resolve
  through ITEM_WEAPON_VARIANTS to /ui/weapons rendered thumbnails.
- Reviewer rounds (all findings applied or recorded, none silently
  dropped): frontend-seam on the phase (0 blocking / 4 should-fix / 9
  nice-to-have), qa-checklist READY (1 should-fix: this record), fix-round
  frontend-seam (0 blocking / 6 should-fix / 8 nice-to-have; the
  procedural-crest and item-family generalizations above came from it),
  test-coverage-auditor on the fix round (PASS with one blocking test gap:
  the forced-colors pin was not decisive; closed content-bound), plus a
  fresh coverage pass over the closing round. bareClient's "mirrors every
  class-field default" claim is now ENFORCED
  (tests/bare_client_defaults.test.ts); the sweep surfaced 28 accreted
  fields beyond playtimeSeconds, all mirrored, 69 consuming suites green.
- Deferred VERIFY items executed: npm run perf:tour desktop + mobile
  (swiftshader, both viewports): skip rates 0.984 / 0.982 vs the 0.96
  floor, desktop hudHotDomWrites 602 within the 640 anchor; mobile 695
  EXCEEDS the 640 anchor. Phase 16 adds no per-frame surface (cold window,
  hud_perf_budget green), so this reads as accumulated growth across
  releases plus low-tier variance under software GL; FOLLOW-UP for the
  Phase 17 perf phase: attribute and either shed writes or re-capture the
  anchor on the baseline machine. FCT pool cap-bounded at the low tier.
  scripts/mobile_*.mjs: tray overflow OK (22 buttons, all reachable, the
  Reliquary row among them); hud overlap audit green on the surfaces this
  packet touches, 4 violations in the chat keyboard-dock family and
  cluster check 9 violations on mobile-autorun visibility, BOTH inherited:
  the branch diff over the whole packet touches neither the keyboard
  applier nor the autorun control (screenshots aside), recorded here
  rather than silently re-pinned.
- Evidence: docs/screenshots/reliquary-phase16/ gains the mobile skins and
  titles missing states at 3x, the field-notes page, a forced-colors
  record shot, and re-shot titles-desktop (seeded at 2x so it pairs with
  its before again; the earlier Phase 16 claim that the titles page shows
  both owned-crest tiers holds in the re-shot frame) and mounts-mobile
  (full window; the prior capture clipped the grid at the fold).
  Capture-scale note: the new mobile shots are 932x430 at 3x.
- Validation at the tip: tsc clean; the reliquary/deeds/chrome suites, the
  conflict-pin suites, and all 69 bareClient consumers green
  (1173 tests); node scripts/gate_select.mjs run with TURBO_FORCE=1 (the
  turbo i18n input-list fix has not merged to this branch; a warm shared
  cache can replay stale bundles) - result recorded below after the run.
- Gate: node scripts/gate_select.mjs (TURBO_FORCE=1) FAILED at the
  changed-files biome step on src/render/characters/manifest.ts, a
  release-side format diff: biome's --changed set diffs vs origin/main
  (stale while main trails the release train), so the whole release delta
  enters the local checked set. The file is byte-identical to
  origin/release/v0.36.0 (INHERITED, local-only scope noise; the PR-tier
  CI classifies changed files against the release base and never sees
  it). Per the first-fail-masks-later-steps rule the remaining steps ran
  by hand behind the carried red: full vitest 2386 files / 33200 tests
  passed (zero failures, bounded workers), tsc clean, browser
  regressions and all builds green (recorded below). Targeted biome over
  every file this QA touched: zero errors.
- Round 4 (9ff0374203) applied the fresh coverage audit of rounds 2-3:
  the bareClient sweep moved to a TypeScript AST scrape (the regex was
  blind by shape to callback-typed and multi-line annotations; three on*
  callback fields were genuinely missing and are mirrored now), value
  assertions for simple-literal defaults with the fixture's three
  documented deliberate divergences excepted, the forced-colors pin
  binds both selectors to the declaration inside the sliced block
  (mutation-verified: dropping either selector, the declaration, the
  dashed cue, or hoisting the rules out all red), bespoke-pending and
  no-prefix crest literals, per-pipeline floors on the item sweep, and
  an ITEM-kind grid/strip byte-identity arm through the new
  default-parameter path.

## Phase 17 (2026-08-08): Per-relic obtain counts + wire/serialize perf

- Step 0: pre-flight clean at 7980a41ce6, in sync with the remote; the
  release tip e5c16ca398 was already contained (the Phase 16 QA
  catch-up merge covered it), so no sync merge was needed this phase.
  Containment re-verified before commit.
- THREE MAINTAINER RULINGS obtained and executed this phase (all
  2026-08-08):
  1. clears-0 provenance (open since Phase 12): OMIT AT ZERO. A first
     find whose crediting clear meter reads zero lands sparse (no
     clears key); the restore sanitizer floors then drops sub-1 values
     so old saves converge. The recorded-ruling tripwire test was
     rewritten to pin the new behavior, with a contrast arm proving a
     turned-over meter still stamps.
  2. Obtain-count seam: WORLD-SOURCED ONLY. Loot, corpse harvest,
     gather, fish, craft, salvage, quest rewards, conjures, instance
     and delve and rift awards, and currency purchases count;
     player-to-player transfers (trade, mail, market buy/cancel/
     collect via the grantCopies funnel) and internal relocations
     (enchant re-mint x2, unbind peel, commission-order return, mech
     chroma unequip on both host arms, adminRestoreItem, the PBE boost
     kit) never count. Discovery is UNCHANGED everywhere: only the
     tally and the clears provenance stamp are movement-gated.
  3. Buyback: MOVEMENT (supersedes the phase file's literal grant-path
     list). The sim-diff review proved sell-then-buyback is
     copper-neutral and infinitely repeatable, so the phase-file lock
     would have made the tally freely inflatable by one player alone,
     the exact reading the two-player pass-around ban exists to
     prevent. Buyback discovery still fires and now carries movement
     provenance via a direct module import of markItemDiscovered
     (BUYBACK_MOVEMENT), keeping the SimContext seam opts-free per the
     Phase 10 decision.
- Decided within delegation, recorded: the heroicOf walk. noteRelicObtain
  mirrors markItemDiscovered's walk (depth cap 3) and increments every
  catalogued id it visits, closing the 63-of-135 gap where heroic
  drops filled the base page but never moved its tally. No heroic id
  is itself catalogued (pinned), so exactly one id scores per chain
  today. A movement heroic grant still counts nothing (pinned).
- Built (sim + wire): ReliquaryState.counts (sparse, catalogued relic
  item ids, cap RELIQUARY_OBTAIN_COUNT_CAP 1e9), incremented per COPY
  at the two grant hubs (eight catalogued specimen relics ARE
  stackable, so per-call and per-copy differ; the split is pinned in
  tests/reliquary_content.test.ts); movement?: boolean on both hub
  opts bags, threaded at every relocation site with a one-line why
  each; retro join seed never increments (asserted); the tally writes
  an empty firstFind carrier entry so pre-Reliquary veterans accrue
  entries on re-obtain (the majority production case: their ids are
  already on the itemsDiscovered ledger, so the first-find hook can
  never fire for them). pageId removed end to end (interface, write
  site, serialize, restore, the view's hinted arm and both call
  sites); serialize folds count onto the first-find entry ({clears?,
  count?}), no new top-level key, no new wire delta key (68 holds).
  Wire build memoized: reliquaryWireJson (renamed from
  reliquaryWireBlob, which the phase file still names) behind two
  WeakMaps keyed on state identity (rev + cache; no state-shape
  leakage into saves or goldens, no cross-test reset needed), bumped
  by all four public writers, served via maybeRaw in server/game.ts
  (maybeSerialized is invisible to the ALL_DELTA_KEYS scraper, a
  briefed-call correction). Ownership snapshot hoisted to one build
  per fill chain with evaluation points preserved exactly (the
  Explore pass corrected arch note 9: it was 2 to 3 rebuilds per
  fill, not 3 to 4, but each copied bags plus bank via ownedMounts,
  and the join seed multiplied the chain per seeded id).
- Built (ui + docs): IWorld facet member reliquaryObtainCounts (data;
  parity pins 310/81/229, facet map 33); ClientWorld mirror +
  bareClient fixture default; tooltip line on owned cells via the
  plural base hudChrome.plurals.reliquaryObtainedTimes ("Obtained
  {count} time/times", English genuinely inflects) rendered in BOTH
  owned branches (body and the item early-return), absent count =
  no line (the transfer/unknown-provenance arm, pinned); aria carries
  whole-sentence bases (reliquaryCellOwnedObtainedAria,
  reliquaryCellOwnedClearsObtainedAria) with the clear number in a
  separate {clears} slot so tPlural selects on the count that
  inflects; five non-Latin fills in-change (M16), 15 Latin locales
  pending (Phase 22 worklist); the refresh signature gained a twelfth
  dimension (reliquaryObtainCountsDigest, size + sum fold) so an open
  window repaints on a tally tick (pinned through the real
  refreshIfChanged path). docs/design/reliquary.md: obtain-count
  glossary row, the sanctioned counts-only block under deliberately
  deferred (per-drop history stays deferred), the memoized wire-thrift
  row, and the obtain-counts cost row in PRODUCTION-ABSOLUTE framing.
- Measured (db reviewer method, re-verified independently two ways
  that agree within 4 bytes): production-absolute cost of the whole
  Reliquary key on a worst-case veteran row is about +1,772 stored
  bytes (+17 percent) under pglz, rewritten every 30 s per online
  session; raw size about 15 percent below the pre-fix branch shape
  (cheaper detoast for the seq-scan readers). Intra-branch: counts
  cost 371 stored bytes where dropping pageId and zero-clears stamps
  saved 881 (why the fold beat a sibling map). pglz confirmed as the
  production algorithm (no compose override).
- Reviews: five, ALL PASS, ZERO blocking anywhere. (1) architecture
  coverage on the implementation round (7 should-fix, all adjudicated:
  two became maintainer rulings above, the rest applied); (2) fresh
  architecture on the fix round (3 should-fix, applied in round 2;
  draw stream proven byte-identical at every sampled tick); (3)
  cross-platform-sync (2 should-fix, applied: the mutation-scope scan
  guard in tests/architecture.test.ts, and the buyback impossibility
  comment falsified by guild-bank withdrawals, fixed by the
  BUYBACK_MOVEMENT provenance); (4) database-performance (the
  production-absolute framing correction above, plus the save-cadence
  pin extension); (5) migration-safety (legacy-blob round-trip
  composition pin, orphan-count serialize trap pin, Array.isArray
  entry guard, all applied). Both fix rounds were fresh-reviewed or
  reviewer-derived; nothing self-certified.
- 60 parity goldens regenerated ONCE (cause recorded in
  tests/parity/CLAUDE.md: reliquary.counts is a new persisted
  PlayerMeta field, the enchantCastBagSlot precedent); zero changed
  lines touch rng.draws, rng.digest, or events, verified
  independently by three parties (implementer, both architecture
  passes). The fix rounds added no further golden churn (verified,
  not assumed).
- Recorded observations, no action: catalog churn now destroys
  tallies along with provenance (restore drops uncatalogued ids; no
  down-migration; inherent, joins the Phase 22 release-notes rider
  class); tallies ride the 30 s autosave (a hard crash loses up to
  30 s of ticks, correct for a cosmetic counter); guild-bank
  withdrawal never fires discovery (pre-existing gap, predates this
  phase, now named in the buyback comment); dropping pageId is a
  one-way migration (a multi-page relic's recent-strip jump target
  can change for pre-reorder finds; the fallback answers from the
  catalog, byte-identical except after a page retirement); counts key
  insertion order differs live vs restored (obtain order vs sorted;
  same pre-existing property as firstFind; matters only if a future
  parity scenario digests live meta across a save/restore); every
  world-sourced obtain now re-ships the whole reliq blob to that one
  client on the next heavy tick (cadence sized: 1/90 specimen rate,
  boss rarity elsewhere; a few KB per player per tens of minutes);
  commission crafting credits the crafter's mint and not the
  requester's movement-flagged delivery (service semantics, kept);
  craft outputs COUNT (world-sourced, materials consumed so the loop
  is not free, unlike buyback; phase-file lock kept); the delve Marks
  shop sells four catalogued relics and those purchases count
  (currency earned in the world; named in the facet doc); the offline
  /dev kit deliberately diverges from the movement-flagged PBE boost
  (dev-gated, DevKitApplyCtx.addItem carries no opts; seed policy
  recorded as server-boost-only).
- Phase 16 QA follow-up EXECUTED (the mobile write anchor): re-measured
  on the finished Phase 17 tree with a fresh vite on an unused port,
  mobile viewport, swiftshader: hudHotDomWrites 695, skip rate 0.983,
  byte-for-byte the Phase 16 QA measurement and inside the 696-698
  release-tip band, so the phase adds zero writes and the growth is
  release-owned. Anchor re-captured 640 to 706 in
  tests/hud_perf_budget.baseline.md (worst healthy capture 698, same
  8-write headroom discipline as the original 632-to-640 row) with the
  inherited cause stated in the row per the re-pin policy;
  tests/hud_perf_budget.test.ts green against it. The same-machine
  branch-vs-tip pairing the frontend reviewer asked for EXISTS and is
  the attribution's evidence: the Phase 16 QA ran both sides on this
  machine the same day (branch 695-696 vs clean release tip 696-698,
  byte-identical write sets, recorded in its ARM 3 record above), and
  the Phase 17 re-measure (695) is on the finished phase tree, at or
  below the tip band. The raise loosens no branch-attributable budget. The sibling
  base-owned overage (desktop frameLong50 14-17 vs 12 under load) is
  NOT this phase's delegation and stays surfaced upstream, unre-pinned.
  The tour's prewarm startup-budget overrun (15.0 s vs 5 s) is the
  known swiftshader-under-load artifact, not a phase signal.
- Validation on the combined tree: tsc clean; the 13-suite joint run
  (architecture, reliquary_state, reliquary_wire, world_api_parity,
  snapshots, env_protocol, reliquary_view, reliquary_window,
  reliquary_window_behavior, reliquary_content, localization_fixes,
  hud_perf_budget, bare_client_defaults) 1178 passed, zero failures;
  Agent A's adjacent sweeps (commission, enchanting, market, mail,
  deeds, sim, parity and more) green. ci:changed: this phase's 33
  changed files carry ZERO biome errors; the run's single error is the
  recorded inherited release-delta scope noise
  (src/render/characters/manifest.ts, byte-identical to the release
  tip; CI's base-scoped biome is green; Phase 16 QA disposition
  unchanged). gate_select (TURBO_FORCE=1) on the uncommitted tree
  stopped at i18n freshness, the documented committed-tree
  requirement (the regenerated bundles ARE the working-tree copies;
  the diff it printed is exactly this phase's new keys vs HEAD);
  re-run after the commits, result recorded below.
- Completion reviews (passes six and seven) and the closing fix round:
  qa-checklist verdict READY, zero blocking (its should-fix, the stale
  three-vs-two maybeRaw scraper comment, applied; nits applied: the
  duplicate snapshot-fixture meter assignment removed, the
  predicate-swap premise pinned as a non-empty-page-list content test
  rather than the vacuous predicate-vs-index self-comparison it warned
  toward, the design doc's bare catalog literal dated to v0.36.0).
  frontend-seam-reviewer PASS, zero blocking (applied: {count} means
  the CLEAR number in two legacy keys and the OBTAIN count in the
  three new bases, now guarded by catalog comments; the digest jsdoc
  equal-cardinality overclaim reworded; the behavior-stub type
  narrowed to drop the retired pageId; its write-anchor evidence ask
  was already satisfied by the recorded same-machine pairing, clause
  added above). test-coverage-auditor: one blocking on the NEW scan
  guard itself (the write regex missed compound assignment, increment,
  ??=, .length =, Object.assign, and prefix spellings; widened with
  firing AND sparing self-test arms, the alias limitation named in a
  comment) plus applied should-fixes and nits: string/NaN count
  sanitizer fixtures (block grown to twelve with the floor moved),
  the cap pinned to the 1e9 literal, the trade test grown an
  INSTANCED-arm relic (grantOffer's second movement flag was
  untested), the scan-floor comment made honest (raised to 500 with
  the .some() arms credited), a same-seed counts arm on the
  determinism pin, the PBE bagged-loop premise asserted, the sheet
  probe quoted ('"count"' so accountId-class fields cannot false-red
  it), and the combined aria base's singular leaf pinned through t()
  on the leaf. All re-validated green after application.
- Commit cadence deviation, recorded: the phase file prescribed
  separate feat and perf commits, but the perf hunks (pageId removal,
  memo, hoist) interleave with the feature in the same files
  (reliquary.ts, game.ts, reliquary_view.ts), so a hunk-level split
  risked broken intermediate commits; the perf work rides the feat
  commit with its body naming it, and the docs and anchor re-capture
  commit separately.
- reliquaryWireBlob was renamed reliquaryWireJson in the diff; the
  phase file's starter prompt still names the old symbol (historical
  record, left as written).
- End-of-phase sync: the base moved DURING the phase (as the brief
  warned), so after the four phase commits a second merge landed the
  new tip 81804a179e (merge 221ac9e81a: the wiki round-two accuracy
  pass, PR 3160). The merge touched ZERO branch-owned files (no
  release-merge-audit owed), tsc stayed clean, wiki:content
  regenerated to a no-diff tree, and the release's NEW
  guide_key_coverage guard is green against this phase's catalog keys
  (101 guide tests). Containment re-verified.
- Final gate on the COMMITTED tree (TURBO_FORCE=1): the artifact
  regen, i18n freshness, and malware steps all PASS; the run stops at
  the changed-files biome step, the same recorded inherited
  stale-main scope noise as Phase 16 QA (this branch's own authored
  files are biome-clean; CI's base-scoped biome is unaffected). Every
  step masked behind that stop was run by hand green: npx tsc
  --noEmit clean, npm run build exit 0 (all five entries, generated
  artifacts fresh, no diff), and the FULL vitest suite at the gate's
  own worker bound: 2388 files passed, 33261 tests passed, zero
  failures (the anim_pipeline_hunter_ghost pair that was red at the
  old tip is green here: PR 3111's fix is in the base). Phase 17 QA
  should expect the same lone biome stop and nothing else.

## Phase 17 QA (2026-08-08): Verify obtain counts + wire/serialize perf

- Step 0: pre-flight clean at eea4282716 (six local commits over the pushed
  7980a41ce6, by design; QA owns the push). The base had moved again: merged
  origin/release/v0.36.0 tip 4d52f151eb (merge 1759aaa174; PR 3161 client
  perf: render prewarm, point-light budget, hitch forensics, crowd benches,
  plus a release-side biome format of src/render/characters/manifest.ts).
  The incoming delta touched ZERO branch-owned files (intersection empty, no
  release-merge-audit owed), wiki:content regenerated to a no-diff tree, tsc
  clean, containment re-verified before work and again before the push.
- Real-run acceptance (the depth code review could not verify), five rigs,
  ALL GREEN (rig transcripts in the session; scripts were session-scratch
  under tmp/, not committed):
  - OFFLINE (fresh vite on an unused port, low preset, swiftshader):
    /dev give cryptbone_helm twice; facet reads 1 then 2; the Hollow Crypt
    cell is owned; tooltip renders "Obtained 2 times"; the cell aria reads
    the whole sentence "Cryptbone Helm, catalogued, obtained 2 times"; the
    executed clears-0 ruling is visible live (zero-meter dev grant, no
    clears line). 8/8 checks.
  - ONLINE (server on :8787 with ALLOW_DEV_COMMANDS=1, fresh account,
    ClientWorld not Sim): dev_give twice over the wire; facet 1 then 2;
    tooltip and aria identical to offline. WIRE THRIFT proven end to end
    with a page-level WebSocket frame counter: exactly one reliq-bearing
    frame at login sync, ZERO reliq frames across a 12 s quiet window (238
    other frames flowed) and a 10 s post-grant quiet window, and exactly one
    reliq frame per grant. This also empirically confirms the loot-event
    dirty chain the cross-platform reviewer traced. 10/10 checks.
  - PRE-PACKET BLOB on the live server path: planted the legacy shape
    (pageId present, clears: 0, no counts) into the dev DB character row,
    logged in through the real restore: loads clean, counts empty, the
    entry survives with clears dropped by the sanitizer, recent resolves
    from the catalog with pageId ignored, the owned cell renders the
    absent-count arm (no Obtained line, no clears line), zero page errors.
    11/11 checks.
  - MEMO on the real module (tsx over src/sim/reliquary.ts): 1000 quiet
    reads return the same cache record with ZERO JSON.stringify work; a
    public-writer mutation invalidates exactly once and the rebuilt blob
    carries the new count. All green.
  - MOBILE landscape (844x390, coarse pointer, real CDP touch tap): the
    shared tooltip opens via touch, "Obtained 2 times" renders, #tooltip
    max-width 280px is honored (actual width 142.5px), no horizontal
    overflow, fully inside the viewport. The chat keyboard-dock (4) and
    mobile-autorun (9) failure families stay inherited-and-recorded; not
    re-run. 11/11 checks.
- Screenshots committed under docs/screenshots/reliquary-phase17 (desktop
  window + tooltip, mobile landscape window + tooltip, online tooltip
  closeup), captured at the low preset with entry overlays dismissed.
- Reviews: five fresh passes on the immutable phase range plus an Explore
  diff map. ALL PASS / READY, ZERO blocking anywhere: architecture (rng
  neutrality re-proven from the goldens: zero draws/events lines moved),
  cross-platform-sync (fold/unfold symmetry, delta-key discipline, movement
  classification re-derived independently), migration-safety (executed the
  real restore under tsx, rollback simulated against the previous release's
  code, hostile inputs beyond the fixtures), test-coverage-auditor (1380
  targeted tests run, per-claim verdict table), qa-checklist (READY,
  conditional on the write-anchor re-measure below and the quest-fallback
  pin, both closed this session).
- perf:tour mobile re-run on the CURRENT head (the qa-checklist condition:
  the release merge is render-heavy and postdates the 028a480697 anchor
  re-pin): hudHotDomWrites 689, inside the 706 anchor and BELOW the
  recorded 695-698 same-machine band, so the anchor holds and the release
  perf work if anything shed writes. The prewarm startup overrun (16.4 s vs
  5 s) and frameLong50 14 match the recorded swiftshader-under-load
  artifacts (15.0 s and 14-17 at close-out); not new signals.
- QA fix round, TWO batches, both fresh-reviewed before commit (fresh
  architecture agent: PASS, its 2 should-fix + 7 nits all applied; fresh
  test-coverage agent: its one blocking was independently found and fixed
  by this session's OWN mutation probe before the report landed, and its
  5 should-fix + applicable nits all applied). The mutation story, recorded
  because it changed the shipped comments: the first gate-ON wire pin was
  vacuous TWICE over (the staggered-refresh slot at a frozen tickCount, and
  the real mask: onInventoryChangedForQuests bumps meta.wireRev on EVERY
  inventory mutation, so the wireRev arm of heavyDue re-ships a tally
  change with `loot` gone from HEAVY_SELF_EVENTS; production never degrades
  to the 2 s backstop, the original review premise was incomplete). The
  shipped test steps off the stagger slot AND neutralizes the wireRev arm,
  isolating the loot arm; removing `loot` from HEAVY_SELF_EVENTS now reds
  it, proven by mutation both directions, and the comments name the
  redundancy honestly. Fix-round contents:
  - tests/reliquary_state.test.ts: bank round trip + bag move +
    partial-stack split non-increment pin (the phase file's stopping rule,
    previously unpinned; every leg carries a post-condition, the reorder
    arm pinning the stack's CELL since the move writes InvSlot.slot, never
    array order); trade INSTANCED-arm payload premise (signer survives the
    handover); mech-chroma content premise arming the latent movement pins
    (no chroma plate is catalogued); quest-fallback content pin (no
    requiredItem is catalogued; the re-grant is movement-shaped without a
    flag, the unbind-peel pattern); ownership-snapshot liveness as
    reference identity AND as behavior (the all-mark professions_field_notes
    page illuminates on its last noteReliquaryMark fill, the emit a
    defensive copy would kill); wire-JSON equality plus a LITERAL byte pin
    (which also pins the sorted restore key order); a 13th hostile fixture
    (count: null, the on-disk spelling of NaN/Infinity corruption,
    documentary per the auditor).
  - tests/reliquary_wire.test.ts: the decisive gate-ON loot-arm pin
    described above (stagger dodge + wireRev neutralization + the gate
    premise assert); the gate-forced arm's comment corrected (it claimed
    no event marks the session dirty, which misstated production).
  - tests/reliquary_content.test.ts: no copper vendor and no disenchant
    yield (both tables + the two weapon fallbacks) stocks a catalogued
    relic, with floors that also pin the swept values as REAL item ids so
    a table reshape cannot make the sweep silently vacuous.
  - tests/delve_shop.test.ts: the currency-vendor POSITIVE arm (a Marks
    purchase of deacon_reliquary_helm counts 1 then 2 through the real buy
    path, with the granted count asserted both legs) plus the facet doc's
    four-id claim as an EXACT set equality over all delve-shop stock.
  - tests/architecture.test.ts: the mutation-scope guard walk now includes
    headless/ (membership pinned on the real env_server.ts, floor comment
    made exact), and a caller-set pin holds noteRelicObtain to exactly the
    two hub arms with the call TEXT pinned (movement gate + per-copy count
    arg), scanning ALL of src/ plus server/ plus headless/ so a caller in
    ClientWorld or the UI is one import away from redding it; the aliased
    import limitation and the owner-exclusion dependency are stated.
  - Behavior-neutral source edits (the fresh architecture pass verified
    neutrality line by line): the pageId tolerance note now says the
    one-release clock never started in production (feature-branch and PBE
    rows only); the malformed JSDoc line in noteRelicObtain fixed; the
    SimContext.markItemDiscovered note records that the opts-carrying path
    is the deeds module function, the seam member has no production caller
    left, and the two deeds.test.ts arms are its only exercisers;
    server/pbe_boost.ts names dev_give as the third dev-family arm;
    sim.ts's mech-chroma unequip uses the shared MOVEMENT_GRANT const, and
    both grant hubs (plus their SimContext mirrors) type their opts bags
    Readonly so the shared const cannot be poisoned in-hub.
  - Docs: the design doc's obtain-counts cost row now states its
    distribution sensitivity (an independent QA model with every entry
    stamped and multi-digit tallies lands nearer +2,460 stored bytes; size
    write amplification against 2.5 KB, components reproduce to the byte);
    src/sim/CLAUDE.md's mechanic recipe states the identity-keyed WeakMap
    memo conditions under which a module-global cache is sanctioned.
- Recorded, no action (with the reviewer rationale): the digest int32 fold
  can wrap at the 1e9 cap (unreachable live, documented in source); the
  30 s tally loss window on hard crash (correct for a cosmetic counter,
  contrasted with the GM-restore durable save); the offline getter returns
  the live counts record where ClientWorld swaps per snapshot (known
  offline-IWorld asymmetry, safe because the window recomputes the digest
  per poll); character_sheet pays a full restore to read marks (negligible,
  and the sheet's '"count"' leak pin is in place); reliquaryWireCacheProbe
  stays a documented test-only export; the obtainedLineHtml compute in the
  discarded plain-body branch for ItemDef relics (cold path, dead work
  only); the cap literal pin lives one it-block away from the clamp
  fixtures (same file, reds on a retune either way).
- SURFACED for the maintainer, not acted on: the guild-bank withdrawal
  discovery gap (moveBetweenContainers never touches the ledger; predates
  the packet, now named in the buyback comment; self-heals at next login
  via seedItemDiscovery) deserves an explicit decision at some point.
- Open rulings surfaced at start and close, nothing implemented against
  them: mounts-place + heroic-difficulty line shape (decide together),
  wyrm class-gated quest hint, sourceStore native copy, compact-tier
  minimap/clock collision, drift-drain banner raw wire page id. None was
  due this phase.
- Gate on the committed tree (TURBO_FORCE=1): PASS, ALL 8 STEPS GREEN, exit 0,
  the first fully green in-gate run of the packet. The recorded inherited
  changed-files biome stop is RETIRED: the release tip biome-formatted
  src/render/characters/manifest.ts (5716b0cd6f) and the sync merge made
  the branch copy byte-identical, so ci:changed now passes (warnings only,
  the non-gating pre-existing class). That unmasked the steps behind it for
  their first in-gate execution this packet (the gate-select
  first-fail-masks lesson, closing cleanly): the FULL vitest suite ran
  inside the gate (the planner fell back to full on the release-delta
  scope: 2392 files passed, 33350 tests passed, 2 expected-fail, 108
  skipped, workers 8; up from 33261 at close-out with the release's and
  this QA's new tests), the browser-regressions step ran green (16 files,
  110 tests), i18n + wiki + SFX artifacts fresh on the committed tree,
  malware scan clean, tsc + env/server/bot builds + the client bundle all
  green.
- Verdict: PASS. Every acceptance criterion verified on real runs, zero
  blocking findings across seven fresh review passes, the fix round
  mutation-proven, the gate fully green in-gate, pushed to
  origin/feature/reliquary (PR 2976). Handoff: Phase 18 (rewards ladder)
  starts from a pushed, fully green tree; sync origin/release/v0.36.0 at
  Step 0 as always.

## Phase 18 (2026-08-08): Rewards ladder

- Step 0: pre-flight clean at 885dbaf9d2, in sync with origin/feature/reliquary
  (the Phase 17 QA pushed). The release base had NOT moved since the QA merge
  (origin/release/v0.36.0 still 4d52f151eb, already contained), so no sync
  merge was needed; containment re-verified before work and again before the
  commits. Memory scan: test-pin traps index, QA-gap-vs-ruling, S3 scanner
  blindness, M16 wordy fills, shared-worktree care.
- Context load: two parallel Explore agents (sim/content/tests and
  server/platform) instead of one; both returned dense seam maps that the
  implementation specs were written from.
- Execution: two sequential implementation agents (A: content + sim, B:
  server + platform + client line), each on a full spec with every design
  decision pre-made in the orchestrator; the fix round was done by the
  orchestrator directly.
- Self-reference tie-break (the phase's first stopping rule): resolved
  WITHOUT a maintainer ask. col_reliquary_complete on the titles page is a
  genuine deadlock (its own title grows total past reach before the grant);
  the other four titles have no feedback into their own triggers and joined
  RELIQUARY_HORIZON_TITLES. The marquee reuses the deed fan-out shape (an
  id-only SocialEvent/SimEvent sibling of deedBroadcast), so the second
  stopping rule never fired either.
- Spec conflict discovered and resolved: the phase file (authored Aug 5)
  predates the 13b QA engineering-mark pend (Aug 7), and the capstone's
  owned === total is unearnable in production while THREE slots stay
  owner-pended (masterwork:engineering, reins_drakemaw_raptor,
  reins_terrorspark_groundshaker). Authored as specified (forward-correct,
  derived check, no code change needed at un-pend), surfaced to the
  maintainer in state.md.
- Reviews, round 1 (five fresh agents on the uncommitted diff:
  architecture, cross-platform-sync, migration-safety,
  privacy-security-review, qa-checklist): ONE real BLOCKING, found by
  architecture and independently ranked the sole NOT-READY cause by
  qa-checklist: col_reliquary_complete, as a plain collection deed, entered
  BOOK_COMPLETE_REQUIREMENTS and would have dead-ended feat_book_complete
  for every player (the exact failure the retroFallbackGrants stranded-heal
  doctrine names). Fix: feat: true on the capstone (the catalog's ONE
  off-prefix feat; the biconditional pin gained a named, commented
  exception), a feat_book_complete reachability pin (capstone OUT, the four
  earnable ladder deeds IN), and the frozen deed SHA re-baselined for its
  REAL double cause (five appended deeds AND the book-meta trigger change
  the hash correctly caught). Every reviewer should-fix applied: ownership
  snapshot threading at all five multi-sync sites (two reviewers flagged the
  eager double scans), the conquerors gate on the whole-catalog walk, the
  border-deed-set literal pin (a public-surface class widening is now a
  reviewed act), the all-four-border-cards arm, the hud fallback rendered
  through text nodes (structurally inert to the chat token parser,
  hostile-token pinned), byte-equality and catalog-churn fixed-point arms,
  the multi-page-single-fill pin, the real serializeCharacter -> addPlayer
  round-trip arm, once-per-durable-record docstrings, the Horizons no-emit
  exemption note, the wire-ballast ruling (the set stays on the wire blob
  because wire shape IS save shape; ClientWorld drops it, commented on both
  sides), the stale guard-test title, and the rollback fourth-category note.
- Review findings REFUTED with the source (recorded so QA does not
  re-raise): (1) migration's titles-page re-marquee scenario cannot occur:
  horizons_titles never reaches emitReliquaryUnlock (title grants sync deeds
  without an unlock emit), so no marquee can ever fire for it; the sweep
  records it at a later join, a recording delay only. (2) qa-checklist's ru
  present-tense drift: the ru deedBroadcast line uses the same present-tense
  gender-avoidance construction; the fill matches the precedent and joins
  the flagged native-speaker release pass. (3) privacy's
  retroFallbackGrants-gating concern: sim.ts calls it unconditionally on
  every world join (verified at the call site).
- Accepted costs, recorded with rationale: the duplicate getDeedBroadcasts
  read when one fill illuminates AND grants a deed (once-per-page-lifetime
  cardinality, max 28 events per character ever, not worth a cache); no
  forced save on illumination (the design doc's "never save because a
  silhouette filled" rule is the ruling; once per durable record is the
  honest contract and is documented); the flagship pages produce BOTH a deed
  marquee and an illumination marquee in the same tick (each once-ever, the
  two biggest moments in the ladder).
- Reviews, round 2 (fresh architecture agent over the fix round only):
  PASS, zero blocking. Its two should-fix landed (the conquerors-shelf
  shape pin including the no-pending-conquerors-slot arm, and the SHA
  comment's direction corrected to gained-four-did-not-gain-the-capstone
  after the reviewer reproduced BOTH hashes by catalog reconstruction);
  applicable nits landed (syncIlluminatedPages converted off the eager
  default, the grant-order literal pin ahead of the positional slice, the
  production-caller note). Its N5 (DEED_NAME_TOKEN in a character name
  could mint an extra link node, theoretical, pre-existing with
  deedBroadcast) is recorded here, not acted on.
- Parity goldens: verified byte-identical after regen (the empty Set is
  inert to the parity canonicalization exactly like marks, UNLIKE the
  Phase 17 counts Record which stamped {} everywhere); no regen commit
  exists, deliberately.
- The Whole Book difficulty note for the owner: the four earnable ladder
  deeds joined BOOK_COMPLETE_REQUIREMENTS, so feat_book_complete now
  requires the whole Conquerors shelf and the three flagship Illuminations.
  Earnable (no conquerors slot is pended, now pinned), but a real
  escalation; the capstone stays out by feat flag.
- Validation at close: tsc clean; ci:changed errors-free; the phase suite
  (architecture, reliquary_state/_content/_wire/_view/_window/_sheet_view/
  _cell_art, deeds_content/_completion/_view, deed_i18n/_icons/
  _records_table, discord_activity_professions, social_system, steam/epic
  maps, snapshots, env_protocol, world_api_parity, localization_fixes,
  deed_unlock_chat_link, hud_perf_budget, profile_page, guide,
  missing_painted_icons_wave, deeds, parity) all green; the one known red
  is the guide git-diff freshness arm, which goes green at commit. Copy
  scan clean (no dashes, emojis, .only, debugger).
- LOCAL ONLY per the runner prompt: committed, never pushed; Phase 18 QA
  owns the gate-on-committed-tree run and the push.
- Gate on the committed tree (TURBO_FORCE=1): first run FAILED at the full
  vitest step with three real finds the targeted suites could not see (the
  first run's exit code was also masked by a grep pipe in the runner, the
  recorded background-gate lesson firing again; the failure was caught by
  reading the log): tests/warfare_titles.test.ts pinned the honor ladder as
  DEED_ORDER's absolute tail, displaced by the five appended deeds
  (re-pinned as the contiguous slice at its release point), and
  tests/gather_rare_events.test.ts's stub meta lacked deedsEarned, which
  the mark path's unconditional completion sync now reads (the stub gained
  the empty Map; the sim keeps no defensive guard since real PlayerMeta
  always carries it). Fix commit efe93ee206, then a clean re-run: PASS,
  ALL 8 STEPS GREEN, exit 0 unmasked; full suite 33389 passed in-gate (2
  expected fail, 108 skipped, workers 8, up from 33350 at the Phase 17
  push), browser regressions 16 files 111 tests green, i18n + wiki + SFX
  artifacts fresh, malware scan clean, tsc + env/server/bot builds + the
  client bundle green.
- The release base moved mid-phase (PR 2974, mobile Seeker rewards layout):
  synced with merge b2c79558cc after the four phase commits; the delta
  touched zero branch-owned files (no release-merge-audit owed) and its
  mobile/styles suites pass on the merged tree.
- Phase tip after the gate: efe93ee206 (four feature/docs commits, the sync
  merge, and the gate-found pin fix). LOCAL ONLY; Phase 18 QA owns the push.

## Phase 18 QA (2026-08-08): Verify rewards ladder

- Step 0: pre-flight clean at 7465e3c9da, seven first-parent commits ahead
  of origin/feature/reliquary (LOCAL as handed off; this QA owns the push).
  origin/release/v0.36.0 (1478f9d2ba) still contained at start; the base
  moved MID-QA and was re-synced after the fix commit (below). Memory scan:
  test-pin traps index, mutation-check rules (prove tests ran, restore by
  edit), the background-gate pipe lesson, the reviewer-nudge pattern.
- Step 1: one Explore agent mapped the immutable range 885dbaf9d2..7465e3c9da
  (76 phase-authored files; three release-sync-only files excluded) and
  pre-flagged six assertion-quality leads, handed to the coverage auditor
  as leads, not conclusions.
- Mutation checks (quiet tree, before the fan-out, both restored by edit,
  suite green after): (A) col_reliquary_conquerors renown 0 to 5 failed
  exactly the 3145 sum pin and the frozen catalog SHA (33 passed, 2 failed:
  the suite provably ran); (B) removing the capstone's feat: true failed
  the SHA, the feat biconditional, AND the capstone reachability pin: the
  real guard against the Book dead-end bites.
- Step 2, six fresh reviewers in parallel on the immutable range, prompted
  for coverage with the settled refutations listed as do-not-re-raise:
  architecture (0 blocking; parity draw-order digest green UNCHANGED
  against the pre-phase baseline; verified the self-reference math and the
  snapshot threading; found the mount re-acquisition hole and the
  non-fail-closed dispatch else), cross-platform-sync (0 blocking; two
  stale docblocks contradicting the new fan-out; verified three-host
  parity, retro silence on all three families, no per-relic path, the
  reconnect anti-repeat), migration-safety (0 blocking; probed the restore
  with ten hostile shapes, verified the rollback story against the OLD
  serializer via git show, found the reachable marks-restore throw on the
  public character-sheet route), privacy-security (0 blocking; verified
  authority, per-earner consent on all three arms, bidirectional block
  filters, injection inertness, parameterized SQL; surfaced the real
  Discord card payload and the border-class widening), test-coverage (ONE
  BLOCKING: the retroFallbackGrants join seam was deletable-green;
  confirmed the feat_book_complete derivation pin is a constant
  self-comparison whose real guard is the reachability pin), qa-checklist
  (READY; independently REPRODUCED the pre-phase catalog SHA by
  reconstruction, proving the re-baseline hides exactly the two documented
  changes and nothing else).
- Fix round (commit 1e72b8d6d0, 13 files), every finding applied or
  explicitly recorded: THREE behavioral lines (the completion-deed dispatch
  fails closed on unpaired ids; restoreReliquaryState marks gained the
  sibling Array.isArray guard, closing a reachable 500 through the public
  character-sheet route; RELIQUARY_ILLUMINATION_DEED_PAGES exported for the
  dispatch-lockstep pin), THIRTEEN new tests (the two REAL-join seam pins
  and the mount-last arm each mutation-checked deletable-red; the mixed
  candidate sweep naming the SECOND page; the dispatch-lockstep data pin;
  corrupt-marks and boxed-String hostile arms; the ClientWorld decode-drop
  pin with a sibling-mark premise arm; the honor-ladder re-anchor via
  indexOf; the stub deedsEarned retype; the Epic-vs-Steam launch-set
  parity pin; six duplicate it renames; tsc-only tautology notes on both
  structural twins plus a runtime key-shape arm; rendered-English literal
  pins on BOTH chat lines; the pid-undefined and no-session fan-out arms
  with contrast re-fires; an end-to-end retro JOIN drive through
  server.join proving the retro gate on the real seed pass), and the
  comment corrections (the retro flag buys exactly THREE things now that
  the illumination fan-out exists; the grant-order rationale states what
  the tests actually pin; the eager-default claims rewritten to the real
  placement constraint; the completionist steady state qualified while the
  capstone is pended; the two-pages edge named reachable on shipped
  content; the crash-window halves named correlated; the blob worst case
  quantified; the join sweep's permanent forward consequence documented;
  per-level snapshot sharing stated honestly; both server wire comments
  enumerate four keys and the fan-out caveat).
- Fresh fix-round review (a seventh reviewer plus two verification
  subagents over the uncommitted diff): READY TO COMMIT after its two
  should-fix landed (the shelf-read comment states the pinned guarantees
  are weaker than item-only; the decode-drop premise arm decodes a sibling
  mark instead of asserting a default-initialized field). Judgment call
  recorded: the Epic-vs-Steam toEqual pin STAYS despite being implied by
  the two full-literal pins today, reworded as the launch-set lockstep
  check whose scoping or retirement is the reviewed act when a deliberate
  storefront-specific achievement ships (D21 independence).
- Recorded rather than coded, with rationale, in state.md: the portal
  deploy-order constraint (batch poisoning, outage-wire blast radius,
  reconcile cadence, the ACH_RELIQUARY_COMPLETE hold, the first-login
  retro-wave mechanism), the real Discord border-card payload and the
  border-class widening for release notes, the storefront mirror as a
  consent-ungated publication surface, the mount reins re-acquisition gap
  (family of the recorded guild-bank twin), the Collection-shelf
  unreachable denominator and the overview-vs-capstone denominator gap,
  and the corrected mixed-fleet rollback rendering claim (invisible in the
  owner's Book; raw-id only in guild chat on a stale client).
- The release base moved mid-QA: synced with merge 9f0eab8786 (PR 3162,
  item copy addressing) after the fix commit; the release-merge-audit ran
  (the delta overlaps server/game.ts, src/net/online.ts, src/ui/hud.ts):
  both parents' intent verified present in all three, no legacy-arm
  divergence, no new routes or corpus rows owed, no stale injection
  bindings, no db-mock trap in the four new release tests, no planning
  premise invalidated; post-merge tsc clean and 890 tests green across
  both sides' suites.
- Gate on the committed tree at 9f0eab8786 (TURBO_FORCE=1, run bare in the
  background, log read, exit 0 unmasked): PASS, ALL 8 STEPS GREEN. The
  planner fell back to the full suite (broad change): 33469 passed, 2
  expected fail, 108 skipped across 2396 files (up from 33389 at the phase
  gate); browser regressions 16 files 111 tests green; i18n + wiki + SFX
  artifacts fresh; malware scan clean; changed-files biome clean; tsc +
  env/server/bot builds + the client bundle green.
- Verdict: PASS. Pushed to origin/feature/reliquary at QA close (the docs
  commit recording this entry is the pushed tip); CI on PR 2976 babysat
  from there.

## Phase 19 (2026-08-09): Borders in-world (nameplates + portraits)

- Step 0: pre-flight clean at 0a68865b73 (in sync with origin, CI green);
  origin/release/v0.36.0 (8340aa4a05) already contained via the Phase 18
  QA merge, no sync owed at start. Memory scan: nameplate will-change
  raster trap, canvas text-restyle cost, view-model order contract,
  test-pin trap catalog, screenshot low-preset rule.
- Step 1: one Explore agent mapped the activeTitle recipe end to end
  (sim state, setter, wire, facet, parity pin format), the nameplate
  raster mechanism (one canvas, TextSpriteCache, the devOutline accent
  precedent), and the unit_frame view-model/painter pair (the named
  unit_portrait pair turned out to be geometry+blit; the frame pair owns
  the seam); remaining anchors gathered by hand.
- Step 2, three implementation agents on a fixed cross-agent contract:
  A (sim+wire) landed activeBorder end to end with two recipe gaps found
  and fixed (baseEntity init, the bare_client fixture guard) and 15/15
  mutation checks; B (render) landed the palette pure core, the canvas
  cartouche baked into the tier-cadenced resolveContent pass, and the
  write-elided portrait ring with zero perf-budget grants; C (ui) landed
  the two-group picker, worn badge, wear hint surfaces, rank-5 copy
  derived from the ladder, M16 fills, and extended the wiring to
  play.html (an index-only edit would have hidden the ring online).
- Step 3: six fresh reviewers in parallel, prompted for coverage, ZERO
  BLOCKING across all six. Fix round 1 (13 items): the shared cosmetic op
  guard closing the identity-rewire amplification, the measured ring
  concentricity fix (2.83px off the disc center), the CSS fairness arm,
  reach pins, the exact-once palette scan (orchestrator ruling: unique
  hexes instead of a collision allowlist), the blob-growth ternary+IIFE
  scrape forms, hasOwn hardening (which turned real at buildDeedUnlockPlan:
  a prototype-keyed unlock event survived the bare index), hostile-shape
  load pins, the border unlock hint, guide prose truth-up, picker heading
  a11y. Fresh fix-round review found 5 should-fix + 10 nits; round 2
  applied all 15 (h3 heading family, armed-fixture floor for the blob
  sweep, stale Latin rewardsBody fills dropped to pending, comment
  truth-ups); its verification found ONE regression (two never-reworded
  rewardsHeading fills swept away with the stale ones), restored verbatim
  and verified. 45+ mutation checks across the rounds, all restored by
  edit.
- Screenshots: docs/screenshots/reliquary-phase19, 15 PNGs, before/after,
  desktop + mobile landscape, lowest preset; the two player-frame afters
  re-captured after the concentricity fix.
- Step 4: five commits (feat sim/net/render/ui + docs screenshots), then
  the base moved a THIRD time; sync merge 76e4abb05d brought 2a10e0f621
  (perf diagnostics, gear-set loadouts, three.js patch via
  patchedDependencies, auto-attack white-damage fix). Conflicts: two
  parity goldens (both sides re-recorded) and generated pending.ts
  (regenerated). The release-side goldens predate this branch's reliquary
  meta surface, so all three moved goldens were REMINTED on the merged
  tree (089e2788da); diff verified as exactly the reliquary block
  returning plus the auto-attack state hashes. pnpm install re-run for
  the three patch; three release-side files carried format diffs under
  the pinned biome and were normalized (c41d83a896).
- Release-merge audit (three legs, all clean on mechanisms): no new
  routes/commands collide; db-mock trap clean; no legacy-arm divergence;
  planning-premise legs surfaced six DOC corrections, all applied in this
  entry's commit (the retired +17 percent row-share figure, the stale
  hunter-ghost expected-red record, the parity anchor, the offline
  idleMobTickRadius determinism note, the phase-file line anchor, this
  status). Two RELEASE-side observations recorded in state.md for the
  maintainer (loadoutGearResult vs HEAVY_SELF_EVENTS; unmetered
  switchLoadout as an identity-rewire sibling).
- Gate on the committed tree at c41d83a896 (TURBO_FORCE=1, bare, log
  read, exit 0 unmasked): PASS, ALL 8 STEPS GREEN. Full suite fallback
  (broad change): 33663 passed, 2 expected fail, 108 skipped across 2417
  files; browser regressions 16 files 111 tests; i18n + wiki + SFX fresh;
  malware scan clean; changed-files biome green (the earlier local red
  was origin/main scope noise plus the three normalized release files);
  tsc + env/server/bot builds + client bundle green.
- Acceptance criteria: (1) second-client wire visibility + local portrait
  ring pinned end to end in tests/snapshots.test.ts and the painter
  suites, screenshots committed; (2) unearned and cross-kind slugs
  rejected server-side, pinned at both the sim validator and the dispatch
  spy; (3) no per-frame raster or invalidation cost (no sprite, no cache
  key, emote-anchor byte-identical, pinned) and the accent identity is
  tier-invariant (path scan + CSS arm), with the ring's decorative bloom
  on the repo-wide fx-shadow convention recorded as a judgment in the
  fairness doc.
- LOCAL ONLY per the runner prompt: committed, never pushed; Phase 19 QA
  owns the push after its PASS.

## Phase 19 QA (2026-08-09): Verify borders in-world (PASS-WITH-FOLLOWUPS)

- Step 0: pre-flight found HEAD at e25f5608ca clean, but the base had moved
  a FOURTH time during Phase 19 (origin/release/v0.36.0 2a10e0f621 ->
  5819c005a7: the gate-perf CI batch, warrior intervene + fear DR, the
  cc-band family, bg queue confirm + talent respec, three anim clips,
  admin/guild cache perf, the shareable-card reflow). Merged it as
  4e6092128b: conflicts were the two parity goldens both sides re-recorded
  (release side taken, reminted at 91c3c8e1bc on the merged tree; the diff
  moves exactly the reliquary block returning plus the state hashes the
  warrior/fear work shifted), generated pending.ts (regenerated via
  i18n:build), and four count pins each side had bumped alone. The pins
  were resolved by RUNNING the suites, never by diff arithmetic: commands
  194 send / 207 dispatch (deed_set_border plus bg_respond), hud drives
  window 46 / chrome 76 / none 16 and module 24, IWorld 313 (82 data / 231
  methods, bgRespond joining), ALL_DELTA_KEYS 85 (the release's 16 static
  combat scalars plus reliq and aborder). Full parity suite green post-remint.
- Release-merge audit (5 legs + adversarial verify, 13 agents): CLEAN on
  every code mechanism. All 9 both-sides-changed core files are a perfect
  textual union (tsc 0, parity 326/326, sim 52/52); the four hand-resolved
  count pins keep both sides and run green; no legacy-arm divergence, no new
  db-mock export gap, i18n overlap kept both sides' keys and did not
  resurrect the dropped stale fills. Only doc-staleness findings surfaced,
  all corrected in this record (the state.md Guards parity anchor to
  313/82/231 naming the sync's bgRespond, the header and line-270 sync
  references, the Phase 19 ledger totals, the phase-20 cache-seam pointers,
  and the "nine keys" -> eight correction).
- Step 1: one Explore agent mapped the four feat commits' authority, perf,
  parity, fairness, visual, and test surfaces with acceptance-criterion
  cross-checks.
- Step 2: eight fresh reviewers/legs in parallel (authority exploit,
  architecture, cross-platform-sync, frontend-seam, perf, qa-checklist,
  parity, plus the release-merge workflow), prompted for coverage. ZERO
  blocking across all. Authority proved all 8 exploit paths fail closed
  server-side and mutation-proved three of them decisive against a mutated
  dispatch. Perf re-confirmed nameplates are not re-implicated (+31 canvas
  ops per bordered plate, bounded/constant, no allocation, no raster, no
  layer, no new timer). Parity confirmed offline/online identity, reconnect,
  and old-save null-safety, running the pinned suites (688 tests).
- Step 3 fixes (one latent code defect, the rest hardening; all mutation-
  checked, restored by editing back on the shared tree):
  - grantDeed (src/sim/deeds.ts) gained the Object.hasOwn(DEEDS, deedId)
    guard the two cosmetic setters already carry. Without it a prototype
    key resolved def = Object.prototype (truthy, past `!def`), then ran
    `renown += undefined` (NaN, and it seeds the SQL sort index) and added
    a non-string legacy value to unlockedMilestones. Latent (no caller
    passes a non-content id today), fixed at the source with a decisive
    test; recomputeRenown given the same guard for module consistency; the
    setActiveTitle hasOwn comment trued up (the reward-kind check already
    refuses a bare prototype key, so the guard's real value is against
    Object.prototype pollution introduced elsewhere).
  - Pinned the Sim.activeBorder getter VALUE (a getter wired to
    primary.activeTitle passed every field-level assertion; distinct ids
    make it decisive), mutation-checked both directions.
  - Three CSS/TS fairness-decisiveness hardenings in
    tests/deed_border_accent.test.ts: the level-chip (z-index 3) and
    combat-flash (z-index 4) siblings pinned in the ordering test; a
    negative scan for any data-fx-level selector targeting the ring
    (nesting-robust); a windowed tier-token scan around the two hud.ts
    borderSlug assignments (the ACCENT_PATH scan cannot include hud.ts).
    Both new guards verified non-vacuous against synthetic regressions.
  - paintPortraitBorder now gates the data-border attribute on the palette:
    a drifted/uncolorable slug writes '' (not the raw slug), so the CSS
    :not([data-border=""]) gate stays closed and no transparent ::after box
    paints, matching the nameplate's borderless early-return.
  - Object.freeze on the BORDER_ACCENTS records (Readonly is compile-time
    only; both surfaces hand the same record to canvas + CSS, so a stray
    runtime write would silently repaint every plate and ring of that slug).
  - Permanent authority pins in tests/snapshots.test.ts: the redirect path
    (no message field can retarget the write off session.pid, safe today
    only by a single binding), object/array/boolean/absent payload shapes
    via the real dispatch, the cosmetic drop-cause metric on a bucket
    refusal, and the broadened no-sprite pin cycling all four slugs. Plus
    the col_reliquary_rank_5 earn-and-wear arm the acceptance criterion
    names. A comment ceiling added on BORDER_ACCENT_PAD_TOP vs the marker
    row geometry.
  - Fresh fix-round review (test-coverage-auditor + a code reviewer):
    see the verdicts below.
- Deferred should-fix: the character-sheet worn-badge staleness (recorded
  in state.md, routed to Phase 20; pre-existing title-line pattern, live
  surfaces show truth, correct fix needs a signature-driven cold-window
  refresh). Release-side observations recorded for the maintainer (the
  jailed bg_respond cage-escape from PR #3127, the stale copper comment,
  the 30/s identity-amplification through other identityFields commands).
- Gate: TURBO_FORCE=1 node scripts/gate_select.mjs on the committed tree
  (see the final record line for the tip and result).
