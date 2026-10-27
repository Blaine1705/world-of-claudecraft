// Pure plan of the Guardian of the Heat's provisional body (heat_body.ts
// paints it; docs/design/raid/smith_heart.md sections 5.16 and 7.4). The
// Hearth's art rule: the first flame, white-gold fire inside living crystal
// and the mountain's hexagonal basalt; NOTHING of a forge (no anvil, bellows,
// hammer, chain or tool: the Smith never appears), never volcanic red. A
// being of the first flame: a body of dark columnar basalt (the Heart kit's
// colossus rock, repainted the Hearth's sooted basalt, fire in its joints),
// legs of bundled basalt columns (the Heat kit's hearth pillars), a mane of
// white-gold crystal prisms rising off its back and crowning its head,
// pauldrons of fire-split basalt boulders, fists of crystal on beds of column
// stumps, crystal breaking out of its chest round a white-gold heart, threads
// of the first flame between its joints. About three and a half players tall.
//
// It stands sunk to its waist in the first wellspring the whole fight, all
// the way under while the Hearth overflows, and climbs back as it rises (the
// guardian's state aura and its bar, mirrored entity state); it never leaves
// the wellspring, on any difficulty. Its fire burns whiter as the fight deepens; molten rock sheets off
// it where it meets the wellspring and pours off it as it climbs out.
//
// The JOINTS and the TIMELINES (the rig, the arms' solve, the poses) are kept
// apart from the PIECES (which kit node sits on which joint, at what size), so
// the official pipeline's model replaces the pieces and keeps the joints.
//
// Sizes in yards in the body's frame: x to its left, y up from its feet, z
// forward (0 = +z). Three-free, DOM-free, deterministic (a hash, never rng).

import {
  HEAT_AURAS,
  HEAT_CASTS,
  HEAT_GUARDIAN,
  HEAT_STAGES,
} from '../../sim/encounters/smith_heart/heat_ids';
import type { V3 } from './final_fx_core';

export type { V3 };
export { HEAT_GUARDIAN };

/** The kits the pieces come from (render/smith_heart/heart_kit.ts urls). */
export const HEAT_BODY_KITS = {
  heat: '/models/props/smith_heart_heat_kit.glb',
  heart: '/models/props/smith_heart_heart_kit.glb',
} as const;
export type HeatBodyKit = keyof typeof HEAT_BODY_KITS;

/** Feet to crown in the body's own frame (every joint, piece and pose below
 *  is in it). */
export const HEAT_BODY_HEIGHT = 2.4 * 3;

/** The body is a giant (Jose's direction, the Ragnaros scale): the whole frame
 *  drawn this many times larger, so its crown stands about twenty yards up,
 *  and sunk to its waist in the wellspring it still towers some thirteen yards
 *  (seven players) over the shore; its shoulders span about fifteen. The sim's
 *  body radius (HEARTH_WELL.r) is the pool's, so melee reaches it from the
 *  shore. */
export const HEAT_BODY_SCALE = 2.8;

/** The rig's joints, by index. */
export const HJ = {
  hip: 0,
  chest: 1,
  head: 2,
  shoulderL: 3,
  shoulderR: 4,
  elbowL: 5,
  elbowR: 6,
  wristL: 7,
  wristR: 8,
  kneeL: 9,
  kneeR: 10,
  footL: 11,
  footR: 12,
  mouth: 13,
  back: 14,
  hipL: 15,
  hipR: 16,
} as const;
export const HEAT_RIG_JOINTS = 17;

/** The rest joints (body frame). Side joints are given on the left (+x). */
export const HEAT_SLOTS = {
  hip: v(0, 2.7, 0),
  chest: v(0, 4.35, 0.05),
  head: v(0, 6.0, 0.4),
  mouth: v(0, 5.7, 1.15),
  back: v(0, 4.8, -0.95),
  shoulder: v(2.15, 5.1, 0),
  hipJoint: v(0.9, 2.55, 0),
  knee: v(1.0, 1.4, 0.3),
  foot: v(1.05, 0.25, 0.18),
} as const;

/** The arm: its root, its two lengths, the wrist at rest. */
export const HEAT_ARM = {
  root: v(2.2, 5.05, 0.05),
  upper: 1.8,
  fore: 1.8,
  idle: v(2.6, 2.1, 0.8),
} as const;

