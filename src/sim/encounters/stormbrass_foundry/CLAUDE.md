# src/sim/encounters/stormbrass_foundry: the Stormbrass Foundry encounters

The NEW level 19 to 20 five-player dungeon on the storm line of Stormcrag
(`docs/design/dungeon-rework/stormbrass_foundry.md` on the `design/dungeon-rework`
branch), ticked once per claim by `tickFoundryEncounters` (`index.ts`), called
from `instances/dungeons.ts` `updateInstances` right after the Temple's.

Built in three phases. Phase 1: the map, every pack and patrol, the trash kits,
the Gantry Hauler. PHASE 2 (this state): the four boss cores, one module each,
with their loot, deeds, Reliquary pages and the quest chain. Phase 3: the Blender
kit, the creatures and the VFX keyed on the cast, aura and object template ids
in `ids.ts`.

| Module | Role |
|---|---|
| `ids.ts` | Leaf: the dungeon, boss and showpiece ids, every cast, aura and object template id, the tuning of all five encounters, and the pure geometry (`beltIndexAt`, `inPressStrip`, `pressRailStops`, `pressStripCentre`, `walkwayStrips`, `ventFloors`, `onWalkway`, `bunkerLeeAt`, `platingFor`, `platingFacing`, `hatchStateAt`, `hatchStateOf`, `staticPerSecond`). The renderer, the HUD alert, the trash kit and the tests key on it. |
| `claim.ts` | The live Foundry claims and objects; the claim-generic reads are the Bastion's (`../sunken_bastion/claim.ts`), re-exported; plus `arenaPlayers`, `heavySwing` (a melee multiple through armor) and `bossTarget`. |
| `gantry_hauler.ts` | The Gantry Hauler (4.3): Steam Blast, Scrap Toss (never fired during a Steam Blast bar; a plate already in the air still lands if the Hauler falls), Unload. Boiler Rupture is its `trashKit.deathBurst`. Deed: Off the Rails. |
| `line_master.ts` | Line-Master Ambrel Tock (5.1, G19): four belts carry every body on them through `../../conveyor.ts` (`displaceAlong`, `resolveMove`); the lever (2 s klaxon, belts reverse; heroic Overtime 5 yd/s and Cross-Feed), the Stamping Press (every 7 s a carriage slides along its belt's overhead rail to a hashed belt rider: `paintStrip` paints an 8 yd strip on the fixed rail stop nearest the rider's z led by the belt's run, 2.5 s, knockdown, crushes a frame; heroic two carriages on two belts; never two strips on one belt), the Scalding Vents (`scalding_vents.ts`), Parts Drop (three booting Half-Built Frames at 70 and 40), the Rivet Gun. Belt state rides belt objects (template idle/run/alarm, facing = heading, scale = speed); the lever gauge is the `foundry_tock_pressure` aura clock. Deed: Quality Control. |
| `scalding_vents.ts` | Tock's Scalding Vents: every 10 s each walkway's strip object paints a 1.5 s warning (template warn), then scalds (template scald) everyone `onWalkway` a tick a second for 5 s. `onWalkway` is EVERY Main Line floor that is not a belt (`ventFloors`: the five walkways, the apron past the press end, the lip before the chute), the owner's call so the fight is fought on the belts and nobody tanks Tock on a safe apron; the renderer paints a lane on each of those floors; the walkway stander wears `TOCK_SCALDING_VENTS` (value2 0 warn, 1 scald; its clock is the phase's seconds left), which the HUD alert reads. |
| `rangewarden.ts` | The Rangewarden (5.2, G20): Target Lock marks two (heroic three) non-tanks for 8 s; each second a circle paints UNDER the marked player as they stand (a dim pending object, `FOUNDRY_SHELL_PENDING`), never moves, arms for its last 0.6 s (`FOUNDRY_SHELL_MARK`, the salvo windup) and lands on its own spot 2.1 s after it painted; the mark ends (no more circles) when the `RANGE_TARGET_LOCK` aura is gone, circles already painted still land; each bunker swallows three shells per lock in its lee; Proof Shot and Dented Plating; Drill Drones at 66 and 33; heroic Shrapnel. Deed: Clean Range. |
| `voltaic_warden.ts` | The Voltaic Warden (5.3, G21): Grounded or Charged plating auras (value2 1 = heroic Split Plating), a 3 s rattle bar and a flip every 15 s (heroic 10 s), Discharge on the flip, two plated Arc Drones every 25 s (the opposite face), Static Lash, Coil Strike. Deed: Grounded. The flip countdown rides the wire on the plating aura itself (`stampFlipClock`: `remaining` = the flip timer floored at 0.5 s, `duration` = the cycle, on the Warden and its drones, re-worn if stripped), so it survives a stunned flip. |
| `voltaic_plating.ts` | Pure guard asked by `combat/damage.ts` `dealDamage`: a wrong-kind hit from a player or pet is turned aside (a resist event, threat kept) and banked on the Warden. |
| `prime_draft.ts` | The Prime Draft (5.4, G12): Awakening bar, Bolted (a slow crawl at `DRAFT_TUNING.boltedSpeed`, clamped to `GANTRY.r - gantryMargin`, holding still only while waking and during its bars; Piston Fist, Arm Sweep), Unbolted at 70 (rivet shower, walks, Tremor Step), Heartless at 35 (Arc Surge, faster cycle), Overdrive below 15; the Charge Cycle and the Core Hatch window (closed, warn, open on the hatch ring object), Overload, arc back on a closed hatch, short out at 15 s; heroic Jammed Racks and Double Load. On death the Draft Record (`draft_record`, The First Draft's interact object) lies in its chest. Deed: Heartless. |
| `storm_cells.ts` | The carry: take a cell with the pick-up command (`interaction.ts` `pickUpObject` routes here), the carrier's aura (slow, stacks = Static a second, sourceId = the hatch ring), drop with the interact press (`interaction.ts` `interact`), the 3 s retake lock. |
| `index.ts` | The tick and `/dev foundry trigger` for every mechanic (blast, toss, unload; lever, press, parts, rivet, vents; lock, proof, drones; flip, discharge, platedrones, lash, strike; cell, overload, fist, sweep, unbolt, tremor, heartless, surge). |
| `workers.ts` | The chained workers (`content/stormbrass_foundry_workers.ts`): per run, three scrap camps (A the Rail Yard under g2, B the Range Lanes under g6, C the Gantry Approach under g12), spawned the first tick a claim is live. The workers are mob-kind bodies held inert by `encounterHeld`, carried on `inst.npcIds` (never `inst.mobIds`: no pack, gate, chain pull, clear or loot rule counts them). One state object per camp stands at its chain post (`Entity.foundryWorkerCamp`; its template id mirrors the phase: guarded, unguarded, freed). Guards dead: a worker calls out. `tryFreeFoundryWorkers` (the targeted interact press, `interaction.ts`; the gossip's "Free them" sends exactly that) strikes the chains: the workers become Freed Laborers, cheer, walk toward the lift and vanish; every holder of Free the Workers in the claim is credited; the third camp grants the deed Every Chain Struck. `/dev foundry workers [free <a|b|c|all>|reset]`. |

Rules:
- Deterministic: every pick is hashed (`kitHash`, `pickMarkTargets`) or entity-id / distance ordered; the only rng draws are damage rolls. Fixed DT countdowns; the Rangewarden samples a marked player's spot once a second, when the circle paints.
- Every visible state rides existing entity fields (cast bars, facing, auras, encounter object template ids and `scale`), so the online client mirrors it with no wire or IWorld change. New object templates join `FOUNDRY_OBJECT_TEMPLATES` (the renderer anchors them, `render/gate_objects.ts`) and get a floor spec in `render/stormbrass_foundry/foundry_fx_core.ts`; the HUD alert (`ui/hud/dungeon/foundry_alert_*`) reads the same auras.
- Reset on evade and wipe drops every mark, bar, strip, shell, cell and the hatch, stops the belts and clears the plating.
- The conveyor and other server-side displacement reach online players through movement reconciliation (no client-side belt prediction).
- Tests: `tests/stormbrass_foundry_tock.test.ts`, `..._rangewarden.test.ts`, `..._voltaic.test.ts`, `..._prime_draft.test.ts`, `..._alert.test.ts`, `..._quests.test.ts` (on `tests/helpers/foundry_fight.ts`), `..._trash.test.ts` (trash and the Hauler), `..._route.test.ts`, `..._dungeon.test.ts` (record, gates, seals, bossChainPull, dev jumps, every dev trigger), `..._tuning.test.ts`, `..._render_core.test.ts`, `..._workers.test.ts` (the camps, the gossip gate, the credit, the despawn, a reset, the dev commands) and `..._workers_render.test.ts` (the chain plan, the looks).

Naming originality (`src/sim/content/CLAUDE.md`, re-verified 2026-10-01 against
the design doc's section 10): every name in the design table stays except
"Clockwork Hound", an exact monster name in Dungeons and Dragons 5e and
Pathfinder, shipped as "Coilspring Hound" (the id `clockwork_hound` stays), and
the clear deed "Heart of the Storm" (a World of Warcraft item and quest name),
shipped as "Stormbrass Silenced" (the id `dgn_stormbrass_foundry` stays).
"Gearwright" appears only as a surname of minor tabletop and fan characters;
"Gearwright Apprentice" as a full name is clear. "Lift Warden Corwin Ashby",
the loot names ("Rangefinder's Lens", "Overclocked Governor" and the rest),
the deed names and the mechanic and aura names are generic English compounds,
clear at authoring.

"Scalding Vents" (Tock's walkway steam, the mechanic, aura and strip name),
web-checked 2026-10-02 (exact phrase plus the coined tokens against the major
game wikis): no game ability, item or place of that exact name; World of
Warcraft has only the unrelated zone "Scalding Chasm" and spells such as
"Thermal Vent" and "Venting Flames". A generic English compound: clear.

The chained workers (checked 2026-10-02, exact-phrase searches against the
major game wikis): "Chained Miner", "Chained Hauler" and "Freed Laborer" are
plain English descriptions with no use as a proper name in another game (World
of Warcraft has "Enslaved Miner", RuneScape Classic "Mining Slave": different
names; "thrall" was never used); the quest title "Free the Workers" and the
deed "Every Chain Struck" returned no game use. The quest giver stays Lift
Warden Corwin Ashby: he keeps the lift the freed walk to, and the dungeon's
quests are all taken from him in one stop at the door; a second giver on the
Lift Landing would split that stop in two for no gain.
