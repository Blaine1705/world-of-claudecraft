import { readFileSync } from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { authoredTownBuildingPlacements } from '../src/editor/feature_prop_placements';
import {
  buildEastbrookPlacedBuilding,
  isPlacedBuildingAsset,
  PLACED_BUILDING_EMISSIVE_FLOOR,
  placedBuildingMaterial,
} from '../src/render/eastbrook_placed_building';
import { gfxInternalsForTest } from '../src/render/gfx';
import { cloneMaterialWithHooks } from '../src/render/material_clone_hooks';
import { setDitherFadeEnabledForTest } from '../src/render/occluder_dither_fade';
import { buildingRecordColliders, placedBuildingAnnexes } from '../src/sim/authored_town_buildings';
import { isBlocked, streetlampPlacements } from '../src/sim/colliders';
import { EASTBROOK_BUILDING_PAD_TERRAIN_EDITS, ZONE1_PROPS } from '../src/sim/content/zone1';
import { BUILTIN_WORLD, PLAYER_START, setActiveWorldContent } from '../src/sim/data';
import { isExcludedDecoration, isExcludedStreetlamp } from '../src/sim/decoration_exclusions';
import { EASTBROOK_LAYOUT, localToWorld, type Obb2 } from '../src/sim/eastbrook_layout';
import { HIGHWATCH_LAYOUT } from '../src/sim/highwatch_layout';
import { Sim } from '../src/sim/sim';
import {
  generateDecorationsInBounds,
  groundHeight,
  terrainHeight,
  WATER_LEVEL,
} from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

// The built-in Eastbrook stands six painted Tidehold buildings where the
// Studio rebuild map (data/maps/eastbrook_rebuild.map.json) places them. This
// suite measures the layout's numbers off the things they were copied from:
// that map, the shipped model files, and the models' baked collision rows,
// and walks a player through every open doorway (sim/town_walk_in.ts).

const ROOT = path.join(__dirname, '..');
const BUILDINGS = EASTBROOK_LAYOUT.buildings;
type Building = (typeof BUILDINGS)[number];

interface MapPlacement {
  assetId: string;
  x: number;
  z: number;
  y?: number;
  rotY?: number;
  scale?: number;
}
interface MapDoc {
  placements: MapPlacement[];
  terrainEdits: { x: number; z: number; radius: number; delta: number; hardness?: number }[];
  decorationExclusions: string[];
}
const REBUILD_MAP = JSON.parse(
  readFileSync(path.join(ROOT, 'data/maps/eastbrook_rebuild.map.json'), 'utf8'),
) as MapDoc;

interface BakedBox {
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
  ry?: number;
}
interface BakedDeck {
  x: number;
  z: number;
  hx: number;
  hz: number;
  ry?: number;
}
const BAKED = JSON.parse(
  readFileSync(path.join(ROOT, 'data/asset_collision_overrides.json'), 'utf8'),
) as Record<string, { boxes: BakedBox[]; ramps?: BakedDeck[] }>;