/** How a piece is lit: basalt (the Heart kit's rock repainted, its glow the
 *  first flame), seamed (the Heat kit's own basalt and crystal, its glow the
 *  first flame), or the whole piece white-gold crystal. */
export type HeatPieceLight = 'stone' | 'seamed' | 'crystal';

/** Where a piece sits: on one joint (an offset in the joint's frame), or
 *  spanning two (a limb: its length the distance between them). */
export interface HeatBodyPiece {
  id: string;
  kit: HeatBodyKit;
  node: string;
  /** The joint it rides (HJ), or the two it spans. */
  joint: number;
  to?: number;
  /** The head's frame (it lifts with the head) rather than the body's. */
  head?: boolean;
  size: V3;
  at: V3;
  tilt: V3;
  light: HeatPieceLight;
}

function v(x: number, y: number, z: number): V3 {
  return { x, y, z };
}
const ZERO = v(0, 0, 0);

function on(
  id: string,
  kit: HeatBodyKit,
  node: string,
  joint: number,
  size: V3,
  at: V3 = ZERO,
  tilt: V3 = ZERO,
  light: HeatPieceLight = 'stone',
  head = false,
): HeatBodyPiece {
  return { id, kit, node, joint, size, at, tilt, light, ...(head ? { head } : {}) };
}

function limb(
  id: string,
  kit: HeatBodyKit,
  node: string,
  from: number,
  to: number,
  thick: V3,
  light: HeatPieceLight = 'stone',
  tilt: V3 = ZERO,
): HeatBodyPiece {
  return { id, kit, node, joint: from, to, size: thick, at: ZERO, tilt, light };
}

const J = HJ;

/** The body's pieces (the Heart kit's colossus rock, the Heat kit's crystal,
 *  boulders and column bundles). A limb's `size.y` is a share of its span. */
