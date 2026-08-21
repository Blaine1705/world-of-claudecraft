import { describe, expect, it } from 'vitest';
import {
  VARKHUL_ASSEMBLY_CORE_BASE_DAMAGE,
  VARKHUL_ASSEMBLY_CORE_WINDOW_SECONDS,
  VARKHUL_ASSEMBLY_FORGE_MAX_HP,
  VARKHUL_ASSEMBLY_LINK_ANVIL_TARGET_ORBIT,
  VARKHUL_ASSEMBLY_LINK_ANVIL_TARGET_RADIUS,
  VARKHUL_ASSEMBLY_LINK_ARM_ALIGNMENT_RADIANS,
  VARKHUL_ASSEMBLY_LINK_HAMMER_CONTROL_ORBIT,
  VARKHUL_ASSEMBLY_LINK_HAMMER_CONTROL_RADIUS,
  VARKHUL_ASSEMBLY_LINK_HOLD_SECONDS,
  VARKHUL_ASSEMBLY_LINK_SECONDS_NORMAL,
  VARKHUL_ASSEMBLY_LINK_SYMBOLS,
  VARKHUL_ASSEMBLY_UNSTABLE_REACTION_DAMAGE,
  varkhulAssemblyAnvilTarget,
  varkhulAssemblyAnvilTargetReady,
  varkhulAssemblyArmAligned,
  varkhulAssemblyBestHammerControl,
  varkhulAssemblyBurdenDamageMaxHp,
  varkhulAssemblyFireballPattern,
  varkhulAssemblyHammerControlAt,
  varkhulAssemblyHammerControlPoints,
  varkhulAssemblyLinkAssignments,
  varkhulAssemblyLinkOutcome,
  varkhulAssemblyLinkPad,
  varkhulAssemblyRounds,
  varkhulAssemblyStepArm,
} from '../src/sim/varkhul_assembly';

