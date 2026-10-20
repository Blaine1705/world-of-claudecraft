// Korgath the Bound's grip and his two-handed blows (the owner's 2026-10-20
// notes: the blows looked wrong and even how he held the maul in his palm).
// Root causes, each pinned here against the shipped files:
// - the body is modeled with the right fist closed on the haft, but every one
//   of its clips bent that fist's single finger bone 88 degrees (176 in the
//   gaits), folding the fingers off the haft: the look drops that rotation
//   from every body clip he holds the maul in (VisualDef.clipTrackDrops);
// - his left hand was modeled open on one finger bone, so it could never
//   close on the haft: the body gained a three-joint chain per finger and for
//   the thumb (docs/design/dungeon-rework/korgath/patch_korgath_fingers.mjs),
//   which leaves every old clip's deformation as it was;
// - the modeled grip has the maul's head on the little-finger side (right
//   for carrying it hanging, wrong for a two-handed blow): HammerSlam and
//   HammerSweep (re-authored on a control rig, a clip donor beside the body)
//   turn the right fist end for end on the haft at the top of the wind-up,
//   both fists stay on the haft through the blow, and both clips start and end
//   on Idle's first frame and land on frame 18 as before.

import { readFileSync } from 'node:fs';
import type { Animation, Document } from '@gltf-transform/core';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { keptTrackNames } from '../src/render/characters/clip_track_drops';
import { SANCTUM_BOSS_LOOKS } from '../src/render/characters/sanctum_boss_looks';
import {
  KORGATH_BODY,
  KORGATH_CLIP,
  KORGATH_CLIP_FIXES_URL,
  KORGATH_DONOR_CLIPS,
  KORGATH_FIST_BONE,
  KORGATH_FIST_DROPS,
} from '../src/render/gravewyrm_sanctum_bosses/boss_model_core';
import { type PosedNode, posedNodes } from './helpers/posed_glb';

const AUTHORED = ['HammerSlam', 'HammerSweep'];
const FINGERS = ['index', 'middle', 'ring', 'pinky', 'thumb'].flatMap((f) =>
  [1, 2, 3].map((i) => `${f}.${i}.l`),
);
const BODY = `public/${KORGATH_BODY.url}`;
const DONOR = `public/${KORGATH_CLIP_FIXES_URL}`;
/** Hammer bone units to yards (the rig's root scale) and the head on the haft. */
const HEAD_Y = 1.28;

let body: Document;
let donor: Document;
let unit = 1;

async function read(path: string): Promise<Document> {
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  return io.readBinary(new Uint8Array(readFileSync(path)));
}

beforeAll(async () => {
  body = await read(BODY);
  donor = await read(DONOR);
  const rig = body
    .getRoot()
    .listNodes()
    .find((n) => n.getName() === 'Korgath_Rig');
  unit = rig?.getScale()[0] ?? 1;
}, 60_000);

function clip(doc: Document, name: string): Animation {
  const a = doc
    .getRoot()
    .listAnimations()
    .find((x) => x.getName() === name);
  if (!a) throw new Error(`no ${name}`);
  return a;
}

function length(a: Animation): number {
  return Math.max(...a.listSamplers().map((s) => s.getInput()?.getMax([])[0] ?? 0));
}

function rotationAt(a: Animation, joint: string, t: number): number[] | null {
  const ch = a
    .listChannels()
    .find((c) => c.getTargetNode()?.getName() === joint && c.getTargetPath() === 'rotation');
  const inp = ch?.getSampler()?.getInput();
  const out = ch?.getSampler()?.getOutput();
  if (!inp || !out) return null;
  let k = 0;
  while (k < inp.getCount() - 1 && inp.getScalar(k + 1) <= t + 1e-6) k++;
  return out.getElement(k, []);
}

function angle(a: number[], b: number[]): number {
  const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return 2 * Math.acos(Math.min(1, d));
}

const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: number[], b: number[]) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: number[]) => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Distance (yd) from a point to the maul's haft line. */
function offHaft(p: number[], hammer: PosedNode): number {
  const d = sub(p, hammer.pos);
  const along = dot(d, hammer.up);
  const q = sub(
    d,
    hammer.up.map((v) => v * along),
  );
  return Math.hypot(q[0], q[1], q[2]);
}

/** The maul's haft direction in the right hand's own frame (wrist to knuckles,
 *  wrist to the hand slot): which end of the haft the fist's thumb side holds. */
function haftInRightHand(n: Record<string, PosedNode>): number[] {
  const x = norm(sub(n['fingers.r'].pos, n['hand.r'].pos));
  const s = sub(n['handslot.r'].pos, n['hand.r'].pos);
  const y = norm(
    sub(
      s,
      x.map((v) => v * dot(s, x)),
    ),
  );
  const z = cross(x, y);
  return [dot(n.hammer.up, x), dot(n.hammer.up, y), dot(n.hammer.up, z)];
}

