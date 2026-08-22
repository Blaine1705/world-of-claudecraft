// The off-objective edge glow: which screen edge blooms when the player has
// turned away from what the coach is asking for, and how hard.
//
// The load-bearing thing here is the SIDE, because a cue that points the
// wrong way is worse than no cue: it actively sends a new player in the
// wrong direction. So the side is pinned against the compass strip, which
// is the HUD surface that already tells players which way they are looking.

import { describe, expect, it } from 'vitest';
import { compassView } from '../src/ui/compass';
import {
  facingToward,
  GLOW_FULL_DEG,
  GLOW_MIN_DISTANCE_YD,
  GLOW_ONSET_DEG,
  objectiveGlowPlan,
  objectiveGlowPlanAt,
} from '../src/ui/objective_glow_view';

const deg = (d: number) => (d * Math.PI) / 180;

/** Facing values, using the world convention: 0 = +Z = north, and turning
 *  right DECREASES facing, so east is -PI/2. */
const NORTH = 0;
const EAST = -Math.PI / 2;
const SOUTH = Math.PI;
const WEST = Math.PI / 2;

describe('facingToward', () => {
  it('maps the four cardinals the way the compass reads them', () => {
    const origin = { x: 0, z: 0 };
    // The compass calls +x east (bearing 90) and +z north (bearing 0); a
    // facing derived the camera-space way (atan2(dx, dz)) would mirror all
    // four of these and send every cue to the wrong edge.
    expect(facingToward(origin, { x: 0, z: 10 })).toBeCloseTo(NORTH, 6);
    expect(facingToward(origin, { x: 10, z: 0 })).toBeCloseTo(EAST, 6);
    expect(Math.abs(facingToward(origin, { x: 0, z: -10 }))).toBeCloseTo(Math.PI, 6);
    expect(facingToward(origin, { x: -10, z: 0 })).toBeCloseTo(WEST, 6);
  });

  it('is independent of distance', () => {
    const origin = { x: 0, z: 0 };
    expect(facingToward(origin, { x: 3, z: 3 })).toBeCloseTo(
      facingToward(origin, { x: 300, z: 300 }),
      6,
    );
  });
});

describe('objectiveGlowPlan: which edge', () => {
  it('stays quiet while the objective is near enough to centre', () => {
    expect(objectiveGlowPlan(NORTH, NORTH)).toBeNull();
    // Just inside the dead zone on both sides.
    expect(objectiveGlowPlan(NORTH, deg(-(GLOW_ONSET_DEG - 5)))).toBeNull();
    expect(objectiveGlowPlan(NORTH, deg(GLOW_ONSET_DEG - 5))).toBeNull();
  });

  it('blooms the RIGHT edge for an objective to the right, and vice versa', () => {
    // Looking north with the objective due east: east is on your right.
    const east = objectiveGlowPlan(NORTH, EAST);
    expect(east?.side).toBe('right');
    // Looking north with the objective due west: on your left.
    const west = objectiveGlowPlan(NORTH, WEST);
    expect(west?.side).toBe('left');
  });

  it('agrees with the compass strip about which way is right', () => {
    // The decisive cross-check: the compass puts a mark at a POSITIVE
    // offsetFrac when the rose point is to the player's right. The glow must
    // put its bloom on the same side, or the HUD contradicts itself.
    const view = compassView(NORTH);
    const eastMark = view.marks.find((m) => m.label === 'E');
    expect(eastMark, 'east should be inside the strip looking north').toBeTruthy();
    expect(eastMark!.offsetFrac).toBeGreaterThan(0);
    expect(objectiveGlowPlan(NORTH, EAST)?.side).toBe('right');

    const westView = compassView(NORTH);
    const westMark = westView.marks.find((m) => m.label === 'W');
    expect(westMark!.offsetFrac).toBeLessThan(0);
    expect(objectiveGlowPlan(NORTH, WEST)?.side).toBe('left');
  });

  it('holds the same relationship from every viewing angle', () => {
    // Not just from north: rotate the whole frame and the answer must track.
    for (const view of [NORTH, EAST, SOUTH, WEST, deg(37), deg(-149)]) {
      const rightOf = view - deg(90); // turning right decreases facing
      const leftOf = view + deg(90);
      expect(objectiveGlowPlan(view, rightOf)?.side, `view ${view}`).toBe('right');
      expect(objectiveGlowPlan(view, leftOf)?.side, `view ${view}`).toBe('left');
    }
  });

  it('picks a side even when the objective is dead behind', () => {
    const behind = objectiveGlowPlan(NORTH, SOUTH);
    expect(behind).not.toBeNull();
    expect(behind!.intensity).toBe(1);
  });
});

