# src/sim/encounters/gravewyrm_sanctum: the Ice Tomb of the Wyrm

The Gravewyrm Sanctum rework (`docs/design/dungeon-rework/gravewyrm_sanctum.md` on
the `design/dungeon-rework` branch): a hidden glacier cirque on Thornpeak, the
Quench, with Korzul frozen in its Calving Face. The map is the authored field
`src/sim/content/gravewyrm_sanctum_layout.ts` (key `gravewyrm_sanctum`); the mob
templates, spawns, packs, patrols, gates and story markers are
`src/sim/content/gravewyrm_sanctum.ts`; the dungeon record stays in
`src/sim/content/dungeons.ts` (shipped id, index 2, door (0, 858)).

| Module | Role |
|---|---|
| `ids.ts` | Leaf: the dungeon, boss and trash ids, the Sledge Tusker's cast ids and `TUSKER_TUNING`, the encounter object templates (`SANCTUM_OBJECT_TEMPLATES`: soulfire patches, toss rings, story markers) and the Calving Face's crack steps (`sanctumStoryTemplate`, `sanctumStoryStepOf`, `sanctumFaceStage`). |
| `claim.ts` | The live Sanctum claims, the Sanctum's own encounter objects, the planted hold; the claim-generic reads are the Sunken Bastion's, re-exported. |
| `sledge_tusker.ts` | The showpiece patrol (design 5.3): Tusk Sweep (frontal cone), Trample (a lane to the farthest player that stops short of a drop, then the charge), Spilled Braziers (three soulfire patches where its unhitched sledge tips, at the model's brazier spots), Enrage. Fight state `Entity.sanctumFight` (`TuskerFightState`). |
| `korgath.ts` + `korgath_state.ts` | Korgath the Bound (design 6.1, G23): four Seal Shackles (mob templates `SEAL_SHACKLE_IDS`, raised by the encounter, held untouchable until the pull) and the chain state objects (`sealChainTemplate`); Lockbound (`buff_dr` 0.2 per intact chain), the 10 yd leash until the Anvil chain breaks, the four freed abilities (Maul Arc, Chain Flail, Threshold Charge, Foreman's Bellow), Strain on the intact pillars, the telegraphed Stomp, heroic Re-rivet and Last Link, the deeds, his lines. `korgathChainsBroken` feeds the story's steps 2 to 5. Tuning `KORGATH_TUNING` (boss_ids.ts). |
| `story.ts` | The Calving Face's crack step (design section 3), latched per claim into the template id of the run's story markers (`STORY_MARKERS`): 0 arrival, 1 Tusker dead, 2 to 5 Korgath's chains (phase B), 6 Korgath dead, 7 Velkhar dead, 8 Korzul pulled. Monotonic; a freed claim drops the markers. |
| `velkhar.ts` + `velkhar_state.ts` | Grand Necromancer Velkhar (design 6.2): the Waking Thaw from the three pools in turn (a `SANCTUM_PYRE_FLARE` roar 1.5 s early), the kept 66 and 33 percent waves from the pools (the template has no `summonAdds`; a Velkhar dragged out of his vault raises them beside him), the death-site rule G24 (Held: a `SANCTUM_HELD_STATUE`; Unquenched: a `SANCTUM_UNQUENCHED_RING`, a rise 4 s later at 60 percent, the tithe heal), Grasp of the Thawed, the Soulfire Trench (`SANCTUM_TRENCH_LANE` then `SANCTUM_MELT_STRIP`), Shadow Volley, heroic Warm Hands and Twice-Woken. Stay Buried waits on sunk Bonewalkers (`setBossAddPendingForDeeds`); Cold Comfort is granted at his death. |
| `meltwater.ts` | Pure: is a point in meltwater (a pool, a live strip, a heroic puddle), and a ray's reach to the vault's rim. |
| `index.ts` | `tickSanctumEncounters` (called from `instances/dungeons.ts` after the trash kit) and the public surface. |

The trash kit's Sanctum keys (`goad`, `toss`, `stoke`, the death burst's `slow`)
live in `src/sim/mob/trash_kit/sanctum_kit.ts` and `sanctum_cast_ids.ts`. Dev
helpers: `src/sim/dev/gravewyrm_sanctum_dev.ts` (`/dev sanctum`).

Phase A (this directory today): the map, every pack and patrol with its kit, the
Tusker, the story steps, and the three bosses as PLACEHOLDERS in their finished
arenas (ids, pools and seals; they keep only their shipped kits: Korgath's
Shuddering Stomp and enrage, Velkhar's 66 and 33 percent Bonewalker waves,
Korzul's Grave Inferno and enrage). Phase B adds `korgath.ts` (G23 restraint
parts on `SEAL_PILLARS`), `velkhar.ts` (G24 death-site rule on `THAW_POOLS`),
`korzul.ts` (G25 plate floor on `LAKE_PLATES`, G26 flights), raising
`story.ts` steps 2 to 5 through `earnedStoryStep(ctx, inst, chainsBroken)`.

Rules:
- Zero rng in every pick; the only draws are damage rolls, in claim-player order.
- Every visible state rides existing entity fields (cast bars, a locked facing,
  auras, encounter objects, `spellfx`), so the online client mirrors it with no
  wire change. The Calving Face reads the story markers' template ids.
- Mechanic damage is stated LANDED (the normal tuning row's mechanic factor 1).

Naming (IP check at authoring, 2026-10-03): every new name was cleared in the
design's section 11 (Thawcaller, Goadsmith, Sledge Tusker exact-searched; the
rest generic English or glaciology terms). "Ice Tomb" is never a display name.

Tests: `tests/gravewyrm_korgath.test.ts` (Korgath's core), `tests/gravewyrm_velkhar.test.ts` (Velkhar), `tests/gravewyrm_korzul.test.ts` (Korzul), `tests/gravewyrm_sanctum_route.test.ts` (route contract, heights,
arenas, story marker reach), `tests/gravewyrm_sanctum_trash.test.ts` (kits, the
Tusker, the story steps, `/dev sanctum`), `tests/gravewyrm_normal_tuning.test.ts`.
