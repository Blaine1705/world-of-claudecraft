// The Stamping Press gantry's pure plan (src/render/stormbrass_foundry/
// foundry_press_core.ts) and the Scalding Vents' (foundry_vents_core.ts): the
// carriage slides from where it stands to the strip's rail stop and only then
// strikes, on the sim's own warning; the shadow grows as it comes; the vents'
// lanes are the sim's walkways and their look follows the strip templates.

import { describe, expect, it } from 'vitest';
import { TELEGRAPH_THREAT_COLORS } from '../src/render/floor_telegraph/telegraph_look_core';
import {
  beginPressStrike,
  carriageSlide,
  createPressRig,
  HAMMER_FACE_Y,
  HAMMER_HALF_LENGTH,
  HAMMER_HALF_WIDTH,
  HAMMER_TRAVEL,
  hammerDrop,
  PRESS_BITE_SEC,
  PRESS_HOME_Z,
  PRESS_RAIL_STOPS,
  PRESS_RAIL_Y,
  PRESS_SLIDE_SHARE,
  type PressPose,
  pressBeltOf,
  pressPoseInto,
  pressShadow,
  pressStrikeSpan,
  syncPressStrike,
} from '../src/render/stormbrass_foundry/foundry_press_core';
import {
  VENT_GRILLE_HALF,
  VENT_LANE_STYLE,
  VENT_LANES,
  VENT_WALKWAY_COUNT,
  ventEase,
  ventGrilles,
  ventHeatTarget,
  ventJetTarget,
  ventLaneFill,
  ventPhaseOf,
} from '../src/render/stormbrass_foundry/foundry_vents_core';
import {
  MAIN_LINE,
  MAIN_LINE_BELTS,
  STAMPING_PRESS,
} from '../src/sim/content/stormbrass_foundry_layout';
import {
  FOUNDRY_VENT_TEMPLATES,
  onWalkway,
  pressRailStops,
  TOCK_TUNING as T,
  ventFloors,
  walkwayStrips,
} from '../src/sim/encounters/stormbrass_foundry/ids';

const W = T.pressWarning;
const pose = (): PressPose => ({ z: 0, drop: 0, shadow: 0, moving: 0 });

