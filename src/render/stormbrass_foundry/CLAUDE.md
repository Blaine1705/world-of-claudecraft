# src/render/stormbrass_foundry: the Stormbrass Foundry's open-air renderer

Phases 1 and 2 of 3 (`src/sim/encounters/stormbrass_foundry/CLAUDE.md`): the arena here
is PROCEDURAL (Three primitives merged per material) so the dungeon is complete
and playable before its Blender kit exists. Phase 3 replaces the static props
with the kit GLB (`docs/design/dungeon-rework/kit/build_stormbrass_foundry_kit.py`,
loaded the way `../drowned_temple/temple_kit.ts` loads its kit) keyed on the SAME
prop kinds (`sf_*` in `sim/content/stormbrass_foundry_layout.ts`), and the
placeholder creature looks (`FOUNDRY_PLACEHOLDER_LOOKS` in
`../characters/manifest.ts`) are already replaced by the dungeon's own Blender
creatures (`../characters/foundry_creature_looks.ts`, built by
`scripts/assets/stormbrass_foundry_creatures/`), all but the Prime Draft.

| Module | Role |
|---|---|
| `index.ts` | Public surface: `buildStormbrassFoundryInterior` (registered in `../open_air_fields.ts`) and `FoundryFx`. |
| `foundry_interior.ts` | Builds the whole slot: the field terrain (graded slate), dressing, gates, lights, sky, landmarks. |
| `foundry_plan_core.ts` | PURE: palette, light spots, the strike clock, bolt paths, crane sweep, the landmark's head aim, gate motion curves. |
| `foundry_mesh.ts` | `PartBin` (merge primitives per material) and the shared foundry materials. |
| `foundry_dressing.ts` | Every `sf_*` prop, the Main Line belts (chevron shader; `uDir` (signed speed) and `uAlarm` per belt from the shared `FOUNDRY_BELT_UNIFORMS` that `foundry_fx.ts` writes from the live belt objects), the Stamping Press, the cranes, the steam columns, the rails and the tower bands. |
| `foundry_gates.ts` | Steam shutters, arc fences and the Crane Bridge, driven by the shared gate memory. |
| `foundry_lights.ts` | Budgeted point lights through the fire-light sink, halos, floor pools on the ground rung. |
| `foundry_sky.ts` | The storm dome (flashing with the coil strikes) over the mountain the shelf is cut into: the scree valley, the buttresses, the ring of peaks (one merged rock mesh, planned by `foundry_plan_core.ts` `foundryValleyHeight` / `planFoundryButtresses`). A dry storm: no rain, no sea. |
| `foundry_landmarks.ts` | The coil's bolts and flare, the cable run, the Prime Draft landmark whose head follows the viewer. |
| `foundry_fx.ts` / `foundry_fx_core.ts` | Floor telegraphs, the phase 2 placeholders phase 3 dresses: boss cast specs (Steam Blast, lever klaxon, Rivet Gun, Proof Shot, plating flip, Static Lash, Awakening, Piston Fist, Arm Sweep, Unbolt, Tremor Step, Arc Surge), object specs (press strip lane, shell marks, shrapnel, bunkers, coil strike marks, storm cells, the Core Hatch ring by state, fist marks), aura markers over players (Target Lock, cell carry, Static), the Warden's plating rings and stored-charge fill, and the belt looks the dressing's belt shader reads (`FOUNDRY_BELT_UNIFORMS`, per belt object template and facing). Hosted by `../rift_death_zone.ts` with the other dungeons' fx. |
| `foundry_creature_fx.ts` / `foundry_creature_fx_core.ts` | Phase 3: the Blender creatures' effects and gestures (Tock's gauge dial and klaxon, the riveter, the press strike; the Rangewarden's lock beams, salvo shells and Proof Shot; the Warden's plate dials, coil arcs, Discharge, Static Lash, Coil Strike; storm cells, the delivery arc and the Overload cascade; the Hauler's smoke, Steam Blast, thrown plate, Unload and Boiler Rupture; the trash bursts), anchored on the builds' measured points (`FOUNDRY_FX_ANCHORS`, `FOUNDRY_DRAW`). Hosted by `../rift_death_zone.ts`. |
| `foundry_worker_camps.ts` | The chained workers' camp props (`sf_ore_seam`, `sf_scrap_heap`, `sf_chain_post`, `sf_scrap_cart`): procedural stand-ins merged into the shared foundry materials, built with the interior. Retires when the Blender kit carries those kinds. |
| `foundry_worker_fx.ts` / `foundry_worker_fx_core.ts` | The workers' chains: real iron links from each chained worker's ankle shackle to its camp's post (one shared link geometry, a draw range per chain, one matrix write per chain a frame), following a hauler round its loop; struck chains throw a burst of sparks off the post's ring and every shackle (one pooled additive cloud, built with the chains behind the compile gate; only when the strike is seen, never for a camp met already freed), then fall and lie where the workers stood. Read from the camp state object's template id and the workers' template ids. Hosted by `../rift_death_zone.ts`. The worker bodies are `../characters/foundry_worker_looks.ts`. |
| `foundry_arcs.ts` | The pooled lightning arcs (crossed ribbons along a re-jagged path, `arcPathInto`). |
| `foundry_press.ts` / `foundry_press_core.ts` | The Stamping Press's gantry over the Main Line: one fixed rail a belt, a carriage that slides to the press strip's rail stop, its hammer on a telescoping ram and the hammer's footprint on the belt. The core is PURE (the strike's timeline: slide, wind-up, slam, bite, climb; the rig that turns a strip's position into a carriage pose); `foundry_creature_fx.ts` writes `FOUNDRY_PRESS_HAMMERS` from the live strips and syncs the slam to the sim's hit. The footprint sits on encounter step 18 (over the strip's fill, under its curtain) as dense hazard bands (the strip under it is brighter than white), half of it open so the strip's own fill is still read. `carriageParts` / `hammerParts` are separate builders so the kit's `Kit_PressCarriage` / `Kit_PressHammer` can replace them. |
| `foundry_vents.ts` / `foundry_vents_core.ts` | Line-Master Tock's Scalding Vents: `buildFoundryVents` (walkway grilles, glowing pits and the shader jets, built with the interior) and `FoundryVentFx` (owned by `FoundryFx`: the five walkway lanes in the shared telegraph kit, the two uniforms eased from the live strip objects, the steam pool). The lanes are actionable and draw on every tier; on the low tier every other jet blows and the steam thins. The jets fade near the camera and the steam is kept thin so it never hides the belts, the press strips or the boss. |
| `foundry_lock_marker.ts` | `FoundryLockMarkers`: a red crosshair billboard over every player wearing the Rangewarden's Target Lock (who is marked). Actionable, every tier, `depthTest: false`; one geometry and one material under the `FoundryFx` root, the reticle drawn and turned in its shader. It replaced a floor ring that followed the runner and read as the landing circle. |
| `foundry_hatch_beacon.ts` | `FoundryHatchBeacon`: an additive gold shaft standing on the Prime Draft's Core Hatch while it is open (where to carry the Storm Cell, and when). Actionable, every tier; one cylinder and one material under the `FoundryFx` root, breathing at the hatch ring's rate, on the encounter band's top step (over the ring's own telegraph). |

Rules: motion is shader-side on `sharedUniforms.uTime`, or one matrix write per
moving mesh in its own `onBeforeRender` (pinned in `tests/point_light_carriers.test.ts`);
no point light outside the fire-light sink; telegraphs draw on every tier,
cosmetics shed with the effects tier; nothing here hides actionable
information. Tests: `tests/stormbrass_foundry_render_core.test.ts`,
`tests/stormbrass_foundry_press_core.test.ts`,
`tests/stormbrass_foundry_workers_render.test.ts`. Evidence:
`scripts/stormbrass_foundry_shot.mjs`, `scripts/stormbrass_foundry_workers_shot.mjs`.
