// Bake a fitting reference for the harbormaster's gear out of the shipped modular body
// (public/models/chars/modular/warrior_modular.glb): the picked parts, unskinned, each
// vertex moved into the BIND-pose frame of one bone (the bone the gear attaches to), so a
// piece authored around the reference lands on the body exactly when the game parents it
// to that bone. Every part in the library carries its own quantization, folded into its
// skin's inverse bind matrices; applying the bone's inverse bind matrix to a part's raw
// positions is therefore exactly "this vertex, seen from the bone at bind pose".
//
//   node scripts/assets/harbormaster_gear/extract_reference.mjs [OUT_DIR]
//
// Writes reference_<bone>.glb per bone (default OUT_DIR tmp/harbormaster_gear, gitignored).
// A preview aid only: the Blender builder's dimensions are constants, so the shipped GLBs
// never depend on this output.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SRC = path.join(ROOT, 'public/models/chars/modular/warrior_modular.glb');
const OUT = path.resolve(ROOT, process.argv[2] ?? 'tmp/harbormaster_gear');

/** The harbormaster's composed body (src/render/characters/npc_looks.ts). */
export const REFERENCE_PARTS = [
  'F_Head',
  'F_Ear_round',
  'F_Eye_almond',
  'F_Brow_thick',
  'F_Mouth_smile',
  'H2_warriorbraid',
  'Armor_mage_Chest',
  'Armor_mage_ArmL',
  'Armor_mage_ArmR',
  'Armor_mage_LegL',
  'Armor_mage_LegR',
  'Armor_mage_FootL',
  'Armor_mage_FootR',
  'Armor_mage_Back',
  'Armor_rogue_HandL',
  'Armor_rogue_HandR',
];
export const REFERENCE_BONES = ['head', 'hips', 'chest'];

function mul(m, v) {
  return [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
  ];
}

await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const src = await io.read(SRC);
await src.transform(dequantize());
mkdirSync(OUT, { recursive: true });

for (const bone of REFERENCE_BONES) {
  const doc = new Document();
  const buf = doc.createBuffer();
  const scene = doc.createScene('Reference');
  const report = [];
  for (const name of REFERENCE_PARTS) {
    const node = src
      .getRoot()
      .listNodes()
      .find((n) => n.getName() === name || n.getMesh()?.getName() === name);
    const skin = node?.getSkin();
    if (!node || !skin) throw new Error(`no skinned part ${name}`);
    const joints = skin.listJoints();
    const j = joints.findIndex((n) => n.getName() === bone);
    if (j < 0) throw new Error(`${name}: no joint ${bone}`);
    const ibm = skin.getInverseBindMatrices().getElement(j, new Array(16));
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    const mesh = doc.createMesh(name);
    for (const prim of node.getMesh().listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      const out = new Float32Array(pos.getCount() * 3);
      const v = [0, 0, 0];
      for (let i = 0; i < pos.getCount(); i++) {
        const p = mul(ibm, pos.getElement(i, v));
        out.set(p, i * 3);
        for (let k = 0; k < 3; k++) {
          lo[k] = Math.min(lo[k], p[k]);
          hi[k] = Math.max(hi[k], p[k]);
        }
      }
      const idx = prim.getIndices();
      const p2 = doc
        .createPrimitive()
        .setAttribute(
          'POSITION',
          doc.createAccessor().setType('VEC3').setArray(out).setBuffer(buf),
        );
      if (idx) {
        p2.setIndices(
          doc
            .createAccessor()
            .setType('SCALAR')
            .setArray(new Uint32Array(idx.getArray()))
            .setBuffer(buf),
        );
      }
      mesh.addPrimitive(p2);
    }
    scene.addChild(doc.createNode(name).setMesh(mesh));
    report.push(
      `${name.padEnd(20)} lo ${lo.map((x) => x.toFixed(3)).join(' ')}  hi ${hi.map((x) => x.toFixed(3)).join(' ')}`,
    );
  }
  const file = path.join(OUT, `reference_${bone}.glb`);
  await new NodeIO().write(file, doc);
  console.log(`# ${bone}-local bind frame -> ${path.relative(ROOT, file)}`);
  for (const line of report) console.log(line);
}