const NODES = ['hammer', 'hand.r', 'fingers.r', 'handslot.r', 'hand.l', 'hips'];

describe("Korgath's grip", () => {
  it('the body gained a three-joint left hand and the old rig is untouched', () => {
    const root = body.getRoot();
    const skin = root
      .listNodes()
      .find((n) => n.getName() === 'Korgath')
      ?.getSkin();
    const joints = new Map((skin?.listJoints() ?? []).map((j) => [j.getName(), j]));
    for (const name of FINGERS) {
      const j = joints.get(name);
      expect(j, name).toBeTruthy();
      const parent = j?.getParentNode()?.getName();
      if (name.endsWith('.1.l'))
        expect(parent, name).toBe(name.startsWith('thumb') ? 'hand.l' : 'fingers.l');
      else expect(parent, name).toBe(name.replace(/\.(\d)\.l$/, (_, i) => `.${Number(i) - 1}.l`));
    }
    // at rest the new bones leave every vertex where it was: each joint's rest
    // world times its inverse bind is the same bind space as the old joints'
    const ibm = skin?.getInverseBindMatrices();
    const all = skin?.listJoints() ?? [];
    const bind = (i: number) =>
      new THREE.Matrix4()
        .fromArray(all[i].getWorldMatrix())
        .multiply(new THREE.Matrix4().fromArray(ibm?.getElement(i, []) ?? []));
    const ref = bind(all.findIndex((j) => j.getName() === 'hips'));
    for (const name of FINGERS) {
      const m = bind(all.findIndex((j) => j.getName() === name));
      for (let k = 0; k < 16; k++) expect(m.elements[k], name).toBeCloseTo(ref.elements[k], 3);
    }
    // the body's own clips never key the new bones (they stay at rest there)
    for (const a of root.listAnimations())
      for (const ch of a.listChannels())
        expect(FINGERS.includes(ch.getTargetNode()?.getName() ?? '')).toBe(false);
  });

  it('every body clip he holds the maul in drops the fist bone; the donor replaces the rest', () => {
    const look = SANCTUM_BOSS_LOOKS.sanctum_korgath;
    expect(look.clipTrackDrops).toBe(KORGATH_FIST_DROPS);
    expect(look.animUrls).toEqual([KORGATH_CLIP_FIXES_URL]);
    const bodyClips = body
      .getRoot()
      .listAnimations()
      .map((a) => a.getName())
      .sort();
    const covered = [...Object.keys(KORGATH_FIST_DROPS), ...KORGATH_DONOR_CLIPS].sort();
    expect(covered).toEqual(bodyClips);
    for (const bones of Object.values(KORGATH_FIST_DROPS))
      expect(bones).toEqual([KORGATH_FIST_BONE]);
    // on the track names three's loader gives the body's clips, the drop takes
    // the fist bone's rotation and nothing else
    const threeProp = {
      translation: 'position',
      rotation: 'quaternion',
      scale: 'scale',
      weights: 'morphTargetInfluences',
    } as const;
    for (const [name, bones] of Object.entries(KORGATH_FIST_DROPS)) {
      const tracks = clip(body, name)
        .listChannels()
        .map(
          (c) =>
            `${THREE.PropertyBinding.sanitizeNodeName(c.getTargetNode()?.getName() ?? '')}.${threeProp[c.getTargetPath() as keyof typeof threeProp]}`,
        );
      const kept = new Set(keptTrackNames(tracks, bones));
      expect(
        tracks.filter((t) => !kept.has(t)),
        name,
      ).toEqual(['fingersr.quaternion']);
    }
    // the body's clips really do bend it (what the drop removes)
    const rest = body
      .getRoot()
      .listNodes()
      .find((n) => n.getName() === KORGATH_FIST_BONE)
      ?.getRotation() as number[];
    const idleCurl = rotationAt(clip(body, 'Idle'), KORGATH_FIST_BONE, 0) as number[];
    expect(angle(idleCurl, rest)).toBeGreaterThan(1.2);
  });

  it('the donor carries only clips, onto the body rig', () => {
    const root = donor.getRoot();
    expect(root.listMeshes()).toHaveLength(0);
    expect(root.listTextures()).toHaveLength(0);
    expect(
      root
        .listAnimations()
        .map((a) => a.getName())
        .sort(),
    ).toEqual([...KORGATH_DONOR_CLIPS].sort());
    const names = new Set(
      body
        .getRoot()
        .listNodes()
        .map((n) => n.getName()),
    );
    for (const a of root.listAnimations())
      for (const ch of a.listChannels())
        expect(names.has(ch.getTargetNode()?.getName() ?? ''), a.getName()).toBe(true);
  });

  it('Death keeps the right fist closed on the haft until the maul falls from it', () => {
    const rest = body
      .getRoot()
      .listNodes()
      .find((n) => n.getName() === KORGATH_FIST_BONE)
      ?.getRotation() as number[];
    const d = clip(donor, 'Death');
    expect(length(d)).toBeCloseTo(length(clip(body, 'Death')), 2);
    expect(angle(rotationAt(d, KORGATH_FIST_BONE, 0) as number[], rest)).toBeLessThan(0.01);
    expect(angle(rotationAt(d, KORGATH_FIST_BONE, length(d)) as number[], rest)).toBeGreaterThan(
      0.3,
    );
  });
});

