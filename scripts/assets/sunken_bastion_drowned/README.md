# Sunken Bastion drowned: sculpted Blender builders

The second-generation bodies of the Sunken Bastion's drowned garrison, sculpted
whole (signed-distance fields meshed through OpenVDB, decimated, weighted from the
sculpt's own primitives, Cycles-baked to one atlas) instead of the first roster's
toy sailors (`../sunken_bastion_creatures/drowned.py`). Offline authoring tooling:
nothing here runs in the build or the game.

- `kit/`: the shared sculpt kit (SDF primitives and CSG, body-hugging plate layers,
  the biped rig and IK pose language, clip writer, bake surfaces, review renders and
  objective clip gates, the `ship.mjs` optimizer). It is the Balgath / Gravewyrm
  Sanctum trash kit, copied unchanged except one hook: `build_core.run` calls the
  creature's optional `anatomy.post_mesh(pairs)` after binding (the Revenant grows its
  head there).
- `revenant/`: the Bastion Revenant (`public/models/creatures/drowned_revenant.glb`):
  `anatomy.py` (skeleton, sculpts, the morion, cutlass, buckler, barnacles, kelp),
  `dressing.py` (rigid parts and the sea-light eyes), `shading.py` (bake surfaces),
  `clips.py` (Idle, CombatIdle, Walk, Run, Attack, Attack2, Attack3, Hit, Death,
  Rise), `anchors.py` (prints the effect anchors `bastion_drowned_fx_core.ts` uses).

Build, from `revenant/` (Blender 5.2 with OpenVDB; run it at low priority, a full
bake takes about ten minutes):

```
blender -b --factory-startup --python build.py -- <abs>/drowned_revenant_raw.glb --bake 2048 --tex <abs>/tex --blend <abs>/bastion_revenant.blend --stats <abs>/stats.json
KTX_BIN=<KTX-Software bin> node ../kit/ship.mjs <abs>/drowned_revenant_raw.glb public/models/creatures/drowned_revenant.glb
node scripts/build_media_manifest.mjs generate
```

Quick clay look (no bake): add `--k 1.6 --nobake`. Reviews:
`blender -b x.blend --python ../kit/review.py -- <out> views|closeup|checks|analyze --builder <abs>/revenant [--knight knight.glb]`.
Anchors: `blender -b x.blend --python anchors.py -- <abs>/revenant`.
