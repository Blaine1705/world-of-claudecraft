# State: Reliquary Perfection Packet

Current phase: 13 QA complete and pushed; next: 13b (phase-13b-source-coverage.md,
plain xhigh, fresh session). Update this line as phases complete.

## Locked decisions (record once, reference forever)
- Hidden deeds are OUT of the Reliquary catalog entirely (maintainer, 2026-08-05).
  Titles page = every NON-hidden title-reward deed (33 today).
- No weapon-skin reward at rank 5 (maintainer, 2026-08-05).
- Delivery: extend PR #2976; after each QA PASS, `git push origin HEAD:feature/reliquary`
  (never force). Local branch: `feature/reliquary-perfection` in
  `/Users/fernando/Documents/wocc-reliquary-review`. The maintainer's `wocc-reliquary`
  worktree owns the local `feature/reliquary` ref: never check it out or mutate it.
- Per-relic obtain counts supersede the design doc's per-drop-history deferral in the
  counts-only form (Phase 17 updates docs/design/reliquary.md in the same change).
- Retro policy: join-seeded fills are silent (no banner, no sound, no recent push, no
  clears stamp; a single localized summary line like the deeds retroSummary); rank
  bridge deeds granted during join carry `{retro: true}` so the server never fans out.
- Reward doctrine stands: cosmetic only, Renown 0 on every reliquary-sourced deed, luck
  never scores Renown, no pity/drop-rate/power. Anti-proposals stay vetoed.
- Re-pin policy: a seed or golden re-pin must state its real cause in the adjacent
  comment. "Inherited red from release/v0.35.0" is a valid cause and must be named as
  such; "feature-branch world-gen shift" is disproven and must not reappear.

## Non-negotiable constraints
- Determinism: all sim randomness via Rng; no Math.random / Date.now / performance.now
  in src/sim/ (guard: tests/architecture.test.ts).
- IWorld-first: new render/ui data lands on a facet under src/world_api/, implemented in
  BOTH Sim and ClientWorld, parity pin updated in the same change.
- Server authority: clients never decide outcomes; no client-writable reliquary state.
- i18n: every player-visible string is a t() key (English-only catalog additions; M16
  wordy values carry their five non-Latin fills; sim/server emit ids or matcher-covered
  English in the SAME change; S3 guard tests/localization_fixes.test.ts).
- Graphics tiers never gate information (owned/missing state, counts, clears are always
  real).
- Shared-tree commit care: explicit paths, staged-diff review, never git add -A.
- No em dashes, en dashes, emojis anywhere.

## Validation matrix by change type
- sim-only: npx tsc --noEmit; npx vitest run tests/architecture.test.ts
  tests/reliquary_state.test.ts + affected suites; determinism same-seed test.
- content-only: npx tsc --noEmit; npx vitest run tests/reliquary_content.test.ts
  tests/deeds_content.test.ts tests/guide.test.ts; npm run wiki:content when player-
  facing content changed (freshness-gated).
- wire/facet: npx vitest run tests/world_api_parity.test.ts tests/reliquary_wire.test.ts
  tests/snapshots.test.ts tests/env_protocol.test.ts.
- ui/styles: npx tsc --noEmit; npx vitest run tests/architecture.test.ts
  tests/hud_perf_budget.test.ts tests/reliquary_window.test.ts tests/reliquary_view.test.ts
  + styles suites (styles_extraction, css_corpus, mobile_window_transform,
  focus_visible_guard); tests/localization_fixes.test.ts when text changed; a mobile
  screenshot script for visual changes.
- server: affected server suites; npx tsc --noEmit; npm run build:server if the bundle
  surface changed.
- any code change: npm run ci:changed (Biome floor).
- pre-push (every QA phase): node scripts/gate_select.mjs. Packet close (22 QA):
  npm run gate.

## Key file anchors (from the shipped feature)
- Catalog: src/sim/content/reliquary.ts (pages, RELIQUARY_HORIZON_TITLES,
  RELIQUARY_ITEM_TO_PAGES). Runtime: src/sim/reliquary.ts (state, onItemDiscovered,
  noteReliquaryMark, CURATOR_RANK_DEFS, syncCuratorRankDeeds, pushRecent, serialize/
  restore). Discovery hub: src/sim/deeds.ts markItemDiscovered (:531) +
  seedItemDiscovery (:1089). Facet: src/world_api/reliquary.ts (7 members).
- Wire: server/game.ts maybe('reliq', ...) ~:8467, HEAVY_SELF_EVENTS ~:749, retro
  fan-out gate ~:8655; client mirror src/net/online.ts ~:3435-3442, completion reads
  ~:4863-4875.
