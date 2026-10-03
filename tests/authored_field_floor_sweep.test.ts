// The floor a body stands on IS the floor that is drawn, across the whole of
// every authored open-air field (the Hollow Crypt, the Sunken Bastion, the
// Drowned Temple, the Stormbrass Foundry, the Wildheart Basin).
//
// Live report (the Sunken Bastion, online): in the Lower Bailey by the dead
// Turretback Hermit only the player's head showed above the paving, "and more
// widely in other areas". The sim gives a point to the LAST surface containing
// it; the terrain drew every surface whole, so an earlier, higher terrace (the
// bailey at 2) was painted straight over a later, lower surface cut into it
// (the moat ring, the Sea Gate ramp), and a crag lump of the headland rock
// could rise through a rock-edged terrace's lip. The sweep samples the sim
// height on a fine grid over each field and holds the drawn top, and the
// headland rock, against it everywhere a body can stand.
import { describe, expect, it } from 'vitest';
import {
  ccw,
  isConvexCcw,
  prepareClipper,
  ringArea,
  subtractAll,
  subtractConvex,
} from '../src/render/authored_field/field_clip_core';
import {
  drawnTopAt,
  type FieldMeshData,
  planFieldTops,
  renderOutline,
  triangulatePolygon,
} from '../src/render/authored_field/field_mesh_core';
import {
  headlandMeshHeightAt,
  planHeadlandRock,
} from '../src/render/sunken_bastion/bastion_headland_core';
import { DROWNED_TEMPLE_FIELD } from '../src/sim/content/drowned_temple_layout';
import { GRAVEWYRM_SANCTUM_FIELD } from '../src/sim/content/gravewyrm_sanctum_layout';
import { HOLLOW_CRYPT_FIELD } from '../src/sim/content/hollow_crypt_layout';
import { STORMBRASS_FOUNDRY_FIELD } from '../src/sim/content/stormbrass_foundry_layout';
import {
  BAILEY_CHAPEL,
  SUNKEN_BASTION_ANCHORS,
  SUNKEN_BASTION_FIELD,
} from '../src/sim/content/sunken_bastion_layout';
import { WILDHEART_BASIN_FIELD } from '../src/sim/content/wildheart_basin_layout';
import {
  type AuthoredFieldDef,
  authoredFieldHeight,
  authoredFieldSurfaceAt,
} from '../src/sim/instances/authored_field';
import { MAX_STEP_HEIGHT } from '../src/sim/physics/character';

/** How far the drawn floor may sit from the walked one. */
const TOLERANCE = 0.05;
/** Points this close to a surface outline are ambiguous (either side owns
 *  them within float noise) and are skipped. */
const EDGE_BAND = 0.2;

/** Distance from (x, z) to a closed ring. */
function ringDistance(ring: readonly [number, number][], x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % ring.length];
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    let t = len2 > 0 ? ((x - ax) * dx + (z - az) * dz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
  }
  return best;
}

/** The drawn tops bucketed on a coarse grid, so a sweep of tens of thousands
 *  of points reads only the triangles near each one. */
function bucketTops(tops: FieldMeshData[], cell: number) {
  const buckets = new Map<string, number[]>();
  const all: number[] = [];
  for (const t of tops) for (const v of t.positions) all.push(v);
  for (let i = 0; i < all.length; i += 9) {
    const xs = [all[i], all[i + 3], all[i + 6]];
    const zs = [all[i + 2], all[i + 5], all[i + 8]];
    for (
      let cx = Math.floor(Math.min(...xs) / cell);
      cx <= Math.floor(Math.max(...xs) / cell);
      cx++
    ) {
      for (
        let cz = Math.floor(Math.min(...zs) / cell);
        cz <= Math.floor(Math.max(...zs) / cell);
        cz++
      ) {
        const key = `${cx},${cz}`;
        let b = buckets.get(key);
        if (!b) {
          b = [];
          buckets.set(key, b);
        }
        for (let k = 0; k < 9; k++) b.push(all[i + k]);
      }
    }
  }
  return (x: number, z: number): number => {
    const b = buckets.get(`${Math.floor(x / cell)},${Math.floor(z / cell)}`);
    if (!b) return Number.NaN;
    return drawnTopAt({ positions: b, colors: [], uvs: [], indices: [] }, x, z);
  };
}

