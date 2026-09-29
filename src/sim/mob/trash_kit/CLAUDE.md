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
| `driver.ts` | `tickTrashKits`: one pass per tick over every claim's roster, after the mob AI (called from `instances/dungeons.ts` `updateInstances`). |

Rules:
- Every cast is a real cast bar on the mob; an interrupt, a stun or a silence
  cancels it, and the effect lands only when the bar runs out.
- Zero rng for targets and cadence; the only draws are a landing cast's damage
  rolls, in roster order.
- Kit state rides `Entity.trashKit` and dies with the pull (evade, reset,
  death). Flying patrols (`DungeonSpawnPatrol.altitude`) are flown by
  `mob/patrol.ts`; the landing and the perch dive are this module's.
- Tests: `tests/trash_kit.test.ts`.
