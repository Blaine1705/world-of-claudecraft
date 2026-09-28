import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { type Node, NodeIO, type Primitive, type Root } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { describe, expect, it } from 'vitest';
import {
  BALGATH_FORM_EYE,
  BALGATH_FORM_FILE,
  BALGATH_FORM_JOINT_COUNT,
  BALGATH_FORM_MAX_BYTES,
  BALGATH_FORM_MAX_INFLUENCES,
  BALGATH_FORM_MAX_TRIANGLES,
  BALGATH_FORM_MESH,
  BALGATH_FORM_SOURCE_FILE,
} from '../scripts/assets/balgath_form/contract.mjs';
import {
  BALGATH_FORM_SOURCE_FILES,
  balgathFormSourceFingerprint,
} from '../scripts/assets/balgath_form/source_fingerprint.mjs';

// The Balgath Form (Blender factory at scripts/assets/balgath_form/model.py): the LIGHT
// player-transformation body of the Balgath world boss. It is the boss's own GLB with the
// one skinned primitive decimated, and everything the game binds to kept identical: the
// 41 joints (names, order, rest pose) the mesh-free donors bind to by NAME, the three KTX2
// textures byte for byte, and the eyeGlow anchor. Pins the source inventory, the live
// source fingerprint and the shipped file byte for byte, then re-measures the file
// against the boss independently of the exporter. A change to any fingerprinted file
// (including a rebake of balgath_cyclops.glb) means re-running
// scripts/assets/balgath_form/export_balgath_form.mjs, then
// `node scripts/build_media_manifest.mjs generate`, then re-pinning below from the summary
// the exporter prints (sizes stay put on a fingerprint-only re-export).

const REPO_ROOT = path.join(__dirname, '..');
const SOURCE_FINGERPRINT = '0b7f5105409f45e07f0430ff82ad24031f12dcad89f89ea04fa7f36fc4289fb2';
const BYTES = 303_604;
const SHA256 = 'eb2e02899b4ea97ca81ca9fdf1e67fae09a8480d4078820996ca42f04eed1f3d';
const TRIANGLES = 2200;
const BOSS_TRIANGLES = 3932;
const DONORS = [
  'public/models/creatures/balgath_clip_donor.glb',
  'public/models/creatures/balgath_ability_anims.glb',
];

async function io(): Promise<NodeIO> {
  await MeshoptDecoder.ready;
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
}

async function load(relative: string): Promise<{ bytes: Buffer; root: Root }> {
  const bytes = readFileSync(path.join(REPO_ROOT, relative));
  return { bytes, root: (await (await io()).readBinary(bytes)).getRoot() };
}

type Vec3 = [number, number, number];

function transformPoint(m: ArrayLike<number>, p: ArrayLike<number>): Vec3 {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}

function multiply(a: ArrayLike<number>, b: ArrayLike<number>): number[] {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return out;
}

function skinned(root: Root): { node: Node; primitive: Primitive } {
  const nodes = root.listNodes().filter((node) => node.getMesh());
  expect(nodes).toHaveLength(1);
  const primitives = nodes[0].getMesh()?.listPrimitives() ?? [];
  expect(primitives).toHaveLength(1);
  return { node: nodes[0], primitive: primitives[0] };
}

/** Bind-space vertex positions. The shipped file is meshopt-quantized, which folds the
 *  dequantization into the inverse bind matrices; world(joint) * IBM(joint) undoes it
 *  (and is the identity on the unquantized boss). */
function bindPositions(node: Node, primitive: Primitive): Vec3[] {
  const skin = node.getSkin();
  if (!skin) throw new Error('mesh node without a skin');
  const ibm = skin.getInverseBindMatrices()?.getElement(0, new Array(16).fill(0)) ?? [];
  const toBind = multiply(skin.listJoints()[0].getWorldMatrix(), ibm);
  const position = primitive.getAttribute('POSITION');
  const out: Vec3[] = [];
  const el = [0, 0, 0];
  for (let i = 0; i < (position?.getCount() ?? 0); i++) {
    out.push(transformPoint(toBind, position?.getElement(i, el) ?? el));
  }
  return out;
}

function bounds(points: Vec3[]): { min: number[]; max: number[] } {
  return {
    min: [0, 1, 2].map((k) => Math.min(...points.map((p) => p[k]))),
    max: [0, 1, 2].map((k) => Math.max(...points.map((p) => p[k]))),
  };
}

