import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clampChaseCameraToInterior,
  interiorCameraInternalsForTest,
  registerCameraInterior,
} from '../src/render/interior_camera';
import {
  interiorContains,
  interiorHoldsEye,
  interiorSegmentFraction,
} from '../src/render/interior_camera_core';
import {
  eyeInTavernAir,
  mirefenTavernCameraInterior,
  TAVERN_FRONT_DOOR_BOX,
  TAVERN_INTERIOR_LOCAL,
  TAVERN_TOWER_SHAFT,
  tavernBoxToWorld,
} from '../src/render/mirefen_tavern_interior_core';
import {
  TAVERN_FLOOR_Y,
  TAVERN_GALLERY,
  TAVERN_HALL,
  TAVERN_PROPS,
  TAVERN_ROOM_WALLS,
  TAVERN_TOWER,
  TAVERN_UPPER,
  TAVERN_WING,
  tavernToWorld,
} from '../src/sim/content/mirefen_tavern';
import {
  tavernHallWalls,
  tavernTowerWallSegments,
  tavernWingWalls,
} from '../src/sim/mirefen_tavern';
import { tavernStairHeight } from '../src/sim/mirefen_tavern_floor';

// The Mirefen tavern's interior for the indoor camera (src/render/mirefen_tavern_interior_core.ts)
// and the clamp over it (src/render/interior_camera.ts): the air never reaches into a wall, the
// barrel wall under the gallery, the wall fireplace or the tower's ring; and at the owner's
// spot (the tower stair's foot) and the other tight spots (the stair, a gallery corner, behind
// the bar, the hearth pit, the rooms, the hall's corners), for every orbit a player can take,
// the clamped camera stays in the air with its whole sight line to the player in it, so no
// wall, roof or floor ever stands between them and the outside never shows.

const T = TAVERN_TOWER;
const vol = mirefenTavernCameraInterior();

afterEach(() => interiorCameraInternalsForTest.reset());

/** A local point to the world. */
function world(lx: number, ly: number, lz: number): THREE.Vector3 {
  const w = tavernToWorld(lx, lz);
  return new THREE.Vector3(w.x, TAVERN_FLOOR_Y + ly, w.z);
}

