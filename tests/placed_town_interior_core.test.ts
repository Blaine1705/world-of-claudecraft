import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { highwatchTownInternalsForTest } from '../src/render/highwatch_town';
import {
  activeCameraInterior,
  clampChaseCameraToInterior,
  interiorCameraInternalsForTest,
  interiorLensInAir,
  registerCameraInterior,
} from '../src/render/interior_camera';
import {
  type CameraInterior,
  interiorCameraPadding,
  interiorContains,
  interiorHoldsEye,
} from '../src/render/interior_camera_core';
import {
  type PlacedTownInteriorBuilding,
  placedTownCameraInterior,
  placedTownInteriorModels,
  placedTownModelName,
} from '../src/render/placed_town_interior_core';
import { bakedBoxesForPath } from '../src/sim/asset_collision';
import { buildingRecordColliders } from '../src/sim/authored_town_buildings';
import { type Collider, rotY } from '../src/sim/collider_shapes';
import { emitPlacementBoxes } from '../src/sim/colliders_authored/placement_colliders';
import { BUILTIN_WORLD, getActiveWorldContent, setActiveWorldContent } from '../src/sim/data';
import { EASTBROOK_LAYOUT } from '../src/sim/eastbrook_layout';
import { FENBRIDGE_LAYOUT } from '../src/sim/fenbridge_layout';
import { HIGHWATCH_LAYOUT } from '../src/sim/highwatch_layout';
import { distancePointToObb, localToWorld } from '../src/sim/placed_town_kit';
import { placementRampFloorAt } from '../src/sim/placement_ramps';
import type { PlacedAsset, WorldContent } from '../src/sim/types';
import { groundHeight, terrainHeight } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

// The air of the walk-in painted buildings (src/render/placed_town_interior_core.ts),
// registered with the indoor camera (src/render/interior_camera.ts) by every town view that
// stands them (src/render/placed_town_interiors.ts), so walking into an inn, a chapel, a bank,
// a shop or a smithy the camera follows in through the door and then keeps to the rooms, the
// way it does in the Mirefen tavern. The first blocks pin grand Highwatch; the last two pin
// every model at any scale and turn, and every walk-in building of Eastbrook, Fenbridge and
// Highwatch at the scale and spot its layout gives it today.

const BUILDINGS = HIGHWATCH_LAYOUT.buildings;
type Building = (typeof BUILDINGS)[number];
const WALK_IN = BUILDINGS.filter((building) => building.walkIn);

/** A town's placed building record, as the town views and the air read it. */
interface TownBuilding extends PlacedTownInteriorBuilding {
  readonly placement: PlacedTownInteriorBuilding['placement'] & { readonly modelSize: number };
  readonly frontStandingPoint: { readonly x: number; readonly z: number };
}

/** The built-in towns that stand painted buildings, with their records. */
const TOWN_BUILDINGS: readonly (readonly [string, readonly TownBuilding[]])[] = [
  ['Eastbrook', EASTBROOK_LAYOUT.buildings],
  ['Fenbridge', FENBRIDGE_LAYOUT.buildings],
  ['Highwatch', HIGHWATCH_LAYOUT.buildings],
];

afterEach(() => {
  interiorCameraInternalsForTest.reset();
  setActiveWorldContent(null);
});

function airOf(building: Building) {
  const ground = terrainHeight(building.placement.x, building.placement.z, WORLD_SEED);
  const air = placedTownCameraInterior(building, ground);
  if (!air) throw new Error(`no air for ${building.id}`);
  return air;
}

/** A point `depth` yards in from the door along the building's own axis. */
function inside(building: Building, depth: number) {
  const door = building.sockets.entrance.localPosition;
  return localToWorld(building.placement, building.rotation, door.x, door.z + depth);
}

