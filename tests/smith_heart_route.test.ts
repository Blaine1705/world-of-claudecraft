// The Smith's Heart's route contract (docs/design/raid/smith_heart.md): the
// phase 1 blockout is walkable end to end over the REAL collision seam
// (colliders.ts isBlocked over the field's cliffs, props and gates), and the
// gates cut it exactly where the design says:
// - with every gate open, one flood from the Cleft reaches the Gallery's
//   three landings, the Hammer Pit, the Balcony, the whole Ring, every pack
//   spot, the four guardian arenas and the Heart;
// - with every gate shut (a fresh claim), the Gallery is all there is;
// - the Pit Mouth alone opens the Pit but not the Balcony (the Slab holds);
// - the Slab open lets the raid onto the Ring and into all three remaining
//   veins up to their arena mouths, in any order, but never into the Heart;
// - walked floor never steps more than a body's step between neighbours
//   without a collider between them, and every path is at least 12 yd wide.

import { describe, expect, it } from 'vitest';
import { isBlocked } from '../src/sim/colliders';
import {
  RING_PACK_DEGREES,
  SMITH_HEART_GATES,
  SMITH_HEART_SPAWNS,
} from '../src/sim/content/smith_heart';
import {
  BREATH,
  GALLERY_LANDINGS,
  HAMMER_PIT,
  QUENCH,
  ringPoint,
  SMITH_HEART_BOSS_SPOTS,
  SMITH_HEART_FIELD,
} from '../src/sim/content/smith_heart_layout';
import { DUNGEONS, instanceOrigin } from '../src/sim/data';
import { authoredFieldHeight } from '../src/sim/instances/authored_field';
import { setOpenDungeonGates } from '../src/sim/instances/dungeon_gate_state';
import { MAX_STEP_HEIGHT } from '../src/sim/physics/character';

const SEED = 7;
const DUNGEON = DUNGEONS.smith_heart;
const SLOT = 5;
const O = instanceOrigin(DUNGEON.index, SLOT);
const FIELD = SMITH_HEART_FIELD;
const { minX, maxX, minZ, maxZ } = FIELD.bounds;
const W = maxX - minX + 1;
const H = maxZ - minZ + 1;
const ALL_GATES = SMITH_HEART_GATES.map((g) => g.id);

function cell(x: number, z: number): number {
  return (Math.round(z) - minZ) * W + (Math.round(x) - minX);
}

/** Every one-yard cell a body reaches from the arrival with `open` gates. */
function flood(open: readonly string[]): Uint8Array {
  setOpenDungeonGates(O.x, O.z, [...open]);
  const seen = new Uint8Array(W * H);
  const start = DUNGEON.entry;
  const queue: number[] = [Math.round(start.x), Math.round(start.z)];
  seen[cell(start.x, start.z)] = 1;
  for (let q = 0; q < queue.length; q += 2) {
    const x = queue[q];
    const z = queue[q + 1];
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < minX || nx > maxX || nz < minZ || nz > maxZ) continue;
      const i = cell(nx, nz);
      if (seen[i]) continue;
      if (isBlocked(SEED, O.x + nx, O.z + nz, 0.5)) continue;
      seen[i] = 1;
      queue.push(nx, nz);
    }
  }
  return seen;
}

/** Is any cell within 2 yd of (x, z) reached? (A spot may hold a prop.) */
function reaches(seen: Uint8Array, p: { x: number; z: number }): boolean {
  for (let dz = -2; dz <= 2; dz++)
    for (let dx = -2; dx <= 2; dx++) {
      const x = Math.round(p.x) + dx;
      const z = Math.round(p.z) + dz;
      if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
      if (seen[cell(x, z)]) return true;
    }
  return false;
}

const SPOTS = {
  cleft: { x: -100, z: -226 },
  h1: GALLERY_LANDINGS.h1,
  h2: GALLERY_LANDINGS.h2,
  h3: GALLERY_LANDINGS.h3,
  pit: { x: HAMMER_PIT.x + 10, z: HAMMER_PIT.z },
  balconyTip: { x: 0, z: -62 },
  ring: ringPoint(0),
  b1: BREATH.b1,
  b2: BREATH.b2,
  b3: BREATH.b3,
  breathMouth: { x: -36, z: 180 },
  cornice: SMITH_HEART_BOSS_SPOTS.breath,
  q1: QUENCH.q1,
  q2: QUENCH.q2,
  q3: { x: 166, z: -49 },
  lake: SMITH_HEART_BOSS_SPOTS.quench,
  f1: { x: -104, z: 0 },
  f3: { x: -142, z: -20 },
  anvil: SMITH_HEART_BOSS_SPOTS.heat,
  heart: { x: 12, z: 12 },
} as const;