- UI: src/ui/reliquary_view.ts (pure core, UI_PURE_CORES), src/ui/reliquary_window.ts
  (cold painter, COLD_PAINTER_ALLOWANCES, reflowAllow scrollTop x2),
  src/ui/reliquary_sheet_view.ts, hud wiring src/ui/hud.ts (handleReliquaryUnlocks
  ~:13205, progression block ~:15817, border badge row ~:15788).
- Server sheet: server/character_sheet.ts (SheetReliquary, CURATOR_RANK_ENGLISH),
  server/profile_page.ts (:149-155, :214-215).
- Deeds exemplars: src/ui/deeds_window.ts (openWithDeed), src/ui/hud/chat/
  deed_chat_line.ts (clickable chat), deed tracker painter + #deed-tracker, deed_i18n.ts
  (content-name localization pattern), DEED_IMAGE_IDS (crest art).
- Guards: tests/architecture.test.ts (UI_PURE_CORES x3 lists), tests/
  hud_perf_budget.test.ts, tests/world_api_parity.test.ts (306/79/227, facet 33),
  tests/guide.test.ts hidden-deed needles (the three hiddenDeedProse guards).

## Surfaces added by this packet (append per phase as they land)
- Phase 10: reliquaryUnlock gained retro?: boolean (emitted only when true; client-only
  presentation flag, self-scoped event, no server fan-out exists for it). New i18n key
  hudChrome.reliquary.retroSummary (English catalog + the five non-Latin M16 fills;
  ja uses the full-width colon; SUPERSEDED in Phase 11 by the
  hudChrome.plurals.reliquaryRetroSummary base, the ja colon note now lives on its
  four leaves). Titles page is 33 relics (hidden deeds excluded
  structurally); derived totals are catalog 212 / character-scoped 183; NO literal
  total pins exist anywhere, the suites derive them (the phase's cascade step was a
  no-op, recorded so later phases do not hunt; SUPERSEDED in Phase 12: three omitted
  instance drops added, totals now 216 / 187 and literal-pinned in
  tests/reliquary_content.test.ts). markItemDiscovered gained trailing
  opts {retro?: boolean} (module function only; the SimContext seam signature
  deliberately does NOT carry it). The masterwork visited namespace is registered;
  per-craft visits are gated on isCataloguedRelicMark. restoreReliquaryState recent
  restore matches pushRecent semantics (last occurrence wins, newest survive the cap).
  The W3 weapon-skin emit unification was REVERSED in review: three reviewers proved
  the SimContext accountWeaponSkinIds callback inert on every host and mis-keyed on
  primaryId; it was deleted, and the guard is now the single-kind-pages content pin in
  tests/reliquary_content.test.ts (a mixed page cannot ship silently; online W3 stays
  documented-open). Curator-rank note: removing hid_saul_footnote lowers the derived
  owned count by one for a hidden-deed holder (a threshold-sitter would display one
  rank lower); zero-impact today because the Reliquary is unreleased, bridge deeds are
  never revoked, and the titles page becomes completable for everyone else. Rollback
  note for release ops: a pre-Reliquary binary autosaving a rolled-forward character
  drops the reliquary key and the masterwork:* visits permanently (itemsDiscovered
  survives, so fill and rank recover; provenance and recent do not).
- Phase 10 QA (2026-08-05): fix round applied 1 blocking (Biome format diff in
  tests/reliquary_state.test.ts), the emission pin (tests/reliquary_window.test.ts now
  pins this.log + combatAnnouncer.push of retroText inside the reliquary handler body,
  matching the deeds sibling), the masterwork header's real refill mechanism (restore
  filter asymmetry, not crash insurance), the golden re-record's adjacent provenance
  comment (tests/parity/scenarios.ts, which also records the one-commit bisect false
  red between the visit write and the re-record), Readonly retro opts, the deed_stat
  clear-source header line, the reliquaryUnlock retro doc de-ambiguation, a
  creation-disjoint content pin (no class starter kit id is a catalogued relic:
  creation runs the retro seed), a reload-emits-nothing event assertion, and
  comment-stripped craft source pins. DECIDED, not drift: the join summary line counts
  ITEM fills only; mark refills are silent AND uncounted (deeds.ts records it at the
  call site). DECIDED: ownedMounts stays strict; the join-abort blast radius was
  traced by three reviewers to zero partial-meta production callers, and strictness is
  the phase's own acceptance criterion. DEFERRED to Phase 11 (i18n hygiene): plural
  forms for BOTH retro summaries (reliquary AND deeds; "1 relics catalogued" /
  "1 deeds recorded") via tPlural + hudChrome.plurals leaves; both siblings move
  together or not at all (two reviewers, same call). Recorded observations, no action:
  the combatAnnouncer burst-collapse can supersede a live-find announcement in a
  mixed drain (documented combat_announcer behavior, deeds identical); retro events
  keep curatorRank/illuminatedPageId fields the client plan discards (uniform emit is
  the safer shape); a spectator session receives the spectated character's retro
  summary (pre-existing pid routing, near-unreachable, shared with deeds); every
  masterwork proc now dirties the visited deed key (bounded by the proc rate).