describe('the air of a walk-in placed building', () => {
  it('stands for every walk-in Highwatch building, never for the sealed watch house', () => {
    expect(WALK_IN.map((building) => placedTownModelName(building.assetId))).toEqual([
      'tavern_b',
      'hall',
      'shop_a',
      'smithy',
    ]);
    for (const name of WALK_IN.map((building) => placedTownModelName(building.assetId))) {
      expect(placedTownInteriorModels()).toContain(name);
    }
    for (const building of WALK_IN) {
      const air = airOf(building);
      expect(air.id).toBe(`placed_town:${building.id}`);
      // the stable Mirefen framing: walls shorten the boom, never swing the view
      expect(air.framing).toBe('preserve-angle');
    }
    const watch = BUILDINGS.find((building) => building.id === 'highwatch_watch_house');
    if (!watch) throw new Error('no watch house');
    expect(placedTownCameraInterior(watch, 9)).toBeNull();
    // a record turned off the quarter turns gets none (the air is world axis-aligned)
    const inn = WALK_IN[0];
    expect(
      placedTownCameraInterior({ ...inn, placement: { ...inn.placement, rotation: 0.3 } }, 9),
    ).toBeNull();
  });

  it('opens at the door, a grand one, and holds the eye only past the threshold', () => {
    for (const building of WALK_IN) {
      const air = airOf(building);
      const front = air.openings[0];
      const box = air.boxes[front.box];
      const floorY = box[2];
      // the door's middle is on the record's entrance socket: square across the wall, and
      // no deeper than the wall's own thickness off its face
      const door = building.sockets.entrance.position;
      const across =
        front.axis === 0 ? (box[4] + box[5]) / 2 - door.z : (box[0] + box[1]) / 2 - door.x;
      const deep =
        front.axis === 0 ? (box[0] + box[1]) / 2 - door.x : (box[4] + box[5]) / 2 - door.z;
      expect(Math.abs(across), building.id).toBeLessThan(0.01);
      expect(Math.abs(deep), building.id).toBeLessThan(1);
      // the opening faces the standing point outside it
      const facing = building.frontStandingPoint;
      const centre = { x: (box[0] + box[1]) / 2, z: (box[4] + box[5]) / 2 };
      const outward = front.axis === 0 ? facing.x - centre.x : facing.z - centre.z;
      expect(Math.sign(outward), building.id).toBe(front.side);
      // grand: every door clears about five yards over its floor (a player stands 2.6)
      const head = box[3] - floorY;
      expect(head, `${building.id} door head`).toBeGreaterThan(4.5);
      expect(head, `${building.id} door head`).toBeLessThan(6.2);
      // the floor is the building's own deck, a hand over its pad
      const ground = terrainHeight(building.placement.x, building.placement.z, WORLD_SEED);
      expect(floorY - ground, building.id).toBeGreaterThan(0.4);
      expect(floorY - ground, building.id).toBeLessThan(1.2);
      // the eye on the door step is outdoors; three yards in it is indoors
      expect(interiorHoldsEye(air, facing.x, floorY + 2, facing.z), building.id).toBe(false);
      const room = inside(building, 3);
      expect(interiorHoldsEye(air, room.x, floorY + 2, room.z), building.id).toBe(true);
      // ...and every piece of air stands inside the building's ground
      for (const piece of air.boxes) {
        for (const [x, z] of [
          [piece[0], piece[4]],
          [piece[1], piece[5]],
        ]) {
          expect(distancePointToObb({ x, z }, building.reach), building.id).toBeLessThan(0.01);
        }
      }
    }
  });

  it('rooms are roomy: more than five yards of air over the floor', () => {
    for (const building of WALK_IN) {
      const air = airOf(building);
      const room = air.boxes[0];
      expect(room[3] - room[2], building.id).toBeGreaterThan(5.4);
    }
  });

  it('walks a player in through each door with the camera following and keeping inside', () => {
    for (const building of WALK_IN) {
      interiorCameraInternalsForTest.reset();
      const air = airOf(building);
      registerCameraInterior(air);
      const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.2, 950);
      const start = localToWorld(
        building.placement,
        building.rotation,
        building.sockets.entrance.localPosition.x,
        building.sockets.entrance.localPosition.z - 8,
      );
      const end = inside(building, 3.5);
      const steps = 240;
      const pitch = 0.45;
      const dist = 12;
      let indoors = 0;
      for (let i = 0; i <= steps + 120; i++) {
        const t = Math.min(1, i / steps);
        const x = start.x + (end.x - start.x) * t;
        const z = start.z + (end.z - start.z) * t;
        const self = new THREE.Vector3(x, groundHeight(x, z, WORLD_SEED), z);
        const look = new THREE.Vector3(x, self.y + 2, z);
        // the chase camera behind the player, along the way in
        const back = { x: start.x - end.x, z: start.z - end.z };
        const len = Math.hypot(back.x, back.z);
        camera.position.set(
          x + (back.x / len) * Math.cos(pitch) * dist,
          look.y + Math.sin(pitch) * dist,
          z + (back.z / len) * Math.cos(pitch) * dist,
        );
        clampChaseCameraToInterior(camera, look, self, 1 / 60, false);
        if (activeCameraInterior()) indoors++;
      }
      expect(indoors, building.id).toBeGreaterThan(60);
      expect(activeCameraInterior()?.id, building.id).toBe(air.id);
      // standing inside, the lens has come in to the room's air
      expect(interiorLensInAir(), building.id).toBe(true);
      const c = camera.position;
      expect(interiorContains(air, c.x, c.y, c.z), building.id).toBe(true);
    }
  });
});

