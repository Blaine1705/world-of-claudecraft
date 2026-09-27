import { describe, expect, it } from 'vitest';
import {
  cameraInterior,
  chooseInteriorFraming,
  frameBoomInto,
  INTERIOR_BOOM_MAX_LAG,
  INTERIOR_BOOM_RELEASE_MAX_SPEED,
  INTERIOR_COMFORT_BOOM,
  INTERIOR_DROP_MIN_PITCH,
  INTERIOR_ENTRY_BLEND,
  INTERIOR_ENTRY_SETTLE_SEC,
  INTERIOR_LIFT_MAX_PITCH,
  interiorCameraPadding,
  interiorContains,
  interiorEntrySettle,
  interiorEntryWeight,
  interiorExit,
  interiorHoldsEye,
  interiorSeesOut,
  interiorSegmentFraction,
  stepInteriorBoom,
  stepInteriorFraming,
} from '../src/render/interior_camera_core';

// The indoor chase-camera clamp's pure core (src/render/interior_camera_core.ts): the walk of a
// segment through a union of air boxes (where it first leaves, the near-plane pad, the start in
// a wall's clearance band), the eye rule (an opening's box alone does not hold the player), the
// nameplate sight line out through an opening only, the pad, the boom's glide both ways, the
// threshold blend and the framings (a lift, a flattening under a ceiling, a swing).

// Two rooms joined by a doorway, and a front door out of room A onto the world:
//   room A x 0..10, room B x 12..22 (both z 0..10, y 0..4), the doorway between them
//   x 9..13 z 4..6 y 0..3, and the front door through room A's -z wall (its outside face at
//   z -1, the opening) x 4..6 z -1..1.5 y 0..3.
const ROOM_A = [0, 10, 0, 4, 0, 10] as const;
const ROOM_B = [12, 22, 0, 4, 0, 10] as const;
const DOORWAY = [9, 13, 0, 3, 4, 6] as const;
const FRONT = [4, 6, 0, 3, -1, 1.5] as const;
const vol = cameraInterior(
  'test',
  [ROOM_A, ROOM_B, DOORWAY, FRONT],
  [{ box: 3, axis: 2, side: -1 }],
);

describe('interior walk', () => {
  it('computes the bounds of the union', () => {
    expect(vol.bounds).toEqual([0, 22, 0, 4, -1, 10]);
  });

  it('never clamps a segment that stays in one room', () => {
    expect(interiorSegmentFraction(vol, 2, 2, 2, 8, 3, 8, 0.3)).toBe(1);
  });

  it('stops at the wall, less the pad, when the segment would leave the room', () => {
    // from x 5 toward x 20 at z 2 (not the doorway's z): the wall at x 10, the pad 0.5
    const f = interiorSegmentFraction(vol, 5, 2, 2, 20, 2, 2, 0.5);
    expect(5 + 15 * f).toBeCloseTo(9.5, 6);
    // the ceiling: straight up from y 2 toward y 10, stopped at 4 - 0.5
    const g = interiorSegmentFraction(vol, 5, 2, 5, 5, 10, 5, 0.5);
    expect(2 + 8 * g).toBeCloseTo(3.5, 6);
  });

  it('walks on through a doorway into the next room', () => {
    // along z 5 (the doorway) from room A into room B: never leaves
    expect(interiorSegmentFraction(vol, 5, 1.5, 5, 18, 1.5, 5, 0.3)).toBe(1);
    // ...but a line through the doorway's height into B's wall beyond stops at that wall
    const f = interiorSegmentFraction(vol, 5, 1.5, 5, 30, 1.5, 5, 0.3);
    expect(5 + 25 * f).toBeCloseTo(21.7, 6);
  });

  it('stops at the doorway jamb when the line leaves its width', () => {
    // from room A at z 5 toward room B at z 9 (the partition beside the doorway)
    const f = interiorSegmentFraction(vol, 5, 1.5, 5, 18, 1.5, 9, 0.3);
    expect(f).toBeLessThan(1);
    const x = 5 + 13 * f;
    expect(x).toBeLessThanOrEqual(12);
  });

  it('lets a start in the clearance band walk out into the room, never into the wall', () => {
    // the eye 0.1 from the wall at x 10: walking back into the room is free
    expect(interiorSegmentFraction(vol, 9.9, 2, 2, 3, 2, 2, 0.5)).toBe(1);
    // walking into the wall stays put
    expect(interiorSegmentFraction(vol, 9.9, 2, 2, 15, 2, 2, 0.5)).toBe(0);
  });

  it('returns 0 for a start outside the air', () => {
    expect(interiorSegmentFraction(vol, -5, 2, 2, 5, 2, 2, 0.3)).toBe(0);
    expect(interiorExit.box).toBe(-1);
  });
});

