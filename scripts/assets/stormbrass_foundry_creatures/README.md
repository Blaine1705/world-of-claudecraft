# Stormbrass Foundry creatures

The Stormbrass Foundry's machines and engineers (phase 3 of
`docs/design/dungeon-rework/stormbrass_foundry.md`), modelled, rigged and
animated in Blender from code on the Hollow Crypt organic kit
(`../hollow_crypt_creatures/organic_kit.py`) through `foundry_kit.py`:

- **Materials**: five, all but the glow baked into one albedo (with its ambient
  occlusion) plus a normal map. `CreatureMetal` carries brass, copper and iron
  with hammered dents, polished edges, verdigris in the warm metals' hollows and
  steam stains; `CreatureBody` painted iron, rubber, leather and cloth;
  `CreatureGlass` lenses and glints; `CreatureMembrane` flags and aprons;
  `CreatureGlow` the storm's lightning blue (never orange).
- **Hard surfaces**: `MPart` marks every edge sharper than 35 degrees as hard;
  primitives for oriented boxes, riveted plates, pipes, gears, coils, gauges,
  pistons, hazard paint and caterpillar treads.
- **Motion**: clips are tracks of parameters with their own easing
  (anticipation holds, snapped strikes, overshoots that settle) solved on every
  frame (`anim`, `tracks`); `slides` move a bone along its axis (pistons,
  recoil).
- **Held tools are never their own bones**: a wrench, a riveter, a shield, a
  spanner is modelled on the bone that carries it
  (`tests/stormbrass_foundry_creatures.test.ts` pins the skeletons).

```
blender -b --factory-startup --python <creature>.py -- <out.glb|-> [--sheet dir] [--blend out.blend] [--fast] [--nobake]
node scripts/assets/hollow_crypt_creatures/optimize.mjs public/models/creatures/foundry_<id>.glb
node scripts/build_media_manifest.mjs generate
```

`FOUNDRY_KNIGHT=<plain knight.glb>` puts the
player's knight beside the creature in the sheets; `FOUNDRY_VIEWS` and
`FOUNDRY_VIEWS_DIR` render review stills (`Clip:frame:az:el:dist:fx:fy:fz;...`).
Each build prints `IDLE_HEIGHT` and `MINZ` (the VISUALS row's `height` and
`hover`) and `ANCHOR` lines the effect layer
(`src/render/stormbrass_foundry/foundry_creature_fx_core.ts`) reads.

| Module | Creature (template) |
|---|---|
| `tock.py` | Line-Master Ambrel Tock (`line_master_tock`): the gauge needle is a dial bone |
| `rangewarden.py` | The Rangewarden (`rangewarden`) |
| `voltaic_warden.py` | The Voltaic Warden (`voltaic_warden`): twelve plate dial bones |
| `hauler.py` | The Gantry Hauler (`gantry_hauler`) |
| `automaton.py` + `brass_sentry.py`, `shieldbearer.py`, `half_built_frame.py`, `steam_bruiser.py` | the automata trash |
| `engineer_body.py` + `engineer.py`, `apprentice.py` | the Foundry Engineer and the Gearwright Apprentice |
| `hound.py`, `arc_drone.py`, `tripod_turret.py` | the Coilspring Hound, the Arc Drone, the Tripod Turret |

The VISUALS rows live in `src/render/characters/foundry_creature_looks.ts`; the
bones a clip cannot know (Tock's gauge, the Warden's plates) turn on
`VisualDef.dials` (`src/render/characters/bone_dials.ts`). The Prime Draft is
modelled separately (another artist's delivery) and keeps its placeholder until
it lands.
