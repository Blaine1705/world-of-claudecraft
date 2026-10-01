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
| `foundry_arcs.ts` | The pooled lightning arcs (crossed ribbons along a re-jagged path, `arcPathInto`). |

Rules: motion is shader-side on `sharedUniforms.uTime`, or one matrix write per
moving mesh in its own `onBeforeRender` (pinned in `tests/point_light_carriers.test.ts`);
no point light outside the fire-light sink; telegraphs draw on every tier,
cosmetics shed with the effects tier; nothing here hides actionable
information. Tests: `tests/stormbrass_foundry_render_core.test.ts`. Evidence:
`scripts/stormbrass_foundry_shot.mjs`.
