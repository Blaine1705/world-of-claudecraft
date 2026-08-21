import { describe, expect, it } from 'vitest';
import {
  buildColliderCellIndex,
  colliderBounds,
  colliderCellAt,
  MAX_BODY_RADIUS,
} from '../src/sim/collider_cells';
import {
  allocRiftCollisionToken,
  clearRiftRegion,
  isBlocked,
  lineOfSightClear,
  resolvePosition,
  setRiftRegion,
} from '../src/sim/colliders';
import { RIFT_REGION_HALF_X, RIFT_REGION_HALF_Z, riftInstanceOrigin } from '../src/sim/data';
import { layoutColliders } from '../src/sim/dungeon_layout';
import { generateRiftFloor } from '../src/sim/rift/rift_gen';

// The rift collision arms read a cell subset of the floor's collider list
// instead of scanning it whole. These suites pin the load-bearing claim: the
// subset resolution is EXACTLY the full-list resolution, on real generated
// floors, across the whole region, for every live radius. The reference token
// publishes the same colliders into one enormous cell, which reproduces the
// pre-index full-list scan (same list, same order) through the same public
// API, so any divergence is the index's fault by construction.

const WORLD_SEED = 1;
const HUGE_CELL = 1e9;

// Deterministic jitter without Math.random (the test asserts exact positions,
// so its own inputs must be reproducible run to run).
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface FloorFixture {
  label: string;
  origin: { x: number; z: number };
  indexed: number;
  reference: number;
}

function publishFloor(seed: number, baseLevel: number, floorIndex: number, slot: number) {
  const plan = generateRiftFloor(seed, baseLevel, floorIndex);
  const colliders = layoutColliders(plan.layout);
  expect(colliders.length).toBeGreaterThan(0);
  const origin = riftInstanceOrigin(slot, floorIndex);
  const indexed = allocRiftCollisionToken();
  const reference = allocRiftCollisionToken();
  setRiftRegion(indexed, origin.x, origin.z, colliders);
  setRiftRegion(reference, origin.x, origin.z, colliders, HUGE_CELL);
  return {
    fixture: {
      label: `seed ${seed} level ${baseLevel} floor ${floorIndex}`,
      origin,
      indexed,
      reference,
    } as FloorFixture,
    colliders,
  };
}

function samplePoints(origin: { x: number; z: number }, rand: () => number) {
  const points: Array<{ x: number; z: number }> = [];
  for (let lx = -RIFT_REGION_HALF_X; lx <= RIFT_REGION_HALF_X; lx += 2.3) {
    for (let lz = -RIFT_REGION_HALF_Z; lz <= RIFT_REGION_HALF_Z; lz += 4.1) {
      points.push({
        x: origin.x + lx + (rand() - 0.5) * 1.9,
        z: origin.z + lz + (rand() - 0.5) * 1.9,
      });
    }
  }
  return points;
}

