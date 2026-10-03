// The Gravewyrm Sanctum bosses' Blender bodies, measured (their delivery
// notes, E:/woc/entregas/santuario/{korgath,velkhar,korzul}/NOTAS.md): the
// facts the looks (characters/sanctum_boss_looks.ts) and the boss effects
// (sanctum_boss_fx.ts) key on, so a chain leaves Korgath's own manacle and
// the breath leaves Korzul's own jaws.
//
// Model space: yards at the authored size, glTF axes: +Y up, the body faces
// +Z, its LEFT is +X; the origin is on the ground under the body. All three
// were authored at their in-game size and are drawn at it (model scale 1 at
// their template's sim scale). Clip times are seconds at 1x (24 fps).
//
// Three-free, DOM-free, deterministic.

import type { SealTool } from '../../sim/encounters/gravewyrm_sanctum/boss_ids';

export interface BossBody {
  url: string;
  /** The template's sim scale (sim/content/dungeons.ts). */
  simScale: number;
  /** In-game yards per model yard at that sim scale. */
  drawnScale: number;
  /** The Idle pose's skinned bounds, lowest to highest vertex: what
   *  prepareVisual normalizes to the def height. */
  idleBoundsHeight: number;
  /** The gait's reference speed (planted feet slide at it) at model scale 1. */
  walkRef: number;
}

/** Korgath the Bound: the Smith's foreman, a chained giant with a maul, 10.3 yd
 *  at Idle (four knights). */
export const KORGATH_BODY: BossBody = {
  url: 'models/creatures/sanctum_korgath.glb',
  simScale: 1.5,
  drawnScale: 1,
  idleBoundsHeight: 10.27,
  walkRef: 3.5,
};

/** Grand Necromancer Velkhar: 4.0 yd to the crown, the staff's finial 5.05. */
export const VELKHAR_BODY: BossBody = {
  url: 'models/creatures/sanctum_velkhar.glb',
  simScale: 1.25,
  drawnScale: 1,
  idleBoundsHeight: 5.06,
  walkRef: 1.11,
};

/** Korzul the Gravewyrm: withers 12.6 yd, the horns 21.6, 53.7 yd nose to tail. */
export const KORZUL_BODY: BossBody = {
  url: 'models/creatures/sanctum_korzul.glb',
  simScale: 1.8,
  drawnScale: 1,
  idleBoundsHeight: 21.85,
  walkRef: 4.8,
};

/** The def height (pivot to the Idle bounds' top at sim scale 1). */
export function bossLookHeight(b: BossBody): number {
  return (b.idleBoundsHeight * b.drawnScale) / b.simScale;
}

/** In-game yards per model yard for a body drawn at sim `scale`. */
export function bossModelScale(b: BossBody, scale: number): number {
  return (b.drawnScale * scale) / b.simScale;
}

/** A clip's play rate that lands its contact frame on a bar's last frame. */
export function contactRate(contact: number, bar: number): number {
  return bar > 0 ? contact / bar : 1;
}

/** Korgath's clip beats (contact frames, seconds at 1x). */
export const KORGATH_CLIP = {
  slam: 1.3,
  sweep: 1.05,
  stomp: 1.5,
  strain: 2.0,
  maulArc: 0.95,
  chainFlail: 2.0,
  thresholdCharge: 2.0,
  bellow: 2.0,
  chainBreakSnap: 0.25,
  roarPeak: 0.7,
  deathKnees: 1.55,
} as const;

/** Korgath's four harness anchor bones, by chain, and the broken-chain mesh a
 *  break reveals (only the arm chains carry one). */
export const KORGATH_ANCHORS: Readonly<Record<SealTool, string>> = {
  hammer: 'Anchor_Hammer',
  tongs: 'Anchor_Tongs',
  anvil: 'Anchor_Anvil',
  bellows: 'Anchor_Bellows',
};
export const KORGATH_BROKEN_CHAIN_MESH: Readonly<Partial<Record<SealTool, string>>> = {
  hammer: 'Korgath_BrokenChain_Hammer',
  tongs: 'Korgath_BrokenChain_Tongs',
};

