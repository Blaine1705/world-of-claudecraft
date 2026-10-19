// Pure plan for the Smith's Heart's gate looks (heart_gates.ts), on the
// shared gate memory (../hollow_crypt/crypt_gate_state_core.ts, fed by the
// mirrored gate entities through ../gate_objects.ts):
//   - 'stone_slab': a slab of living stone across the passage. Opening, it
//     splits down the middle, the halves part and sink into the floor;
//   - 'forge_seal': a ring of runed bronze filled with a forge-light film.
//     Opening, the film dies and the ring sinks away; while a guardian holds
//     it sealed behind the raid, the film flares and beats.
// Shut (closed or sealed) both stand whole and block the eye as they block a
// body; open, nothing stands in the passage.
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
/** The seal ring's tube radius (yards). */
export const HEART_SEAL_RING_TUBE = 0.55;

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
  /** How far the ring has sunk (yards). */
  sink: number;
  /** The film's strength (0 gone, 1 shut, up to 1.6 flaring while sealed). */
  film: number;
  shown: boolean;
}

/** The forge seal at openness `k`, sealed or not, at render time `t`. */
export function heartSealGatePose(k: number, sealed: boolean, t: number): HeartSealPose {
  const shut = 1 - smooth01(k / 0.35);
  const beat = sealed ? 1.3 + 0.3 * Math.sin(t * 5) : 1;
  return {
    sink: smooth01((k - 0.25) / 0.75) * 17,
    film: shut * beat,
    shown: k < 0.999,
  };
}
