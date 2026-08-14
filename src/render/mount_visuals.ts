// Rideable-mount view data + the procedural motion math: which VISUALS key a
// sim MountKey renders as, how high the rider sits, and the bob applied to the
// clipless mounts (the hover cycle floats, the griffin canters; the snail
// glides flat). Pure and Node-tested (tests/mount_visuals.test.ts); the
// renderer is a thin consumer. The catalog itself (names, gates, combat
// numbers) is sim content: src/sim/content/mounts.ts.

import type { MountKey } from '../sim/content/mounts';
import { MOUNTS } from '../sim/content/mounts';

/** A lit lamp carried on the mount's own skeleton. The renderer hangs a point
 *  light off `bone` so the flame tracks the lamp through every swing of the
 *  clip, instead of a world-space light chasing the body a frame behind. */
export interface MountLampSpec {
  /** Joint node name in the mount GLB (three names its Bone after it). */
  bone: string;
  /** Lamp centre in that bone's LOCAL space, in MODEL units. The visual's
   *  normalization scale carries it to world, so this stays valid whatever
   *  `height` the manifest gives the mount. */
  offset: readonly [number, number, number];
}

/** A seat carried on the mount's own skeleton, for mounts whose saddle MOVES
 *  relative to the body (the Lanternback's throne rolls and pitches with his
 *  shoulders). The rider is parented to the bone instead of floating at a fixed
 *  lift, so his weight stays on the seat through the whole cycle rather than
 *  the seat sliding through him. */
export interface MountSeatSpec {
  /** Joint node name in the mount GLB (three names its Bone after it). */
  bone: string;
  /** Where the rider's ROOT sits in that bone's local space, in MODEL units, so
   *  it survives any `height` the manifest normalizes the mount to. */
  offset: readonly [number, number, number];
}

export interface MountVisualSpec {
  /** VISUALS key (src/render/characters/manifest.ts, lazyPreload). */
  visualKey: string;
  /** World-unit rider lift onto the saddle at e.scale = 1. */
  seat: number;
  /** World-unit rider shift along facing (negative = toward the tail) for
   *  mounts whose saddle sits off the model origin (the toad's is well back). */
  seatFwd: number;
  /** Carries baked Idle/Walk/Run gait clips (scripts/bake_mount_gaits.mjs).
   *  The clipless rest render their generated standing pose and move via the
   *  bob below. */
  rigged: boolean;
  /** Procedural bob amplitude in world units (0 = none). */
  bobAmp: number;
  /** Bob frequency in cycles per second. */
  bobHz: number;
  /** Bob even while standing (the hover cycle floats in place). */
  bobIdle: boolean;
  /** Bob shape: a smooth hover sine, or gallop-style hops (abs sine). */
  bobShape: 'hover' | 'hop';
  /** Ambient particle effect the renderer emits for this mount: the snail's
   *  slime path while moving, the hover cycle's aether exhaust. */
  fx: 'slime' | 'exhaust' | null;
  /** Lit lamps carried on the rig (empty for every mount that carries none). */
  lamps: readonly MountLampSpec[];
  /** Seat bone the rider is anchored to, or null to sit at the fixed `seat`
   *  lift (every mount whose saddle does not move under the rider). */
  seatBone: MountSeatSpec | null;
}

const spec = (
  visualKey: string,
  seat: number,
  rigged: boolean,
  bob?: { amp: number; hz: number; idle?: boolean; shape?: 'hover' | 'hop' },
  seatFwd = 0,
  fx: 'slime' | 'exhaust' | null = null,
  lamps: readonly MountLampSpec[] = [],
  seatBone: MountSeatSpec | null = null,
): MountVisualSpec => ({
  visualKey,
  seat,
  seatFwd,
  rigged,
  bobAmp: bob?.amp ?? 0,
  bobHz: bob?.hz ?? 0,
  bobIdle: bob?.idle ?? false,
  bobShape: bob?.shape ?? 'hop',
  fx,
  lamps,
  seatBone,
});

// The Lanternback's two storm lanterns. Each hangs from the TOP of its chain
// (the bone head), so the offset is measured straight down the bone to the
// lamp's glass: 0.681 model units of a 1.02-unit bone. The two chains are
// identical, hence one shared offset.
const LANTERN_LAMP_OFFSET = [0.005, 0.681, -0.007] as const;

/** Colour of a carried lamp's point light: sodium-warm, matching the emissive
 *  `lantern_glow` material baked into the mount GLB. */
export const MOUNT_LAMP_COLOR = 0xff8c32;
/** Base intensity. Above a wall torch (castle_features uses 4 at 13) on purpose:
 *  these are the mount's whole identity, they hang high on a 7-unit creature, and
 *  a lamp that only lit the throne it hung from was not worth carrying. */
export const MOUNT_LAMP_INTENSITY = 6.5;
/** Falloff radius in world units. Sized against the Lanternback at height 7.0,
 *  whose lamps hang about 5 units up and 1.7 apart: they should pool light on the
 *  ground around him, not stop at the throne. */
export const MOUNT_LAMP_DISTANCE = 17;

