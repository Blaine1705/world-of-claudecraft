// Hester's toys' visual plan (sim: src/sim/seasonal/seasonal_toys.ts; the Three half is
// seasonal_toys_fx.ts). Pure: no Three, no DOM, no clock, so a Vitest reads every curve.
//
// Each toy is a `seasonal_cosmetic` aura on a player (the prank's on its target), so the
// render reads it off the ordinary aura wire and every client agrees. This core answers:
// which toy looks a body wears and how far through each it is; where the thrown pumpkin
// is along its arc; where the ghost circles; where each bat of the swarm flies; how the
// candle's mist and the lantern's glow breathe; and where the play broom's bristles touch
// the ground as its user walks.
import { GOURDLIGHT_TOYS, type GourdlightToyEffect } from '../sim/content/gourdlight_eve';

/** The thrown pumpkin's flight (s): the head appears and the splat lands at its end. */
export const PRANK_FLIGHT_SEC = 0.65;
/** Its arc's height above the straight line between the hands and the head (yd). */
export const PRANK_ARC_HEIGHT = 2.2;
/** Bats in one swarm, and the pool's cap (three swarms at once). */
export const BAT_COUNT = 26;
export const BAT_CAP = BAT_COUNT * 3;
/** Ghosts, lanterns, candles and brooms drawn at once (each pool's cap). */
export const TOY_CAP = 8;
/** Thrown pumpkins in the air at once. */
export const PRANK_CAP = 6;
/** The candle's whisper loop (scripts/sfx/gourdlight_sfx.mjs), played at its spot. */
export const CANDLE_WHISPER_SFX = 'murmurwick_whispers_loop';
/** The prank's splat (played on landing, not on the throw). */
export const PRANK_SPLAT_SFX = 'impact_prank_pumpkin_splat';
/** The play broom's sweep, replayed softly every stride while its user walks. */
export const BROOM_SWEEP_SFX = 'spell_sparkbristle_sweep';
/** Seconds between the broom's replayed sweeps while walking. */
export const BROOM_SWEEP_EVERY = 1.6;
/** The mist's radius on the ground round the candle (yd). */
export const CANDLE_MIST_RADIUS = 3.4;

const BY_AURA: ReadonlyMap<string, GourdlightToyEffect> = new Map(
  GOURDLIGHT_TOYS.map((toy) => [toy.auraId, toy.effect]),
);
/** The prank's aura id (the head the thrown pumpkin leaves). */
export const PRANK_AURA_ID: string =
  GOURDLIGHT_TOYS.find((toy) => toy.effect === 'prank')?.auraId ?? '';

interface AuraLike {
  id: string;
  kind: string;
  remaining?: number;
  duration?: number;
  sourceId?: number;
  value2?: number;
  value3?: number;
}

/** One toy look a body wears right now. */
export interface ToyLook {
  effect: GourdlightToyEffect;
  auraId: string;
  /** Seconds since it began (from the aura's own timer). */
  elapsed: number;
  remaining: number;
  duration: number;
  sourceId: number;
  /** The lantern's or candle's spot, when it was set down. */
  spotX?: number;
  spotZ?: number;
}

/** The toy effect an aura id draws, or null for any other aura. */
export function toyEffectOf(auraId: string): GourdlightToyEffect | null {
  return BY_AURA.get(auraId) ?? null;
}

/** Every toy look in `auras`, in aura order (one per toy: the sim never stacks one). */
export function toyLooksOf(auras: readonly AuraLike[]): ToyLook[] {
  const out: ToyLook[] = [];
  for (const a of auras) {
    if (a.kind !== 'seasonal_cosmetic') continue;
    const effect = BY_AURA.get(a.id);
    if (!effect) continue;
    const duration = a.duration ?? 0;
    const remaining = Math.max(0, a.remaining ?? 0);
    const look: ToyLook = {
      effect,
      auraId: a.id,
      elapsed: Math.max(0, duration - remaining),
      remaining,
      duration,
      sourceId: a.sourceId ?? 0,
    };
    if (typeof a.value2 === 'number' && typeof a.value3 === 'number') {
      look.spotX = a.value2;
      look.spotZ = a.value3;
    }
    out.push(look);
  }
  return out;
}