- Phase 11: Page-name localization channel: src/ui/reliquary_i18n.ts (deed_i18n clone:
  live getLanguage() resolution, lazy per-locale chunks, coalesced loader, pseudo-locale
  port, manifest) + src/ui/reliquary_i18n.locales/{ja_JP,ko_KR,ru_RU,zh_CN,zh_TW}.ts
  with all 28 page names filled. reliquaryPageName(pageId) falls back overlay -> catalog
  English -> raw id; reliquaryPageDesc (overlay -> catalog desc -> '') ships for
  Phase 13 with zero call sites. All four window render sites and both hud
  toast/banner interpolations resolve at paint time from pageId; view models keep raw
  English name fields (doc comments say never render directly; a painter-wide pin
  allows exactly one sanctioned .name read, the weapon-skin one). main.ts wiring
  mirrors the three deed hook sites (boot pin in tests/ios_entry_memory.test.ts is now
  a reflow-proof regex; the changeLanguage three-loader block is pinned in
  tests/language_fanout_registry.test.ts). NOTE for future tier work: the release-tier
  suite list is pinned in FOUR places (gate_steps.mjs, ci.yml, the literal array in
  tests/release_i18n_tier_coverage.test.ts, and any suite's own runIf); the fix round
  made the chunk NAME coverage unconditional at PR tier, so tests/reliquary_i18n.test.ts
  reads no tier flag and is deliberately NOT in the tier lists; a future tier-sensitive
  desc arm must re-add it to all three. Translation anchors: dungeon/delve/mob and
  itemSet entity names verbatim (glossary dungeonNames rule); heroic prefix reuses the
  deed dgn_*_heroic convention verbatim (ja/ko/ru ASCII colon, zh full-width); the two
  Nythraxis pages trim the arena noun off the entity name (zh anchors the committed
  raid noun); Mounts/Titles reuse hudChrome.mounts.title and deeds.titlesSection;
  Weapon Skins had NO committed key anywhere and was composed from the shipped Armory
  nouns (ja 武器スキン, ko 무기 스킨, ru Облики оружия, zh 武器外观/武器外觀); the three
  professions pages are anchored coinages (markFind masterwork/specimen nouns, guide
  rareHeading). pageStubNote is deleted end to end (catalog, five fills, negative pin,
  and ONLY the two comma-shared selector lines in components.css). Shelf terminology
  locked in scripts/i18n_glossary.json (reliquaryShelves row): Professions = the
  professions window title (hudChrome.professions.title), a recorded deviation from
  the phase parenthetical preferring guide.nav.professions, which would have broken
  existing ko/ru agreement (only the ja wiki shelf moved, 職業 -> 専門技能); Horizons =
  the metaphorical wiki reading (window nav moved in ja 地平, ko 지평, zh_CN 远景,
  zh_TW 遠景; ru untouched on both surfaces). Rider done: both retro summaries render
  via tPlural bases hudChrome.plurals.reliquaryRetroSummary/deedsRetroSummary, flat
  keys retired; the five non-Latin locales carry ALL FOUR leaves (the M16 guard forbids
  byte-identical wordy English in non-Latin resolved values, so the rider's
  leave-.one-pending applies only to Latin locales; the ru sentences are
  number-invariant colon-genitive forms, identical x4 is correct, mirroring
  secondsRemaining); the 13 Latin deeds locales carry few/many/other with .one pending
  for the Phase 22 release fill (pending.ts: 75 rows = 15 locales x (deeds .one + four
  reliquary leaves)). Both emission pins select on the NUMERIC argument (a
  formatted-string selection argument would collapse every locale onto .other).
  Loading tip reworded chord-free (no tip may name a keybind; the rotation has no
  interpolation seam) with its five non-Latin fills re-translated in the same change.
  Nav rail count renders through progressText. ACCEPTED divergence: the wiki keeps
  English page names (guide.ts policy comment updated); localization is window-side
  only. OBSERVED pre-existing inconsistencies, deliberately untouched (maintainer/QA
  call): ko ships two Nythraxis transliterations (니트락시스 overlay vs 나이트락시스
  deed/mob table), ja one stray ニスラクシス quest objective, ru Олдрен vs Алдрен and
  Торнпика vs Терновых высот; hudChrome.raidLockout.heroicName diverges from the deed
  heroic prefix in ja (ヒロイック: ASCII no-space) and zh_TW (ASCII colon);
  guide.nav.professions still uses a third term in ja/ko/ru (outside the phase's
  alignment surface list). Page descs and Latin page-name chunks = Phase 22 worklist.
  ja screenshot spot-check deferred to Phase 11 QA (the behavioral builder assertion
  in tests/reliquary_i18n.test.ts covers the acceptance criterion). Review round:
  frontend-seam + qa-checklist + test-coverage-auditor, zero behavioral blocking; one
  BLOCKING test gap (the hud reliquaryPageName routing was unpinned) and every
  should-fix/nit applied in the consolidated fix round (commit 5d83778ba8, 21 items,
  four mutation proofs), which also extracted the twice-copied pseudo-locale port
  into src/ui/i18n_pseudo_port.ts (shared by deed_i18n and reliquary_i18n, total
  drift pin over every en leaf vs the committed en_XA). DECLINED findings, with
  rulings: seeding the Latin deedsRetroSummary.one rows (conflicts with the Phase 10
  QA rider; see the OPEN item), deleting the unreachable few/many overlay rows (the
  shipped house style fills all four leaves, secondsRemaining precedent), and
  deduping the 28-page pin (it is the fill tripwire, now commented as such).
- Phase 11 QA (2026-08-06): release sync 0ed5a09b97 (deed union 263 deeds / 3060
  Renown, hash re-baselined; corpse fixtures to the release side; 21 both-side parity
  goldens re-minted from the merged tree; regen). Merge-drift fixes: pristine_claw
  appended to RELIQUARY_PROFESSION_SPECIMEN_ITEMS with a bidirectional pin against
  HARVEST_COMPONENT_SPECIMENS; guide.controls.reliquary row (Shift+X) with five
  non-Latin fills and a guide pin. QA fixes: makeLazyLocaleChannel extraction
  (src/ui/lazy_locale_channel.ts) with the CONTENT_LOCALE_CHANNEL_ENSURERS registry
  (src/ui/locale_channels.ts) replacing the three literal loader blocks in main.ts
  (identity membership + distinctness pinned); all-locale chord guard with localized
  modifier spellings; derived entity-anchor sweep (19 pages x 5 locales, snug floor
  95, Nythraxis pair excluded and pinned literally in ru); shipped-glossary
  keyPattern validation; release-tier 18-locale full-manifest arm in
  reliquary_i18n.test.ts registered in gate_steps/ci.yml/the tier pin (DELIBERATELY
  red at I18N_RELEASE_TIER=1 until the Phase 22 fill, deed-sibling shape; expect one
  extra red file on release/v0.35.0's own release-i18n run after merge); ko feature
  name unified on 성물고 (compact CJK cognate; glossary reliquaryName row; per-locale
  one-term guard; the ko Delve Day note names the delve 무너진 성물실, NOT the
  feature term); esc() on focus-key/data-nav attributes; Object.hasOwn prototype-key
  guards in both channels with fallback rows; .name scrape trailing-comment strip.
  RULINGS: hud toast/banner arms stay source-scrape-pinned (mutation-proven: both
  arms redden when reverted, and a resolver passthrough reddens 5 sentinel tests);
  HEROIC_PREFIX stays a hand literal (it IS the recorded per-locale convention);
  localeEntry stays bare-indexed (unreachable by ordering, proto rows pin the
  resolver path); guide.reliquaryPage.howBody keeps 'default Shift+X' (a wiki
  reference stating the default, outside the tips rationale); commit 6647fc383f's
  claw/tusk phrasing quotes the release PR title (claw is the only specimen family).
  INHERITED reds, not this branch: 3 full-suite failures (loot_window_controller x2,
  material_profession_affinity sharp_claw) reproduce exactly at the release tip
  303be34548 (PR 2905 landed without updating those suites); release-owned.
  Release-fill native-pass notes (join the ru retro note): ja colon conventions
  split (deed dungeon-heroics ASCII vs delve-heroics full-width; deedsRetroSummary
  ASCII vs reliquaryRetroSummary full-width); cs/pl plural few leaves carry the
  one-size genitive sentence; ko term confirmation (성물고); error.uniqueEquipped
  (release-side sim_i18n) has no locale fills; ja POI duplicate
  entities.zones.eastbrook_vale.pois.8.label renders the index-9 value; ko delve
  strings use four different reliquary nouns (성물실/유물함/성물함/유물).
  Phase 22 step recorded: extend the sweep's BUNDLES map when Latin chunks land
  (the sweep trips on 'has no resolved bundle' otherwise).
- Phase 12 (2026-08-06): Test integrity + catalog pins + record corrections. Release
  sync fb6e012255 (CI-only incoming, merge-queue PR 3016, no conflicts). Catalog: the
  three omitted instance drops added at their page tails (gravewyrm_bone_quiver to
  gravewyrm_sanctum, direfang_quiver to nythraxis, selthes_seastriders to
  drowned_temple); totals moved 213 to 216 catalog-wide and 184 to 187
  character-scoped, both derived from the live module before pinning; guide
  regenerated; the drowned_temple desc reworded to name both sources (live-name
  pinned; adds one desc to the Phase 22 fill worklist). tests/reliquary_content.test.ts
  now DERIVES every page from live tables: dungeons via DungeonDef.spawns[].mobId to
  MOBS loot plus recursive summonAdds and ground-object yields (both arms
  reached-pinned as the only routes), delves via behavioral chest enumeration
  (ScriptedRng fails closed: past-script draws and any non-chance draw THROW) plus
  DELVE_SHOPS Marks stock with a kind-tool exclusion, Thunzharr via the zone3 roll
  groups, sets via a DEEDS-derived col_set_* sweep (three leveling kits excluded,
  asserted real and page-less), plus growth sweeps: rare+ dungeon set equals the
  equality-map keys exactly, CHEST_FN_BY_DELVE bidirectional over DELVES, worldBoss
  mobs paged, totals 216/187 pinned through production completion math.
  tests/reliquary_state.test.ts: real ring-cap test through noteRelicItemFind (literal
  12; the inline ring re-implementation is DELETED), restore truncation keeps the
  newest 12, per-field sanitizer negatives on catalogued ids (clears junk dropped,
  fractional floored, bogus pageId dropped entry-survives, membership-only acceptance),
  illumination scans past an incomplete first page (deathlord_warplate second-page
  completion), masterwork proc behavioral test (shared seed-151 window with
  professions_masterwork, same-seed no-proc control), interleaved item+mark ring test.
  Server/UI: profile /c/ pins for the Reliquary pair and Curator lines; the phase
  item's "hides rank line when unranked" contradicted reality, the server ALWAYS
  renders the line with an Unranked fallback, pinned as-is (no behavior change); all
  five CURATOR_RANK_ENGLISH names literal-pinned AND cross-pinned against the client
  hud_chrome catalog (direct data-only import); per-dimension ownership deltas
  (items, marks, bag reins, bank reins, title deeds server-side; mounts seam
  client-side; totals pinned unchanged); curatorRankNameKey fallbacks on both
  out-of-range ends plus a rank-def count cross-pin; sheet view gained the
  ClientWorld Map-shaped deedsEarned arm. Record corrections: the ONE surviving
  false attribution (professions_fishing :1316) corrected with git provenance
  (3c0931fcdf introduced it, true-up 58bf16476d missed the block, the real cause is
  the Galecrest #2887 stream shift inherited via sync 90cee587f8, release-side hunt
  seed 5 in 4c2b43f8f7); every other target verified already correct. The phase
  file's corpse_harvest "60s timeout" premise is FALSE (no such timeout ever existed,
  git log -S proven; the :795 seed-probe loop is the idiom, suite 27.6s). Frostveil
  confirmed moot (strict contract live, no breath comment exists).
  BUG FOUND AND FIXED (QA round, test-first): the delve arm of clearCountForSource
  read meta.delveClears[delveId], a key NO writer produces (grantDelveClearTo writes
  delveId:tierId), so delve page clears and delve first-find provenance were
  permanently 0 on every host; the committed delve test had pinned the dead read.
  Red proof (999 vs 9), then the minimal fix: prefix-sum the tiered keys like
  delveShopGateUnlocked, flooring each finite positive entry; a cross-module test
  drives ONE real clear through grantDelveClearTo and holds all three readers (shop
  gate, deeds trigger, reliquary readout) to the same count. Architecture review:
  SHIP (no rng draw-order, tick-phase, purity, or host-identity impact; the deeds
  bare-key divergence judged acceptable-and-pinned). Reviews: qa-checklist READY
  (0 blocking), test-coverage-auditor 1 blocking (the dead delve read) plus
  should-fixes, fix round fresh-reviewed (0 blocking) and its batch applied,
  architecture SHIP; every finding applied or ruled. Mutation proof: 40/40
  agent-authored mutations executed red-then-restored across three batteries
  (cp-restore, patch-applied and tests-ran proven, green final baselines).
  Validation: tsc, ci:changed, guide freshness, 17-suite sweep 1161 green, sim
  blast-radius suites green. Stopping rules: NO uncatalogued rare+ instance drop
  remains beyond the three added (proven by the equality regime); the 51 open-world
  and Rift rare+ items are Phase 21 scope.
- Phase 13: COMPLETE with QA, pushed (2026-08-06). Source hints:
  ReliquarySourceHint {sourceKind: 'boss'|'zone'|'profession'|'deed'|'vendor',
  sourceId} on every relic-def arm + ReliquaryPageDef.sourceDefault + the ONE
  resolver reliquaryRelicSource(page, relic) the view calls; 182/242 slots
  resolve (183 as built; QA retired the wyrmcult_grand_robe hint), 60 pinned
  in SOURCE_PENDING_RULING (see OPEN items). Truth pins on all three authored
  arms (boss loot difficulty-aware, vendor stock, derived professions), plus
  the QA's competing-route sweep (six award-path families, per-family
  floors, named exclusions incl. the Rift payout pending the 13b ruling).
  Window: source lines in missing-cell tooltip AND aria, page descs rendered
  (reliquaryPageDesc's first production consumers: page header + shelf-row
  second line), ul/li shelf list, roving grid tab stop (per-cell
  aria-keyshortcuts + SR hint), persistent polite live region
  (ReannounceMarker, surface-gated, world-repaint-silent), deeds-parity
  search (locale-folded, name + desc + contained relic names on every
  page-listing surface) + owned/missing chips (chips sticky, search
  per-visit per the bank policy). One display-name ladder in NEW
  src/ui/reliquary_labels.ts (all four former sites routed, humanized
  fallback gone, every arm membership-guarded, painter .name pin now 0).
  Nearly-complete: remaining <= 3 OR fraction >= 0.6 (inclusive), owned >= 1
  kept (RELIQUARY_NEARLY_MAX_REMAINING / RELIQUARY_NEARLY_MIN_FRACTION).
  CSS: pseudo-tokens removed (deeds literals, themeCssVars debt in the
  banner), .reliquary-count real rule, honest cursor/hover, mobile floors.
  i18n: 18 keys + reliquarySearchResults plural base, five non-Latin fills
  in-change (M16), bundles regenerated. New behavioral suite
  tests/reliquary_window_behavior.test.ts (31/31 mutants). Six reviews, every
  finding applied or recorded in progress.md.