describe('tavern interior boxes', () => {
  it('turns local boxes into the world the way the model is turned', () => {
    const b = tavernBoxToWorld([1, 2, 0, 3, 4, 6]);
    const lo = tavernToWorld(2, 4);
    const hi = tavernToWorld(1, 6);
    expect(b).toEqual([lo.x, hi.x, TAVERN_FLOOR_Y, TAVERN_FLOOR_Y + 3, lo.z, hi.z]);
  });

  it('never reaches into a wall, the barrel wall, the fireplace or the tower ring', {
    timeout: 60000,
  }, () => {
    const walls = [...tavernHallWalls(), ...tavernWingWalls()];
    const g = TAVERN_GALLERY;
    const fire = TAVERN_PROPS.find((p) => p.kind === 'fireplace');
    if (!fire) throw new Error('fireplace');
    const ring = tavernTowerWallSegments();
    const inRing = (x: number, z: number): boolean =>
      ring.some((s) => {
        const dx = x - s.x;
        const dz = z - s.z;
        const c = Math.cos(s.rot);
        const sn = Math.sin(s.rot);
        // the segment's local z runs out along the radius (atan2(dx, dz) = rot)
        const along = dx * c - dz * sn;
        const out = dx * sn + dz * c;
        return Math.abs(along) < s.hw - 0.12 && Math.abs(out) < s.hd - 0.02;
      });
    const E = 0.02;
    for (let i = 0; i < TAVERN_INTERIOR_LOCAL.length; i++) {
      const [x0, x1, y0, y1, z0, z1] = TAVERN_INTERIOR_LOCAL[i];
      for (let x = x0 + E; x <= x1 - E; x += 0.4) {
        for (let z = z0 + E; z <= z1 - E; z += 0.4) {
          const shaft = TAVERN_TOWER_SHAFT;
          if (i === shaft.box && Math.hypot(x - shaft.x, z - shaft.z) > shaft.r) continue;
          for (const [wx0, wx1, wz0, wz1] of walls) {
            const hit = x > wx0 + E && x < wx1 - E && z > wz0 + E && z < wz1 - E;
            // the front door's box runs out through the wall's opening only
            expect(hit, `box ${i} in a wall at ${x.toFixed(2)}, ${z.toFixed(2)}`).toBe(false);
          }
          if (y1 > TAVERN_UPPER) {
            for (const [rx0, rx1, rz0, rz1] of TAVERN_ROOM_WALLS) {
              const hit = x > rx0 + E && x < rx1 - E && z > rz0 + E && z < rz1 - E;
              expect(hit, `box ${i} in a partition`).toBe(false);
            }
          }
          if (y0 < TAVERN_UPPER - E) {
            const barrel = x > g.x0 + E && x < g.x1 && z > g.z0 && z < g.z1 - E;
            expect(barrel, `box ${i} in the barrel wall`).toBe(false);
          }
          const breast =
            x > fire.x - (fire.hw ?? 0) + E &&
            z > fire.z - (fire.hd ?? 0) + E &&
            z < fire.z + (fire.hd ?? 0) - E &&
            y0 < TAVERN_HALL.eave;
          expect(breast, `box ${i} in the fireplace`).toBe(false);
          expect(
            inRing(x, z),
            `box ${i} in the tower ring at ${x.toFixed(2)}, ${z.toFixed(2)}`,
          ).toBe(false);
        }
      }
    }
  });

  it('holds the eye in every room, never on the porch or in the doorway alone', () => {
    const at = (lx: number, lz: number, feet = 0) => {
      const w = tavernToWorld(lx, lz);
      return interiorHoldsEye(vol, w.x, TAVERN_FLOOR_Y + feet + 2, w.z);
    };
    expect(at(0, 0)).toBe(true);
    expect(at(0, 4.5, -0.45)).toBe(true); // the hearth pit
    expect(at(-3, -14)).toBe(true); // the arch at the stair's foot
    expect(at(T.x + 4.5, T.z - 2, tavernStairHeight(4.5, -2))).toBe(true); // on the stair
    expect(at(14.4, -12.5, TAVERN_UPPER)).toBe(true); // the gallery's far corner
    expect(at(7, -24, TAVERN_UPPER)).toBe(true); // a guest room
    expect(at(0, 13.6)).toBe(false); // in the doorway's thickness
    expect(at(0, 15.5)).toBe(false); // the porch
    expect(at(-20, 0)).toBe(false); // outside
    expect(eyeInTavernAir(0, 2, 13.6)).toBe(false);
    expect(eyeInTavernAir(0, 2, 12.8)).toBe(true);
    expect(TAVERN_INTERIOR_LOCAL[TAVERN_FRONT_DOOR_BOX][5]).toBe(TAVERN_HALL.z1);
  });
});

/** The tight spots: local feet (x, feetY, z). */
const SPOTS: readonly [string, number, number, number][] = [
  ["the owner's spot, the tower stair's foot", -3, 0, -14],
  ['the arch approach', -1.5, 0, -8],
  ['on the stair', T.x + 4.5, tavernStairHeight(4.5, -2), T.z - 2],
  ['half way up the stair, round the back', T.x - 4, tavernStairHeight(-4, -1), T.z - 1],
  ['the landing at the stair head', T.x + 3.7, TAVERN_UPPER, T.z + 1.4],
  ["the gallery's far corner", 14.4, TAVERN_UPPER, -12.5],
  ['behind the bar', 9, 0.5, -8.8],
  ['in the hearth pit', 0, -0.45, 4.5],
  ['the west guest room corner', 5.6, TAVERN_UPPER, -26.4],
  ['the east guest room corner', 14.6, TAVERN_UPPER, -26.6],
  ['the landing by the gallery door', 8.5, TAVERN_UPPER, -15.2],
  ["the hall's back corner", -14.4, 0, -12.4],
  ["the hall's front corner", 14.4, 0, 12.4],
];

