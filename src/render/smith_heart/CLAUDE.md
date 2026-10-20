<!-- src/render/smith_heart/: the Smith's Heart raid's open-air renderer, phase 1
     blockout. Presentation only (parent dirs cover the IWorld seam, determinism and
     the GPU scheduler contract). Don't repeat root / src / render CLAUDE.md. -->

# src/render/smith_heart: the Smith's Heart's open-air renderer (blockout)

The render half of the raid's phase 1 blockout (`docs/design/raid/smith_heart.md`): a
caldera in the heart of Stormcrag, open to the storm sky, the Ring round the Heart and
four veins (the Hammer, the Breath, the Quench, the Heat) cut into the mountain as open
fissures. The sim layout (`src/sim/content/smith_heart_layout.ts`: `SMITH_HEART_FIELD`,
`LIGHT_RIVERS`, `SMITH_HEART_VEIN_COLORS`, `HEART_SEAL`, `HEART_ALTARS`), the gates
(`SMITH_HEART_GATES` in `src/sim/content/smith_heart.ts`) and the seal's mask
(`src/sim/encounters/smith_heart/seal.ts`) are the single source; everything here derives
from them. Every piece is a placeholder (boxes, cylinders, cones, gems); phase 2 replaces
them with a kit and its own models. The borrowed creature bodies live in ONE list,
`../characters/smith_heart_placeholder_looks.ts`.

| Module | Role |
|---|---|
| `index.ts` | Public surface: `buildSmithHeartInterior` (registered for interior `smith_heart` in `../open_air_fields.ts`). |
| `heart_interior.ts` | Composes the slot: the field terrain (`../authored_field/`, strata cliffs), the walls, the props, the lights, the rivers, the seal, the gates and the sky (the frame driver). |
| `heart_plan_core.ts` | PURE: the palette, the placeholder recipe of every `sh_*` prop kind (`HEART_PROP_RECIPES`), a prop's base height (`heartPropBase`), the budgeted lights (`planHeartLights`) and their zones, the hash. |
| `heart_walls_core.ts` | PURE: the mountain's rock along every outer lip (`planHeartWalls`): jagged spires, crowned crags and split slabs (`heartRockShape`), squashed, turned and leaning out; low teeth by the walks climbing to tall walls behind; every block (lean included) at least `HEART_WALL_CLEAR` yd from walkable floor (`HEART_WALL_PATH_CLEAR` beside a path) so a camera behind a player is never inside rock; never inside the caldera, the Wind Bridge's gulf or the Anvil's channels. |
| `heart_props.ts` | Instances the recipes (shared unit geometry, `surfaceMat` tones) and the rock (one instanced draw per rock shape, the lean a shear of each instance's top). |
| `heart_lights.ts` | The point lights through the fire-light sink (at most eight per light zone), each with a halo card. |
| `heart_rivers_core.ts` / `heart_rivers.ts` | The floor light-rivers: a ribbon draped on the floor per vein (a void run spans the gap at the blended height), dim always, the bright twin's draw range running arena to seal as the vein lights. |
| `heart_seal_core.ts` / `heart_seal.ts` | The seal memory: `../gate_objects.ts` reports every mirrored seal marker (`observeHeartSealMarker`), keyed by slot; the newest mask wins, a lost vein is a fresh claim. The flush four-quarter inlay at `HEART_SEAL`, each quarter burning in its vein's colour once lit. |
| `heart_gates_core.ts` / `heart_gates.ts` | The gate looks on the shared gate memory, every part a planned box (`heartGateParts`, `heartGatePartPose`): `stone_slab` splits and sinks; `forge_seal` is a LOW barrier (a bronze sill with a rune line, thin light bars, end posts; at most about 3 yd, `HEART_SEAL_BARRIER`) whose bars burn shut, flare sealed, and sink away open. |
| `heart_sightline_core.ts` | PURE: every rock block, prop part and gate part (any openness) as a plain volume from the same plans, and `heartSightlineHits` to trace a sightline through them. |
| `heart_sky.ts` | The storm dome; its `onBeforeRender` is the slot's frame driver (rivers, seal, gates). |

Rules:
- Render reads the world, never mutates it: the seal's state arrives only through the
  mirrored marker entities (`gate_objects.ts`), the gates' only through the gate memory.
- The seal, the rivers and the gates draw on every tier (progress, route and blocking
  information); only the wall spacing sheds on the low tier (cosmetic), never what stays
  open.
- No light but the budgeted point lights through the fire-light sink; the storm grade is
  the borrowed `sunkenBastion` state of `../fog_scene_state.ts` and
  `../interior_light_rig.ts` (until the raid gets its own state).
- One mesh hook (the sky's), pinned in `tests/point_light_carriers.test.ts`; floor marks
  (rivers, seal) on the floor ladder's ground rung, registered strict in
  `tests/floor_vfx_layer.test.ts`.
- Nothing is attached to the scene outside the interior group; materials are shared
  except the seal quarters' and the seal gates' films (their colour is the slot's state).

- No render-only solid stands in the raid's key sightlines: every 10 degrees of the Ring
  and the Balcony tip to the seal, and the Balcony tip to each causeway mouth (pinned in
  the test below through `heart_sightline_core.ts`). A new solid joins those plans.

Tests: `tests/smith_heart_render_core.test.ts` (the sightlines, the rock against the walked floor and the
caldera, the rivers' drape and winding, the seal memory, the gate poses, the prop recipes
and the light budget).
