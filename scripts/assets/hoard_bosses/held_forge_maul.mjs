// The Emberforge Tyrant carries the hammer he calls down. His arena hammer
// (public/vfx/forge-hammer/hammer.glb, authored in docs/design/forge-hammer/) is
// modelled to FALL: head down, origin under the striking face, thirteen yards
// tall. This writes the HELD variant of the same model: head up, origin on the
// grip, sized for his fist, in its own authored black iron, molten face and
// leather (the stock KayKit hammer it replaces rendered pale pink on him).
//
//   node scripts/assets/hoard_bosses/held_forge_maul.mjs
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const SOURCE = 'public/vfx/forge-hammer/hammer.glb';
const TARGET = 'public/models/weapons/hoard_forge_maul.glb';
/** Overall length in the character's bind units (the stock two-hander is 1.86). */
const LENGTH = 1.8;
/** Where his fist closes, measured up the falling model from its face. */
const GRIP_Y = 10.4;
const SOURCE_LENGTH = 12.85;

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(SOURCE);
const root = doc.getRoot();
const scene = root.listScenes()[0];
const scale = LENGTH / SOURCE_LENGTH;
const held = doc.createNode('ForgeMaul_HELD');
// Half a turn about X stands the head up; the grip lands on the origin.
held.setRotation([1, 0, 0, 0]);
held.setScale([scale, scale, scale]);
held.setTranslation([0, GRIP_Y * scale, 0]);
for (const child of scene.listChildren()) {
  scene.removeChild(child);
  held.addChild(child);
}
scene.addChild(held);
await io.write(TARGET, doc);
console.log(
  `wrote ${TARGET}: ${LENGTH} long, grip ${(GRIP_Y * scale).toFixed(2)} from the face end`,
);
