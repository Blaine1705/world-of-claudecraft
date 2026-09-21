# Hoard boss bodies

Five Buried Hoard (and rift) bosses have a body of their own instead of their
family's shared model. Each was generated with the asset pipeline
(`scripts/asset_pipeline/pipeline.mjs creature ... --until texture`) and then
finished here. The shipped files are `public/models/creatures/hoard_*.glb`; the
visuals are the `mob_hoard_*` entries of `src/render/characters/manifest.ts`.

Everything below runs headless:
`blender --background --python <script> -- <args>`. The raw generated models
face +X with +Z up and are normalized to roughly one unit.

| Boss | Rig | Finishing |
|---|---|---|
| Abyssal Maw | authored here | `maw_rig.py`: a hand-placed skeleton (jaw, tail, chin tentacles, lure), distance weights, and seven procedural clips. Tripo's quadruped auto-rig folded his head under his chest and ships one walk preset, so none of it is used. |
| Hoarfrost Warden | Tripo biped | `frost_fix.py` per retargeted preset: the arm twist chains and the hand are folded into their parent bone and sharpened (the gauntlets are rigid ice, not rubber), every arm rotation is relaxed toward his generated arms-at-his-sides pose, and Attack is an authored two-fisted slam. He is too top-heavy for the local KayKit rig. |
| Emberforge Tyrant | local KayKit (`rig-manual`) | `ember_mix.py` keeps the original glowing texture and takes only the hands and feet from an iron repaint; `reshape.py ember` grows the hands about the wrist. |
| Archon Nyxaris | local KayKit (`rig-manual`) | `nyx_fix.py` removes the generated legs and shoes from under the robe: he floats (`hover` in the manifest). |
| Tempest Vharok | local KayKit (`rig-manual`) | `reshape.py vharok` lengthens the arms: the bare upper arm stretches, the bracer and hand ride out, and the pauldrons, wings and studs (separate welded shells) keep their shape. |

## Rebuild

```
# Maw
blender --background --python scripts/assets/hoard_bosses/maw_rig.py -- <raw.glb> <dir> [--blend maw.blend]
node scripts/assets/hoard_bosses/assemble.mjs maw <dir> public/models/creatures/hoard_abyssal_maw.glb

# Warden (one call per preset; idle first, the slam starts from its first frame)
blender --background --python scripts/assets/hoard_bosses/frost_fix.py -- <preset.glb> <fixed/preset.glb> <relax>
blender --background --python scripts/assets/hoard_bosses/frost_fix.py -- <slash.glb> <fixed/slash.glb> 0 --attack <fixed/idle.glb>
node scripts/assets/hoard_bosses/assemble.mjs frost <fixed dir> public/models/creatures/hoard_hoarfrost_warden.glb

# Ember, Vharok, Nyxaris: reshape or fix the raw, then rig it locally (free)
blender --background --python scripts/assets/hoard_bosses/reshape.py -- <ember|vharok> <in.glb> <out.glb>
node scripts/asset_pipeline/pipeline.mjs rig-manual --raw <out.glb> --name <hoard_key>
```

The relax shares used for the Warden: idle 0.8, walk 0.7, run 0.65, hit 0.6,
jump 0.5, cast 0.45, death 0.35.

`rig-manual` needs a T-pose and scales the mesh so its arm line meets the
reference wrist height, so it only suits roughly human proportions.
