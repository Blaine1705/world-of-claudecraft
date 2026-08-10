// Pure geometry + persistence helpers for the movable target frame. No DOM, no
// Three, no sim deps: just arithmetic and (de)serialization so the clamping rules
// can be unit-tested headlessly. The DOM wiring (the move/lock button, pointer
// events, applying styles) lives in hud.ts; this module only answers "given a
// desired top-left and a viewport, what is the legal position, and how do we
// round-trip it through localStorage?". Mirrors chat_window.ts (its move-only
// sibling: the target frame has a fixed size, so there is no resize half).

// `left`/`top` are the target frame's top-left corner in viewport px.
// `scale` is the OPTIONAL player-chosen size multiplier a scalable frame carries
// (the SE-corner grip on the unlocked HUD frames writes it). It is absent on every
// frame that only moves, which keeps the persisted payload byte-identical to what
// shipped before the grip existed: a client that never resizes a frame still
// stores exactly {left, top}.
export interface TargetFramePos {
  left: number;
  top: number;
  scale?: number;
}

// The gap kept between the frame and every viewport edge, matching the chat box's
// 8px margin so a dragged frame never touches the screen edge.
export const TARGET_FRAME_MARGIN = 8;

// Size multiplier bounds for a scalable frame. The floor keeps a frame readable
// (and its controls above the 40x40px touch floor once the mobile layout is out
// of the picture); the ceiling keeps a frame from swallowing the viewport.
export const FRAME_SCALE_MIN = 0.6;
export const FRAME_SCALE_MAX = 2;

/** Clamp a desired size multiplier into the legal band. A non-finite read (a
 *  corrupt store, a divide by a zero rect) falls back to 1 rather than blanking
 *  the frame with a degenerate transform. */
export function clampFrameScale(
  scale: number,
  min: number = FRAME_SCALE_MIN,
  max: number = FRAME_SCALE_MAX,
): number {
  if (!Number.isFinite(scale)) return 1;
  return clamp(scale, min, max);
}

/** Size multiplier for a grip drag of (dx, dy) visual px from the session start.
 *  The grip sits at the frame's bottom-right and the transform origin is its
 *  top-left, so pulling away from the origin on EITHER axis grows the frame; the
 *  larger of the two axis ratios wins, which keeps a diagonal pull feeling
 *  direct without letting a purely horizontal one shrink the height. A start box
 *  with no width or height (a frame measured while hidden) cannot produce a
 *  ratio, so the start scale is returned unchanged. */
export function scaleFromGripDrag(
  startScale: number,
  startSize: { w: number; h: number },
  dx: number,
  dy: number,
  min: number = FRAME_SCALE_MIN,
  max: number = FRAME_SCALE_MAX,
): number {
  const base = clampFrameScale(startScale, min, max);
  const ratios: number[] = [];
  if (startSize.w > 0) ratios.push((startSize.w + dx) / startSize.w);
  if (startSize.h > 0) ratios.push((startSize.h + dy) / startSize.h);
  if (ratios.length === 0) return base;
  return clampFrameScale(base * Math.max(...ratios), min, max);
}

function clamp(v: number, lo: number, hi: number): number {
  // hi can fall below lo on a viewport too small to hold the frame; prefer the
  // lower bound (margin) so the frame stays anchored to the top-left corner.
  return Math.max(lo, Math.min(hi, v));
}

// Clamp a desired position so the whole frame (its measured `size`) stays on
// screen inside the margin. Called on every drag move and on window resize.
export function clampTargetFramePos(
  pos: TargetFramePos,
  viewport: { w: number; h: number },
  size: { w: number; h: number },
  margin: number = TARGET_FRAME_MARGIN,
): TargetFramePos {
  const maxLeft = Math.max(margin, viewport.w - size.w - margin);
  const maxTop = Math.max(margin, viewport.h - size.h - margin);
  // Carry `scale` through untouched: clamping is a POSITION rule, and dropping
  // the multiplier here would silently reset a resized frame on every re-clamp
  // (a drag move, a window resize, a UI Scale change all run through this).
  return {
    ...pos,
    left: clamp(pos.left, margin, maxLeft),
    top: clamp(pos.top, margin, maxTop),
  };
}

// A positive, finite divisor for the UI-scale compensation below. A bad read
// (0, negative, NaN, Infinity) falls back to 1 so a drag never blanks the frame.
function safeScale(scale: number): number {
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

export interface TargetFramePlacement {
  /** Clamped top-left in VISUAL (screen / pointer) space: persist THIS. It stays
   *  scale-independent, so a spot saved at one UI Scale renders at the same visual
   *  place at another (the css write divides by whatever scale is live at paint). */
  pos: TargetFramePos;
  /** Top-left to write to style.left/top, in AUTHOR space (visual / scale): the
   *  frame lives inside #ui (`zoom: var(--ui-scale)`), which re-multiplies the
   *  author length back to `pos` on screen. */
  css: TargetFramePos;
}

// Clamp a desired VISUAL top-left so the whole frame (its visual `size`) stays on
// screen, then derive the AUTHOR-space css write the #ui zoom re-multiplies back.
// Mirrors hud.ts setWindowPixelPosition: getBoundingClientRect() and pointer
// clientX/clientY are post-zoom, but style.left/top are author lengths, so the
// write divides by the live UI scale. `scale` of 1 (the default) is a no-op.
export function placeTargetFrame(
  pos: TargetFramePos,
  viewport: { w: number; h: number },
  size: { w: number; h: number },
  scale: number,
  margin: number = TARGET_FRAME_MARGIN,
): TargetFramePlacement {
  const clamped = clampTargetFramePos(pos, viewport, size, margin);
  const z = safeScale(scale);
  return { pos: clamped, css: { left: clamped.left / z, top: clamped.top / z } };
}

// `scale` is written ONLY when the frame actually carries one, so a move-only
// frame keeps the exact {left, top} payload it has always persisted and an old
// client reading a new store is unaffected either way.
export function serializeTargetFramePos(pos: TargetFramePos): string {
  return JSON.stringify(
    pos.scale === undefined
      ? { left: pos.left, top: pos.top }
      : { left: pos.left, top: pos.top, scale: pos.scale },
  );
}

// Parse persisted position, returning null for missing/corrupt data so callers
// fall back to the CSS default. left/top must both be finite numbers; `scale` is
// optional, and a corrupt one is DROPPED rather than failing the whole parse, so
// a bad multiplier costs the player their frame size and never their position.
export function parseTargetFramePos(raw: string | null | undefined): TargetFramePos | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const nums = ['left', 'top'].map((k) => o[k]);
    if (nums.some((n) => typeof n !== 'number' || !Number.isFinite(n))) return null;
    const [left, top] = nums as number[];
    const rawScale = o.scale;
    if (typeof rawScale !== 'number' || !Number.isFinite(rawScale)) return { left, top };
    return { left, top, scale: clampFrameScale(rawScale) };
  } catch {
    return null;
  }
}
