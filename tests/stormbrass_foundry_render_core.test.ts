// The Stormbrass Foundry's pure render cores (src/render/stormbrass_foundry/
// foundry_plan_core.ts, foundry_fx_core.ts): the floor telegraphs draw the
// edges the sim tests, the strike clock stays cosmetic and bounded, the
// landmark's head never turns past its limit, the gates' motion curves run
// from shut to open, and the lights stay inside the per-zone budget.

import { describe, expect, it } from 'vitest';
import {
  burstDelayForRadius,
  FOUNDRY_OBJECT_SPECS,
  foundryCastFill,
  foundryTelegraphSpecs,
} from '../src/render/stormbrass_foundry/foundry_fx_core';
import {
  boltPath,
  bridgeExtension,
  coilStrikeAt,
  PRIME_DRAFT_LANDMARK,
  planFoundryLights,
  primeDraftHeadYaw,
  STRIKE_PERIOD,
  shutterLift,
} from '../src/render/stormbrass_foundry/foundry_plan_core';
import { STORMBRASS_FOUNDRY_FIELD } from '../src/sim/content/stormbrass_foundry_layout';
import { MOBS } from '../src/sim/data';
import {
  FOUNDRY_BURST_RING,
  FOUNDRY_SCRAP_MARK,
  HAULER_STEAM_BLAST,
  HAULER_TUNING,
} from '../src/sim/encounters/stormbrass_foundry/ids';
import { FOUNDRY_PISTON_SLAM } from '../src/sim/mob/trash_kit/foundry_cast_ids';

describe('Foundry telegraphs draw what the sim tests', () => {
  it('the Piston Slam and Steam Blast cones match the sim reach and arc', () => {
    const specs = foundryTelegraphSpecs();
    expect(specs[FOUNDRY_PISTON_SLAM].range).toBe(MOBS.brass_sentry.breathCone?.range);
    expect(specs[FOUNDRY_PISTON_SLAM].arcDeg).toBe(MOBS.brass_sentry.breathCone?.arcDeg);
    expect(specs[HAULER_STEAM_BLAST].range).toBe(HAULER_TUNING.blastRange);
    expect(specs[HAULER_STEAM_BLAST].arcDeg).toBe(HAULER_TUNING.blastArcDeg);
  });

  it('a burst ring fills over its own mob delay, a scrap mark over the warning', () => {
    expect(burstDelayForRadius(6)).toBe(MOBS.steam_bruiser.trashKit?.deathBurst?.delay);
    expect(burstDelayForRadius(8)).toBe(MOBS.gantry_hauler.trashKit?.deathBurst?.delay);
    expect(FOUNDRY_OBJECT_SPECS[FOUNDRY_BURST_RING].fillSeconds(8)).toBe(2);
    expect(FOUNDRY_OBJECT_SPECS[FOUNDRY_SCRAP_MARK].fillSeconds(5)).toBe(HAULER_TUNING.tossWarning);
    expect(foundryCastFill(1.5, 1.5)).toBe(0);
    expect(foundryCastFill(0, 1.5)).toBe(1);
  });
});

describe('Foundry dressing plan', () => {
  it('the coil strikes every few seconds, bounded, and some beats stay dark', () => {
    let lit = 0;
    let dark = 0;
    for (let beat = 0; beat < 200; beat++) {
      let any = false;
      for (let t = 0; t < STRIKE_PERIOD; t += 0.02) {
        const s = coilStrikeAt(beat * STRIKE_PERIOD + t, 3);
        expect(s.flash).toBeGreaterThanOrEqual(0);
        expect(s.flash).toBeLessThanOrEqual(1);
        expect(s.shape).toBeGreaterThanOrEqual(0);
        expect(s.shape).toBeLessThan(3);
        if (s.flash > 0) any = true;
      }
      if (any) lit++;
      else dark++;
    }
    expect(lit).toBeGreaterThan(120);
    expect(dark).toBeGreaterThan(10);
  });

  it('a bolt runs from the clouds to the coil, tapered to its ends', () => {
    const top = { x: 0, y: 100, z: 0 };
    const bottom = { x: 10, y: 0, z: 5 };
    const p = boltPath(2, top, bottom, 10, 6);
    expect(p).toHaveLength(11);
    expect(p[0]).toEqual(top);
    expect(p[10].x).toBeCloseTo(bottom.x, 6);
    expect(p[10].y).toBe(bottom.y);
  });

  it("the Prime Draft's head follows a viewer but never past its limit", () => {
    const south = primeDraftHeadYaw(PRIME_DRAFT_LANDMARK.x, PRIME_DRAFT_LANDMARK.z - 100);
    expect(south).toBeCloseTo(Math.PI, 6);
    const east = primeDraftHeadYaw(PRIME_DRAFT_LANDMARK.x + 100, PRIME_DRAFT_LANDMARK.z);
    expect(east - Math.PI).toBeCloseTo(-1.05, 6);
    const west = primeDraftHeadYaw(PRIME_DRAFT_LANDMARK.x - 100, PRIME_DRAFT_LANDMARK.z - 60);
    expect(west - Math.PI).toBeGreaterThanOrEqual(-1.05);
    expect(west - Math.PI).toBeLessThanOrEqual(1.05);
  });

  it('the gates run from shut to open: the shutter lifts, the bridge swings then runs', () => {
    expect(shutterLift(0)).toBe(0);
    expect(shutterLift(1)).toBe(1);
    expect(shutterLift(0.5)).toBeCloseTo(0.5, 6);
    expect(bridgeExtension(0)).toEqual({ swing: 0, run: 0 });
    expect(bridgeExtension(0.5)).toEqual({ swing: 1, run: 0 });
    expect(bridgeExtension(1)).toEqual({ swing: 1, run: 1 });
  });

  it('keeps at most eight budgeted lights in any light zone', () => {
    const lights = planFoundryLights();
    for (const zone of STORMBRASS_FOUNDRY_FIELD.lightZones) {
      const inside = lights.filter((l) => Math.hypot(l.x - zone.x, l.z - zone.z) <= zone.r);
      expect(inside.length, zone.id).toBeLessThanOrEqual(8);
    }
  });

  it('stands the landmark inside the slot footprint, behind the Gantry', () => {
    expect(Math.abs(PRIME_DRAFT_LANDMARK.z)).toBeLessThan(245);
    expect(PRIME_DRAFT_LANDMARK.height).toBeGreaterThanOrEqual(40);
  });
});
