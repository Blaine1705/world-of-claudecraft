# Phase 12: Test integrity + catalog pins + record corrections

Owns: both gameable-pin blockers, every uncovered arm the test auditor enumerated, the
three omitted drops, and the false-attribution record corrections. Batch-heavy and
uniform: run it as an ultracode Workflow.

### Starter Prompt
```
ultracode

This is Phase 12 of the Reliquary Perfection packet: Test integrity + catalog pins +
record corrections.

Model: session default frontier at xhigh. Harness: Claude Code.
Worktree: /Users/fernando/Documents/wocc-reliquary-review, branch feature/reliquary-perfection.

Goal: no Reliquary behavior or catalog claim survives without a decisive pin; every
false attribution in the branch's committed comments is corrected.

STEP 0: canonical pre-flight + release sync. Memory scan is MANDATORY here: read the
test-pin trap index memory (33 traps) before writing or judging ANY pin; also
mutation-harness-must-prove-tests-ran, constant-self-comparison, source-text pins.

STEP 1 - LOAD CONTEXT (Explore agent): state.md, progress.md, this file;
tests/reliquary_content.test.ts (whole), tests/reliquary_state.test.ts:520-610 and
:820-870, src/sim/content/reliquary.ts (pages + relic builders), the live loot sources
(src/sim/content/dungeons.ts loot entries, src/sim/content/delves/, the Thunzharr
thunzharr_t2 roll group in src/sim/content/zone3.ts ~:1080, HEROIC_BOSS_LOOT,
item_sets.ts, WORLD_BOSSES if a registry exists), src/sim/reliquary.ts:326-366
(illumination loop + pushRecent), server/profile_page.ts:149-155 + :214-215 +
tests/profile_page.test.ts, server/character_sheet.ts CURATOR_RANK_ENGLISH +
tests/character_sheet.test.ts:270-276, tests/professions_fishing.test.ts:930-995,
tests/gathering_rhythm.test.ts (the false-attribution comment), 
tests/fear_break_chance.test.ts (seed comment), tests/frostveil_pit_escape.test.ts:110-135,
tests/corpse_harvest_sim.test.ts:590-605, tests/reliquary_sheet_view.test.ts,
src/net/online.ts:1564 (deedsEarned is a Map online). Return: per-target current state.

STEP 2 - EXECUTE as a Workflow (pipeline: implement -> self-mutation-check per item;
concurrency-safe because items touch distinct test regions; where two items share a
file, order them in one pipeline stage). Items:

Catalog pins (the blocker):
1. Add gravewyrm_bone_quiver (korzul drop) to conquerors_gravewyrm_sanctum,
   direfang_quiver (nythraxis epic) to the raid page, selthes_seastriders
   (choirmother_selthe) to conquerors_drowned_temple. Cascade totals (212 to 215
   catalog-wide, character-scoped +3) through every literal pin; wiki regen.
2. Replace the hand-copied Thunzharr literal with a derivation from the live zone3
   roll group (subset-or-equality against rare+ non-filler ids; delete the no-op
   `const thunzharr = ITEMS; void thunzharr;`). Same for both delve pages against the
   live delve loot tables, and each normal dungeon page: derive the rare+ id set from
   DUNGEONS loot entries and assert the page's item relics are a SUBSET of it AND that
   every rare+ signature drop the curation intends is present (equality where the page
   claims completeness, subset where curation deliberately excludes fillers; state
   which in a comment per page).
3. Sweeps so growth cannot drift silently: every DUNGEONS id with normal loot has (or
   is explicitly excluded from) a page mapping; every Object.keys(DELVES) id has a
   page; every WORLD_BOSSES-class source has a page; every col_set_* deed maps to a
   set page (derive the map from DEEDS, not a test-local literal).
State/ring pins (the blocker + auditor list):
4. Real recent-cap test: drive noteRelicItemFind with RELIQUARY_RECENT_CAP + 3 DISTINCT
   catalogued item ids; assert length 12 exactly, oldest three evicted, newest last;
   pin the literal 12; delete the test's inline ring re-implementation. Add a restore
   case: longer-than-cap all-valid recent truncates to 12.
5. Restore sanitizers: clears guard (negative, Infinity, fractional -> floored/dropped),
   pageId filter arm reachable (invalid pageId on a CATALOGUED item id is dropped while
   the entry survives), duplicate recent ids de-duped (Phase 10 behavior).
6. clearCountForSource delve arm (kind: 'delve' against meta.delveClears) and the
   normal-difficulty negative (heroic clears present; normal read excludes them).
7. Multi-page illumination: an item on two pages where only the SECOND completes must
   set illuminatedPageId to the completing page (use deathlord_warplate or a synthetic
   two-page fixture).
8. Character-scoped total literal pin next to the page-count literal; curatorRankNameKey
   fallback behavioral test (rank 0 and 6 -> generic key; ranks 2-5 -> exact keys);
   masterwork craft behavioral assertion (a real craft that procs masterwork writes
   masterwork:first AND masterwork:<professionId>; replace the source-regex-only pin).
9. Profile-page test: /c/ HTML contains the Reliquary pair line and Curator line for a
   fixture state (and hides rank line when unranked). Pin CURATOR_RANK_ENGLISH ranks 2,
   3, 4 against the client catalog values (all five, not just 1 and 5).
10. reliquary_sheet_view: add the ClientWorld-shaped arm (deedsEarned as a Map with
    .has) alongside the Set arm.
Record corrections (comments only; commits are immutable):
11. tests/professions_fishing.test.ts: update the divergence-index prose to the actual
    recorded indices (B0/B1 at 3; B1/B2 at 2 and 17) and REPLACE the "Reliquary
    world-gen draw-order shift" attribution with the true cause: inherited red from the
    release base (craft-cast seed rot). Same correction in the gathering_rhythm
    comment. tests/fear_break_chance.test.ts: rewrite the seed comment to match the
    current seed 1 (the 1->3 hunt note and spares 4,7 describe a superseded recording;
    re-hunt spares or state none recorded).
12. tests/frostveil_pit_escape.test.ts: attempt a bounded diagnosis of the ~40 HP
    descent loss on the CURRENT merged base (one hour cap: instrument hp deltas per
    tick source in a scratch run). If diagnosed, pin the real mechanism and restore the
    strict assertion against it. If not diagnosed, keep a TIGHT tolerance
    (startHp - 45, not startHp * 0.5), replace the breath/drown comment with "cause
    undiagnosed, release-side, see packet rider", and add the finding to the Phase 22
    release-rider text. Sanity-check the corpse_harvest 60s timeout is the seed-probe
    idiom, not a hidden slowdown (compare runtime).

Every new pin: follow the trap index (no constant-self-comparison, no test-local
re-implementation, literals pinned line-above where a shared constant is asserted,
prove mutation-kills with the harness rules: tests must be shown to RUN).

INVARIANTS: pins derive expectations from LIVE tables or literals, never from the code
under test; comment corrections state true causes; no behavior changes in this phase
except the three added relics (which ARE catalog content + their cascades).

Out of scope: new content systems (Phase 21), UI tests (Phase 13 owns the behavioral
window suite).

STEP 3 - VALIDATION + REVIEW: npx tsc --noEmit; npx vitest run tests/reliquary_*.ts
tests/profile_page.test.ts tests/character_sheet.test.ts tests/guide.test.ts
tests/professions_fishing.test.ts tests/fear_break_chance.test.ts
tests/frostveil_pit_escape.test.ts tests/corpse_harvest_sim.test.ts; npm run
ci:changed. Dispatch: test-coverage-auditor (the primary reviewer for this phase) +
qa-checklist; architecture-reviewer only if the frostveil diagnosis changed sim.

STEP 4 - COMMIT CADENCE:
- feat(reliquary): add the three omitted instance drops
- test(reliquary): pin every page against its live loot table with growth sweeps
- test(reliquary): decisive ring, restore, clears, illumination, and sheet pins
- test: correct false re-pin attributions and stale seed comments

STEP 5 - ACCEPTANCE CRITERIA:
- [ ] Deleting the cap line in pushRecent turns a test red; changing any page's relic
      list or any live loot table id turns a test red; both proven by mutation runs.
- [ ] The three drops render on their pages; totals cascaded; wiki regenerated.
- [ ] No committed comment attributes any re-pin to feature-branch world-gen.
- [ ] Frostveil resolved per item 12 with the decision recorded in state.md.

STEP 6 - DOCS: progress.md, state.md (totals now 215/(186 character-scoped), frostveil
decision, rider notes for Phase 22).
STEP 7 - FINAL RESPONSE: status, counts of pins added, mutation-proof summary, handoff.

STOPPING RULES: stop and surface if a live-table derivation reveals MORE uncatalogued
rare+ drops beyond the known three (list them; the maintainer decides inclusion) or if
the frostveil diagnosis implicates a real gameplay bug.
```
