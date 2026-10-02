// The Stormbrass Foundry's sculpted mountains (the eroded heightfield built by
// docs/design/dungeon-rework/kit/build_stormbrass_foundry_mountains.py, shipped
// by scripts/assets/stormbrass_foundry_mountains/build.mjs, drawn by
// src/render/stormbrass_foundry/foundry_mountains.ts): the shipped GLB is the
// current sources', its textures are KTX2, the valley floor lies under the
// shelf's drop and never makes a ledge, and the ranges stand high and ragged
// round it (never a ring of equal cones).

import { existsSync, readFileSync, statSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { beforeAll, describe, expect, it } from 'vitest';
import { ASSET, sourceFingerprint } from '../scripts/assets/stormbrass_foundry_mountains/build.mjs';
import { planFoundryKitPlacements } from '../src/render/stormbrass_foundry/foundry_kit_plan_core';
import { planFoundryCloudBanks } from '../src/render/stormbrass_foundry/foundry_plan_core';
import {
  STORMBRASS_FOUNDRY_FIELD,
  STORMBRASS_FOUNDRY_VOID_HEIGHT,
} from '../src/sim/content/stormbrass_foundry_layout';

const FILE = ASSET.target;
const have = existsSync(FILE);
const VOID = STORMBRASS_FOUNDRY_VOID_HEIGHT;
const B = STORMBRASS_FOUNDRY_FIELD.bounds;

const points: [number, number, number][] = [];
let extras: Record<string, unknown> = {};
let mimes: string[] = [];

beforeAll(async () => {
  if (!have) return;
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.readBinary(new Uint8Array(readFileSync(FILE)));
  extras = (doc.getRoot().getExtras() ?? {}) as Record<string, unknown>;
  mimes = doc
    .getRoot()
    .listTextures()
    .map((t) => t.getMimeType());
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const a = prim.getAttribute('POSITION');
      if (!a) continue;
      const e: number[] = [];
      for (let i = 0; i < a.getCount(); i++) {
        a.getElement(i, e);
        points.push([
          m[0] * e[0] + m[4] * e[1] + m[8] * e[2] + m[12],
          m[1] * e[0] + m[5] * e[1] + m[9] * e[2] + m[13],
          m[2] * e[0] + m[6] * e[1] + m[10] * e[2] + m[14],
        ]);
      }
    }
  }
});

const outside = (x: number, z: number): number =>
  Math.hypot(Math.max(0, B.minX - x, x - B.maxX), Math.max(0, B.minZ - z, z - B.maxZ));

describe('the Foundry sculpted mountains', () => {
  it.skipIf(!have)('ships the current sources, with KTX2 textures, inside the size budget', () => {
    expect(extras.sourceFingerprint).toBe(sourceFingerprint());
    expect(mimes.length).toBe(2);
    for (const m of mimes) expect(m).toBe('image/ktx2');
    expect(statSync(FILE).size).toBeLessThanOrEqual(6 * 1024 * 1024);
    expect(points.length).toBeGreaterThan(60000);
  });

  it.skipIf(!have)('keeps the valley floor under the drop near the shelf, never a ledge', () => {
    let near = 0;
    for (const [x, y, z] of points) {
      if (outside(x, z) > 44) continue;
      near++;
      // Under the sim void height, and no deeper than the feet of the cliffs.
      expect(y, `${x}, ${z}`).toBeLessThan(VOID - 8);
      expect(y, `${x}, ${z}`).toBeGreaterThan(VOID - 26);
    }
    expect(near).toBeGreaterThan(2000);
    // Nothing of the mountain rises to a walkable floor level within 60 yd.
    for (const [x, y, z] of points) if (outside(x, z) < 60) expect(y).toBeLessThan(0);
  });

  it.skipIf(!have)('stands every pier of the dressing in the valley floor, not in the air', () => {
    const floorAt = (x: number, z: number): number => {
      let best = Infinity;
      let y = 0;
      for (const p of points) {
        const d = Math.abs(p[0] - x) + Math.abs(p[2] - z);
        if (d < best) {
          best = d;
          y = p[1];
        }
      }
      return y;
    };
    const piers = planFoundryKitPlacements().filter((p) => p.piece === 'Kit_Pier');
    expect(piers.length).toBeGreaterThan(15);
    for (const p of piers)
      expect(p.y as number, `pier at ${p.x}, ${p.z}`).toBeLessThan(floorAt(p.x, p.z) + 1);
  });

  it.skipIf(!have)('raises ragged ranges round the shelf: no ring of equal cones', () => {
    // The skyline by bearing: the highest elevation angle seen from the middle of the shelf.
    const sectors = 24;
    const sky = new Array<number>(sectors).fill(0);
    let top = 0;
    for (const [x, y, z] of points) {
      top = Math.max(top, y);
      const r = Math.hypot(x, z);
      if (r < 200) continue;
      const s = Math.floor(((Math.atan2(x, z) + Math.PI) / (Math.PI * 2)) * sectors) % sectors;
      sky[s] = Math.max(sky[s], Math.atan2(y - 10, r));
    }
    const max = Math.max(...sky);
    const min = Math.min(...sky);
    // Real peaks somewhere, an open valley somewhere else.
    expect(max).toBeGreaterThan(0.38);
    expect(min).toBeLessThan(max * 0.5);
    // And no long run of sectors at one height (a row of cones).
    const mean = sky.reduce((a, b) => a + b, 0) / sectors;
    const spread = Math.sqrt(sky.reduce((a, b) => a + (b - mean) ** 2, 0) / sectors);
    expect(spread / mean).toBeGreaterThan(0.2);
    expect(top).toBeGreaterThan(350);
  });

  it('hangs the cloud banks among the peaks, off the shelf, far to near', () => {
    for (const density of [0, 1]) {
      const banks = planFoundryCloudBanks(density);
      expect(banks.length).toBeGreaterThanOrEqual(12);
      // Never over the walkable shelf at walking height.
      for (const b of banks) expect(outside(b.x, b.z) + Math.max(0, b.y - 120)).toBeGreaterThan(60);
      for (let i = 1; i < banks.length; i++)
        expect(Math.hypot(banks[i].x, banks[i].z)).toBeLessThanOrEqual(
          Math.hypot(banks[i - 1].x, banks[i - 1].z) + 1e-9,
        );
    }
    expect(planFoundryCloudBanks(1).length).toBeGreaterThan(planFoundryCloudBanks(0).length);
  });
});