export const HEAT_BODY_PIECES: readonly HeatBodyPiece[] = [
  // The core of columnar basalt.
  on('hip', 'heart', 'Kit_ColHip', J.hip, v(2.6, 1.4, 1.8)),
  on('torso', 'heart', 'Kit_ColTorso', J.chest, v(3.2, 2.6, 2.2)),
  on('head', 'heart', 'Kit_ColHead', J.head, v(1.45, 1.35, 1.55), ZERO, ZERO, 'stone', true),
  // The first flame's heart in the chest's front, crystal breaking out round it.
  on(
    'core',
    'heart',
    'Kit_HeartCrystal',
    J.chest,
    v(0.95, 1.35, 0.8),
    v(0, 0.05, 1.02),
    ZERO,
    'crystal',
  ),
  on(
    'chestL',
    'heat',
    'Kit_FireCrystalB',
    J.chest,
    v(1.0, 1.15, 0.85),
    v(0.95, 0.55, 0.78),
    v(0.35, 0.2, -0.6),
    'seamed',
  ),
  on(
    'chestR',
    'heat',
    'Kit_FireCrystalB',
    J.chest,
    v(1.0, 1.15, 0.85),
    v(-0.95, 0.55, 0.78),
    v(0.35, -0.2, 0.6),
    'seamed',
  ),
  // The mane: tall prisms of the first flame's crystal rising off its back.
  on(
    'maneA',
    'heat',
    'Kit_FireCrystalA',
    J.back,
    v(1.5, 3.3, 1.3),
    v(0, 0.95, -0.15),
    v(-0.4, 0, 0),
    'seamed',
  ),
  on(
    'maneB',
    'heat',
    'Kit_FireCrystalA',
    J.back,
    v(1.2, 2.5, 1.1),
    v(0.95, 0.55, 0.05),
    v(-0.35, 0.5, -0.4),
    'seamed',
  ),
  on(
    'maneC',
    'heat',
    'Kit_FireCrystalA',
    J.back,
    v(1.2, 2.5, 1.1),
    v(-0.95, 0.55, 0.05),
    v(-0.35, -0.5, 0.4),
    'seamed',
  ),
  // A crown of crystal on the head.
  on(
    'crownA',
    'heat',
    'Kit_FireCrystalA',
    J.head,
    v(0.7, 1.4, 0.6),
    v(0, 0.85, -0.2),
    v(-0.3, 0, 0),
    'seamed',
    true,
  ),
  on(
    'crownB',
    'heat',
    'Kit_FireCrystalA',
    J.head,
    v(0.55, 1.05, 0.5),
    v(0.55, 0.7, -0.1),
    v(-0.2, 0, -0.5),
    'seamed',
    true,
  ),
  on(
    'crownC',
    'heat',
    'Kit_FireCrystalA',
    J.head,
    v(0.55, 1.05, 0.5),
    v(-0.55, 0.7, -0.1),
    v(-0.2, 0, 0.5),
    'seamed',
    true,
  ),
  // The shoulders: basalt, under pauldrons of fire-split boulders.
  on('shoulderL', 'heart', 'Kit_ColShoulder', J.shoulderL, v(1.7, 1.4, 1.7)),
  on('shoulderR', 'heart', 'Kit_ColShoulder', J.shoulderR, v(1.7, 1.4, 1.7)),
  on(
    'pauldronL',
    'heat',
    'Kit_EmberBoulder',
    J.shoulderL,
    v(1.4, 1.05, 2.1),
    v(0.35, 0.75, -0.05),
    v(0, 0.2, -0.35),
    'seamed',
  ),
  on(
    'pauldronR',
    'heat',
    'Kit_EmberBoulder',
    J.shoulderR,
    v(1.4, 1.05, 2.1),
    v(-0.35, 0.75, -0.05),
    v(0, -0.2, 0.35),
    'seamed',
  ),
  // The arms: basalt, fists of crystal on beds of column stumps.
  limb('upperL', 'heart', 'Kit_ColUpperArm', J.shoulderL, J.elbowL, v(1.05, 1.05, 1.05)),
  limb('upperR', 'heart', 'Kit_ColUpperArm', J.shoulderR, J.elbowR, v(1.05, 1.05, 1.05)),
  limb('foreL', 'heart', 'Kit_ColForearm', J.elbowL, J.wristL, v(1.1, 1.05, 1.1)),
  limb('foreR', 'heart', 'Kit_ColForearm', J.elbowR, J.wristR, v(1.1, 1.05, 1.1)),
  on('fistL', 'heat', 'Kit_FireCrystalB', J.wristL, v(1.3, 1.25, 1.3), ZERO, ZERO, 'seamed'),
  on('fistR', 'heat', 'Kit_FireCrystalB', J.wristR, v(1.3, 1.25, 1.3), ZERO, ZERO, 'seamed'),
  // The legs: bundles of basalt columns, fire in their joints; basalt feet.
  limb('thighL', 'heat', 'Kit_HearthPillar', J.hipL, J.kneeL, v(1.35, 1.1, 1.3), 'seamed'),
  limb('thighR', 'heat', 'Kit_HearthPillar', J.hipR, J.kneeR, v(1.35, 1.1, 1.3), 'seamed'),
  limb('shinL', 'heat', 'Kit_HearthPillar', J.kneeL, J.footL, v(1.2, 1.15, 1.15), 'seamed'),
  limb('shinR', 'heat', 'Kit_HearthPillar', J.kneeR, J.footR, v(1.2, 1.15, 1.15), 'seamed'),
  on('footL', 'heart', 'Kit_ColShardB', J.footL, v(1.35, 0.6, 1.75), v(0, 0, 0.3)),
  on('footR', 'heart', 'Kit_ColShardB', J.footR, v(1.35, 0.6, 1.75), v(0, 0, 0.3)),
];

/** The threads of the first flame between the joints (HJ pairs). */
export const HEAT_THREAD_PAIRS: readonly [number, number][] = [
  [J.hip, J.chest],
  [J.chest, J.head],
  [J.chest, J.shoulderL],
  [J.chest, J.shoulderR],
  [J.shoulderL, J.elbowL],
  [J.shoulderR, J.elbowR],
  [J.elbowL, J.wristL],
  [J.elbowR, J.wristR],
  [J.hipL, J.kneeL],
  [J.hipR, J.kneeR],
  [J.kneeL, J.footL],
  [J.kneeR, J.footR],
  [J.chest, J.back],
];

/** The joints the tongues of flame lick up from. */
export const HEAT_FLAME_JOINTS: readonly number[] = [
  J.chest,
  J.back,
  J.shoulderL,
  J.shoulderR,
  J.elbowL,
  J.elbowR,
  J.wristL,
  J.wristR,
  J.kneeL,
  J.kneeR,
];

/** The palette (linear 0..1, hex for the glows). The first flame's gold and
 *  white, never a threat colour, never volcanic red. */
