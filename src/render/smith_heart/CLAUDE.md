<!-- src/render/smith_heart/: the Smith's Heart raid's open-air renderer (phase 2A:
     the structure). Presentation only (parent dirs cover the IWorld seam,
     determinism and the GPU scheduler contract). Don't repeat root / src / render
     CLAUDE.md. -->

# src/render/smith_heart: the Smith's Heart's open-air renderer

The render half of the raid (`docs/design/raid/smith_heart.md`): two areas in one slot.
The main map: the Cleft, four guardian rooms (the Smith's Quarry, the Storm Cornice, the
Quench Basin, the Smith's Forge) cut into the mountain as open fissures round the Ring,
and the heart seal on its floating dais, which opens into a portal. The Heart: the
Anvil of the World hung by four chains over the Smith's beating core, inside a crown of
mountain open to an ember sky. The sim layout (`src/sim/content/smith_heart_layout.ts`),
the gates (`SMITH_HEART_GATES`) and the seal's value (veins plus the portal bit,
`src/sim/encounters/smith_heart/seal.ts`) are the single source; everything here
derives from them. Props are kit placeholders composed from boxes, cylinders, cones
and gems; the per-room phases replace them with Blender kits. The borrowed creature
bodies live in ONE list, `../characters/smith_heart_placeholder_looks.ts`.

| Module | Role |
|---|---|
| `index.ts` | Public surface: `buildSmithHeartInterior` (registered for interior `smith_heart` in `../open_air_fields.ts`). |
| `heart_interior.ts` | Composes the slot (terrain with the floating islands `shallow`, mountain, crags, props, Heart, lights, rivers, seal, portals, gates, sky) and owns the frame driver: the seal view, the portal stage, the hop detection and the sky's area blend. |
| `heart_plan_core.ts` | PURE: the palette and tones, the recipe of every `sh_*` prop kind (`HEART_PROP_RECIPES`: each room's hero shapes), a prop's base height, the budgeted lights (`planHeartLights`) and their zones, the hash. |
| `heart_mountain_core.ts` / `heart_mountain.ts` | PURE plan and painter of the mountain: one faceted heightfield rising out of the chasm past every floor's clearance (`heartMountainHeight`), low round the Cornice, deepest round the Heart, open air kept; `heartMountainBlocks` pins that no main-map eye sees into the Heart. |
| `heart_walls_core.ts` | PURE: the floor clearance field (`heartFloorClearance`), the open-air regions (`heartOpenAir`), each room's rock scale (`heartWallScale`), the ridge noise, and the loose crags at the mountain's foot (`planHeartWalls`, `heartRockShape`). |
| `heart_props.ts` | Instances the recipes (shared unit geometry, `surfaceMat` tones) and the crags (one instanced draw per rock shape). |
| `heart_lights.ts` | The point lights through the fire-light sink (at most eight per light zone), each with a halo card. |
| `heart_rivers_core.ts` / `heart_rivers.ts` | The floor light-rivers: a ribbon per vein, dim always, the bright twin's draw range running arena to seal as the vein lights; the last leg leaps the chasm onto the dais. |
| `heart_seal_core.ts` / `heart_seal.ts` | The seal memory (veins and the portal, fed by `../gate_objects.ts`), the fill timeline (`heartSealQuarterFill`, `heartSealColumn`) and the four shader quarters that fill, charge and part; the arrival columns. |
| `heart_portal_core.ts` / `heart_portal.ts` | The opening (`heartPortalStage`: charge, flash, split, ring, swirl), the living portal (vortex, funnel, motes, tine arcs), the return portal, the hop (`heartHopLanding`, `heartHopStage`, the wash) and the area blend. |
| `heart_fx_materials.ts` | The texture-free VFX shaders (beam, floor ring, vortex, funnel, motes, core). Fresh per call: their uniforms are the slot's state. |
| `heart_room_core.ts` / `heart_room.ts` | The Heart: the core and its shafts, the four chains (one instanced draw) and their pours, the rune rings, the embers; the keels under every floating island. |
| `heart_environment.ts` | PURE: the Heart's fog and light state (`smithHeartCore`), read by `../fog_scene_state.ts` and `../interior_light_rig.ts`. |
| `heart_gates_core.ts` / `heart_gates.ts` | The gate looks on the shared gate memory: `stone_slab` splits and sinks; `forge_seal` is a LOW barrier (at most about 3 yd, `HEART_SEAL_BARRIER`). |
| `heart_sightline_core.ts` | PURE: every crag, prop part (scale included) and gate part as a plain volume, and `heartSightlineHits` to trace a sightline through them. |
| `heart_sky.ts` | The dome: the storm over the main map, the ember night over the Heart (`setCore`); its `onBeforeRender` is the slot's frame driver and hands it the camera. |

Rules:
- Render reads the world, never mutates it: the seal's and the portal's state arrive
  only through the mirrored marker entities (`gate_objects.ts`), the gates' only through
  the gate memory, the hop only as the camera crossing areas in one frame.
- Every VFX mesh is built with the interior (the compile gate links it, hidden or not);
  no texture upload on first use (the shaders read none; the halos share
  `radialGlowTexture`); nothing is attached to the scene outside the interior group.
- The seal, the rivers, the gates, the portals, the bursts and the hop draw on every
  tier (progress and the way); only the motes and embers thin on the low tier (the
  static preset), and the mountain's grid coarsens (the same mountain).
- No light but the budgeted point lights through the fire-light sink; the Heart's grade
  is its own fog state, the main map's is the borrowed `sunkenBastion` state.
- One mesh hook (the sky's), pinned in `tests/point_light_carriers.test.ts`; floor marks
  (rivers, seal, portal discs and rings, rune rings) on the floor ladder's ground rung
  with literal steps, registered strict in `tests/floor_vfx_layer.test.ts`.
- No render-only solid stands in the raid's key sightlines (every 10 degrees of the Ring
  and the Balcony tip to the seal and the portal's eye, the Balcony tip to each vein
  mouth), and no main-map eye sees into the Heart through the mountain. A new solid
  joins those plans.

Tests: `tests/smith_heart_render_core.test.ts` (mountain, crags, sightlines, rivers,
seal memory and fill, portal and hop timelines, chains, keels, core, gate poses, props,
light budget) and `tests/smith_heart_areas.test.ts` (areas, score, the Heart's air).