describe('round pieces (a stair tower)', () => {
  // a round room of radius 5 round (0, 0), cut off at z 3 by a flat wall
  const tower = cameraInterior(
    'tower',
    [[-5, 5, 0, 10, -5, 3]],
    [],
    new Map([[0, [0, 0, 5] as const]]),
  );

  it('contains a point inside the circle and the box, not in the box corner', () => {
    expect(interiorContains(tower, 0, 5, 0)).toBe(true);
    expect(interiorContains(tower, 4.5, 5, -4.5)).toBe(false); // the box's corner
    expect(interiorContains(tower, 0, 5, 4)).toBe(false); // past the flat wall
    expect(interiorContains(tower, 4.8, 5, 0, 0.3)).toBe(false); // too close to the ring
  });

  it('stops a ray at the ring, less the pad, and at the flat wall', () => {
    const f = interiorSegmentFraction(tower, 0, 5, 0, 20, 5, 0, 0.5);
    expect(20 * f).toBeCloseTo(4.5, 6);
    // along a chord: from (3, 5, -3) toward -x, the circle at x = -sqrt(4.5^2 - 9)
    const g = interiorSegmentFraction(tower, 3, 5, -3, -10, 5, -3, 0.5);
    expect(3 - 13 * g).toBeCloseTo(-Math.sqrt(4.5 * 4.5 - 9), 6);
    const h = interiorSegmentFraction(tower, 0, 5, 0, 0, 5, 10, 0.5);
    expect(10 * h).toBeCloseTo(2.5, 6);
  });

  it('walks a vertical ray up the shaft to the ceiling', () => {
    const f = interiorSegmentFraction(tower, 1, 2, 1, 1, 20, 1, 0.5);
    expect(2 + 18 * f).toBeCloseTo(9.5, 6);
  });
});

describe('interior containment and the eye rule', () => {
  it('contains a point in any box, clear of the pad', () => {
    expect(interiorContains(vol, 5, 2, 5)).toBe(true);
    expect(interiorContains(vol, 11, 2, 5)).toBe(true); // the doorway
    expect(interiorContains(vol, 11, 2, 2)).toBe(false); // the wall beside it
    expect(interiorContains(vol, 9.8, 2, 2, 0.3)).toBe(false); // too close to the wall
  });

  it('holds an eye in a room, never one only in an opening box', () => {
    expect(interiorHoldsEye(vol, 5, 2, 5)).toBe(true);
    expect(interiorHoldsEye(vol, 5, 2, -0.5)).toBe(false); // in the front door's thickness
    expect(interiorHoldsEye(vol, 5, 2, 0.5)).toBe(true); // stepped in: room A holds it
    expect(interiorHoldsEye(vol, 30, 2, 5)).toBe(false);
  });
});