export const HEAT_BODY_COLORS = {
  /** The Hearth's basalt: a warm dark grey, umber baked in its shade. */
  basalt: [0.36, 0.33, 0.31] as const,
  basaltShade: [0.13, 0.11, 0.1] as const,
  /** The first flame: gold at rest, white at the top of the heat. */
  gold: 0xffb848,
  fire: 0xffd27a,
  white: 0xfff6e6,
  thread: 0xffc860,
  ember: [1.0, 0.78, 0.4] as const,
  spark: [1.0, 0.9, 0.62] as const,
  haze: [0.95, 0.85, 0.66] as const,
  smoke: [0.28, 0.25, 0.23] as const,
} as const;

// ---- the motion -----------------------------------------------------------------------

/** What the body is doing. */
export type HeatBodyAction = 'idle' | 'swing' | 'fist' | 'slam' | 'sink' | 'under' | 'rise';

/** The fight's state as the body reads it (all mirrored entity state, plus
 *  the painter's own clocks of the cues it saw). */
export interface HeatBodyInput {
  castId: string | null;
  castFill: number;
  /** The guardian's phase (its state aura's value, 1 to 3; 0 out of the
   *  fight) and stage (HEAT_STAGES), and how far into a timed stage. */
  phase: number;
  stage: number;
  stageFill: number;
  /** Seconds since Basalt Fist landed. */
  sinceSlam: number;
  /** Seconds since a plain melee swing. */
  sinceSwing: number;
}

export interface HeatBodyActionState {
  action: HeatBodyAction;
  k: number;
}

/** Seconds of each one-shot motion. */
export const HEAT_SWING_SECONDS = 0.85;
export const HEAT_SLAM_SECONDS = 0.9;

/** How deep it stands in the wellspring (in the body's frame, under its
 *  feet's rest): sunk to its waist (the lava at its hips) the whole fight,
 *  all the way under through an overflow. */
export const HEAT_HALF_SUNK = 2.6;
export const HEAT_FULL_SUNK = 9.5;

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const ease = (t: number) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};

/** The action and its clock (0..1) for the body's input, written into `out`
 *  (no allocation on the frame path). The stages first (they own the body),
 *  then the bar, then the one-shots. */
export function heatBodyAction(
  input: HeatBodyInput,
  out: HeatBodyActionState = { action: 'idle', k: 0 },
): HeatBodyActionState {
  if (input.stage === HEAT_STAGES.sinking) {
    out.action = 'sink';
    out.k = clamp01(input.stageFill);
  } else if (input.stage === HEAT_STAGES.under) {
    out.action = 'under';
    out.k = 0;
  } else if (input.stage === HEAT_STAGES.rising) {
    out.action = 'rise';
    out.k = clamp01(input.stageFill);
  } else if (input.castId === HEAT_CASTS.fist) {
    out.action = 'fist';
    out.k = clamp01(input.castFill);
  } else if (input.sinceSlam < HEAT_SLAM_SECONDS) {
    out.action = 'slam';
    out.k = input.sinceSlam / HEAT_SLAM_SECONDS;
  } else if (input.sinceSwing < HEAT_SWING_SECONDS) {
    out.action = 'swing';
    out.k = input.sinceSwing / HEAT_SWING_SECONDS;
  } else {
    out.action = 'idle';
    out.k = 0;
  }
  return out;
}

/** How deep the body stands for `action` at `k` (in its own frame, down):
 *  sunk to its waist, all the way under while the Hearth overflows, climbing
 *  back as it rises. */
export function heatSink(action: HeatBodyAction, k: number): number {
  const p = clamp01(k);
  switch (action) {
    case 'sink':
      return HEAT_HALF_SUNK + (HEAT_FULL_SUNK - HEAT_HALF_SUNK) * ease(p);
    case 'under':
      return HEAT_FULL_SUNK;
    case 'rise':
      return HEAT_FULL_SUNK + (HEAT_HALF_SUNK - HEAT_FULL_SUNK) * ease(p);
    default:
      return HEAT_HALF_SUNK;
  }
}

/** The body's look: the chest's swell, the head's lift (radians back), the
 *  lean (forward), the fire's strength (its heart, seams and threads), how
 *  white the fire burns (0 gold, 1 white), the slam's flash (0..1), the tremble (yards of jitter), the haze rising off it (0..1), how
 *  deep it stands (yards) and the lava sheeting off it (0..1). */