describe('the press gantry plan', () => {
  it('builds on the sim: its stops are the rail stops, its hammer the strip footprint', () => {
    expect(PRESS_RAIL_STOPS).toEqual(pressRailStops(MAIN_LINE_BELTS));
    expect(PRESS_RAIL_STOPS).toContain(PRESS_HOME_Z);
    expect(HAMMER_HALF_LENGTH * 2).toBe(T.pressLength);
    expect(HAMMER_HALF_WIDTH).toBeGreaterThanOrEqual(MAIN_LINE_BELTS.halfWidth);
    // The raised hammer hangs well over a player's head and under its rail,
    // and its fall ends on the belt.
    expect(HAMMER_FACE_Y).toBeGreaterThan(8);
    expect(PRESS_RAIL_Y).toBeGreaterThan(HAMMER_FACE_Y + 3);
    expect(HAMMER_FACE_Y - HAMMER_TRAVEL).toBeGreaterThan(0);
    expect(HAMMER_FACE_Y - HAMMER_TRAVEL).toBeLessThan(0.5);
    MAIN_LINE_BELTS.xs.forEach((x, i) => {
      expect(pressBeltOf(x)).toBe(i);
      expect(pressBeltOf(x + 2)).toBe(i);
    });
  });

  it('slides first, strikes exactly at the warning, bites, then climbs', () => {
    const parked = W * PRESS_SLIDE_SHARE;
    expect(carriageSlide(0, W)).toBe(0);
    expect(carriageSlide(parked / 2, W)).toBeCloseTo(0.5, 6);
    expect(carriageSlide(parked, W)).toBe(1);
    expect(carriageSlide(W, W)).toBe(1);
    // The hammer never falls while the carriage travels.
    for (let t = 0; t < parked; t += 0.05) expect(hammerDrop(t, W)).toBe(0);
    // Parked: the wind-up lifts it (negative), and it is still up a blink
    // before the hit, so the strip stays an honest dodge to the end.
    expect(hammerDrop(W - 0.3, W)).toBeLessThan(0);
    expect(hammerDrop(W - 0.13, W)).toBeLessThan(0);
    expect(hammerDrop(W, W)).toBe(1);
    expect(hammerDrop(W + PRESS_BITE_SEC - 0.01, W)).toBe(1);
    expect(hammerDrop(W + PRESS_BITE_SEC + 0.6, W)).toBeGreaterThan(0);
    expect(hammerDrop(W + PRESS_BITE_SEC + 0.6, W)).toBeLessThan(1);
    expect(hammerDrop(pressStrikeSpan(W), W)).toBe(0);
    expect(hammerDrop(-1, W)).toBe(0);
  });

  it('the shadow grows as the carriage arrives and is full at the slam', () => {
    let last = -1;
    for (let t = 0; t <= W + 1e-9; t += 0.05) {
      const s = pressShadow(t, W);
      expect(s).toBeGreaterThanOrEqual(last - 1e-9);
      last = s;
    }
    expect(pressShadow(0, W)).toBe(0);
    expect(pressShadow(W * PRESS_SLIDE_SHARE, W)).toBeCloseTo(0.3, 6);
    expect(pressShadow(W, W)).toBe(1);
    expect(pressShadow(pressStrikeSpan(W), W)).toBe(0);
  });

  it('a carriage leaves from where it stands, parks on the strip and stays there', () => {
    const rig = createPressRig();
    const c = rig[1];
    const out = pose();
    expect(pressPoseInto(c, 5, W, out).z).toBe(PRESS_HOME_Z);
    expect(out.drop).toBe(0);
    expect(out.shadow).toBe(0);
    beginPressStrike(c, -31, 10, 77);
    expect(pressPoseInto(c, 10, W, out).z).toBe(PRESS_HOME_Z);
    // Halfway through the slide it is between the two, heading down the rail.
    pressPoseInto(c, 10 + (W * PRESS_SLIDE_SHARE) / 2, W, out);
    expect(out.z).toBeCloseTo((PRESS_HOME_Z - 31) / 2, 6);
    expect(out.moving).toBe(-1);
    expect(out.drop).toBe(0);
    pressPoseInto(c, 10 + W * PRESS_SLIDE_SHARE, W, out);
    expect(out.z).toBe(-31);
    expect(out.moving).toBe(0);
    pressPoseInto(c, 10 + W, W, out);
    expect(out.z).toBe(-31);
    expect(out.drop).toBe(1);
    // The strike over, it idles on that stop; the next strike leaves from it.
    pressPoseInto(c, 10 + pressStrikeSpan(W) + 0.1, W, out);
    expect(c.at).toBe(-1);
    expect(out.z).toBe(-31);
    expect(out.drop).toBe(0);
    beginPressStrike(c, -13, 30, 78);
    expect(c.from).toBe(-31);
    pressPoseInto(c, 30 + (W * PRESS_SLIDE_SHARE) / 2, W, out);
    expect(out.moving).toBe(1);
    // The other carriages never moved.
    expect(pressPoseInto(rig[0], 31, W, out).z).toBe(PRESS_HOME_Z);
  });

  it("syncs the slam onto the sim's hit, never rewinding one that already fell", () => {
    const c = createPressRig()[0];
    const out = pose();
    beginPressStrike(c, -21, 10, 5);
    // The strip was seen a tenth late: the hit lands while the rig reads 2.4 s.
    syncPressStrike(c, 10 + W - 0.1, W);
    expect(pressPoseInto(c, 10 + W - 0.1, W, out).drop).toBe(1);
    expect(out.z).toBe(-21);
    const late = createPressRig()[0];
    beginPressStrike(late, -21, 10, 6);
    syncPressStrike(late, 10 + W + 0.2, W);
    expect(late.at).toBe(10);
    // Idle carriages ignore a stray hit.
    const idle = createPressRig()[0];
    syncPressStrike(idle, 50, W);
    expect(idle.at).toBe(-1);
  });
});

