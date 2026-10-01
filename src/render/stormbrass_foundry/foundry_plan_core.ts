// Pure plan for the Stormbrass Foundry's set dressing (foundry_*.ts): the
// palette, where the lights stand, the storm's lightning clock, the jagged
// bolt shapes, the cranes' sweep, the Prime Draft landmark's head aim, and the
// gates' motion curves. Everything here is a function of the authored field
// (sim/content/stormbrass_foundry_layout.ts) and the shared render clock, so
// the dressing is deterministic and testable without Three.
//
// Three-free, DOM-free, deterministic.

import {
  CELL_RACKS,
  COIL_CROWN,
  GANTRY,
  GREAT_COIL,
  STORMBRASS_FOUNDRY_FIELD,
} from '../../sim/content/stormbrass_foundry_layout';

/** The design's palette (docs/design/dungeon-rework/stormbrass_foundry.md
 *  section 7): no orange lava or ember tones; enemy power is blue-white. */
export const FOUNDRY_PALETTE = {
  brass: 0xc9a14a,
  verdigris: 0x4e9c8a,
  iron: 0x3b3f46,
  stone: 0x6e7378,
  steam: 0xe9eef0,
  storm: 0x56657a,
  lightning: 0xcfe8ff,
  hazard: 0xe6c229,
  black: 0x1b1d20,
  wood: 0x5d4632,
  blueprint: 0x2f5f9e,
} as const;

/** Where the Prime Draft landmark stands: in its scaffold beyond the Gantry's
 *  north lip, on a render-only plinth out of the drop, facing the lift. */
export const PRIME_DRAFT_LANDMARK = {
  x: GANTRY.x,
  z: GANTRY.z + GANTRY.r + 11,
  /** Its feet (the plinth top), level with the Gantry floor. */
  y: GANTRY.h,
  /** Its height to the crown of the head (about four times a player's at the
   *  fight; the landmark is the bigger shot, section 4.3). */
  height: 42,
} as const;

/** Where the great coil's crown takes its strikes (instance-local). */
export const COIL_TOP = { x: GREAT_COIL.x, y: COIL_CROWN.h + 30, z: GREAT_COIL.z } as const;

export type FoundryLightKind = 'lamp' | 'coil' | 'cell' | 'crown';

export interface FoundryLightSpot {
  kind: FoundryLightKind;
  x: number;
  z: number;
  /** Height above the floor under it. */
  lift: number;
}

export const FOUNDRY_LIGHT_STYLE: Readonly<
  Record<FoundryLightKind, { color: number; intensity: number; range: number }>
> = {
  lamp: { color: 0xffd98a, intensity: 2.2, range: 16 },
  coil: { color: 0xcfe8ff, intensity: 3.2, range: 24 },
  cell: { color: 0x8fd0ff, intensity: 2.4, range: 14 },
  crown: { color: 0xa9d4ff, intensity: 3, range: 30 },
};

/** Every budgeted point light: the work lamps on their poles, the coil's
 *  glow on the crown, the charging racks' cells. Few and spread out, well
 *  inside the eight-per-zone budget. */
export function planFoundryLights(): FoundryLightSpot[] {
  const out: FoundryLightSpot[] = [];
  for (const p of STORMBRASS_FOUNDRY_FIELD.props) {
    if (p.kind === 'sf_work_lamp') out.push({ kind: 'lamp', x: p.x, z: p.z, lift: 3.8 });
  }
  out.push({ kind: 'crown', x: GREAT_COIL.x, z: GREAT_COIL.z, lift: 12 });
  for (const r of CELL_RACKS) out.push({ kind: 'cell', x: r.x, z: r.z, lift: 3 });
  // The Main Line's two press lamps and the Drafting Yard's plan tables.
  out.push({ kind: 'lamp', x: -22, z: -6, lift: 6 });
  out.push({ kind: 'lamp', x: 22, z: -6, lift: 6 });
  out.push({ kind: 'lamp', x: -30, z: 84, lift: 5 });
  out.push({ kind: 'lamp', x: 30, z: 84, lift: 5 });
  return out;
}

