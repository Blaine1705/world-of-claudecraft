# src/sim/encounters/wildheart_basin: the Wildheart Basin encounters

The reworked level-20 jungle caldera (`docs/design/dungeon-rework/wildheart_basin.md`
on the `design/dungeon-rework` branch), ticked once per claim by
`tickWildheartEncounters` (`index.ts`), called from `instances/dungeons.ts`
`updateInstances` right after the Foundry's.

Built in phases. PHASE A (this state): the field record
(`sim/content/wildheart_basin_layout.ts`, interior key `wildheart` on the shared
authored-field engine), every pack and patrol with its trash kit
(`mob/trash_kit/wildheart_kit.ts` for the totem pulse and the death cloud), the
seven gates, the Great Saurian's kit, and the three bosses as MELEE PLACEHOLDERS
in their finished arenas (the Beastmaster keeps his shipped Call of the Hunt,
Thickhide Ward and Beast Pit Quake; Zulgar keeps his Wildheart Pulse, Jaguar Roar
and enrage; the Gorgebloom and the jaguar only swing). PHASE B adds the cores,
one module each: `beastmaster.ts` (G15 linked pair: shared pool, Pack Bond,
Stalk; heroic Heel! and Frenzied Bond), `gorgebloom.ts` (Seed Rain on
`GORGEBLOOM_LOAM_BEDS`, Pollinate, Vine Lash lanes, Gorge; heroic Burrowing Seeds,
Pollen Cloud), `zulgar.ts` (Spirit of the Hunt on `SUN_GLYPHS`; heroic Twin Prey,
Ambush), with loot, deeds and the Reliquary.

| Module | Role |
|---|---|
| `ids.ts` | Leaf: the dungeon, boss, showpiece and trash ids, the Saurian's cast, aura and object ids, `SAURIAN_TUNING`, the howdah log line, the spore cloud object template. The content, the renderer, the dev helpers and the tests key on it. |
| `claim.ts` | The live Basin claims; the claim-generic reads are the Bastion's (`../sunken_bastion/claim.ts`), re-exported. |
| `great_saurian.ts` | The Great Saurian (4.3): Tail Swipe (1 s bar, rear 120 degree cone 12 yd, knockback), Earthshaking Stomp (2 s bar, 12 yd, 1 s knockdown), Howdah Rider (once at half health a Howdah Hexcaller jumps down and saps the Saurian with the trash kit's mend), Enrage (a `buff_dmg_done` aura under a fifth: the damage seam folds it into swings and strikes). Both clocks run through the other bar; it braces in place for a bar. |
| `index.ts` | The tick and `/dev wildheart trigger <tail|stomp|howdah|enrage>`. |

Rules:
- Deterministic: no pick is rolled (cones and rings take everyone inside); the only rng draws are damage rolls in claim-player order.
- Every visible state rides existing entity fields (cast bars, facing, auras, the rider's own body, `spellfx` with the cast ids, the spore cloud object's template and `scale`), so the online client mirrors it with no wire or IWorld change. The renderer drops the howdah from the Saurian model once the break `nova` fired or the Saurian is under half health in a fight.
- An evade or a wipe drops the bar, the state and the Enrage; a momentary target loss (`paused`) never replays the howdah break.
- Tests: `tests/wildheart_basin_route.test.ts` (no skipping, both wings, causeway, heights, patrols), `..._trash.test.ts` (every kit and the Saurian), `..._dungeon.test.ts` (record, live gates and seals, bossChainPull, every dev jump and trigger), `tests/wildheart_normal_tuning.test.ts`, `tests/wildheart.test.ts`, `tests/wildheart_boss_chain_pull.test.ts`, and the floor sweep in `tests/authored_field_floor_sweep.test.ts`.

Naming originality (`src/sim/content/CLAUDE.md`, checked 2026-10-02 against the
design doc's section 10): "Vine Lasher" is an exact Pathfinder 2e monster name
(and a League of Legends minion), so it ships as **Snarlvine Lasher** (the id
`vine_lasher` stays); "Snarlvine" returned no game use. Gorgebloom was clear at
design time. Great Saurian, Howdah Hexcaller, Basin Raptor, Spore Toad, Sunbone
Totem-Binder, Sunbone Totem, Plant Totem, Sunbone Mending, Pounce, Spore Burst,
Entangling Lash, Tail Swipe, Earthshaking Stomp, Knocked Down and Enrage are
generic English (Tail Swipe, Spore Burst, Entangling Lash and Earthshaking Stomp
appear as generic ability labels elsewhere, never as a distinctive coined
term); the gate names (West and East Vine Bridge, the thorn walls, the
Convergence Stair Ward, the Shrine Ward) are generic place compounds.
