// The plan of Laverock's finale (src/render/drowned_temple/temple_cantor_finale_core.ts):
// the fallen rise one after another across the song, deterministically, each
// shedding motes that lift and drift toward the moon (north).

import { describe, expect, it } from 'vitest';
import {
  MOON_DRIFT,
  moteBudget,
  RISE_LEAD_SEC,
  RISE_SPREAD_SEC,
  riseMote,
  riseSchedule,
  songMote,
} from '../src/render/drowned_temple/temple_cantor_finale_core';

describe('the finale plan', () => {
  it('staggers every fallen across the song window, none at once, malformed spots dropped', () => {
    const spots: number[] = [];
    for (let i = 0; i < 30; i++) spots.push(i * 3, 1, -i * 4);
    spots.push(Number.NaN, 0, 0);
    const plan = riseSchedule(spots, 100);
    expect(plan).toHaveLength(30);
    for (const s of plan) {
      expect(s.at).toBeGreaterThanOrEqual(100 + RISE_LEAD_SEC);
      expect(s.at).toBeLessThan(100 + RISE_LEAD_SEC + RISE_SPREAD_SEC);
    }
    const times = plan.map((s) => s.at).sort((a, b) => a - b);
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThan(0.05);
    expect(riseSchedule(spots, 100)).toEqual(plan);
  });

  it('a mote rises and drifts toward the moon, the same every time', () => {
    const [spot] = riseSchedule([10, 2, 20], 0);
    for (let k = 0; k < 40; k++) {
      const m = riseMote(spot, 0, k);
      expect(m.vy).toBeGreaterThan(0);
      expect(Math.sign(m.vz)).toBe(Math.sign(MOON_DRIFT.z));
      expect(Math.hypot(m.x - spot.x, m.z - spot.z)).toBeLessThan(1);
      expect(m).toEqual(riseMote(spot, 0, k));
    }
    const s = songMote(0, 12, 0, 3);
    expect(s.vy).toBeGreaterThan(0);
    expect(Math.hypot(s.x, s.z)).toBeLessThan(7);
  });

  it('carries the fraction of a mote between frames', () => {
    let debt = 0;
    let total = 0;
    for (let i = 0; i < 60; i++) {
      const b = moteBudget(debt, 1 / 60, 9);
      debt = b.debt;
      total += b.count;
    }
    expect(total).toBe(9);
  });
});
