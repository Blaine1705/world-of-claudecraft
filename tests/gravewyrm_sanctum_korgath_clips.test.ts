// Korgath the Bound's two-hand blows (the owner's 2026-10-20 note: in both of
// his attacks the left arm went behind his back): HammerSlam and HammerSweep
// re-solved with the left hand on the haft ride a clip donor beside his body
// (docs/design/dungeon-rework/korgath/korgath_two_hand_fix.py and
// ship_korgath_clip_fixes.mjs). The donor's clips replace the body's by name;
// only the left arm changes, both ends stay the body clip's own, and the body
// file is untouched.

import { readFileSync } from 'node:fs';
import type { Animation, Document } from '@gltf-transform/core';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { beforeAll, describe, expect, it } from 'vitest';
import { SANCTUM_BOSS_LOOKS } from '../src/render/characters/sanctum_boss_looks';
import {
  KORGATH_BODY,
  KORGATH_CLIP_FIXES_URL,
} from '../src/render/gravewyrm_sanctum_bosses/boss_model_core';

const CLIPS = ['HammerSlam', 'HammerSweep'];
const LEFT_ARM = new Set(['upperarm.l', 'lowerarm.l', 'hand.l']);

let body: Document;
let donor: Document;

async function read(url: string): Promise<Document> {
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  return io.readBinary(new Uint8Array(readFileSync(`public/${url}`)));
}

beforeAll(async () => {
  body = await read(KORGATH_BODY.url);
  donor = await read(KORGATH_CLIP_FIXES_URL);
}, 60_000);

function clip(doc: Document, name: string): Animation {
  const a = doc
    .getRoot()
    .listAnimations()
    .find((x) => x.getName() === name);
  if (!a) throw new Error(`no ${name}`);
  return a;
}

/** A joint's rotation at time t (linear between keys, normalized). */
function rotationAt(a: Animation, joint: string, t: number): number[] | null {
  const ch = a
    .listChannels()
    .find((c) => c.getTargetNode()?.getName() === joint && c.getTargetPath() === 'rotation');
  const s = ch?.getSampler();
  const inp = s?.getInput();
  const out = s?.getOutput();
  if (!inp || !out) return null;
  const n = inp.getCount();
  let k = 0;
  while (k < n - 1 && inp.getScalar(k + 1) < t) k++;
  const t0 = inp.getScalar(k);
  const t1 = inp.getScalar(Math.min(n - 1, k + 1));
  const u = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 0;
  const a0 = out.getElement(k, []);
  const a1 = out.getElement(Math.min(n - 1, k + 1), []);
  const sign = a0[0] * a1[0] + a0[1] * a1[1] + a0[2] * a1[2] + a0[3] * a1[3] < 0 ? -1 : 1;
  const q = a0.map((v, i) => v * (1 - u) + a1[i] * sign * u);
  const l = Math.hypot(...q);
  return q.map((v) => v / l);
}

function angle(a: number[], b: number[]): number {
  const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return 2 * Math.acos(Math.min(1, d));
}

function length(a: Animation): number {
  return Math.max(...a.listSamplers().map((s) => s.getInput()?.getMax([])[0] ?? 0));
}

describe("Korgath's two-hand blows", () => {
  it('ride a clip donor on his look, the body file untouched', () => {
    expect(SANCTUM_BOSS_LOOKS.sanctum_korgath.url).toBe(KORGATH_BODY.url);
    expect(SANCTUM_BOSS_LOOKS.sanctum_korgath.animUrls).toEqual([KORGATH_CLIP_FIXES_URL]);
    const root = donor.getRoot();
    expect(root.listMeshes()).toHaveLength(0);
    expect(root.listTextures()).toHaveLength(0);
    expect(
      root
        .listAnimations()
        .map((a) => a.getName())
        .sort(),
    ).toEqual([...CLIPS].sort());
    const names = new Set(
      body
        .getRoot()
        .listNodes()
        .map((n) => n.getName()),
    );
    for (const a of root.listAnimations())
      for (const ch of a.listChannels())
        expect(names.has(ch.getTargetNode()?.getName() ?? '')).toBe(true);
  });

  it('keep every bone but the left arm, and both ends, as the body clip', () => {
    for (const name of CLIPS) {
      const own = clip(body, name);
      const fix = clip(donor, name);
      expect(length(fix)).toBeCloseTo(length(own), 2);
      const T = length(own);
      const joints = own
        .listChannels()
        .filter((c) => c.getTargetPath() === 'rotation')
        .map((c) => c.getTargetNode()?.getName() ?? '');
      let leftMoved = 0;
      for (const j of joints) {
        for (let k = 0; k <= 24; k++) {
          const t = (T * k) / 24;
          const a = rotationAt(own, j, t);
          const b = rotationAt(fix, j, t);
          if (!a || !b) continue;
          const d = angle(a, b);
          if (LEFT_ARM.has(j)) {
            if (k === 0 || k === 24) expect(d, `${name} ${j} end`).toBeLessThan(0.02);
            leftMoved = Math.max(leftMoved, d);
          } else expect(d, `${name} ${j} at ${t.toFixed(2)}`).toBeLessThan(0.03);
        }
      }
      // The left arm was re-solved: it moves well away from the old pose.
      expect(leftMoved, name).toBeGreaterThan(0.3);
    }
  });
});