function assetIdOf(building: Building): string {
  return building.assetId.replace(/^\/models\//, '').replace(/\.glb$/, '');
}

function mapPlacementOf(building: Building): MapPlacement {
  const found = REBUILD_MAP.placements.find((p) => p.assetId === assetIdOf(building));
  if (!found) throw new Error(`the rebuild map places no ${assetIdOf(building)}`);
  return found;
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

/** Placed-asset target height: a placement's scale is in multiples of it. */
const PLACED_TARGET_HEIGHT = 2.2;

/** The east edge of the quay's flat working pad (content/zone1.ts
 *  EASTBROOK_QUAY_TERRAIN_EDITS: flat stamps of radius 7 centred on x -92). */
const QUAY_PAD_EAST_EDGE = -85;

describe('the six placed Eastbrook buildings', () => {
  it('are the painted Tidehold set, one building each', () => {
    expect(BUILDINGS.map((building) => [building.id, building.assetId, building.kind])).toEqual([
      ['eastbrook_bank', '/models/tidehold/bank.glb', 'house'],
      ['eastbrook_smithy', '/models/tidehold/smithy.glb', 'house'],
      ['eastbrook_inn', '/models/tidehold/tavern.glb', 'inn'],
      ['eastbrook_chapel', '/models/tidehold/hall.glb', 'chapel'],
      ['eastbrook_apothecary', '/models/tidehold/shop_a.glb', 'house'],
      ['eastbrook_quay_cottage', '/models/tidehold/house_b.glb', 'house'],
    ]);
    for (const building of BUILDINGS) {
      expect(isPlacedBuildingAsset(building.assetId), building.id).toBe(true);
    }
  });

  it('stand at the anchor, turn, size and seat the Studio rebuild map gives them', () => {
    for (const building of BUILDINGS) {
      const placed = mapPlacementOf(building);
      expect(building.placement.x, `${building.id} x`).toBe(placed.x);
      expect(building.placement.z, `${building.id} z`).toBe(placed.z);
      expect(building.placement.lift, `${building.id} lift`).toBe(placed.y);
      // the map rounds its turn to four places
      const turn = Math.atan2(
        Math.sin(building.placement.rotation - (placed.rotY ?? 0)),
        Math.cos(building.placement.rotation - (placed.rotY ?? 0)),
      );
      expect(Math.abs(turn), `${building.id} turn`).toBeLessThan(1e-4);
      // a placement's scale is the model's largest dimension over the target
      // height, times the world size: the town draws the same world size
      const largest = Math.max(...boundsOf(building).size);
      const worldScale = ((placed.scale ?? 1) * PLACED_TARGET_HEIGHT) / largest;
      expect(Math.abs(worldScale - building.placement.scale), `${building.id} scale`).toBeLessThan(
        1e-4,
      );
    }
  });

  it('keeps the Weekly Vault where that map stands it', () => {
    const placed = REBUILD_MAP.placements.find((p) => p.assetId === 'tidehold/vault');
    expect(placed).toBeDefined();
    expect(EASTBROOK_LAYOUT.weeklyVault.x).toBe(placed?.x);
    expect(EASTBROOK_LAYOUT.weeklyVault.z).toBe(placed?.z);
    expect(EASTBROOK_LAYOUT.weeklyVault.rot).toBe(placed?.rotY);
  });

  it('reach across the whole model at the placed size, measured off the shipped file', () => {
    for (const building of BUILDINGS) {
      const bounds = boundsOf(building);
      const scale = building.placement.scale;
      const reach = rectOf(building, building.reach);
      const measured: Rect = {
        x0: bounds.min[0] * scale,
        x1: bounds.max[0] * scale,
        z0: bounds.min[2] * scale,
        z1: bounds.max[2] * scale,
      };
      expect(worstEdge(reach, measured), `${building.id} reach`).toBeLessThan(0.02);
      // the height the record reports is the part above the ground line
      expect(
        Math.abs(
          building.nativeDimensions.height - (bounds.size[1] * scale + building.placement.lift),
        ),
        `${building.id} height`,
      ).toBeLessThan(0.02);
      // one authored yard of footing, buried, with the ground line a hair under the seat
      const groundLine = -bounds.min[1] * scale + building.placement.lift;
      expect(groundLine, `${building.id} ground line`).toBeLessThan(0);
      expect(groundLine, `${building.id} ground line`).toBeGreaterThan(-0.06);
      // the authored size the baked collision rows scale by is the file's own
      expect(building.placement.modelSize, `${building.id} model size`).toBeCloseTo(
        Math.max(...bounds.size),
        3,
      );
    }
  });

  it('collide on their baked wall lines, never on their eaves', () => {
    for (const building of BUILDINGS) {
      const scale = mapPlacementOf(building).scale ?? 1;
      const baked = BAKED[assetIdOf(building)];
      expect(baked, assetIdOf(building)).toBeDefined();
      const boxes = baked.boxes.map((box) => {
        const cos = Math.abs(Math.cos(box.ry ?? 0));
        const sin = Math.abs(Math.sin(box.ry ?? 0));
        const ex = (box.hx * cos + box.hz * sin) * scale;
        const ez = (box.hx * sin + box.hz * cos) * scale;
        return {
          x0: box.x * scale - ex,
          x1: box.x * scale + ex,
          z0: box.z * scale - ez,
          z1: box.z * scale + ez,
          y0: (box.y - box.hy) * scale + building.placement.lift,
          y1: (box.y + box.hy) * scale + building.placement.lift,
        };
      });
      const groundWalls = boxes.filter((box) => box.y0 < 0.1 && box.y1 - box.y0 >= 5);
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
          0.8,
        );
      }
      // the box sits well inside the reach on at least one side: it is not the eaves
      const reach = rectOf(building, building.reach);
      expect(
        (reach.x1 - reach.x0) * (reach.z1 - reach.z0),
        `${building.id} reach area`,
      ).toBeGreaterThan((walls.x1 - walls.x0) * (walls.z1 - walls.z0) * 1.15);

      const decks = (baked.ramps ?? []).map((deck) => {
        const cos = Math.abs(Math.cos(deck.ry ?? 0));
        const sin = Math.abs(Math.sin(deck.ry ?? 0));
        const ex = (deck.hx * cos + deck.hz * sin) * scale;
        const ez = (deck.hx * sin + deck.hz * cos) * scale;
        return {
          x0: deck.x * scale - ex,
          x1: deck.x * scale + ex,
          z0: deck.z * scale - ez,
          z1: deck.z * scale + ez,
        };
      });
      for (const annex of building.annexes) {
        const want = rectOf(building, annex);
        let best = Infinity;
        for (const box of boxes) best = Math.min(best, worstEdge(want, box));
        for (const deck of decks) best = Math.min(best, worstEdge(want, deck));
        // ...or everything that stands on the ground inside it: the walls of a
        // room outside the main body, a pair of barrels
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
      eastbrook_bank: ['eastbrook_bank:strongroom', 'eastbrook_bank:turret'],
      eastbrook_smithy: ['eastbrook_smithy:forge_shelter'],
      eastbrook_inn: ['eastbrook_inn:front_bench', 'eastbrook_inn:barrels'],
      eastbrook_chapel: ['eastbrook_chapel:bell_tower', 'eastbrook_chapel:notice_board'],
      eastbrook_apothecary: [
        'eastbrook_apothecary:stall_counter',
        'eastbrook_apothecary:stall_barrels',
      ],
      eastbrook_quay_cottage: ['eastbrook_quay_cottage:crates'],
    });
  });
});

