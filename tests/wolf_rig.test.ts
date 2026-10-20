// The rebuilt wolf rig (scripts/assets/wolf_rig/): wolf_basic.glb (the pack wolves and
// the shaman Shadewolf form) and greyjaw.glb (Old Greyjaw) ship exactly the contract's
// joints and clips (scripts/assets/wolf_rig/contract.mjs), the hit reacts are real
// flinches, the loops close, and no clip either file ships, nor Greyjaw's own attack
// (greyjaw_ability_anims.glb, bound by joint name as the game binds it), puts any
// skinned point under the ground the Idle stands on. The skinning is the game's own
// glTF math (scripts/assets/wolf_rig/skin_pose.mjs) read off the shipped, compressed
// files. ClipMap name resolution and donor binding are tests/character_clipmaps.test.ts's.
import { join } from 'node:path';
import type { Animation, Root } from '@gltf-transform/core';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  WOLF_CLIPS,
  WOLF_FLOOR_TOLERANCE,
  WOLF_HIT_REACT_MAX_S,
  WOLF_JOINT_NAMES,
  WOLF_LOOPS,
  WOLF_RIG_FILES,
} from '../scripts/assets/wolf_rig/contract.mjs';
import {
  clipDuration,
  idleGround,
  localPose,
  lowestByRegion,
  readWolfGlb,
  rigOf,
  type WolfRig,
  worldUpFor,
} from '../scripts/assets/wolf_rig/skin_pose.mjs';

const PUBLIC = join(__dirname, '..', 'public');
const GREYJAW_ATTACK = 'models/creatures/greyjaw_ability_anims.glb';
// Floor sampling rate: every other key of the 30 fps clips.
const FLOOR_FPS = 15;

function clip(root: Root, name: string): Animation {
  const anim = root.listAnimations().find((a) => a.getName() === name);
  if (!anim) throw new Error(`no clip ${name}`);
  return anim;
}

/** The deepest any skinned point goes under the ground over a clip (positive = under). */
function deepestDip(rig: WolfRig, anim: Animation, ground: number) {
  const dur = clipDuration(anim);
  const frames = Math.round(dur * FLOOR_FPS);
  let dip = Number.NEGATIVE_INFINITY;
  let at = 0;
  const unbound = new Set<string>();
  for (let f = 0; f <= frames; f++) {
    const t = Math.min(dur, f / FLOOR_FPS);
    const pose = localPose(rig, anim, t);
    for (const name of pose.unbound) unbound.add(name);
    const low = Math.min(...Object.values(lowestByRegion(rig, pose.local)));
    if (ground - low > dip) {
      dip = ground - low;
      at = t;
    }
  }
  return { dip, at, unbound: [...unbound] };
}

function turnDeg(a: number[], b: number[]): number {
  const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return (2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI;
}

const loaded = new Map<string, Root>();
beforeAll(async () => {
  for (const file of [...WOLF_RIG_FILES, GREYJAW_ATTACK]) {
    loaded.set(file, await readWolfGlb(join(PUBLIC, file)));
  }
});

describe.each(WOLF_RIG_FILES)('wolf rig: %s', (file) => {
  const root = () => loaded.get(file) as Root;

  it('skins the body with exactly the contract joints, and no jaw', () => {
    const skins = root().listSkins();
    expect(skins).toHaveLength(1);
    const joints = skins[0].listJoints().map((j) => j.getName());
    expect([...joints].sort()).toEqual([...WOLF_JOINT_NAMES].sort());
    expect(joints.filter((name) => /jaw|chin/i.test(name))).toEqual([]);
  });

  it('ships exactly the contract clips, each keyed from the first frame', () => {
    const anims = root().listAnimations();
    expect(anims.map((a) => a.getName()).sort()).toEqual([...WOLF_CLIPS].sort());
    for (const anim of anims) {
      const firstKey = Math.min(
        ...anim.listChannels().map((ch) => ch.getSampler()?.getInput()?.getArray()?.[0] ?? 1),
      );
      expect(firstKey, anim.getName()).toBe(0);
    }
  });

  it('flinches on a hit instead of barking for seconds', () => {
    for (const name of ['Idle_HitReact_Left', 'Idle_HitReact_Right']) {
      const dur = clipDuration(clip(root(), name));
      expect(dur, name).toBeGreaterThan(0.2);
      expect(dur, name).toBeLessThanOrEqual(WOLF_HIT_REACT_MAX_S);
    }
  });

  it('closes every loop: the last pose is the first', () => {
    const rig = rigOf(root());
    for (const name of WOLF_LOOPS) {
      const anim = clip(root(), name);
      const first = localPose(rig, anim, 0).local;
      const last = localPose(rig, anim, clipDuration(anim)).local;
      for (const [node, pose] of first) {
        const end = last.get(node);
        if (!end) throw new Error(`${name}: no end pose for ${node.getName()}`);
        expect(turnDeg(pose.r, end.r), `${name} ${node.getName()} turn`).toBeLessThan(0.25);
        const shift = Math.hypot(...pose.t.map((v, k) => v - end.t[k]));
        expect(shift, `${name} ${node.getName()} shift`).toBeLessThan(0.001);
      }
    }
  });

  it('never puts the skin under the ground the Idle stands on', () => {
    const rig = rigOf(root());
    const ground = idleGround(rig, root());
    for (const name of WOLF_CLIPS) {
      const { dip, at } = deepestDip(rig, clip(root(), name), ground);
      expect(
        dip,
        `${name} dips ${dip.toFixed(3)} under the ground at ${at.toFixed(2)} s`,
      ).toBeLessThan(WOLF_FLOOR_TOLERANCE);
    }
  });
});

describe('wolf rig: Greyjaw_Attack (greyjaw_ability_anims.glb on greyjaw.glb)', () => {
  it('binds every channel to a greyjaw.glb joint and stays out of the ground', () => {
    const body = loaded.get('models/creatures/greyjaw.glb') as Root;
    const attack = clip(loaded.get(GREYJAW_ATTACK) as Root, 'Greyjaw_Attack');
    const rig = rigOf(body);
    const { dip, at, unbound } = deepestDip(rig, attack, idleGround(rig, body));
    expect(unbound).toEqual([]);
    expect(dip, `dips ${dip.toFixed(3)} under the ground at ${at.toFixed(2)} s`).toBeLessThan(
      WOLF_FLOOR_TOLERANCE,
    );
  });
});

describe('wolf rig: the floor check itself', () => {
  it('catches a body sunk into the ground', () => {
    const root = loaded.get('models/creatures/wolf_basic.glb') as Root;
    const rig = rigOf(root);
    const ground = idleGround(rig, root);
    const { local } = localPose(rig, clip(root, 'Idle'), 0);
    const pelvis = rig.byName.get('Pelvis');
    if (!pelvis) throw new Error('no Pelvis');
    const pose = local.get(pelvis);
    if (!pose) throw new Error('no Pelvis pose');
    const up = worldUpFor(rig, 'Pelvis');
    const sink = 2 * WOLF_FLOOR_TOLERANCE;
    pose.t = pose.t.map((v, k) => v - up[k] * sink);
    const low = Math.min(...Object.values(lowestByRegion(rig, local)));
    expect(ground - low).toBeCloseTo(sink, 4);
    expect(ground - low).toBeGreaterThan(WOLF_FLOOR_TOLERANCE);
  });
});
