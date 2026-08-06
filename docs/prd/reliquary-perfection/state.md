# State: Reliquary Perfection Packet

Current phase: 11 complete; next: 11 QA. Update this line as phases complete.

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
  no-op, recorded so later phases do not hunt). markItemDiscovered gained trailing
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
- Phase 12: (pending)
- Phase 13: (pending)
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
  corpse_harvest quantity 4, whirlwind 31338 valid on both).
- i18n release fill: all reliquary keys pending in the 15 Latin locales; exact worklist
  in the Phase 22 record. Locale overlays for ja/ko/ru/zh_CN/zh_TW already carry
  contributor-authored fills (correct M16 mechanics, flagged for maintainer review).
  Phase 11 adds to that worklist: Latin-locale reliquary_i18n page-name chunks, ALL
  page desc fills (every locale; the manifest carries desc rows, excluded from the
  coverage arm until Phase 13 renders them), the Latin deedsRetroSummary.one
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
