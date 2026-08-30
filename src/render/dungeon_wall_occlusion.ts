// Per-frame driver for the dungeon shells' hideable walls, moved out of
// DungeonInteriors so the two occlusion modes live behind one seam:
// - the classic sightline fade (a wall crossing the eye-to-camera segment
//   ghosts to 20% opacity), for every standard interior; and
// - the Ignivar raid shells' BACKFACE CULL: a wall whose outside the camera
//   is on hides outright (alpha 0, snap-on like every occluder fade), the
//   whole face at once, with the wall-mounted dressing props bound to that
//   face culled alongside it. The chase camera has no collision pull-in, so
//   without this an orbit through a wall filled the frame with its back.
// Wall fades keep shadow casting (occluder_fade.ts contract; the raid shell
// walls cast none anyway). Wall-MOUNTED props are the deliberate exception:
// a culled prop takes its shadow with it, because a shadow thrown by an
// invisible beam reads worse than a shadow that pops with its caster.
import type * as THREE from 'three';
import { type ArenaWallFootprint, arenaWallSegmentHits } from './arena_wall_occlusion_core';
import {
  advanceOccluderFade,
  applyOccluderFade,
  type OccluderFadeMat,
  occluderFadeReady,
  prefetchOccluderFadeWithin,
  stageOccluderFadeOnce,
} from './occluder_fade';
import { occluderFadeSettled, stepOccluderFade } from './occluder_fade_core';
import { cameraSeesWallBack, type WallCullPlane } from './wall_backface_cull_core';

/** One registered hideable wall (a face's placements share one record). */
export interface WallHideable {
  group: THREE.Group;
  mats: OccluderFadeMat[];
  hidden: boolean;
  alpha: number;
  footprint: ArenaWallFootprint;
  /** Present on the Ignivar raid shells: cull to alpha 0 whenever the camera
   *  is on this plane's outside, instead of the sightline ghost. */
  backface?: WallCullPlane;
}

/** A wall-face subgroup of mounted dressing props, culled with its wall. */
export interface WallPropBinding {
  node: THREE.Object3D;
  plane: WallCullPlane;
  /** interior root that owns this binding (retirement key) */
  owner: THREE.Object3D;
  alpha: number;
}

/** Name prefix the dressing builders give wall-face prop subgroups; the
 *  subgroup's userData.wallPlane carries the face plane in interior-local
 *  coordinates. */
export const WALL_PROP_GROUP_PREFIX = 'ignivarWallProps:';

/**
 * Alpha the wall must recover to before its mounted props re-show. Hiding is
 * instant (the props vanish behind a wall that is still opaque on the frame
 * the cull begins); re-showing waits until the easing wall mostly covers
 * them again, so the pop is never visible through a transparent wall.
 */
export const WALL_PROP_SHOW_ALPHA = 0.6;

/** Collect the wall-face prop subgroups of a dressing group into bindings,
 *  lifting their local face planes into world space by the interior origin. */
export function collectWallPropBindings(
  dressing: THREE.Object3D,
  ox: number,
  oz: number,
  owner: THREE.Object3D,
): WallPropBinding[] {
  const bindings: WallPropBinding[] = [];
  for (const child of dressing.children) {
    if (!child.name.startsWith(WALL_PROP_GROUP_PREFIX)) continue;
    const local = (child.userData as { wallPlane?: WallCullPlane }).wallPlane;
    if (!local) continue;
    bindings.push({
      node: child,
      plane: { x: ox + local.x, z: oz + local.z, nx: local.nx, nz: local.nz },
      owner,
      alpha: 1,
    });
  }
  return bindings;
}

