// The prop band fog cull and its first-reveal policy (prop_cull_core.ts): the
// props twin of town_reveal_core. A band's first fog reveal on a walking
// approach consults the gate and holds while cold; a band already near the
// camera (login, hearth, teleport) reveals at once; a revealed band never
// consults again; no gate keeps the historical immediate cull.

import { describe, expect, it } from 'vitest';
import { PROP_FAR_SWAP_DISTANCE, propCellKey } from '../src/render/prop_cell_core';
import {
  PROP_CULL_REVEAL_NEAR_FRACTION,
  PROP_CULL_REVEAL_REACH,
  type PropCullBounds,
  propCullBoxDistanceSq,
  propCullInFog,
  propCullKey,
  propCullReveal,
  propRevealRoots,
  updatePropCullable,
} from '../src/render/prop_cull_core';
import { createRevealGateCore } from '../src/render/reveal_gate_core';

const box = (minX: number, maxX: number, minZ: number, maxZ: number): PropCullBounds => ({
  hasBox: true,
  minX,
  maxX,
  minZ,
  maxZ,
  cx: (minX + maxX) / 2,
  cz: (minZ + maxZ) / 2,
  r: Math.hypot(maxX - minX, maxZ - minZ) / 2,
});

const sphere = (cx: number, cz: number, r: number): PropCullBounds => ({
  hasBox: false,
  minX: cx - r,
  maxX: cx + r,
  minZ: cz - r,
  maxZ: cz + r,
  cx,
  cz,
  r,
});

function cullable(bounds: PropCullBounds, key = 'cull:0') {
  return { ...bounds, key, revealed: false, held: false, obj: { visible: true } };
}

/** The historical props.ts cull, composed the way updatePropCullable does. */
function inFog(c: PropCullBounds, camX: number, camZ: number, fogFar: number): boolean {
  return propCullInFog(
    c,
    propCullBoxDistanceSq(c, camX, camZ),
    camX,
    camZ,
    fogFar,
    fogFar * fogFar,
  );
}

describe('prop cull fog test', () => {
  it('culls a boxed band by its box distance and a sphere band by its reach', () => {
    const band = box(100, 300, -50, 50);
    // Box distance 20 < fogFar 100.
    expect(inFog(band, 80, 0, 100)).toBe(true);
    // Box distance 100 is NOT < 100 (the exact fog boundary is excluded).
    expect(inFog(band, 0, 0, 100)).toBe(false);
    // Inside the box: distance 0.
    expect(propCullBoxDistanceSq(band, 200, 0)).toBe(0);
    // A sphere band past its box distance still draws while its centre is
    // within fogFar + r (the historical fallback).
    const orb = sphere(0, 0, 10);
    expect(inFog(orb, 105, 0, 100)).toBe(true);
    expect(inFog(orb, 111, 0, 100)).toBe(false);
  });
});

describe('prop cull gate keys and roots', () => {
  it('mints dense band keys that never collide with the far-cell grid keys', () => {
    expect([0, 1, 7].map(propCullKey)).toEqual(['cull:0', 'cull:1', 'cull:7']);
    // Both namespaces share ONE props gate: a far-cell key must never look
    // like a band key, whatever the cell coordinates.
    for (const [x, z] of [
      [0, 0],
      [-1, -1],
      [119, 119],
      [120, -120],
      [-100000, 100000],
    ]) {
      expect(propCellKey(x, z)).not.toMatch(/^cull:/);
    }
  });

  it('resolves a far cell to its bake meshes, a band to its one object, a stranger to nothing', () => {
    const bakeA = { name: 'bake-a' };
    const bakeB = { name: 'bake-b' };
    const band = { name: 'band' };
    const farCells = new Map([['0:1', { meshes: [bakeA, bakeB] }]]);
    const bands = new Map([['cull:3', { obj: band }]]);
    expect(propRevealRoots(farCells, bands, '0:1')).toEqual([bakeA, bakeB]);
    expect(propRevealRoots(farCells, bands, 'cull:3')).toEqual([band]);
    expect(propRevealRoots(farCells, bands, 'cull:4')).toEqual([]);
    expect(propRevealRoots(farCells, bands, '9:9')).toEqual([]);
  });
});

