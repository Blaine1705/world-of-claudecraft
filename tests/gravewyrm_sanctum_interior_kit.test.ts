// The Gravewyrm Sanctum's interior AAA pass (the owner's 2026-10-20 walk:
// the paths and the boss rooms wanted an AAA pass): the second Blender kit
// (scripts/assets/gravewyrm_sanctum_interior/build.mjs, built from
// docs/design/dungeon-rework/kit/build_gravewyrm_sanctum_interior.py), its
// placement plan (src/render/gravewyrm_sanctum/sanctum_interior_plan_core.ts)
// and Korgath's chained clips (docs/design/dungeon-rework/korgath/).
//
// - the shipped GLB is the current sources' (fingerprint, nodes, materials),
//   inside the pass's budget, every piece with a sane triangle count;
// - pure dressing: nothing it draws stands in a body's way over walkable
//   floor (the pedestal and the lips stay under the floor they hang from, the
//   curb is knee low), the pedestal clears the Chain Bridge's deck, and the
//   carved pillars stay inside their collider's skin;
// - Korgath kneels at his seal before the pull (BoundKneel) and rises with
//   his maul into his fighting clips (BoundRise ends exactly on Idle).

import { existsSync, readFileSync, statSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ASSET,
  GRAVEWYRM_SANCTUM_INTERIOR_PIECES,
  sourceFingerprint,
} from '../scripts/assets/gravewyrm_sanctum_interior/build.mjs';
import { SANCTUM_BOSS_LOOKS } from '../src/render/characters/sanctum_boss_looks';
import { PILLAR_SCALE } from '../src/render/gravewyrm_sanctum/sanctum_chains_core';
import { planSanctumInteriorPlacements } from '../src/render/gravewyrm_sanctum/sanctum_interior_plan_core';
import { sanctumPlacementMatrix } from '../src/render/gravewyrm_sanctum/sanctum_kit';
import {
  KORGATH_BODY,
  KORGATH_BOUND_CLIPS_URL,
  KORGATH_BOUND_STANCE,
  KORGATH_STANDING_STANCE,
  korgathStance,
} from '../src/render/gravewyrm_sanctum_bosses/boss_model_core';
import {
  CHAIN_BRIDGE,
  GRAVEWYRM_SANCTUM_FIELD,
  LOCK_TERRACE,
  SEAL_PILLARS,
} from '../src/sim/content/gravewyrm_sanctum_layout';
import { authoredFieldHeight } from '../src/sim/instances/authored_field';
import { MAX_STEP_HEIGHT } from '../src/sim/physics/character';

const KIT = ASSET.target;
const FIELD = GRAVEWYRM_SANCTUM_FIELD;
const VOID = FIELD.voidHeight;
/** Under this over the floor a body steps over it (the walls test's band). */
const BAND_LOW = Math.max(MAX_STEP_HEIGHT, FIELD.cliffStep) + 0.05;

interface Shape {
  points: number[];
  triangles: number;
  materials: Set<string>;
  min: [number, number, number];
  max: [number, number, number];
}

const shapes = new Map<string, Shape>();
let extras: Record<string, unknown> = {};
let nodeNames: string[] = [];
let materialNames: string[] = [];

async function io(): Promise<NodeIO> {
  await MeshoptDecoder.ready;
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
}

beforeAll(async () => {
  const doc = await (await io()).readBinary(new Uint8Array(readFileSync(KIT)));
  const root = doc.getRoot();
  extras = (root.getExtras() ?? {}) as Record<string, unknown>;
  nodeNames = root
    .listNodes()
    .map((n) => n.getName())
    .sort();
  materialNames = root
    .listMaterials()
    .map((m) => m.getName())
    .sort();
  for (const node of root.listNodes()) {
    if (!node.getName().startsWith('Kit_')) continue;
    const m = node.getWorldMatrix();
    const s: Shape = {
      points: [],
      triangles: 0,
      materials: new Set(),
      min: [Infinity, Infinity, Infinity],
      max: [-Infinity, -Infinity, -Infinity],
    };
    for (const prim of node.getMesh()?.listPrimitives() ?? []) {
      const a = prim.getAttribute('POSITION');
      if (!a) continue;
      s.materials.add(prim.getMaterial()?.getName() ?? '');
      s.triangles += (prim.getIndices()?.getCount() ?? a.getCount()) / 3;
      const e: number[] = [];
      for (let i = 0; i < a.getCount(); i++) {
        a.getElement(i, e);
        const p = [0, 1, 2].map((k) => m[k] * e[0] + m[4 + k] * e[1] + m[8 + k] * e[2] + m[12 + k]);
        s.points.push(p[0], p[1], p[2]);
        for (let k = 0; k < 3; k++) {
          s.min[k] = Math.min(s.min[k], p[k]);
          s.max[k] = Math.max(s.max[k], p[k]);
        }
      }
    }
    shapes.set(node.getName(), s);
  }
}, 120_000);

