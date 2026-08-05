# Phase 21: Catalog growth

Owns: the review's coverage gaps: the Rift, overworld rares, the PvP Warfare gallery,
fishing trophies, and the retired shelf. Batch content authoring with uniform pin
requirements: ultracode.

### Starter Prompt
```
ultracode

This is Phase 21 of the Reliquary Perfection packet: Catalog growth.

Model: session default frontier at xhigh. Harness: Claude Code.
Worktree: /Users/fernando/Documents/wocc-reliquary-review, branch feature/reliquary-perfection.

Goal: everything in the live game worth collecting has a page: Rift, rares, PvP,
fishing, and retired uniques, each pinned to its live table per the Phase 12 standard.

STEP 0: canonical pre-flight + release sync. Memory: parity-scenario teleport pins
content; deeds authoring rules.

STEP 1 - LOAD CONTEXT (Explore agent): state.md, progress.md;
src/sim/content/reliquary.ts page/relic builders + the Phase 13 source-hint field;
the Rift: rift item tables (heart_of_the_rift, voidsong_dirk legendaries; the 4
rift-signature epics; 3 riftbound rings; ~10 rare rift uniques: locate the actual
tables in src/sim/content/), riftClears/riftSRankClears counters (deed_stat source);
overworld rares: RARE_SLAIN_TEMPLATES (19 templates) + their signature drops + the
slain:<templateId> visited marks; PvP: the Honor Quartermaster WARFARE stock (28 epic
pieces, 4 kits x 7 slots) + existing pvp title relics; fishing: glimmerfin_koi +
the rod ladder (stormreel, tidewrought) + the professions_specimens page; retired:
RETIRED_HEROIC_ITEMS (4 v0.24.x epics); docs/design/reliquary.md rules 6 to 8 +
the retired-shelf rule 7; tests/reliquary_content.test.ts Phase 12 derivation
patterns; docs/design/deeds.md content rule (whether any of this content class
REQUIRES same-change deeds: these are existing-content pages, their deeds exist).
Return: exact live-table ids per system, counter availability, existing col_* deeds
touching these systems.

STEP 2 - EXECUTE as a Workflow (pipeline per page-set: author -> pin -> verify):

Page sets (each: catalog entries with source hints, clear sources where counters
exist, live-table derivation pins on the Phase 12 standard, wiki regen, totals
cascade, i18n page names + descs through the Phase 11 channel with M16 overlay fills):
1. Conquerors: "The Rift" page(s): legendaries + signature epics + riftbound rings +
   rare rift uniques (split into Rift and Rift Depths pages if one page exceeds ~30
   slots; append-only order). Clear source: riftClears (and an S-rank meter on the
   page header if the counter reads cleanly).
2. Conquerors: "Rares of the Realm": one page, mark relics from the slain:* visited
   namespace for all 19 templates (the gather_event:* precedent: marks sync from
   visited on join via syncReliquaryMarksFromVisited: extend RELIQUARY_MARK_IDS with
   the 19 slain marks) PLUS item relics for the ~30 signature rare drops. Verify the
   slain mark actually writes at the kill site for every template (behavioral test on
   one; source pin on the site).
3. Horizons or Conquerors (pick by shelf semantics; Conquerors per "what you have
   taken"): "Warfare Gallery": the 28 epic quartermaster pieces (fill via
   itemsDiscovered on purchase; zero new state). Derivation pin against the live
   quartermaster stock table.
4. Professions: extend professions_specimens with glimmerfin_koi + the rod ladder
   (verify rods are obtain-tracked through markItemDiscovered on acquisition).
5. A retired shelf page ("Vault of Ages", Feats-style, labeled retired per rule 7):
   RETIRED_HEROIC_ITEMS as item relics, EXCLUDED from Curator rank + completion-deed
   math (rule: retired content must not make completion permanently unreachable for
   new characters: follow the account-skin exclusion precedent in
   catalogCharacterCompletion and comment it; Overview may show it as a separate
   labeled pair). This needs a small runtime change: a page-level
   excludeFromCompletion flag honored by the completion helpers + pins.
Cross-cutting:
6. Every new page: nearly-complete eligibility sane (retired page excluded), tracker
   pinnable, search finds it, obtain counts apply (items), guide/wiki spoiler-safe,
   totals cascaded everywhere, deeds untouched (existing deeds already cover this
   content; the luck doctrine forbids new scored deeds).
7. Adversarial verify stage: for each page, a skeptic re-derives the live-table id
   set independently and diffs it against the authored page, reporting any id present
   in the table but absent from the page (with the curation rationale required per
   exclusion) and any authored id absent from the table.

INVARIANTS: append-only page order; bounded state (the 19 slain marks are the only
new mark ids; counts/marks stay allowlisted); rule 7 (no permanently missable in
completion math); luck never scores Renown (no new deeds); performance contract
(catalog growth is the bound: ~+80 relics is within the linear budget Phase 17
re-measured; record the new worst-case bytes).

Out of scope: event skins (placeholder content only: vetoed), cards/companions
(too thin: vetoed), rarity (Phase 22).

STEP 3 - VALIDATION + REVIEW: npx tsc --noEmit; npx vitest run
tests/reliquary_content.test.ts tests/reliquary_state.test.ts tests/guide.test.ts
tests/reliquary_view.test.ts tests/architecture.test.ts + the kill-site pin suites +
tests/localization_fixes.test.ts; npm run ci:changed; wiki regen + freshness.
Dispatch: architecture-reviewer (completion-flag runtime change) +
cross-platform-sync (mark ids grew: join sync + wire) + test-coverage-auditor +
qa-checklist.

STEP 4 - COMMIT CADENCE:
- feat(reliquary): Rift pages with clear meters
- feat(reliquary): Rares of the Realm with slain marks and signature drops
- feat(reliquary): Warfare gallery and fishing trophies
- feat(reliquary): retired Vault of Ages outside completion math
- test(reliquary): live-table derivations and kill-site pins for every new page

STEP 5 - ACCEPTANCE CRITERIA:
- [ ] Every named system has its page(s); every page passes the Phase 12 derivation
      standard (mutation-proof); the skeptic stage reports zero unexplained diffs.
- [ ] A rare kill writes its slain mark live AND retro-syncs on join (both pinned).
- [ ] Retired page fills display but never blocks completion deeds or rank (pinned).
- [ ] New totals cascaded; blob worst case re-measured and recorded.

STEP 6 - DOCS: progress.md, state.md (new pages, mark ids, the completion-exclusion
flag, measured bytes).
STEP 7 - FINAL RESPONSE + handoff to Phase 21 QA.

STOPPING RULES: stop and surface any rare template whose drop table is empty or
ambiguous (list, do not guess); stop if the Rift tables are procedural in a way that
defeats a stable id derivation (bring the shape, propose the pin).
```
