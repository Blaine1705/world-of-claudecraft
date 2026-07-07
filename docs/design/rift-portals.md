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
  kits, a spawn plan, a gate (clear-to-open or rune-pylons), and the boss on the
  last floor. `generateRiftPlan(seed, baseLevel)` names the rift and gives its
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
- **Descend:** clear the floor (kill trash and light any rune pylons) to open the
  descent; walk onto it to regenerate the next floor in place and teleport the
  whole party there.
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