export interface HeatBodyLook {
  swell: number;
  lift: number;
  lean: number;
  glow: number;
  white: number;
  flash: number;
  tremble: number;
  haze: number;
  sink: number;
  pour: number;
}

/** How white the first flame burns in `phase` (1 to 3): gold early, whiter
 *  as the fight deepens. */
export function heatWhiteness(phase: number): number {
  const p = Math.max(1, Math.min(3, phase));
  return 0.1 + 0.32 * (p - 1);
}

/** The look of `action` at `k` in `phase`, the slow idle breath on render
 *  time `t`. */
export function heatBodyLook(
  action: HeatBodyAction,
  k: number,
  t: number,
  phase: number,
  out: HeatBodyLook = {
    swell: 0,
    lift: 0,
    lean: 0,
    glow: 0,
    white: 0,
    flash: 0,
    tremble: 0,
    haze: 0,
    sink: 0,
    pour: 0,
  },
): HeatBodyLook {
  const h = clamp01((Math.max(1, phase) - 1) / 2);
  // The flame's own breath: slower and deeper early, quicker as it deepens.
  const period = 4.6 - 1.8 * h;
  const idle = 0.5 + 0.2 * Math.sin((t * Math.PI * 2) / period);
  out.swell = idle;
  out.lift = 0.03 * Math.sin((t * Math.PI * 2) / period);
  out.lean = 0.04;
  out.glow = 0.55 + 0.9 * h + 0.15 * idle;
  out.white = heatWhiteness(phase);
  out.flash = 0;
  out.tremble = 0;
  out.haze = 0.4 + 0.6 * h;
  out.sink = heatSink(action, k);
  // Lava sheets off it where it meets the wellspring.
  out.pour = out.sink > 0.2 ? 0.35 : 0;
  const p = clamp01(k);
  switch (action) {
    case 'fist':
      // It rears and lifts its fist of crystal high, then drives it down.
      out.lean = 0.04 - 0.14 * ease(p / 0.75) + 0.42 * ease((p - 0.8) / 0.2);
      out.lift = 0.22 * ease(p / 0.75) - 0.3 * ease((p - 0.8) / 0.2);
      out.swell = idle + (1.2 - idle) * ease(p);
      out.glow += 1.6 * ease(p);
      break;
    case 'slam':
      out.lean = 0.46 - 0.42 * ease(p);
      out.lift = -0.3 + 0.33 * ease(p);
      out.glow += 2.2 * (1 - p);
      out.flash = 0.6 * (1 - ease(p * 2));
      break;
    case 'sink':
      // Arms flung up as the wellspring takes it.
      out.lift = 0.35 * ease(p);
      out.glow += 1.5 * ease(p);
      out.pour = 0.6;
      break;
    case 'under':
      out.glow += 1.2;
      out.pour = 0;
      break;
    case 'rise':
      // Out of the lava, head back, molten rock sheeting off it.
      out.lift = 0.4 * (1 - ease(p));
      out.lean = -0.1 * (1 - p);
      out.glow += 2.2 * (1 - p * 0.6);
      out.pour = 1;
      break;
    case 'swing':
      out.lean = 0.04 + 0.1 * Math.sin(p * Math.PI);
      break;
    default:
      break;
  }
  return out;
}

function lerpInto(
  out: V3,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  s: number,
): V3 {
  out.x = ax + (bx - ax) * s;
  out.y = ay + (by - ay) * s;
  out.z = az + (bz - az) * s;
  return out;
}

/** Where one wrist (side 1 left, -1 right) wants to be (body frame) for an
 *  action at `k`, written into `out` (no allocation on the frame path). The
 *  fist it slams with is its right (side -1). */