describe("Korgath's two-handed blows", () => {
  it('keep their length and start and end on Idle (the seams blend)', () => {
    const idle = clip(body, 'Idle');
    for (const name of AUTHORED) {
      const a = clip(donor, name);
      expect(length(a), name).toBeCloseTo(length(clip(body, name)), 2);
      expect(length(a), name).toBeCloseTo(1.5, 2);
      for (const ch of a.listChannels()) {
        if (ch.getTargetPath() !== 'rotation') continue;
        const j = ch.getTargetNode()?.getName() ?? '';
        if (j === KORGATH_FIST_BONE || FINGERS.includes(j)) continue;
        const i0 = rotationAt(idle, j, 0);
        if (!i0) continue;
        for (const t of [0, length(a)])
          expect(angle(i0, rotationAt(a, j, t) as number[]), `${name} ${j}@${t}`).toBeLessThan(
            0.02,
          );
      }
    }
  });

  it('turn the right fist end for end on the haft for the blow, and back', async () => {
    const idle = haftInRightHand(await posedNodes(BODY, 'Idle', 0, NODES));
    for (const name of AUTHORED) {
      const atContact = haftInRightHand(await posedNodes(DONOR, name, KORGATH_CLIP.slam, NODES));
      const atEnd = haftInRightHand(await posedNodes(DONOR, name, 1.5, NODES));
      // the head was on the little-finger side; at the blow it is on the thumb side
      expect(dot(idle, atContact), name).toBeLessThan(-0.5);
      expect(dot(idle, atEnd), name).toBeGreaterThan(0.95);
    }
  });

  it('hold the haft in both fists through the blow', async () => {
    // The modeled grip sits the right wrist this far off the haft's line; the
    // left fist's grip (the closed finger bones) sits its wrist under half a yard.
    const idle = await posedNodes(BODY, 'Idle', 0, NODES);
    const seat = offHaft(idle['hand.r'].pos, idle.hammer);
    for (const name of AUTHORED) {
      for (const t of [0.5, KORGATH_CLIP.slam, 0.7, 0.9]) {
        const n = await posedNodes(DONOR, name, t, NODES);
        expect(offHaft(n['hand.l'].pos, n.hammer), `${name} left @${t}`).toBeLessThan(0.5);
        expect(
          Math.abs(offHaft(n['hand.r'].pos, n.hammer) - seat),
          `${name} right @${t}`,
        ).toBeLessThan(0.1);
      }
    }
  });

  it('land on frame 18: the slam on the terrace in front, the sweep across his front', async () => {
    const at = async (name: string, t: number) => {
      const n = await posedNodes(DONOR, name, t, NODES);
      const head = n.hammer.pos.map((v, i) => v + n.hammer.up[i] * HEAD_Y * unit);
      return { head, hips: n.hips.pos };
    };
    // glTF axes: +Y up, he faces +Z, his left is +X
    const slam = await at('HammerSlam', KORGATH_CLIP.slam);
    expect(slam.head[1]).toBeLessThan(1.6);
    expect(slam.head[2] - slam.hips[2]).toBeGreaterThan(5);
    const before = await at('HammerSlam', KORGATH_CLIP.slam - 4 / 30);
    expect(before.head[1]).toBeGreaterThan(slam.head[1] + 3);
    const sweep = await at('HammerSweep', KORGATH_CLIP.sweep);
    expect(sweep.head[2] - sweep.hips[2]).toBeGreaterThan(4);
    expect(Math.abs(sweep.head[0] - sweep.hips[0])).toBeLessThan(2.5);
    const wound = await at('HammerSweep', KORGATH_CLIP.sweep - 3 / 30);
    const through = await at('HammerSweep', KORGATH_CLIP.sweep + 4 / 30);
    // right to left: from his right (-X) through his front to his left (+X)
    expect(wound.head[0]).toBeLessThan(sweep.head[0]);
    expect(through.head[0]).toBeGreaterThan(sweep.head[0] + 2);
  });
});
