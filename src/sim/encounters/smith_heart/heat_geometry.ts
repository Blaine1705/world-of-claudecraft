// The Guardian of the Heat's geometry (docs/design/raid/smith_heart.md
// section 7.4): PURE over the layout (no SimContext, no rng), so the raid
// bots' tactics and the renderer can reuse it. Instance-local yards.
//
//   the floor      the Hearth's eight-sided hall (`FORGE_POINTS`, the
//                  `smiths_forge` surface): the fight's players stand on it
//   the wellspring `HEARTH_WELL` at the foot of the altar-stone: the
//                  guardian stands in it, whoever steps in burns, and
//                  everything is measured from its middle (Hearth Flare's
//                  reach, Wakefire's bands, the overflow's rivers)
//   the lanes      Basalt Fist's three Molten Swell lanes and the overflow's
//                  rivers: who stands in one, and where a wave's wall is
//   the posts      where the Wellspawn climb out, the Wellkeepers rise, the
//                  spirits stand, the Stone Roots grow, and the shore points
//                  the spirits' ice and the blazes pick from

import { FORGE_POINTS, HEARTH_WELL } from '../../content/smith_heart_layout';
import { HEAT_TUNING as T, ZONE_BANDS } from './heat_ids';

export interface HPoint {
  x: number;
  z: number;
}

export interface HBody extends HPoint {
  id: number;
}

/** Is (x, z) on the Hearth's floor (its eight-sided hall)? */
export function inHearthFloor(x: number, z: number): boolean {
  let inside = false;
  const pts = FORGE_POINTS;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i];
    const [xj, zj] = pts[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Yards from the wellspring's middle. */
export function wellDistance(x: number, z: number): number {
  return Math.hypot(x - HEARTH_WELL.x, z - HEARTH_WELL.z);
}

/** Is (x, z) in the wellspring's fire (inside its lip)? */
export function inWell(x: number, z: number): boolean {
  return wellDistance(x, z) < HEARTH_WELL.r;
}

/** Is (x, z) out of the guardian's reach, where Hearth Flare strikes? */
export function beyondFlare(x: number, z: number): boolean {
  return wellDistance(x, z) > T.flareReach;
}

/** Is (x, z) in Wakefire band `band` (0 near, 1 the middle, 2 the back)? */
export function inBand(band: number, x: number, z: number): boolean {
  const b = ZONE_BANDS[band];
  if (!b) return false;
  const d = wellDistance(x, z);
  return d >= b[0] && d < b[1];
}

/** The facing from `from` toward `to` (sim convention: 0 runs +z). */
export function facingTo(from: HPoint, to: HPoint): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

/** A point in a lane's frame: `along` it from its start, `across` it. */
export function laneFrame(
  ox: number,
  oz: number,
  facing: number,
  x: number,
  z: number,
): { along: number; across: number } {
  const dx = x - ox;
  const dz = z - oz;
  const s = Math.sin(facing);
  const c = Math.cos(facing);
  return { along: dx * s + dz * c, across: Math.abs(dx * c - dz * s) };
}

/** Is (x, z) in a lane from (ox, oz) along `facing`, `length` long and
 *  `half` wide either side? */
export function inLane(
  ox: number,
  oz: number,
  facing: number,
  length: number,
  half: number,
  x: number,
  z: number,
): boolean {
  const f = laneFrame(ox, oz, facing, x, z);
  return f.along >= 0 && f.along <= length && f.across <= half;
}

/** Basalt Fist's three Molten Swell bearings from its spot: straight away
 *  from the wellspring and to either side of it (the gap toward the
 *  guardian, and the two between, are where the raid stands). */
export function swellBearings(spot: HPoint): [number, number, number] {
  const away = facingTo(HEARTH_WELL, spot);
  return [away, away + Math.PI / 2, away - Math.PI / 2];
}

/** Is (x, z) in a wave's wall: `front` yards down its lane, the wall
 *  `T.waveDepth` deep behind it? */
export function inWave(
  ox: number,
  oz: number,
  facing: number,
  front: number,
  x: number,
  z: number,
): boolean {
  const f = laneFrame(ox, oz, facing, x, z);
  return f.across <= T.laneHalf && f.along <= front && f.along >= front - T.waveDepth;
}

/** The nearest body to `from` within `range` (the lower id on a tie), or
 *  null when nobody is that near. */
export function nearestInReach(
  from: HPoint,
  bodies: readonly HBody[],
  range: number,
): HBody | null {
  let best: HBody | null = null;
  let bestD = range + 1e-9;
  for (const b of bodies) {
    const d = Math.hypot(b.x - from.x, b.z - from.z);
    if (d < bestD - 1e-9 || (best && Math.abs(d - bestD) <= 1e-9 && b.id < best.id)) {
      best = b;
      bestD = d;
    }
  }
  return best;
}

// ---- the posts ------------------------------------------------------------------------

/** Where the Wellspawn climb out at the room's edge (heroic's overflows). */
export const WELLSPAWN_SPOTS: readonly HPoint[] = [
  { x: -178, z: -16 },
  { x: -178, z: 16 },
  { x: -198, z: -42 },
  { x: -198, z: 42 },
];

/** Where heroic's second overflow raises its two Wellkeepers. */
export const WELLKEEPER_SPOTS: readonly HPoint[] = [
  { x: -206, z: -16 },
  { x: -206, z: 16 },
];

/** The three spirits' posts (heroic's phase 4): the Quench's north, the
 *  Breath's south, the Hammer's by the door. */
export const SPIRIT_POSTS: Readonly<Record<'quench' | 'breath' | 'hammer', HPoint>> = {
  quench: { x: -214, z: 38 },
  breath: { x: -214, z: -38 },
  hammer: { x: -180, z: 0 },
};

/** Where the Hammer's spirit may raise a Stone Root (the tank's ground). */
export const ROOT_SPOTS: readonly HPoint[] = [
  { x: -206, z: -18 },
  { x: -206, z: 18 },
  { x: -192, z: -6 },
  { x: -192, z: 6 },
  { x: -216, z: -28 },
  { x: -216, z: 28 },
];

/** The shore's points (a 6-yard lattice on the floor east of the
 *  wellspring's middle, clear of its lip by 4 yd and of the walls by 3):
 *  where the spirits' ice and the blazes are laid. Built once, in a fixed
 *  order. */
export const SHORE_POINTS: readonly HPoint[] = (() => {
  const out: HPoint[] = [];
  for (let x = -250; x <= -176; x += 6) {
    for (let z = -42; z <= 42; z += 6) {
      if (!inHearthFloor(x, z) || wellDistance(x, z) < HEARTH_WELL.r + 4) continue;
      if (x < HEARTH_WELL.x - 2) continue;
      const clear =
        inHearthFloor(x + 3, z) &&
        inHearthFloor(x - 3, z) &&
        inHearthFloor(x, z + 3) &&
        inHearthFloor(x, z - 3);
      if (clear) out.push({ x, z });
    }
  }
  return out;
})();