describe('the interior kit asset', () => {
  it('is the current sources, every piece, three slot materials at most', () => {
    expect(existsSync(KIT)).toBe(true);
    expect(extras.sourceFingerprint).toBe(sourceFingerprint());
    expect(nodeNames).toEqual(
      [ASSET.root, ...GRAVEWYRM_SANCTUM_INTERIOR_PIECES.map((p) => `Kit_${p}`)].sort(),
    );
    expect(materialNames).toEqual(ASSET.materials);
    for (const m of materialNames) expect(['KitStone', 'KitGlow', 'KitGlass']).toContain(m);
  });

  it('fits the pass budget (the whole interior pass under 2.5 MB) with sane pieces', () => {
    expect(statSync(KIT).size).toBeLessThan(2.5 * 1024 * 1024);
    const budget: [RegExp, number][] = [
      [/^Kit_LockSpur$/, 26_000],
      [/^Kit_LockCurb$/, 7_000],
      [/^Kit_SealPillar(Cracked)?V2_/, 7_000],
      [/^Kit_LipRock/, 2_600],
    ];
    for (const [name, s] of shapes) {
      const cap = budget.find(([re]) => re.test(name))?.[1] ?? 12_000;
      expect(s.triangles, name).toBeGreaterThan(200);
      expect(s.triangles, name).toBeLessThanOrEqual(cap);
    }
  });
});

describe('the interior pieces keep their frames', () => {
  it('the pedestal and the lips never rise to the floor they hang from', () => {
    expect(shapes.get('Kit_LockSpur')?.max[1]).toBeLessThan(-0.05);
    for (const v of ['A', 'B', 'C']) {
      const s = shapes.get(`Kit_LipRock${v}`);
      expect(s?.max[1], v).toBeLessThan(-0.05);
      // Nothing behind the lip, under the walkway's own body (glTF -z).
      expect(s?.min[2], v).toBeGreaterThan(-0.5);
    }
  });

  it('the curb is knee low, round the arena rim, never in its middle', () => {
    const s = shapes.get('Kit_LockCurb');
    if (!s) throw new Error('no curb');
    expect(s.max[1]).toBeLessThan(0.5);
    for (let i = 0; i < s.points.length; i += 3) {
      const r = Math.hypot(s.points[i], s.points[i + 2]);
      expect(r).toBeGreaterThan(LOCK_TERRACE.r - 4);
      expect(r).toBeLessThan(LOCK_TERRACE.r + 0.6);
    }
  });

  it('the carved pillars stand their 15 yd frame inside the collider skin', () => {
    for (const tool of ['Hammer', 'Tongs', 'Anvil', 'Bellows']) {
      for (const name of [`Kit_SealPillarV2_${tool}`, `Kit_SealPillarCrackedV2_${tool}`]) {
        const s = shapes.get(name);
        if (!s) throw new Error(`no ${name}`);
        expect(s.max[1], name).toBeGreaterThan(14);
        expect(s.max[1], name).toBeLessThan(15.6);
        const reach = Math.max(-s.min[0], s.max[0], -s.min[2], s.max[2]) * PILLAR_SCALE;
        // The collider's radius plus a body's width (the walls test's skin).
        expect(reach, name).toBeLessThan(SEAL_PILLARS[0].r + 1.6);
      }
    }
  });
});

