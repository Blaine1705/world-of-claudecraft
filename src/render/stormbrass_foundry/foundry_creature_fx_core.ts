// PURE: the Stormbrass Foundry creatures' presentation plan (phase 3), shared by
// their VISUALS rows (../characters/foundry_creature_looks.ts) and the effect
// painter (foundry_creature_fx.ts). Gesture ids ride the renderer's
// triggerAttack seam; the dial gestures turn bones on top of the clips
// (../characters/bone_dials.ts). Everything here reads mirrored entity state
// (auras, cast bars, template ids), so offline and online look the same.
//
// Anchors are measured off the Blender builds (scripts/assets/
// stormbrass_foundry_creatures/*.py, the ANCHOR lines) in the creature's
// authored frame: side (+x its left), up, fwd; foundryAnchor() carries one into
// the world by the entity's facing and its drawn scale.

import type { BoneDialDef } from '../characters/bone_dials';

// ---- Line-Master Tock: the pressure gauge on his back -------------------------

/** How many steps the gauge needle climbs between two lever throws. */
export const TOCK_GAUGE_STEPS = 8;
/** The lever's period (TOCK_TUNING.leverEvery): the aura's remaining time runs from it to 0. */
export const TOCK_GAUGE_PERIOD_SEC = 20;
/** The dial's full sweep, from the low stop to the end of the red. */
const GAUGE_SWEEP_RAD = (270 * Math.PI) / 180;

export function tockGaugeGesture(level: number): string {
  return `foundry_gauge_${level}`;
}

/** The needle's step for the seconds left to the next lever throw. */
export function tockGaugeLevel(remainingSec: number | undefined): number {
  if (remainingSec === undefined || !Number.isFinite(remainingSec)) return 0;
  const k = 1 - Math.max(0, Math.min(TOCK_GAUGE_PERIOD_SEC, remainingSec)) / TOCK_GAUGE_PERIOD_SEC;
  return Math.max(0, Math.min(TOCK_GAUGE_STEPS, Math.round(k * TOCK_GAUGE_STEPS)));
}

/** The gauge needle's dial (bone GaugeNeedle points out of the dial face along
 *  its local +Y; a negative turn sweeps it clockwise toward the red). */
export const TOCK_GAUGE_DIAL: BoneDialDef = {
  bone: 'GaugeNeedle',
  axis: [0, 1, 0],
  stops: Object.fromEntries(
    Array.from({ length: TOCK_GAUGE_STEPS + 1 }, (_, k) => [
      tockGaugeGesture(k),
      -(GAUGE_SWEEP_RAD * k) / TOCK_GAUGE_STEPS,
    ]),
  ),
  rate: 3,
  rattle: { gesture: 'foundry_gauge_rattle', seconds: 2.2, amplitude: 0.12 },
};

/** The gauge rattles in the red while the klaxon bar runs. */
export const TOCK_GAUGE_RATTLE = 'foundry_gauge_rattle';

// ---- the Voltaic Warden: plates that turn copper face or charged face out ------

export type PlateFace = 'grounded' | 'charged';

/** The plate gesture for a front and a back face (split plating differs). */
export function voltaicPlateGesture(front: PlateFace, back: PlateFace): string {
  return `foundry_plates_${front[0]}${back[0]}`;
}

/** The faces the Warden wears, read off its plating aura (`value2` 1 = heroic
 *  Split Plating: the back half wears the other face). */
export function voltaicFaces(
  auras: readonly { id: string; value2?: number }[] | undefined,
  groundedId: string,
  chargedId: string,
): { front: PlateFace; back: PlateFace } | null {
  if (!auras) return null;
  for (const a of auras) {
    const face: PlateFace | null =
      a.id === groundedId ? 'grounded' : a.id === chargedId ? 'charged' : null;
    if (!face) continue;
    const other: PlateFace = face === 'grounded' ? 'charged' : 'grounded';
    return { front: face, back: a.value2 === 1 ? other : face };
  }
  return null;
}

/** The plates rattle through the flip bar. */
export const VOLTAIC_PLATE_RATTLE = 'foundry_plates_rattle';

const FACES: readonly PlateFace[] = ['grounded', 'charged'];

/** One plate's dial: it turns half a turn about its own long axis (local +Y)
 *  to show the charged face; `half` says which half of the body it armours. */
export function voltaicPlateDial(bone: string, half: 'front' | 'back'): BoneDialDef {
  const stops: Record<string, number> = {};
  for (const f of FACES) {
    for (const b of FACES) {
      const face = half === 'front' ? f : b;
      stops[voltaicPlateGesture(f, b)] = face === 'charged' ? Math.PI : 0;
    }
  }
  return {
    bone,
    axis: [0, 1, 0],
    stops,
    rate: 5,
    rattle: { gesture: VOLTAIC_PLATE_RATTLE, seconds: 3, amplitude: 0.22 },
  };
}

/** Every plate bone of the Warden and the half of the body it armours
 *  (scripts/assets/stormbrass_foundry_creatures/voltaic_warden.py PLATES). */