describe('objectiveGlowPlan: how hard', () => {
  it('ramps from nothing at the onset to full at the far edge', () => {
    expect(objectiveGlowPlan(NORTH, deg(GLOW_ONSET_DEG))).toBeNull();
    const justPast = objectiveGlowPlan(NORTH, deg(GLOW_ONSET_DEG + 1));
    expect(justPast!.intensity).toBeGreaterThan(0);
    expect(justPast!.intensity).toBeLessThan(0.1);
    const midway = objectiveGlowPlan(NORTH, deg((GLOW_ONSET_DEG + GLOW_FULL_DEG) / 2));
    expect(midway!.intensity).toBeCloseTo(0.5, 2);
    expect(objectiveGlowPlan(NORTH, deg(GLOW_FULL_DEG))!.intensity).toBe(1);
  });

  it('never exceeds 1, however far past the far edge', () => {
    for (const d of [GLOW_FULL_DEG + 10, 179, 180]) {
      const plan = objectiveGlowPlan(NORTH, deg(d));
      expect(plan!.intensity).toBeLessThanOrEqual(1);
    }
  });

  it('is symmetric: the same angle either side glows equally hard', () => {
    // Turning right DECREASES facing, so the NEGATIVE offset is the right
    // one. Getting this backwards is the exact bug this suite exists to
    // catch, so the assertion states it explicitly rather than by symmetry.
    const right = objectiveGlowPlan(NORTH, deg(-100))!;
    const left = objectiveGlowPlan(NORTH, deg(100))!;
    expect(right.side).toBe('right');
    expect(left.side).toBe('left');
    expect(right.intensity).toBeCloseTo(left.intensity, 10);
  });

  it('refuses a non-finite angle rather than painting a NaN edge', () => {
    expect(objectiveGlowPlan(Number.NaN, NORTH)).toBeNull();
    expect(objectiveGlowPlan(NORTH, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('objectiveGlowPlanAt', () => {
  const player = { x: 0, z: 0 };

  it('reads a world position the same way the angle form does', () => {
    // Looking north, objective due east and far away.
    expect(objectiveGlowPlanAt(NORTH, player, { x: 50, z: 0 })?.side).toBe('right');
    expect(objectiveGlowPlanAt(NORTH, player, { x: -50, z: 0 })?.side).toBe('left');
  });

  it('goes quiet when the player is standing on the objective', () => {
    // The bearing is noise at arm's length, and an edge that flickers as a
    // player shuffles at the turn-in NPC is worse than none.
    expect(objectiveGlowPlanAt(NORTH, player, { x: GLOW_MIN_DISTANCE_YD - 1, z: 0 })).toBeNull();
    expect(objectiveGlowPlanAt(NORTH, player, { x: 0, z: 0 })).toBeNull();
    // ...but resumes a step further out.
    expect(
      objectiveGlowPlanAt(NORTH, player, { x: GLOW_MIN_DISTANCE_YD + 2, z: 0 }),
    ).not.toBeNull();
  });

  it('stays quiet when the player IS facing the objective', () => {
    // The cue has to be self-cancelling: turn toward it and it goes away.
    expect(objectiveGlowPlanAt(NORTH, player, { x: 0, z: 60 })).toBeNull();
    expect(objectiveGlowPlanAt(EAST, player, { x: 60, z: 0 })).toBeNull();
  });
});