export function heatWristTarget(
  action: HeatBodyAction,
  side: -1 | 1,
  k: number,
  swingSide: -1 | 1 = 1,
  out: V3 = v(0, 0, 0),
): V3 {
  const I = HEAT_ARM.idle;
  const R = HEAT_ARM.root;
  const reach = HEAT_ARM.upper + HEAT_ARM.fore;
  const ix = side * I.x;
  const iy = I.y;
  const iz = I.z;
  const p = clamp01(k);
  switch (action) {
    case 'swing': {
      if (side !== swingSide) return lerpInto(out, ix, iy, iz, ix, iy, iz, 0);
      const bx = side * (R.x + 0.4);
      const by = R.y + 0.8;
      const bz = -0.5;
      if (p < 0.4) return lerpInto(out, ix, iy, iz, bx, by, bz, ease(p / 0.4));
      return lerpInto(
        out,
        bx,
        by,
        bz,
        side * 0.6,
        R.y - reach * 0.6,
        reach * 0.7,
        ease((p - 0.4) / 0.6),
      );
    }
    case 'fist': {
      if (side === 1) return lerpInto(out, ix, iy, iz, side * (R.x + 0.9), R.y - 1.2, 0.9, ease(p));
      // Up over its head, then driven down before it.
      const hx = -0.8;
      const hy = R.y + reach * 0.92;
      const hz = -0.3;
      if (p < 0.8) return lerpInto(out, ix, iy, iz, hx, hy, hz, ease(p / 0.8));
      return lerpInto(
        out,
        hx,
        hy,
        hz,
        -0.7,
        R.y - reach * 0.75,
        reach * 0.65,
        ease((p - 0.8) / 0.2),
      );
    }
    case 'slam':
      if (side === 1) return lerpInto(out, side * (R.x + 0.9), R.y - 1.2, 0.9, ix, iy, iz, ease(p));
      return lerpInto(
        out,
        -0.7,
        R.y - reach * 0.75,
        reach * 0.65,
        ix,
        iy,
        iz,
        ease((p - 0.3) / 0.7),
      );
    case 'sink':
    case 'under':
      // Both arms up, clawing at the air as it goes down.
      return lerpInto(out, ix, iy, iz, side * (R.x + 0.6), R.y + reach * 0.8, 0.4, ease(p * 1.5));
    case 'rise':
      return lerpInto(out, side * (R.x + 0.6), R.y + reach * 0.8, 0.4, ix, iy, iz, ease(p));
    default:
      return lerpInto(out, ix, iy, iz, ix, iy, iz, 0);
  }
}

/** One arm's solved joints (body frame). */
export interface HeatArmJoints {
  elbow: V3;
  wrist: V3;
}

/** One arm's elbow and wrist (body frame) toward `wrist`, written into `out`:
 *  the shared two-bone solve (as quench_body_core.ts quenchArm), in scalars
 *  so the frame path allocates nothing; the elbow's pole out and back. */
export function heatArm(
  side: -1 | 1,
  wrist: V3,
  out: HeatArmJoints = { elbow: v(0, 0, 0), wrist: v(0, 0, 0) },
): HeatArmJoints {
  const R = HEAT_ARM.root;
  const l1 = HEAT_ARM.upper;
  const l2 = HEAT_ARM.fore;
  const sx = side * R.x;
  const sy = R.y;
  const sz = R.z;
  let dx = wrist.x - sx;
  let dy = wrist.y - sy;
  let dz = wrist.z - sz;
  let d = Math.hypot(dx, dy, dz);
  const reach = (l1 + l2) * 0.999;
  const lo = Math.abs(l1 - l2) * 1.001 + 1e-6;
  const dd = Math.max(lo, Math.min(reach, d || lo));
  if (d < 1e-9) {
    dx = 0;
    dy = -1;
    dz = 0;
    d = 1;
  }
  const ux = dx / d;
  const uy = dy / d;
  const uz = dz / d;
  out.wrist.x = sx + ux * dd;
  out.wrist.y = sy + uy * dd;
  out.wrist.z = sz + uz * dd;
  const a = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const polX = side * 0.8;
  const polY = -0.2;
  const polZ = -0.6;
  const pd = polX * ux + polY * uy + polZ * uz;
  let px = polX - ux * pd;
  let py = polY - uy * pd;
  let pz = polZ - uz * pd;
  const pl = Math.hypot(px, py, pz) || 1;
  px /= pl;
  py /= pl;
  pz /= pl;
  out.elbow.x = sx + ux * a + px * h;
  out.elbow.y = sy + uy * a + py * h;
  out.elbow.z = sz + uz * a + pz * h;
  return out;
}

