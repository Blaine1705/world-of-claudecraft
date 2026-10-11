# Amphibious lurker asset

Original Blender model for the two ordinary eel replacements inside Drowned Temple.
The paired entrance guardians are a separate miniboss asset. This hunter uses a low,
broad four-legged silhouette, shovel jaw, webbed paws, muted blue-green hide, broad
overlapping scutes and a small broken coral ridge. Cyan is restricted to eyes and
gill slits; cast effects belong to the event-driven renderer.

The user supplied `proposal.png` on 2026-10-08, then explicitly chose an amphibious
quadruped and requested Blender authorship with KayKit-compatible styling. The
image's realistic serpent is a direction reference only, not reproduced topology
or a traced silhouette. No reference pixels, imported meshes or third-party textures
ship. Reference SHA256:
`e15184b6a4aa4d12e9cbc2e4ba12598a060a1f5c5b8520dc8e2c0289bce3ed57`.
The supplied collage is not redistributed and its third-party rights are not asserted.

## Budget and final contract

Budget locked before authoring: target 12,000 triangles, ceiling 18,000 triangles,
500 KiB, two material buckets, no textures. Final shipping model:

| Property | Value |
|---|---|
| Runtime key | `temple_abyssal_lurker` |
| Intended runtime height | 2.4 yards |
| Optimized bytes | 144,604 |
| Triangles | 5,584 |
| Primitives / materials | 2 / 2 |
| Embedded textures | 0 |
| Skin / joints | 1 / 15 |
| Clips | Idle, Walk, Run, Attack, Attack2, Hit, Death, Cast, Spit, Leap |
| Source fingerprint | `686b8e5e5d4eaeeee14ea499b3b404f7a6a7babe31bf1b9ecb362de3f901fc60` |
| Shipping SHA256 | `533e4c6ece6f07b384396c5ee32a74750b636a951d5598a8131a2a91f6315ad9` |

All clips key all fifteen joints. Death starts at the Idle pose, rolls the hunter
onto its side and folds its limbs. Blender evaluates the actual skinned terminal
mesh to seat the corpse at 0.025 yards; the asset test independently applies the
shipping animation with Three.js and checks deformed vertices against the floor.

Actual dungeon inspection exposed a double color conversion in the inherited
Blender kit: linear RGB was written into sRGB byte-color storage and then
linearized again by the exporter. The asset-local `LurkerBody.finish` corrects
the color attribute before export. The shader and body emission are unchanged.
The shipping test pins the intended teal in linear vertex colors so the body
cannot silently return to near-black after a re-export.

## Rebuild

Run from the repository root with Blender 5.2.1 available as `blender` (or substitute
the local executable path). Both the Python factory and editable
`scripts/assets/drowned_temple_creatures/abyssal_lurker.blend` are delivered;
the GLB is the runtime asset.

```sh
blender -b --factory-startup --python scripts/assets/drowned_temple_creatures/build_creature.py -- abyssal_lurker tmp/asset_src/temple_abyssal_lurker.glb --blend scripts/assets/drowned_temple_creatures/abyssal_lurker.blend
node scripts/assets/build_assets.mjs scripts/assets/specs/temple_abyssal_lurker.json
node scripts/assets/drowned_temple_creatures/seal_abyssal_lurker.mjs
node scripts/assets/compress_glb_textures.mjs public/models/creatures/temple_abyssal_lurker.glb
node scripts/build_media_manifest.mjs generate
npx vitest run tests/temple_abyssal_lurker_asset.test.mjs
node scripts/asset_pipeline/pipeline.mjs preview --file public/models/creatures/temple_abyssal_lurker.glb --out tmp/abyssal-lurker-shipped
```

The seal binds the character factory, shared Blender rig/export helpers, standard
optimizer, spec, seal implementation and lockfile. Rebuild and repin after changing
one of those inputs. Sealing twice is byte-identical.

Shipping GLB front, side, back and three-quarter views and all clip sample previews
were rendered and inspected under `tmp/abyssal-lurker-shipped`. A terminal Death
pose was also rendered from the shipped animation. Structural validation reports
zero errors, with the existing sea-kit non-root skinned mesh warning (the armature
parent has identity transform) and the validator's unsupported meshopt notice.
The texture compression pass skips this texture-free asset. In-game placement,
mechanics and VFX evidence are part of the integrated dungeon QA.