/** A 0..1 hash of an integer and a salt. */
export function foundryHash(n: number, salt = 0): number {
  const v = Math.sin(n * 127.1 + salt * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

/** Seconds between the storm's strikes on the coil (every few seconds). */
export const STRIKE_PERIOD = 4.2;
/** How long a strike's bolt stays lit. */
export const STRIKE_LIT = 0.32;

/** The coil strike at render time `t`: which bolt shape shows and how bright
 *  (0 between strikes). Some beats stay dark, so the rhythm never reads as a
 *  metronome. Cosmetic only (never a telegraph). */
export function coilStrikeAt(t: number, shapes: number): { shape: number; flash: number } {
  const beat = Math.floor(t / STRIKE_PERIOD);
  const into = t - beat * STRIKE_PERIOD - foundryHash(beat, 1) * 1.4;
  if (foundryHash(beat, 2) < 0.18 || into < 0 || into > STRIKE_LIT) return { shape: 0, flash: 0 };
  // A double flicker: bright, a dip, bright again, then gone.
  const k = into / STRIKE_LIT;
  const flicker = k < 0.35 ? 1 : k < 0.5 ? 0.35 : 1 - (k - 0.5) * 1.6;
  return { shape: Math.floor(foundryHash(beat, 3) * shapes) % shapes, flash: Math.max(0, flicker) };
}

/**
 * A jagged bolt from `top` down to `bottom` (instance-local points), `steps`
 * segments with a sideways jitter that tapers to the ends. Deterministic per
 * `seed`.
 */
export function boltPath(
  seed: number,
  top: { x: number; y: number; z: number },
  bottom: { x: number; y: number; z: number },
  steps: number,
  jitter: number,
): { x: number; y: number; z: number }[] {
  const out: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    const taper = Math.sin(Math.PI * k);
    const jx = (foundryHash(i, seed * 13 + 1) - 0.5) * 2 * jitter * taper;
    const jz = (foundryHash(i, seed * 13 + 2) - 0.5) * 2 * jitter * taper;
    out.push({
      x: top.x + (bottom.x - top.x) * k + jx,
      y: top.y + (bottom.y - top.y) * k,
      z: top.z + (bottom.z - top.z) * k + jz,
    });
  }
  return out;
}

/** A crane arm's slow sweep (radians) at time `t`: a lazy back-and-forth
 *  about its rest angle, each crane on its own phase. */
export function craneYaw(t: number, rest: number, phase: number): number {
  return rest + Math.sin(t * 0.11 + phase * 2.3) * 0.9;
}

/**
 * The Prime Draft landmark's head yaw toward a viewer at (vx, vz): it turns to
 * follow the group, never past `limit` radians either side of its rest facing
 * (south, toward the lift). Three's yaw about +y: 0 faces +z.
 */
export function primeDraftHeadYaw(vx: number, vz: number, limit = 1.05): number {
  const dx = vx - PRIME_DRAFT_LANDMARK.x;
  const dz = vz - PRIME_DRAFT_LANDMARK.z;
  // Rest is facing -z (south); the offset from rest, clamped.
  const toward = Math.atan2(dx, dz);
  let off = toward - Math.PI;
  while (off > Math.PI) off -= Math.PI * 2;
  while (off < -Math.PI) off += Math.PI * 2;
  return Math.PI + Math.max(-limit, Math.min(limit, off));
}

/** A steam shutter's lift (0 shut, 1 fully raised into its housing), eased. */
export function shutterLift(openness: number): number {
  const k = Math.min(1, Math.max(0, openness));
  return k * k * (3 - 2 * k);
}

/** The crane bridge's extension (0 folded back on its landing, 1 laid across
 *  the gulf): it swings out first, then runs out along its rails. */
export function bridgeExtension(openness: number): { swing: number; run: number } {
  const k = Math.min(1, Math.max(0, openness));
  return { swing: Math.min(1, k * 2), run: Math.max(0, k * 2 - 1) };
}

/** An arc fence's charge (1 live, 0 powered down), with a dying stutter. */
export function arcFenceCharge(openness: number, t: number): number {
  const k = Math.min(1, Math.max(0, openness));
  if (k <= 0) return 1;
  if (k >= 1) return 0;
  return (1 - k) * (0.6 + 0.4 * (Math.sin(t * 40) > 0 ? 1 : 0));
}