- Phase 14: (pending)
- Phase 15: (pending)
- Phase 16: (pending)
- Phase 17: (pending)
- Phase 18: (pending)
- Phase 19: (pending)
- Phase 20: (pending)
- Phase 21: (pending)
- Phase 22: (pending)

## OPEN items / known gotchas
- RESOLVED (Phase 10 sync, release commit 4c2b43f8f7): the frostveil ~40 HP loss was
  the Rime Elementals camped in the bowl swinging at the walker, not terrain. The
  release root-caused it and restored the strict contract (heal-through loop plus a
  'Falling'-damage-empty pin); the branch's relaxed assertions were superseded in the
  merge. Phase 12's frostveil decision item and the release-side issue text are moot.
- RESOLVED (Phase 10 sync): the release re-hunted its own inherited-red suites in
  4c2b43f8f7, attributing the shift to the Galecrest quest camps (#2887). The Phase 22
  release-side re-pin chore rider is obsolete; drop it. The Phase 22 PR-body correction
  still stands (the Phase 9 commit messages in history still carry the false
  "feature-branch world-gen" attribution).
- Comment attributions fixed in the Phase 10 sync merge (Phase 12 verifies, does not
  redo): professions_fishing (divergence-index prose to the recorded sets B0/B1 at 3,
  B1/B2 at 2 and 17; the :941-943 meta-test comment and both derivation comments now
  name the Galecrest shift), gathering_rhythm, fear_break_chance (seed chain plus
  release-hunt spares 4, 6, 8), corpse_harvest_result_event (header seed map extended,
  inline seed prose), corpse_harvest_sim (quantity history), whirlwind_echo (old
  default 31337 named). Evidence the Reliquary branch adds no world-gen draws: at the
  same seeds both sides recorded identical values (gathering_rhythm 89/80/72,
  corpse_harvest quantity 4, whirlwind 31338 valid on both). Phase 12 verified all
  six targets and found ONE missed block (professions_fishing :1316 still carried the
  banned wording; the true-up 58bf16476d fixed the file's other three comments but
  not this one); corrected in 314187312e with full git provenance.
- Seed-set divergence caveat (Phase 12): professions_fishing now carries the branch's
  own hunt (seed 1, default 2) while release/v0.35.0 carries its independent hunt of
  the same Galecrest shift (seed 5, default 467) for the SAME suite. Whichever side
  wins the next release merge, re-verify that suite rather than rubber-stamping the
  conflict resolution.
- RULING OPEN (Phase 12 arch review): a catalogued relic acquired while its page
  clear meter reads 0 (trade, auction, mail) stamps clears: 0 and renders "first
  found on clear 0". Absent (provenance unknown, matching the retro doctrine) may be
  righter. Current behavior is pinned in tests/reliquary_state.test.ts with a
  recorded-ruling comment; decide before Phase 17 ships obtain counts. Phase 13
  widened the blast radius knowingly: the owned-cell aria-label now mirrors the
  tooltip's firstFindClears line, so the ruling's outcome changes both surfaces.
- RULING SETTLED (Phase 13 source hints, maintainer 2026-08-06): do what is
  best for the feature at collection-log fidelity (the OSRS collection log /
  WoW appearance panel standard: an uncollected silhouette lists EVERY real
  way to get it). Decision: extend the vocabulary with 'delve', 'rift',
  'quest', 'store', and 'activity'; support MULTIPLE hints per relic (the 6
  Gravewyrm two-table drops carry both bosses; the heroic reins carry their
  bosses plus rift progression; the shop-and-chest delve items carry delve
  plus vendor); corpse harvest and masterwork:first become 'activity' rows
  against a pinned activity table; all 29 weapon skins become 'store'; the
  two open-world rare set members gain a 'zone' hint alongside their boss
  hint so the line names where the rare roams (giving the held 'zone' arm its
  first producers). SOURCE_PENDING_RULING shrinks to exactly
  reins_drakemaw_raptor (NO acquisition path in content, owner call dated
  2026-08-04) and reins_terrorspark_groundshaker (dev-grant only), both
  owner decisions outside this packet. Implementation is
  phase-13b-source-coverage.md (runs after the Phase 13 QA push, before
  Phase 21 grows the catalog and before the Phase 22 fill translates the
  sourceLine keys); per-kind truth pins against the live award paths are part
  of the phase, mutation verified.
  Phase 13 QA additions to this ruling's worklist (2026-08-06):
  (a) wyrmcult_grand_robe joined the pending set (its quest route names
  Korzul while its korgath_bonus loot row names Korgath; the model's own
  two-comparable-routes rule); 13b authors its multi-hint (boss + quest) and
  the two-mount shrink target is unchanged. (b) The QA's competing-route
  sweep (tests/reliquary_content.test.ts) must grow an acknowledgment arm
  per new kind 13b lands, and its named Rift exclusion is 13b's to resolve:
  the Rift clear pools overlap about 72 hinted five-man gear slots at
  comparable per-clear odds, so 13b decides whether dungeon gear lists a
  rift hint (the same standard its mounts already get) or records the
  written exclusion as permanent. (c) Vocabulary consideration: 'boss' is
  used for elite trash families and open-world rares today; 13b may prefer
  'mob' when it extends the kinds. (d) The two crafted pending relics
  (boundstone_helm, gravewyrm_gauntlets) carry a THIRD route (their
  recipes); the sweep's recipe arm acknowledges profession-kind hints on the
  crafting profession, so a 'profession' hint is representable for them
  today if 13b prefers it over multi-boss.
- Phase 15 input (Phase 13 QA, 2026-08-06): ReliquaryWindow.open(nav) sets
  nav but does not clear pageId, and the view resolves an off-shelf pageId
  from the full catalog, so a deep link passing a nav while a page from
  another shelf is persisted can render that page under the wrong rail.
  Unreachable today (no caller passes nav); clear pageId on a nav-bearing
  open, or pass the page too, when deep links land.
- Cross-window follow-up (Phase 13 QA, 2026-08-06): deeds_window.ts carries
  the byte-identical pre-fix search-input shape (no isComposing guard, no
  composing hold, no applier equality guard), so CJK IME compositions there
  still rebuild mid-composition. Same fix, deeds-scoped change with its own
  behavior tests; not this packet's diff (cross-window scope, the
  .deed-search precedent).
