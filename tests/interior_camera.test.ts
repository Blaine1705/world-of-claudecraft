import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import {
  activeCameraInterior,
  clampChaseCameraToInterior,
  constrainInteriorCameraDraw,
  hideSelfInCloseCamera,
  interiorCameraInternalsForTest,
  interiorHidesNameplate,
  registerCameraInterior,
  restoreInteriorCameraDraw,
} from '../src/render/interior_camera';
import { cameraInterior, interiorContains } from '../src/render/interior_camera_core';

// The indoor chase-camera clamp's driver (src/render/interior_camera.ts): the registry, the
// per-frame clamp (pull-in at once, eased release, outdoors untouched), the look point brought
// back to the eye across a wall, the draw-time re-check of a shaken camera and its exact
// restore, and the nameplate gate for bodies outside.

// one room x 0..10, z 0..10, y 0..5, its front door out of the -z wall (x 4..6, z -1..1.5)
const ROOM = cameraInterior(
  'room',
  [
    [0, 10, 0, 5, 0, 10],
    [4, 6, 0, 3, -1, 1.5],
  ],
  [{ box: 1, axis: 2, side: -1 }],
);

function camera(): THREE.PerspectiveCamera {
  return new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
}

/** One updateCamera frame: the desired camera `c` and the look point over feet `self`. */
function frame(
  cam: THREE.PerspectiveCamera,
  self: THREE.Vector3,
  c: [number, number, number],
  dt = 1 / 60,
  reduced = false,
): THREE.Vector3 {
  const look = new THREE.Vector3(self.x, self.y + 2, self.z);
  cam.position.set(c[0], c[1], c[2]);
  clampChaseCameraToInterior(cam, look, self, dt, reduced);
  return look;
}

afterEach(() => interiorCameraInternalsForTest.reset());