describe('rift collider cell index', () => {
  const floors = [
    publishFloor(20061, 14, 0, 0),
    publishFloor(48271, 35, 2, 1),
    publishFloor(90210, 58, 5, 2),
  ];

  it('registers every collider reachable from a point into that point cell', () => {
    for (const { colliders } of floors) {
      const index = buildColliderCellIndex(colliders);
      const rand = lcg(7);
      for (let i = 0; i < 400; i++) {
        const x = (rand() - 0.5) * 2 * (RIFT_REGION_HALF_X + 4);
        const z = (rand() - 0.5) * 2 * (RIFT_REGION_HALF_Z + 4);
        const cell = colliderCellAt(index, x, z) ?? [];
        for (const c of colliders) {
          const b = colliderBounds(c);
          const withinReach =
            x >= b.minX - MAX_BODY_RADIUS &&
            x <= b.maxX + MAX_BODY_RADIUS &&
            z >= b.minZ - MAX_BODY_RADIUS &&
            z <= b.maxZ + MAX_BODY_RADIUS;
          if (withinReach) expect(cell).toContain(c);
        }
      }
    }
  });

  it('keeps each cell list in the original list order', () => {
    for (const { colliders } of floors) {
      const order = new Map(colliders.map((c, i) => [c, i]));
      const index = buildColliderCellIndex(colliders);
      for (const list of index.cells.values()) {
        for (let i = 1; i < list.length; i++) {
          const prev = order.get(list[i - 1]);
          const next = order.get(list[i]);
          expect(prev).toBeDefined();
          expect(next).toBeDefined();
          expect((prev as number) < (next as number)).toBe(true);
        }
      }
    }
  });

  it('resolves every sampled position identically to the full-list scan', () => {
    for (const { fixture } of floors) {
      const rand = lcg(11);
      const points = samplePoints(fixture.origin, rand);
      for (const p of points) {
        for (const r of [0.05, 0.3, 0.5, MAX_BODY_RADIUS]) {
          const fast = resolvePosition(
            WORLD_SEED,
            p.x,
            p.z,
            r,
            false,
            undefined,
            undefined,
            fixture.indexed,
          );
          const full = resolvePosition(
            WORLD_SEED,
            p.x,
            p.z,
            r,
            false,
            undefined,
            undefined,
            fixture.reference,
          );
          expect(fast.x, `${fixture.label} r=${r} at ${p.x},${p.z}`).toBe(full.x);
          expect(fast.z, `${fixture.label} r=${r} at ${p.x},${p.z}`).toBe(full.z);
        }
      }
    }
  });

  it('answers every sampled sight line identically to the full-list scan', () => {
    for (const { fixture } of floors) {
      const rand = lcg(23);
      let checkedBlocked = 0;
      let checkedClear = 0;
      for (let i = 0; i < 220; i++) {
        const from = {
          x: fixture.origin.x + (rand() - 0.5) * 2 * RIFT_REGION_HALF_X,
          z: fixture.origin.z + (rand() - 0.5) * 2 * RIFT_REGION_HALF_Z,
        };
        const to = {
          x: fixture.origin.x + (rand() - 0.5) * 2 * RIFT_REGION_HALF_X,
          z: from.z + (rand() - 0.5) * 60,
        };
        const fast = lineOfSightClear(WORLD_SEED, from, to, 0.05, undefined, fixture.indexed);
        const full = lineOfSightClear(WORLD_SEED, from, to, 0.05, undefined, fixture.reference);
        expect(fast, `${fixture.label} ${from.x},${from.z} -> ${to.x},${to.z}`).toBe(full);
        if (full) checkedClear++;
        else checkedBlocked++;
      }
      // The sample must exercise BOTH outcomes or the equivalence is vacuous.
      expect(checkedBlocked).toBeGreaterThan(0);
      expect(checkedClear).toBeGreaterThan(0);
    }
  });

  it('detects the region only inside the half-extent box, edges inclusive', () => {
    const { fixture } = publishFloor(31337, 22, 1, 3);
    const { origin, indexed } = fixture;
    // A wall always spans the room edge; probe against the region box instead
    // of collider luck: outside the box the arm must return the input
    // untouched for ANY point, colliders or not.
    const outsideZ = resolvePosition(
      WORLD_SEED,
      origin.x,
      origin.z + RIFT_REGION_HALF_Z + 0.2,
      0.5,
      false,
      undefined,
      undefined,
      indexed,
    );
    expect(outsideZ).toEqual({ x: origin.x, z: origin.z + RIFT_REGION_HALF_Z + 0.2 });
    const outsideX = resolvePosition(
      WORLD_SEED,
      origin.x + RIFT_REGION_HALF_X + 10,
      origin.z,
      0.5,
      false,
      undefined,
      undefined,
      indexed,
    );
    expect(outsideX).toEqual({ x: origin.x + RIFT_REGION_HALF_X + 10, z: origin.z });
  });

  it('clears a region so its colliders stop resolving', () => {
    const { fixture, colliders } = publishFloor(555, 18, 0, 4);
    // Find a point a collider actually pushes on, then clear and re-probe.
    const rand = lcg(31);
    let probe: { x: number; z: number } | null = null;
    for (let i = 0; i < 4000 && !probe; i++) {
      const c = colliders[Math.floor(rand() * colliders.length)];
      const b = colliderBounds(c);
      const p = {
        x: fixture.origin.x + (b.minX + b.maxX) / 2,
        z: fixture.origin.z + (b.minZ + b.maxZ) / 2,
      };
      if (isBlocked(WORLD_SEED, p.x, p.z, 0.5, false, undefined, fixture.indexed)) probe = p;
    }
    expect(probe).not.toBeNull();
    const p = probe as { x: number; z: number };
    clearRiftRegion(fixture.indexed, fixture.origin.x, fixture.origin.z);
    expect(isBlocked(WORLD_SEED, p.x, p.z, 0.5, false, undefined, fixture.indexed)).toBe(false);
  });
});