/** Whether a body's auras carry a landed prank head (the flight is over). */
export function wearsPrankHead(auras: readonly AuraLike[]): boolean {
  for (const a of auras) {
    if (a.id !== PRANK_AURA_ID || a.kind !== 'seasonal_cosmetic') continue;
    const elapsed = (a.duration ?? 0) - (a.remaining ?? 0);
    if (elapsed >= PRANK_FLIGHT_SEC - 1e-6) return true;
  }
  return false;
}

/** The fade in and out of a look that lasts `duration` (0 to 1). */
export function lookFade(elapsed: number, remaining: number, fadeIn = 0.6, fadeOut = 1.2): number {
  const a = Math.min(1, Math.max(0, elapsed / fadeIn));
  const b = Math.min(1, Math.max(0, remaining / fadeOut));
  return a * b;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** The thrown pumpkin at `u` (0 at the hand, 1 on the head): a lob over a parabola, and
 *  its spin (radians) so it tumbles end over end. */
export function prankArc(from: Vec3Like, to: Vec3Like, u: number): Vec3Like & { spin: number } {
  const k = Math.min(1, Math.max(0, u));
  return {
    x: from.x + (to.x - from.x) * k,
    y: from.y + (to.y - from.y) * k + PRANK_ARC_HEIGHT * 4 * k * (1 - k),
    z: from.z + (to.z - from.z) * k,
    spin: k * Math.PI * 3,
  };
}

/** The ghost's offset from its keeper at time `t` (s since it came out): it circles at
 *  shoulder height, bobbing, leaning into its turn, and faces along its path. */
export function ghostOrbit(t: number, phase = 0): Vec3Like & { yaw: number; bob: number } {
  const w = 0.9;
  const a = t * w + phase;
  const r = 1.35 + 0.18 * Math.sin(t * 0.7 + phase);
  const bob = Math.sin(t * 2.1 + phase) * 0.16;
  return {
    x: Math.sin(a) * r,
    y: 1.55 + bob + 0.1 * Math.sin(t * 0.43),
    z: Math.cos(a) * r,
    // tangent of the circle (the direction of travel)
    yaw: a + Math.PI / 2,
    bob,
  };
}

/** A small deterministic hash in [0, 1) for bat `i` of a swarm (no rng: the look only). */
export function batHash(i: number, salt: number): number {
  const v = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

/** Bat `i` of a swarm `t` seconds after the sack opens: it bursts up out of the sack in
 *  a tight spiral round its opener, then scatters out and away; `alpha` fades it out at
 *  the end and `flap` is its wing beat (radians). Null once it has flown off. */
export function batFlight(
  i: number,
  t: number,
  life: number,
): (Vec3Like & { yaw: number; flap: number; alpha: number; scale: number }) | null {
  if (t < 0 || t > life) return null;
  const h0 = batHash(i, 1);
  const h1 = batHash(i, 2);
  const h2 = batHash(i, 3);
  const delay = h0 * 0.35;
  const s = t - delay;
  if (s < 0) return null;
  const spiral = Math.min(s / 1.6, 1);
  const out = Math.max(0, s - 1.1);
  const a = h1 * Math.PI * 2 + s * (4.2 + h2 * 2.2) * (1 - 0.5 * spiral);
  const r = 0.3 + 1.6 * spiral + out * (3.2 + h0 * 3);
  const y = 0.9 + 2.4 * spiral ** 0.8 + out * (1.2 + h1 * 1.8) + Math.sin(s * 6 + i) * 0.15;
  const flapRate = 22 + h2 * 10;
  const tail = life - delay;
  const alpha = Math.min(1, s / 0.15) * Math.min(1, Math.max(0, (tail - s) / 0.8));
  return {
    x: Math.sin(a) * r,
    y,
    z: Math.cos(a) * r,
    yaw: a + Math.PI / 2,
    flap: Math.sin(s * flapRate) * 0.9,
    alpha,
    scale: 0.75 + 0.5 * h1,
  };
}

/** The candle's mist strength (0 to 1): it spreads out over the first two seconds and
 *  thins away over the last three. */
export function candleMist(
  elapsed: number,
  remaining: number,
): { strength: number; radius: number } {
  const grow = Math.min(1, Math.max(0, elapsed / 2));
  const fade = Math.min(1, Math.max(0, remaining / 3));
  return { strength: grow * fade, radius: CANDLE_MIST_RADIUS * (0.35 + 0.65 * grow ** 0.7) };
}

/** A candle flame's flicker (0.7 to 1.15) at time `t`. */
export function candleFlicker(t: number, phase = 0): number {
  return 0.92 + 0.12 * Math.sin(t * 13 + phase) + 0.08 * Math.sin(t * 29.3 + phase * 2.1);
}

/** Where the play broom sits by its sweeper: held at the right hip, its bristles brushing
 *  the ground ahead and to the side, swept to and fro with the walk. Local yards, +z
 *  forward, +x right. `sweep` is the swing (-1 to 1); `stride` is 0 still, 1 walking. */
export function broomPose(
  t: number,
  stride: number,
): { hand: Vec3Like; bristle: Vec3Like; sweep: number } {
  const sweep = Math.sin(t * 5.2) * stride + Math.sin(t * 1.3) * 0.15 * (1 - stride);
  return {
    hand: { x: 0.42, y: 1.02, z: 0.22 },
    bristle: { x: 0.55 + 0.32 * sweep, y: 0.08, z: 0.95 + 0.08 * Math.abs(sweep) },
    sweep,
  };
}

/** How many sparks the broom throws this frame's worth of motion (yards moved since the
 *  last frame): a trail that thickens with speed and rests at a slow glitter when still. */
export function broomSparkRate(speed: number): number {
  return speed > 0.4 ? 40 + Math.min(40, speed * 8) : 6;
}

/** The broom's ember trail (round of 2026-10-19, read over tall meadow grass and in
 *  daylight): besides the sparks off the bristles, embers float up out of the grass and
 *  linger behind the walker, so the trail reads at any time of day. `rate` is per second
 *  (none while standing still), `lift` how high above the bristles they rise from. */
export function broomEmberTrail(speed: number): { rate: number; lift: number } {
  if (speed <= 0.4) return { rate: 0, lift: 0 };
  const stride = Math.min(1, speed / 3);
  return { rate: 18 + 22 * stride, lift: 0.3 + 0.25 * stride };
}

/** The candle's glow column (same round): a soft green light standing over the dish and
 *  pale wisps climbing out of the flames, so the candle still shows where the grass hides
 *  its dish and its ground mist. Follows the mist's own grow and fade. */
export function candleGlowColumn(
  elapsed: number,
  remaining: number,
): { opacity: number; height: number; wispRate: number } {
  const { strength } = candleMist(elapsed, remaining);
  return { opacity: 0.16 * strength, height: 0.55 + 0.25 * strength, wispRate: 6 * strength };
}

/** Halo slots an accent glow leaves free for the pumpkin flights and their splats. */
export const HALO_PRANK_RESERVE = PRANK_CAP * 2;

/** Whether the glow pool (`used` of `size` handed out this frame) still has a slot: an
 *  accent (a candle's column, a broom's raised glow) never eats into the slots the
 *  pranks ask for last, so a crowded square keeps every pumpkin's flight and splat. */
export function haloSlotFree(used: number, size: number, accent: boolean): boolean {
  return used < (accent ? size - HALO_PRANK_RESERVE : size);
}
