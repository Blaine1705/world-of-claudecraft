# Revamping Eastbrook: the New Eastbrook program master plan

Status: ACTIVE epic. Integration branch `feature/eastbrook-v0.39.0`, based on
`release/v0.39.0`, PR "revamping eastbrook". This document is the program's
source of truth for scope, the land plan, the demolition map, and the open
decisions. It follows the program-doc pattern of
`docs/design/eastbrook-vale-rebuild/` and `docs/design/fenbridge-rebuild/`
(Fenbridge's `master-plan.md` is the closer template: a locked contract, then
the site plan, then phased work).

## 1. Program goal

Build New Eastbrook: the town grows south out of its walls into the vale's
southern basin. Two tenants hold that ground today, and the program clears
both:

- The Sowfield boarball stadium (the Vale Cup minigame's home) is REMOVED
  from the game.
- The Copper Dig (the tunnel rat diggers' mine) is MOVED out of the basin
  flank. DONE: phase 0 shipped in this PR's foundation commits, see section 4.

Everything else in this plan happens as sub-work on the epic branch, by any
contributor, one concern per PR, gate green at every merge
(`node scripts/gate_select.mjs`).

## 2. How to contribute to this epic

- Branch a worktree off `feature/eastbrook-v0.39.0`, land your slice back into
  the epic branch as a focused PR. Never straddle a release boundary; regen
  artifacts ride at the tip of each slice (the castles-port discipline).
- Claim a work item by editing its checkbox line in the epic PR description
  (add your handle), so two people never demolish the same wall.
- The three-class pipeline applies: docs are Class A (merge fast), text-only
  content wiring is Class B, world-mutating changes are Class C (full
  content-obligations checklist, parity re-records, one concern per PR).
- Compass convention, stated once because it bites: in this world +z is north
  and +x is WEST, so east is negative x. The Copper Dig at negative x is
  southeast of town. Screen-space "west" in older docs (the Vale Cup PRD) is
  in-fiction east.

## 3. The land plan

The reserved New Eastbrook footprint, as of this foundation (the build-out
phase may refine it):

- The Sowfield parcel: the stadium's decoration-exclusion shell,
  `SOWFIELD_EXCLUDE` in `src/sim/vale_cup_layout.ts` (x [-66, 44],
  z [-151, -73]). A flat, buildable 90 by 66 basin at height -2.6 once the
  stadium goes, with its own terrain plateau arm already shaping it.
- The freed dig flank: the old Copper Dig cluster's ground on the basin's
  northeast shoulder, x [-104, -65], z [-82, -29]. Cleared by phase 0.
- The approach: the unroaded x = 0 column from the town's south wall past
  Reliquary Hill (POI at (-5, -52), the Collapsed Reliquary delve door and
  ruin ring) and the Vale Chapel Yard graveyard at (4, -56). Those three
  landmarks stay; they become New Eastbrook's northern neighbors.
- Standing neighbors that do NOT move: the bandit camps and Gorrak (x +50 to
  +95), the Sableweb spider camp, the extended mine road (it now runs through
  the freed flank out to the dig headland, and the town build should adopt
  it as its southeast road).

## 4. Phase 0, DONE in this PR: the Copper Dig relocation

The whole mine cluster translated rigidly by (-60, -24) to a new coastal
headland, keeping every intra-cluster distance, the town bearing (still
southeast, so no quest or guide text changed), and the camp's radius/count.

| Piece | Old | New |
|---|---|---|
| POI `copper_dig` (`ZONE1_ZONE.pois`, index 5) | (-84, -64) | (-144, -88) |
| `tunnel_rat` camp (ZONE1_CAMPS, index 8, in place) | (-82, -62) | (-142, -86) |
| Grix the Tunnelking camp (`src/sim/data.ts` CAMPS tail) | (-95, -78) | (-155, -102) |
| Mine portal prop (`ZONE1_PROPS.mines`) | (-88, -68) | (-148, -92) |
| Camp campfire | (-80, -60) | (-140, -84) |
| Ore veins `ore_eastbrook_1..6` | 20 yd ring on the POI | same ring, translated |
| Mine road (`ZONE1_ROADS`, southeast) | ended (-70, -55) | extended to (-132, -82) |

Because the vale's southeast held no dry land big enough for the camp's 33 yd
scatter disc (the old site was the only 36 yd dry pocket in the quadrant),
the relocation AUTHORS its ground, using two existing mechanisms:

- A new coast lobe in `VALE_LAND_LOBES` (`src/sim/world.ts`): "the dig
  headland", centered (-138, -95) r 58. Landness only; it makes the ground
  land instead of open sea for the map, water rules, and the coast applier.
- A `mode: 'level'` terrain stamp `COPPER_DIG_TERRAIN_EDITS`
  (`src/sim/content/zone1.ts`, merged into the builtin world's `terrainEdits`
  beside the jail's): holds the site at working grade (-0.6, smooth falloff,
  r 70). Stamps apply after the coast in `terrainHeightUnpadded`, so the
  headland cannot be drowned back.

Consequences carried in the same change:

- `ONLINE_WORLD_LAYOUT_VERSION` bumped 6 to 7 (`src/world_api.ts` states the
  rule: a differently shaped authoritative world is a new epoch), with the
  script mirror `scripts/lib/world_auth.mjs`.
- Test re-pins, each annotated at the site: the camp left the starter band so
  it left `tests/eastbrook_camp_spacing.test.ts`'s governed set; literal
  coordinate pins moved in `tests/eastbrook_gameplay_integration.test.ts`,
  `tests/editor_persist.test.ts`, `tests/fixes.test.ts`,
  `tests/gather_tool_use.test.ts`, `tests/map_window_view.test.ts`,
  `tests/gather_node_placement.test.ts` (the Grix counter-example pair), and
  the parity scenario teleport in `tests/parity/scenarios.ts`.
- Regenerated at the tip: six parity goldens (world-gen rejection sampling at
  the new site shifts the shared draw stream; diffs are value-shaped only,
  and `professions_gather` keeps its `poi:eastbrook_vale:copper_dig` visited
  mark), the terrain-height parity fixture, and the `eastbrook_vale` +
  `world_strip` map plates (`npm run assets:mapbg`; the other zones' plates
  differ from this machine's encoder only and were deliberately restored).
- Verified green: `tests/gather_nodes.test.ts`,
  `tests/gather_node_placement.test.ts`, `tests/copper_dig_pathing.test.ts`
  (real-sim spawn + melee reach at `WORLD_SEED`),
  `tests/eastbrook_camp_spacing.test.ts` (spawnability probe at the new
  site), the compass-truth and quest-direction suites (unchanged text still
  true), threat, guide freshness, and the full parity suite.

## 5. Phase 1, OPEN: remove the Sowfield and retire the Vale Cup

Removing the stadium removes the minigame's only venue, so this phase retires
the whole feature. It is far too entangled for one commit: the surface is
roughly 9k LOC of dedicated modules, 6k LOC of dedicated tests, and about 200
other files with references. The work splits into the claimable slices below;
each slice must leave the gate green, which sometimes means a slice carries a
temporary shim the next slice deletes.

Before any slice lands, read section 6: several removal decisions are the
maintainer's, and slices S5 to S7 depend on them.

- [ ] S1 world/render shell: delete the physical stadium. The terrain flatten
  arm + stand lift + decoration exclusion in `src/sim/world.ts` (and the
  `sowfieldFlatten` slot in `src/sim/terrain_region_index.ts`), the collider
  push in `src/sim/colliders.ts` (lower the monolith ceilings in
  `tests/monolith_budget.test.ts` after each extraction-by-deletion), the
  calm-anchor pad, `src/render/vale_cup_stadium.ts` and its renderer wiring,
  the place-keyed sky, foliage/grass/motes suppressions, world audio bed, and
  `src/game/instance_music.ts` gates. Regen: terrain parity fixture, map
  plates, parity goldens.
- [ ] S2 sim feature: `src/sim/social/vale_cup.ts` + `vale_cup_bots.ts`, the
  ball (`src/sim/vale_cup_ball.ts`, mob record, entity cadence carve-out),
  sport abilities in `src/sim/content/vale_cup.ts` and their effect-dispatch
  arms, the tick phase (it draws ZERO shared rng, so its removal is
  draw-order safe by the same rule that let it append), the `vcup` SimContext
  callbacks (their removal needs a maintainer note: the callback registry is
  append-only by stated intent), hostility/damage-truce arms, cross-system
  exclusions in arena/yumi/card_duel/unstuck.
- [ ] S3 wire and server: the `IWorldValeCup` facet, both world
  implementations, the six `vcup_*` dispatch cases, delta keys
  `vcup`/`vcupb`/`sport`, the realm-readout memo tenant, presence name, kick
  paths, `scripts/vale_cup_online_probe.mjs`. Re-pin: `IWORLD_MEMBERS`,
  `FACET_MEMBER_ARRAYS`, `ALL_DELTA_KEYS`, `EXPECTED_DISPATCH_COUNT`,
  `CALLBACK_KEYS` (values as of the v0.39.0 base are tabled in the epic PR
  description).
- [ ] S4 UI: the thirteen `src/ui/vale_cup_*` modules, hud.ts construction
  and update sites, the 'sport' hotbar form, the KeyY keybind, gossip button,
  DOM nodes in `index.html`/`play.html`, mobile CSS, i18n catalog blocks
  (`hud_chrome.ts` vcup block, guide keys) with `npm run i18n:gen` regen.
- [ ] S5 POI index 10: remove "The Sowfield" from `ZONE1_ZONE.pois` WITHOUT
  shifting The Farshore Causeway off index 11. Locale keys are positional
  (`entities.zones.eastbrook_vale.pois.N.label`) and
  `src/ui/server_i18n.ts` hardcodes `poiIndex: 10`, so this slice must
  renumber every locale overlay row and the admin mirror in the same change,
  or the maintainer pre-approves a tombstone entry. Decide with section 6.
- [ ] S6 content obligations: the 11 vale cup deeds, the Boarball Legend
  Reliquary title row, Steam/Epic achievement maps, daily-rewards task type
  and its two renderers, guide page + routes + `npm run wiki:content`,
  sitemap regen, deed art files and `src/ui/deed_image_ids.ts`, the icon
  glyph. Blocked on section 6 decisions.
- [ ] S7 assets and audio: the two Sowfield music tracks + music zone +
  mix-policy flag, the two SFX (manifest regen via `npm run sfx:manifest`),
  the two HDRs, ball portraits/webp art, `CREDITS.md` rows. Check
  `docs/achievements/` provenance records stay as history (they are records,
  not live pins, except `vale-cup-ball-portrait` which
  `tests/vale_cup_ball_portrait_art.test.ts` pins until S8 removes it).
- [ ] S8 tests and docs: delete the 18 dedicated suites, sweep the ~68
  brushing suites, regen `scripts/ci_shard_weights.generated.json`, update
  `README.md`/`DESIGN.md`/CLAUDE.md mentions, and mark
  `docs/prd/vale-cup.md` superseded (done in this foundation) plus
  `bot/logic.ts` + `server/discord_activity.ts` Discord surfaces.
- [ ] S9 Groundskeeper Bram: decide his fate in section 6 (delete, or rehome
  as a New Eastbrook NPC; he is a full NPC record with voice lines).

## 6. Decisions that are the maintainer's (do not guess in a slice)

1. Player-earned records: the 11 vale cup deeds sit in players' persisted
   `deedsEarned` with Renown attached, and `pvp_vcup_wins_25` grants the
   "Boarball Legend" title (a locked glossary term). Deleting the deed
   catalog rows wipes earned progress; the shipped-content precedent
   (`RETIRED_HEROIC_ITEMS`) suggests RETIRING instead: keep the records,
   remove every acquisition path. The deeds table is append-only by its own
   header, which argues retirement too. Needs an explicit call.
2. The eight persisted `vcup*` meta counters in player saves: migration,
   or dead-field tolerance.
3. Steam/Epic achievements already unlocked externally cannot be revoked:
   confirm the mapping just goes dark (and new unlocks become impossible).
4. Daily-rewards ledger rows of type `vale_cup_result` already in the
   database: keep the two renderers as tolerant dead branches, or migrate.
5. The Vale Cup nation lore (eight banner nations, the Copper Pail, Marshal
   Redbrook's harvest truce): worth carrying into New Eastbrook's lore as
   history? The Sowfield's "the goal was once a grave" hook in
   `docs/design/world-lore.md` suggests the site's story continues. Pairs
   with the ORKADIA "Undreamt" precedent in the lore rework plan.
6. Bram's rehoming (S9), and whether a future venue elsewhere ever revives
   boarball (affects how aggressively S2 deletes vs quarantines).

## 7. Phase 2, OPEN: build New Eastbrook

Deliberately unplanned here beyond the land plan: the town's program (what New
Eastbrook IS: districts, buildings, walls, services, NPC moves) is design
work the epic's contributors and the maintainer shape together. What is
already decided:

- The build follows the shipped town-rebuild pipeline: a measured site plan
  and locked gameplay contract first (`docs/design/fenbridge-rebuild/
  master-plan.md` is the template), GLBs through the `image-to-glb` skill and
  `docs/image-to-glb-asset-workflow.md`, the Eastbrook surface atlas reused,
  before/after screenshots under `docs/screenshots/`.
- Terrain authoring for the basin should prefer the data lanes phase 0 used
  (coast lobes + `terrainEdits` stamps) over new bespoke world.ts arms, and
  it inherits the Sowfield parcel's plateau only until S1 deletes that arm.
- Every layout-shaping slice bumps `ONLINE_WORLD_LAYOUT_VERSION` (or rides a
  slice that does).
- Content obligations apply per slice: deeds for new conquerable content,
  reliquary pages for unique loot, wiki regen, world-entity i18n names,
  webp art per new item id.

## 8. Regen lanes cheat sheet (every slice needs some of these)

- Gate: `node scripts/gate_select.mjs` (needs a real pnpm on PATH for turbo).
- Parity goldens: `UPDATE_PARITY=1 npx vitest run tests/parity`, then a plain
  verify run; diffs must be value-shaped unless the slice explains why not.
- Terrain fixture: `UPDATE_TERRAIN_HEIGHT_PARITY=1 npx vitest run
  tests/terrain_height_parity.test.ts`.
- Map plates: `npm run assets:mapbg`; commit only plates whose content
  changed (cross-machine encoder bytes differ on the rest).
- Wiki: `npm run wiki:content` (+ `npm run wiki:stills` for new models).
- i18n: `npm run i18n:gen`; contributors touch English catalogs only.
- SFX manifest: `npm run sfx:manifest`.
- Shipped-item golden: `UPDATE_SHIPPED_ITEMS=1` only at a release re-mint.