describe('the placed-town view registers the air', () => {
  function fixtureSources(): Map<string, THREE.Object3D> {
    const kit = highwatchTownInternalsForTest.kit;
    return new Map(
      kit.urls.map((url) => {
        const source = new THREE.Group();
        source.add(
          new THREE.Mesh(
            new THREE.BoxGeometry(6, 5, 4).translate(0, 1.5, 0),
            new THREE.MeshBasicMaterial(),
          ),
        );
        return [url, source];
      }),
    );
  }

  it('registers each walk-in building when the view builds, and drops them with it', () => {
    const kit = highwatchTownInternalsForTest.kit;
    const ids = () => interiorCameraInternalsForTest.interiors().map((vol) => vol.id);
    kit.buildFromSources(fixtureSources(), () => 9, true);
    expect(ids()).toEqual(WALK_IN.map((building) => `placed_town:${building.id}`));
    // a rebuild replaces them, never doubles them
    kit.buildFromSources(fixtureSources(), () => 9, true);
    expect(ids()).toHaveLength(WALK_IN.length);
    // a document that owns the buildings as placements keeps no town air
    setActiveWorldContent({
      ...BUILTIN_WORLD,
      promotedScenery: { highwatchTown: true },
    } as WorldContent);
    kit.buildFromSources(fixtureSources(), () => 9, true);
    expect(ids()).toEqual([]);
    setActiveWorldContent(null);
    kit.buildFromSources(fixtureSources(), () => 9, true);
    // ...nor does a world without the town
    kit.buildFromSources(new Map(), () => 0, false);
    expect(ids()).toEqual([]);
  });
});

/** Whether a baked wall's footprint holds the world point (x, z). */
function footprintHolds(c: Collider, x: number, z: number): boolean {
  if (c.type !== 'obb') return false;
  const local = rotY(x - c.x, z - c.z, -c.rot);
  return Math.abs(local.x) <= c.hw && Math.abs(local.z) <= c.hd;
}

/** Whether a baked wall holds the world point (x, y, z): its footprint and its band. */
function wallHolds(c: Collider, x: number, y: number, z: number): boolean {
  return footprintHolds(c, x, z) && y >= (c.baseY ?? -Infinity) && y <= (c.moveTopY ?? Infinity);
}

/** An opening's box, the middle of its outside face and the way in (a unit step, world). */
function doorway(air: CameraInterior, index = 0) {
  const o = air.openings[index];
  const box = air.boxes[o.box];
  const across = o.axis === 0 ? 2 : 0;
  const face = o.side > 0 ? box[o.axis * 2 + 1] : box[o.axis * 2];
  const mid = (box[across * 2] + box[across * 2 + 1]) / 2;
  return {
    box,
    across,
    x: o.axis === 0 ? face : mid,
    z: o.axis === 2 ? face : mid,
    inX: o.axis === 0 ? -o.side : 0,
    inZ: o.axis === 2 ? -o.side : 0,
  };
}