describe('the interior plan stands clear of every walk', () => {
  const placed = planSanctumInteriorPlacements();

  function worldPoints(piece: string, k: (typeof placed)[number]): [number, number, number][] {
    const s = shapes.get(piece);
    if (!s) throw new Error(`no ${piece}`);
    const m = sanctumPlacementMatrix(k, new THREE.Matrix4(), (x, z) =>
      authoredFieldHeight(FIELD, x, z),
    ).elements;
    const out: [number, number, number][] = [];
    for (let i = 0; i < s.points.length; i += 3) {
      const x = s.points[i];
      const y = s.points[i + 1];
      const z = s.points[i + 2];
      out.push([
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14],
      ]);
    }
    return out;
  }

  it('places the Lock Terrace pieces and lips along both chain stairs', () => {
    const pieces = placed.map((p) => p.piece);
    expect(pieces).toContain('Kit_LockSpur');
    expect(pieces).toContain('Kit_LockCurb');
    expect(pieces.filter((p) => p.startsWith('Kit_LipRock')).length).toBeGreaterThanOrEqual(4);
    for (const p of placed) expect(shapes.has(p.piece), p.piece).toBe(true);
  });

  it('no piece stands through a body over walkable floor', () => {
    const bad: string[] = [];
    for (const k of placed) {
      for (const [x, y, z] of worldPoints(k.piece, k)) {
        const floor = authoredFieldHeight(FIELD, x, z);
        if (floor <= VOID + 1) continue;
        if (y > floor + BAND_LOW)
          bad.push(
            `${k.piece} at (${x.toFixed(1)}, ${z.toFixed(1)}) ${(y - floor).toFixed(2)} over`,
          );
        if (bad.length > 20) break;
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });

  it('the pedestal clears the Chain Bridge deck by a body', () => {
    const k = placed.find((p) => p.piece === 'Kit_LockSpur');
    if (!k) throw new Error('no spur');
    const span = CHAIN_BRIDGE.toZ - CHAIN_BRIDGE.fromZ;
    for (const [x, y, z] of worldPoints('Kit_LockSpur', k)) {
      if (Math.abs(x - CHAIN_BRIDGE.x) > CHAIN_BRIDGE.halfWidth) continue;
      if (z < CHAIN_BRIDGE.fromZ || z > CHAIN_BRIDGE.toZ) continue;
      const t = (z - CHAIN_BRIDGE.fromZ) / span;
      const deck = CHAIN_BRIDGE.fromH + (CHAIN_BRIDGE.toH - CHAIN_BRIDGE.fromH) * t;
      expect(y, `(${x.toFixed(1)}, ${z.toFixed(1)})`).toBeLessThan(deck - 1.5);
    }
  });
});

describe("Korgath's chained clips", () => {
  it('kneels only while he waits unpulled and alive', () => {
    expect(korgathStance(false, false, false)).toBe('bound');
    expect(korgathStance(true, false, false)).toBe('standing');
    expect(korgathStance(false, true, false)).toBe('standing');
    // Walking home after an evade: never on his knees.
    expect(korgathStance(false, false, true)).toBe('standing');
  });

  it('swaps his whole clip map: BoundKneel bound, BoundRise into his fighting clips', () => {
    const look = SANCTUM_BOSS_LOOKS.sanctum_korgath;
    const bound = look.phaseClips?.[KORGATH_BOUND_STANCE];
    const standing = look.phaseClips?.[KORGATH_STANDING_STANCE];
    expect(bound?.clips.idle).toBe('BoundKneel');
    // A body walking home stands (korgathStance), so its walk stays his walk.
    expect(bound?.clips.walk).toBe('Walk');
    expect(standing?.enter).toBe('BoundRise');
    // The look's own map IS the standing stance (the swap is by identity: a
    // view built mid-fight never replays the rise).
    expect(standing?.clips).toBe(look.clips);
    expect(look.oneShotsHoldAttacks).toContain('BoundRise');
  });

  it('ships BoundKneel and BoundRise in a donor beside his body, the rise ending on Idle', async () => {
    expect(SANCTUM_BOSS_LOOKS.sanctum_korgath.animUrls).toEqual([KORGATH_BOUND_CLIPS_URL]);
    const read = async (url: string) =>
      (await io()).readBinary(new Uint8Array(readFileSync(`public/${url}`)));
    const donor = await read(KORGATH_BOUND_CLIPS_URL);
    const body = await read(KORGATH_BODY.url);
    // A clip donor only: no mesh, skin or texture; every joint named as the body's.
    expect(donor.getRoot().listMeshes()).toHaveLength(0);
    expect(donor.getRoot().listTextures()).toHaveLength(0);
    const bodyNodes = new Set(
      body
        .getRoot()
        .listNodes()
        .map((n) => n.getName()),
    );
    const anims = new Map(
      donor
        .getRoot()
        .listAnimations()
        .map((a) => [a.getName(), a]),
    );
    expect([...anims.keys()].sort()).toEqual(['BoundKneel', 'BoundRise']);
    for (const a of anims.values())
      for (const ch of a.listChannels())
        expect(bodyNodes.has(ch.getTargetNode()?.getName() ?? '')).toBe(true);
    const kneel = anims.get('BoundKneel');
    const rise = anims.get('BoundRise');
    const idle = body
      .getRoot()
      .listAnimations()
      .find((a) => a.getName() === 'Idle');
    if (!kneel || !rise || !idle) throw new Error('missing a clip');
    const length = (a: typeof kneel) =>
      Math.max(...a.listSamplers().map((s) => s.getInput()?.getMax([])[0] ?? 0));
    expect(length(kneel)).toBeCloseTo(6, 1);
    expect(length(rise)).toBeCloseTo(58 / 24, 1);
    // The seam: every joint's rise end equals its Idle start.
    let worst = 0;
    for (const ch of rise.listChannels()) {
      const node = ch.getTargetNode();
      const path = ch.getTargetPath();
      if (path !== 'rotation') continue;
      const ich = idle
        .listChannels()
        .find(
          (c) => c.getTargetNode()?.getName() === node?.getName() && c.getTargetPath() === path,
        );
      if (!ich) continue;
      const ro = ch.getSampler()?.getOutput();
      const io0 = ich.getSampler()?.getOutput();
      if (!ro || !io0) continue;
      const a = ro.getElement(ro.getCount() - 1, []);
      const b = io0.getElement(0, []);
      const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
      worst = Math.max(worst, 1 - Math.min(1, dot));
    }
    expect(worst).toBeLessThan(2e-3);
  });
});
