# Phase 10: Sim correctness close-out

Owns: the hidden-deed spoiler leak, the retro-unsafe join path, and the small sim
robustness defects found by the architecture and parity reviewers.

### Starter Prompt
```
This is Phase 10 of the Reliquary Perfection packet: Sim correctness close-out.

Model: the session default frontier model at xhigh effort. Harness: Claude Code.
Worktree: /Users/fernando/Documents/wocc-reliquary-review, branch feature/reliquary-perfection.

Goal: remove the hidden-deed spoiler from every Reliquary surface, make the join-time
retro path silent and honestly flagged, and fix the five small sim defects, with
behavioral tests for each.

STEP 0 - PRE-FLIGHT + RELEASE SYNC: follow "Canonical per-phase workflow" Step 0 in
docs/prd/reliquary-perfection/implementation-plan.md (clean tree check, fetch + merge
origin/release/v0.35.0 with a merge-commit body, release-merge-audit skill if the merge
touched branch-owned files, memory scan: test-pin traps index, shared-worktree care).

STEP 1 - LOAD CONTEXT: spawn an Explore agent to read and summarize:
- docs/prd/reliquary-perfection/state.md and progress.md
- src/sim/reliquary.ts (whole file), src/sim/content/reliquary.ts:120-160 (the
  RELIQUARY_HORIZON_TITLES list) and :620-640 (the titles page def)
- src/sim/deeds.ts:520-620 (markItemDiscovered + the reliquary hook) and :1080-1130
  (seedItemDiscovery + retroFallbackGrants), src/sim/sim.ts:3370-3395 (join ordering)
- src/sim/mounts.ts:90-110, src/sim/types.ts around the reliquaryUnlock SimEvent union
- server/game.ts: the deedUnlocked retro fan-out gate (~:8655) and HEAVY_SELF_EVENTS
- src/ui/hud.ts handleReliquaryUnlocks (~:13205) and handleDeedUnlocks (the retroSummary
  pattern directly below it)
- tests/reliquary_state.test.ts:490-530 (the join-sync source-scrape it will replace)
- tests/guide.test.ts:530-560 (hidden-deed needle guard)
- CLAUDE.md (root) + src/sim/CLAUDE.md
Return: the exact call graph of the join path, the current titles-list contents, every
literal test pin that references the totals 213 or 184 or the titles count 34.

STEP 2 - EXECUTE (parallel Agent fan-out; two implementation agents, each owns its
vertical slice including tests):

Agent A deliverables (spoiler removal):
- Remove 'hid_saul_footnote' from RELIQUARY_HORIZON_TITLES in
  src/sim/content/reliquary.ts. Locked decision: hidden deeds are OUT of the catalog
  entirely (no masked slots). Add a comment stating the policy: hidden deeds never enter
  the Reliquary; the Book of Deeds is their home.
- Make the exclusion structural: in tests/reliquary_content.test.ts, change the titles
  equality pin from "every deed with a title reward" to "every NON-hidden deed with a
  title reward, and only those" (filter !DEEDS[id].hidden), keeping the bidirectional
  equality so a future hidden title deed cannot re-enter silently.
- Add a build-time guard in scripts/wiki/build_content.mjs: the reliquary relic emitter
  THROWS if a title relic references a hidden deed (mirror the existing deeds-arm
  hidden filter twenty lines above it).
- Extend the tests/guide.test.ts hidden-deed needle set to include d.reward.text (for
  title rewards) so the guard catches reward-text leaks, not just id/name/desc.
- Regenerate the wiki bundle (npm run wiki:content) and confirm the hidden deed's reward
  title text (DEEDS hid_saul_footnote reward.text) no longer appears anywhere in
  src/guide/content.generated.ts.
- Cascade every literal total this changes (catalog 213 to 212, character-scoped 184 to
  183, titles 34 to 33) through tests/reliquary_content.test.ts,
  tests/reliquary_state.test.ts, tests/reliquary_view.test.ts, and any window test
  literal the Explore agent found. Do NOT touch deeds-side counts (the deed itself
  still exists; tests/deeds_content.test.ts is unaffected).

Agent B deliverables (retro-safe join + sim robustness):
- Thread a retro signal: seedItemDiscovery passes {retro: true} through
  markItemDiscovered into the reliquary hook (onItemDiscovered). On retro:
  do NOT push the recent ring, do NOT stamp firstFind.clears (write the sparse entry
  with no clears so provenance is never fabricated; module header rule), and emit
  reliquaryUnlock with retro: true. Pass {retro: true} to syncCuratorRankDeeds AND
  maybeSyncCuratorRankDeeds on every join-origin call (including the mount arm at
  onItemDiscovered's early path) so grantDeed emits deedUnlocked {retro: true} and the
  server fan-out gate (server/game.ts ~:8655) stays closed.
- Add retro?: boolean to the reliquaryUnlock SimEvent union (src/sim/types.ts).
- Client: in hud.ts handleReliquaryUnlocks, split retro events out of the plan the way
  handleDeedUnlocks does: retro events produce ONE localized summary line (new English
  key hudChrome.reliquary.retroSummary with {count}; wordy enough for M16? it is one
  short sentence, check the M16 wordiness bar and add the five non-Latin fills only if
  it crosses it), no banner, no sound, no per-relic gold lines, no window force-render.
  Extend buildReliquaryUnlockPlan (pure core) with the retro split and unit-test every
  arm in tests/reliquary_view.test.ts.
- Unify the Illumination ownership surface: emitReliquaryUnlock currently computes
  illuminatedPageId from characterReliquaryOwnership (no weaponSkins) while display
  completion includes them; make the emit accept the same optional weaponSkins lookup
  the hosts pass to completion reads, so a future mixed page cannot illuminate
  inconsistently (parity W3; latent, fix while here).
- Reorder onItemDiscovered so the noteRelicItemFind early-return sits ABOVE the rank
  math, or move the rank sync ahead of it, so a ledger/blob disagreement cannot drop a
  rank-threshold crossing (arch finding 4).
- Restore the throw in src/sim/mounts.ts ownedMounts (remove the partial-meta
  tolerance) and fix the unit fixtures that motivated it (gather_rare_events stub meta
  and any sibling) to hand over complete metas.
- Fix the inverted pushRecent de-dupe guard (index 0 is the OLDEST; the guard must
  refresh, not skip) and make restoreReliquaryState de-dupe recent on load.
- Add ctx.markVisited(meta, markId) alongside noteReliquaryMark at the masterwork call
  site (src/sim/professions/crafting.ts ~:1045) so masterwork marks gain the same
  visited-ledger crash-recovery home gather_event marks already have, and extend
  syncReliquaryMarksFromVisited coverage accordingly. No saveCharacter call (the
  contract forbids it).
- Fix the stale comment at src/sim/deeds.ts:600-604 (rank bridges 2 to 4 are Horizons
  titles; rank 5 deliberately is not).
- Behavioral join test (replaces the source-scrape at tests/reliquary_state.test.ts:520):
  drive the real Sim.addPlayer({state}) with a save holding catalogued relics but an
  incomplete itemsDiscovered ledger, drain events, and assert: every reliquaryUnlock
  carries retro true, every rank-bridge deedUnlocked carries retro true, recent stays
  empty, firstFind entries have no clears, and a LIVE post-join fill still celebrates
  (negative arm).

INVARIANTS IN PLAY: determinism (no Rng, no clock); sim purity; retro policy (state.md
locked decisions); i18n (the one new key is English-only catalog + matcher rules are
unaffected because the event stays id-only); hidden deeds invisible, existence included.

Out of scope: page-name localization (Phase 11), catalog loot-table pins (Phase 12),
any UI polish beyond the retro summary line.

STEP 3 - VALIDATION + REVIEW: npx tsc --noEmit; npx vitest run
tests/architecture.test.ts tests/reliquary_state.test.ts tests/reliquary_view.test.ts
tests/reliquary_content.test.ts tests/reliquary_wire.test.ts tests/guide.test.ts
tests/gather_rare_events.test.ts tests/world_api_parity.test.ts; npm run ci:changed.
Dispatch per the matrix: architecture-reviewer + cross-platform-sync (sim + event + wire
changed) + qa-checklist at completion. COVERAGE prompting; no commit until no BLOCKING.

STEP 4 - COMMIT CADENCE (explicit paths):
- fix(reliquary): remove hidden deeds from the catalog and guard the wiki
- fix(reliquary): make join-time retro silent, flagged, and provenance-honest
- fix(sim): restore ownedMounts strictness and repair the reliquary hook ordering
- test(reliquary): behavioral join coverage and cascaded totals

STEP 5 - ACCEPTANCE CRITERIA:
- [ ] The hidden deed's reward title text (DEEDS hid_saul_footnote reward.text) appears
      nowhere in src/guide/content.generated.ts or any window render path; guide.test
      needles cover reward.text; wiki emitter throws on hidden.
- [ ] The behavioral join test passes and proves: no unflagged event, no fan-out-eligible
      deed grant, no recent push, no clears stamp on the seed path; live fills still
      celebrate.
- [ ] ownedMounts throws on partial meta again; all suites green.
- [ ] pushRecent refresh works when the id is mid-ring (new unit case).
- [ ] Full listed validation matrix green.

STEP 6 - DOC UPDATES: progress.md (Phase 10 complete + notes), state.md (surfaces:
reliquaryUnlock.retro, hudChrome.reliquary.retroSummary key, titles page 33, totals 212/183).

STEP 7 - FINAL RESPONSE: phase status, files touched, validation results, reviewer
verdicts, deferred items, one-line handoff for Phase 10 QA.

STOPPING RULES: stop and ask if removing the hidden deed breaks a pinned total you
cannot attribute; stop if the retro thread requires changing markItemDiscovered's
signature in a way that touches more than its ~8 call sites.
```
