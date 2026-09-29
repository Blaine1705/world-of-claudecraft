// Pure dressing plan for the Hollow Crypt's open-air necropolis: where the
// soul-wisp rivers flow, where the lanterns and braziers burn, where the moon
// shafts fall, the distant crag ring that closes the vista, the balustrades and
// merlons that dress the generated cliff edges, and the gate reveal curve.
// Everything is derived from the sim layout (content/hollow_crypt_layout.ts)
// and its cliff runs, so moving a terrace moves its dressing with it.
//
// Three-free, DOM-free, deterministic (hash-seeded, never Math.random).

import { HOLLOW_CRYPT_FIELD, HOLLOW_CRYPT_RING } from '../../sim/content/hollow_crypt_layout';
import { authoredFieldCliffRuns, authoredFieldHeight } from '../../sim/instances/authored_field';

export type Vec3 = readonly [number, number, number];

function hash(i: number, salt: number): number {
  const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

const ground = (x: number, z: number): number => authoredFieldHeight(HOLLOW_CRYPT_FIELD, x, z);

// ---- soul-wisp rivers --------------------------------------------------------

/** Every river flows from a place of the dead toward the Rite Ring and up the
 *  column: the finale is the one direction the whole necropolis leans. */
export interface WispRiver {
  id: string;
  points: Vec3[];
  /** Particles on this river at the full tier. */
  count: number;
}

function river(
  id: string,
  pts: readonly (readonly [number, number, number])[],
  count: number,
): WispRiver {
  // Each control point hovers `lift` yards over the ground beneath it.
  return { id, count, points: pts.map(([x, z, lift]) => [x, ground(x, z) + lift, z] as Vec3) };
}

export const HOLLOW_CRYPT_WISP_RIVERS: readonly WispRiver[] = [
  river(
    'cloister',
    [
      [0, -30, 11],
      [0, -2, 9],
      [0, 40, 8],
      [0, 90, 9],
      [0, 140, 16],
      [0, 175, 26],
      [0, 205, 36],
    ],
    90,
  ),
  river(
    'yard',
    [
      [-82, 40, 4],
      [-82, 80, 6],
      [-80, 116, 9],
      [-50, 140, 18],
      [-20, 180, 30],
      [0, 205, 40],
    ],
    70,
  ),
  river(
    'gallery',
    [
      [76, 40, 5],
      [80, 80, 5],
      [80, 112, 8],
      [50, 150, 20],
      [22, 185, 32],
      [0, 205, 42],
    ],
    70,
  ),
  river(
    'stair',
    [
      [43, 161, 4],
      [64, 180, 8],
      [66, 210, 12],
      [40, 238, 18],
      [8, 222, 28],
      [0, 205, 44],
    ],
    50,
  ),
];

/** A point on a river at s in [0, 1) (piecewise linear by length). */
export function riverPointAt(r: WispRiver, s: number): Vec3 {
  const pts = r.points;
  let total = 0;
  const lens: number[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const l = Math.hypot(
      pts[i + 1][0] - pts[i][0],
      pts[i + 1][1] - pts[i][1],
      pts[i + 1][2] - pts[i][2],
    );
    lens.push(l);
    total += l;
  }
  let d = (((s % 1) + 1) % 1) * total;
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const t = lens[i] > 0 ? Math.min(1, d / lens[i]) : 0;
      return [
        pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t,
        pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t,
        pts[i][2] + (pts[i + 1][2] - pts[i][2]) * t,
      ];
    }
    d -= lens[i];
  }
  return pts[pts.length - 1];
}

/** Resample a river into `n` evenly spaced points (the shader's control table). */
export function resampleRiver(r: WispRiver, n: number): Vec3[] {
  return Array.from({ length: n }, (_, i) => riverPointAt(r, i / (n - 1)));
}

// ---- lights -------------------------------------------------------------------------

export type CryptLightKind = 'lantern' | 'brazier' | 'frost' | 'violet' | 'soul' | 'candle';

export interface CryptLightSpot {
  kind: CryptLightKind;
  x: number;
  z: number;
  /** Height of the flame above the ground. */
  lift: number;
}

const L = (kind: CryptLightKind, x: number, z: number, lift: number): CryptLightSpot => ({
  kind,
  x,
  z,
  lift,
});

/** Warm tallow lights are the "living" light; violet, frost and soul-green
 *  belong to the enemy's magic. At most eight per light zone. */
export const HOLLOW_CRYPT_LIGHTS: readonly CryptLightSpot[] = [
  // Lychgate Landing: two braziers flank the first vista.
  L('brazier', -9, -118, 1.6),
  L('brazier', 9, -118, 1.6),
  // Chapel Stair foot and the cloister arcade lanterns.
  L('lantern', -10, -76, 3.2),
  L('lantern', 10, -76, 3.2),
  L('lantern', -38, -40, 3.4),
  L('lantern', 38, -40, 3.4),
  L('candle', 0, -24, 5.2),
  L('lantern', -12, 16, 3.2),
  L('lantern', 12, 16, 3.2),
  // The Processional shrines.
  L('candle', -22, 36, 1.4),
  L('candle', 22, 36, 1.4),
  L('candle', -22, 90, 1.4),
  L('candle', 22, 90, 1.4),
  // Sexton's Yard lanterns (their posts are kit props).
  L('lantern', -58, 34, 3.6),
  L('lantern', -72, 70, 3.6),
  L('lantern', -92, 20, 3.6),
  L('lantern', -70, 100, 3.6),
  L('lantern', -94, 100, 3.6),
  // Widow's Gallery: cold frost glows in the webs.
  L('frost', 60, 30, 6),
  L('frost', 92, 60, 6),
  L('frost', 80, 128, 9),
  // Choir Ruin: violet braziers on the loft.
  L('violet', -26, 166, 1.6),
  L('violet', 26, 166, 1.6),
  L('violet', 0, 176, 6),
  // The Rite Ring: the soul column and the four Remembrance Candles.
  L('soul', 0, 205, 8),
  L('candle', 0, 225, 4.4),
  L('candle', 20, 205, 4.4),
  L('candle', 0, 185, 4.4),
  L('candle', -20, 205, 4.4),
];

