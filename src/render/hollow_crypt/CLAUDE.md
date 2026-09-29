# src/render/hollow_crypt: the Hollow Crypt's open-air necropolis

The render half of the Hollow Crypt rework (`docs/design/dungeon-rework/hollow_crypt.md`).
The sim layout (`src/sim/content/hollow_crypt_layout.ts`) and its gates
(`src/sim/content/hollow_crypt.ts`) are the single source; everything here derives
from them.

| Module | Role |
|---|---|
| `crypt_interior.ts` | Composes the interior group (terrain, kit, gates, lights, sky). Called by `dungeon.ts` `buildInterior` for interior `hollow_crypt`, attached through the compile gate. |
| `crypt_plan_core.ts` | PURE: wisp rivers, light spots and styles, moon shafts, the crag ring, cliff-edge dressing, the gate reveal curve. In `RENDER_PURE_CORES`. |
| `crypt_set_dressing_core.ts` | PURE: render-only set dressing placements (no colliders). In `RENDER_PURE_CORES`. |
| `crypt_gate_state_core.ts` | PURE: the gate memory (state, reveal clock) fed by `../gate_objects.ts`. In `RENDER_PURE_CORES`. |
| `crypt_atmosphere.ts` | Sky dome with the moon and clouds, mist sea, soul column, wisps, dust, moonbeams, crag ring. All motion on `sharedUniforms.uTime`. |
| `crypt_lights.ts` | Flames, halos, floor pools (floor ladder, `ground` band), budgeted point lights through the fire-light sink. |
| `crypt_gates.ts` | Gate structures; one shader patch reads a per-gate `uOpen`, refreshed in `onBeforeRender` from the gate memory. |
| `crypt_kit.ts` | Loads and bakes `public/models/props/hollow_crypt_kit.glb` (Blender source in `docs/design/dungeon-rework/kit/`), instances every piece, procedural stand-ins when it is missing. |

Rules:
- Cosmetic only: nothing here decides or hides an outcome. Density sheds with the
  effects tier; telegraph readability wins (floor pools sit on the `ground` rung, arena
  floors stay dark, lit dressing stays in the wall band).
- No new directional or hemisphere light: the moon is the `hollowCrypt` state of
  `interior_light_rig.ts`; point lights go through the fire-light sink only.
- Tall render-only dressing never stands on walkable ground without a sim collider.