describe('the indoor camera at the tight spots', () => {
  for (const [name, lx, feet, lz] of SPOTS) {
    it(`keeps every orbit inside, its sight line clear: ${name}`, () => {
      registerCameraInterior(vol);
      const cam = new THREE.PerspectiveCamera(70, 16 / 9, 0.2, 950);
      const self = world(lx, feet, lz);
      let best = 0;
      for (let k = 0; k < 24; k++) {
        const yaw = (k / 24) * Math.PI * 2;
        for (const pitch of [-0.15, 0.3, 0.7, 1.2]) {
          for (const dist of [5, 12, 22]) {
            const look = new THREE.Vector3(self.x, self.y + 2, self.z);
            cam.position.set(
              look.x - Math.sin(yaw) * Math.cos(pitch) * dist,
              Math.max(look.y + Math.sin(pitch) * dist, self.y + 0.6),
              look.z - Math.cos(yaw) * Math.cos(pitch) * dist,
            );
            const eye = look.clone();
            clampChaseCameraToInterior(cam, look, self, 1 / 60, true);
            const c = cam.position;
            expect(interiorContains(vol, c.x, c.y, c.z), `${yaw} ${pitch} ${dist}`).toBe(true);
            // the whole sight line from the player's eye to the lens stays in the air (a cut
            // to the eyes in a corner no framing escapes stands at the eye itself)
            expect(
              interiorSegmentFraction(vol, eye.x, eye.y, eye.z, c.x, c.y, c.z, 0),
              `sight line ${yaw} ${pitch} ${dist}`,
            ).toBe(1);
            best = Math.max(best, c.distanceTo(eye));
          }
        }
      }
      // however tight the spot, some orbit keeps a real third-person view
      expect(best).toBeGreaterThan(3.5);
    });
  }

  it("keeps the owner's own orbit where he left it: it already stands in the hall's air", () => {
    registerCameraInterior(vol);
    const cam = new THREE.PerspectiveCamera(70, 16 / 9, 0.2, 950);
    const self = world(-3, 0, -14);
    const look = new THREE.Vector3(self.x, self.y + 2, self.z);
    // the owner's orbit: looking into the tower from the hall, pitched well up, zoomed out
    const target = world(-1.5, 0, -20);
    const yaw = Math.atan2(target.x - self.x, target.z - self.z);
    const dist = 14;
    const pitch = 0.55;
    cam.position.set(
      look.x - Math.sin(yaw) * Math.cos(pitch) * dist,
      look.y + Math.sin(pitch) * dist,
      look.z - Math.cos(yaw) * Math.cos(pitch) * dist,
    );
    // (the old cutaway opened the back wall onto the pond for this very orbit; now the shell
    // holds, tests/mirefen_tavern_core.test.ts, and the camera needs no pull at all)
    clampChaseCameraToInterior(cam, look, self, 1 / 60, true);
    const c = cam.position;
    expect(interiorContains(vol, c.x, c.y, c.z)).toBe(true);
    expect(c.y - TAVERN_FLOOR_Y).toBeLessThan(TAVERN_HALL.tie);
    expect(c.distanceTo(look)).toBeCloseTo(dist, 6);
    // zoomed further out, the same orbit is pulled in under the hall's rafters
    cam.position.set(
      look.x - Math.sin(yaw) * Math.cos(pitch) * 30,
      look.y + Math.sin(pitch) * 30,
      look.z - Math.cos(yaw) * Math.cos(pitch) * 30,
    );
    clampChaseCameraToInterior(cam, look, self, 1 / 60, true);
    expect(interiorContains(vol, c.x, c.y, c.z)).toBe(true);
    expect(c.distanceTo(look)).toBeGreaterThan(dist);
    expect(c.distanceTo(look)).toBeLessThan(30);
  });

  it('keeps the wing ceiling over a guest room', () => {
    registerCameraInterior(vol);
    const cam = new THREE.PerspectiveCamera(70, 16 / 9, 0.2, 950);
    const self = world(7, TAVERN_UPPER, -24);
    const look = new THREE.Vector3(self.x, self.y + 2, self.z);
    cam.position.set(look.x, look.y + 12, look.z);
    clampChaseCameraToInterior(cam, look, self, 1 / 60, true);
    expect(cam.position.y - TAVERN_FLOOR_Y).toBeLessThan(TAVERN_WING.eave - 0.4);
  });
});