export const CRYPT_LIGHT_STYLE: Readonly<
  Record<CryptLightKind, { color: number; flame: number; intensity: number; range: number }>
> = {
  lantern: { color: 0xffa24a, flame: 0xffc070, intensity: 14, range: 22 },
  brazier: { color: 0xff8c3a, flame: 0xffb050, intensity: 22, range: 28 },
  candle: { color: 0xffb561, flame: 0xffd28a, intensity: 8, range: 14 },
  frost: { color: 0x9fd4ff, flame: 0xcfe9ff, intensity: 16, range: 26 },
  violet: { color: 0xa66bff, flame: 0xd2a8ff, intensity: 18, range: 24 },
  soul: { color: 0x6fd6a8, flame: 0xb8ffe0, intensity: 40, range: 48 },
};

// ---- moon shafts ----------------------------------------------------------------------

export interface MoonShaft {
  x: number;
  z: number;
  width: number;
  height: number;
}

/** Tall additive moonbeams falling through the broken vaults and arches. */
export const HOLLOW_CRYPT_MOON_SHAFTS: readonly MoonShaft[] = [
  { x: -18, z: -50, width: 7, height: 40 },
  { x: 16, z: -8, width: 5, height: 34 },
  { x: -6, z: 70, width: 6, height: 36 },
  { x: -80, z: 60, width: 8, height: 42 },
  { x: 74, z: 50, width: 6, height: 40 },
  { x: 10, z: 140, width: 6, height: 38 },
];

// ---- the distant crag ring -------------------------------------------------------------

export interface BackdropSpire {
  x: number;
  z: number;
  radius: number;
  height: number;
  /** Base depth (below the mist) and a per-spire noise seed. */
  base: number;
  seed: number;
}

/** A ring of black crags around the necropolis, far past the walkable edge,
 *  tall enough to break the horizon and close the vista. */
export function planBackdropSpires(count = 34): BackdropSpire[] {
  const cx = 0;
  const cz = 60;
  const out: BackdropSpire[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + hash(i, 1) * 0.12;
    const dist = 300 + hash(i, 2) * 170;
    // Leave the moon's quarter (north-north-west) lower so it rises clear.
    const moonward = Math.cos(a - Math.atan2(-0.32, 0.83));
    const height = (70 + hash(i, 3) * 120) * (moonward > 0.85 ? 0.55 : 1);
    out.push({
      x: cx + Math.sin(a) * dist,
      z: cz + Math.cos(a) * dist,
      radius: 26 + hash(i, 4) * 40,
      height,
      base: -90,
      seed: i,
    });
  }
  return out;
}

// ---- edge dressing ---------------------------------------------------------------------

export interface EdgeDressing {
  kind: 'balustrade' | 'merlon' | 'boneRail' | 'rubble';
  x: number;
  z: number;
  y: number;
  /** Yaw so the piece runs along the edge (three.js rotation.y). */
  rot: number;
  length: number;
}

/**
 * Pieces along every cliff edge that drops into the chasm: carved balustrade
 * or bone rails where a surface asks for them, crenellations on masonry, and
 * loose rubble on raw rock. Placed on the high side, just inside the wall
 * collider, so they read as the lip of the terrace.
 */
export function planEdgeDressing(segment = 4): EdgeDressing[] {
  const out: EdgeDressing[] = [];
  let k = 0;
  for (const run of authoredFieldCliffRuns(HOLLOW_CRYPT_FIELD)) {
    const len = Math.hypot(run.bx - run.ax, run.bz - run.az);
    if (len < 1.5) continue;
    const pieces = Math.max(1, Math.round(len / segment));
    const step = len / pieces;
    const ux = (run.bx - run.ax) / len;
    const uz = (run.bz - run.az) / len;
    const rot = Math.atan2(-uz, ux);
    const kind: EdgeDressing['kind'] =
      run.style === 'balustrade'
        ? 'balustrade'
        : run.style === 'bone'
          ? 'boneRail'
          : run.style === 'masonry'
            ? 'merlon'
            : 'rubble';
    for (let i = 0; i < pieces; i++) {
      k++;
      if (kind === 'rubble' && hash(k, 7) < 0.55) continue;
      const along = step * (i + 0.5);
      // Just inside the lip (the cliff collider is 0.45 yd thick).
      const inset = 0.35;
      const x = run.ax + ux * along - run.nx * inset;
      const z = run.az + uz * along - run.nz * inset;
      out.push({ kind, x, z, y: run.high, rot, length: step });
    }
  }
  return out;
}

// ---- gate reveal curve -------------------------------------------------------------------

/** Seconds a gate takes to open (or seal) on screen. */
export const GATE_REVEAL_SECONDS = 2.6;

/**
 * Openness in [0, 1] of a gate `elapsed` seconds after its state changed from
 * `from` openness to `to`: a heavy ease (slow start, a settle at the end) so a
 * portcullis grinds up, a bridge knits bone by bone, a ward shatters.
 */
export function gateOpenness(from: number, to: number, elapsed: number): number {
  const t = Math.max(0, Math.min(1, elapsed / GATE_REVEAL_SECONDS));
  const ease = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
  return from + (to - from) * ease;
}

/** The ring the Remembrance Candles and alcoves stand on (render helpers). */
export const RITE_RING = HOLLOW_CRYPT_RING;
