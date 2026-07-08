# Rifts: procedural infinite dungeons + ranked world portals

A seed-driven, infinitely varied instanced dungeon system ("Rifts"), parallel to
the hand-authored dungeons and delves but in its own coordinate band. Everything
about a rift (geometry, visual style, mobs, boss, mechanics) is regenerated
deterministically from a compact descriptor, so the authoritative server and
every client produce byte-identical content and only the descriptor crosses the
wire, the same model as `terrainHeight(x,z,seed)`.

This doc is the map of the system: where each piece lives, the rules, and the
tests that pin them.

## The two halves

1. **The rift itself** (`src/sim/rift/`): the pure generator plus the per-run
   lifecycle. Entered from a portal, descended floor by floor, ends on a boss.
2. **World portals** (`src/sim/rift/portals.ts`): a scheduler that opens ranked
   (C/B/A/S) portals across the three overworld zones on a timer, announces them,
   and pays out when a rift is cleared.

## Generation (deterministic, descriptor-driven)

- `rift/rift_gen.ts` is a PURE generator. A floor is `generateRiftFloor(seed,
  baseLevel, floorIndex)`: room geometry (`shellPolygon` star-shaped rooms with a
  plain-hall fallback), an `InteriorStyle` colour/fog grade over one of the KayKit
  kits, a spawn plan, a gate (clear-to-open, rune-pylons, ice-slide, boulder-push,
  or a step-in-order sequence), optional lava / rolling-boulder hazards, an
  always-available way-out beacon, and the boss on the last floor. See "Floor
  variety" below. `generateRiftPlan(seed, baseLevel)` names the rift and gives its
  floor count.
- **Determinism invariant.** The generator uses its OWN `Rng` seeded from the
  descriptor, NEVER the live sim rng, so generating a rift never perturbs the
  global draw order the rest of the sim depends on. (Rift content is also never in
  the golden parity traces.)
- Because both hosts run the same generator from the same descriptor, only
  `{seed, baseLevel, floorIndex, origin}` (`RiftDescriptor`) travels over the
  wire; the renderer regenerates geometry from it.

## Run lifecycle (`src/sim/rift/runs.ts`, behind the `SimContext` seam)

State lives on `Sim` as live `ctx` views (`riftInstances`, `riftPortalIds`,
`naturalRiftPortals`, `riftPortalSpawnCount`); behaviour lives in the module. The
per-tick drivers `updateRiftTriggers` (walk-in/descend/exit/pylon triggers) and
`updateRiftInstances` (gate progression + empty-slot cleanup) are called from
`tick()`; `enterRift`/`leaveRift`/`descendRift` are on the seam for the dev
command + interaction click paths.

- **Enter:** walking into (or clicking) a `rift_portal` object calls `enterRift`
  with the portal's descriptor. A party sharing a portal shares the instance.
- **Level 20 gate.** Every rift is endgame: `enterRift` refuses a player below
  `RIFT_MIN_LEVEL` (20) with a localized denial line, in EVERY zone (the Eastbrook
  portal exists for low levels to see, but turns them away). The gate is applied on
  the portal path only; a direct programmatic `enterRift` (tests) is not gated.
- **Descend:** clear the floor (kill the trash AND solve its puzzle: light the
  pylons, slide onto the frost sigil, socket the boulders, or step the sequence) to
  open the descent; walk onto it to regenerate the next floor in place and teleport
  the whole party there. Stuck or overwhelmed? The entry beacon takes you home.
- **Boss + exit:** the final floor's exit opens only when the boss dies.
- **Leave / death:** walking into the exit returns you to the overworld return
  position; dying sends your spirit to the overworld cemetery nearest where you
  entered. The return position is pushed clear of the portal's walk-in radius and
  a short re-entry grace is set, so leaving never bounces you back in (regression
  in `tests/rift_sim.test.ts`).
- **Collision.** A floor's collision comes from its generated layout, published to
  a per-`Sim` region registry in `colliders.ts` keyed by a per-instance
  `riftCollisionToken` (NOT the world seed, so two same-seed `Sim`s in one process
  stay isolated).

## Floor variety: puzzles, hazards, and the way out (v3)

Every non-boss floor layers ONE headline mechanic on top of the clear-the-room
requirement, so an endless run never reads as the same corridor twice. All of it is
generated from the floor descriptor (pure, deterministic) and placed on or around
the always-clear central spine (`|x| <= AISLE_HALF`), so the entry-to-dais path is
always walkable and every puzzle is solvable by construction.

