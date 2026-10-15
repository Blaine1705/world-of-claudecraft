import { readFileSync } from 'node:fs';
import path from 'node:path';
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
import { interiorContains, interiorHoldsEye } from '../src/render/interior_camera_core';
import {
  placedTownCameraInterior,
  placedTownInteriorModels,
  placedTownModelAir,
  placedTownModelName,
} from '../src/render/placed_town_interior_core';
import { BUILTIN_WORLD, setActiveWorldContent } from '../src/sim/data';
import { HIGHWATCH_LAYOUT } from '../src/sim/highwatch_layout';
import { distancePointToObb, localToWorld } from '../src/sim/placed_town_kit';
import type { WorldContent } from '../src/sim/types';
import { groundHeight, terrainHeight } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

// The air of Highwatch's walk-in painted buildings (src/render/placed_town_interior_core.ts),
// registered with the indoor camera (src/render/interior_camera.ts) by the placed-town view,
// so walking into the grand inn, chapel, counting house, smithy or the manor the camera
// follows in through the door and then keeps to the rooms, the way it does in the Mirefen
// tavern.

const BUILDINGS = HIGHWATCH_LAYOUT.buildings;
type Building = (typeof BUILDINGS)[number];
const WALK_IN = BUILDINGS.filter((building) => building.walkIn);

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
      'manor',
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

describe('the authored air against each model baked collision', () => {
  interface Row {
    x: number;
    y: number;
    z: number;
    hx: number;
    hy: number;
    hz: number;
    ry?: number;
    y0?: number;
    y1?: number;
  }
  const BAKED = JSON.parse(
    readFileSync(path.join(__dirname, '..', 'data/asset_collision_overrides.json'), 'utf8'),
  ) as Record<string, { boxes: Row[]; ramps?: Row[] }>;
  // the largest dimension of each model at authored size (the placed-asset unit)
  const SIZE: Record<string, number> = {
    tavern_b: 30.262,
    hall: 30.5,
    shop_a: 16.28,
    smithy: 19.797,
    manor: 51.248,
  };

  it('stands each door under its lintel and each room on its floor deck', () => {
    for (const name of placedTownInteriorModels()) {
      const air = placedTownModelAir(name);
      if (!air) throw new Error(name);
      const unit = SIZE[name] / 2.2;
      // the painted set's rows sit under its default model; the manor's under its own path
      const rows = BAKED[name === 'manor' ? 'tidehold/highwatch/manor' : `tidehold/${name}`];
      const boxes = rows.boxes.map((b) => {
        const c = Math.abs(Math.cos(b.ry ?? 0));
        const s = Math.abs(Math.sin(b.ry ?? 0));
        const ex = (b.hx * c + b.hz * s) * unit;
        const ez = (b.hx * s + b.hz * c) * unit;
        return {
          x0: b.x * unit - ex,
          x1: b.x * unit + ex,
          z0: b.z * unit - ez,
          z1: b.z * unit + ez,
          y0: (b.y - b.hy) * unit - 1,
        };
      });
      const decks = (rows.ramps ?? []).map((r) => Math.max(r.y0 ?? 0, r.y1 ?? 0) * unit - 1);
      const [room, door] = [air.boxes[0], air.boxes[air.openings[0].box]];
      // the room's floor is one of the model's decks
      expect(Math.min(...decks.map((d) => Math.abs(d - room[2]))), name).toBeLessThan(0.02);
      // the door's head is the lowest baked box over the door's middle, in the wall
      const mx = (door[0] + door[1]) / 2;
      const mz = door[4] + 0.3; // inside the wall, a hand in from its outside face
      const over = boxes.filter(
        (b) => b.x0 <= mx && b.x1 >= mx && b.z0 <= mz && b.z1 >= mz && b.y0 > door[2] + 1,
      );
      expect(Math.min(...over.map((b) => b.y0)), name).toBeCloseTo(door[3], 1);
    }
  });

  it("keeps every piece of the manor's air on a floor deck and clear of its walls", () => {
    // the manor has many rooms: each piece stands on the deck under its middle, and no wall
    // (a baked box five yards tall or more) cuts into any of them, so the camera can never be
    // walked into masonry the model would draw through
    const air = placedTownModelAir('manor');
    if (!air) throw new Error('no manor air');
    const unit = SIZE.manor / 2.2;
    const rows = BAKED['tidehold/highwatch/manor'];
    const walls = rows.boxes
      .map((b) => ({
        x0: (b.x - b.hx) * unit,
        x1: (b.x + b.hx) * unit,
        z0: (b.z - b.hz) * unit,
        z1: (b.z + b.hz) * unit,
        y0: (b.y - b.hy) * unit - 1,
        y1: (b.y + b.hy) * unit - 1,
      }))
      .filter((b) => b.y1 - b.y0 >= 5);
    expect(walls.length).toBeGreaterThan(20);
    const decks = (rows.ramps ?? []).map((r) => ({
      x0: (r.x - (r.ry ? r.hz : r.hx)) * unit,
      x1: (r.x + (r.ry ? r.hz : r.hx)) * unit,
      z0: (r.z - (r.ry ? r.hx : r.hz)) * unit,
      z1: (r.z + (r.ry ? r.hx : r.hz)) * unit,
      y: Math.max(r.y0 ?? 0, r.y1 ?? 0) * unit - 1,
    }));
    for (const [i, [x0, x1, y0, y1, z0, z1]] of air.boxes.entries()) {
      const mx = (x0 + x1) / 2;
      const mz = (z0 + z1) / 2;
      // the highest deck under its middle is its floor
      const under = decks.filter((d) => d.x0 <= mx && d.x1 >= mx && d.z0 <= mz && d.z1 >= mz);
      expect(under.length, `piece ${i}`).toBeGreaterThan(0);
      expect(Math.max(...under.map((d) => d.y)), `piece ${i} floor`).toBeCloseTo(y0, 1);
      for (const w of walls) {
        const overlap =
          Math.min(x1, w.x1) - Math.max(x0, w.x0) > 0.05 &&
          Math.min(z1, w.z1) - Math.max(z0, w.z0) > 0.05 &&
          Math.min(y1, w.y1) - Math.max(y0, w.y0) > 0.05;
        expect(overlap, `piece ${i} against a wall at ${w.x0.toFixed(1)}, ${w.z0.toFixed(1)}`).toBe(
          false,
        );
      }
    }
  });
});
