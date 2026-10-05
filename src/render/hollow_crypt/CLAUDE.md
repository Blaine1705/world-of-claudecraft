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
| `crypt_kit_plan_core.ts` | PURE: every kit placement (sim props, the arcade derived from its columns, cliff-edge rails, curtain walls, light holders, set dressing) and each piece's support rule. In `RENDER_PURE_CORES`; audited by `tests/hollow_crypt_kit_support.test.ts`. |
| `crypt_gate_state_core.ts` | PURE: the gate memory (state, reveal clock) fed by `../gate_objects.ts`. In `RENDER_PURE_CORES`. |
| `crypt_atmosphere.ts` | Sky dome with the moon and clouds, mist sea, soul column, wisps, dust, moonbeams, crag ring. All motion on `sharedUniforms.uTime`. |
| `crypt_lights.ts` | Flames, halos, floor pools (floor ladder, `ground` band), budgeted point lights through the fire-light sink. |
| `crypt_gates.ts` | Gate structures; one shader patch reads a per-gate `uOpen`, refreshed in `onBeforeRender` from the gate memory. |
| `crypt_creature_fx_core.ts` | PURE: the hero creatures' effect plan: the drake's jaw anchors (measured off its Blender clips), the Barrowflame torrent and scorch timeline, the ghost-fire ramp (`GHOST_FIRE_RAMP`, warm green-white, never cyan), cone spots, shockwave and tail-sweep curves, the touchdown test. In `RENDER_PURE_CORES`. |
| `crypt_creature_fx.ts` | The Ossuary Drake's Barrowflame Breath (inhale, a ghost-fire torrent of upright flame tongues over the whole cone on the Ignivar flame atlas, heat shimmer, ember lift, scorch), tail sweep, wing buffet and landing blast; the Chapel Gargoyle's awakening, dive shockwave and cracks, and Stone Shriek. Three GPU particle draws plus pooled floor shaders, one gated root, built by `rift_death_zone.ts` beside `crypt_trash_fx.ts`. |
| `crypt_trash_fx_core.ts` + `crypt_trash_fx.ts` | PURE plan + painter of the trash floor telegraphs on the shared `../floor_telegraph` kit: cast cones, rings, the Rimesilk lane and kick glyphs off cast state, the Bone Minion's fuse, and the trash kit's floor objects (`cryptObjectTelegraphs`: the Grave Rupture ring filling with its caster's bar, the heroic pool's and Barrow Embers' burning edges). Built by `rift_death_zone.ts`; owns `crypt_trash_kit_fx.ts`. |
| `crypt_trash_kit_fx_core.ts` | PURE (`RENDER_PURE_CORES`): the trash mechanics pass's hero plan, every clock and footprint read off the sim templates: the bone pile's countdown beat and tether reach, the rupture blast and pool, the crush crack, the Granite Skin crust (plates per layer, the plate spiral) and Cracked Stone glow, the Carrion Eye bolt and glyph, the Rimesilk strand and web net, the Barrow Embers. `tests/hollow_crypt_trash_fx_core.test.ts`. |
| `crypt_trash_kit_fx.ts` | The hero layer's host: one gated root, four GPU particle pools (dust, bone and stone shards, ghost fire, glow), the pooled floor patch, beam and glyph builders and the ladder rungs (`KIT_STEPS`). Its parts: `crypt_bone_fx.ts` (the bone pile's soul-green glow and necromancer tether, the warrior standing back up, the crumble, the rupture blast and pool body, the Splinter Burst, the Marrow Crush crack) and `crypt_mark_fx.ts` (the gargoyle's granite crust, flakes and amber cracks, the Carrion Eye bolt, glyph and crow streaks, the Rimesilk strand and web net, the burning embers). Shared shader chunks and drape helpers: `crypt_fx_floor.ts`. |
| `morthen_fx_core.ts` | PURE: Morthen the Lich Bishop's stance (the bell staff, the scythe after his Last Rites at `MORTHEN_LAST_RITES_FRACTION`, read off his mirrored health with hysteresis), the rig gestures that swap it (`VisualDef.phaseClips`), his body anchors and the transform, swing-trail and dissolve timings. In `RENDER_PURE_CORES`; `tests/morthen_lich.test.ts`. |
| `morthen_fx.ts` | His body effects on the crypt particle kit: soul smoke trail (dark green-grey), wisps, rib fire, soul-green sparks off the mitre eye, the unfolding burst, the bell's toll rings on Shadow Pulse, scythe crescents and staff-strike rings, the smoke dissolve on death. Sends the stance and toll gestures through `rift_death_zone.ts`'s `playGesture`. One gated root. |
| `crypt_boss_fx_core.ts` | PURE: the wing bosses' effect plan: the lantern looks, the bell rope's haul and swing, the grave opening, the claim origin of a spot (`cryptSlotOrigin`). In `RENDER_PURE_CORES`; `tests/crypt_boss_fx_core.test.ts`. |
| `crypt_boss_fx.ts` | The wing bosses' host: one gated root, the telegraph kit, a dust and a glow pool and floor shockwaves shared by three painters, built by `rift_death_zone.ts` beside the finale. |
| `marrow_fx.ts` | Sexton Marrow: the Shovelful cone and its dirt, the Measured ring and thread, the Open Graves (pit decal, earth mound, grave mist), the bell rope hauled as he rings, the peals as sound shells and floor waves, the Toll, the dead rising. |
| `lady_fx.ts` | The Lady of the Bonechill: the three grave lanterns (iron, glass, flame, the light pool that IS the shelter, dark and kindling) and the shelter dome, the frozen bridal grave, the Lament, the Embrace ring and frost spiral, the Rime Path and the frozen ravine, her snow trail. |
| `ilvane_fx.ts` | Cantor Ilvane: the Dirge's kick glyph (or the lethal ring of the Unbroken Verse), the song shattering when it is cut, Harmony's threads, the Bone Organ's note lanes and pipes, the Encore. Composes `ilvane_dirge_fx.ts`. |
| `ilvane_dirge_fx_core.ts` + `ilvane_dirge_fx.ts` | PURE plan + painter of the Dirge of the Hollow: the build-up (her dark aura swelling with the bar, the shadow choir's voices, notes, the Bone Organ's pipes kindling), the sight cue (the shared sight field, `../trash_engine_fx/sight_field.ts`, out to the sim's `dirgeRadius`: the floor she sees and the hatched wedge each choir pillar throws; a beam of song and a ring under every player she sees, a pale ring under the hidden), the release (a shock of dark sound stopping at each pillar) and a silence mark over every silenced player. Core in `RENDER_PURE_CORES`; `tests/ilvane_dirge_fx_core.test.ts`. |
| `crypt_kit.ts` | Loads and bakes `public/models/props/hollow_crypt_kit.glb` (Blender source in `docs/design/dungeon-rework/kit/`), instances every piece, procedural stand-ins when it is missing. |

Rules:
- Cosmetic only: nothing here decides or hides an outcome. Density sheds with the
  effects tier; telegraph readability wins (floor pools sit on the `ground` rung, arena
  floors stay dark, lit dressing stays in the wall band).
- No new directional or hemisphere light: the moon is the `hollowCrypt` state of
  `interior_light_rig.ts`; point lights go through the fire-light sink only.
- Tall render-only dressing never stands on walkable ground without a sim collider.
- Nothing floats: every piece stands on the floor under its own footprint, rests on the
  top of what carries it, hangs from a piece, or rises from the chasm floor, and every
  flame burns in a placed holder. Rails on ramps are SHEARED (posts plumb), never tilted.
  `tests/hollow_crypt_kit_support.test.ts` checks the shipped GLB against the real floor.