/** Where each anchor rides at Idle in the model's frame (yards; +x his left,
 *  +z ahead): the stand-in when the live rig is not drawn (the far bake). */
export const KORGATH_ANCHOR_REST: Readonly<Record<SealTool, { x: number; y: number; z: number }>> =
  {
    hammer: { x: -3.1, y: 4.6, z: 0.8 },
    tongs: { x: 3.1, y: 4.6, z: 0.8 },
    anvil: { x: -1.8, y: 0.95, z: -0.2 },
    bellows: { x: 0, y: 8.95, z: -1.0 },
  };

/** Velkhar's clip beats. */
export const VELKHAR_CLIP = {
  castRelease: 0.85,
  thawPull: 1.9,
  trenchLaunch: 1.45,
  volleyBurst: 1.0,
  attackLand: 0.62,
} as const;
/** The soul flame's height over his feet at Idle (the StaffTip). */
export const VELKHAR_FLAME_Y = 5.0;

/** Korzul's clip beats. */
export const KORZUL_CLIP = {
  breakFreeBurst: 1.4,
  breakFreeSlam: 2.9,
  breakFreeLength: 4.42,
  breathStart: 2.0,
  breathEnd: 3.4,
  tailHit: 1.05,
  galeGust: 1.1,
  takeOffLift: 1.1,
  breathAirStart: 1.0,
  breathAirEnd: 2.6,
  landImpact: 1.2,
  infernoPulses: [2, 4, 6, 8] as readonly number[],
  deathIceGives: 2.6,
} as const;
/** The breath leaves his jaws this far ahead and up at Idle (model yards). */
export const KORZUL_MOUTH_REST = { z: 23.2, y: 15.7 } as const;
/** The heart-shard in his chest at Idle. */
export const KORZUL_SHARD_REST = { z: 7.5, y: 8.15 } as const;
/** Every airborne clip carries its altitude: Root rides this high in the hover. */
export const KORZUL_CLIP_FLY_HEIGHT = 6;

/** Presentation gestures (the renderer's triggerAttack seam), never sim ids. */
export const KORGATH_BROKEN_GESTURE: Readonly<Record<SealTool, string>> = {
  hammer: 'sanctum_korgath_broken_hammer',
  tongs: 'sanctum_korgath_broken_tongs',
  anvil: 'sanctum_korgath_broken_anvil',
  bellows: 'sanctum_korgath_broken_bellows',
};
export const KORGATH_WHOLE_GESTURE: Readonly<Record<SealTool, string>> = {
  hammer: 'sanctum_korgath_whole_hammer',
  tongs: 'sanctum_korgath_whole_tongs',
  anvil: 'sanctum_korgath_whole_anvil',
  bellows: 'sanctum_korgath_whole_bellows',
};
/** Korzul's frozen stance (before his pull) and the takeoff one-shot. */
export const KORZUL_FROZEN_STANCE = 'sanctum_korzul_frozen';
export const KORZUL_TAKEOFF_GESTURE = 'sanctum_korzul_takeoff';
/** Velkhar's thaw channel played off a pyre flare. */
export const VELKHAR_THAW_GESTURE = 'sanctum_velkhar_thaw_gesture';

/** Body glow gestures: Korzul's shard heartbeat (and its flare in the last
 *  phase), Korgath's runes burning as he Strains, Velkhar's soul flame
 *  roaring as he casts. */
export const KORZUL_HEARTBEAT_GESTURE = 'sanctum_korzul_heartbeat';
export const KORZUL_HEARTBEAT_FLARE_GESTURE = 'sanctum_korzul_heartbeat_flare';
export const KORGATH_RUNES_GESTURE = 'sanctum_korgath_runes';
export const VELKHAR_FLAME_GESTURE = 'sanctum_velkhar_flame';

/** Seconds between heartbeats: about 40 a minute, faster once the shard flares. */
export function heartbeatEvery(flaring: boolean): number {
  return flaring ? 0.95 : 1.5;
}