- Rider (Phase 12 arch review): three delve-clear readers hand-roll the sum with
  different validation (shop gate prefix-sums unguarded, deeds delveClearCount also
  accepts a bare delveId key and sums raw values, the reliquary arm is strict and
  floored). Agreement on the production key shape is pinned by the cross-module
  grantDelveClearTo test; the follow-up shape is a shared delveClearTotal helper or
  restore-time normalization (sim.ts restores delveClears with zero validation), plus
  a finite guard in deeds.ts delveClearCount (offline-sandbox exposure only). Not
  this packet. Phase 12 QA additions to the same rider: the OLD delve arm read the
  bare delveId key exclusively, so the fix flips which legacy key shape the page
  meter honors (deeds counts both; no writer has ever produced a bare key,
  verified back to the first delves commit 90c3e4f6f8); a shared
  delveClearKey(delveId, tierId) builder would turn writer/reader divergence into
  a tsc error and belongs in the same helper follow-up; DelveTierDef.unlock is
  declared but never authored or read (dead type surface), and if it is ever
  implemented it becomes a fourth reader that must agree with the other three.
- Growth-sweep escape hatches (Phase 12 QA note): EXCLUDED_DUNGEONS and
  WORLD_BOSS_PAGES in tests/reliquary_content.test.ts are author-serve opt-outs
  that sit on both sides of their completeness equalities, so one added row turns
  a new rare+ dungeon or world boss green with no contents pin. Deliberate for
  curation (the rationale string is the review surface); reviewers should eyeball
  any new row rather than trust the sweep alone.
