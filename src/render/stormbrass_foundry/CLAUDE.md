# src/render/stormbrass_foundry: the Stormbrass Foundry's open-air renderer

The Foundry is dressed with its own Blender kit
(`docs/design/dungeon-rework/kit/build_stormbrass_foundry_kit.py`, shipped by
`scripts/assets/stormbrass_foundry_kit/build.mjs` as
`public/models/props/stormbrass_foundry_kit.glb`), instanced over the sim layout
(`sim/content/stormbrass_foundry_layout.ts` + `stormbrass_foundry_machinery.ts`) by a
PURE placement plan. Nothing visible is a Three primitive any more except the cable
runs and the lightning bolts (`foundry_mesh.ts` `PartBin`), and the press hammers
(`foundry_press.ts` still builds them from `PartBin`; the kit ships `Kit_PressHammer`
and `Kit_PressCarriage` for it to adopt through `foundryKitPiece`, not yet wired
here). The dungeon's creatures are the Blender looks in
`../characters/foundry_creature_looks.ts`.

| Module | Role |
|---|---|
| `index.ts` | Public surface: `buildStormbrassFoundryInterior` (registered in `../open_air_fields.ts`) and `FoundryFx`. |
| `foundry_interior.ts` | Builds the whole slot (async: awaits the kit, capped): the field terrain graded warm (`tintFoundryTerrain`), the steel walks open to the air (`FOUNDRY_OPEN_WALKS`), dressing, gates, lights, sky, landmarks. |
| `foundry_kit_plan_core.ts` | PURE: the whole placement plan. Prop kind to piece (`foundryPieceForProp`), cliff edges (`planFoundryEdges`), catwalk trusses and piers, the Main Line (belt housings, the press crown, grilles, chains), the Hauler's rail loop, the pour line, the molten channel, the skyline of engine houses on piers, the steam mains from them (`planSteamMains`), the yard gantry, the parapet pieces (flood masts, range flags), the workers' camps (`FOUNDRY_WORKER_CAMP_SPOTS`), litter, the Prime Draft landmark (`planPrimeDraftLandmark`, one switch: `FOUNDRY_PRIME_DRAFT_LANDMARK_SHOWN`), the movers and their curves (`planFoundryMovers`, `ladleState`, `pistonStroke`, `jibYaw`), steam and smoke sources (`FOUNDRY_SOURCES`, `planFoundryEmitters`). |
| `foundry_kit.ts` | Loads and bakes the kit by slot (metal, paint, glow, glass: one shared material each, the vertex colour carries the metal and its weathering; the bake keeps the kit's indices), stand-ins per piece if the kit fails, the instancer (one InstancedMesh per piece, slot and 110 yd culling cell, so both the camera and the shadow box cull; `NO_SHADOW` pieces never cast), `foundryKitPiece(name)` / `foundryKitReady()` for painters that adopt a piece, `upgradeWhenKitLands`, the coil's driven glow (`setFoundryCoilGlow`). |
| `foundry_machines.ts` | The movers: one InstancedMesh per piece and slot, one shared matrix buffer per piece rewritten in `onBeforeRender` (crane jibs, flywheels, the press's gear train, piston rods, ladles and trolleys). |
| `foundry_dressing.ts` | Composes the kit dressing, the movers, the Main Line belts (rubber-slat shader; `uDir` and `uAlarm` per belt from the shared `FOUNDRY_BELT_UNIFORMS` that `foundry_fx.ts` writes), the press hammers call, the molten brass, steam and smoke. |
| `foundry_molten.ts` | The molten river in the gulf under the Line Catwalk (drifting slag plates, white-gold seams), its fall, the furnace spout, the ladles' pour streams, heat glows, the spark emitter list. |
| `foundry_sparks.ts` | Every spark shower in ONE instanced draw (flight in the vertex shader), gated per shower (`setSparkGate`: the two pours, the coil strike, the bridge seats). |
| `foundry_steam.ts` | Steam and smoke cards from the emitter list (one instanced draw per kind). |
| `foundry_floor_plan_core.ts` | PURE: the floor marks (`planFoundryFloorDecals`): oil, scorch, puddles, slag, drains, grilles, plate seams, hazard bands, lane lines, chalk layouts, the Rail Yard turntable, ruts and craters on the ranges. Authored marks follow the props (a crater ring round every target, ash before every firebox); the scatter is hashed per ground and sheds on the low tier. Every mark lies flat on ONE floor, off the belts. |
| `foundry_floor_decals.ts` | The floor marks as ONE merged, lit, shadow-receiving mesh from one procedural 4 by 4 atlas, on the floor ladder's GROUND rung (under every player effect and telegraph). |
| `foundry_shake.ts` | The environment's camera-shake sink (`setFoundryShakeSink`, wired by `../rift_death_zone.ts`; `foundryShake`): the Crane Bridge's clang. Reduced motion mutes it. |
| `foundry_bridge_core.ts` | PURE: the Crane Bridge swing (`craneBridgePose`, `craneBridgeProgress`): the crane carries the span on its hook, seats it, then drops the slings and hoists the hook clear (`CRANE_BRIDGE_SEAT_SHARE`). |
| `foundry_gates.ts` | Steam shutters, arc fences and the Crane Bridge rig on kit pieces, driven by the shared gate memory. |
| `foundry_plan_core.ts` | PURE: palette, the budgeted light spots (`planFoundryLights`), the painted glows (`planFoundryGlows`: flood masts and firebox doors, no lights), the strike clock and afterglow, bolt paths, the valley height and buttresses, the bridge deck, gate motion curves. |
| `foundry_lights.ts` | Budgeted point lights through the fire-light sink, halos, floor pools on the ground rung, and the painted glows (one instanced halo draw and one merged pool mesh per kind). |
| `foundry_sky.ts` | The storm dome (two cloud decks, a gold break low in the west, sheet lightning, the strike flash) over the mountain: the scree valley, buttresses, and two ranges of ridged massifs (the far one washed into the haze), one merged flat-shaded rock mesh. A dry storm: no rain, no sea. |
| `foundry_landmarks.ts` | The coil's bolts, flare, afterglow and spark gate on the strike clock; the cable run from the coil to the Prime Draft landmark. |
| `foundry_mesh.ts` | `PartBin` (merged primitives per material): only the bolts and cable runs use it now. |
| `foundry_fx.ts` / `foundry_fx_core.ts` | Floor telegraphs and boss effects (cast specs, object specs, aura markers, plating rings, the belt looks the belt shader reads). Hosted by `../rift_death_zone.ts`. |
| `foundry_creature_fx.ts` / `foundry_creature_fx_core.ts` | The Blender creatures' effects and gestures, anchored on the builds' measured points. Hosted by `../rift_death_zone.ts`. |
| `foundry_worker_camps.ts` | The chained workers' camp props (`sf_ore_seam`, `sf_scrap_heap`, `sf_chain_post`, `sf_scrap_cart`): procedural stand-ins merged into the shared foundry materials, built with the interior. Retires when the Blender kit carries those kinds. |
| `foundry_worker_fx.ts` / `foundry_worker_fx_core.ts` | The workers' chains: real iron links from each chained worker's ankle shackle to its camp's post (one shared link geometry, a draw range per chain, one matrix write per chain a frame), following a hauler round its loop; struck chains throw a burst of sparks off the post's ring and every shackle (one pooled additive cloud, built with the chains behind the compile gate; only when the strike is seen, never for a camp met already freed), then fall and lie where the workers stood. Read from the camp state object's template id and the workers' template ids. Hosted by `../rift_death_zone.ts`. The worker bodies are `../characters/foundry_worker_looks.ts`. |
| `foundry_arcs.ts` | The pooled lightning arcs (crossed ribbons along a re-jagged path, `arcPathInto`). |
| `foundry_press.ts` / `foundry_press_core.ts` | The Stamping Press's gantry over the Main Line: one fixed rail a belt, a carriage that slides to the press strip's rail stop, its hammer on a telescoping ram and the hammer's footprint on the belt. The core is PURE (the strike's timeline: slide, wind-up, slam, bite, climb; the rig that turns a strip's position into a carriage pose); `foundry_creature_fx.ts` writes `FOUNDRY_PRESS_HAMMERS` from the live strips and syncs the slam to the sim's hit. The footprint sits on encounter step 18 (over the strip's fill, under its curtain) as dense hazard bands (the strip under it is brighter than white), half of it open so the strip's own fill is still read. `carriageParts` / `hammerParts` are separate builders so the kit's `Kit_PressCarriage` / `Kit_PressHammer` can replace them. |
| `foundry_vents.ts` / `foundry_vents_core.ts` | Line-Master Tock's Scalding Vents: `buildFoundryVents` (walkway grilles, glowing pits and the shader jets, built with the interior) and `FoundryVentFx` (owned by `FoundryFx`: the five walkway lanes in the shared telegraph kit, the two uniforms eased from the live strip objects, the steam pool). The lanes are actionable and draw on every tier; on the low tier every other jet blows and the steam thins. The jets fade near the camera and the steam is kept thin so it never hides the belts, the press strips or the boss. |
| `foundry_lock_marker.ts` | `FoundryLockMarkers`: a red crosshair billboard over every player wearing the Rangewarden's Target Lock (who is marked). Actionable, every tier, `depthTest: false`; one geometry and one material under the `FoundryFx` root, the reticle drawn and turned in its shader. It replaced a floor ring that followed the runner and read as the landing circle. |
| `foundry_hatch_beacon.ts` | `FoundryHatchBeacon`: an additive gold shaft standing on the Prime Draft's Core Hatch while it is open (where to carry the Storm Cell, and when). Actionable, every tier; one cylinder and one material under the `FoundryFx` root, breathing at the hatch ring's rate, on the encounter band's top step (over the ring's own telegraph). |

Second pass additions inside the modules above: edge tile VARIANTS (`foundryEdgeVariant`,
`FOUNDRY_EDGE_VARIANTS`: railing, machine lip / retaining wall, pipe edge, same contract so
any tile fits any run), mine adits let into the cliff faces (`planAdits`), the Forge
Gauntlet either side of the Gantry Catwalk (`FOUNDRY_FORGE`, `planForgeGauntlet`: a blast
furnace on a pier with flame, slag fall and sparks in `foundry_molten.ts`, three steam
hammers whose tups are `hammer` movers with a spark gate each), bedded strata and ore veins
painted on the cliff faces (`foundry_interior.ts` `paintStrata` over the `strata` rock
detail), ridged strata massifs, benched quarry buttresses and two haze veils
(`foundry_sky.ts`), and a coil strike that washes the kit, the peaks and the haze
(`setFoundryStrikeFlash`). Custom shaders here author LINEAR colours and end with
`#include <colorspace_fragment>`.

Rules: motion is shader-side on `sharedUniforms.uTime`, or one matrix write per
moving mesh in its own `onBeforeRender` (pinned in `tests/point_light_carriers.test.ts`);
no point light outside the fire-light sink, at most eight budgeted lights per light
zone (extra lit points are PAINTED glows, `planFoundryGlows`); telegraphs draw on
every tier, cosmetics shed with the effects tier; nothing here hides actionable
information; the forge's orange stays an accent in the gulf and at the fireboxes,
below every floor telegraph.

Kit contract (audited against the shipped GLB by `tests/stormbrass_foundry_kit.test.ts`):
nothing floats, and nothing taller than a knee stands in a walkway's head room
without a sim collider under it (or the cliff wall's own collider: a piece standing
IN a parapet). A new tall piece on a walkway needs a prop in
`sim/content/stormbrass_foundry_machinery.ts`; a piece in the drop stands on a
`Kit_Pier`. Rebuild: run the Blender builder, then
`node scripts/assets/stormbrass_foundry_kit/build.mjs`, then
`node scripts/build_media_manifest.mjs generate`.

Tests: `tests/stormbrass_foundry_kit.test.ts`, `tests/stormbrass_foundry_render_core.test.ts`,
`tests/stormbrass_foundry_press_core.test.ts`, `tests/stormbrass_foundry_workers_render.test.ts`.
Evidence: `scripts/stormbrass_foundry_shot.mjs` (zone shots, `momento_*` moment shots,
`SHOT_GATES=0` for the Crane Bridge swing), `scripts/stormbrass_foundry_workers_shot.mjs`.
