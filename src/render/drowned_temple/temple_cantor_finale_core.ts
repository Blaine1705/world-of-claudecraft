// The plan of Laverock's finale on the Moon Altar (the Drowned Temple's lore
// guide, src/sim/dungeon_guide): while he sings the rite's last verse, every
// fallen pilgrim, novice, guard, singer and their Choirmother dissolves into
// moonlight where they fell and rises toward the moon (north, over the crater
// rim), one after another across the song; and motes of moonlight rise slowly
// from the water round the singer for as long as he sings. Pure and
// deterministic (hashed, never Math.random): temple_cantor_finale_fx.ts paints
// it through the shared GPU particle kit.

/** Seconds from the song's first note to the first of the fallen rising. */
export const RISE_LEAD_SEC = 1.6;
/** The window the risings are spread across (the song's first verses). */
export const RISE_SPREAD_SEC = 16;
/** Seconds one fallen keeps rising (motes still emitting). */
export const RISE_EMIT_SEC = 3;
/** Motes one fallen sheds over its rise, at full density. */
export const RISE_MOTES = 40;
/** The large slow wisps of one fallen's light (its shape going up whole). */
export const RISE_WISPS = 7;
/** Motes per second round the singer, at full density. */
export const SONG_MOTES_PER_SEC = 9;
/** The moon's direction from the temple (north, +z), as a drift per second. */
export const MOON_DRIFT = { x: 0, z: 0.9 };

export interface RiseSpot {
  x: number;
  y: number;
  z: number;
  /** Clock time the rising starts. */
  at: number;
}

/** A plain particle launch (the ParticleSpec shape, three-free). */
export interface MoteLaunch {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  ay: number;
  life: number;
  drag: number;
  size0: number;
  size1: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

/** A stable 0..1 hash of two integers. */
export function hash01(a: number, b: number): number {
  let h = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** When each fallen rises: the event's flat (x, y, z) triplets, staggered
 *  across the song by a golden-ratio walk so neighbours never rise together. */
export function riseSchedule(spots: readonly number[], start: number): RiseSpot[] {
  const out: RiseSpot[] = [];
  const n = Math.floor(spots.length / 3);
  for (let i = 0; i < n; i++) {
    const x = spots[i * 3];
    const y = spots[i * 3 + 1];
    const z = spots[i * 3 + 2];
    if (![x, y, z].every(Number.isFinite)) continue;
    const t = (i * 0.6180339887) % 1;
    out.push({ x, y, z, at: start + RISE_LEAD_SEC + t * RISE_SPREAD_SEC });
  }
  return out;
}

/** The k-th mote a rising fallen sheds: born in a body-sized column over the
 *  spot, it lifts and drifts toward the moon, a pale silver shading to blue. */
export function riseMote(spot: RiseSpot, index: number, k: number): MoteLaunch {
  const h1 = hash01(index * 131 + 7, k);
  const h2 = hash01(index * 131 + 11, k * 3 + 1);
  const h3 = hash01(index * 131 + 13, k * 5 + 2);
  const ang = h1 * Math.PI * 2;
  const rad = 0.15 + h2 * 0.55;
  const cool = h3;
  return {
    x: spot.x + Math.cos(ang) * rad,
    y: spot.y + 0.1 + h3 * 1.8,
    z: spot.z + Math.sin(ang) * rad,
    vx: MOON_DRIFT.x + (h2 - 0.5) * 0.5,
    vy: 3 + h1 * 2.4,
    vz: MOON_DRIFT.z + (h1 - 0.5) * 0.5,
    ay: 0.45,
    life: 6 + h2 * 3,
    drag: 0.05,
    size0: 0.55 + h3 * 0.45,
    size1: 0.08,
    r: 0.82 - cool * 0.12,
    g: 0.9,
    b: 1,
    a: 0.75,
  };
}

/** The k-th large wisp of a rising fallen: a soft body-tall glow that lifts
 *  slowly and keeps rising toward the moon long after the motes thin out. */
export function riseWisp(spot: RiseSpot, index: number, k: number): MoteLaunch {
  const h1 = hash01(index * 197 + 3, k);
  const h2 = hash01(index * 197 + 5, k * 3 + 1);
  return {
    x: spot.x + (h1 - 0.5) * 0.8,
    y: spot.y + 0.6 + k * 0.35,
    z: spot.z + (h2 - 0.5) * 0.8,
    vx: MOON_DRIFT.x,
    vy: 1.6 + h1 * 0.8,
    vz: MOON_DRIFT.z * 1.4,
    ay: 0.25,
    life: 9 + h2 * 3,
    drag: 0.02,
    size0: 2.2 - k * 0.12,
    size1: 0.5,
    r: 0.76,
    g: 0.87,
    b: 1,
    a: 0.5,
  };
}

/** The k-th mote round the singer: rising slowly off the water and stones
 *  within a few yards of him. */
export function songMote(cx: number, cy: number, cz: number, k: number): MoteLaunch {
  const h1 = hash01(9001, k);
  const h2 = hash01(9002, k * 7 + 3);
  const ang = h1 * Math.PI * 2;
  const rad = 1.2 + h2 * 5.5;
  return {
    x: cx + Math.cos(ang) * rad,
    y: cy + 0.05,
    z: cz + Math.sin(ang) * rad,
    vx: 0,
    vy: 0.7 + h2 * 0.6,
    vz: 0.15,
    ay: 0.05,
    life: 5 + h1 * 3,
    drag: 0.02,
    size0: 0.16 + h2 * 0.14,
    size1: 0.03,
    r: 0.86,
    g: 0.92,
    b: 1,
    a: 0.6,
  };
}

/** How many motes a span emits at `perSec` (carrying the fraction forward). */
export function moteBudget(
  debt: number,
  dt: number,
  perSec: number,
): { count: number; debt: number } {
  const total = debt + Math.max(0, dt) * perSec;
  const count = Math.floor(total);
  return { count, debt: total - count };
}
