// The Evergarden's formal planting plan (src/render/garden_parterre_core.ts):
// every authored plot must sit on flat dry lawn clear of the Great Maze, the
// hamlet, the walks, the camps, the gather nodes, and the great tree trunks,
// and the plan itself must read as a designed garden: solid color beds, a
// wide color wheel, clipped uniform hedges, and topiary avenues on the roads.

import { describe, expect, it } from 'vitest';
import {
  GARDEN_BED_TINTS,
  gardenAvenueSpots,
  gardenMeadowTintAt,
  inParterrePlot,
  PARTERRE_PLOTS,
  parterreBushSpots,
  parterreFlowerTintAt,
} from '../src/render/garden_parterre_core';
import { EVERGARDEN_CAMPS, EVERGARDEN_PROPS, EVERGARDEN_ZONE } from '../src/sim/content/evergarden';
import { GATHER_NODES } from '../src/sim/content/gather_nodes';
import {
  gardenLandness,
  MAZE_CELL,
  MAZE_COLS,
  MAZE_X0,
  MAZE_Z0,
  MAZE_Z1,
  roadDistance,
  terrainHeight,
  WATER_LEVEL,
} from '../src/sim/world';

// The production seed: the plots are placed against the live world geometry.
const SEED = 20061;

const slopeAt = (x: number, z: number): number => {
  const e = 1.2;
  const hx = terrainHeight(x + e, z, SEED) - terrainHeight(x - e, z, SEED);
  const hz = terrainHeight(x, z + e, SEED) - terrainHeight(x, z - e, SEED);
  return Math.hypot(hx, hz) / (2 * e);
};

describe('parterre plot sites', () => {
  it('every plot sits on flat dry lawn inside the zone', () => {
    for (const p of PARTERRE_PLOTS) {
      expect(p.x - p.r).toBeGreaterThan(EVERGARDEN_ZONE.xMin ?? 180);
      expect(p.x + p.r).toBeLessThan(EVERGARDEN_ZONE.xMax ?? 540);
      expect(p.z - p.r).toBeGreaterThan(EVERGARDEN_ZONE.zMin);
      expect(p.z + p.r).toBeLessThan(EVERGARDEN_ZONE.zMax);
      for (let a = 0; a < 8; a++) {
        for (const rr of [0, p.r * 0.6, p.r]) {
          const x = p.x + Math.sin((a * Math.PI) / 4) * rr;
          const z = p.z + Math.cos((a * Math.PI) / 4) * rr;
          const label = `plot (${p.x},${p.z}) at a${a} r${rr.toFixed(1)}`;
          expect(terrainHeight(x, z, SEED), `${label} height`).toBeGreaterThan(WATER_LEVEL + 1.6);
          expect(gardenLandness(x, z), `${label} landness`).toBeGreaterThan(0.25);
          expect(slopeAt(x, z), `${label} slope`).toBeLessThan(0.55);
          if (rr === 0) break;
        }
      }
    }
  });

  it('every plot clears the maze, hub, roads, camps, nodes, and great trees', () => {
    const mazeX1 = MAZE_X0 + MAZE_COLS * MAZE_CELL;
    const hub = EVERGARDEN_ZONE.hub;
    for (const p of PARTERRE_PLOTS) {
      const label = `plot (${p.x},${p.z})`;
      const inMaze =
        p.x + p.r > MAZE_X0 - 4 &&
        p.x - p.r < mazeX1 + 4 &&
        p.z + p.r > MAZE_Z0 - 4 &&
        p.z - p.r < MAZE_Z1 + 4;
      expect(inMaze, `${label} overlaps the maze`).toBe(false);
      expect(Math.hypot(p.x - hub.x, p.z - hub.z), `${label} hub`).toBeGreaterThan(
        hub.radius + p.r + 2,
      );
      expect(roadDistance(p.x, p.z), `${label} road`).toBeGreaterThan(p.r + 2);
      for (const camp of EVERGARDEN_CAMPS) {
        expect(
          Math.hypot(p.x - camp.center.x, p.z - camp.center.z),
          `${label} vs camp (${camp.center.x},${camp.center.z})`,
        ).toBeGreaterThan(p.r + camp.radius);
      }
      for (const node of GATHER_NODES) {
        if (node.zoneId !== 'evergarden') continue;
        expect(
          Math.hypot(p.x - node.pos.x, p.z - node.pos.z),
          `${label} vs node ${node.id}`,
        ).toBeGreaterThan(p.r + 2);
      }
      for (const tree of EVERGARDEN_PROPS.greatTrees ?? []) {
        expect(
          Math.hypot(p.x - tree.x, p.z - tree.z),
          `${label} vs great tree (${tree.x},${tree.z})`,
        ).toBeGreaterThan(p.r + tree.r);
      }
    }
  });
});

