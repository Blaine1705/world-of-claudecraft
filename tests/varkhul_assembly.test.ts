import { describe, expect, it } from 'vitest';
import {
  VARKHUL_ASSEMBLY_CORE_BASE_DAMAGE,
  VARKHUL_ASSEMBLY_CORE_WINDOW_SECONDS,
  VARKHUL_ASSEMBLY_FORGE_MAX_HP,
  VARKHUL_ASSEMBLY_RUNE_ALIGNMENT_RADIANS,
  VARKHUL_ASSEMBLY_RUNE_COUNT,
  VARKHUL_ASSEMBLY_RUNE_INNER_CONTROL_RADIUS,
  VARKHUL_ASSEMBLY_RUNE_OUTER_CONTROL_INNER_RADIUS,
  VARKHUL_ASSEMBLY_RUNE_OUTER_CONTROL_OUTER_RADIUS,
  VARKHUL_ASSEMBLY_RUNE_STATION_DISTANCE,
  VARKHUL_ASSEMBLY_UNSTABLE_REACTION_DAMAGE,
  varkhulAssemblyBurdenDamageMaxHp,
  varkhulAssemblyFireballPattern,
  varkhulAssemblyRounds,
  varkhulAssemblyRuneAligned,
  varkhulAssemblyRuneAssignments,
  varkhulAssemblyRuneControlAt,
  varkhulAssemblyRuneOutcome,
  varkhulAssemblyRuneSeconds,
  varkhulAssemblyRuneStartAngle,
  varkhulAssemblyRuneStation,
  varkhulAssemblyRuneTargetAngle,
  varkhulAssemblyStepRune,
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

  it('assigns ten raiders ten deterministic and unique rune symbols', () => {
    const players = Array.from({ length: 10 }, (_, index) => index + 11);
    const assignments = varkhulAssemblyRuneAssignments(players, 901, 1);
    expect(assignments).toEqual(varkhulAssemblyRuneAssignments(players, 901, 1));
    expect(assignments).toHaveLength(VARKHUL_ASSEMBLY_RUNE_COUNT);
    expect(new Set(assignments.map((assignment) => assignment.playerId)).size).toBe(10);
    expect(new Set(assignments.map((assignment) => assignment.symbol)).size).toBe(10);
    expect(assignments.map((assignment) => assignment.symbol).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 10 }, (_, index) => index),
    );
  });

  it('keeps all ten rune stations on a wide ring around the room, not the forge', () => {
    const origin = { x: 50, z: 80 };
    const stations = Array.from({ length: VARKHUL_ASSEMBLY_RUNE_COUNT }, (_, symbol) =>
      varkhulAssemblyRuneStation(origin, symbol, 2),
    );
    expect(
      new Set(stations.map((station) => `${station.x.toFixed(4)}:${station.z.toFixed(4)}`)).size,
    ).toBe(10);
    for (const station of stations) {
      expect(Math.hypot(station.x - origin.x, station.z - origin.z)).toBeCloseTo(
        VARKHUL_ASSEMBLY_RUNE_STATION_DISTANCE,
        5,
      );
    }
  });

  it('uses the inner zone for left rotation, the outer annulus for right rotation, and neutral space to stop', () => {
    const station = { x: 4, z: 9 };
    expect(
      varkhulAssemblyRuneControlAt(station, {
        x: station.x + VARKHUL_ASSEMBLY_RUNE_INNER_CONTROL_RADIUS,
        z: station.z,
      }),
    ).toBe('counterclockwise');
    expect(
      varkhulAssemblyRuneControlAt(station, {
        x: station.x + VARKHUL_ASSEMBLY_RUNE_INNER_CONTROL_RADIUS + 0.001,
        z: station.z,
      }),
    ).toBe('off');
    expect(
      varkhulAssemblyRuneControlAt(station, {
        x: station.x + VARKHUL_ASSEMBLY_RUNE_OUTER_CONTROL_INNER_RADIUS,
        z: station.z,
      }),
    ).toBe('clockwise');
    expect(
      varkhulAssemblyRuneControlAt(station, {
        x: station.x + VARKHUL_ASSEMBLY_RUNE_OUTER_CONTROL_OUTER_RADIUS,
        z: station.z,
      }),
    ).toBe('clockwise');
    expect(
      varkhulAssemblyRuneControlAt(station, {
        x: station.x + VARKHUL_ASSEMBLY_RUNE_OUTER_CONTROL_OUTER_RADIUS + 0.001,
        z: station.z,
      }),
    ).toBe('off');
  });

  it('gives every rune a deterministic random-looking target and a separated start angle', () => {
    const targets = Array.from({ length: VARKHUL_ASSEMBLY_RUNE_COUNT }, (_, symbol) =>
      varkhulAssemblyRuneTargetAngle(901, symbol, 1),
    );
    expect(targets).toEqual(
      Array.from({ length: VARKHUL_ASSEMBLY_RUNE_COUNT }, (_, symbol) =>
        varkhulAssemblyRuneTargetAngle(901, symbol, 1),
      ),
    );
    expect(new Set(targets.map((angle) => angle.toFixed(4))).size).toBeGreaterThanOrEqual(8);
    targets.forEach((target, symbol) => {
      const start = varkhulAssemblyRuneStartAngle(901, symbol, 1);
      expect(varkhulAssemblyRuneAligned(start, target)).toBe(false);
      expect(
        Math.abs(Math.atan2(Math.sin(start - target), Math.cos(start - target))),
      ).toBeGreaterThan(Math.PI / 2);
    });
  });

  it('rotates in both directions, stops in neutral space, and snaps when it crosses the socket', () => {
    const target = 0;
    const start = -0.2;
    expect(varkhulAssemblyStepRune(start, 'off', 'normal', 0.5, target)).toBe(start);
    expect(varkhulAssemblyStepRune(start, 'counterclockwise', 'normal', 0.05, target)).toBeLessThan(
      start,
    );
    expect(varkhulAssemblyStepRune(start, 'clockwise', 'normal', 0.05, target)).toBeGreaterThan(
      start,
    );
    expect(varkhulAssemblyStepRune(-0.01, 'clockwise', 'normal', 1, target)).toBe(target);
    expect(varkhulAssemblyStepRune(0.01, 'counterclockwise', 'normal', 1, target)).toBe(target);
    expect(varkhulAssemblyRuneAligned(VARKHUL_ASSEMBLY_RUNE_ALIGNMENT_RADIANS, target)).toBe(true);
    expect(
      varkhulAssemblyRuneAligned(VARKHUL_ASSEMBLY_RUNE_ALIGNMENT_RADIANS + 0.001, target),
    ).toBe(false);
  });

  it('always resolves the timed interface against the number of assigned runes', () => {
    expect(varkhulAssemblyRuneOutcome(10)).toBe('full');
    expect(varkhulAssemblyRuneOutcome(9)).toBe('partial');
    expect(varkhulAssemblyRuneOutcome(6)).toBe('partial');
    expect(varkhulAssemblyRuneOutcome(5)).toBe('failed');
  });

  it('uses one readable round in both difficulties', () => {
    expect(varkhulAssemblyRounds('normal')).toBe(1);
    expect(varkhulAssemblyRounds('heroic')).toBe(1);
    expect(varkhulAssemblyRuneSeconds('normal')).toBe(25);
    expect(varkhulAssemblyRuneSeconds('heroic')).toBe(22);
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
