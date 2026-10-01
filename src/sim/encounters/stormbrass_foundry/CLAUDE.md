# src/sim/encounters/stormbrass_foundry: the Stormbrass Foundry encounters

The NEW level 19 to 20 five-player dungeon on the storm line of Stormcrag
(`docs/design/dungeon-rework/stormbrass_foundry.md` on the `design/dungeon-rework`
branch), ticked once per claim by `tickFoundryEncounters` (`index.ts`), called
from `instances/dungeons.ts` `updateInstances` right after the Temple's.

Built in three phases. PHASE 1 (this state): the map, every pack and patrol,
the trash kits, the Gantry Hauler's full kit, and the four bosses placed as
melee-only placeholders in their finished arenas. Phase 2 adds the four boss
cores (one module each, below) with their loot, deeds, Reliquary pages and the
quest chain; phase 3 the Blender kit, the creatures and the VFX.

| Module | Role |
|---|---|
| `ids.ts` | Leaf: the dungeon, boss and showpiece ids, the Hauler's cast ids and tuning, the encounter object templates. The renderer, the trash kit and the tests key on it. |
| `claim.ts` | The live Foundry claims and the Foundry's ephemeral encounter objects; the claim-generic reads are the Bastion's (`../sunken_bastion/claim.ts`), re-exported. |
| `gantry_hauler.ts` | The Gantry Hauler (section 4.3): Steam Blast (braced 1.5 s bar, 90 degree 12 yd cone, knockback), Scrap Toss (the farthest player within 45 yd, 5 yd mark, 2 s), Unload (three Arc Drones at half health, through the trash kit's add spawner). Boiler Rupture is its `trashKit.deathBurst`. |
| `index.ts` | The tick and `/dev foundry trigger` (blast, toss, unload). |

Phase 2 adds, beside these (do not grow `gantry_hauler.ts`):
- `line_master.ts`: G19 conveyor regions (belts in `MAIN_LINE_BELTS`, the press in `STAMPING_PRESS`, the chute in `PARTS_CHUTE`, all in `content/stormbrass_foundry_layout.ts`), resolved through `resolveMove`.
- `rangewarden.ts`: G20 trail salvo (a fixed-tick position history per marked player).
- `voltaic_warden.ts`: G21 conduction plating (damage-kind immunity with stored-damage release; needs a seam in `combat/damage.ts` dealDamage like the Temple's `reflection_guard.ts`).
- `prime_draft.ts`: G12 storm cells from `CELL_RACKS`, the Core Hatch window, three phases.
Each state rides `Entity.foundryFight` (`FoundryFightState` in `types.ts`, extend the union).

Rules:
- Deterministic: every pick is hashed or entity-id ordered; the only rng draws are damage rolls. Fixed DT countdowns.
- Every visible state rides existing entity fields (cast bars, facing, auras, encounter object template ids and `scale` as a radius), so the online client mirrors it with no wire or IWorld change. New object templates join `FOUNDRY_OBJECT_TEMPLATES` (the renderer anchors them, `render/gate_objects.ts`) and get a floor spec in `render/stormbrass_foundry/foundry_fx_core.ts`.
- Reset on evade and wipe drops every mark and bar (`endHaulerFight`).
- Tests: `tests/stormbrass_foundry_trash.test.ts` (trash kits and the Hauler), `tests/stormbrass_foundry_route.test.ts` (no skipping), `tests/stormbrass_foundry_dungeon.test.ts` (record, gates on deaths, seals, bossChainPull, dev jumps), `tests/stormbrass_foundry_tuning.test.ts` (both tuning rows).

Naming originality (`src/sim/content/CLAUDE.md`, re-verified 2026-10-01 against
the design doc's section 10): every name in the design table stays except
"Clockwork Hound", an exact monster name in Dungeons and Dragons 5e and
Pathfinder, shipped as "Coilspring Hound" (the id `clockwork_hound` stays).
"Gearwright" appears only as a surname of minor tabletop and fan characters;
"Gearwright Apprentice" as a full name is clear. "Brass Bolt" (the turret's
shot) and the gate names are generic English.