describe('the authored air against each model baked collision', () => {
  // The largest dimension of each model at authored size, measured off the shipped GLB: the
  // placed-asset unit (a baked row is stored in multiples of it over 2.2), and the number the
  // towns' records carry as placement.modelSize.
  const MODEL_SIZE: Readonly<Record<string, number>> = {
    tavern_b: 30.262,
    tavern: 22.6483,
    bank: 22.6067,
    hall: 30.4998,
    shop_a: 16.2797,
    shop_b: 18.7,
    smithy: 19.797,
  };
  // the sizes the towns stand the models at (authored size, and the grand towns' 1.2 to 1.5),
  // at every quarter turn
  const SCALES = [1, 1.3, 1.5];
  const TURNS = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  /** The ground under a probe building's anchor. */
  const GROUND = 7.25;
  /** The tall pieces a room's air is cut round, each named by a point inside its baked box at
   *  authored size (x, y over the ground line, z): the lens never stands in one. */
  const CUT_ROUND: Readonly<
    Record<string, readonly (readonly [string, number, number, number])[]>
  > = {
    tavern_b: [['the chimney breast', -11.8, 2.5, -1]],
    tavern: [
      ['the chimney breast', -8.8, 2.5, 0],
      ['the back-bar shelves', -2.4, 2, 5.4],
      ['the back-bar shelves', 2.4, 2, 5.4],
    ],
    bank: [
      ['a pillar', -4.6, 2.5, -2.2],
      ['a pillar', 4.6, 2.5, -2.2],
    ],
    shop_a: [['the back shelves', 0, 2, 3.55]],
    shop_b: [['the back shelves', -0.6, 2, 3.85]],
    smithy: [['the forge hearth', -4.4, 2, 0]],
  };

  /**
   * One model stood the way a town stands it, at `scale` and `turn` on GROUND: its camera air,
   * and the same building as the sim stands it (sim/town_walk_in.ts walkInPlacementFor) on the
   * same ground: its baked walls (the emitter the town's record collides on) and the deck the
   * sim walks at a point.
   */
  function stand(name: string, scale: number, turn: number) {
    const placement = { x: 31.5, z: -48.25, rotation: turn, scale, lift: -(scale + 0.05) };
    const record = {
      id: `probe_${name}`,
      assetId: `/models/tidehold/${name}.glb`,
      walkIn: true,
      placement,
    };
    const air = placedTownCameraInterior(record, GROUND);
    if (!air) throw new Error(`no air for ${name}`);
    const size = MODEL_SIZE[name];
    if (size === undefined) throw new Error(`no model size for ${name}`);
    const asset: PlacedAsset = {
      path: record.assetId,
      x: placement.x,
      z: placement.z,
      rotY: turn,
      scale: (scale * size) / 2.2,
      y: placement.lift,
      collideRadius: 1,
      detached: true,
      groundY: GROUND,
    };
    const baked = bakedBoxesForPath(asset.path);
    if (!baked) throw new Error(`no baked collision for ${name}`);
    const walls: Collider[] = [];
    emitPlacementBoxes(walls, asset, baked, GROUND);
    const content = { placements: [asset] } as unknown as WorldContent;
    const lineY = GROUND + scale + placement.lift;
    return {
      air,
      walls,
      deckAt: (x: number, z: number) => placementRampFloorAt(content, WORLD_SEED, x, z),
      /** A point in the model's own axes at authored size, in the world. */
      world: (x: number, y: number, z: number) => ({
        ...localToWorld(placement, turn, x * scale, z * scale),
        y: lineY + y * scale,
      }),
    };
  }

  function eachStanding(check: (name: string, scale: number, turn: number, at: string) => void) {
    for (const name of placedTownInteriorModels()) {
      for (const scale of SCALES) {
        for (const turn of TURNS) check(name, scale, turn, `${name} at ${scale}, turned ${turn}`);
      }
    }
  }

  it('stands every room on its deck and every doorway under its lintel, between its jambs', () => {
    eachStanding((name, scale, turn, at) => {
      const { air, walls, deckAt } = stand(name, scale, turn);
      const room = air.boxes[0];
      // the room's floor is the deck the sim walks under its middle
      const middle = deckAt((room[0] + room[1]) / 2, (room[4] + room[5]) / 2);
      expect(Math.abs(middle - room[2]), at).toBeLessThan(0.01);
      for (let index = 0; index < air.openings.length; index++) {
        const door = doorway(air, index);
        const box = door.box;
        const floor = box[2];
        // a hand into the wall from the doorway's outside face (a tenth of a yard out from
        // the wall's own, at authored size)
        const into = 0.3 * scale;
        const point = (across: number) =>
          door.across === 0
            ? { x: across, z: door.z + door.inZ * into }
            : { x: door.x + door.inX * into, z: across };
        const lo = box[door.across * 2];
        const hi = box[door.across * 2 + 1];
        const mid = point((lo + hi) / 2);
        // the doorway stands on the deck the sim walks through it
        expect(Math.abs(deckAt(mid.x, mid.z) - floor), at).toBeLessThan(0.01);
        // its head is the lowest baked box over its middle, in the wall
        const over = walls.filter(
          (c) => footprintHolds(c, mid.x, mid.z) && (c.baseY ?? -Infinity) > floor + 1,
        );
        expect(Math.min(...over.map((c) => c.baseY ?? Infinity)), at).toBeCloseTo(box[3], 1);
        // under it the doorway is open edge to edge, and its jambs are the wall either side
        const y = floor + Math.min(1.5 * scale, (box[3] - floor) / 2);
        for (const across of [lo + 0.05 * scale, (lo + hi) / 2, hi - 0.05 * scale]) {
          const p = point(across);
          expect(
            walls.some((c) => wallHolds(c, p.x, y, p.z)),
            `${at}: open at ${across}`,
          ).toBe(false);
        }
        for (const across of [lo - 0.15 * scale, hi + 0.15 * scale]) {
          const p = point(across);
          expect(
            walls.some((c) => wallHolds(c, p.x, y, p.z)),
            `${at}: jamb at ${across}`,
          ).toBe(true);
        }
      }
    });
  });

  it('keeps every room clear of the hearths, shelves and pillars it is cut round', () => {
    eachStanding((name, scale, turn, at) => {
      const { air, walls, world } = stand(name, scale, turn);
      for (const [what, x, y, z] of CUT_ROUND[name] ?? []) {
        const p = world(x, y, z);
        const solid = walls.filter((c) => wallHolds(c, p.x, p.y, p.z));
        expect(solid.length, `${at}: ${what} is baked`).toBeGreaterThan(0);
        for (const c of solid) {
          if (c.type !== 'obb') continue;
          const cos = Math.abs(Math.cos(c.rot));
          const sin = Math.abs(Math.sin(c.rot));
          const ex = c.hw * cos + c.hd * sin;
          const ez = c.hw * sin + c.hd * cos;
          const [y0, y1] = [c.baseY ?? -Infinity, c.moveTopY ?? Infinity];
          for (const piece of air.boxes) {
            const overlaps =
              piece[0] < c.x + ex &&
              piece[1] > c.x - ex &&
              piece[2] < y1 &&
              piece[3] > y0 &&
              piece[4] < c.z + ez &&
              piece[5] > c.z - ez;
            expect(overlaps, `${at}: the air stands clear of ${what}`).toBe(false);
          }
        }
      }
    });
  });

  it('keeps each building one piece of air under the camera near-plane pad', () => {
    // the camera walks its ray through the pieces each shrunk by its pad: two pieces join only
    // where they overlap by more than both pads (the widest pad in play: a wide screen with the
    // field of view kicked out)
    const pad = interiorCameraPadding(0.2, 75, 21 / 9);
    eachStanding((name, scale, turn, at) => {
      const { air } = stand(name, scale, turn);
      const doors = new Set(air.openings.map((o) => o.box));
      const rooms = air.boxes.map((_, index) => index).filter((index) => !doors.has(index));
      const joined = (i: number, j: number) =>
        [0, 1, 2].every(
          (a) =>
            Math.min(air.boxes[i][a * 2 + 1], air.boxes[j][a * 2 + 1]) -
              Math.max(air.boxes[i][a * 2], air.boxes[j][a * 2]) >
            2 * pad,
        );
      const reached = new Set([0]);
      for (let grew = true; grew; ) {
        grew = false;
        for (const i of rooms) {
          if (reached.has(i) || ![...reached].some((j) => joined(i, j))) continue;
          reached.add(i);
          grew = true;
        }
      }
      expect(
        rooms.filter((index) => !reached.has(index)),
        at,
      ).toEqual([]);
    });
  });

  it('carries the model size every town record keeps for its walk-in buildings', () => {
    for (const [, buildings] of TOWN_BUILDINGS) {
      for (const building of buildings) {
        if (!building.walkIn) continue;
        const name = placedTownModelName(building.assetId);
        expect(building.placement.modelSize, building.id).toBeCloseTo(MODEL_SIZE[name], 2);
      }
    }
  });
});

