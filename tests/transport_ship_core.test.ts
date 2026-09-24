import { describe, expect, it } from 'vitest';
import {
  type ShipLocalBox,
  segmentHitsShipBox,
  TRANSPORT_SHIP_ANIMATE_RANGE,
  TRANSPORT_SHIP_FOG_MARGIN,
  TRANSPORT_SHIP_LOD_DISTANCES,
  TRANSPORT_SHIP_LOD_HYSTERESIS,
  TRANSPORT_SHIP_LOW_TIER_SCALE,
  toShipLocal,
  transportShipAnimates,
  transportShipLod,
  transportShipVisible,
} from '../src/render/transport_ship_core';

// The pure decisions behind the moored transport ship view
// (src/render/transport_ship_core.ts): level of detail with hysteresis, the
// idle clip's gate, fog culling, the ship frame, and the segment test that
// fades a sail standing between the eye and the chase camera.

const [E0, E1, E2] = TRANSPORT_SHIP_LOD_DISTANCES;

describe('transportShipLod', () => {
  it('walks outward through the four levels at the edges', () => {
    expect(transportShipLod(0, -1)).toBe(0);
    expect(transportShipLod(E0 - 0.01, -1)).toBe(0);
    expect(transportShipLod(E0, -1)).toBe(1);
    expect(transportShipLod(E1, -1)).toBe(2);
    expect(transportShipLod(E2, -1)).toBe(3);
    expect(transportShipLod(5000, -1)).toBe(3);
    // moving outward switches at the edge whatever was drawn before
    expect(transportShipLod(E0 + 0.01, 0)).toBe(1);
  });

  it('only returns to a finer level once clear of the edge by the hysteresis margin', () => {
    const inside = E0 * (1 - TRANSPORT_SHIP_LOD_HYSTERESIS);
    expect(transportShipLod(E0 - 0.5, 1)).toBe(1);
    expect(transportShipLod(inside + 0.01, 1)).toBe(1);
    expect(transportShipLod(inside - 0.01, 1)).toBe(0);
    // a jump from far away straight to close skips the intermediate levels
    expect(transportShipLod(5, 3)).toBe(0);
  });

  it('hands over sooner on the low tier', () => {
    const low = E0 * TRANSPORT_SHIP_LOW_TIER_SCALE;
    expect(transportShipLod(low - 0.01, -1, true)).toBe(0);
    expect(transportShipLod(low + 0.01, -1, true)).toBe(1);
    expect(transportShipLod(low + 0.01, -1, false)).toBe(0);
  });
});

describe('transportShipAnimates / transportShipVisible', () => {
  it('animates only the full model, in range, without reduced motion', () => {
    expect(transportShipAnimates(0, 10, false)).toBe(true);
    expect(transportShipAnimates(0, 10, true)).toBe(false);
    expect(transportShipAnimates(1, 10, false)).toBe(false);
    expect(transportShipAnimates(0, TRANSPORT_SHIP_ANIMATE_RANGE, false)).toBe(false);
  });

  it('culls past the fog plus its margin', () => {
    expect(transportShipVisible(100, 100)).toBe(true);
    expect(transportShipVisible(100 + TRANSPORT_SHIP_FOG_MARGIN, 100)).toBe(false);
  });
});

describe('toShipLocal', () => {
  it('undoes the placement: position, height, then yaw', () => {
    const out = { x: 0, y: 0, z: 0 };
    toShipLocal(-125, 2, -54.8, -125, -4.3, -54.8, 0, out);
    expect(out).toEqual({ x: 0, y: 6.3, z: 0 });
    // a ship turned a quarter: its bow (+z) points at world +x
    toShipLocal(-115, -4.3, -54.8, -125, -4.3, -54.8, Math.PI / 2, out);
    expect(out.x).toBeCloseTo(0, 9);
    expect(out.z).toBeCloseTo(10, 9);
    // and its port side (+x) at world -z
    toShipLocal(-125, -4.3, -57.8, -125, -4.3, -54.8, Math.PI / 2, out);
    expect(out.x).toBeCloseTo(3, 9);
    expect(out.z).toBeCloseTo(0, 9);
  });
});

describe('segmentHitsShipBox', () => {
  const sail: ShipLocalBox = { minX: -6, minY: 8, minZ: 2, maxX: 6, maxY: 15, maxZ: 5 };

  it('hits a segment that passes through the box', () => {
    expect(segmentHitsShipBox(0, 10, 0, 0, 10, 10, sail)).toBe(true);
    expect(segmentHitsShipBox(-10, 12, 3, 10, 12, 3, sail)).toBe(true);
  });

  it('misses a segment that stops short, passes below, or runs beside it', () => {
    expect(segmentHitsShipBox(0, 10, 0, 0, 10, 1.9, sail)).toBe(false);
    expect(segmentHitsShipBox(0, 5, 0, 0, 7, 10, sail)).toBe(false);
    expect(segmentHitsShipBox(7, 10, 0, 7, 10, 10, sail)).toBe(false);
  });

  it('counts an endpoint inside the box, and handles axis-parallel segments', () => {
    expect(segmentHitsShipBox(0, 10, 3, 0, 20, 30, sail)).toBe(true);
    expect(segmentHitsShipBox(0, 9, 3, 0, 9, 3, sail)).toBe(true);
    expect(segmentHitsShipBox(0, 20, 3, 0, 20, 3, sail)).toBe(false);
  });
});