describe('Balgath Form: the light player-transformation body', () => {
  it('pins the deterministic source inventory, the live fingerprint and the optimizer spec', () => {
    expect(BALGATH_FORM_SOURCE_FILES).toEqual([
      'scripts/assets/balgath_form/model.py',
      'scripts/assets/balgath_form/contract.mjs',
      'scripts/assets/balgath_form/export_balgath_form.mjs',
      'scripts/assets/balgath_form/source_fingerprint.mjs',
      'scripts/assets/specs/balgath_form.json',
      'scripts/assets/build_assets.mjs',
      'pnpm-lock.yaml',
      'public/models/creatures/balgath_cyclops.glb',
    ]);
    expect(balgathFormSourceFingerprint(REPO_ROOT)).toBe(SOURCE_FINGERPRINT);
    const spec = JSON.parse(
      readFileSync(path.join(REPO_ROOT, 'scripts/assets/specs/balgath_form.json'), 'utf8'),
    );
    expect(spec.items).toEqual([
      {
        src: 'tmp/asset_src/balgath_form/balgath_form.glb',
        out: BALGATH_FORM_FILE,
        type: 'character',
        keepExtras: true,
      },
    ]);
    expect(BALGATH_FORM_FILE).toBe('models/chars/forms/balgath_form.glb');
    expect(BALGATH_FORM_SOURCE_FILE).toBe('models/creatures/balgath_cyclops.glb');
  });

  it('pins the shipped file byte for byte, lighter than the boss', () => {
    const bytes = readFileSync(path.join(REPO_ROOT, 'public', BALGATH_FORM_FILE));
    expect(bytes.length).toBe(BYTES);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(SHA256);
    expect(bytes.length).toBeLessThanOrEqual(BALGATH_FORM_MAX_BYTES);
    const boss = readFileSync(path.join(REPO_ROOT, 'public', BALGATH_FORM_SOURCE_FILE));
    expect(bytes.length).toBeLessThan(boss.length);
  });

  it('ships one decimated skinned primitive, no clips, meshopt, fingerprinted', async () => {
    const { root } = await load(`public/${BALGATH_FORM_FILE}`);
    const { node, primitive } = skinned(root);
    expect(node.getName()).toBe(BALGATH_FORM_MESH);
    expect(node.getMesh()?.getName()).toBe(BALGATH_FORM_MESH);
    expect(root.listMeshes()).toHaveLength(1);
    expect(root.listSkins()).toHaveLength(1);
    expect(root.listAnimations()).toHaveLength(0);
    const triangles = (primitive.getIndices()?.getCount() ?? 0) / 3;
    expect(triangles).toBe(TRIANGLES);
    expect(triangles).toBeLessThanOrEqual(BALGATH_FORM_MAX_TRIANGLES);
    expect(triangles).toBeLessThan(BOSS_TRIANGLES);
    expect(primitive.getAttribute('JOINTS_0')).not.toBeNull();
    expect(primitive.getAttribute('WEIGHTS_0')).not.toBeNull();
    expect(primitive.getAttribute('TEXCOORD_0')).not.toBeNull();
    expect(primitive.getAttribute('JOINTS_1')).toBeNull();
    expect(BALGATH_FORM_MAX_INFLUENCES).toBe(4);
    const weights = primitive.getAttribute('WEIGHTS_0');
    const w = [0, 0, 0, 0];
    for (let v = 0; v < (weights?.getCount() ?? 0); v++) {
      weights?.getElement(v, w);
      expect(Math.abs(w[0] + w[1] + w[2] + w[3] - 1)).toBeLessThan(0.02);
    }
    const extensions = root.listExtensionsUsed().map((e) => e.extensionName);
    expect(extensions).toContain('EXT_meshopt_compression');
    expect(root.getExtras().sourceFingerprint).toBe(SOURCE_FINGERPRINT);
    expect(
      (root.getAsset().extras as { sourceFingerprint?: string } | undefined)?.sourceFingerprint,
    ).toBe(SOURCE_FINGERPRINT);
  });

  it("keeps the boss's 41 joints: names, order, hierarchy and rest pose", async () => {
    const form = (await load(`public/${BALGATH_FORM_FILE}`)).root;
    const boss = (await load(`public/${BALGATH_FORM_SOURCE_FILE}`)).root;
    const formJoints = form.listSkins()[0].listJoints();
    const bossJoints = boss.listSkins()[0].listJoints();
    expect(formJoints).toHaveLength(BALGATH_FORM_JOINT_COUNT);
    expect(formJoints.map((j) => j.getName())).toEqual(bossJoints.map((j) => j.getName()));
    const rest = (j: Node) => [
      ...j.getTranslation(),
      ...j.getRotation(),
      ...j.getScale(),
      j.getParentNode()?.getName() ?? null,
    ];
    expect(formJoints.map(rest)).toEqual(bossJoints.map(rest));
    // No extra or missing nodes: the boss's node list with the mesh node renamed.
    const bossMeshNode = skinned(boss).node.getName();
    expect(form.listNodes().map((n) => n.getName())).toEqual(
      boss.listNodes().map((n) => (n.getName() === bossMeshNode ? BALGATH_FORM_MESH : n.getName())),
    );
  });

  it('is animated only by the donors, which bind to it by node name', async () => {
    // Every donor channel targets a joint (or the Armature root) the form carries.
    const joints = new Set(
      (await load(`public/${BALGATH_FORM_FILE}`)).root.listNodes().map((n) => n.getName()),
    );
    for (const donor of DONORS) {
      const { root } = await load(donor);
      const targets = new Set(
        root
          .listAnimations()
          .flatMap((a) => a.listChannels())
          .map((ch) => ch.getTargetNode()?.getName() ?? ''),
      );
      expect(targets.size, donor).toBeGreaterThan(0);
      for (const name of targets) expect(joints.has(name), `${donor}: ${name}`).toBe(true);
    }
  });

  it("wears the boss's own KTX2 textures, byte for byte", async () => {
    const form = (await load(`public/${BALGATH_FORM_FILE}`)).root;
    const boss = (await load(`public/${BALGATH_FORM_SOURCE_FILE}`)).root;
    const images = (root: Root) =>
      root
        .listTextures()
        .map((t) => ({
          name: t.getName(),
          mimeType: t.getMimeType(),
          sha256: createHash('sha256')
            .update(t.getImage() ?? new Uint8Array())
            .digest('hex'),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    expect(images(form)).toHaveLength(3);
    for (const image of images(form)) expect(image.mimeType).toBe('image/ktx2');
    expect(images(form)).toEqual(images(boss));
    expect(form.listExtensionsRequired().map((e) => e.extensionName)).toContain(
      'KHR_texture_basisu',
    );
    const material = skinned(form).primitive.getMaterial();
    expect(material?.getBaseColorTexture()).not.toBeNull();
    expect(material?.getNormalTexture()).not.toBeNull();
    expect(material?.getMetallicRoughnessTexture()).not.toBeNull();
  });

  it('stands floor-seated inside the boss silhouette', async () => {
    const form = skinned((await load(`public/${BALGATH_FORM_FILE}`)).root);
    const boss = skinned((await load(`public/${BALGATH_FORM_SOURCE_FILE}`)).root);
    const f = bounds(bindPositions(form.node, form.primitive));
    const b = bounds(bindPositions(boss.node, boss.primitive));
    expect(Math.abs(f.min[1])).toBeLessThan(1e-3);
    for (let k = 0; k < 3; k++) {
      const span = b.max[k] - b.min[k];
      expect(Math.abs(f.min[k] - b.min[k])).toBeLessThanOrEqual(0.01 * span);
      expect(Math.abs(f.max[k] - b.max[k])).toBeLessThanOrEqual(0.01 * span);
    }
  });

  it("keeps the boss's eyeGlow anchor on the crystal eye", async () => {
    // manifest.ts mob_balgath_cyclops.eyeGlow: bone 'Head', offset [0.013, 0.115, -0.085].
    expect(BALGATH_FORM_EYE).toEqual({ bone: 'Head', offset: [0.013, 0.115, -0.085] });
    const nearest = async (file: string) => {
      const root = (await load(file)).root;
      const { node, primitive } = skinned(root);
      const head = node
        .getSkin()
        ?.listJoints()
        .find((j) => j.getName() === BALGATH_FORM_EYE.bone);
      if (!head) throw new Error('no Head joint');
      const anchor = transformPoint(head.getWorldMatrix(), BALGATH_FORM_EYE.offset);
      const points = bindPositions(node, primitive);
      let best = 0;
      const d = (i: number) => Math.hypot(...points[i].map((p, k) => p - anchor[k]));
      for (let i = 1; i < points.length; i++) if (d(i) < d(best)) best = i;
      const uv = primitive.getAttribute('TEXCOORD_0')?.getElement(best, [0, 0]) ?? [];
      return { distance: d(best), uv: uv.map((x) => Number(x.toFixed(2))) };
    };
    const form = await nearest(`public/${BALGATH_FORM_FILE}`);
    const boss = await nearest(`public/${BALGATH_FORM_SOURCE_FILE}`);
    expect(form.distance).toBeLessThan(0.002);
    expect(form.uv).toEqual(boss.uv);
  });
});
