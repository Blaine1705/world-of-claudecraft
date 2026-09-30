# Hollow Crypt creatures

The Chapel Gargoyle, the Carrion Crow and the Ossuary Drake of the Hollow Crypt
trash (`src/sim/content/hollow_crypt_trash.ts`), modelled, rigged and animated in
Blender from code, in the chunky KayKit style of the rest of the cast:

- `creature_kit.py`: the shared helpers. Bodies reuse the Hollow Crypt kit's
  primitives (`docs/design/dungeon-rework/kit/hckit.py`) and its weathered vertex
  colours; every part is RIGID-skinned to one bone. Poses are written as turns in
  the rest armature frame (`.L` mirrored onto `.R`), clips as keys at 24 fps.
- `build_creature.py`: one creature per run, straight to its shipping GLB:

  ```
  blender -b --factory-startup --python build_creature.py -- gargoyle public/models/creatures/crypt_gargoyle.glb [--preview out.png] [--blend out.blend]
  blender -b --factory-startup --python build_creature.py -- crow     public/models/creatures/crypt_crow.glb
  blender -b --factory-startup --python build_creature.py -- drake    public/models/creatures/crypt_drake.glb
  ```

  then `node scripts/build_media_manifest.mjs generate`.

Clips: Idle, Walk, Run, Attack, Hit, Death, Cast on all three (Attack2 on the
gargoyle and drake), plus the drake's Breath, TailLash and WingGust. The
`VISUALS` rows (`mob_crypt_gargoyle`, `mob_crypt_crow`, `mob_crypt_drake` in
`src/render/characters/manifest.ts`) map them; the crow's Death drops the body by
its `hover` so the corpse lies on the floor.

## The hero creatures (third pass)

The Ossuary Drake and the Chapel Gargoyle outgrew the chunky kit: they are built
by `build_bone_drake.py` and `build_stone_gargoyle.py` on `organic_kit.py`
(smooth anatomy parts bound to one bone each, membranes weighted across their
finger bones, an IK and aim posing rig, a Cycles bake of a procedural bone or
cracked-stone surface with its ambient occlusion into one albedo plus a normal
map). Both are authored at their in-game size in yards; the `VISUALS` rows keep
that size (`height` is the measured mid-idle height).

```
blender -b --factory-startup --python build_bone_drake.py -- public/models/creatures/crypt_drake.glb [--sheet dir] [--blend out.blend] [--fast]
blender -b --factory-startup --python build_stone_gargoyle.py -- public/models/creatures/crypt_gargoyle.glb [--sheet dir] [--blend out.blend] [--fast]
node scripts/assets/hollow_crypt_creatures/sheet.mjs <sheetDir> <drake|gargoyle> <out.png>
blender -b <out.blend> --python render_views.py -- <outDir> <Clip:frame:az:el:dist:fx:fy:fz> ...
```

`--fast` bakes at 512 for quick iteration. `--sheet` renders four frames of every
clip beside a player-sized reference; `sheet.mjs` lays them out as one animation
sheet. The effects that ride these clips (the breath torrent, the shockwaves) live
in `src/render/hollow_crypt/crypt_creature_fx.ts`, anchored on the jaw and head
positions measured off these clips (`crypt_creature_fx_core.ts`).
