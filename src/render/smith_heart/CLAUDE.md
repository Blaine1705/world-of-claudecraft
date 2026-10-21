<!-- src/render/smith_heart/: the Smith's Heart raid's open-air renderer (phase 2A:
     the structure; phase 2B: the Hammer vein's Blender kit, air and light). Presentation only (parent dirs cover the IWorld seam,
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
derives from them. The Hammer vein (the Cleft, the Gallery, the Smith's Quarry, the Slab,
the Balcony's lookouts) is dressed with its Blender kit
(`public/models/props/smith_heart_hammer_kit.glb`, built from
`docs/design/raid/kit/build_smith_heart_hammer_kit.py`); the other veins' props are still
placeholders composed from boxes, cylinders, cones and gems until their own phases. The
Hammer guardian's and the Slab's effects are `../smith_heart_fx/`. The borrowed creature
bodies live in ONE list, `../characters/smith_heart_placeholder_looks.ts`.

| Module | Role |
|---|---|
| `index.ts` | Public surface: `buildSmithHeartInterior` (registered for interior `smith_heart` in `../open_air_fields.ts`). |
| `heart_interior.ts` | Composes the slot (terrain with the floating islands `shallow`, mountain, crags, props, Heart, lights, rivers, seal, portals, gates, sky) and owns the frame driver: the seal view, the portal stage, the hop detection and the sky's area blend. |
| `heart_plan_core.ts` | PURE: the palette and tones, the recipe of every `sh_*` prop kind (`HEART_PROP_RECIPES`: each room's hero shapes), a prop's base height, the budgeted lights (`planHeartLights`) and their zones, the hash. |
| `heart_mountain_core.ts` / `heart_mountain.ts` | PURE plan and painter of the mountain: one faceted heightfield rising out of the chasm past every floor's clearance (`heartMountainHeight`), low round the Cornice, deepest round the Heart, open air kept; `heartMountainBlocks` pins that no main-map eye sees into the Heart. |
| `heart_walls_core.ts` | PURE: the floor clearance field (`heartFloorClearance`), the open-air regions (`heartOpenAir`), each room's rock scale (`heartWallScale`), the ridge noise, and the loose crags at the mountain's foot (`planHeartWalls`, `heartRockShape`). |
| `heart_props.ts` | Instances the recipes (shared unit geometry, `surfaceMat` tones) and the crags (one instanced draw per rock shape, the shared triplanar rock on them); the placeholders of the kinds a kit draws stand apart (`kitOwned`) so the kit takes their place. |
| `heart_kit_core.ts` / `heart_kit.ts` | A vein's Blender kit: the placement record (PURE), then the loader and baker (each Kit_* node split by slot: KitStone lit with the shared triplanar rock, KitGlow emissive), the instancer (culling cells, stretch and shear for the edge modules), the slot program warmers built with every interior, the late-landing swap. |
| `hammer_kit_plan_core.ts` / `hammer_kit.ts` | PURE plan and painter of the Hammer vein's kit: every vein prop fitted with its piece (the colossi kneeling on the first step, carved out of the terraces), the worked faces, rims and lips along every cliff run of the vein (the shared edge planner), and the render-only dressing (scaffold, hoists, spoil, chips, the collapse spot's overhang, the Balcony's lookouts). |
| `hammer_air_core.ts` / `hammer_air.ts` | PURE plan and painter of the Hammer vein's air: dust motes in the low sun, grit off the terrace lips and the colossi, the collapse spot's heavy trickles, the pit's haze, the geodes' halos. Shader-driven quads, cosmetic, a third on the low tier. |
| `heart_lights.ts` | The point lights through the fire-light sink (at most eight per light zone), each with a halo card. |
| `heart_rivers_core.ts` / `heart_rivers.ts` | The floor light-rivers: a ribbon per vein, dim always, the bright twin's draw range running arena to seal as the vein lights; the last leg leaps the chasm onto the dais. |
| `heart_seal_core.ts` / `heart_seal.ts` | The seal memory (veins and the portal, fed by `../gate_objects.ts`), the fill timeline (`heartSealQuarterFill`, `heartSealColumn`) and the four shader quarters that fill, charge and part; the arrival columns. |
| `heart_portal_core.ts` / `heart_portal.ts` | The opening (`heartPortalStage`: charge, flash, split, ring, swirl), the living portal (vortex, funnel, motes, tine arcs), the return portal, the hop (`heartHopLanding`, `heartHopStage`, the wash) and the area blend. |
| `heart_fx_materials.ts` | The texture-free VFX shaders (beam, floor ring, vortex, funnel, motes, core). Fresh per call: their uniforms are the slot's state. |
| `heart_room_core.ts` / `heart_room.ts` | The Heart: the core and its shafts, the four chains (one instanced draw) and their pours, the rune rings, the embers; the keels under every floating island. |
| `heart_environment.ts` | PURE: the Heart's fog and light state (`smithHeartCore`) and the Hammer vein's (`smithHeartHammer`: a warm quarry dusk, the key low from the south-west), read by `../fog_scene_state.ts` and `../interior_light_rig.ts`. |
| `heart_gates_core.ts` / `heart_gates.ts` | The gate looks on the shared gate memory: `stone_slab` splits and sinks (the kit's carved halves once the Hammer kit has landed); `forge_seal` is a LOW barrier (at most about 3 yd, `HEART_SEAL_BARRIER`). |
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
  is its own fog state, the Hammer vein's too (`smithHeartHammer`), the rest of the main
  map's is the borrowed `sunkenBastion` state.
- A kit piece a body can touch stays within its layout collider (plus a body's width); a
  render-only piece never stands over a walked floor (the terraces are dressing floors
  nobody reaches); the edge modules keep their lip frame (a rim never stands proud of the
  pit floor). Pinned by `tests/smith_heart_hammer_kit.test.ts` against the shipped GLB.
- One mesh hook (the sky's), pinned in `tests/point_light_carriers.test.ts`; floor marks
  (rivers, seal, portal discs and rings, rune rings) on the floor ladder's ground rung
  with literal steps, registered strict in `tests/floor_vfx_layer.test.ts`.
- No render-only solid stands in the raid's key sightlines (every 10 degrees of the Ring
  and the Balcony tip to the seal and the portal's eye, the Balcony tip to each vein
  mouth), and no main-map eye sees into the Heart through the mountain. A new solid
  joins those plans.

Tests: `tests/smith_heart_render_core.test.ts` (mountain, crags, sightlines, rivers,
seal memory and fill, portal and hop timelines, chains, keels, core, gate poses, props,
light budget), `tests/smith_heart_areas.test.ts` (areas, score, the Heart's air),
`tests/smith_heart_hammer_kit.test.ts` (the Hammer kit's GLB and its plan) and
`tests/smith_heart_hammer_fx.test.ts` (the vein's air, the guardian's and the Slab's
effects). Evidence: `scripts/smith_heart_hammer_shot.mjs`.
