// Pure per-frame fade policy for objects that cross the eye-to-camera segment.
// The chase camera never pulls in for an occluder anymore: whatever blocks the
// view of the player fades toward OCCLUDER_FADE_ALPHA instead, and fades back
// to opaque once the segment is clear. This module is the single animation
// policy every occluder-fade painter shares (props, foliage tree ghosts,
// dungeon walls, Eastbrook roofs); the Three side owns the materials and
// applies the returned alpha.

/** Opacity an occluding structure settles at while it blocks the view. */
export const OCCLUDER_FADE_ALPHA = 0.2;
/** Ease rate toward the faded alpha (fast, so the view clears quickly). */
export const OCCLUDER_FADE_OUT_RATE = 10;
/** Ease rate back to opaque (slower, so reappearing structures read calm). */
export const OCCLUDER_FADE_IN_RATE = 6;
// Snap distance: within this of the target the fade completes exactly, so
// consumers can rely on `alpha === 1` to restore original material state.
const SNAP = 0.01;

/**
 * Advance one occluder's fade alpha toward its target: OCCLUDER_FADE_ALPHA
 * while the structure occludes the player, 1 while it is clear. Exponential
 * ease, snapped to the exact target once close.
 */
export function stepOccluderFade(alpha: number, occluded: boolean, dt: number): number {
  const target = occluded ? OCCLUDER_FADE_ALPHA : 1;
  const start = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 1;
  if (dt <= 0) return start;
  const rate = occluded ? OCCLUDER_FADE_OUT_RATE : OCCLUDER_FADE_IN_RATE;
  const next = start + (target - start) * (1 - Math.exp(-rate * dt));
  return Math.abs(next - target) <= SNAP ? target : next;
}

/** Whether a fade is at rest for its current occlusion state (no work left). */
export function occluderFadeSettled(alpha: number, occluded: boolean): boolean {
  return alpha === (occluded ? OCCLUDER_FADE_ALPHA : 1);
}

/**
 * Whether the eye-to-camera segment crosses an axis-aligned box footprint
 * below its top (all coordinates in one space; XZ slab test, Y checked at the
 * entry point). Either endpoint standing inside the footprint below the top
 * also counts as a hit, mirroring the prop/tree footprint tests.
 */
export function occluderSegmentHitsBox(
  boxX: number,
  boxZ: number,
  halfW: number,
  halfD: number,
  topY: number,
  eyeX: number,
  eyeY: number,
  eyeZ: number,
  camX: number,
  camY: number,
  camZ: number,
): boolean {
  const eyeInside = Math.abs(eyeX - boxX) < halfW && Math.abs(eyeZ - boxZ) < halfD;
  const camInside = Math.abs(camX - boxX) < halfW && Math.abs(camZ - boxZ) < halfD;
  if ((eyeY < topY && eyeInside) || (camY < topY && camInside)) return true;
  const dx = camX - eyeX;
  const dz = camZ - eyeZ;
  const lax = eyeX - boxX;
  const laz = eyeZ - boxZ;
  let tmin = -Infinity;
  let tmax = Infinity;
  if (Math.abs(dx) < 1e-9) {
    if (lax < -halfW || lax > halfW) return false;
  } else {
    let t1 = (-halfW - lax) / dx;
    let t2 = (halfW - lax) / dx;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
  }
  if (Math.abs(dz) < 1e-9) {
    if (laz < -halfD || laz > halfD) return false;
  } else {
    let t1 = (-halfD - laz) / dz;
    let t2 = (halfD - laz) / dz;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
  }
  if (tmax < tmin || tmax < 0) return false;
  if (tmin < 0 || tmin > 1) return false;
  return eyeY + (camY - eyeY) * tmin < topY;
}