describe('prop cull first-reveal policy', () => {
  it('hides a fogged band and never consults the gate for it', () => {
    let consulted = 0;
    const gate = { allow: () => (consulted++, true) };
    const state = { key: 'cull:1', revealed: false, held: false };
    expect(propCullReveal(false, 500 * 500, 100, state, gate)).toBe('hidden');
    expect(consulted).toBe(0);
  });

  it('holds a cold far band, reveals it once the gate warms, then never consults again', () => {
    const requested: string[] = [];
    const gate = createRevealGateCore((key) => requested.push(key));
    const c = cullable(box(150, 350, -50, 50), 'cull:7');
    // Camera 100 from the box, fogFar 120: inside the fog, beyond the near
    // fraction (60), so the first reveal rides the gate.
    updatePropCullable(c, 50, 0, 120, 120 * 120, gate);
    expect(requested).toEqual(['cull:7']);
    expect(c.obj.visible).toBe(false);
    expect(c.revealed).toBe(false);
    expect(c.held).toBe(true);
    updatePropCullable(c, 50, 0, 120, 120 * 120, gate);
    expect(requested).toEqual(['cull:7']);
    expect(c.obj.visible).toBe(false);
    gate.settle('cull:7');
    updatePropCullable(c, 50, 0, 120, 120 * 120, gate);
    expect(c.obj.visible).toBe(true);
    expect(c.revealed).toBe(true);
    // Fog re-entry after the latch: a plain cull flip, no consult.
    const cold = createRevealGateCore((key) => requested.push(`again:${key}`));
    updatePropCullable(c, -100, 0, 120, 120 * 120, cold);
    expect(c.obj.visible).toBe(false);
    updatePropCullable(c, 50, 0, 120, 120 * 120, cold);
    expect(c.obj.visible).toBe(true);
    expect(requested).toEqual(['cull:7']);
  });

  it('reveals a band already near the camera immediately, gate or not', () => {
    const requested: string[] = [];
    const gate = createRevealGateCore((key) => requested.push(key));
    const near = fogFarNearEdge(120);
    // Box distance exactly at the near fraction reveals without a consult.
    const c = cullable(box(near, near + 100, -50, 50), 'cull:2');
    updatePropCullable(c, 0, 0, 120, 120 * 120, gate);
    expect(requested).toEqual([]);
    expect(c.obj.visible).toBe(true);
    expect(c.revealed).toBe(true);
    // One unit further out consults.
    const far = cullable(box(near + 1, near + 100, -50, 50), 'cull:3');
    updatePropCullable(far, 0, 0, 120, 120 * 120, gate);
    expect(requested).toEqual(['cull:3']);
    expect(far.obj.visible).toBe(false);
  });

  it('keeps holding a held band that crosses the near line while its compile is in flight', () => {
    // After a cover arrival the fog opens over seconds: a band held at the
    // fog edge (dist 100, fogFar 120) is inside the near line once fogFar
    // reaches 300 (near 150). It must stay held until the settle, or it
    // links cold anyway (the raced-pending-link rows after an arrival).
    const requested: string[] = [];
    const gate = createRevealGateCore((key) => requested.push(key));
    const c = cullable(box(150, 350, -50, 50), 'cull:9');
    updatePropCullable(c, 50, 0, 120, 120 * 120, gate);
    expect(c.held).toBe(true);
    expect(c.obj.visible).toBe(false);
    updatePropCullable(c, 50, 0, 300, 300 * 300, gate);
    expect(c.obj.visible).toBe(false);
    expect(c.revealed).toBe(false);
    gate.settle('cull:9');
    updatePropCullable(c, 50, 0, 300, 300 * 300, gate);
    expect(c.obj.visible).toBe(true);
    expect(requested).toEqual(['cull:9']);
  });

  it('reveals a band inside the reach floor on every consult, held or not', () => {
    // A held band whose compile is still in flight when the player walks up
    // to it: the colliders it carries must not stay invisible at arm's length,
    // whatever the gate does.
    const requested: string[] = [];
    const gate = createRevealGateCore((key) => requested.push(key));
    const c = cullable(box(150, 350, -50, 50), 'cull:5');
    updatePropCullable(c, 50, 0, 120, 120 * 120, gate);
    expect(c.held).toBe(true);
    expect(c.obj.visible).toBe(false);
    // Box distance 41: still held.
    updatePropCullable(c, 109, 0, 120, 120 * 120, gate);
    expect(c.obj.visible).toBe(false);
    // Box distance 40: the reach floor reveals, no settle needed.
    updatePropCullable(c, 110, 0, 120, 120 * 120, gate);
    expect(c.obj.visible).toBe(true);
    expect(c.revealed).toBe(true);
    expect(requested).toEqual(['cull:5']);
    // The floor also covers a first consult under a tightly clamped fog,
    // where half the fog would be a few yards: band at 30 under fogFar 45.
    const clamped = cullable(box(30, 130, -50, 50), 'cull:6');
    updatePropCullable(clamped, 0, 0, 45, 45 * 45, gate);
    expect(clamped.obj.visible).toBe(true);
    expect(requested).toEqual(['cull:5']);
  });

  it('keeps the historical immediate cull without a gate', () => {
    const c = cullable(box(150, 350, -50, 50), 'cull:4');
    updatePropCullable(c, 50, 0, 120, 120 * 120, null);
    expect(c.obj.visible).toBe(true);
    expect(c.revealed).toBe(true);
    updatePropCullable(c, 50, 0, 120, 120 * 120, undefined);
    expect(c.obj.visible).toBe(true);
    updatePropCullable(c, -100, 0, 120, 120 * 120, null);
    expect(c.obj.visible).toBe(false);
  });

  it('pins the near fraction to half the fog range and the reach floor to the far-cell swap', () => {
    // A walking approach meets a band at the fog plane; a cover arrival lands
    // among bands the player can reach before any compile settles. Half the
    // fog range keeps the reachable ones ungated (prop_cull_core.ts), and the
    // absolute floor is one camera boom plus the largest footprint, the same
    // distance the far cells swap to individuals at.
    expect(PROP_CULL_REVEAL_NEAR_FRACTION).toBe(0.5);
    expect(PROP_CULL_REVEAL_REACH).toBe(40);
    expect(PROP_CULL_REVEAL_REACH).toBe(PROP_FAR_SWAP_DISTANCE);
  });
});

function fogFarNearEdge(fogFar: number): number {
  return fogFar * PROP_CULL_REVEAL_NEAR_FRACTION;
}