/** A small integer hash in [0, 1). */
export function heatBodyHash(a: number, b: number): number {
  let h = (Math.imul(a | 0, 0x3a1f5c2d) ^ Math.imul(b | 0, 0x1b873593)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The fall: when its pieces drop after its death, and where each lies (body
 *  frame), tumbled, round where it stood; the flame sinking out of them. */
export const HEAT_FALL = { end: 2.8 } as const;

export function heatFallRest(index: number, from: V3): { at: V3; tilt: V3; delay: number } {
  const a = heatBodyHash(index, 31) * Math.PI * 2;
  const r = 1.0 + heatBodyHash(index, 37) * 3.4;
  return {
    at: v(from.x * 0.5 + Math.sin(a) * r, 0.35, from.z * 0.5 + Math.cos(a) * r),
    tilt: v(
      (heatBodyHash(index, 41) - 0.5) * 2.4,
      heatBodyHash(index, 43) * 6.28,
      (heatBodyHash(index, 47) - 0.5) * 2.4,
    ),
    delay: Math.min(1.0, from.y * 0.08) + heatBodyHash(index, 53) * 0.25,
  };
}

/** A piece's fall `t` seconds into the death: 0..1 and whether it landed. */
export function heatFallProgress(
  t: number,
  delay: number,
  out: { k: number; landed: boolean } = { k: 0, landed: false },
): { k: number; landed: boolean } {
  const k = clamp01((t - delay) / 0.75);
  out.k = k * k;
  out.landed = k >= 1;
  return out;
}

/** What the body reads off the guardian's state aura: its phase (0 out of
 *  the fight), its stage and how far into a timed one. */
export interface HeatBodyState {
  phase: number;
  stage: number;
  fill: number;
}

/** The guardian's state off its auras, written into `out` (no allocation on
 *  the frame path). */
export function heatBodyState(
  auras: readonly {
    id: string;
    value?: number;
    value2?: number;
    remaining?: number;
    duration?: number;
  }[],
  out: HeatBodyState = { phase: 0, stage: 0, fill: 0 },
): HeatBodyState {
  out.phase = 0;
  out.stage = 0;
  out.fill = 0;
  for (const a of auras) {
    if (a.id === HEAT_AURAS.state) {
      out.phase = Math.round(a.value ?? 0);
      out.stage = Math.round(a.value2 ?? 0);
      const d = a.duration ?? 0;
      out.fill = d > 0 && d < 1000 ? clamp01(1 - (a.remaining ?? 0) / d) : 0;
    }
  }
  return out;
}

/** The tallest point of the body at rest (its mane's and crown's tips). */
export function heatBodyTop(): number {
  let top = 0;
  for (const p of HEAT_BODY_PIECES) {
    if (p.to !== undefined) continue;
    const j = restJoint(p.joint);
    top = Math.max(top, j.y + p.at.y + p.size.y / 2);
  }
  return top;
}

/** A joint's rest place (body frame). */
export function restJoint(i: number, out: V3 = v(0, 0, 0)): V3 {
  const S = HEAT_SLOTS;
  const set = (p: V3, side = 1) => {
    out.x = p.x * side;
    out.y = p.y;
    out.z = p.z;
    return out;
  };
  switch (i) {
    case J.hip:
      return set(S.hip);
    case J.chest:
      return set(S.chest);
    case J.head:
      return set(S.head);
    case J.mouth:
      return set(S.mouth);
    case J.back:
      return set(S.back);
    case J.shoulderL:
      return set(S.shoulder);
    case J.shoulderR:
      return set(S.shoulder, -1);
    case J.hipL:
      return set(S.hipJoint);
    case J.hipR:
      return set(S.hipJoint, -1);
    case J.kneeL:
      return set(S.knee);
    case J.kneeR:
      return set(S.knee, -1);
    case J.footL:
      return set(S.foot);
    case J.footR:
      return set(S.foot, -1);
    case J.elbowL:
    case J.elbowR:
    case J.wristL:
    case J.wristR: {
      const side: -1 | 1 = i === J.elbowL || i === J.wristL ? 1 : -1;
      const w = heatArm(side, {
        x: side * HEAT_ARM.idle.x,
        y: HEAT_ARM.idle.y,
        z: HEAT_ARM.idle.z,
      });
      return set(i === J.elbowL || i === J.elbowR ? w.elbow : w.wrist);
    }
    default:
      return set(ZERO);
  }
}

/** Pools at full density. */
export const HEAT_BODY_POOLS = {
  threads: HEAT_THREAD_PAIRS.length,
  flames: HEAT_FLAME_JOINTS.length,
} as const;