export const VOLTAIC_PLATES: readonly (readonly [string, 'front' | 'back'])[] = (
  [
    ['ShoulderPlate', 'front'],
    ['ChestPlate', 'front'],
    ['ThighPlate', 'front'],
    ['BackPlate', 'back'],
    ['ForePlate', 'back'],
    ['CalfPlate', 'back'],
  ] as const
).flatMap(([name, half]) => [[`${name}.L`, half] as const, [`${name}.R`, half] as const]);

// ---- Tock's Half-Built Frames: dormant on the belt until they boot -------------

export const FRAME_DORMANT_GESTURE = 'foundry_frame_dormant';
export const FRAME_AWAKE_GESTURE = 'foundry_frame_awake';

// ---- anchors -------------------------------------------------------------------

export interface FoundryAnchor {
  side: number;
  up: number;
  fwd: number;
}

/** A body point (authored frame, the row's own scale folded in by `drawScale`)
 *  carried into the world by the entity's position and facing. */
export function foundryAnchor(
  pos: { x: number; y: number; z: number },
  facing: number,
  drawScale: number,
  a: FoundryAnchor,
  out: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  const s = Math.sin(facing);
  const c = Math.cos(facing);
  // Facing 0 looks down +z; the creature's left (+side) is +x there.
  out.x = pos.x + (a.fwd * s + a.side * c) * drawScale;
  out.y = pos.y + a.up * drawScale;
  out.z = pos.z + (a.fwd * c - a.side * s) * drawScale;
  return out;
}

// ---- lightning ------------------------------------------------------------------

/** A deterministic hash in [0, 1) (the arcs' jitter, never Math.random). */
export function foundryFxHash(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** A jagged bolt from `a` to `b` written into `out` (its length is the station
 *  count): the ends pinned, the middle displaced across the line by up to
 *  `jag` x its length, most in the middle, finer kinks laid over coarse ones. */
export function arcPathInto(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  seed: number,
  jag: number,
  out: { x: number; y: number; z: number; set(x: number, y: number, z: number): unknown }[],
): void {
  const n = out.length;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1);
    const env = Math.sin(Math.PI * t);
    const coarse = foundryFxHash(seed + Math.floor(t * 4) * 7.1) - 0.5;
    const fine = foundryFxHash(seed * 1.3 + k * 3.7) - 0.5;
    const off = (coarse * 0.6 + fine * 0.8) * jag * len * env;
    const off2 = (foundryFxHash(seed * 0.7 + k * 5.3) - 0.5) * jag * len * env;
    // two directions across the bolt: horizontal-ish and vertical-ish
    const hx = -dz / len;
    const hz = dx / len;
    out[k].set(a.x + dx * t + hx * off, a.y + dy * t + off2, a.z + dz * t + hz * off);
  }
}

/** A shell's arc from its muzzle to its mark: height over the chord at `t`. */
export function shellArcLift(t: number, apex: number): number {
  const c = Math.max(0, Math.min(1, t));
  return 4 * apex * c * (1 - c);
}

// ---- the builds' measured anchors -------------------------------------------------

/** Each creature's VISUALS height over its authored Idle height (the game
 *  normalises the model to the row): an anchor's yards multiply by this and by
 *  the entity's scale. The Prime Draft still wears its placeholder rig. */
export const FOUNDRY_DRAW: Readonly<Record<string, number>> = {
  line_master_tock: 4.32 / 4.583,
  rangewarden: 3.6 / 3.79,
  voltaic_warden: 4.17 / 4.872,
  gantry_hauler: 3.47 / 3.471,
  prime_draft: 1,
};

const a = (side: number, up: number, fwd: number): FoundryAnchor => ({ side, up, fwd });

/** Body points off the Blender builds (scripts/assets/stormbrass_foundry_creatures,
 *  the ANCHOR lines), in each creature's authored frame. */
export const FOUNDRY_FX_ANCHORS = {
  tockStackL: a(0.2, 3.52, -1.03),
  tockStackR: a(-0.2, 3.66, -1.03),
  tockBeacon: a(0.36, 3.34, -0.83),
  tockRiveter: a(0.62, 2.5, 2.1),
  tockChest: a(0, 2.2, 0.5),
  rangeEye: a(0, 2.6, 0.8),
  rangeProofMuzzle: a(-1.2, 2.25, 1.7),
  rangeRack: a(0, 2.2, -1.3),
  wardenCore: a(0, 2.6, 0.22),
  wardenAntlerL: a(0.62, 4.56, -0.06),
  wardenAntlerR: a(-0.62, 4.56, -0.06),
  wardenHandR: a(-1.0, 2.5, 0.6),
  draftChest: a(0, 2.2, 0.5),
  haulerChimney: a(0, 3.5, 0.62),
  haulerNozzleL: a(0.6, 1.13, 2.38),
  haulerNozzleR: a(-0.6, 1.13, 2.38),
  haulerClaw: a(0, 3.7, 0.4),
  haulerBed: a(0, 1.3, -1.9),
  haulerBoiler: a(0, 1.68, -0.05),
} as const;
