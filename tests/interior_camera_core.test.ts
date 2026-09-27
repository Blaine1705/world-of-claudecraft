import { describe, expect, it } from 'vitest';
import {
  cameraInterior,
  chooseInteriorFraming,
  frameBoomInto,
  INTERIOR_BOOM_RELEASE_RATE,
  INTERIOR_COMFORT_BOOM,
  INTERIOR_LIFT_MAX_PITCH,
  interiorCameraPadding,
  interiorContains,
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
// nameplate sight line out through an opening only, the pad and the boom's pull-in/release.

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
    // in a tall shaft the lift alone does it, the heading kept
    const shaft = cameraInterior('shaft', [[0, 3, 0, 30, 0, 3]]);
    const up = chooseInteriorFraming(shaft, 1.5, 2, 1.5, 8, 1, 0, 0.3, 0);
    expect(up.swing).toBe(0);
    expect(up.lift).toBeGreaterThan(0);
  });

  it('pulls in at once and eases out at the release rate', () => {
    expect(stepInteriorBoom(8, 3, 1 / 60, false)).toBe(3);
    const out = stepInteriorBoom(3, 8, 1 / 60, false);
    expect(out).toBeGreaterThan(3);
    expect(out).toBeLessThan(8);
    expect(out).toBeCloseTo(3 + 5 * (1 - Math.exp(-INTERIOR_BOOM_RELEASE_RATE / 60)), 9);
    expect(stepInteriorBoom(3, 8, 1 / 60, true)).toBe(8);
  });
});
