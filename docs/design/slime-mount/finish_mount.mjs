// Finish the Blender export of the slime mount for the game.
//
//   node docs/design/slime-mount/finish_mount.mjs <blender.glb> <out.glb>
//   node scripts/assets/compress_glb_textures.mjs <out.glb>      (mandatory)
//
// Rigged-asset optimization, as scripts/asset_pipeline's assembleRiggedModel:
// resample + prune + dedup + WebP textures at most 512 px, no meshopt (skinned
// geometry stays plainly encoded). The KTX2 pass after it is not optional:
// tests/glb_texture_compression.test.ts holds every model to KTX2. Fails if a
// clip went missing or stopped carrying the saddle (the rider's seat).
// biome-ignore assist/source/organizeImports: sharp must initialize before @gltf-transform/functions on Windows.
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, textureCompress } from '@gltf-transform/functions';

const [src, out] = process.argv.slice(2);
if (!src || !out) throw new Error('usage: finish_mount.mjs <blender.glb> <out.glb>');

const CLIPS = ['Idle', 'Walk', 'Run', 'Jump'];
const JOINTS = ['base', 'mid', 'move', 'root', 'saddle', 'squash', 'top'];

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
await doc.transform(
  resample(),
  prune(),
  dedup(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512] }),
);

const root = doc.getRoot();
const clips = root.listAnimations().map((a) => a.getName());
for (const c of CLIPS) if (!clips.includes(c)) throw new Error(`missing clip ${c} (have ${clips})`);
const joints = root
  .listSkins()
  .flatMap((s) => s.listJoints().map((j) => j.getName()))
  .sort();
if (joints.join() !== JOINTS.join()) throw new Error(`unexpected joints ${joints}`);
for (const a of root.listAnimations()) {
  if (!a.listChannels().some((ch) => ch.getTargetNode()?.getName() === 'saddle')) {
    throw new Error(`clip ${a.getName()} does not move the saddle`);
  }
}
await io.write(out, doc);
console.log('wrote', out, { clips, joints });
