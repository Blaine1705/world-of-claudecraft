// Pure plan for the Smith's Heart's gate looks (heart_gates.ts), on the
// shared gate memory (../hollow_crypt/crypt_gate_state_core.ts, fed by the
// mirrored gate entities through ../gate_objects.ts):
//   - 'stone_slab': a slab of living stone across the passage. Opening, it
//     splits down the middle, the halves part and sink into the floor;
//   - 'forge_seal': a LOW barrier, never a wall: a bronze sill across the
//     passage with a glowing rune line, a row of thin vertical light bars
//     standing on it and a short bronze post at each end (HEART_SEAL_BARRIER
//     caps the whole at about three yards, so the causeway gates never hide
//     the seal from the Ring). Shut, the bars burn; sealed behind the raid,
//     they flare and beat. Opening, the bars die and the sill sinks away.
// Every part is a box in the gate's frame (x across the passage, y up from
// its floor, z along it): the painter draws them, and the sightline pin
// (heart_sightline_core.ts) traces rays against the same boxes.
//
// Three-free, DOM-free, deterministic.

import type { DungeonGateKind } from '../../sim/types';

export type HeartGateRig = 'slab' | 'seal';

/** The rig a Smith's Heart gate kind wears (null for a kind it never uses). */
export function heartGateRig(kind: DungeonGateKind): HeartGateRig | null {
  if (kind === 'stone_slab') return 'slab';
  if (kind === 'forge_seal') return 'seal';
  return null;
}

/** The slab's size (yards): it fills the passage up to this height. */
export const HEART_SLAB = { height: 9, thick: 2.2 } as const;
/** The forge seal's sizes (yards): the sill's height and depth, the light
 *  bars' top above the floor, the end posts' height (the tallest part). */
export const HEART_SEAL_BARRIER = {
  sillHeight: 0.6,
  sillDepth: 0.9,
  barTop: 2.2,
  barWidth: 0.16,
  postHeight: 2.8,
  /** Half the clear gap left between the two middle bars, on the
   *  passage's centre line (the line a raid looks along). */
  centreGap: 1.3,
  /** The spacing between bars. */
  barStep: 1.8,
} as const;

export type HeartGatePartRole = 'half' | 'crack' | 'sill' | 'rune' | 'bar' | 'post';

/** One part, shut, in the gate's frame: a box centred at (x, y, z), w x h x d. */
export interface HeartGatePart {
  role: HeartGatePartRole;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  /** -1 or 1 for a slab half (which way it parts). */
  side?: number;
}

/** Every part of a gate rig `width` yards across, shut. */
export function heartGateParts(rig: HeartGateRig, width: number): HeartGatePart[] {
  const half = width / 2;
  if (rig === 'slab') {
    const { height, thick } = HEART_SLAB;
    return [
      { role: 'half', side: -1, x: -half / 2, y: height / 2, z: 0, w: half, h: height, d: thick },
      { role: 'half', side: 1, x: half / 2, y: height / 2, z: 0, w: half, h: height, d: thick },
      { role: 'crack', x: 0, y: height * 0.45, z: 0, w: 0.25, h: height * 0.9, d: thick + 0.1 },
    ];
  }
  const B = HEART_SEAL_BARRIER;
  const parts: HeartGatePart[] = [
    { role: 'sill', x: 0, y: B.sillHeight / 2, z: 0, w: width, h: B.sillHeight, d: B.sillDepth },
    {
      role: 'rune',
      x: 0,
      y: B.sillHeight * 0.55,
      z: B.sillDepth / 2 + 0.02,
      w: width - 0.6,
      h: 0.14,
      d: 0.04,
    },
  ];
  const barH = B.barTop - B.sillHeight;
  for (let x = B.centreGap; x <= half - 0.4; x += B.barStep) {
    for (const s of [-1, 1]) {
      parts.push({
        role: 'bar',
        x: s * x,
        y: B.sillHeight + barH / 2,
        z: 0,
        w: B.barWidth,
        h: barH,
        d: B.barWidth,
      });
    }
  }
  for (const s of [-1, 1]) {
    parts.push({
      role: 'post',
      x: s * (half + 0.35),
      y: B.postHeight / 2,
      z: 0,
      w: 0.6,
      h: B.postHeight,
      d: 0.8,
    });
  }
  return parts;
}

function smooth01(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

export interface HeartSlabPose {
  /** How far each half has moved out from the middle (yards). */
  part: number;
  /** How far the halves have sunk (yards). */
  sink: number;
  /** Still drawn (false once wholly under the floor). */
  shown: boolean;
}

/** The slab at openness `k` (0 shut, 1 open). */
export function heartSlabPose(k: number): HeartSlabPose {
  const part = smooth01(k / 0.3) * 1.4;
  const sink = smooth01((k - 0.2) / 0.8) * (HEART_SLAB.height + 0.6);
  return { part, sink, shown: k < 0.999 };
}

export interface HeartSealPose {
  /** How far the sill and its bars have sunk (yards). */
  sink: number;
  /** The bars' and runes' strength (0 dark, 1 shut, up to 1.6 flaring
   *  while sealed). */
  film: number;
  shown: boolean;
}

/** The forge seal at openness `k`, sealed or not, at render time `t`. */
export function heartSealGatePose(k: number, sealed: boolean, t: number): HeartSealPose {
  const shut = 1 - smooth01(k / 0.35);
  const beat = sealed ? 1.3 + 0.3 * Math.sin(t * 5) : 1;
  return {
    sink: smooth01((k - 0.25) / 0.75) * (HEART_SEAL_BARRIER.barTop + 0.4),
    film: shut * beat,
    shown: k < 0.999,
  };
}

/** A part posed at openness `k`: its centre and whether it draws. Slab
 *  halves part and sink, the crack sinks and closes; the seal's sill, runes
 *  and bars sink, its end posts stay. */
export function heartGatePartPose(
  part: HeartGatePart,
  rig: HeartGateRig,
  k: number,
): { x: number; y: number; z: number; shown: boolean } {
  if (rig === 'slab') {
    const pose = heartSlabPose(k);
    if (part.role === 'half') {
      const side = part.side ?? 1;
      return { x: part.x + side * pose.part, y: part.y - pose.sink, z: part.z, shown: pose.shown };
    }
    return { x: part.x, y: part.y - pose.sink, z: part.z, shown: pose.shown && pose.part < 0.6 };
  }
  if (part.role === 'post') return { x: part.x, y: part.y, z: part.z, shown: true };
  const pose = heartSealGatePose(k, false, 0);
  const lit = part.role === 'bar' || part.role === 'rune' ? pose.film > 0.01 : true;
  return { x: part.x, y: part.y - pose.sink, z: part.z, shown: pose.shown && lit };
}
