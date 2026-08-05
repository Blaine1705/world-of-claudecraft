# State: Reliquary Perfection Packet

Current phase: 10 complete; next: 10 QA. Update this line as phases complete.

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
  ja uses the full-width colon). Titles page is 33 relics (hidden deeds excluded
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
- Phase 11: (pending)
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
- Wiki shelf-name glossary conflict (ja/ko/zh_CN/zh_TW translate shelves differently in
  guide.* vs hudChrome.reliquary.nav*): Phase 11 picks one term per locale and aligns
  both, extending the i18n glossary.
- samplePlayerMeta goldens show "reliquary": {"firstFind": {}}: that is the LIVE meta
  sample, not CharacterState save bloat. Do not "fix" it.
- pr_screenshots cold-vite flake: rerun on a warm dev server. DOM check is not a frame
  check.