interface Miss {
  x: number;
  z: number;
  walked: number;
  drawn: number;
  surface: string;
}

/** Every walkable sample where the drawn top misses the walked height. */
function sweep(def: AuthoredFieldDef, maxEdge: number, step: number) {
  const tops = planFieldTops(def, { maxEdge, layerLift: 0 });
  const drawnAt = bucketTops(Object.values(tops), 4);
  const rings = def.surfaces.map((s) => renderOutline(s));
  const misses: Miss[] = [];
  let samples = 0;
  const b = def.bounds;
  for (let z = b.minZ; z <= b.maxZ; z += step) {
    for (let x = b.minX; x <= b.maxX; x += step) {
      const s = authoredFieldSurfaceAt(def, x, z);
      if (!s || s.hidden) continue;
      if (rings.some((r) => ringDistance(r, x, z) < EDGE_BAND)) continue;
      const walked = authoredFieldHeight(def, x, z);
      const drawn = drawnAt(x, z);
      samples++;
      if (!(Math.abs(drawn - walked) <= TOLERANCE)) {
        misses.push({ x, z, walked, drawn, surface: s.id });
      }
    }
  }
  return { misses, samples };
}

function describeMisses(misses: Miss[]): string {
  const bySurface = new Map<string, Miss[]>();
  for (const m of misses) {
    const list = bySurface.get(m.surface) ?? [];
    list.push(m);
    bySurface.set(m.surface, list);
  }
  return [...bySurface.entries()]
    .map(([id, list]) => {
      const worst = list.reduce((a, m) =>
        Math.abs(m.drawn - m.walked) > Math.abs(a.drawn - a.walked) || Number.isNaN(m.drawn)
          ? m
          : a,
      );
      return `${id}: ${list.length} misses, worst at (${worst.x}, ${worst.z}) walked ${worst.walked.toFixed(2)} drawn ${worst.drawn.toFixed(2)}`;
    })
    .join('\n');
}

const FIELDS: [string, AuthoredFieldDef][] = [
  ['the Hollow Crypt', HOLLOW_CRYPT_FIELD],
  ['the Sunken Bastion', SUNKEN_BASTION_FIELD],
  ['the Drowned Temple', DROWNED_TEMPLE_FIELD],
  ['the Stormbrass Foundry', STORMBRASS_FOUNDRY_FIELD],
  ['the Wildheart Basin', WILDHEART_BASIN_FIELD],
  ['the Gravewyrm Sanctum', GRAVEWYRM_SANCTUM_FIELD],
];

describe('an authored field is walked where it is drawn', () => {
  for (const [name, def] of FIELDS) {
    for (const [tier, maxEdge] of [
      ['high', 3],
      ['low', 6],
    ] as const) {
      it(`${name}: the drawn floor matches the walked floor everywhere (${tier} tier)`, () => {
        const { misses, samples } = sweep(def, maxEdge, 0.75);
        expect(samples).toBeGreaterThan(20000);
        expect(misses.length, describeMisses(misses)).toBe(0);
      });
    }
  }
});