describe("the Smith's Heart route", () => {
  it('is a raid of ten in its own instance band', () => {
    expect(DUNGEON.suggestedPlayers).toBe(10);
    expect(DUNGEON.interior).toBe('smith_heart');
    const others = Object.values(DUNGEONS).filter((d) => d.id !== DUNGEON.id);
    expect(others.some((d) => d.index === DUNGEON.index)).toBe(false);
    // The field fits one slot of its band (x 600 wide, z 500 tall).
    expect(Math.max(-minX, maxX)).toBeLessThan(300);
    expect(Math.max(-minZ, maxZ)).toBeLessThan(250);
  });

  it('walks from the Cleft through all four arenas to the Heart with every gate open', () => {
    const seen = flood(ALL_GATES);
    const missed = Object.entries(SPOTS)
      .filter(([, p]) => !reaches(seen, p))
      .map(([k]) => k);
    expect(missed).toEqual([]);
    // The whole Ring, every 10 degrees of its walked arc.
    const ringMissed: number[] = [];
    for (let d = 0; d < 360; d += 10) {
      if (d > 140 && d < 220) continue; // the Balcony and its two stairs
      if (!reaches(seen, ringPoint(d))) ringMissed.push(d);
    }
    expect(ringMissed).toEqual([]);
    // Every spawn stands on reached floor.
    const stranded = SMITH_HEART_SPAWNS.filter((s) => !reaches(seen, s)).map(
      (s) => `${s.mobId}@${s.x.toFixed(0)},${s.z.toFixed(0)}`,
    );
    expect(stranded).toEqual([]);
  });

  it('a fresh claim holds the raid in the Hammer Gallery', () => {
    const seen = flood([]);
    expect(reaches(seen, SPOTS.h3)).toBe(true);
    expect(reaches(seen, SPOTS.pit)).toBe(false);
    expect(reaches(seen, SPOTS.balconyTip)).toBe(false);
  });

  it('the Pit Mouth opens the Pit, but the Slab holds the Balcony', () => {
    const seen = flood(['hammer_pit_mouth']);
    expect(reaches(seen, SPOTS.pit)).toBe(true);
    expect(reaches(seen, SPOTS.balconyTip)).toBe(false);
    expect(reaches(seen, SPOTS.ring)).toBe(false);
  });

  it('the Slab open: the Ring and all three veins in any order, never the Heart', () => {
    const seen = flood(['hammer_pit_mouth', 'the_slab']);
    for (const k of ['balconyTip', 'ring', 'b3', 'breathMouth', 'q3', 'f3'] as const) {
      expect(reaches(seen, SPOTS[k]), k).toBe(true);
    }
    for (const k of ['cornice', 'lake', 'anvil', 'heart'] as const) {
      expect(reaches(seen, SPOTS[k]), k).toBe(false);
    }
    // Each arena mouth is independent of the other two veins.
    for (const [mouth, inside, others] of [
      ['cornice_mouth', 'cornice', ['lake', 'anvil']],
      ['lake_mouth', 'lake', ['cornice', 'anvil']],
      ['anvil_mouth', 'anvil', ['cornice', 'lake']],
    ] as const) {
      const one = flood(['hammer_pit_mouth', 'the_slab', mouth]);
      expect(reaches(one, SPOTS[inside]), inside).toBe(true);
      for (const o of others) expect(reaches(one, SPOTS[o]), o).toBe(false);
      expect(reaches(one, SPOTS.heart)).toBe(false);
    }
  });

  it('every causeway alone leads into the Heart once its seal opens', () => {
    for (const id of ['causeway_north', 'causeway_east', 'causeway_west']) {
      const seen = flood(['hammer_pit_mouth', 'the_slab', id]);
      expect(reaches(seen, SPOTS.heart), id).toBe(true);
    }
  });

  it('never steps more than a body can climb between reached neighbours', () => {
    const seen = flood(ALL_GATES);
    const bad: string[] = [];
    for (let z = minZ; z < maxZ; z++)
      for (let x = minX; x < maxX; x++) {
        if (!seen[cell(x, z)]) continue;
        const h = authoredFieldHeight(FIELD, x, z);
        for (const [dx, dz] of [
          [1, 0],
          [0, 1],
        ]) {
          if (!seen[cell(x + dx, z + dz)]) continue;
          const step = Math.abs(authoredFieldHeight(FIELD, x + dx, z + dz) - h);
          if (step > Math.max(MAX_STEP_HEIGHT, FIELD.cliffStep) + 0.05) {
            bad.push(`(${x},${z}) step ${step.toFixed(2)}`);
          }
        }
      }
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('every walkway is at least 12 yd wide (a raid of ten moves through it)', () => {
    for (const s of FIELD.surfaces) {
      if (s.kind === 'path') expect(s.halfWidth * 2, s.id).toBeGreaterThanOrEqual(12);
    }
    for (const g of SMITH_HEART_GATES) expect(g.hw * 2, g.id).toBeGreaterThanOrEqual(12);
  });

  it('places the eight Ring packs two between each pair of vein mouths', () => {
    const between = (a: number, b: number) =>
      RING_PACK_DEGREES.filter((d) => d > a && d < b).length;
    expect(between(0, 90)).toBe(2);
    expect(between(90, 180)).toBe(2);
    expect(between(180, 270)).toBe(2);
    expect(between(270, 360)).toBe(2);
  });
});