describe('indoor camera clamp', () => {
  it('leaves the camera untouched outdoors (the no-pull-in rule holds outside interiors)', () => {
    const cam = camera();
    // nothing registered: nothing moves, wherever the camera would stand
    frame(cam, new THREE.Vector3(5, 0, 5), [-20, 3, 5]);
    expect(cam.position.toArray()).toEqual([-20, 3, 5]);
    // a room registered, the player out on the road: still nothing moves
    registerCameraInterior(ROOM);
    frame(cam, new THREE.Vector3(5, 0, -20), [5, 6, -30]);
    expect(cam.position.toArray()).toEqual([5, 6, -30]);
    expect(activeCameraInterior()).toBe(null);
  });

  it('pulls the camera in to stay inside while the player is indoors', () => {
    registerCameraInterior(ROOM);
    const cam = camera();
    const self = new THREE.Vector3(8, 0, 5);
    // the desired camera out past the +x wall: pulled in along the ray, inside the wall
    // (a comfortable boom there is, so no lift)
    const roomy = new THREE.Vector3(5, 0, 5);
    frame(cam, roomy, [20, 2, 5]);
    expect(activeCameraInterior()?.id).toBe('room');
    expect(cam.position.x).toBeLessThan(10);
    expect(cam.position.x).toBeGreaterThan(8);
    expect(cam.position.y).toBeCloseTo(2, 6);
    expect(interiorContains(ROOM, cam.position.x, cam.position.y, cam.position.z)).toBe(true);
    // through the ceiling: stays under it
    frame(cam, self, [8, 20, 5]);
    expect(cam.position.y).toBeLessThan(5);
    // a camera already inside: left where it is (once the release from the ceiling settles)
    for (let i = 0; i < 120; i++) frame(cam, self, [3, 3, 5]);
    expect(cam.position.x).toBeCloseTo(3, 3);
    expect(cam.position.y).toBeCloseTo(3, 3);
  });

  it('frames a cramped spot comfortably, and glides into the framing', () => {
    registerCameraInterior(ROOM);
    const cam = camera();
    // against the +x wall, the camera wanted out past it: cramped, so it finds a framing
    const self = new THREE.Vector3(9, 0, 5);
    const eye = new THREE.Vector3(9, 2, 5);
    frame(cam, self, [20, 2, 5], 1 / 60, true);
    const framed = cam.position.clone();
    expect(framed.distanceTo(eye)).toBeGreaterThan(2.5);
    expect(interiorContains(ROOM, framed.x, framed.y, framed.z)).toBe(true);
    // a fresh approach without reduced motion glides there over frames, not at once
    interiorCameraInternalsForTest.reset();
    registerCameraInterior(ROOM);
    frame(cam, new THREE.Vector3(5, 0, 5), [1, 2, 5]);
    frame(cam, self, [20, 2, 5]);
    const first = cam.position.clone();
    expect(first.distanceTo(framed)).toBeGreaterThan(0.2);
    for (let i = 0; i < 150; i++) frame(cam, self, [20, 2, 5]);
    expect(cam.position.distanceTo(framed)).toBeLessThan(0.05);
    // every frame on the way stayed in the room
    expect(interiorContains(ROOM, first.x, first.y, first.z)).toBe(true);
  });

  it('eases back out when the view clears, never overshooting', () => {
    registerCameraInterior(ROOM);
    const cam = camera();
    const self = new THREE.Vector3(8, 0, 5);
    frame(cam, self, [20, 2, 5]);
    const pulled = cam.position.distanceTo(new THREE.Vector3(8, 2, 5));
    // swing the camera round to the open room behind: it glides out, not jumps
    frame(cam, self, [1, 2, 5]);
    const first = cam.position.distanceTo(new THREE.Vector3(8, 2, 5));
    expect(first).toBeGreaterThan(pulled);
    expect(first).toBeLessThan(7);
    for (let i = 0; i < 120; i++) frame(cam, self, [1, 2, 5]);
    expect(cam.position.x).toBeCloseTo(1, 3);
  });

  it('releases smoothly after walking out, then leaves the camera alone', () => {
    registerCameraInterior(ROOM);
    const cam = camera();
    frame(cam, new THREE.Vector3(5, 0, 2), [5, 2, -12]);
    expect(cam.position.z).toBeGreaterThan(-1); // held inside the front door
    // one step out onto the threshold: the boom eases out rather than snapping
    const self = new THREE.Vector3(5, 0, -0.5);
    frame(cam, self, [5, 2, -14.5]);
    expect(activeCameraInterior()).toBe(null);
    expect(cam.position.z).toBeGreaterThan(-14.5);
    for (let i = 0; i < 90; i++) frame(cam, self, [5, 2, -14.5]);
    expect(cam.position.toArray()).toEqual([5, 2, -14.5]);
    // reduced motion releases at once
    frame(cam, new THREE.Vector3(5, 0, 2), [5, 2, -12]);
    frame(cam, self, [5, 2, -14.5], 1 / 60, true);
    expect(cam.position.toArray()).toEqual([5, 2, -14.5]);
  });

  it('brings the look point back to the eye when it lags across a wall', () => {
    registerCameraInterior(ROOM);
    const cam = camera();
    const self = new THREE.Vector3(9, 0, 5);
    const look = new THREE.Vector3(11, 2, 5); // the lagged pivot, outside the +x wall
    cam.position.set(4, 3, 5);
    clampChaseCameraToInterior(cam, look, self, 1 / 60, false);
    expect(look.toArray()).toEqual([9, 2, 5]);
    expect(interiorContains(ROOM, cam.position.x, cam.position.y, cam.position.z)).toBe(true);
  });

  it('re-checks a shaken camera before the draw and restores the shaken pose after it', () => {
    registerCameraInterior(ROOM);
    const cam = camera();
    frame(cam, new THREE.Vector3(8, 0, 5), [20, 2, 5]);
    const clamped = cam.position.clone();
    // a shake pushes the lens toward the wall
    cam.position.x += 0.6;
    const shaken = cam.position.clone();
    constrainInteriorCameraDraw(cam);
    expect(cam.position.x).toBeLessThanOrEqual(clamped.x + 1e-6);
    restoreInteriorCameraDraw(cam);
    expect(cam.position.toArray()).toEqual(shaken.toArray());
    // a shake into the room is drawn as it is
    cam.position.copy(clamped).x -= 0.6;
    const inward = cam.position.clone();
    constrainInteriorCameraDraw(cam);
    expect(cam.position.toArray()).toEqual(inward.toArray());
    restoreInteriorCameraDraw(cam);
    expect(cam.position.toArray()).toEqual(inward.toArray());
  });

  it('leaves a far camera (the editor) alone at draw time', () => {
    registerCameraInterior(ROOM);
    const cam = camera();
    frame(cam, new THREE.Vector3(8, 0, 5), [20, 2, 5]);
    cam.position.set(40, 30, 40);
    constrainInteriorCameraDraw(cam);
    expect(cam.position.toArray()).toEqual([40, 30, 40]);
  });

  it('forgets an interior when its building drops it', () => {
    const drop = registerCameraInterior(ROOM);
    const cam = camera();
    frame(cam, new THREE.Vector3(8, 0, 5), [20, 2, 5]);
    expect(activeCameraInterior()).not.toBe(null);
    drop();
    expect(activeCameraInterior()).toBe(null);
    expect(interiorCameraInternalsForTest.interiors()).toHaveLength(0);
  });
});