describe('the Sunken Bastion floors the report named', () => {
  const tops = planFieldTops(SUNKEN_BASTION_FIELD, { maxEdge: 3, layerLift: 0 });
  const drawnAt = bucketTops(Object.values(tops), 4);

  it('draws the moat ring at the moat floor, not under the bailey paving', () => {
    for (const deg of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const a = (deg * Math.PI) / 180;
      const r = (BAILEY_CHAPEL.island + BAILEY_CHAPEL.moat) / 2;
      const x = BAILEY_CHAPEL.x + Math.sin(a) * r;
      const z = BAILEY_CHAPEL.z + Math.cos(a) * r;
      expect(authoredFieldHeight(SUNKEN_BASTION_FIELD, x, z)).toBe(BAILEY_CHAPEL.moatFloor);
      expect(drawnAt(x, z)).toBeCloseTo(BAILEY_CHAPEL.moatFloor, 6);
    }
  });

  it('keeps the moat a stride deep so a body walks in and out of it', () => {
    const bailey = authoredFieldHeight(
      SUNKEN_BASTION_FIELD,
      SUNKEN_BASTION_ANCHORS.cisternYard.x,
      -60,
    );
    expect(bailey - BAILEY_CHAPEL.moatFloor).toBeGreaterThan(0.2);
    expect(bailey - BAILEY_CHAPEL.moatFloor).toBeLessThan(MAX_STEP_HEIGHT);
  });

  it('draws the Sea Gate ramp where it cuts into the bailey lip', () => {
    for (const z of [-130, -128, -127]) {
      const walked = authoredFieldHeight(SUNKEN_BASTION_FIELD, 0, z);
      expect(walked).toBeLessThan(2);
      expect(drawnAt(0, z)).toBeCloseTo(walked, 5);
    }
  });

  for (const [tier, step] of [
    ['high', 2.5],
    ['low', 4],
  ] as const) {
    it(`never raises the headland rock through a walkable floor (${tier} tier)`, () => {
      const grid = planHeadlandRock(step);
      const b = SUNKEN_BASTION_FIELD.bounds;
      let checked = 0;
      const worst: string[] = [];
      for (let z = b.minZ; z <= b.maxZ; z += 0.75) {
        for (let x = b.minX; x <= b.maxX; x += 0.75) {
          const s = authoredFieldSurfaceAt(SUNKEN_BASTION_FIELD, x, z);
          if (!s || s.hidden) continue;
          const rock = headlandMeshHeightAt(grid, x, z);
          if (Number.isNaN(rock)) continue;
          checked++;
          const floor = authoredFieldHeight(SUNKEN_BASTION_FIELD, x, z);
          if (rock > floor + TOLERANCE && worst.length < 12) {
            worst.push(`(${x}, ${z}) on ${s.id}: rock ${rock.toFixed(2)} over floor ${floor}`);
          }
        }
      }
      expect(checked).toBeGreaterThan(500);
      expect(worst, worst.join('\n')).toEqual([]);
    });
  }
});

describe('the terrain clip core', () => {
  const area = (rings: [number, number][][]): number =>
    rings.reduce((sum, r) => sum + Math.abs(ringArea(r)), 0);

  it('subtracts a convex clipper exactly, in convex pieces', () => {
    const square: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    const hole: [number, number][] = [
      [2, 2],
      [6, 2],
      [6, 6],
      [2, 6],
    ];
    const pieces = subtractConvex(square, ccw(hole));
    expect(area(pieces)).toBeCloseTo(100 - 16, 9);
    for (const p of pieces) expect(isConvexCcw(ccw(p))).toBe(true);
    // Disjoint and fully covering clippers.
    expect(
      area(
        subtractConvex(
          square,
          ccw([
            [20, 20],
            [30, 20],
            [30, 30],
          ]),
        ),
      ),
    ).toBeCloseTo(100, 9);
    expect(subtractConvex(hole, ccw(square))).toEqual([]);
  });

  it('subtracts a concave clipper through its ear-clipped parts', () => {
    const l: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 4],
      [4, 4],
      [4, 10],
      [0, 10],
    ];
    const clipper = prepareClipper(l, triangulatePolygon);
    expect(clipper.parts.length).toBeGreaterThan(1);
    const square: [number, number][] = [
      [-5, -5],
      [15, -5],
      [15, 15],
      [-5, 15],
    ];
    expect(area(subtractAll(square, [clipper]))).toBeCloseTo(400 - 64, 6);
  });
});
