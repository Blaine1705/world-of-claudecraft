// The Stormbrass Foundry's pure render cores (src/render/stormbrass_foundry/
// foundry_plan_core.ts, foundry_fx_core.ts): the floor telegraphs draw the
// edges the sim tests, the strike clock stays cosmetic and bounded, the
// landmark's head never turns past its limit, the gates' motion curves run
// from shut to open, and the lights stay inside the per-zone budget.

import { describe, expect, it } from 'vitest';
import { TELEGRAPH_THREAT_COLORS } from '../src/render/floor_telegraph/telegraph_look_core';
import {
  aimedLane,
  beltLooks,
  burstDelayForRadius,
  FOUNDRY_AIMED_LANES,
  FOUNDRY_AURA_MARKERS,
  FOUNDRY_MECHANIC_COLORS,
  FOUNDRY_OBJECT_SPECS,
  FOUNDRY_PRESS_STRIP_SPEC,
  foundryCastFill,
  foundryTelegraphSpecs,
  hatchPulse,
  platingRings,
  pulseFront,
  storedChargeFill,
  storedChargeGlow,
  storedChargeRadius,
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
import {
  MAIN_LINE_BELTS,
  STORMBRASS_FOUNDRY_FIELD,
} from '../src/sim/content/stormbrass_foundry_layout';
import { MOBS } from '../src/sim/data';
import {
  DRAFT_ARM_SWEEP,
  DRAFT_CELL_CARRY,
  DRAFT_TREMOR_STEP,
  DRAFT_TUNING,
  DRAFT_UNBOLT,
  FOUNDRY_BELT_TEMPLATES,
  FOUNDRY_BURST_RING,
  FOUNDRY_CELL_TEMPLATES,
  FOUNDRY_COIL_STRIKE_MARK,
  FOUNDRY_FIST_MARK,
  FOUNDRY_HATCH_TEMPLATES,
  FOUNDRY_SCRAP_MARK,
  FOUNDRY_SHELL_MARK,
  FOUNDRY_SHELL_PENDING,
  HAULER_STEAM_BLAST,
  HAULER_TUNING,
  RANGE_PROOF_SHOT,
  RANGE_TARGET_LOCK,
  RANGE_TUNING,
  TOCK_TUNING,
  VOLTAIC_CHARGED,
  VOLTAIC_GROUNDED,
  VOLTAIC_TUNING,
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

describe('Foundry boss telegraphs draw what the sim tests (phase 2)', () => {
  it('the bars and marks size and time from the encounter tuning', () => {
    const specs = foundryTelegraphSpecs();
    expect(specs[DRAFT_ARM_SWEEP].range).toBe(DRAFT_TUNING.sweepRange);
    expect(specs[DRAFT_ARM_SWEEP].arcDeg).toBe(DRAFT_TUNING.sweepArcDeg);
    expect(specs[DRAFT_TREMOR_STEP].range).toBe(DRAFT_TUNING.tremorRadius);
    expect(specs[DRAFT_UNBOLT].range).toBe(DRAFT_TUNING.rivetShowerRadius);
    expect(FOUNDRY_OBJECT_SPECS[FOUNDRY_SHELL_MARK].fillSeconds(5)).toBe(RANGE_TUNING.shellWarning);
    expect(FOUNDRY_OBJECT_SPECS[FOUNDRY_FIST_MARK].fillSeconds(8)).toBe(DRAFT_TUNING.fistWarning);
    expect(FOUNDRY_OBJECT_SPECS[FOUNDRY_COIL_STRIKE_MARK].fillSeconds(4)).toBe(
      VOLTAIC_TUNING.strikeWarning,
    );
    expect(FOUNDRY_PRESS_STRIP_SPEC.fillSeconds).toBe(TOCK_TUNING.pressWarning);
    expect(FOUNDRY_PRESS_STRIP_SPEC.halfWidth).toBe(MAIN_LINE_BELTS.halfWidth);
    // The things to take or reach are glyphs, never a threat colour.
    expect(FOUNDRY_OBJECT_SPECS[FOUNDRY_CELL_TEMPLATES.ready].sigil).toBe(true);
    expect(FOUNDRY_OBJECT_SPECS[FOUNDRY_HATCH_TEMPLATES.open].color).toBe(
      FOUNDRY_MECHANIC_COLORS.hatchOpen,
    );
    // No floor ring follows a marked runner (it read as the landing circle):
    // the Target Lock is the crosshair over the head.
    expect(FOUNDRY_AURA_MARKERS[RANGE_TARGET_LOCK]).toBeUndefined();
    expect(FOUNDRY_AURA_MARKERS[DRAFT_CELL_CARRY]).toBeDefined();
  });

  it('a shell circle reads dim for its lag, then lethal red for its last beat', () => {
    const pending = FOUNDRY_OBJECT_SPECS[FOUNDRY_SHELL_PENDING];
    const red = FOUNDRY_OBJECT_SPECS[FOUNDRY_SHELL_MARK];
    expect(pending.fillSeconds(5)).toBe(RANGE_TUNING.shellLag);
    expect(pending.color).toBe(TELEGRAPH_THREAT_COLORS.danger);
    expect(pending.fade ?? 1).toBeLessThan(1);
    expect(pending.sigil).not.toBe(true);
    expect(red.color).toBe(TELEGRAPH_THREAT_COLORS.lethal);
    expect(red.fade ?? 1).toBe(1);
  });

  it('the Proof Shot paints a lethal lane from the Rangewarden to its target', () => {
    const lane = FOUNDRY_AIMED_LANES[RANGE_PROOF_SHOT];
    expect(lane.color).toBe(TELEGRAPH_THREAT_COLORS.lethal);
    expect(lane.halfWidth).toBeGreaterThan(0.5);
    // Due east, 10 yd; due north, 3 yd; point blank still reads.
    expect(aimedLane(0, 0, 10, 0).yaw).toBeCloseTo(Math.PI / 2, 9);
    expect(aimedLane(0, 0, 10, 0).length).toBeCloseTo(10, 9);
    expect(aimedLane(5, 5, 5, 8).yaw).toBeCloseTo(0, 9);
    expect(aimedLane(5, 5, 5, 8).length).toBeCloseTo(3, 9);
    expect(aimedLane(1, 1, 1, 1).length).toBe(2);
  });

  it('the open hatch pulses, the shut and shuddering ones do not', () => {
    expect(FOUNDRY_OBJECT_SPECS[FOUNDRY_HATCH_TEMPLATES.open].pulse).toBe(true);
    expect(FOUNDRY_OBJECT_SPECS[FOUNDRY_HATCH_TEMPLATES.warn].pulse).not.toBe(true);
    expect(FOUNDRY_OBJECT_SPECS[FOUNDRY_HATCH_TEMPLATES.closed].pulse).not.toBe(true);
    for (let t = 0; t < 3; t += 0.07) {
      expect(hatchPulse(t)).toBeGreaterThanOrEqual(0);
      expect(hatchPulse(t)).toBeLessThanOrEqual(1);
      // Always brighter than a plain ring's rim.
      expect(pulseFront(t)).toBeGreaterThanOrEqual(1);
    }
    expect(pulseFront(Math.PI / 24)).toBeGreaterThan(2);
  });

  it('the belts scroll with their objects: heading, Overtime speed, the klaxon red, idle', () => {
    expect(beltLooks([])).toEqual([0, 1, 2, 3].map(() => ({ dir: 0, alarm: 0 })));
    const looks = beltLooks([
      { x: 15, templateId: FOUNDRY_BELT_TEMPLATES.run, facing: 0, scale: 5 },
      { x: -15, templateId: FOUNDRY_BELT_TEMPLATES.alarm, facing: Math.PI, scale: 3 },
      { x: -5, templateId: FOUNDRY_BELT_TEMPLATES.idle, facing: 0, scale: 1 },
      { x: 5, templateId: FOUNDRY_BELT_TEMPLATES.run, facing: 0, scale: 3 },
    ]);
    expect(looks[0]).toEqual({ dir: -1, alarm: 1 });
    expect(looks[1]).toEqual({ dir: 0, alarm: 0 });
    expect(looks[2]).toEqual({ dir: 1, alarm: 0 });
    expect(looks[3].dir).toBeCloseTo(5 / 3, 6);
  });

  it('the plating ring reads the face, and splits front and back on heroic', () => {
    expect(platingRings([{ id: VOLTAIC_GROUNDED }])).toEqual([
      { color: FOUNDRY_MECHANIC_COLORS.grounded, arcDeg: 360, yaw: 0 },
    ]);
    const split = platingRings([{ id: VOLTAIC_CHARGED, value2: 1 }]);
    expect(split.map((r) => r.color)).toEqual([
      FOUNDRY_MECHANIC_COLORS.charged,
      FOUNDRY_MECHANIC_COLORS.grounded,
    ]);
    expect(split.map((r) => r.arcDeg)).toEqual([180, 180]);
    expect(platingRings([{ id: 'something_else' }])).toEqual([]);
    expect(storedChargeFill(500, 2000)).toBe(0.25);
    expect(storedChargeFill(9000, 2000)).toBe(1);
    expect(storedChargeFill(undefined, 2000)).toBe(0);
  });

  it('the Stored Charge glow and ring grow with the bank, and are dark with none', () => {
    const none = storedChargeGlow(0);
    expect(none.glow).toBe(0);
    expect(none.floorArcs).toBe(0);
    let prev = storedChargeGlow(0.01);
    expect(prev.glow).toBeGreaterThan(0);
    expect(prev.floorArcs).toBeGreaterThanOrEqual(1);
    for (const f of [0.25, 0.5, 0.75, 1]) {
      const g = storedChargeGlow(f);
      expect(g.glow).toBeGreaterThan(prev.glow);
      expect(g.reach).toBeGreaterThan(prev.reach);
      expect(g.width).toBeGreaterThan(prev.width);
      expect(g.arcChance).toBeGreaterThan(prev.arcChance);
      expect(g.floorArcs).toBeGreaterThanOrEqual(prev.floorArcs);
      prev = g;
    }
    // Bounded: a bank past full reads as full.
    expect(storedChargeGlow(7)).toEqual(storedChargeGlow(1));
    expect(storedChargeGlow(1).arcChance).toBeLessThanOrEqual(1);
    expect(storedChargeRadius(0)).toBe(4.5);
    expect(storedChargeRadius(1)).toBeGreaterThan(storedChargeRadius(0.5));
    expect(storedChargeRadius(9)).toBe(storedChargeRadius(1));
  });
});