export const MOUNT_VISUAL_SPECS: Record<MountKey, MountVisualSpec> = {
  // seat tuned to the authored horse model: its saddle sits forward of the
  // origin and lower than the old Tripo build, so the rider shifts toward the
  // neck and drops a touch
  valorsteed: spec('mount_valorsteed', 2.4, true, undefined, 0.15),
  grag_bear: spec('mount_grag_bear', 3.35, true, undefined, -0.8),
  stalkglider_snail: spec('mount_stalkglider_snail', 2.65, false, undefined, -0.3, 'slime'),
  aether_hover_cycle: spec(
    'mount_aether_hover_cycle',
    2.1,
    false,
    { amp: 0.14, hz: 1.1, idle: true, shape: 'hover' },
    0,
    'exhaust',
  ),
  shadowjump_toad: spec('mount_shadowjump_toad', 2.52, true, undefined, -0.5),
  // gait-rigged by bake_mount_gaits.mjs (buildPropRig): real Walk/Run clips
  // replaced the old procedural canter hop
  stormfeather_griffin: spec('mount_stormfeather_griffin', 2.75, true),
  // ships its authored strut cycle as Walk/Run plus a baked breathing Idle;
  // the saddle sits over the hips, behind the neck (hence the rear shift)
  thunderstrut_gobbler: spec('mount_thunderstrut_gobbler', 2.05, true, undefined, -0.15),
  // Compact tracked vehicle with an authored rider socket behind the turret.
  // Its rigid-body clips animate the suspension and track wheels without a
  // procedural bob, keeping the pilot locked to the saddle.
  terrorspark_groundshaker: spec('mount_terrorspark_groundshaker', 2.38, true, undefined, -0.3),
  // The Drakemaw Raptor: authored saddle sits over the hips behind the neck
  // spines (hence the slight rear shift), gait-rigged Walk/Run cycles.
  drakemaw_raptor: spec('mount_drakemaw_raptor', 2.35, true, undefined, -0.1),
  // The Lanternback Troll: the rider sits IN the iron throne strapped across
  // his shoulders, not astride a back, so the seat is high and set BEHIND the
  // model origin. `seat`/`seatFwd` here are only the FALLBACK and the anchor the
  // nameplate rides; the rider's actual position comes from the chair bone
  // below. Both were fitted at height 5.0 (pan 3.656 above ground, sit-pose hip
  // 0.087 above the root) and then carried to the 40% larger height 7.0.
  // No procedural bob: the authored lope carries the whole bounce.
  lanternback_troll: spec(
    'mount_lanternback_troll',
    5.15,
    true,
    undefined,
    -0.36,
    null,
    [
      { bone: 'lantern_l', offset: LANTERN_LAMP_OFFSET },
      { bone: 'lantern_r', offset: LANTERN_LAMP_OFFSET },
    ],
    // The throne rides his shoulders, so it rolls and pitches with every stride:
    // a rider held at a fixed lift gets slid through by it. Anchoring to the
    // chair bone keeps him planted in the seat instead. Offset measured in
    // Blender: the seat pan sits (0, 0.89, 0.25) from the bone head, and the
    // rider's root rides a hair above the pan so the sit pose's hips carry his
    // weight onto it.
    { bone: 'chair', offset: [0, 0.918, 0.25] },
  ),
};

/** Spec for an entity's active mountKey, or null when dismounted/unknown. */
export function mountVisualSpec(mountKey: string): MountVisualSpec | null {
  return mountKey in MOUNTS ? MOUNT_VISUAL_SPECS[mountKey as MountKey] : null;
}

/** World-unit rider lift for the active mountKey ('' or unknown: 0). */
export function mountSeatLift(mountKey: string): number {
  return mountVisualSpec(mountKey)?.seat ?? 0;
}

/**
 * Flame flicker for one carried lamp, as a multiplier on MOUNT_LAMP_INTENSITY.
 *
 * Two detuned sines per lamp rather than noise: it is deterministic (so the
 * headless tests can pin it), allocation-free on the hot path, and never
 * repeats visibly because the two periods are incommensurate. `index` detunes
 * the pair per lamp so the left and right lanterns never pulse in lockstep,
 * which is what gives away a scripted flicker. Bounded to [0.78, 1.14]: a lamp
 * that guttered to zero would pop the point-light budget's shine decision on
 * and off, and one that spiked would bloom.
 */
export function mountLampFlicker(timeSec: number, index: number): number {
  const phase = index * 2.399;
  const a = Math.sin(timeSec * 7.3 + phase);
  const b = Math.sin(timeSec * 11.9 + phase * 1.7);
  return 0.96 + 0.12 * a + 0.06 * b;
}

/** Procedural vertical offset for a clipless mount at time t (seconds). */
export function mountBobY(spec: MountVisualSpec, timeSec: number, moving: boolean): number {
  if (spec.bobAmp <= 0) return 0;
  if (!moving && !spec.bobIdle) return 0;
  const wave = Math.sin(timeSec * Math.PI * 2 * spec.bobHz);
  return (spec.bobShape === 'hover' ? wave : Math.abs(wave)) * spec.bobAmp;
}