describe('interior sight lines for nameplates', () => {
  it('sees out through the opening, never through a wall', () => {
    // from room A through the front door (out of -z) to a body on the road
    expect(interiorSeesOut(vol, 5, 2, 6, 5, 2, -12)).toBe(true);
    // the same body seen through the wall beside the door
    expect(interiorSeesOut(vol, 1, 2, 6, 1, 2, -12)).toBe(false);
    // a body outside the far side: through the wall
    expect(interiorSeesOut(vol, 5, 2, 5, -10, 2, 5)).toBe(false);
    // a body inside the air is always seen
    expect(interiorSeesOut(vol, 5, 2, 5, 18, 2, 5)).toBe(true);
  });

  it('never sees out through the doorway between two rooms (it is not an opening)', () => {
    // from room A through the doorway and out through room B's back wall
    expect(interiorSeesOut(vol, 5, 1.5, 5, 40, 1.5, 5)).toBe(false);
  });
});

describe('interior camera pad and boom', () => {
  it('pads by the whole near-plane rectangle, wider on a wide screen', () => {
    const narrow = interiorCameraPadding(0.1, 60, 1);
    const wide = interiorCameraPadding(0.1, 60, 2.4);
    expect(narrow).toBeGreaterThan(0.1);
    expect(wide).toBeGreaterThan(narrow);
  });

  it('lifts a boom toward the vertical, keeping its length and heading, never past the cap', () => {
    const out = { x: 0, y: 0, z: 0 };
    frameBoomInto(out, 3, 0, 4, 0.5);
    expect(Math.hypot(out.x, out.y, out.z)).toBeCloseTo(5, 9);
    expect(out.x / out.z).toBeCloseTo(3 / 4, 9);
    expect(Math.atan2(out.y, Math.hypot(out.x, out.z))).toBeCloseTo(0.5, 9);
    frameBoomInto(out, 3, 0, 4, 5);
    expect(Math.atan2(out.y, Math.hypot(out.x, out.z))).toBeCloseTo(INTERIOR_LIFT_MAX_PITCH, 9);
    // already steeper than the cap, or no lift: untouched
    frameBoomInto(out, 0.1, 5, 0, 0.3);
    expect([out.x, out.y, out.z]).toEqual([0.1, 5, 0]);
    frameBoomInto(out, 3, 1, 4, 0);
    expect([out.x, out.y, out.z]).toEqual([3, 1, 4]);
    expect(stepInteriorFraming(0, 0.5, 1 / 60, true)).toBe(0.5);
    const eased = stepInteriorFraming(0, 0.5, 1 / 60, false);
    expect(eased).toBeGreaterThan(0);
    expect(eased).toBeLessThan(0.5);
  });

  it('flattens a boom toward the level, keeping its length and heading, never under the floor', () => {
    const out = { x: 0, y: 0, z: 0 };
    const e0 = Math.atan2(2, 5);
    frameBoomInto(out, 3, 2, 4, -0.2);
    expect(Math.hypot(out.x, out.y, out.z)).toBeCloseTo(Math.hypot(3, 2, 4), 9);
    expect(out.x / out.z).toBeCloseTo(3 / 4, 9);
    expect(Math.atan2(out.y, Math.hypot(out.x, out.z))).toBeCloseTo(e0 - 0.2, 9);
    frameBoomInto(out, 3, 2, 4, -5);
    expect(Math.atan2(out.y, Math.hypot(out.x, out.z))).toBeCloseTo(INTERIOR_DROP_MIN_PITCH, 9);
    // already flatter than the floor (a camera looking up): never raised by a flattening
    frameBoomInto(out, 3, -1, 4, -0.3);
    expect([out.x, out.y, out.z]).toEqual([3, -1, 4]);
  });

  it('swings a boom round the vertical, keeping its length and elevation', () => {
    const out = { x: 0, y: 0, z: 0 };
    frameBoomInto(out, 4, 1, 0, 0, Math.PI / 2);
    expect(out.x).toBeCloseTo(0, 9);
    expect(out.y).toBeCloseTo(1, 9);
    expect(out.z).toBeCloseTo(4, 9);
  });

  it('frames a cramped wall by the least departure that gives a comfortable boom', () => {
    // a low room (no lift helps: its ceiling is a head over the eye), the player backed up
    // against its z = 0 wall, the camera wanted out through that wall: it swings along it
    const low = cameraInterior('low', [[0, 12, 0, 3.2, 0, 12]]);
    const pick = chooseInteriorFraming(low, 6, 2, 1, 0, 1, -6, 0.3, 0);
    expect(Math.abs(pick.swing)).toBeGreaterThan(0);
    expect(pick.boom).toBeGreaterThanOrEqual(INTERIOR_COMFORT_BOOM);
    // it keeps to the side it already swings to (no flip about the player)
    const again = chooseInteriorFraming(low, 6, 2, 1, 0, 1, -6, 0.3, -1);
    expect(Math.sign(again.swing)).toBe(-1);
    // backed into a corner no framing escapes: the longest boom there is, never a worse one
    const corner = chooseInteriorFraming(low, 1, 2, 1, -6, 1, -6, 0.3, 0);
    const requested = Math.hypot(6, 1, 6) * interiorSegmentFraction(low, 1, 2, 1, -5, 3, -5, 0.3);
    expect(corner.boom).toBeLessThan(INTERIOR_COMFORT_BOOM);
    expect(corner.boom).toBeGreaterThanOrEqual(requested);
    // a comfortable boom is left as it is
    const open = chooseInteriorFraming(low, 6, 2, 6, -3, 0.5, 0, 0.3, 0);
    expect([open.lift, open.swing]).toEqual([0, 0]);
    // under a low ceiling with the room open behind: it flattens to keep the whole distance,
    // the heading kept (a slide under the ceiling, not a pull-in)
    const gallery = cameraInterior('gallery', [[0, 40, 0, 3.4, 0, 40]]);
    const under = chooseInteriorFraming(gallery, 20, 2, 20, 11.4, 3.8, 0, 0.3, 0);
    expect(under.swing).toBe(0);
    expect(under.lift).toBeLessThan(0);
    expect(under.boom).toBeCloseTo(Math.hypot(11.4, 3.8), 6);
    // a small gain never turns the view: a boom the ceiling barely trims stays as it is
    const trimmed = chooseInteriorFraming(gallery, 20, 2, 20, 11.4, 1.15, 0, 0.3, 0);
    expect(trimmed.lift).toBe(0);
    // in a tall shaft the lift alone does it, the heading kept
    const shaft = cameraInterior('shaft', [[0, 3, 0, 30, 0, 3]]);
    const up = chooseInteriorFraming(shaft, 1.5, 2, 1.5, 8, 1, 0, 0.3, 0);
    expect(up.swing).toBe(0);
    expect(up.lift).toBeGreaterThan(0);
  });

  it('glides a pull-in after a jump: lagging by at most the cap, only ever less, settled fast', () => {
    // the ray swings past a corner: the allowed boom jumps from 8 in to 3
    const s = { dist: 8, vel: 0, target: 8, drop: 0 };
    let prev = s.dist;
    let lag = Infinity;
    let frames = 0;
    for (let i = 0; i < 60; i++) {
      const d = stepInteriorBoom(s, 3, 1 / 60, false, 0.25);
      expect(d).toBeLessThanOrEqual(prev + 1e-12); // monotone: never back out past itself
      expect(d).toBeGreaterThanOrEqual(3); // never past a still target
      expect(d - 3).toBeLessThanOrEqual(INTERIOR_BOOM_MAX_LAG + 1e-12);
      expect(d - 3).toBeLessThanOrEqual(lag + 1e-12); // the lag only shrinks
      lag = d - 3;
      if (d > 3 + 0.25) frames++;
      prev = d;
    }
    // past the pad for a few frames only (the shell's cutaway covers them)
    expect(frames).toBeGreaterThan(0);
    expect(frames).toBeLessThanOrEqual(5);
    expect(s.dist).toBeCloseTo(3, 3);
    // a small step in is a glide too: the first frame moves, not the whole way
    const first = { dist: 3.4, vel: 0, target: 3.4, drop: 0 };
    const one = stepInteriorBoom(first, 3, 1 / 60, false, 0.25);
    expect(one).toBeLessThan(3.4);
    expect(one).toBeGreaterThan(3);
  });

  it('follows a steadily shrinking boom within the pad (the lens stays in the room)', () => {
    // a turn toward a wall or a walk backward: the allowed boom falls 9 yards a second
    const s = { dist: 12, vel: 0, target: 12, drop: 0 };
    for (let i = 1; i <= 75; i++) {
      const allowed = 12 - (9 * i) / 60;
      const d = stepInteriorBoom(s, allowed, 1 / 60, false, 0.25);
      expect(d - allowed, `frame ${i}`).toBeLessThanOrEqual(0.25 + 1e-12);
      expect(d).toBeGreaterThanOrEqual(allowed - 1e-12);
    }
  });

  it('glides a release: bounded speed, no overshoot, converging', () => {
    const s = { dist: 3, vel: 0, target: 3, drop: 0 };
    let prev = s.dist;
    for (let i = 0; i < 120; i++) {
      const d = stepInteriorBoom(s, 20, 1 / 60, false);
      expect(d).toBeGreaterThanOrEqual(prev - 1e-12);
      expect(d).toBeLessThanOrEqual(20);
      expect((d - prev) * 60).toBeLessThanOrEqual(INTERIOR_BOOM_RELEASE_MAX_SPEED + 1e-6);
      prev = d;
    }
    expect(s.dist).toBeCloseTo(20, 2);
    // a long frame (a hitch) never overshoots either way
    const hitch = { dist: 3, vel: 0, target: 3, drop: 0 };
    expect(stepInteriorBoom(hitch, 8, 2, false)).toBeLessThanOrEqual(8);
    const back = { dist: 8, vel: 0, target: 8, drop: 0 };
    expect(stepInteriorBoom(back, 3, 2, false)).toBeGreaterThanOrEqual(3);
    // a glide that turns about starts from rest: a pull-in's speed never dips a release
    const turn = { dist: 2, vel: -50, target: 2, drop: 0 };
    expect(stepInteriorBoom(turn, 10, 1 / 60, false)).toBeGreaterThanOrEqual(2);
    // immediate adopts the target and stops the glide
    const snap = { dist: 3, vel: 5, target: 3, drop: 0 };
    expect(stepInteriorBoom(snap, 8, 1 / 60, true)).toBe(8);
    expect(snap.vel).toBe(0);
  });
});

