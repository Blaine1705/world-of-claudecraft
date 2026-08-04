// The beach-band gate: a shoreline is painted only where water is actually
// there. The repro that motivated it is the last block: the Eastbrook ->
// Mirefen road pass floors out about a yard above the waterline with no water
// for a hundred yards, and the old height-only band stamped a pale sand-green
// patch across the whole gorge.
import { describe, expect, it } from 'vitest';
import {
  SHORE_BAND_HEIGHT,
  SHORE_GATE_FEATHER,
  SHORE_PROBE_RADII,
  SHORE_PROBE_RAYS,
  shoreWaterGate,
} from '../src/render/shore_water_gate_core';
import { terrainHeight, WATER_LEVEL } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

const WL = -4.3;

describe('shoreWaterGate', () => {
  it('opens fully when any probed ground lies under the waterline', () => {
    // a flat plain at the top of the band, with water due east
    const sample = (x: number, _z: number) => (x > 5 ? WL - 2 : WL + 1);
    expect(shoreWaterGate(0, 0, WL, sample)).toBe(1);
  });

  it('closes on dry ground whose whole neighbourhood clears the waterline', () => {
    // the defect shape: a basin floor inside the band, nothing under the line
    const sample = () => WL + 0.95;
    expect(shoreWaterGate(0, 0, WL, sample)).toBeLessThan(0.02);
  });

  it('feathers rather than cutting a hard edge as the neighbourhood lifts', () => {
    const at = (floor: number) => shoreWaterGate(0, 0, WL, () => WL + floor);
    expect(at(0)).toBe(1);
    const half = at(SHORE_GATE_FEATHER / 2);
    expect(half).toBeGreaterThan(0.4);
    expect(half).toBeLessThan(0.6);
    expect(at(SHORE_GATE_FEATHER)).toBe(0);
    // monotone: no fold-back anywhere across the feather
    let prev = 1.01;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const g = at(SHORE_GATE_FEATHER * t);
      expect(g).toBeLessThanOrEqual(prev);
      prev = g;
    }
  });

  it('finds water only inside the outer probe radius', () => {
    const outer = Math.max(...SHORE_PROBE_RADII);
    // water beyond the reach: a ring at radius outer + 4 is invisible to it
    const beyond = (x: number, z: number) => (Math.hypot(x, z) > outer + 2 ? WL - 3 : WL + 1);
    expect(shoreWaterGate(0, 0, WL, beyond)).toBe(0);
    const within = (x: number, z: number) => (Math.hypot(x, z) > outer - 2 ? WL - 3 : WL + 1);
    expect(shoreWaterGate(0, 0, WL, within)).toBe(1);
  });

  it('probes a ring, not a single ray: water on any bearing counts', () => {
    const inner = SHORE_PROBE_RADII[0];
    for (const bearing of [0, Math.PI / 2, Math.PI, -Math.PI / 2, Math.PI / 4]) {
      const wx = Math.cos(bearing) * inner;
      const wz = Math.sin(bearing) * inner;
      const sample = (x: number, z: number) => (Math.hypot(x - wx, z - wz) < 3 ? WL - 1 : WL + 1);
      expect(shoreWaterGate(0, 0, WL, sample)).toBe(1);
    }
  });

  it('stops probing as soon as it has its answer', () => {
    let calls = 0;
    const sample = () => {
      calls++;
      return WL - 1; // the first ray settles it
    };
    expect(shoreWaterGate(0, 0, WL, sample)).toBe(1);
    expect(calls).toBe(1);
    calls = 0;
    shoreWaterGate(0, 0, WL, () => {
      calls++;
      return WL + 5; // nothing under the line: the whole ring set gets walked
    });
    expect(calls).toBe(SHORE_PROBE_RAYS * SHORE_PROBE_RADII.length);
  });

  it('is a pure function of its inputs', () => {
    const sample = (x: number, z: number) => WL + 0.4 + Math.sin(x * 0.3) * Math.cos(z * 0.3);
    const a = shoreWaterGate(12, -7, WL, sample);
    const b = shoreWaterGate(12, -7, WL, sample);
    expect(a).toBe(b);
  });

  it('reads the shipped waterline band as a beach only where water is', () => {
    const sample = (x: number, z: number) => terrainHeight(x, z, WORLD_SEED);
    const inBand = (x: number, z: number) => {
      const h = terrainHeight(x, z, WORLD_SEED);
      return h >= WATER_LEVEL && h <= WATER_LEVEL + SHORE_BAND_HEIGHT;
    };
    // The Eastbrook -> Mirefen pass: inside the band the whole way, dry.
    for (const z of [140, 150, 160, 170, 180, 190]) {
      expect(inBand(0, z), `pass floor at z=${z} should sit in the beach band`).toBe(true);
      expect(shoreWaterGate(0, z, WATER_LEVEL, sample)).toBeLessThan(0.05);
    }
    // Real Mirefen lake shores keep every bit of their beach.
    for (const [lx, lz] of [
      [60, 380],
      [-105, 300],
      [-40, 450],
    ] as const) {
      let found = false;
      for (let r = 0; r < 60 && !found; r += 1) {
        if (!inBand(lx + r, lz)) continue;
        found = true;
        expect(shoreWaterGate(lx + r, lz, WATER_LEVEL, sample)).toBe(1);
      }
      expect(found, `no beach band found east of the lake at (${lx}, ${lz})`).toBe(true);
    }
  });
});