describe('the close-camera self hide', () => {
  it("hides the player's body when a closet leaves the camera in its head, and shows it after", () => {
    // a closet a body barely turns round in: no framing escapes it
    registerCameraInterior(
      cameraInterior('closet', [
        [0, 1.6, 0, 3.2, 0, 1.6],
        [1.6, 12, 0, 5, -5, 5],
      ]),
    );
    const cam = camera();
    const group = new THREE.Group();
    const look = frame(cam, new THREE.Vector3(0.8, 0, 0.8), [-6, 4, 0.8], 1 / 60, true);
    hideSelfInCloseCamera(group, cam);
    expect(group.visible).toBe(false);
    // the cut to the eyes: the lens at the eye, aimed out the way the requested camera looks
    expect(cam.position.distanceTo(new THREE.Vector3(0.8, 2, 0.8))).toBeLessThan(1e-9);
    expect(look.x).toBeGreaterThan(0.8 + 3.5);
    expect(look.distanceTo(cam.position)).toBeCloseTo(4, 6);
    expect(look.y).toBeLessThan(2);
    // the view's own pass shows it next frame; out in the room the camera draws back
    group.visible = true;
    frame(cam, new THREE.Vector3(8, 0, 0), [2, 3, 0], 1 / 60, true);
    hideSelfInCloseCamera(group, cam);
    expect(group.visible).toBe(true);
  });

  it('never hides anything outdoors', () => {
    const cam = camera();
    const group = new THREE.Group();
    frame(cam, new THREE.Vector3(0, 0, 0), [0.2, 2.1, 0.2]);
    hideSelfInCloseCamera(group, cam);
    expect(group.visible).toBe(true);
  });
});

describe('the overlays that consult the indoor gate', () => {
  it('gates the nameplates and the chat bubbles of bodies outside', () => {
    const painter = readFileSync(
      path.join(__dirname, '..', 'src/render/nameplate_painter.ts'),
      'utf8',
    );
    expect(painter).toContain(
      'if (interiorHidesNameplate(this.camera, p.x, p.y, p.z, this.tmpV.y)) continue;',
    );
    const renderer = readFileSync(path.join(__dirname, '..', 'src/render/renderer.ts'), 'utf8');
    const bubbles = renderer.slice(renderer.indexOf('private updateChatBubbles(): void {'));
    expect(bubbles.slice(0, 2000)).toContain(
      'interiorCam.interiorHidesNameplate(this.camera, bx, e.pos.y, bz, by)',
    );
    expect(renderer).toContain(
      'interiorCam.hideSelfInCloseCamera(this.views.get(this.sim.playerId)?.group, this.camera);',
    );
  });
});

describe('indoor nameplates', () => {
  it('hides a body outside behind the walls, keeps one seen through the door or inside', () => {
    registerCameraInterior(ROOM);
    const cam = camera();
    frame(cam, new THREE.Vector3(5, 0, 5), [5, 2.5, 8]);
    // a troll outside behind the -x wall: hidden
    expect(interiorHidesNameplate(cam, -10, 0, 5, 2.8)).toBe(true);
    // one on the road straight out of the front door: seen through the doorway
    expect(interiorHidesNameplate(cam, 5, 0, -12, 1.5)).toBe(false);
    // the innkeeper inside: always kept
    expect(interiorHidesNameplate(cam, 2, 0, 2, 2.8)).toBe(false);
  });

  it('hides nothing while the player is outdoors', () => {
    registerCameraInterior(ROOM);
    const cam = camera();
    frame(cam, new THREE.Vector3(5, 0, -20), [5, 6, -30]);
    expect(interiorHidesNameplate(cam, 5, 0, 5, 2.8)).toBe(false);
    expect(interiorHidesNameplate(cam, -10, 0, 5, 2.8)).toBe(false);
  });
});
