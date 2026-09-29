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
