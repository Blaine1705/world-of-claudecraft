import { readFileSync } from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { beforeAll, describe, expect, it } from 'vitest';
import { isPlacedBuildingAsset } from '../src/render/eastbrook_placed_building';
import { buildingRecordColliders, placedBuildingAnnexes } from '../src/sim/authored_town_buildings';
import { isBlocked, streetlampPlacements } from '../src/sim/colliders';
import { ZONE2_PROPS } from '../src/sim/content/zone2';
import { FENBRIDGE_LAYOUT, localToWorld, type Obb2 } from '../src/sim/fenbridge_layout';
import { terrainHeight } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

// The built-in Fenbridge stands five painted Tidehold buildings (in the
// Fenrire moss look) inside its palisade ring. This suite measures each
// layout record off the things it was copied from: the shipped model file and
// the model's baked collision rows.

const ROOT = path.join(__dirname, '..');
const BUILDINGS = FENBRIDGE_LAYOUT.buildings;
type Building = (typeof BUILDINGS)[number];

interface BakedBox {
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
  ry?: number;
}
const BAKED = JSON.parse(
  readFileSync(path.join(ROOT, 'data/asset_collision_overrides.json'), 'utf8'),
) as Record<string, { boxes: BakedBox[] }>;

/** The model a record draws: a look (`tidehold/fenrire/x`) re-bakes the
 *  textures of `tidehold/x` on the same geometry, so it shares its rows. */