/** Advance every hideable wall and wall-prop binding one frame. */
export function updateWallOcclusion(
  hideables: readonly WallHideable[],
  propBindings: readonly WallPropBinding[],
  camX: number,
  camY: number,
  camZ: number,
  eyeX: number,
  eyeY: number,
  eyeZ: number,
  dt: number,
  reducedMotion = false,
): void {
  for (const h of hideables) {
    if (!h.backface) {
      // The classic sightline ghost draws its transparent twin, so it steps
      // through the shared gated advance: the flip waits for the linked fade
      // program, warmed ahead by the within-reach prefetch (occluder_fade.ts).
      prefetchOccluderFadeWithin(h.mats, h.footprint.x, h.footprint.z, camX, camZ);
      const hide = arenaWallSegmentHits(h.footprint, eyeX, eyeY, eyeZ, camX, camY, camZ);
      h.hidden = hide;
      h.alpha = advanceOccluderFade(h.mats, h.alpha, hide, dt, reducedMotion);
      continue;
    }
    // Stage the transparent twins AHEAD of the first re-show. Interior-built
    // hideables sit outside the boot ghost prewarm (occluder_ghost_prewarm.ts
    // scans the boot scene only), and the floor step below writes the flip
    // ungated, so the twin programs must already be linked by the time the
    // camera returns inside the room: the first advanced frame asks the fade
    // gate (occluder_fade_gate.ts) to link a twin for every record in h.mats
    // through the reveal host, the same staged warm the sightline arm gets
    // from its within-reach prefetch. Unconditional on purpose: the backface
    // cull is distance-independent, so a reach latch would be the wrong gate.
    stageOccluderFadeOnce(h.mats);
    const hide = cameraSeesWallBack(h.backface, camX, camZ);
    h.hidden = hide;
    if (occluderFadeSettled(h.alpha, hide, 0)) continue;
    const next = stepOccluderFade(h.alpha, hide, dt, reducedMotion, 0);
    // The re-show OUT of the fully hidden state is the one frame that would
    // draw the transparent twin cold if the staged link is still pending (a
    // congested reveal lane can hold one for seconds), so it consults
    // readiness for every exact twin and HOLDS while any is not: the wall is
    // invisible at alpha 0, so holding it hidden a few frames longer cannot
    // pop anything, and the edge consult escalates the pending prefetch to
    // the actionable floor. Scoped to alpha 0 with a mid-range step on
    // purpose: a mid-ease wall is already visibly transparent (holding it
    // WOULD pop, the documented rationale below), and the reduced-motion
    // re-show steps straight to 1, which restores the authored OPAQUE state
    // and never draws the twin, so neither waits on the gate.
    if (h.alpha === 0 && next > 0 && next < 1 && !occluderFadeReady(h.mats, 'edge')) continue;
    h.alpha = next;
    applyOccluderFade(h.mats, h.alpha);
    // At rest a culled wall stops drawing outright: the fade keeps
    // depthWrite on (correct for the visible ghost), and an invisible
    // depth-writing wall would clip mis-sorted transparent content behind
    // it (the arena's lava moat). Program cost: the opaque program linked
    // at interior attach; the TRANSPARENT twin programs are pre-staged by
    // the stageOccluderFadeOnce above and the re-show out of alpha 0 waits
    // on their readiness, so no draw here ever links a program inside a
    // camera frame. The ungated apply below the readiness hold stays
    // deliberate: the hide frame never draws the transparent twin (the
    // group hides outright), and holding the ease-back while the group is
    // already VISIBLE would pop the wall back at full opacity, so the hold
    // exists only where nothing is showing.
    const show = h.alpha > 0;
    if (h.group.visible !== show) h.group.visible = show;
  }
  for (const b of propBindings) {
    const hide = cameraSeesWallBack(b.plane, camX, camZ);
    if (!occluderFadeSettled(b.alpha, hide, 0)) {
      b.alpha = stepOccluderFade(b.alpha, hide, dt, reducedMotion, 0);
    }
    const visible = !hide && b.alpha >= WALL_PROP_SHOW_ALPHA;
    if (b.node.visible !== visible) b.node.visible = visible;
  }
}

/** Drop the records owned by retired interior roots, so the per-frame scan
 *  does not grow across floor rebuilds. */
export function retireWallOcclusion(
  hideables: WallHideable[],
  propBindings: WallPropBinding[],
  doomed: ReadonlySet<THREE.Object3D>,
): void {
  for (let i = hideables.length - 1; i >= 0; i--) {
    if (doomed.has(hideables[i].group)) hideables.splice(i, 1);
  }
  for (let i = propBindings.length - 1; i >= 0; i--) {
    if (doomed.has(propBindings[i].owner)) propBindings.splice(i, 1);
  }
}
