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
- `warhound/`: the Bastion Warhound (`public/models/creatures/bastion_warhound.glb`), a
  self-contained quadruped builder (the Wildheart Great Jaguar's kit: one sculpted skin, a
  digitigrade rig, the whole-body pose language in `clips.py`) reshaped into a drowned war
  mastiff. Build from `warhound/` with `build.py -- <abs>/bastion_warhound_raw.glb --bake 2048
  --tex <abs>/tex --blend <abs>/bastion_warhound.blend` (`--voxel 0.03 --nobake` for a clay
  look); `reclip.py` re-keys the clips on a baked .blend, `anchors.py` prints the effect anchors.
- `watchman/`: the Drowned Watchman (`public/models/creatures/drowned_watchman.glb`), built
  the Revenant's way from the same kit: a gaunt head under a kettle hat, a riveted
  brigandine, a split watch coat (`tabard_weights`), the halberd and its pennon on the
  never-keyed Weapon bone, a sea-light lantern at the hip; `clips.py` has Idle, CombatIdle,
  Walk, Run, Attack, Attack2, HalberdSweep, Cast, Hit, Death. Anchors print with
  `../kit/anchors.py` (the generic one, reading `anatomy.ANCHORS`).
- `arbalest/`: the Fogbound Arbalest (`public/models/creatures/drowned_arbalest.glb`): a deep
  hood and mantle (`hood_weights`), face rags, a quilted gambeson, a quiver and the windlass
  crossbow, laid out in the frame the posed fist gives it in the shouldered aim
  (`XB_FWD`/`XB_UPV`, from `kit/hand_frame_probe.py`); the bolt, the drawn and loosed strings
  and the crank ride their own bones so Shoot and Aim show the loose (keyed scales) and the
  windlass reload. The muzzle anchor at `Shoot:0.5` is `ARBALEST_MUZZLE` in
  `bastion_creature_fx_core.ts` (`../kit/anchors.py -- <abs>/arbalest Shoot:0.5`).
- `sergeant/`: the Drowned Sergeant (`public/models/creatures/drowned_sergeant.glb`): the Revenant's
  body made heavier, a closed great helm with a T-slit over a smooth form round the head (not the
  face's own bumps), a kelp plume, three-lame pauldrons, both vambraces, the sash (`build_sash`, a
  band over the cuirass) and the bearded boarding axe (haft and iron as two rigid parts on Weapon);
  `clips.py` has Idle, CombatIdle, Walk, Run, Attack, Attack2, Rally, Hit, Death.
- `chanter/`: the Mist Chanter (`public/models/creatures/mist_chanter.glb`): the kit body thinned to
  a bent crone (bony arms, clawed hands, bare feet), a hooked-nose face, the shawl-hood of rag and
  fishing net (`net` surface), weed-hair (`hair_weights`), a rag bodice, a shell necklace, skirts to
  the ankles (`tabard_weights`, the front following the thighs) and the driftwood staff with its
  lure of sea light (a `glow_lure` part); `clips.py` has Idle, Walk, Run, Attack, Attack2, Cast,
  Ward (a loop), Hit, Death. Her first rig is kept as `mist_chanter_thawcaller.glb` for the
  Gravewyrm Sanctum's Thawcaller placeholder.
- `acolyte/`: the Tidebound Acolyte (`public/models/creatures/tidebound_acolyte.glb`), grown from the
  Chanter's builder: an upright living cultist, the cowl and a tall finned mitre, robes to the feet
  with wide sleeves (`build_sleeve`), gill slits, the coral-crowned staff with its pearl of sea light
  and the conch laid out in the left hand's frame; `clips.py` has Idle, Walk, Run, Attack, Attack2,
  Mend (the Brine Mend loop), Hit, Death.
- `prisoner/`: the Shackled Prisoner (`public/models/creatures/drowned_prisoner.glb`), grown from the
  Chanter's builder: a starved body (ribs, spine knobs, the belly fallen in), the drowned grin, a
  long weed mane grown with the head, rag breeches, and the irons (`build_irons`: manacles, collar
  and ankle shackle with snapped chains, rigid on their bones); `clips.py` has Idle, Walk (the
  dragging lurch), Run, Attack, Attack2, Hit, Death.
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

Posing aids in `kit/`: `probe_aim.py` (which weapon directions a key pose can reach),
`hand_frame_probe.py` (the rest-space directions a posed fist turns onto given world
directions, to lay a held prop out so it points where it should in its key pose).
