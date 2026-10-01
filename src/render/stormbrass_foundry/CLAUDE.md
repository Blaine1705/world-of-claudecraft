# src/render/stormbrass_foundry: the Stormbrass Foundry's open-air renderer

Phase 1 of 3 (`src/sim/encounters/stormbrass_foundry/CLAUDE.md`): everything here
is PROCEDURAL (Three primitives merged per material) so the dungeon is complete
and playable before its Blender kit exists. Phase 3 replaces the static props
with the kit GLB (`docs/design/dungeon-rework/kit/build_stormbrass_foundry_kit.py`,
loaded the way `../drowned_temple/temple_kit.ts` loads its kit) keyed on the SAME
prop kinds (`sf_*` in `sim/content/stormbrass_foundry_layout.ts`), and the
placeholder creature looks (`FOUNDRY_PLACEHOLDER_LOOKS` in
`../characters/manifest.ts`) with its own creatures.

| Module | Role |
|---|---|
| `index.ts` | Public surface: `buildStormbrassFoundryInterior` (registered in `../open_air_fields.ts`) and `FoundryFx`. |
| `foundry_interior.ts` | Builds the whole slot: the field terrain (graded slate), dressing, gates, lights, sky, landmarks. |
| `foundry_plan_core.ts` | PURE: palette, light spots, the strike clock, bolt paths, crane sweep, the landmark's head aim, gate motion curves. |
| `foundry_mesh.ts` | `PartBin` (merge primitives per material) and the shared foundry materials. |
| `foundry_dressing.ts` | Every `sf_*` prop, the Main Line belts (chevron shader, `uDir` and `uAlarm` per belt for phase 2's G19), the Stamping Press, the cranes, the steam columns, the rails and the tower bands. |
| `foundry_gates.ts` | Steam shutters, arc fences and the Crane Bridge, driven by the shared gate memory. |
| `foundry_lights.ts` | Budgeted point lights through the fire-light sink, halos, floor pools on the ground rung. |
| `foundry_sky.ts` | The storm dome (flashing with the coil strikes), the peaks, the cloud sea, the rain veil. |
| `foundry_landmarks.ts` | The coil's bolts and flare, the cable run, the Prime Draft landmark whose head follows the viewer. |
| `foundry_fx.ts` / `foundry_fx_core.ts` | Floor telegraphs (Piston Slam, Steam Blast, the kick glyphs, burst rings, scrap marks); hosted by `../rift_death_zone.ts` with the other dungeons' fx. |

Rules: motion is shader-side on `sharedUniforms.uTime`, or one matrix write per
moving mesh in its own `onBeforeRender` (pinned in `tests/point_light_carriers.test.ts`);
no point light outside the fire-light sink; telegraphs draw on every tier,
cosmetics shed with the effects tier; nothing here hides actionable
information. Tests: `tests/stormbrass_foundry_render_core.test.ts`. Evidence:
`scripts/stormbrass_foundry_shot.mjs`.
