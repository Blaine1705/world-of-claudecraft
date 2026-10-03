// The Smith's Seal Gate's cosmetic plan (pure, Three-free): where the rune
// light hangs, where the cold mist film fills the tunnel mouth, the rime fan
// on the plaza, and the cold mist puffs that pour out of the tunnel along the
// ground. src/render/sanctum_seal_gate.ts is the thin painter. Every value is
// door-local: lx = x - door.x (+x WEST), lz = z - door.z (+z NORTH), y above
// the door's terrain height. Cosmetic only: nothing here is a telegraph, and
// the effects tier only thins the puffs.

/** The static effects tier (src/game/ui_effects_profile.ts resolves it). */
export type SealGateEffectsTier = 'low' | 'medium' | 'high' | 'ultra';

/** The single point light: a faint clean blue off the lintel's runes. */
export const SANCTUM_RUNE_LIGHT = {
  lx: 0,
  y: 11.6,
  lz: -2.6,
  color: 0x5ab8ff,
  intensity: 1.4,
  distance: 16,
} as const;

/** The cold mist film across the tunnel mouth, just behind the pylons (the
 *  portal look: the walk-in trigger fires before a player reaches it). */
export const SANCTUM_MIST_FILM = { lz: 2.6, width: 7.4, height: 9.8, centerY: 4.9 } as const;

/** The rime fan: frost on the ground within about 12 yd of the gate, in a fan
 *  that follows the cold coming out of the mouth. */
export const SANCTUM_RIME_FAN = {
  originLz: -1.2,
  radius: 12.5,
  halfAngle: 1.15,
  rows: 12,
  cols: 22,
  lift: 0.05,
} as const;

/** The mist puffs' flow: born in the mouth, carried out over the plaza. */
export const SANCTUM_MIST_FLOW = {
  startLz: 2.0,
  endLz: -13.0,
  startY: 0.8,
  endY: 0.2,
  spread: 9.0,
} as const;

/** Puff count by the static effects tier (never the FPS governor). */
export function sanctumMistPuffCount(tier: SealGateEffectsTier): number {
  switch (tier) {
    case 'low':
      return 6;
    case 'medium':
      return 12;
    case 'high':
      return 18;
    default:
      return 24;
  }
}

export interface MistPuff {
  /** Life-cycle offset in [0, 1). */
  phase: number;
  /** Life cycles per second. */
  speed: number;
  /** Lateral lane in [-1, 1] (the fan widens along the flow). */
  lane: number;
  /** Size multiplier. */
  size: number;
}

/** A puff's fixed parameters: golden-ratio spread, no random stream. */
export function sanctumMistPuff(index: number, count: number): MistPuff {
  const g = (index * 0.61803398875) % 1;
  const h = (index * 0.75487766625 + 0.31) % 1;
  return {
    phase: (index + 0.5) / Math.max(1, count),
    speed: 0.045 + g * 0.03,
    lane: h * 2 - 1,
    size: 0.8 + ((index * 0.38196601125) % 1) * 0.5,
  };
}

export interface MistPose {
  x: number;
  y: number;
  z: number;
  /** Billboard width in yards (the height is half of it). */
  scale: number;
  alpha: number;
}

function smoothstep(a: number, b: number, v: number): number {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Where a puff is at a time: the SAME formula the painter's vertex shader
 * evaluates on the GPU (sanctum_seal_gate.ts, MIST_VERTEX), kept here so a
 * Node test can pin the flow (out of the mouth, widening, fading in and out).
 */
export function sanctumMistPose(puff: MistPuff, time: number, out: MistPose): MistPose {
  const f = SANCTUM_MIST_FLOW;
  const raw = puff.phase + time * puff.speed;
  const t = raw - Math.floor(raw);
  out.x = puff.lane * (0.8 + t * f.spread) + Math.sin(time * 0.3 + puff.phase * Math.PI * 2) * 0.6;
  out.y = f.startY + (f.endY - f.startY) * t;
  out.z = f.startLz + (f.endLz - f.startLz) * t;
  out.scale = (1.6 + t * 3.4) * puff.size;
  out.alpha = smoothstep(0, 0.15, t) * (1 - smoothstep(0.65, 1, t));
  return out;
}

function hash2(x: number, z: number): number {
  const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

/** The rime fan's grid vertex (row, col) in door-local lx/lz. */
export function rimeFanVertex(row: number, col: number): { lx: number; lz: number } {
  const f = SANCTUM_RIME_FAN;
  const r = 0.4 + (f.radius - 0.4) * (row / f.rows);
  const a = -f.halfAngle + (2 * f.halfAngle * col) / f.cols;
  return { lx: Math.sin(a) * r, lz: f.originLz - Math.cos(a) * r };
}

/** The frost's opacity at a fan vertex: thick by the gate, thinning toward
 *  the rim and the fan's sides, broken into patches. */
export function rimeFanAlpha(row: number, col: number): number {
  const f = SANCTUM_RIME_FAN;
  const radial = 1 - row / f.rows;
  const side = 1 - Math.abs((2 * col) / f.cols - 1);
  const { lx, lz } = rimeFanVertex(row, col);
  const patch = 0.55 + 0.45 * hash2(Math.floor(lx * 0.8), Math.floor(lz * 0.8));
  const a = radial ** 0.8 * smoothstep(0, 0.45, side) * patch;
  return row === f.rows || col === 0 || col === f.cols ? 0 : Math.min(0.85, a);
}