function modelIdOf(building: Building): string {
  const name = building.assetId.replace(/^.*\//, '').replace(/\.glb$/, '');
  return `tidehold/${name}`;
}

/** A world point in the model's own axes (the inverse of localToWorld). */
function toModelAxes(building: Building, point: { x: number; z: number }) {
  const dx = point.x - building.placement.x;
  const dz = point.z - building.placement.z;
  const cos = Math.cos(building.placement.rotation);
  const sin = Math.sin(building.placement.rotation);
  return { x: dx * cos - dz * sin, z: dx * sin + dz * cos };
}

interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

function rectOf(building: Building, obb: Obb2): Rect {
  const c = toModelAxes(building, obb.center);
  return {
    x0: c.x - obb.halfWidth,
    x1: c.x + obb.halfWidth,
    z0: c.z - obb.halfDepth,
    z1: c.z + obb.halfDepth,
  };
}

function worstEdge(a: Rect, b: Rect): number {
  return Math.max(
    Math.abs(a.x0 - b.x0),
    Math.abs(a.x1 - b.x1),
    Math.abs(a.z0 - b.z0),
    Math.abs(a.z1 - b.z1),
  );
}

interface NaturalBounds {
  min: [number, number, number];
  max: [number, number, number];
  size: [number, number, number];
}
const naturalBounds = new Map<string, NaturalBounds>();

beforeAll(async () => {
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  for (const building of BUILDINGS) {
    const bytes = readFileSync(path.join(ROOT, 'public', building.assetId.replace(/^\//, '')));
    const document = await io.readBinary(bytes);
    const scene = document.getRoot().getDefaultScene() ?? document.getRoot().listScenes()[0];
    const min: [number, number, number] = [Infinity, Infinity, Infinity];
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    scene.traverse((node) => {
      const mesh = node.getMesh();
      if (!mesh) return;
      const m = node.getWorldMatrix();
      for (const primitive of mesh.listPrimitives()) {
        const position = primitive.getAttribute('POSITION');
        if (!position) continue;
        const lo = position.getMinNormalized([]);
        const hi = position.getMaxNormalized([]);
        for (const x of [lo[0], hi[0]]) {
          for (const y of [lo[1], hi[1]]) {
            for (const z of [lo[2], hi[2]]) {
              const world = [
                m[0] * x + m[4] * y + m[8] * z + m[12],
                m[1] * x + m[5] * y + m[9] * z + m[13],
                m[2] * x + m[6] * y + m[10] * z + m[14],
              ];
              for (let axis = 0; axis < 3; axis++) {
                min[axis] = Math.min(min[axis], world[axis]);
                max[axis] = Math.max(max[axis], world[axis]);
              }
            }
          }
        }
      }
    });
    naturalBounds.set(building.id, {
      min,
      max,
      size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    });
  }
});

function boundsOf(building: Building): NaturalBounds {
  const bounds = naturalBounds.get(building.id);
  if (!bounds) throw new Error(`no measured bounds for ${building.id}`);
  return bounds;
}

/** Placed-asset target height: a baked collision row is stored in multiples
 *  of the model's largest dimension over it. */
const PLACED_TARGET_HEIGHT = 2.2;

describe('the five placed Fenbridge buildings', () => {
  it('are the painted Tidehold set, one building per role', () => {
    expect(BUILDINGS.map((building) => [building.id, modelIdOf(building), building.kind])).toEqual([
      ['fenbridge_warden_gatehouse', 'tidehold/house_a', 'house'],
      ['fenbridge_crooked_reed_inn', 'tidehold/tavern', 'inn'],
      ['fenbridge_lantern_chapel', 'tidehold/hall', 'chapel'],
      ['fenbridge_moonwort_apothecary', 'tidehold/shop_b', 'house'],
      ['fenbridge_gilded_strongbox', 'tidehold/shop_a', 'house'],
    ]);
    for (const building of BUILDINGS) {
      expect(isPlacedBuildingAsset(building.assetId), building.id).toBe(true);
    }
  });

  it('stand at authored size with their footing buried', () => {
    for (const building of BUILDINGS) {
      expect(building.placement.scale, building.id).toBe(1);
      expect(building.placement.lift, building.id).toBe(-1.05);
      // one authored yard of footing, buried, the ground line a hair under the seat
      const groundLine =
        -boundsOf(building).min[1] * building.placement.scale + building.placement.lift;
      expect(groundLine, `${building.id} ground line`).toBeLessThan(0);
      expect(groundLine, `${building.id} ground line`).toBeGreaterThan(-0.06);
    }
  });

  it('reach across the whole model, measured off the shipped file', () => {
    for (const building of BUILDINGS) {
      const bounds = boundsOf(building);
      const scale = building.placement.scale;
      const measured: Rect = {
        x0: bounds.min[0] * scale,
        x1: bounds.max[0] * scale,
        z0: bounds.min[2] * scale,
        z1: bounds.max[2] * scale,
      };
      expect(
        worstEdge(rectOf(building, building.reach), measured),
        `${building.id} reach`,
      ).toBeLessThan(0.02);
      // the height the record reports is the part above the ground line
      expect(
        Math.abs(
          building.nativeDimensions.height - (bounds.size[1] * scale + building.placement.lift),
        ),
        `${building.id} height`,
      ).toBeLessThan(0.02);
    }
  });

  it('collide on their baked wall lines, never on their eaves', () => {
    for (const building of BUILDINGS) {
      const baked = BAKED[modelIdOf(building)];
      expect(baked, modelIdOf(building)).toBeDefined();
      // a row's unit: the model's largest dimension over the target height
      const unit =
        (Math.max(...boundsOf(building).size) / PLACED_TARGET_HEIGHT) * building.placement.scale;
      const boxes = baked.boxes.map((box) => {
        const cos = Math.abs(Math.cos(box.ry ?? 0));
        const sin = Math.abs(Math.sin(box.ry ?? 0));
        const ex = (box.hx * cos + box.hz * sin) * unit;
        const ez = (box.hx * sin + box.hz * cos) * unit;
        // the rows stand the model on its lowest point (its footing)
        const footing = -boundsOf(building).min[1] * building.placement.scale;
        return {
          x0: box.x * unit - ex,
          x1: box.x * unit + ex,
          z0: box.z * unit - ez,
          z1: box.z * unit + ez,
          y0: (box.y - box.hy) * unit - footing,
          y1: (box.y + box.hy) * unit - footing,
        };
      });
      const groundWalls = boxes.filter((box) => box.y0 < 0.1 && box.y1 - box.y0 >= 3.5);
      const walls = rectOf(building, building.footprint);
      const sides = [
        { name: 'west', at: walls.x0, face: 'x0', lo: walls.z0, hi: walls.z1, along: 'z' },
        { name: 'east', at: walls.x1, face: 'x1', lo: walls.z0, hi: walls.z1, along: 'z' },
        { name: 'front', at: walls.z0, face: 'z0', lo: walls.x0, hi: walls.x1, along: 'x' },
        { name: 'back', at: walls.z1, face: 'z1', lo: walls.x0, hi: walls.x1, along: 'x' },
      ] as const;
      for (const side of sides) {
        let covered = 0;
        for (const box of groundWalls) {
          if (Math.abs(box[side.face] - side.at) > 0.06) continue;
          const lo = side.along === 'z' ? box.z0 : box.x0;
          const hi = side.along === 'z' ? box.z1 : box.x1;
          covered += Math.max(0, Math.min(hi, side.hi) - Math.max(lo, side.lo));
        }
        // a door or a shopfront opens the wall line, never most of it
        expect(covered / (side.hi - side.lo), `${building.id} ${side.name} wall`).toBeGreaterThan(
          0.75,
        );
      }
      // the box sits well inside the reach: it is not the eaves
      const reach = rectOf(building, building.reach);
      expect(
        (reach.x1 - reach.x0) * (reach.z1 - reach.z0),
        `${building.id} reach area`,
      ).toBeGreaterThan((walls.x1 - walls.x0) * (walls.z1 - walls.z0) * 1.15);
      for (const annex of building.annexes) {
        const want = rectOf(building, annex);
        let best = Infinity;
        for (const box of boxes) best = Math.min(best, worstEdge(want, box));
        // ...or everything that stands on the ground inside it (a pair of
        // barrels with the awning post beside them)
        const inside = boxes.filter((box) => {
          if (box.y0 >= 0.1) return false;
          const cx = (box.x0 + box.x1) / 2;
          const cz = (box.z0 + box.z1) / 2;
          return (
            cx > want.x0 - 0.1 && cx < want.x1 + 0.1 && cz > want.z0 - 0.1 && cz < want.z1 + 0.1
          );
        });
        if (inside.length > 0) {
          best = Math.min(
            best,
            worstEdge(want, {
              x0: Math.min(...inside.map((box) => box.x0)),
              x1: Math.max(...inside.map((box) => box.x1)),
              z0: Math.min(...inside.map((box) => box.z0)),
              z1: Math.max(...inside.map((box) => box.z1)),
            }),
          );
        }
        expect(best, annex.id).toBeLessThan(0.06);
      }
    }
  });

  it('names the solid parts that stand outside each wall box', () => {
    expect(
      Object.fromEntries(
        BUILDINGS.map((building) => [building.id, building.annexes.map((annex) => annex.id)]),
      ),
    ).toEqual({
      fenbridge_warden_gatehouse: [],
      fenbridge_crooked_reed_inn: [
        'fenbridge_crooked_reed_inn:front_bench',
        'fenbridge_crooked_reed_inn:barrels',
      ],
      fenbridge_lantern_chapel: [
        'fenbridge_lantern_chapel:bell_tower',
        'fenbridge_lantern_chapel:notice_board',
      ],
      fenbridge_moonwort_apothecary: ['fenbridge_moonwort_apothecary:turret'],
      fenbridge_gilded_strongbox: [
        'fenbridge_gilded_strongbox:stall_counter',
        'fenbridge_gilded_strongbox:stall_barrels',
      ],
    });
  });
});

describe('placed Fenbridge building collision in the built-in world', () => {
  const recordOf = (building: Building) => {
    const record = ZONE2_PROPS.buildings.find((candidate) => candidate.id === building.id);
    if (!record) throw new Error(`no props record for ${building.id}`);
    return record;
  };

  it('gives each record its wall box plus one box per annex', () => {
    for (const building of BUILDINGS) {
      const record = recordOf(building);
      expect(record).toMatchObject({
        x: building.position.x,
        z: building.position.z,
        w: building.nativeDimensions.width,
        d: building.nativeDimensions.depth,
        rot: building.rotation,
      });
      const colliders = buildingRecordColliders(record, 30, () => 0);
      expect(colliders, building.id).toHaveLength(1 + building.annexes.length);
      building.annexes.forEach((annex, index) => {
        expect(colliders[index + 1], annex.id).toMatchObject({
          type: 'obb',
          x: annex.center.x,
          z: annex.center.z,
          hw: annex.halfWidth,
          hd: annex.halfDepth,
          rot: annex.rotation,
        });
      });
    }
    // a record a custom world moved leaves its annexes behind
    const inn = recordOf(BUILDINGS[1]);
    expect(placedBuildingAnnexes(inn)).toHaveLength(2);
    expect(placedBuildingAnnexes({ ...inn, x: inn.x + 4 })).toHaveLength(0);
  });

  it('seals the doorway and every annex, and leaves the street in front open', () => {
    for (const building of BUILDINGS) {
      const anchor = { x: building.placement.x, z: building.placement.z };
      const walls = rectOf(building, building.footprint);
      const door = toModelAxes(building, building.frontStandingPoint);
      // one stride inside the front wall, on the door's own line
      const inside = localToWorld(anchor, building.placement.rotation, door.x, walls.z0 + 1);
      expect(isBlocked(WORLD_SEED, inside.x, inside.z), `${building.id} doorway`).toBe(true);
      const front = building.frontStandingPoint;
      expect(isBlocked(WORLD_SEED, front.x, front.z, 0.5), `${building.id} front`).toBe(false);
      for (const annex of building.annexes) {
        expect(isBlocked(WORLD_SEED, annex.center.x, annex.center.z), annex.id).toBe(true);
      }
    }
  });
});

describe('the ground under the placed Fenbridge buildings', () => {
  it('never rises through a floor, and the footing covers every dip', () => {
    for (const building of BUILDINGS) {
      const seat = terrainHeight(building.placement.x, building.placement.z, WORLD_SEED);
      const box = building.reach;
      let low = Infinity;
      let high = -Infinity;
      for (let lx = -box.halfWidth; lx <= box.halfWidth + 1e-6; lx += 0.5) {
        for (let lz = -box.halfDepth; lz <= box.halfDepth + 1e-6; lz += 0.5) {
          const point = localToWorld(box.center, box.rotation, lx, lz);
          const y = terrainHeight(point.x, point.z, WORLD_SEED);
          low = Math.min(low, y);
          high = Math.max(high, y);
        }
      }
      // the ground line sits 0.05 under the seat: a rise of more would show
      // grass through the floor
      expect(high - seat, `${building.id} high ground`).toBeLessThan(0.05);
      const footing = -boundsOf(building).min[1] * building.placement.scale;
      expect(seat - low, `${building.id} low ground`).toBeLessThan(footing - 0.3);
    }
  });
});

describe('the street lamps around the placed Fenbridge buildings', () => {
  it('stand clear of every building, porch and eave, and off every door step', () => {
    const hub = FENBRIDGE_LAYOUT.hub.center;
    isBlocked(WORLD_SEED, hub.x, hub.z); // plans the lamp network with the grid
    const lamps = streetlampPlacements(WORLD_SEED).filter(
      (lamp) => Math.hypot(lamp.x - hub.x, lamp.z - hub.z) < 60,
    );
    expect(lamps.length).toBeGreaterThan(0);
    for (const lamp of lamps) {
      const at = `lamp at ${lamp.x.toFixed(2)}, ${lamp.z.toFixed(2)}`;
      for (const building of BUILDINGS) {
        const local = toModelAxes(building, lamp);
        const reach = rectOf(building, building.reach);
        const within =
          local.x > reach.x0 && local.x < reach.x1 && local.z > reach.z0 && local.z < reach.z1;
        expect(within, `${at} in ${building.id}`).toBe(false);
        const step = building.frontStandingPoint;
        expect(
          Math.hypot(lamp.x - step.x, lamp.z - step.z),
          `${at} by the ${building.id} door`,
        ).toBeGreaterThan(3);
      }
    }
  });
});