- Release-notes rider (Phase 22 records close-out): players who had completed the
  Drowned Temple, Gravewyrm Sanctum, or Nythraxis pages see them revert to
  incomplete until they find the newly catalogued relic. Nothing persistent is lost
  (ranks key off owned counts, deeds and borders do not key off page completion);
  inherent to catalog growth and will repeat at Phase 21 scale.
- Phase 21 input (Phase 12 sweep): 51 uncatalogued rare+ items exist repo-wide and
  ALL are open-world or Rift sources (mogger, captain_verlan, old_cragmaw,
  voskar_emberwing, the rift_* family, zone2 sister_nhalia, etc.); instance coverage
  is complete and equality-pinned, so Phase 21 owns any inclusion decisions.
- i18n release fill: all reliquary keys pending in the 15 Latin locales; exact worklist
  in the Phase 22 record. Locale overlays for ja/ko/ru/zh_CN/zh_TW already carry
  contributor-authored fills (correct M16 mechanics, flagged for maintainer review).
  Phase 11 adds to that worklist: Latin-locale reliquary_i18n page-name chunks, ALL
  page desc fills (every locale; the manifest carries desc rows; Phase 13 NOW
  RENDERS descs, so the exclusion's stated condition has expired: the coverage
  arm at tests/reliquary_i18n.test.ts, the 'covers every manifest NAME row'
  test, widens to desc rows WITH the five non-Latin desc fills at the Phase 22
  release fill, not before, or the PR-tier suite reds; until then English desc
  fallback ships to every locale by design), the Latin deedsRetroSummary.one
  singulars, and the Latin reliquaryRetroSummary leaves. KNOWN BRANCH BEHAVIOR,
  deliberate: the pending Latin deedsRetroSummary.one rows render ENGLISH at exactly
  count 1 until the release fill, because the dense resolved table English-fills
  pending leaves and defeats tPlural's .other fallback; the Phase 10 QA rider ruled
  .one stays pending so the release fill authors true singulars (seeding the plural
  sentence would drop the rows off the pending worklist forever), and the release-tier
  gate hard-fails on pending so it cannot ship. The ru retro plural leaves (the same
  number-invariant colon-genitive sentence x4) are flagged for a native-speaker pass
  at release fill.
- RESOLVED (Phase 11): the wiki shelf-name glossary conflict. One term per locale
  locked in scripts/i18n_glossary.json (reliquaryShelves row); see the Phase 11
  surfaces entry for the deviation rationale on Professions.
- samplePlayerMeta goldens show "reliquary": {"firstFind": {}}: that is the LIVE meta
  sample, not CharacterState save bloat. Do not "fix" it.
- pr_screenshots cold-vite flake: rerun on a warm dev server. DOM check is not a frame
  check.