- **Layouts.** A `corridor` room archetype (thin winding passage) joins the shape
  set, and other floors may grow one-sided baffle walls: alternating stubs that
  force a serpentine path without ever crossing the spine.
- **Puzzles** (`RiftPuzzleKind`, `planPuzzle`), each gating the descent exactly like
  a full set of lit pylons (`puzzleSolved`):
  - `rune_pylons`: walk onto every pylon to light it (pre-v3).
  - `ice_slide` (FFX / Pokemon): the floor carries a frictionless `iceZone`; moving
    onto it flings you along your heading until a wall stops you (reuses the swept
    `resolveMovement` resolver). Stop on the Frost Sigil to solve it.
  - `boulder_push` (Pokemon Strength): shove each heavy boulder one heading-step at a
    time onto its socket pad; every socket filled solves it.
  - `sequence` (Simon / pattern memory): step the runes south-to-north; a skipped
    step goes dark and resets to the start.
- **Hazards.** `planHazards` lays molten lava bands (the delve blackwater damage
  model, `tickRiftHazards`, 1 Hz, jump to clear); `planRollers` sends a rolling
  boulder down the spine (`advanceRiftRollers`, 20 Hz motion; overlap bowls you
  aisle-ward and chips HP on a short cooldown; jump to clear). A floor carries at
  most one of lava / roller / ice, never a pile-up.
- **The way out.** A `rift_beacon` at the floor entry returns you to the overworld
  any time (walk-on or click), so a run is never a dead end (too hard, stuck, lost).
- **Victory gate.** The post-boss exit renders as the same "dimensional gate" GLB as
  the overworld portal, tinted by the run's rank (`exit.riftTier`), so beating the
  giga-boss tears the way home open rather than dropping a plain stone arch.
- **Render.** Puzzle props (pylons, frost sigil, boulders + sockets, sequence runes,
  the beacon, the roller) are procedural bodies in `buildRiftPuzzleProp`
  (`src/render/door_portal.ts`); lit/placed states swap by `templateId` (the view
  rebuilds on change), glowing nodes spin, and the roller rolls with its motion. The
  lava/ice floor overlays are drawn by `buildInterior` (`src/render/dungeon.ts`).

## Ranks (C / B / A / S) and world portals (`src/sim/rift/portals.ts`)

A scheduler opens ranked portals automatically. Tuning is `RIFT_TIER_INFO` plus the
`RIFT_PORTAL_*` constants at the top of the module.

- **Cadence.** First portal ~2 min after boot (so a fresh realm is not empty),
  then one roughly every `RIFT_PORTAL_INTERVAL` (~3 hours of sim time, which is
  real time on the 20 Hz live server); at most `RIFT_PORTAL_MAX_OPEN` (3) open
  world-wide. Enabled by `SimConfig.riftPortals` (on for the live server and the
  offline client; OFF by default so tests / parity / the RL env stay portal-free).
- **Determinism.** Each spawn rolls zone, rank, position and rift seed from a
  DEDICATED `Rng` derived from `(worldSeed, spawnOrdinal)`, never the shared
  stream, so adding the scheduler shifts no existing draw order.
- **Zone -> rank pool** (`riftTierForZone`): Eastbrook Vale rolls only C, Mirefen
  Marsh B/A, Thornpeak Heights A/S. The rank sets the generated dungeon's
  `baseLevel` (C=20 up to S=28, so B+ runs above the level cap) and the reward.
- **Lifecycle:** a portal ANNOUNCES world-visibly on open, stays until its rift's
  final boss dies (SEALED) or `RIFT_PORTAL_LIFETIME` (1 h) passes uncleared
  (COLLAPSED), each with its own world announcement.
- **Rewards.** Sealing a ranked rift pays Heroic Marks scaled by rank (C=1 ... S=4)
  onto the boss corpse as personal loot, daily-gated per rank via the same
  `meta.heroicDaily` set the heroic dungeons use (key `rift_<tier>`). Dev-portal
  runs (tier null) seal nothing and pay nothing.

## Client sync + render

- `IWorld.riftFloor` (`RiftFloorView`) + a `riftState` event carry the descriptor
  to the client; the renderer regenerates geometry/fog from it. `riftCollisionToken`
  is on `IWorld` for the renderer's camera occlusion (0 on the online `ClientWorld`,
  which never registers rift regions; the server owns collision).