describe('every walk-in painted building of the built-in towns', () => {
  const WALK_INS = TOWN_BUILDINGS.flatMap(([town, buildings]) =>
    buildings.filter((building) => building.walkIn).map((building) => ({ town, building })),
  );
  const groundAt = (x: number, z: number) => terrainHeight(x, z, WORLD_SEED);

  function townAir(building: TownBuilding) {
    const air = placedTownCameraInterior(
      building,
      groundAt(building.placement.x, building.placement.z),
    );
    if (!air) throw new Error(`no air for ${building.id}`);
    return air;
  }

  it('gives every walk-in building its rooms, and no sealed one any', () => {
    // every town stands walk-in painted buildings, so the list is never vacuous
    for (const [town, buildings] of TOWN_BUILDINGS) {
      expect(buildings.filter((building) => building.walkIn).length, town).toBeGreaterThan(1);
      for (const building of buildings) {
        const air = placedTownCameraInterior(
          building,
          groundAt(building.placement.x, building.placement.z),
        );
        if (!building.walkIn) {
          expect(air, `${town}: ${building.id}`).toBeNull();
          continue;
        }
        expect(air?.id, `${town}: ${building.id}`).toBe(`placed_town:${building.id}`);
        expect(air?.framing, `${town}: ${building.id}`).toBe('preserve-angle');
      }
    }
  });

  it('stands each room on the floor the sim walks and each front door under its own lintel', () => {
    const content = getActiveWorldContent();
    for (const { town, building } of WALK_INS) {
      const at = `${town}: ${building.id}`;
      const air = townAir(building);
      const room = air.boxes[0];
      const middle = { x: (room[0] + room[1]) / 2, z: (room[4] + room[5]) / 2 };
      expect(
        Math.abs(placementRampFloorAt(content, WORLD_SEED, middle.x, middle.z) - room[2]),
        at,
      ).toBeLessThan(0.01);
      // the record's own walls, as the sim collides on them (its baked walk-in walls)
      const def = content.props.buildings.find((candidate) => candidate.id === building.id);
      if (!def) throw new Error(`no props record for ${at}`);
      const walls = buildingRecordColliders(def, Infinity, groundAt, WORLD_SEED);
      const door = doorway(air);
      const into = 0.3 * building.placement.scale;
      const m = { x: door.x + door.inX * into, z: door.z + door.inZ * into };
      const over = walls.filter(
        (c) => footprintHolds(c, m.x, m.z) && (c.baseY ?? -Infinity) > door.box[2] + 1,
      );
      expect(Math.min(...over.map((c) => c.baseY ?? Infinity)), at).toBeCloseTo(door.box[3], 1);
      // the eye on the doorstep is outdoors; three yards past the threshold it is indoors
      const front = building.frontStandingPoint;
      const eyeY = door.box[2] + 2;
      expect(interiorHoldsEye(air, front.x, eyeY, front.z), at).toBe(false);
      const deep = air.thresholds[0] + 3;
      expect(
        interiorHoldsEye(air, door.x + door.inX * deep, eyeY, door.z + door.inZ * deep),
        at,
      ).toBe(true);
    }
  });

  it('walks a player in through each front door with the camera following and keeping inside', () => {
    for (const { town, building } of WALK_INS) {
      const at = `${town}: ${building.id}`;
      interiorCameraInternalsForTest.reset();
      const air = townAir(building);
      registerCameraInterior(air);
      const door = doorway(air);
      const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.2, 950);
      const start = { x: door.x - door.inX * 8, z: door.z - door.inZ * 8 };
      const depth = air.thresholds[0] + 3.5;
      const end = { x: door.x + door.inX * depth, z: door.z + door.inZ * depth };
      const steps = 240;
      const pitch = 0.45;
      const dist = 12;
      let indoors = 0;
      for (let i = 0; i <= steps + 120; i++) {
        const t = Math.min(1, i / steps);
        const x = start.x + (end.x - start.x) * t;
        const z = start.z + (end.z - start.z) * t;
        const self = new THREE.Vector3(x, groundHeight(x, z, WORLD_SEED), z);
        const look = new THREE.Vector3(x, self.y + 2, z);
        // the chase camera behind the player, along the way in
        camera.position.set(
          x - door.inX * Math.cos(pitch) * dist,
          look.y + Math.sin(pitch) * dist,
          z - door.inZ * Math.cos(pitch) * dist,
        );
        clampChaseCameraToInterior(camera, look, self, 1 / 60, false);
        if (activeCameraInterior()) indoors++;
      }
      expect(indoors, at).toBeGreaterThan(60);
      expect(activeCameraInterior()?.id, at).toBe(air.id);
      // standing inside, the lens has come in to the room's air
      expect(interiorLensInAir(), at).toBe(true);
      const c = camera.position;
      expect(interiorContains(air, c.x, c.y, c.z), at).toBe(true);
    }
  });
});
