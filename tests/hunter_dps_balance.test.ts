import { describe, expect, it } from 'vitest';
import { averageHunterDps } from '../scripts/hunter_dps_probe';

const SEEDS = [29001, 29002, 29003, 29004, 29005];
const SECONDS = 120;

function matrix(targets: number): Record<string, number> {
  return Object.fromEntries(
    (['beast_mastery', 'marksmanship', 'survival'] as const).map((spec) => [
      spec,
      averageHunterDps(spec, targets, SECONDS, SEEDS).dps,
    ]),
  );
}

describe('Hunter v0.29 deterministic DPS alignment', () => {
  it('keeps all three single-target loops within the approved five percent band', () => {
    const dps = matrix(1);
    expect(dps.marksmanship / dps.beast_mastery).toBeGreaterThanOrEqual(0.98);
    expect(dps.marksmanship / dps.beast_mastery).toBeLessThanOrEqual(1.05);
    expect(dps.survival / dps.beast_mastery).toBeGreaterThanOrEqual(0.95);
    expect(dps.survival / dps.beast_mastery).toBeLessThanOrEqual(1.05);
  }, 120_000);

  it('gives Packlord the approved ten to fifteen percent three-target lead', () => {
    const dps = matrix(3);
    const nextBest = Math.max(dps.marksmanship, dps.survival);
    expect(dps.beast_mastery / nextBest).toBeGreaterThanOrEqual(1.1);
    expect(dps.beast_mastery / nextBest).toBeLessThanOrEqual(1.15);
  }, 120_000);
});
