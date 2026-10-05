// PURE: the Hollow Crypt wing bosses' effect plan (crypt_boss_fx.ts and its
// painters marrow_fx.ts, lady_fx.ts, ilvane_fx.ts). Three-free, DOM-free,
// deterministic: the curves, the lantern looks, the bell's height and the
// line-of-sight shadows the choir pillars throw, so a Vitest pins them
// directly (tests/crypt_boss_fx_core.test.ts).
//
// Presentation only: every timing a player reacts to is the sim's (cast bars,
// aura clocks, encounter objects); this decides only how bright and where.

import { DUNGEONS, instanceOrigin, instanceSlotForZ } from '../../sim/data';

/** The world origin of the Hollow Crypt claim a world spot stands in (the
 *  sim's layout and encounter spots are instance-local). */
export function cryptSlotOrigin(x: number, z: number): { x: number; z: number } {
  const o = instanceOrigin(DUNGEONS.hollow_crypt.index, instanceSlotForZ(z));
  return { x: o.x, z: o.z };
}

/** The Burial Bell's mouth over the Bell Yard floor (yards): the kit's bell
 *  hangs from the beam 74 over the chasm floor at -40 (docs/design/
 *  dungeon-rework/kit/build_hollow_crypt_kit.py `bell_tower`), its lip about
 *  4.3 under the beam; the yard floor stands at 8. */
export const BELL_MOUTH_OVER_YARD = 74 - 40 - 4.3 - 8;

/** A swell that rises fast and falls slower over `span` seconds (0 outside). */
export function pulse(age: number, span: number): number {
  if (age < 0 || age > span) return 0;
  const k = age / span;
  return k < 0.15 ? k / 0.15 : (1 - k) ** 1.6 / 0.85 ** 1.6;
}

/** An Open Grave's opening: the pit widens over its first 0.45 s (0..1). */
export function graveOpening(age: number): number {
  const k = Math.min(1, Math.max(0, age / 0.45));
  return 1 - (1 - k) ** 3;
}

/** A floor decal fading in over `fadeIn` seconds after it appeared (0..1). */
export function fadeIn(age: number, fadeIn: number): number {
  return Math.min(1, Math.max(0, age / Math.max(1e-3, fadeIn)));
}

export type LanternLookState = 'lit' | 'dark' | 'kindling';

/** A grave lantern's look this frame: the flame, the light pool on the floor
 *  (the shelter: drawn on every tier), and a guttering flicker. */
export function lanternLook(
  state: LanternLookState,
  clock: number,
  seed: number,
): { flame: number; pool: number; glass: number } {
  const flick = 0.9 + 0.06 * Math.sin(clock * 11 + seed) + 0.04 * Math.sin(clock * 23.7 + seed * 3);
  if (state === 'lit') return { flame: flick, pool: 0.85 + 0.15 * flick, glass: flick };
  if (state === 'kindling') {
    // Sputtering back to life: a stutter that builds.
    const s = 0.5 + 0.5 * Math.sin(clock * 9 + seed);
    return { flame: 0.25 + 0.45 * s, pool: 0.12 + 0.18 * s, glass: 0.3 + 0.4 * s };
  }
  return { flame: 0, pool: 0, glass: 0.06 };
}

/** The bell rope's pull while the Toll rings (0 slack, 1 hauled down): one
 *  pull a second, bottoming at 0.9 of it, released through the rest. */
export function ropePull(ringT: number): number {
  if (ringT < 0) return 0;
  const k = ringT % 1;
  return k < 0.9 ? Math.sin((k / 0.9) * (Math.PI / 2)) : 1 - (k - 0.9) / 0.1;
}

/** The bell's swing angle (radians) while it is rung: each pull throws it
 *  further, damped between peals. */
export function bellSwing(ringT: number): number {
  if (ringT < 0) return 0;
  const peals = Math.min(3, Math.floor(ringT) + 1);
  const amp = 0.18 + 0.1 * peals;
  return Math.sin(ringT * Math.PI * 2) * amp * Math.exp(-0.15 * (ringT % 1));
}

/**
 * The shadow a round pillar throws from a singer's voice: the quad on the
 * floor (instance or world coordinates alike) behind the pillar, from the
 * pillar's two tangent points out to `reach` yards from the singer. A player
 * standing in it cannot be seen (the sim's line of sight agrees for a pillar
 * as tall as the choir's). Returns null when the singer stands inside the
 * pillar. Points in order: near-left, near-right, far-right, far-left.
 */
export function pillarShadow(
  sx: number,
  sz: number,
  px: number,
  pz: number,
  r: number,
  reach: number,
): [number, number][] | null {
  const dx = px - sx;
  const dz = pz - sz;
  const d = Math.hypot(dx, dz);
  if (d <= r + 0.05) return null;
  const base = Math.atan2(dx, dz);
  const half = Math.asin(Math.min(1, r / d));
  const tangent = Math.sqrt(Math.max(0, d * d - r * r));
  const far = Math.max(reach, d + r + 1);
  const out: [number, number][] = [];
  for (const [ang, len] of [
    [base - half, tangent],
    [base + half, tangent],
    [base + half, far],
    [base - half, far],
  ] as const) {
    out.push([sx + Math.sin(ang) * len, sz + Math.cos(ang) * len]);
  }
  return out;
}

/** The Frozen Embrace's frost spiral: point `k` of `n` round the held, at
 *  `t` seconds, as an offset (x, y, z) from the spiral's foot. */
export function embraceSpiral(
  t: number,
  k: number,
  n: number,
  radius: number,
  height: number,
): [number, number, number] {
  const u = (k / n + t * 0.35) % 1;
  const a = u * Math.PI * 6 + t * 2.2;
  const r = radius * (1 - 0.35 * u);
  return [Math.sin(a) * r, u * height, Math.cos(a) * r];
}

/** Notes pouring down a burst lane: how far along (0..1) note `k` of `n` is
 *  `age` seconds after the burst, or -1 once it is spent. */
export function noteRun(age: number, k: number, n: number): number {
  const delay = (k / n) * 0.18;
  const u = (age - delay) / 0.42;
  return u < 0 || u > 1 ? -1 : u;
}
