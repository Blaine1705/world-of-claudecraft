import type { TreasureMapRarity } from '../content/treasure_maps';
import { Rng } from '../rng';

export interface HoardTidePatternWave {
  facing: number;
  /** Where the lane's escape gap sits across it; HOARD_TIDE_NO_GAP is a solid lane. */
  gap: number;
  span: number;
  radius: number;
  lead: number;
  total: number;
  /** Where this lane's middle sits, as a world offset from the volley's aim point. */
  dx: number;
  dz: number;
}

export const HOARD_TIDE_RECOVERY_SEC = 1;
/** Conservative unbuffed walking speed, including a modest movement penalty. */
export const HOARD_TIDE_ESCAPE_SPEED = 4;
/** A gap position far outside any span: the lane is solid, and narrow enough to
 *  step out of sideways instead. */
export const HOARD_TIDE_NO_GAP = 99;
/** Half the width of one lane. Narrow: the way out is always a few steps sideways. */
export const HOARD_TIDE_LANE_HALF_SPAN = 4.5;
/** Two lanes on the same axis leave this much calm floor between them. */
export const HOARD_TIDE_LANE_CORRIDOR = 5;
/** The crests of one volley leave this long after each other. */
export const HOARD_TIDE_STAGGER_SEC = 0.7;
export const HOARD_TIDE_ENRAGED_STAGGER_SEC = 0.45;
/** Reaction time granted on top of the walk out of a lane. */
const REACTION_SEC = 0.75;

/** One VOLLEY: several narrow lanes laid over the fight at once, in a grid round
 *  the aim point, every telegraph visible from the first moment and the crests
 *  leaving one after another. Lanes on the same axis never touch: a calm corridor
 *  always runs between them. */
export function hoardTidePattern(
  seed: number,
  rarity: TreasureMapRarity,
  enraged: boolean,
): HoardTidePatternWave[] {
  const tier = ['common', 'rare', 'epic', 'legendary'].indexOf(rarity);
  const radius = [22, 24, 26, 28][tier];
  const speed = [8, 9, 10, 11][tier];
  const count = [2, 3, 4, 4][tier];
  const stagger = enraged ? HOARD_TIDE_ENRAGED_STAGGER_SEC : HOARD_TIDE_STAGGER_SEC;
  const rng = new Rng(seed);
  const first = rng.int(0, 3);
  const sign = rng.chance(0.5) ? 1 : -1;
  // The whole grid is nudged so the aim point is never reliably safe or unsafe.
  const nudge = (rng.int(0, 8) - 4) * 0.5;
  const span = HOARD_TIDE_LANE_HALF_SPAN;
  // From the MIDDLE of a lane (the worst place in it) a straight sideways walk
  // clears it inside the warning, reaction time included.
  const lead = (span + 0.6) / HOARD_TIDE_ESCAPE_SPEED + REACTION_SEC;
  const apart = span + HOARD_TIDE_LANE_CORRIDOR / 2;
  return Array.from({ length: count }, (_, index) => {
    const facing = ((first + index) % 4) * Math.PI * 0.5;
    // Lanes 0 and 2 share an axis, as do 1 and 3: each pair sits either side of
    // the aim point. The offset is laid along that axis's own fixed sideways
    // direction, so opposite facings never fold onto the same strip of floor.
    const axis = ((first + (index % 2)) % 4) * Math.PI * 0.5;
    const side = (index < 2 ? -1 : 1) * sign;
    const offset = side * apart + nudge;
    const warn = lead + index * stagger;
    return {
      facing,
      gap: HOARD_TIDE_NO_GAP,
      span,
      radius,
      lead: warn,
      total: warn + radius / speed,
      dx: Math.cos(axis) * offset,
      dz: -Math.sin(axis) * offset,
    };
  });
}