describe('the flower plan', () => {
  it('fills every bed edge to edge like a real planting', () => {
    for (const p of PARTERRE_PLOTS) {
      let painted = 0;
      let inside = 0;
      for (let dx = -p.r; dx <= p.r; dx += 1) {
        for (let dz = -p.r; dz <= p.r; dz += 1) {
          // sample the bed interior (inside the hedge line)
          if (Math.hypot(dx, dz) > p.r * 0.7) continue;
          inside++;
          if (parterreFlowerTintAt(p.x + dx, p.z + dz) >= 0) painted++;
        }
      }
      // full-fill beds: the filler color carries every pattern gap
      expect(painted / inside, `plot (${p.x},${p.z}) interior coverage`).toBeGreaterThan(0.9);
    }
    // far from every plot and road: bare lawn (meadow drifts are separate)
    expect(parterreFlowerTintAt(210, 795)).toBe(-1);
    expect(parterreFlowerTintAt(300, 745)).toBe(-1);
  });

  it('lays ribbon beds along the walks but not in the maze or hamlet', () => {
    // mid-segment points on the Hedgewick -> Rose Wilds walk, in the ribbon
    // band behind the path hedge line (5.2 to 6.6 off the road center)
    let ribbon = 0;
    for (let t = 0; t <= 1; t += 0.1) {
      const cx = 298 + (276 - 298) * t;
      const cz = 852 + (894 - 852) * t;
      for (let off = 5.3; off < 6.5; off += 0.3) {
        if (parterreFlowerTintAt(cx + off, cz) >= 0) ribbon++;
      }
    }
    expect(ribbon).toBeGreaterThan(3);
    // no ribbons inside the maze rect or the hamlet ring
    expect(parterreFlowerTintAt(360, 1016)).toBe(-1);
    expect(parterreFlowerTintAt(EVERGARDEN_ZONE.hub.x + 3, EVERGARDEN_ZONE.hub.z)).toBe(-1);
  });

  it('blooms meadow drifts on the open lawns, clear of walks and features', () => {
    // the big southeast lawn holds open ground: some cells must bloom
    let blooms = 0;
    for (let x = 440; x <= 530; x += 2) {
      for (let z = 740; z <= 810; z += 2) {
        const tint = gardenMeadowTintAt(x, z);
        if (tint >= 0) {
          blooms++;
          // a drift never sits on a walk, in a bed, or in the maze
          expect(roadDistance(x, z)).toBeGreaterThan(7.4);
          expect(inParterrePlot(x, z, 3.9)).toBe(false);
        }
      }
    }
    expect(blooms, 'southeast lawn meadow blooms').toBeGreaterThan(20);
    // never inside the maze or the hamlet
    expect(gardenMeadowTintAt(360, 1016)).toBe(-1);
    expect(gardenMeadowTintAt(EVERGARDEN_ZONE.hub.x + 4, EVERGARDEN_ZONE.hub.z)).toBe(-1);
  });

  it('uses a wide color wheel across the beds', () => {
    const seen = new Set<number>();
    for (const p of PARTERRE_PLOTS) {
      for (let dx = -p.r; dx <= p.r; dx += 0.8) {
        for (let dz = -p.r; dz <= p.r; dz += 0.8) {
          const tint = parterreFlowerTintAt(p.x + dx, p.z + dz);
          if (tint >= 0) seen.add(tint);
        }
      }
    }
    expect(seen.size, 'distinct bed colors in use').toBeGreaterThanOrEqual(6);
    for (const tint of seen) {
      if (![0xffffff, 0xf27ba6, 0xf2c94c].includes(tint)) {
        expect(GARDEN_BED_TINTS).toContain(tint);
      }
    }
  });
});