describe('placed building collision in the built-in world', () => {
  const recordOf = (building: Building) => {
    const record = ZONE1_PROPS.buildings.find((candidate) => candidate.id === building.id);
    if (!record) throw new Error(`no props record for ${building.id}`);
    return record;
  };

  it('gives each sealed record its wall box plus one box per annex', () => {
    for (const building of BUILDINGS) {
      const record = recordOf(building);
      expect(record.x).toBe(building.position.x);
      expect(record.z).toBe(building.position.z);
      expect(record.w).toBe(building.nativeDimensions.width);
      expect(record.d).toBe(building.nativeDimensions.depth);
      // with no seed every record is sealed; with one, only the shut-door model is
      if (!building.walkIn) {
        expect(
          buildingRecordColliders(record, 30, () => 0, WORLD_SEED),
          building.id,
        ).toEqual(buildingRecordColliders(record, 30, () => 0));
      }
      const colliders = buildingRecordColliders(record, 30, () => 0);
      expect(colliders, building.id).toHaveLength(1 + building.annexes.length);
      expect(colliders[0]).toMatchObject({
        type: 'obb',
        x: building.position.x,
        z: building.position.z,
        hw: building.nativeDimensions.width / 2,
        hd: building.nativeDimensions.depth / 2,
        rot: building.rotation,
      });
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
  });

  it('leaves the annexes behind when a custom world moves, turns or resizes the record', () => {
    const chapel = BUILDINGS.find((building) => building.id === 'eastbrook_chapel');
    if (!chapel) throw new Error('missing chapel');
    const record = recordOf(chapel);
    expect(placedBuildingAnnexes(record)).toHaveLength(2);
    expect(placedBuildingAnnexes({ ...record, x: record.x + 4 })).toHaveLength(0);
    expect(placedBuildingAnnexes({ ...record, rot: record.rot + 0.5 })).toHaveLength(0);
    expect(placedBuildingAnnexes({ ...record, w: record.w + 1 })).toHaveLength(0);
    expect(placedBuildingAnnexes({ ...record, id: undefined })).toHaveLength(0);
    expect(buildingRecordColliders({ ...record, x: record.x + 4 }, 30, () => 0)).toHaveLength(1);
    // the vault is a record with no annex of its own
    expect(placedBuildingAnnexes({ ...EASTBROOK_LAYOUT.weeklyVault })).toHaveLength(0);
  });

  it('makes every building with an open doorway walk-in, and keeps the quay cottage shut', () => {
    expect(BUILDINGS.filter((building) => building.walkIn).map((building) => building.id)).toEqual([
      'eastbrook_bank',
      'eastbrook_smithy',
      'eastbrook_inn',
      'eastbrook_chapel',
      'eastbrook_apothecary',
    ]);
  });

  it('collides a walk-in record on its own model baked boxes, seated on the terrain', () => {
    for (const building of BUILDINGS.filter((candidate) => candidate.walkIn)) {
      const record = recordOf(building);
      const colliders = buildingRecordColliders(record, 30, () => 0, WORLD_SEED);
      const baked = BAKED[assetIdOf(building)].boxes;
      expect(colliders, building.id).toHaveLength(baked.length);
      // the placement rule: the model stands on the terrain under its anchor,
      // never on the ground query, which already carries its own floor deck
      const unit = (building.placement.scale * building.placement.modelSize) / PLACED_TARGET_HEIGHT;
      const seat =
        terrainHeight(building.placement.x, building.placement.z, WORLD_SEED) +
        building.placement.lift;
      const lowestBox = Math.min(...baked.map((box) => box.y - box.hy));
      const lowestCollider = Math.min(
        ...colliders.map((collider) => (collider as { baseY?: number }).baseY ?? Infinity),
      );
      expect(lowestCollider, building.id).toBeCloseTo(seat + lowestBox * unit, 6);
      // a record a custom world moved is one sealed box again, annexes left behind
      expect(
        buildingRecordColliders({ ...record, x: record.x + 4 }, 30, () => 0, WORLD_SEED),
        building.id,
      ).toHaveLength(1);
    }
  });

  it('opens the doorway of each walk-in building, keeps its walls, and seals the rest', () => {
    for (const building of BUILDINGS) {
      const anchor = { x: building.placement.x, z: building.placement.z };
      const walls = rectOf(building, building.footprint);
      const door = toModelAxes(building, building.frontStandingPoint);
      // one stride inside the front wall, on the door's own line, asked for a
      // body standing on the ground there (the lintel and the storey above a
      // doorway are overhead, not in its way)
      const inside = localToWorld(anchor, building.placement.rotation, door.x, walls.z0 + 1);
      const standing = { y: groundHeight(inside.x, inside.z, WORLD_SEED), lift: 0 };
      expect(
        isBlocked(WORLD_SEED, inside.x, inside.z, 0.5, false, undefined, 0, standing),
        `${building.id} doorway`,
      ).toBe(!building.walkIn);
      const front = building.frontStandingPoint;
      expect(isBlocked(WORLD_SEED, front.x, front.z), `${building.id} front`).toBe(false);
      for (const annex of building.annexes) {
        expect(isBlocked(WORLD_SEED, annex.center.x, annex.center.z), annex.id).toBe(true);
      }
      // the back wall still stands, straight across from the door
      const back = localToWorld(anchor, building.placement.rotation, door.x, walls.z1 - 0.1);
      expect(isBlocked(WORLD_SEED, back.x, back.z), `${building.id} back wall`).toBe(true);
    }
  });

  it('does not wall off the open ground beside the chapel tower', () => {
    const chapel = BUILDINGS.find((building) => building.id === 'eastbrook_chapel');
    if (!chapel) throw new Error('missing chapel');
    const anchor = { x: chapel.placement.x, z: chapel.placement.z };
    // behind the tower, off the nave wall and its buttresses, under the eaves' reach
    const open = localToWorld(anchor, chapel.placement.rotation, 12, 2);
    const reach = rectOf(chapel, chapel.reach);
    const local = toModelAxes(chapel, open);
    expect(local.x).toBeLessThan(reach.x1);
    expect(isBlocked(WORLD_SEED, open.x, open.z)).toBe(false);
  });
});

describe('walking into the walk-in Eastbrook buildings', () => {
  const insideBy = (building: Building, depth: number) => {
    const walls = rectOf(building, building.footprint);
    const door = toModelAxes(building, building.frontStandingPoint);
    return localToWorld(
      { x: building.placement.x, z: building.placement.z },
      building.placement.rotation,
      door.x,
      walls.z0 + depth,
    );
  };

  it('raises the ground to the floor inside each walk-in building, and nowhere else', () => {
    for (const building of BUILDINGS) {
      const inside = insideBy(building, 2);
      const rise =
        groundHeight(inside.x, inside.z, WORLD_SEED) -
        terrainHeight(inside.x, inside.z, WORLD_SEED);
      if (building.walkIn) {
        // the painted floors stand a step to most of a yard over the ground line
        expect(rise, `${building.id} floor`).toBeGreaterThan(0.25);
        expect(rise, `${building.id} floor`).toBeLessThan(1.5);
      } else {
        expect(rise, `${building.id} floor`).toBe(0);
      }
      // four strides out of the door the street is the plain ground again
      const street = insideBy(building, -4);
      expect(groundHeight(street.x, street.z, WORLD_SEED), `${building.id} street`).toBe(
        terrainHeight(street.x, street.z, WORLD_SEED),
      );
    }
  });

  it('walks a player from the street through each open door onto its floor', () => {
    const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior' });
    const body = sim.player;
    const meta = sim.players.get(body.id);
    if (!meta) throw new Error('missing player meta');
    for (const building of BUILDINGS.filter((candidate) => candidate.walkIn)) {
      const start = building.frontStandingPoint;
      const goal = insideBy(building, 3);
      body.pos.x = start.x;
      body.pos.z = start.z;
      body.pos.y = groundHeight(start.x, start.z, WORLD_SEED);
      body.prevPos = { ...body.pos };
      body.facing = Math.atan2(goal.x - start.x, goal.z - start.z);
      for (let i = 0; i < 20 * 2; i++) {
        Object.assign(meta.moveInput, {
          forward: true,
          back: false,
          turnLeft: false,
          turnRight: false,
          strafeLeft: false,
          strafeRight: false,
          jump: false,
          dive: false,
          surface: false,
        });
        sim.tick();
      }
      Object.assign(meta.moveInput, { forward: false });
      for (let i = 0; i < 20; i++) sim.tick();
      const walls = rectOf(building, building.footprint);
      const local = toModelAxes(building, body.pos);
      expect(local.z, `${building.id}: got past the door`).toBeGreaterThan(walls.z0 + 1.5);
      expect(local.x, building.id).toBeGreaterThan(walls.x0);
      expect(local.x, building.id).toBeLessThan(walls.x1);
      // standing on the raised floor, not sunk to the ground line under it
      expect(body.pos.y, building.id).toBeCloseTo(
        groundHeight(body.pos.x, body.pos.z, WORLD_SEED),
        3,
      );
      expect(body.pos.y - terrainHeight(body.pos.x, body.pos.z, WORLD_SEED)).toBeGreaterThan(0.25);

      // and back out: turned round, the same door lets them down onto the street
      body.facing = Math.atan2(start.x - body.pos.x, start.z - body.pos.z);
      for (let i = 0; i < 20 * 2; i++) {
        Object.assign(meta.moveInput, { forward: true });
        sim.tick();
      }
      Object.assign(meta.moveInput, { forward: false });
      for (let i = 0; i < 20; i++) sim.tick();
      const out = toModelAxes(building, body.pos);
      expect(out.z, `${building.id}: got back out of the door`).toBeLessThan(walls.z0 - 1);
      expect(body.pos.y, `${building.id}: down on the street`).toBeCloseTo(
        terrainHeight(body.pos.x, body.pos.z, WORLD_SEED),
        3,
      );
    }
  });
});

describe('the ground under the placed buildings', () => {
  it('carries the Studio rebuild map level pads, the last edits on their ground', () => {
    const pads = EASTBROOK_BUILDING_PAD_TERRAIN_EDITS;
    // Highwatch's pads come after them in both lists, on the Thornpeak shelf
    // far to the north, where no Eastbrook pad reaches
    const highwatchPads = HIGHWATCH_LAYOUT.pads.length;
    for (const pad of HIGHWATCH_LAYOUT.pads) {
      for (const own of pads) {
        expect(Math.hypot(pad.x - own.x, pad.z - own.z)).toBeGreaterThan(
          pad.radius + own.radius + 100,
        );
      }
    }
    expect(REBUILD_MAP.terrainEdits.slice(-highwatchPads)).toEqual(HIGHWATCH_LAYOUT.pads);
    const mapPads = REBUILD_MAP.terrainEdits.slice(-pads.length - highwatchPads, -highwatchPads);
    expect(pads).toHaveLength(BUILDINGS.length);
    // the smithy's, the tavern's, the shop's and the bank's are the map's own
    for (const index of [1, 2, 3, 4]) {
      const mapPad = mapPads[index];
      expect(pads[index], `pad ${index}`).toEqual({
        x: mapPad.x,
        z: mapPad.z,
        radius: mapPad.radius,
        delta: mapPad.delta,
        falloff: 'smooth',
        mode: 'level',
        hardness: mapPad.hardness,
      });
    }
    // The chapel's keeps the map's centre and shelf height, drawn in so its
    // taper stops at the harbour bluff (the waterline test below).
    const chapelPad = pads[0];
    expect({ ...chapelPad, radius: 0, hardness: 0 }).toEqual({
      x: mapPads[0].x,
      z: mapPads[0].z,
      radius: 0,
      delta: mapPads[0].delta,
      falloff: 'smooth',
      mode: 'level',
      hardness: 0,
    });
    expect(chapelPad.radius).toBeLessThan(mapPads[0].radius);
    // The quay cottage's stamp is the one that is not the map's at all: same
    // shelf height, moved east and drawn in so it ends at the quay pad's east
    // edge.
    const cottagePad = pads[pads.length - 1];
    const mapCottagePad = mapPads[mapPads.length - 1];
    expect(cottagePad.mode).toBe('level');
    expect(cottagePad.delta).toBe(mapCottagePad.delta);
    expect(cottagePad.x - cottagePad.radius).toBeGreaterThanOrEqual(QUAY_PAD_EAST_EDGE);
    expect(cottagePad.radius).toBeLessThan(mapCottagePad.radius);
    const edits = BUILTIN_WORLD.terrainEdits ?? [];
    expect(edits.slice(-pads.length - highwatchPads, -highwatchPads)).toEqual(pads);
    expect(edits.slice(-highwatchPads)).toEqual(HIGHWATCH_LAYOUT.pads);
  });

  it('is level under each building, across its whole reach', () => {
    for (const building of BUILDINGS) {
      const seat = terrainHeight(building.placement.x, building.placement.z, WORLD_SEED);
      // The quay cottage stands half on the shelf and half over the fall to the
      // quay: its walls are measured, and its footing has to cover the drop.
      const onQuayEdge = building.id === 'eastbrook_quay_cottage';
      const box = onQuayEdge ? building.footprint : building.reach;
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
      // never above the ground line: nothing grows up through a floor (the
      // cottage's own stamp starts its taper inside the west end of its walls)
      expect(high - seat, `${building.id} high ground`).toBeLessThan(onQuayEdge ? 0.01 : 1e-6);
      const footing = -boundsOf(building).min[1] * building.placement.scale;
      expect(footing, `${building.id} footing`).toBeGreaterThan(1.25);
      if (onQuayEdge) {
        expect(seat - low, `${building.id} drop to the quay`).toBeGreaterThan(0.3);
        expect(seat - low, `${building.id} drop to the quay`).toBeLessThan(footing - 0.3);
      } else {
        expect(seat - low, `${building.id} low ground`).toBeLessThan(1e-6);
      }
    }
  });

  it('leaves the quay and the ground a new character first stands on exactly as they were', () => {
    expect(PLAYER_START).toEqual({ x: -94, z: -58 });
    expect(terrainHeight(PLAYER_START.x, PLAYER_START.z, WORLD_SEED)).toBe(-2);
    for (const pad of EASTBROOK_BUILDING_PAD_TERRAIN_EDITS) {
      expect(
        Math.hypot(pad.x - PLAYER_START.x, pad.z - PLAYER_START.z),
        `pad at ${pad.x}, ${pad.z}`,
      ).toBeGreaterThan(pad.radius);
    }
    // The quay's working pad, its boardwalk and the pier roots the ferry's
    // boarding stage is seated from: the same world without the building pads
    // has the same ground there, to the bit.
    const samples: { x: number; z: number; y: number }[] = [];
    for (let x = -130; x <= QUAY_PAD_EAST_EDGE; x += 2.5) {
      for (let z = -90; z <= -20; z += 2.5) {
        samples.push({ x, z, y: terrainHeight(x, z, WORLD_SEED) });
      }
    }
    const pads = new Set<unknown>(EASTBROOK_BUILDING_PAD_TERRAIN_EDITS);
    setActiveWorldContent({
      ...BUILTIN_WORLD,
      terrainEdits: (BUILTIN_WORLD.terrainEdits ?? []).filter((edit) => !pads.has(edit)),
    });
    try {
      for (const sample of samples) {
        expect(terrainHeight(sample.x, sample.z, WORLD_SEED), `${sample.x}, ${sample.z}`).toBe(
          sample.y,
        );
      }
    } finally {
      setActiveWorldContent(null);
    }
  });

  it('leaves the waterline where it was: no ground crosses the sea surface', () => {
    // A yard grid over the whole town and its shore, with and without the
    // building pads. Under the map's own chapel pad 300-odd half-yard cells of
    // seabed west of the chapel came up out of the water.
    const box = { minX: -110, maxX: 70, minZ: -160, maxZ: -30 };
    const sample = (): number[] => {
      const out: number[] = [];
      for (let x = box.minX; x <= box.maxX; x += 1) {
        for (let z = box.minZ; z <= box.maxZ; z += 1) out.push(terrainHeight(x, z, WORLD_SEED));
      }
      return out;
    };
    const withPads = sample();
    const pads = new Set<unknown>(EASTBROOK_BUILDING_PAD_TERRAIN_EDITS);
    setActiveWorldContent({
      ...BUILTIN_WORLD,
      terrainEdits: (BUILTIN_WORLD.terrainEdits ?? []).filter((edit) => !pads.has(edit)),
    });
    let withoutPads: number[];
    try {
      withoutPads = sample();
    } finally {
      setActiveWorldContent(null);
    }
    // the pads do move this ground (positive control), just never across the surface
    let moved = 0;
    let crossed = 0;
    withPads.forEach((y, index) => {
      if (y !== withoutPads[index]) moved++;
      if (y > WATER_LEVEL !== withoutPads[index] > WATER_LEVEL) crossed++;
    });
    expect(moved).toBeGreaterThan(1000);
    expect(crossed).toBe(0);
  });

  it('clears the scatter the rebuild map clears, and nothing grows on a building', () => {
    for (const key of REBUILD_MAP.decorationExclusions) {
      const [, x, z] = key.split(':');
      expect(isExcludedDecoration(Number(x), Number(z)), key).toBe(true);
    }
    const scatter = generateDecorationsInBounds(WORLD_SEED, {
      minX: -110,
      maxX: 70,
      minZ: -150,
      maxZ: -20,
    });
    expect(scatter.length).toBeGreaterThan(20);
    for (const decoration of scatter) {
      for (const building of BUILDINGS) {
        const local = toModelAxes(building, decoration);
        const reach = rectOf(building, building.reach);
        const within =
          local.x > reach.x0 - 0.5 &&
          local.x < reach.x1 + 0.5 &&
          local.z > reach.z0 - 0.5 &&
          local.z < reach.z1 + 0.5;
        expect(
          within,
          `${decoration.kind} at ${decoration.x.toFixed(2)}, ${decoration.z.toFixed(2)} on ${building.id}`,
        ).toBe(false);
      }
    }
  });

  it('keeps the road lamp off the smithy door step', () => {
    const smithy = BUILDINGS.find((building) => building.id === 'eastbrook_smithy');
    if (!smithy) throw new Error('missing smithy');
    expect(isExcludedStreetlamp(-33.44783716157823, -103.6111100755925)).toBe(true);
    for (const lamp of streetlampPlacements(WORLD_SEED)) {
      expect(
        Math.hypot(lamp.x - smithy.frontStandingPoint.x, lamp.z - smithy.frontStandingPoint.z),
      ).toBeGreaterThan(3);
      for (const building of BUILDINGS) {
        const local = toModelAxes(building, lamp);
        const reach = rectOf(building, building.reach);
        const within =
          local.x > reach.x0 && local.x < reach.x1 && local.z > reach.z0 && local.z < reach.z1;
        expect(within, `lamp at ${lamp.x.toFixed(2)}, ${lamp.z.toFixed(2)} in ${building.id}`).toBe(
          false,
        );
      }
    }
  });
});

describe('the placed building draw', () => {
  let restoreGfx: (() => void) | null = null;
  afterEach(() => {
    restoreGfx?.();
    restoreGfx = null;
  });
  const setStandardMaterials = (value: boolean): void => {
    restoreGfx?.();
    restoreGfx = gfxInternalsForTest.overrideSettings({ standardMaterials: value });
  };

  /** A stand-in model: a shell with one yard of footing below its ground
   *  line, a lit pane, a leaf card, and furniture under an interior group. */
  function fixtureModel(): THREE.Group {
    const source = new THREE.Group();
    const walls = new THREE.MeshStandardMaterial({ color: 0x8899aa });
    walls.name = 'painted_walls@fixture';
    walls.emissive = new THREE.Color(0xffffff);
    walls.emissiveIntensity = 1;
    const shell = new THREE.Mesh(new THREE.BoxGeometry(6, 5, 4).translate(1, 1.5, 0), walls);
    shell.name = 'shell';
    source.add(shell);
    const leaves = new THREE.MeshStandardMaterial({
      color: 0x55aa55,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    });
    leaves.name = 'Leaves_dg_bloom';
    source.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0, 1, 2.1), leaves));
    const interior = new THREE.Group();
    interior.name = 'G_INT_furniture';
    const table = new THREE.MeshStandardMaterial({ color: 0x664422 });
    table.name = 'painted_props@fixture';
    const tableMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), table);
    tableMesh.name = 'table';
    interior.add(tableMesh);
    source.add(interior);
    return source;
  }

  const smithy = (): Building => {
    const found = BUILDINGS.find((building) => building.id === 'eastbrook_smithy');
    if (!found) throw new Error('missing smithy');
    return found;
  };

  it('stands the model at its own anchor, at one uniform size, with its footing buried', () => {
    setDitherFadeEnabledForTest(false);
    setStandardMaterials(true);
    const building = smithy();
    const built = buildEastbrookPlacedBuilding(building, fixtureModel(), () => 3);
    const { group } = built;
    expect(group.name).toBe('eastbrookBuilding:eastbrook_smithy');
    expect(group.position.x).toBe(building.placement.x);
    expect(group.position.z).toBe(building.placement.z);
    expect(group.rotation.y).toBe(building.placement.rotation);
    // the fixture's lowest point is one yard under its ground line
    expect(group.position.y).toBeCloseTo(
      3 + 1 * building.placement.scale + building.placement.lift,
      10,
    );
    const wrap = group.children[0];
    expect(wrap.scale.toArray()).toEqual([
      building.placement.scale,
      building.placement.scale,
      building.placement.scale,
    ]);
    // the model is not recentred: its origin IS the anchor
    expect(wrap.position.toArray()).toEqual([0, 0, 0]);
    expect(wrap.children[0].position.toArray()).toEqual([0, 0, 0]);
    expect(group.userData.assetUrl).toBe(building.assetId);
    expect(group.userData.foundationDepth).toBe(0);
    expect(built.topY).toBe(3 + building.nativeDimensions.height);
    // the cull radius reaches the model's farthest corner from the record centre
    for (const [sx, sz] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const corner = localToWorld(
        building.reach.center,
        building.reach.rotation,
        sx * building.reach.halfWidth,
        sz * building.reach.halfDepth,
      );
      expect(
        Math.hypot(corner.x - building.position.x, corner.z - building.position.z),
      ).toBeLessThanOrEqual(built.cullRadius + 1e-9);
    }
  });

  it('clones every material, lifts a weak glow, and keeps furniture out of the shadow pass', () => {
    setDitherFadeEnabledForTest(false);
    setStandardMaterials(true);
    const source = fixtureModel();
    const sourceMaterials = new Set<THREE.Material>();
    source.traverse((object) => {
      if (object instanceof THREE.Mesh) sourceMaterials.add(object.material as THREE.Material);
    });
    const built = buildEastbrookPlacedBuilding(smithy(), source, () => 0);
    const meshes: THREE.Mesh[] = [];
    built.group.traverse((object) => {
      if (object instanceof THREE.Mesh) meshes.push(object);
    });
    expect(meshes).toHaveLength(3);
    for (const mesh of meshes) {
      expect(sourceMaterials.has(mesh.material as THREE.Material), mesh.name).toBe(false);
      expect(mesh.receiveShadow).toBe(true);
      expect(mesh.castShadow, mesh.name).toBe(mesh.name !== 'table');
    }
    // one fade record per material, so the camera ghost covers the whole building
    expect(built.mats).toHaveLength(3);
    const walls = meshes.find((mesh) => mesh.name === 'shell')
      ?.material as THREE.MeshStandardMaterial;
    expect(walls.emissiveIntensity).toBe(PLACED_BUILDING_EMISSIVE_FLOOR);
    // the shared source is never written
    const sourceWalls = [...sourceMaterials].find((material) =>
      material.name.startsWith('painted_walls'),
    );
    expect((sourceWalls as THREE.MeshStandardMaterial).emissiveIntensity).toBe(1);
  });

  it('leaves an unlit or already bright material at its authored level', () => {
    setStandardMaterials(true);
    const dark = new THREE.MeshStandardMaterial({ color: 0x333333 });
    expect((placedBuildingMaterial(dark) as THREE.MeshStandardMaterial).emissiveIntensity).toBe(1);
    const bright = new THREE.MeshStandardMaterial({ emissive: 0xffffff, emissiveIntensity: 3 });
    expect((placedBuildingMaterial(bright) as THREE.MeshStandardMaterial).emissiveIntensity).toBe(
      3,
    );
  });

  it('clones exactly as the camera fade twin is cloned, so the fade links no new program', () => {
    setStandardMaterials(true);
    // A loader-owned shader layer the clone-hook registry does not carry (the
    // leaf cards' edge fade). The gate's twin is minted through the same
    // hook-preserving clone, so the building's material must be too: a hook
    // copied by hand would put the building on a program its twin never links.
    const leaves = new THREE.MeshStandardMaterial({ alphaTest: 0.5, side: THREE.DoubleSide });
    const hook = (shader: { fragmentShader: string }): void => {
      shader.fragmentShader = shader.fragmentShader.replace('void main', 'void main');
    };
    leaves.onBeforeCompile = hook as unknown as THREE.Material['onBeforeCompile'];
    leaves.customProgramCacheKey = () => 'leaf-edge-fade';
    const clone = placedBuildingMaterial(leaves);
    const twinStyle = cloneMaterialWithHooks(leaves);
    expect(clone.customProgramCacheKey()).toBe(twinStyle.customProgramCacheKey());
    expect(clone.onBeforeCompile).not.toBe(leaves.onBeforeCompile);
    // the cutout is the material's own and survives the clone
    expect(clone.alphaTest).toBe(0.5);
    expect(clone.side).toBe(THREE.DoubleSide);
  });

  it('downgrades to Lambert on the low tiers without losing a cutout or a glow', () => {
    setStandardMaterials(false);
    const leaves = new THREE.MeshStandardMaterial({
      color: 0x55aa55,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      vertexColors: true,
    });
    leaves.name = 'Leaves_dg_bloom';
    const low = placedBuildingMaterial(leaves);
    expect(low).toBeInstanceOf(THREE.MeshLambertMaterial);
    expect(low.name).toBe('Leaves_dg_bloom');
    expect(low.alphaTest).toBe(0.5);
    expect(low.side).toBe(THREE.DoubleSide);
    expect(low.vertexColors).toBe(true);
    const glow = new THREE.MeshStandardMaterial({ emissive: 0xffcc88, emissiveIntensity: 2.2 });
    const lowGlow = placedBuildingMaterial(glow) as THREE.MeshLambertMaterial;
    expect(lowGlow.emissive.getHex()).toBe(0xffcc88);
    expect(lowGlow.emissiveIntensity).toBe(2.2);
  });
});

describe('the placed buildings in a Studio document', () => {
  it('convert back into the placements the rebuild map carries', () => {
    const placements = authoredTownBuildingPlacements(WORLD_SEED);
    for (const building of BUILDINGS) {
      const assetId = assetIdOf(building);
      const converted = placements.find((placement) => placement.assetId === assetId);
      const placed = mapPlacementOf(building);
      expect(converted, assetId).toBeDefined();
      expect(converted?.x).toBe(placed.x);
      expect(converted?.z).toBe(placed.z);
      expect(converted?.y).toBe(placed.y);
      expect(Math.abs((converted?.rotY ?? 0) - (placed.rotY ?? 0))).toBeLessThan(1e-4);
      expect(Math.abs((converted?.scale ?? 0) - (placed.scale ?? 0))).toBeLessThan(2e-4);
      expect(converted?.collide).toBe(true);
      expect(converted?.collisionMode).toBe('baked');
      // one uniform scale: no per-axis fit
      expect(converted?.scaleX).toBeUndefined();
      expect(converted?.scaleZ).toBeUndefined();
    }
  });
});
