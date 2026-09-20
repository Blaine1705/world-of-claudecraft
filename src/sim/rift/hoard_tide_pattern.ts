import type { TreasureMapRarity } from '../content/treasure_maps';
import { Rng } from '../rng';
import { HOARD_TIDE_WAVE_HALF_GAP } from './hoard_boss_kits';

export interface HoardTidePatternWave {
  facing: number;
  gap: number;
  span: number;
  radius: number;
  lead: number;
  total: number;
}

export const HOARD_TIDE_RECOVERY_SEC = 1;
/** Conservative unbuffed walking speed, including a modest movement penalty. */
export const HOARD_TIDE_ESCAPE_SPEED = 4;

/** Waves never overlap. The next full-lane warning starts only after the previous crest clears. */
export function hoardTidePattern(
  seed: number,
  rarity: TreasureMapRarity,
  enraged: boolean,
): HoardTidePatternWave[] {
  const tier = ['common', 'rare', 'epic', 'legendary'].indexOf(rarity);
  const span = [9, 11, 13, 15][tier];
  const radius = [18, 22, 26, 28][tier];
  const speed = [4, 5, 6, 7][tier];
  const count = tier === 0 ? 1 : enraged && tier >= 2 ? 3 : 2;
  const rng = new Rng(seed);
  const first = rng.int(0, 3);
  const sign = rng.chance(0.5) ? 1 : -1;
  // From ANY point inside the next lane, a straight lateral escape to its gap
  // fits inside the warning. Includes 0.8 seconds reaction time. Outside is safe.
  const lead = (span + 4 - HOARD_TIDE_WAVE_HALF_GAP) / HOARD_TIDE_ESCAPE_SPEED + 0.8;
  return Array.from({ length: count }, (_, index) => ({
    facing: ((first + index) % 4) * Math.PI * 0.5,
    gap: index === 2 ? 0 : (index === 0 ? -4 : 4) * sign,
    span,
    radius,
    lead,
    total: lead + radius / speed,
  }));
}
