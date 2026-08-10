import { describe, expect, it } from 'vitest';
import {
  type ShadowAnchor,
  shadowTexelWorldSize,
  snapShadowAnchor,
} from '../src/render/shadow_texel_snap_core';

// The live sun geometry: SUN_ANCHOR (90, 62, 50) direction, the 210 u ortho
// box over the High-tier 4096 map (~5.1 cm texels; see the shadow camera
// setup in renderer.ts).
const DIR = { x: 90, y: 62, z: 50 };
const TEXEL = shadowTexelWorldSize(210, 4096);

function snap(x: number, y: number, z: number, out: ShadowAnchor = { x: 0, y: 0, z: 0 }) {
  return snapShadowAnchor(DIR.x, DIR.y, DIR.z, x, y, z, TEXEL, out);
}

describe('shadowTexelWorldSize', () => {
  it('is the ortho box width over the map resolution, 0 on degenerate input', () => {
    expect(TEXEL).toBeCloseTo(210 / 4096, 12);
    expect(shadowTexelWorldSize(0, 4096)).toBe(0);
    expect(shadowTexelWorldSize(210, 0)).toBe(0);
    expect(shadowTexelWorldSize(-210, 4096)).toBe(0);
  });
});

describe('snapShadowAnchor', () => {
  it('holds the light-space shadow grid origin fixed across sub-texel translations', () => {
    // The shadow map rasterizes on the light-space right/up' grid, so the
    // anti-swimming property is: while the camera translates by less than a
    // texel, the snapped anchor's (u, v) grid coordinates do not move at all
    // (its drift along the light direction is depth-only and cannot shift
    // the rasterization grid).
    const len = Math.hypot(DIR.x, DIR.y, DIR.z);
    const d = { x: DIR.x / len, y: DIR.y / len, z: DIR.z / len };
    const rl = Math.hypot(d.z, d.x);
    const right = { x: d.z / rl, y: 0, z: -d.x / rl };
    const up = {
      x: d.y * right.z,
      y: d.z * right.x - d.x * right.z,
      z: -d.y * right.x,
    };
    const uv = (a: ShadowAnchor) => ({
      u: right.x * a.x + right.z * a.z,
      v: up.x * a.x + up.y * a.y + up.z * a.z,
    });
    const frozen = uv(snap(12.34, 7.5, -8.9));
    for (const eps of [TEXEL * 0.05, TEXEL * 0.2, TEXEL * 0.45]) {
      const moved = uv(snap(12.34 + eps * 0.5, 7.5 + eps * 0.2, -8.9 + eps * 0.3));
      expect(moved.u).toBeCloseTo(frozen.u, 9);
      expect(moved.v).toBeCloseTo(frozen.v, 9);
    }
  });

  it('steps exactly one texel for a full-texel translation along the grid axis', () => {
    // right = normalize((dir.z, 0, -dir.x)) for up = (0, 1, 0).
    const rl = Math.hypot(DIR.z, DIR.x);
    const rightX = DIR.z / rl;
    const rightZ = -DIR.x / rl;
    const a = snap(3.21, 1.5, 4.56);
    const b = snap(3.21 + rightX * TEXEL, 1.5, 4.56 + rightZ * TEXEL);
    const stepX = b.x - a.x;
    const stepZ = b.z - a.z;
    expect(Math.hypot(stepX, stepZ)).toBeCloseTo(TEXEL, 9);
    // The step lands along the right axis itself (a pure one-texel advance).
    expect(stepX).toBeCloseTo(rightX * TEXEL, 9);
    expect(stepZ).toBeCloseTo(rightZ * TEXEL, 9);
    expect(b.y).toBeCloseTo(a.y, 9);
  });

  it('never moves the anchor along the light direction (lighting stays identical)', () => {
    const len = Math.hypot(DIR.x, DIR.y, DIR.z);
    const d = { x: DIR.x / len, y: DIR.y / len, z: DIR.z / len };
    const p = { x: -104.7, y: 22.9, z: 63.2 };
    const s = snap(p.x, p.y, p.z);
    const shift = {
      x: s.x - p.x,
      y: s.y - p.y,
      z: s.z - p.z,
    };
    // The snap displacement lives in the right/up' plane: no component along
    // dir, so light position and target translate together and the direction
    // between them is unchanged.
    expect(shift.x * d.x + shift.y * d.y + shift.z * d.z).toBeCloseTo(0, 9);
    // And it is bounded by one texel diagonal.
    expect(Math.hypot(shift.x, shift.y, shift.z)).toBeLessThan(TEXEL * Math.SQRT2 + 1e-9);
  });

  it('quantizes to the same grid wherever the walk started (grid, not offset)', () => {
    // Two anchors a whole number of texels apart in light space must snap to
    // points a whole number of texels apart: the grid is absolute.
    const rl = Math.hypot(DIR.z, DIR.x);
    const rightX = DIR.z / rl;
    const rightZ = -DIR.x / rl;
    const a = snap(0.013, 0, 0.021);
    const b = snap(0.013 + rightX * TEXEL * 7, 0, 0.021 + rightZ * TEXEL * 7);
    expect(b.x - a.x).toBeCloseTo(rightX * TEXEL * 7, 9);
    expect(b.z - a.z).toBeCloseTo(rightZ * TEXEL * 7, 9);
  });

  it('passes the anchor through untouched on degenerate input', () => {
    const out: ShadowAnchor = { x: 0, y: 0, z: 0 };
    // Zero texel size (snapping disabled).
    snapShadowAnchor(DIR.x, DIR.y, DIR.z, 1.5, 2.5, 3.5, 0, out);
    expect(out).toEqual({ x: 1.5, y: 2.5, z: 3.5 });
    // Zero-length direction.
    snapShadowAnchor(0, 0, 0, 1.5, 2.5, 3.5, TEXEL, out);
    expect(out).toEqual({ x: 1.5, y: 2.5, z: 3.5 });
    // A vertical light has no stable lookAt basis: pass through, not NaN.
    snapShadowAnchor(0, 1, 0, 1.5, 2.5, 3.5, TEXEL, out);
    expect(out).toEqual({ x: 1.5, y: 2.5, z: 3.5 });
  });

  it('fills and returns the caller-owned out object (per-frame path allocates nothing)', () => {
    const out: ShadowAnchor = { x: 0, y: 0, z: 0 };
    const returned = snap(5, 6, 7, out);
    expect(returned).toBe(out);
  });
});