describe('the bush and topiary plan', () => {
  it('plants tight clipped hedges, tinted roses, and big bed centerpieces', () => {
    const spots = parterreBushSpots(SEED);
    const hedges = spots.filter((s) => s.kind === 'bush');
    const roses = spots.filter((s) => s.kind === 'bushFlowers');
    expect(hedges.length).toBeGreaterThan(300); // bed rings plus the walk lines
    expect(roses.length).toBeGreaterThanOrEqual(PARTERRE_PLOTS.length * 3);
    for (const s of hedges) expect(s.scale).toBe(0.82); // the gardener's shears
    for (const s of roses) {
      expect(s.bloomTint).toBeDefined();
      expect(GARDEN_BED_TINTS).toContain(s.bloomTint);
    }
    for (const s of spots) {
      expect(terrainHeight(s.x, s.z, SEED), `bush at (${s.x},${s.z})`).toBeGreaterThan(
        WATER_LEVEL + 1.6,
      );
      expect(slopeAt(s.x, s.z), `bush slope at (${s.x},${s.z})`).toBeLessThan(0.65);
    }
    for (const p of PARTERRE_PLOTS) {
      const center = roses.filter((s) => Math.hypot(s.x - p.x, s.z - p.z) < 1);
      if (p.centerpiece) {
        // a built centerpiece stands here instead (EVERGARDEN_PROPS.decorProps)
        expect(center.length, `plot (${p.x},${p.z}) keeps its heart clear`).toBe(0);
      } else {
        expect(center.length, `plot (${p.x},${p.z}) centerpiece`).toBe(1);
        expect(center[0].scale, 'the big bush').toBeGreaterThanOrEqual(1.8);
      }
      // the bed hedge line is packed shoulder to shoulder: gaps under ~2.2yd
      const ring = hedges.filter(
        (s) => Math.abs(Math.hypot(s.x - p.x, s.z - p.z) - p.r * 0.98) < p.r * 0.12,
      );
      if (p.kind !== 'knot') {
        expect(ring.length, `plot (${p.x},${p.z}) hedge ring density`).toBeGreaterThanOrEqual(
          Math.floor((Math.PI * 2 * p.r) / 2.3),
        );
      }
    }
  });

  it('lines every walk with a clipped hedge, broken at junctions', () => {
    const spots = parterreBushSpots(SEED);
    // mid-segment of the Rose Wilds walk: hedge lines flank at ~4.15yd
    const nearWalk = spots.filter(
      (s) =>
        s.kind === 'bush' &&
        Math.hypot(s.x - 287, s.z - 873) < 16 &&
        Math.abs(roadDistance(s.x, s.z) - 4.15) < 0.9,
    );
    expect(nearWalk.length, 'path hedge presence').toBeGreaterThan(8);
    // no hedge sits ON a walk
    for (const s of spots) {
      expect(roadDistance(s.x, s.z), `bush on the road at (${s.x},${s.z})`).toBeGreaterThan(3.3);
    }
  });

  it('lines the walks with avenue topiary clear of the statue lane and maze', () => {
    const spots = gardenAvenueSpots(SEED);
    expect(spots.length).toBeGreaterThan(30);
    const mazeX1 = MAZE_X0 + MAZE_COLS * MAZE_CELL;
    for (const s of spots) {
      const inStatueLane = s.x > 343 && s.x < 377 && s.z > 830 && s.z < 935;
      expect(inStatueLane, `topiary in the statue lane at (${s.x},${s.z})`).toBe(false);
      const inMaze =
        s.x > MAZE_X0 - 4 && s.x < mazeX1 + 4 && s.z > MAZE_Z0 - 4 && s.z < MAZE_Z1 + 4;
      expect(inMaze, `topiary in the maze at (${s.x},${s.z})`).toBe(false);
      // only the clipped ball form remains: cones and tiered "snowman"
      // topiary were retired from the Evergarden
      expect(s.form).toBe(0);
    }
    // avenue pairs exist along the Rose Wilds walk
    const nearWalk = spots.filter((s) => Math.hypot(s.x - 287, s.z - 873) < 30);
    expect(nearWalk.length).toBeGreaterThan(2);
  });

  it('is deterministic', () => {
    expect(parterreBushSpots(SEED)).toEqual(parterreBushSpots(SEED));
    expect(gardenAvenueSpots(SEED)).toEqual(gardenAvenueSpots(SEED));
  });
});
