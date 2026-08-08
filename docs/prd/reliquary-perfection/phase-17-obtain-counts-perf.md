# Phase 17: Per-relic obtain counts + wire/serialize perf

Owns: the maintainer's "how many times something was dropped" checklist item (locked
decision 4), plus the three measured perf wins (pageId removal, reliq wire memoization,
ownership snapshot hoist).

### Starter Prompt
```
This is Phase 17 of the Reliquary Perfection packet: obtain counts + wire/serialize perf.

Model: session default frontier at xhigh. Harness: Claude Code.
Worktree: /Users/fernando/Documents/wocc-reliquary-review, branch feature/reliquary-perfection.

Goal: the Reliquary records how many times each catalogued relic has been obtained
(grant-time, sparse, doctrine-compatible), and the reliq blob costs nothing when
nothing changed.

STEP 0: canonical pre-flight + release sync. Memory: caches/memos traps (BOTH resets;
bust semantics), deferred-write re-checks live state.

STEP 1 - LOAD CONTEXT (Explore agent): state.md, progress.md;
src/sim/reliquary.ts (state shape, serialize/restore, onItemDiscovered,
characterReliquaryOwnership, reliquaryWireBlob), src/sim/deeds.ts markItemDiscovered
(fires once per id: counts need a DIFFERENT hook point: find the addItem/
addItemInstance grant sites in src/sim/sim.ts (grep the method names; their
offsets rot with every release sync) and items.ts buyback),
server/game.ts reliq encode + heavy-self cadence, src/net/online.ts reliq decode,
src/ui/reliquary_window.ts cellTooltipHtml + refreshIfChanged/sigFromInput,
docs/design/reliquary.md (the performance contract table + deliberately-deferred list),
tests/reliquary_state.test.ts + reliquary_wire.test.ts shapes. Return: the exact grant
sites where a repeat obtain of an already-discovered catalogued id is visible.

STEP 2 - EXECUTE (two agents: sim+wire, ui+docs):

Agent A (sim + wire):
- ReliquaryState.counts: Record<string, number>, sparse, keyed by catalogued relic item
  ids ONLY (isCataloguedRelicItem gate), incremented at GRANT time (addItem/
  addItemInstance/buyback restore paths for catalogued ids; rule 4: at grant, never at
  corpse roll), including the FIRST obtain (count starts at 1 when the first-find
  fires). No timestamps, no per-drop entries, no recent push on duplicates, no
  saveCharacter, retro join seed does NOT increment (a held item's presence is not an
  obtain event; assert in the join test).
- Serialize/restore: omit-empty, allowlist-filtered, non-finite/negative sanitized,
  caps enforced (floor + a sane ceiling like 1e9); byte-stable key sort. Update the
  wire blob to carry counts; delta semantics unchanged (absent keeps prior mirror).
  Parity: the counts read lands on the IWorld facet (reliquaryObtainCounts or fold
  into the firstFind read shape: pick the smaller wire), implemented in BOTH worlds,
  parity pin updated.
- Perf: drop pageId from serializeReliquaryState and the wire blob (keep the restore
  validation arm one release for old blobs; derive on read via
  RELIQUARY_ITEM_TO_PAGES.get(id)?.[0] if anything wants it). Memoize
  reliquaryWireBlob per session: rebuild only when a dirty flag set by state mutation
  points (noteRelicItemFind, noteReliquaryMark, counts increment, restore) is set;
  clear on build. Hoist ONE ownership snapshot per fill call chain in
  onItemDiscovered/noteReliquaryMark/syncCuratorRankDeeds (arch note 9: 3 to 4
  characterReliquaryOwnership rebuilds per fill today).
- Tests: counts increment on repeat grant of each grant path (loot, craft, vendor
  buyback), first obtain = 1, retro seed = no increment, sanitized restore, round-trip,
  wire carries counts and elides when unchanged (extend the quiet-tick pin), memo
  dirty-flag correctness (a fill after a build re-sends; an untouched tick does not),
  determinism same-seed.
- Blob cost: re-measure worst-case stored bytes (the db reviewer's method: local
  disposable postgres, pglz) and record the number in state.md; target: counts add
  less than pageId removed at realistic duplication (veteran full-catalog worst case
  documented either way).

Agent B (ui + docs):
- Tooltip line on owned cells: "Obtained {count} times" (formatNumber; singular via
  the plural-capable key pattern the catalog already uses; English catalog key +
  M16 check). Show on the cell aria-label too (Phase 13 rule: keyboard gets what
  hover gets). Window signature: counts digest dimension so an open window repaints
  on a duplicate obtain.
- docs/design/reliquary.md: amend the deliberately-deferred list (per-drop HISTORY
  stays deferred; grant-time COUNTS are sanctioned, with the rules: catalogued ids
  only, grant-time, no timestamps, sparse omit-empty) and add counts to the
  performance contract table with the measured cost.

INVARIANTS: no per-drop save; no second discovery set; sparse omit-empty; determinism;
IWorld-first with the parity pin in the same change; server stays observer.

Out of scope: rarity aggregation (Phase 22), any reward keyed to counts (doctrine:
counts are information, never a score).

STEP 3 - VALIDATION + REVIEW: npx tsc --noEmit; npx vitest run
tests/architecture.test.ts tests/reliquary_state.test.ts tests/reliquary_wire.test.ts
tests/world_api_parity.test.ts tests/snapshots.test.ts tests/env_protocol.test.ts
tests/reliquary_view.test.ts tests/reliquary_window_behavior.test.ts
tests/localization_fixes.test.ts; npm run ci:changed. Dispatch: architecture-reviewer +
cross-platform-sync + database-performance-reviewer (blob growth + save cadence) +
migration-safety (persisted shape changed: counts added, pageId removed; old blobs must
load) + qa-checklist.

STEP 4 - COMMIT CADENCE:
- feat(reliquary): grant-time obtain counts on catalogued relics
- perf(reliquary): drop dead pageId from the blob and memoize the reliq wire build
- docs(design): sanction counts and update the performance contract

STEP 5 - ACCEPTANCE CRITERIA:
- [ ] Looting a known catalogued relic twice shows "Obtained 2 times" in the tooltip,
      offline and online; join seeding never increments.
- [ ] A pre-packet blob (with pageId, without counts) loads clean; round-trip green.
- [ ] The reliq blob is NOT rebuilt on unchanged ticks (memo pin); measured stored
      bytes recorded in state.md.

STEP 6 - DOCS: progress.md, state.md (facet member, wire shape, measured bytes, memo
flag points).
STEP 7 - FINAL RESPONSE + handoff to Phase 17 QA.

STOPPING RULES: stop and surface if grant sites cannot distinguish a genuine obtain
from an internal move (bank withdraw, trade-back): counts must never increment on item
MOVEMENT, only on acquisition; if the seam is ambiguous, list the sites and ask.
```
