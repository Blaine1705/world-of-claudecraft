# src/render/wildheart_basin: the Wildheart Basin's open-air renderer

The render half of the Wildheart Basin rework (`docs/design/dungeon-rework/wildheart_basin.md`,
sections 2, 3, 4 and 7). A closed jungle caldera on a humid gold afternoon: cliff walls all
round, the braided river and its waterfalls (spray, mist, rainbows), never rain and never an
islet in a sea. The sim layout (`src/sim/content/wildheart_basin_layout.ts`), its gates
(`src/sim/content/wildheart.ts` `WILDHEART_BASIN_GATES`) and the encounter ids
(`src/sim/encounters/wildheart_basin/ids.ts`, `src/sim/mob/trash_kit/wildheart_cast_ids.ts`)
are the single source; everything here derives from them.

| Module | Role |
|---|---|
| `index.ts` | Public surface: `buildWildheartBasinInterior` (registered for interior `wildheart` in `../open_air_fields.ts`) and `WildheartFx` (hosted by `../rift_death_zone.ts`). |
| `basin_interior.ts` | Composes the interior group: the field terrain (moss, wet basalt, flagstone families of `../authored_field/`), the kit dressing, the water, the falls, the gates, the lights, the sky and the air. |
| `basin_plan_core.ts` | PURE (`RENDER_PURE_CORES`): the palette, the afternoon sun (`BASIN_SUN_DIRECTION`, also the `wildheartBasin` key light), every fall's lip and fall line (`planBasinFalls`: the rim falls, the Walk's veil, the ford spill), the rainbows against the sun, the river stations, the ford sheet and plunge pool, the braziers and the jaguar's eyes, the motes, flocks and god rays, the gorge walk mask, the vine bridge segments and the gate motion curves. |
| `basin_sky.ts` | The sky dome: a gold horizon under a hazy turquoise zenith, tall cumulus round the rim, a fair-weather deck, the low sun with its halo and the breaks through the cloud. No rain. |
| `basin_water.ts` | The ford shallows racing west (foam round the basalt steps and the Saurian's legs through `BASIN_WATER_WADERS`), the river ribbon in the gorge and the plunge pool: ONE shared material. |
| `basin_falls.ts` | The signature: every curtain merged in one mesh (layered streaks, ropes, white lip and foot; the veil a thinner torn sheet), the foam rings, the spray and the mist (one instanced draw each), the rainbows (one merged mesh, additive, face the sun) and the rock shelf the veil pours off. |
| `basin_air.ts` | The gorge haze (thick low, masked off every walkway), god rays slanting along the sun, fireflies and pollen, wheeling bird flocks. One draw per system. |
| `basin_lights.ts` | Brazier flames, halos and floor pools (the floor ladder's `ground` rung), the jaguar's eye glow, and the budgeted point lights through the fire-light sink. |
| `basin_gates.ts` | The vine bridges weaving segment by segment (Kit_VineBridge instances), the thorn walls sinking and surging back sealed (Kit_ThornWall), the warded arch and the Shrine Ward, driven by the shared gate memory. |
| `basin_fx_core.ts` | PURE (`RENDER_PURE_CORES`): the telegraph specs from the sim tuning (Tail Swipe rear cone, Stomp ring, Entangling Lash lane, the Sap kick glyph), the spore cloud's look, the Saurian's drawn proportions and the effect timelines. |
| `basin_fx.ts` | `WildheartFx`: the floor telegraphs (the shared `../floor_telegraph` kit) and the creature effects: the Stomp's shock and dust, the Tail Swipe's sweep, the howdah bursting, the enrage glow, the totem pulses, the sap beam, the vines on a rooted player, the Pounce trail, the spore fog, the waders' foam, the jaguar's eyes burning while Zulgar fights. |
| `basin_kit.ts` / `basin_kit_plan_core.ts` | The Blender kit (`public/models/props/wildheart_basin_kit.glb`) and its placements: every prop, the caldera ring, the gorge jungle, the pyramid, the jaguar head. Owned by the kit build (`docs/design/dungeon-rework/kit/build_wildheart_basin_kit.py`). |

The placeholder creature looks live in `../characters/wildheart_creature_looks.ts`
(merged into the manifest; the Great Saurian's look is temporary until its Blender body).

Rules:
- Cosmetic only: nothing here decides or hides an outcome. Spray, mist, motes, birds and the
  cosmetic bursts shed with the effects tier; telegraphs draw on every tier, in the shared
  threat palette, from the sim's own numbers.
- No new directional or hemisphere light: the afternoon is the `wildheartBasin` state of
  `../interior_light_rig.ts` (fog: `../fog_scene_state.ts`); point lights go through the
  fire-light sink only, at most eight live per light zone (pinned in the core test).
- Motion is shader-side on `sharedUniforms.uTime` (the fx module keeps its own clock); the
  gates write instance matrices only while they move, in a mesh `onBeforeRender` hook
  (pinned in `tests/point_light_carriers.test.ts`).
- Every material is built with the interior (attached through the renderer's compile gate)
  or in the fx root (attached through `attachSceneGroupGated`); module caches are marked
  shared so the interior sweep never disposes them.
- Floor marks sit on the floor ladder (`../floor_vfx_layer.ts`): brazier pools on `ground`,
  every telegraph and creature effect on `encounter`; the sky, water, falls and air are
  registered out of scope in `tests/floor_vfx_layer.test.ts`.

Tests: `tests/wildheart_basin_render_core.test.ts` (the cores), `tests/wildheart_field_lights.test.ts`
(the light state), `tests/wildheart_basin_kit.test.ts` (the kit). Evidence:
`scripts/wildheart_basin_shot.mjs`.