describe("the Scalding Vents' plan", () => {
  it('lays one lane on every floor the sim scalds: the walkways, the apron, the lip', () => {
    const ways = walkwayStrips(MAIN_LINE, MAIN_LINE_BELTS);
    const floors = ventFloors(MAIN_LINE, MAIN_LINE_BELTS);
    expect(VENT_WALKWAY_COUNT).toBe(ways.length);
    expect(VENT_LANES).toHaveLength(floors.length);
    expect(floors.length).toBe(ways.length + 2);
    VENT_LANES.forEach((lane, i) => {
      expect(lane.x - lane.halfWidth).toBeCloseTo(floors[i].x0, 6);
      expect(lane.x + lane.halfWidth).toBeCloseTo(floors[i].x1, 6);
      expect(lane.z0).toBe(floors[i].z0);
      expect(lane.z0 + lane.length).toBe(floors[i].z1);
    });
    // The walkway lanes lead (the strip objects' order: lane 0 is the west
    // walkway the painter takes its origin from), running the belts' length.
    for (let i = 0; i < ways.length; i++) {
      expect(VENT_LANES[i].x - VENT_LANES[i].halfWidth).toBeCloseTo(ways[i].x0, 6);
      expect(VENT_LANES[i].z0).toBe(MAIN_LINE_BELTS.z0);
      expect(VENT_LANES[i].z0 + VENT_LANES[i].length).toBe(MAIN_LINE_BELTS.z1);
    }
    // The telegraph leaves no unpainted hazard: every non-belt spot of the
    // Main Line lies inside a lane, and no lane covers a belt.
    const inLane = (x: number, z: number) =>
      VENT_LANES.some(
        (l) =>
          Math.abs(x - l.x) <= l.halfWidth + 1e-9 &&
          z >= l.z0 - 1e-9 &&
          z <= l.z0 + l.length + 1e-9,
      );
    for (let x = MAIN_LINE.x0 + 0.25; x < MAIN_LINE.x1; x += 0.5)
      for (let z = MAIN_LINE.z0 + 0.25; z < MAIN_LINE.z1; z += 0.5)
        expect(inLane(x, z), `${x}, ${z}`).toBe(onWalkway(MAIN_LINE, MAIN_LINE_BELTS, x, z));
    expect(VENT_LANE_STYLE.color).toBe(TELEGRAPH_THREAT_COLORS.danger);
  });

  it('every grille sits wholly on a walkway the sim scalds, staggered between neighbours', () => {
    const grilles = ventGrilles();
    expect(grilles.length).toBeGreaterThanOrEqual(40);
    for (const g of grilles) {
      for (const dx of [-VENT_GRILLE_HALF, VENT_GRILLE_HALF])
        for (const dz of [-VENT_GRILLE_HALF, VENT_GRILLE_HALF])
          expect(onWalkway(MAIN_LINE, MAIN_LINE_BELTS, g.x + dx, g.z + dz)).toBe(true);
      expect(g.seed).toBeGreaterThanOrEqual(0);
      expect(g.seed).toBeLessThan(1);
    }
    const first = (lane: number) =>
      Math.min(...grilles.filter((g) => g.x === VENT_LANES[lane].x).map((g) => g.z));
    expect(first(0)).not.toBeCloseTo(first(1), 3);
    // The press-end apron has its own grilles, clear of the press posts.
    const apron = grilles.filter((g) => g.z > MAIN_LINE_BELTS.z1);
    expect(apron.length).toBeGreaterThanOrEqual(10);
    for (const g of apron)
      for (const x of STAMPING_PRESS.postXs)
        expect(Math.hypot(g.x - x, g.z - STAMPING_PRESS.z)).toBeGreaterThan(
          STAMPING_PRESS.postR + VENT_GRILLE_HALF,
        );
  });

  it('reads the phase off the strip template and runs the look with it', () => {
    expect(ventPhaseOf(FOUNDRY_VENT_TEMPLATES.warn)).toBe('warn');
    expect(ventPhaseOf(FOUNDRY_VENT_TEMPLATES.scald)).toBe('scald');
    expect(ventPhaseOf('foundry_press_strip')).toBe('off');
    expect(ventPhaseOf(undefined)).toBe('off');
    // The floor warning counts the warning down, then stands full.
    expect(ventLaneFill('warn', 0)).toBe(0);
    expect(ventLaneFill('warn', T.ventWarning / 2)).toBeCloseTo(0.5, 6);
    expect(ventLaneFill('warn', T.ventWarning)).toBe(1);
    expect(ventLaneFill('scald', 0)).toBe(1);
    expect(ventLaneFill('off', 3)).toBe(0);
    // A sputter through the warning, the full column while it scalds.
    expect(ventJetTarget('off', 1)).toBe(0);
    expect(ventJetTarget('warn', 0)).toBeGreaterThan(0);
    expect(ventJetTarget('warn', T.ventWarning)).toBeLessThan(0.3);
    expect(ventJetTarget('scald', 0)).toBe(1);
    expect(ventJetTarget('scald', T.ventScald - 0.1)).toBeLessThan(1);
    expect(ventHeatTarget('off', 0)).toBe(0);
    expect(ventHeatTarget('warn', T.ventWarning)).toBeLessThan(1);
    expect(ventHeatTarget('scald', 2)).toBe(1);
  });

  it('the jets burst fast and die away slower', () => {
    const up = ventEase(0, 1, 0.1);
    const down = 1 - ventEase(1, 0, 0.1);
    expect(up).toBeGreaterThan(0.7);
    expect(down).toBeLessThan(0.35);
    expect(ventEase(0.4, 0.4, 0.1)).toBeCloseTo(0.4, 9);
    expect(ventEase(0.4, 1, 0)).toBe(0.4);
  });
});
