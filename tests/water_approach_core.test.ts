// The "water is near the player" probe the underwater compile gate arms on
// (src/render/water_approach_core.ts). Pins: which water it sees, at what
// read cost per call, that standing still reads nothing, and that the radius
// buys the fastest ground mover a real lead before it can reach the water.
import { describe, expect, it } from 'vitest';
import {
  createWaterApproachProbe,
  WATER_APPROACH_DISC_POINTS,
  WATER_APPROACH_PITCH,
  WATER_APPROACH_RADIUS,
  WATER_APPROACH_READS_PER_CALL,
  type WaterLevelAt,
} from '../src/render/water_approach_core';
import { MOUNTS } from '../src/sim/content/mounts';
import { RUN_SPEED } from '../src/sim/types';
import { waterBodies } from '../src/sim/world';

const SEED = 7;

function pond(cx: number, cz: number, radius: number): WaterLevelAt {
  return (x, z) => ((x - cx) ** 2 + (z - cz) ** 2 < radius * radius ? 0 : Number.NEGATIVE_INFINITY);
}

/** Calls at one spot until the probe latches or has read one full cycle. */
function settleAt(levelAt: WaterLevelAt, x: number, z: number) {
  const probe = createWaterApproachProbe(levelAt);
  let near = false;
  for (let i = 0; i < WATER_APPROACH_DISC_POINTS && !near; i++) near = probe.near(x, z, SEED);
  return { probe, near };
}

describe('water approach probe', () => {
  it('sees water that holds a pitch / sqrt(2) disc anywhere inside its radius', () => {
    const r = WATER_APPROACH_PITCH / Math.SQRT2 + 0.01;
    const reach = WATER_APPROACH_RADIUS - WATER_APPROACH_PITCH / Math.SQRT2 - r;
    let checked = 0;
    for (let px = 0; px < WATER_APPROACH_PITCH; px += 2.3) {
      for (let a = 0; a < Math.PI * 2; a += 0.37) {
        for (const d of [0, reach * 0.5, reach]) {
          const levelAt = pond(px + Math.cos(a) * d, 1.1 + Math.sin(a) * d, r);
          expect(settleAt(levelAt, px, 1.1).near).toBe(true);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('does not see water beyond its radius', () => {
    const far = WATER_APPROACH_RADIUS + WATER_APPROACH_PITCH * 2;
    const { near, probe } = settleAt(pond(far, 0, 4), 0, 0);
    expect(near).toBe(false);
    expect(probe.reads).toBe(WATER_APPROACH_DISC_POINTS);
  });

  it('guarantees every authored lake footprint is wide enough to be seen', () => {
    const smallest = Math.min(...waterBodies().map((lake) => lake.radius));
    expect(smallest).toBeGreaterThan(0);
    expect(smallest).toBeGreaterThanOrEqual(WATER_APPROACH_PITCH / Math.SQRT2);
  });

  it('reads at most its per-call budget, and nothing once a cycle ran from a still player', () => {
    const probe = createWaterApproachProbe(() => Number.NEGATIVE_INFINITY);
    let calls = 0;
    let before = 0;
    while (probe.reads < WATER_APPROACH_DISC_POINTS) {
      probe.near(3, 3, SEED);
      calls++;
      expect(probe.reads - before).toBeLessThanOrEqual(WATER_APPROACH_READS_PER_CALL);
      before = probe.reads;
    }
    expect(calls).toBe(Math.ceil(WATER_APPROACH_DISC_POINTS / WATER_APPROACH_READS_PER_CALL));
    for (let i = 0; i < 200; i++) probe.near(3 + (i % 5) * 0.5, 3, SEED);
    expect(probe.reads).toBe(WATER_APPROACH_DISC_POINTS);
  });

  it('reads again once the player reaches a new lattice point, on the world lattice', () => {
    const seen: [number, number][] = [];
    const probe = createWaterApproachProbe((x, z) => {
      seen.push([x, z]);
      return Number.NEGATIVE_INFINITY;
    });
    for (let i = 0; i < WATER_APPROACH_DISC_POINTS; i++) probe.near(3.7, -2.2, SEED);
    expect(probe.reads).toBe(WATER_APPROACH_DISC_POINTS);
    probe.near(WATER_APPROACH_PITCH + 3.7, -2.2, SEED);
    expect(probe.reads).toBe(WATER_APPROACH_DISC_POINTS + WATER_APPROACH_READS_PER_CALL);
    for (const [x, z] of seen) {
      expect(Math.abs(x % WATER_APPROACH_PITCH)).toBe(0);
      expect(Math.abs(z % WATER_APPROACH_PITCH)).toBe(0);
    }
  });

  it('reads every offset of the disc even when the lattice point moves on every call', () => {
    let center = 0;
    const offsets = new Set<string>();
    const probe = createWaterApproachProbe((x, z) => {
      offsets.add(
        `${Math.round(x / WATER_APPROACH_PITCH) - center},${Math.round(z / WATER_APPROACH_PITCH)}`,
      );
      return Number.NEGATIVE_INFINITY;
    });
    const calls = Math.ceil(WATER_APPROACH_DISC_POINTS / WATER_APPROACH_READS_PER_CALL);
    for (let i = 0; i < calls; i++) {
      center = i;
      probe.near(i * WATER_APPROACH_PITCH, 0, SEED);
    }
    expect(offsets.size).toBe(WATER_APPROACH_DISC_POINTS);
  });

  it('latches once it has seen water, with no further reads', () => {
    const probe = createWaterApproachProbe(() => 0);
    expect(probe.near(0, 0, SEED)).toBe(true);
    const reads = probe.reads;
    expect(probe.near(500, 500, SEED)).toBe(true);
    expect(probe.reads).toBe(reads);
  });

  it('leaves the fastest ground mover more lead than the live gate deadline', () => {
    // Worst case: the player sits half a lattice diagonal off its lattice
    // point, the water barely holds the guaranteed disc, and the latch waits
    // one full read cycle at 20 frames per second. The bar is the renderer's
    // per-piece gate deadline (VIEW_COMPILE_GATE_MAX_MS).
    const fastest = RUN_SPEED * (1 + Math.max(...Object.values(MOUNTS).map((m) => m.moveSpeedPct)));
    const seenFrom = WATER_APPROACH_RADIUS - Math.SQRT2 * WATER_APPROACH_PITCH;
    const cycleSeconds = Math.ceil(WATER_APPROACH_DISC_POINTS / WATER_APPROACH_READS_PER_CALL) / 20;
    expect(seenFrom / fastest - cycleSeconds).toBeGreaterThan(1.5);
  });
});