describe("Varkhul Master's Assembly", () => {
  it('pins the three-core forge break contract', () => {
    expect(VARKHUL_ASSEMBLY_FORGE_MAX_HP).toBe(100);
    expect(VARKHUL_ASSEMBLY_CORE_BASE_DAMAGE).toBe(20);
    expect(VARKHUL_ASSEMBLY_UNSTABLE_REACTION_DAMAGE).toBe(40);
    expect(VARKHUL_ASSEMBLY_CORE_WINDOW_SECONDS).toBe(6);
  });

  it('ramps the carrier burden by two percent per tick with a ten-percent cap', () => {
    expect(varkhulAssemblyBurdenDamageMaxHp(1)).toBe(0.02);
    expect(varkhulAssemblyBurdenDamageMaxHp(3)).toBe(0.06);
    expect(varkhulAssemblyBurdenDamageMaxHp(99)).toBe(0.1);
  });

  it('assigns ten raiders into five deterministic symbol pairs', () => {
    const players = Array.from({ length: 10 }, (_, index) => index + 11);
    const assignments = varkhulAssemblyLinkAssignments(players, 901, 1);
    expect(assignments).toEqual(varkhulAssemblyLinkAssignments(players, 901, 1));
    expect(assignments).toHaveLength(10);
    for (let symbol = 0; symbol < VARKHUL_ASSEMBLY_LINK_SYMBOLS; symbol++) {
      expect(assignments.filter((assignment) => assignment.symbol === symbol)).toEqual([
        expect.objectContaining({ role: 'anvil' }),
        expect.objectContaining({ role: 'hammer' }),
      ]);
    }
  });

  it('gives nine living raiders four pairs and one solo forge echo', () => {
    const livingPlayers = Array.from({ length: 9 }, (_, index) => index + 1);
    const assignments = varkhulAssemblyLinkAssignments(livingPlayers, 55, 0);
    const counts = Array.from(
      { length: VARKHUL_ASSEMBLY_LINK_SYMBOLS },
      (_, symbol) => assignments.filter((assignment) => assignment.symbol === symbol).length,
    );
    expect(assignments).toHaveLength(9);
    expect(counts.filter((count) => count === 2)).toHaveLength(4);
    expect(counts.filter((count) => count === 1)).toHaveLength(1);
  });

  it('places every symbol on a distinct forge ring pad', () => {
    const origin = { x: 50, z: 80 };
    const pads = Array.from({ length: VARKHUL_ASSEMBLY_LINK_SYMBOLS }, (_, symbol) =>
      varkhulAssemblyLinkPad(origin, symbol, 2),
    );
    expect(new Set(pads.map((pad) => `${pad.x.toFixed(4)}:${pad.z.toFixed(4)}`)).size).toBe(5);
    for (const pad of pads) {
      expect(Math.hypot(pad.x - origin.x, pad.z - origin.z)).toBeCloseTo(14, 5);
    }
  });

  it('uses one readable round in both difficulties', () => {
    expect(VARKHUL_ASSEMBLY_LINK_HOLD_SECONDS).toBe(1.5);
    expect(VARKHUL_ASSEMBLY_LINK_SECONDS_NORMAL).toBe(25);
    expect(varkhulAssemblyRounds('normal')).toBe(1);
    expect(varkhulAssemblyRounds('heroic')).toBe(1);
  });

  it('gives Hammer three obvious outer controls: left, brake, and right', () => {
    const forge = { x: 0, z: 0 };
    const pad = varkhulAssemblyLinkPad(forge, 0, 0);
    const controls = varkhulAssemblyHammerControlPoints(forge, pad);
    expect(controls.counterclockwise.x).toBeLessThan(pad.x);
    expect(controls.brake.x).toBeCloseTo(pad.x, 5);
    expect(controls.brake.z).toBeGreaterThan(pad.z);
    expect(controls.clockwise.x).toBeGreaterThan(pad.x);
    expect(
      Math.hypot(controls.counterclockwise.x - pad.x, controls.counterclockwise.z - pad.z),
    ).toBeCloseTo(VARKHUL_ASSEMBLY_LINK_HAMMER_CONTROL_ORBIT, 5);
    expect(varkhulAssemblyHammerControlAt(forge, pad, controls.counterclockwise)).toBe(
      'counterclockwise',
    );
    expect(varkhulAssemblyHammerControlAt(forge, pad, controls.brake)).toBe('brake');
    expect(varkhulAssemblyHammerControlAt(forge, pad, controls.clockwise)).toBe('clockwise');
    expect(
      varkhulAssemblyHammerControlAt(forge, pad, {
        x: controls.brake.x + VARKHUL_ASSEMBLY_LINK_HAMMER_CONTROL_RADIUS,
        z: controls.brake.z,
      }),
    ).toBe('brake');
    expect(
      varkhulAssemblyHammerControlAt(forge, pad, {
        x: controls.brake.x + VARKHUL_ASSEMBLY_LINK_HAMMER_CONTROL_RADIUS + 0.001,
        z: controls.brake.z,
      }),
    ).toBe('off');
    expect(varkhulAssemblyHammerControlAt(forge, pad, pad)).toBe('off');
  });

  it('places Anvil on one bright inner receptacle instead of anywhere in the center', () => {
    const forge = { x: 5, z: 9 };
    const pad = varkhulAssemblyLinkPad(forge, 2, 0);
    const target = varkhulAssemblyAnvilTarget(pad, 2, 0);
    expect(Math.hypot(target.x - pad.x, target.z - pad.z)).toBeCloseTo(
      VARKHUL_ASSEMBLY_LINK_ANVIL_TARGET_ORBIT,
      5,
    );
    expect(varkhulAssemblyAnvilTargetReady(target, target)).toBe(true);
    expect(
      varkhulAssemblyAnvilTargetReady(
        { x: target.x + VARKHUL_ASSEMBLY_LINK_ANVIL_TARGET_RADIUS, z: target.z },
        target,
      ),
    ).toBe(true);
    expect(
      varkhulAssemblyAnvilTargetReady(
        { x: target.x + VARKHUL_ASSEMBLY_LINK_ANVIL_TARGET_RADIUS + 0.001, z: target.z },
        target,
      ),
    ).toBe(false);
  });

  it('rotates while Hammer presses a direction and locks only while braking on target', () => {
    const target = 0;
    const start = Math.PI / 2;
    expect(varkhulAssemblyBestHammerControl(start, target)).toBe('counterclockwise');
    expect(varkhulAssemblyBestHammerControl(-start, target)).toBe('clockwise');
    expect(
      varkhulAssemblyBestHammerControl(VARKHUL_ASSEMBLY_LINK_ARM_ALIGNMENT_RADIANS, target),
    ).toBe('brake');
    expect(varkhulAssemblyStepArm(start, 'counterclockwise', 'normal', 0.5)).toBeLessThan(start);
    expect(varkhulAssemblyStepArm(start, 'clockwise', 'normal', 0.5)).toBeGreaterThan(start);
    expect(varkhulAssemblyStepArm(start, 'brake', 'normal', 0.5)).toBe(start);
    expect(varkhulAssemblyArmAligned(0, target)).toBe(true);
    expect(varkhulAssemblyArmAligned(VARKHUL_ASSEMBLY_LINK_ARM_ALIGNMENT_RADIANS, target)).toBe(
      true,
    );
    expect(
      varkhulAssemblyArmAligned(VARKHUL_ASSEMBLY_LINK_ARM_ALIGNMENT_RADIANS + 0.001, target),
    ).toBe(false);
  });

  it('always resolves the timed interface instead of leaving it open', () => {
    expect(varkhulAssemblyLinkOutcome(5)).toBe('full');
    expect(varkhulAssemblyLinkOutcome(4)).toBe('partial');
    expect(varkhulAssemblyLinkOutcome(3)).toBe('partial');
    expect(varkhulAssemblyLinkOutcome(2)).toBe('failed');
  });

  it('sends more reusable crossing fireballs through the Heroic rune phase', () => {
    const forge = { x: 20, z: 40 };
    const normal = varkhulAssemblyFireballPattern(forge, 'normal', 0, 2);
    const heroic = varkhulAssemblyFireballPattern(forge, 'heroic', 0, 2);
    expect(normal).toHaveLength(3);
    expect(heroic).toHaveLength(5);
    for (const fireball of heroic) {
      expect(Math.hypot(fireball.x - forge.x, fireball.z - forge.z)).toBeCloseTo(31, 5);
      expect(Math.hypot(fireball.dirX, fireball.dirZ)).toBeCloseTo(1, 5);
      expect(
        (fireball.x - forge.x) * fireball.dirX + (fireball.z - forge.z) * fireball.dirZ,
      ).toBeLessThan(0);
    }
  });
});