describe('the threshold blend', () => {
  it('is none on the door, whole a blend in, smooth and rising between', () => {
    // the front door's outside face: z = -1, x 4..6, y 0..3
    expect(interiorEntryWeight(vol, 5, 2, -1)).toBe(0);
    expect(interiorEntryWeight(vol, 5, 2, -1 + INTERIOR_ENTRY_BLEND)).toBe(1);
    expect(interiorEntryWeight(vol, 5, 2, 9.9)).toBe(1);
    let prev = 0;
    for (let z = -1; z <= -1 + INTERIOR_ENTRY_BLEND; z += 0.25) {
      const w = interiorEntryWeight(vol, 5, 2, z);
      expect(w).toBeGreaterThanOrEqual(prev);
      expect(w - prev).toBeLessThan(0.12);
      prev = w;
    }
    // away from the door along the front wall, the clamp is whole sooner
    expect(interiorEntryWeight(vol, 1, 2, 1)).toBeGreaterThan(interiorEntryWeight(vol, 5, 2, 1));
    // the clock: however slowly the player comes in, the clamp is whole a moment later
    expect(interiorEntrySettle(0)).toBe(0);
    expect(interiorEntrySettle(INTERIOR_ENTRY_SETTLE_SEC / 2)).toBeCloseTo(0.5, 9);
    expect(interiorEntrySettle(INTERIOR_ENTRY_SETTLE_SEC)).toBe(1);
    expect(interiorEntrySettle(60)).toBe(1);
    // a room with no door onto the world: always whole
    const closed = cameraInterior('closed', [[0, 4, 0, 4, 0, 4]]);
    expect(interiorEntryWeight(closed, 2, 2, 0.1)).toBe(1);
  });
});
