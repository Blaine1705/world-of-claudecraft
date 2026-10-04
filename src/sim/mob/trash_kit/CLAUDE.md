# src/sim/mob/trash_kit: dungeon trash mechanics

Simple, readable pack mechanics for five-man trash, in the style of classic
dungeon trash: an interruptible bolt, a raise or a call you must stop, a stun
shriek, a leap onto the healer, an add that grows if left alive, a statue that
dives off its perch, a flier that lands when pulled. Declared per template as
`MobTemplate.trashKit` (`src/sim/types.ts` `TrashKitDef`); first consumer: the
Hollow Crypt trash (`src/sim/content/hollow_crypt_trash.ts`).

| Module | Role |
|---|---|
| `cast_ids.ts` | Leaf: the cast ids and the interruptible ones' schools (`TRASH_KIT_CAST_SCHOOLS`, spread into `mob/healer_channel.ts` `SCRIPTED_INTERRUPTIBLE_CHANNELS`). |
| `targets.ts` | Pure: the hashed "random" victim, the leap's farthest-caster pick, the cone test. |
| `spawn.ts` | The zero-rng kit add spawner (raise, call, growth), with the claim's difficulty transform. |
| `cast_hold.ts` | A telegraphed area never moves with its caster: `holdAreaCast` plants the mob on the spot and the facing its area bar began with (screech, wing gust, tail lash, lane; and the template's breath cone where `DungeonDef.areaCastsPlant`), undoing the mob AI's step every tick until the bar lands or breaks. |
| `flier_call.ts` | `callDownLastFlier`: an idle flying patrol lands on the nearest player once every OTHER pack of a gate that waits on its pack is dead, so a gate can never stay shut behind a flier nobody pulled. |
| `sanctum_kit.ts` / `sanctum_cast_ids.ts` | The Gravewyrm Sanctum's keys: `goad` (an interruptible damage-done aura on one ally), `toss` (a ring locked under the farthest player, landing when the bar ends; physical, planted), `stoke` (a no-bar attack-speed pulse that gutters with its summoner); the Rime Whelp's slowing pop rides the shared `deathBurst` (`slow`). |
| `driver.ts` | `tickTrashKits`: one pass per tick over every claim's roster, after the mob AI (called from `instances/dungeons.ts` `updateInstances`). |

Rules:
- Every cast is a real cast bar on the mob; an interrupt, a stun or a silence
  cancels it, and the effect lands only when the bar runs out.
- An AREA cast (a ring, a cone, a lane) plants its caster for the whole bar
  (`cast_hold.ts`): the area lands where it was drawn, so stepping out of it is
  the counterplay. A targeted cast (bolt, mend, ward, lullaby) still tracks.
- Zero rng for targets and cadence; the only draws are a landing cast's damage
  rolls, in roster order.
- A pack's same-type casts alternate: each mob's first cast of an ability is
  offset by its pull rank over one interval (`../pack_cast_stagger.ts`, also
  used by the breath-cone seed); cadence and a lone mob's timing are unchanged.
  Tests: `tests/pack_cast_stagger.test.ts`.
- Kit state rides `Entity.trashKit` and dies with the pull (evade, reset,
  death). Flying patrols (`DungeonSpawnPatrol.altitude`) are flown by
  `mob/patrol.ts`; the landing and the perch dive are this module's.
- A flying patrol on the wing is nobody's target: the mob AI keeps `hostile`
  false while it waits more than `FLIER_OUT_OF_REACH` over the floor
  (`mob/patrol.ts` `flierWaitingAloft`, read in `mob/locomotion.ts`), so no
  swing, charge or spell reaches it from the ground; every pull path (its own
  sight, its pack, the boss chain pull, `flier_call.ts`) makes it a target the
  tick it is pulled. Its sight is its whole
  authored `aggroRadius` whatever the player's level (`flierSightRadius`), and
  pack pulls and the boss chain pull still take it (`patrolFlierAloft`). The
  renderer hides the ground reticle under it (`render/selection_ring.ts`).
- Tests: `tests/trash_kit.test.ts`.

## Engine pieces (generic keys any dungeon adopts by data)

Built for the Gravewyrm Sanctum's trash pass (2026-10-04) as GENERIC
`TrashKitDef` keys: a new dungeon adopts one by writing the record on its
template, registering a kickable cast id in its own `*_KIT_CAST_SCHOOLS`
table, and giving the object templates a look in the renderer. Every piece is
its own module behind the driver; the shared encounter objects (hazard pools,
combat walls, walkers) ride `Entity.kitObject` and are stepped once per tick
after the claim's mobs, in object-roster order (`kit_objects.ts`).

| Key / module | What it does | Adopt it |
|---|---|---|
| `usable` / `encounter_use.ts` (G3) | A body a player targets and uses with the INTERACT press: a non-spell channel (`KIT_USE_CAST_PREFIX` cast id: a landed hit, a step or a stun breaks it), validated on the authoritative sim at the press (`interaction.ts`), every tick (`casting_lifecycle.ts` updateCasting) and at completion. Effect `topple`: the body dies credited to the user and spills a hazard past it. No wire change: online it is the ordinary `interact` command. | `usable: { castId: 'kituse_<id>', name, channel, range, effect }` |
| `toss.leavesWall` / `combat_walls.ts` + `instances/combat_wall_state.ts` | A temporary COMBAT WALL: an object whose template names an OBB shape (`COMBAT_WALL_SHAPES`), published per slot into every interior collision reader (`interior_collider_sets.ts`), so it blocks bodies and line of sight; the online client mirrors it from the entity (`src/net/combat_wall_wire.ts`). Shatters after `seconds`. | add a shape row, then `leavesWall: { objectTemplate, name, seconds }` (or call `spawnCombatWall`) |
| `nova` / `kit_nova.ts` (G6) | A bar, then a blast on every player in `radius` who can SEE the caster (walls, pillars, combat walls shield); kickable through the cast table, every `unstoppableEvery`-th bar under an unregistered `unstoppableCastId`; optional `silence`. | `nova: {...}` + register `castId` |
| `walker` / `kit_walker.ts` (G5) | An orb that drifts to the nearest fighting ally and empowers it (a damage-done aura and/or a `healPct` heal); the first player within `interceptRadius` (after a 0.5 s arming) takes it instead (damage, and the empower when `grantsEmpower`). Launched at death or by a bar. | `walker: {...}` + an orb look |
| `cone.freezeStack` / `freeze_stacks.ts` | The "freeze at N stacks" slow: each application deepens one slow aura (`stacks`), the N-th freezes (a stun) and clears it. `applyFreezeStack` serves any hit. | `freezeStack: {...}` on a `cone` (or call it from any landing) |
| `cone` (driver) | A short-bar frontal cone at the one it fights, planted, never kickable. | `cone: {...}` |
| `split` / `kit_split.ts` | Once per pull under a health share it splits: the original shrinks and a copy (a summoned add, no loot) steps out, each with a share of what was left; a split body's death burst shrinks; an evade restores the original. | `split: {...}` |
| `reanimate` / `reanimate.ts` | An interruptible rite on the nearest unraised corpse of the listed templates: the summon climbs out where it lies. | `reanimate: {...}` + register `castId` |
| `brand` / `brand.ts` | An interruptible bar at a player in sight (never the tank while others stand in reach): a dot that the dungeon's quench zones (`DungeonDef.quenchZones`) put out the moment the victim stands in one; out of sight at the end, it fizzles. | `brand: {...}` + `quenchZones` |
| `breathPool` / `breath_pool.ts` + `kit_hazard.ts` | Where a template breath cone lands, a hazard pool ahead of the mob (`heroicOnly` optional). `KitHazardDef` is the shared pool: burns players (rolls) or the claim's trash (rolls, or `pctMaxHp` with no draw), never a boss or a control-immune great body. | `breathPool: {...}`; any module can `spawnKitHazard` |
| `engine_demo.ts` | The demonstration kit (a nova and a walker) `/dev trashkit demo` lends a mob through `Entity.devTrashKit`, never a template. | dev and tests only |

Dev helpers: `/dev trashkit` (`src/sim/dev/trash_engine_dev.ts`). Tests:
`tests/trash_engine.test.ts` (every piece, the server-validated use, the wall's
movement and sight block, determinism) and
`tests/gravewyrm_sanctum_trash_mechanics.test.ts` (the first consumer).