- The world portal renders a bespoke "dimensional gate" GLB
  (`public/models/props/rift_portal.glb`, in the boot preload) via
  `buildRiftGateBody` in `src/render/door_portal.ts`, with a rank-tinted swirling
  energy membrane filling the opening. The rank shows as a floating C/B/A/S badge
  (`src/render/rift_rank.ts`). The rank COLOUR is the single source `RIFT_TIER_COLORS`
  (`src/sim/types.ts`), shared by the gate shimmer, the badge, and the chat alert.
- The rank on the wire is the terse `rt` field (render-only, see `server/game.ts`
  `identityFields` + `applySnapshot` in `src/net/online.ts`).

## i18n

`src/sim/` is language-agnostic: rift player text is emitted as English literals
and re-localized client-side by `sim_i18n.ts` (the `sim.rift.*` keys + matcher
RULES). `src/sim/rift/runs.ts` and `rift/portals.ts` are under the S3 drift guard
(`tests/localization_fixes.test.ts`), so a new rift emit with no matcher fails CI.
Mob names are fully localized incl. the five non-Latin fills; the C/B/A/S rank
LETTER is a game glyph (like item-quality colour), not translated.

## Dev commands (gated by `ALLOW_DEV_COMMANDS`, never in production)

- **`/dev portal [seed] [level] [C|B|A|S]`** spawns a walk-through portal in front
  of you. Fresh seed each time (or a fixed one), level defaults to yours, and an
  optional rank letter forces the tier (colour + badge); omitted, a random rank is
  rolled so a dev portal always shows its coloured shimmer and letter.
- **`/dev god`** toggles invulnerability; **`/dev smite`** toggles one-shot mode.
  Handy combo to tour the giga-boss rifts solo: `/dev god`, `/dev smite`,
  `/dev portal`, walk in.

## Tests (the coverage map)

- `tests/rift_gen.test.ts`: generator determinism / variety / playability /
  balance, shape variety, boss-arena fit.
- `tests/rift_mechanics.test.ts`: the v3 variety (generator surfaces every puzzle +
  hazard kind, boss floors stay clean, ice-goal solve, boulder socketing, sequence
  step + reset, the way-out beacon, lava damage, and the rolling boulder's motion +
  knockback).
- `tests/rift_sim.test.ts`: full enter/descend/boss/exit lifecycle, rotated-OBB
  clearance matching runtime `pushOut`, two-`Sim` collision isolation, the
  entry-zone graveyard on death, the client-sync `riftState` event, and the
  leave-does-not-bounce-back-in regression.
- `tests/rift_portals.test.ts`: zone->rank mapping, monotonic rank tuning, the
  scheduler (cadence + world announce + determinism + collapse), the level-20
  gate (deny + admit + rank stamping), and sealing paying rank-scaled Heroic Marks
  with the per-rank daily gate.
- Cross-cutting guards that also cover rifts: `tests/world_api_parity.test.ts`
  (the `riftFloor`/`riftCollisionToken` IWorld members), `tests/architecture.test.ts`
  (sim purity + the `rift_rank`/render pure-core registration), `tests/sim_context.test.ts`
  + `tests/entity_roster.test.ts` (the seam stubs), and `tests/localization_fixes.test.ts`
  (S3 rift emit drift).

## Known scope / deferred

- Rift state is ephemeral (not persisted), appropriate for an event-driven world
  feature; a portal open at server restart is simply re-scheduled.
- **Dungeon break** (an uncleared portal spilling mobs into the overworld) is
  deferred: the design intent is to build a whole new zone around that mechanic
  (NPCs aware of the breaks, defend-the-town). The open/sealed/collapsed portal
  lifecycle here leaves the seam for it.
- **Lockpicking** in rifts is deferred: the lockpick engine (`src/sim/lockpick.ts`)
  is reusable, but its controller (`src/sim/delves/lockpick_controller.ts`) is bound
  to the delve-run seam (`ctx.delveRunForPlayer`, the `locked_chest` interactable
  state, the session stored on a `DelveRun`) plus its own wire + HUD sync. Reusing
  it in rifts means generalizing that host, which is its own focused change.
- **True multi-level verticality** (stacked floors with real stair collision) is
  deferred: collision here is a single-valued height field sampled by
  `groundHeight(x,z,seed)`, which cannot derive a rift's per-floor height field from
  position alone (rifts sit at runtime-mapped dynamic origins, unlike the
  fixed-location Vale Cup stand-lift). Changing that core seam touches all three
  hosts and risks the determinism / parity invariant, so it warrants its own PR.
  The v3 layouts get their "verticality" feel from mazes, baffles, and the raised
  boss dais instead.
