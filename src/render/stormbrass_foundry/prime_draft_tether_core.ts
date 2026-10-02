// PURE: where the Prime Draft's cable terminal hangs and where its feeder
// cable is tied (foundry_draft_tether.ts draws both). The terminal sits on the
// model's own cable ends (prime_draft_model_core.ts PRIME_DRAFT_MODEL.cableEnd,
// carried by the body's position, facing and drawn scale), so the cables never
// end in the air however far the bolted Draft has crawled; the feeder runs up
// to the gantry scaffold's head, measured from the Draft's own spot (the
// scaffold stands a fixed way behind it on the Gantry's north lip).
//
// Three-free, DOM-free, deterministic.

import {
  GANTRY,
  PRIME_DRAFT_SPOT,
  STORMBRASS_FOUNDRY_FIELD,
} from '../../sim/content/stormbrass_foundry_layout';
import {
  PRIME_DRAFT_MODEL,
  PRIME_DRAFT_SIM_SCALE,
  primeDraftModelScale,
  primeDraftPoint,
} from './prime_draft_model_core';

export interface TetherPoint {
  x: number;
  y: number;
  z: number;
}

/** The gantry scaffold prop behind the Draft (the feeder hangs from it). */
const SCAFFOLD = STORMBRASS_FOUNDRY_FIELD.props.find((p) => p.kind === 'sf_gantry_scaffold');

export const DRAFT_TETHER = {
  /** The junction box's half extents (x across, y up, z along the cables). */
  boxHalf: { x: 2.3, y: 0.75, z: 0.7 },
  /** The bushings' |x| on the box's front: the cable ends' spread. */
  bushingX: PRIME_DRAFT_MODEL.cableEnd.x * primeDraftModelScale(PRIME_DRAFT_SIM_SCALE),
  feederRadius: 0.2,
  /** The scaffold's head over the Gantry floor, and how far behind the
   *  Draft's spot (instance-local +z, north) its front face stands. */
  headLift: (SCAFFOLD?.h ?? 34) - 3,
  headBehind: (SCAFFOLD?.z ?? GANTRY.z + GANTRY.r - 2) - (SCAFFOLD?.hd ?? 1.5) - PRIME_DRAFT_SPOT.z,
} as const;

/** The terminal box's centre: the midpoint of the two cable ends. */
export function draftCableTerminal(
  pos: TetherPoint,
  facing: number,
  scale: number,
  out: TetherPoint,
): TetherPoint {
  const e = PRIME_DRAFT_MODEL.cableEnd;
  return primeDraftPoint(pos, facing, scale, { x: 0, up: e.up, forward: e.forward }, out);
}

/** The feeder's tie on the scaffold's head, from the Draft's home spot (the
 *  instance is never turned: north is +z). */
export function draftFeederHead(home: TetherPoint, out: TetherPoint): TetherPoint {
  out.x = home.x;
  out.y = home.y + DRAFT_TETHER.headLift;
  out.z = home.z + DRAFT_TETHER.headBehind;
  return out;
}
