import { describe, expect, it } from 'vitest';
import {
  clampFrameScale,
  clampTargetFramePos,
  FRAME_SCALE_MAX,
  FRAME_SCALE_MIN,
  parseTargetFramePos,
  placeTargetFrame,
  scaleFromGripDrag,
  serializeTargetFramePos,
  TARGET_FRAME_MARGIN,
} from '../src/ui/target_frame_pos';

const viewport = { w: 1000, h: 800 };
const size = { w: 220, h: 92 };

describe('clampTargetFramePos', () => {
  it('leaves an in-bounds position untouched', () => {
    expect(clampTargetFramePos({ left: 300, top: 200 }, viewport, size)).toEqual({
      left: 300,
      top: 200,
    });
  });

  it('clamps a negative position to the top-left margin', () => {
    expect(clampTargetFramePos({ left: -50, top: -50 }, viewport, size)).toEqual({
      left: TARGET_FRAME_MARGIN,
      top: TARGET_FRAME_MARGIN,
    });
  });

  it('keeps the whole frame on-screen at the bottom-right', () => {
    const clamped = clampTargetFramePos({ left: 9999, top: 9999 }, viewport, size);
    expect(clamped.left).toBe(viewport.w - size.w - TARGET_FRAME_MARGIN);
    expect(clamped.top).toBe(viewport.h - size.h - TARGET_FRAME_MARGIN);
  });

  it('falls back to the margin when the viewport is too small for the frame', () => {
    const clamped = clampTargetFramePos({ left: 500, top: 500 }, { w: 100, h: 60 }, size);
    expect(clamped).toEqual({ left: TARGET_FRAME_MARGIN, top: TARGET_FRAME_MARGIN });
  });
});

describe('placeTargetFrame (UI Scale compensation)', () => {
  // The frame lives inside #ui, which carries `zoom: var(--ui-scale)`. Pointer /
  // rect coordinates are post-zoom (visual), but style.left/top are author lengths
  // the browser re-multiplies by the zoom, so the css write is visual / scale.
  it('at scale 1 the css write equals the clamped visual position', () => {
    const p = placeTargetFrame({ left: 300, top: 200 }, viewport, size, 1);
    expect(p.pos).toEqual({ left: 300, top: 200 });
    expect(p.css).toEqual({ left: 300, top: 200 });
  });

  it('divides the css write by the scale while persisting the visual position', () => {
    for (const scale of [0.8, 1.25, 1.4]) {
      const p = placeTargetFrame({ left: 400, top: 240 }, viewport, size, scale);
      // Persisted (pos) stays in visual space: identical across every scale.
      expect(p.pos).toEqual({ left: 400, top: 240 });
      // css is the author length the #ui zoom re-multiplies back to the visual spot.
      expect(p.css.left).toBeCloseTo(400 / scale, 9);
      expect(p.css.top).toBeCloseTo(240 / scale, 9);
      // Round-trip: css written to style.left, times the zoom, lands under the cursor.
      expect(p.css.left * scale).toBeCloseTo(400, 9);
      expect(p.css.top * scale).toBeCloseTo(240, 9);
    }
  });

  it('dragging N visual px moves the css write by N / scale (1:1 cursor tracking)', () => {
    const scale = 1.25;
    const before = placeTargetFrame({ left: 400, top: 240 }, viewport, size, scale);
    const after = placeTargetFrame({ left: 500, top: 300 }, viewport, size, scale);
    expect(after.pos.left - before.pos.left).toBe(100); // visual delta unchanged
    expect(after.css.left - before.css.left).toBeCloseTo(100 / scale, 9);
    expect(after.css.top - before.css.top).toBeCloseTo(60 / scale, 9);
  });

  it('clamps the whole frame on screen in visual space before dividing', () => {
    const scale = 1.25;
    const p = placeTargetFrame({ left: 9999, top: 9999 }, viewport, size, scale);
    // The clamp keeps the visual box inside the viewport margin ...
    expect(p.pos.left).toBe(viewport.w - size.w - TARGET_FRAME_MARGIN);
    expect(p.pos.top).toBe(viewport.h - size.h - TARGET_FRAME_MARGIN);
    // ... and the css write is that clamped visual position divided by the scale.
    expect(p.css.left).toBeCloseTo(p.pos.left / scale, 9);
    expect(p.css.top).toBeCloseTo(p.pos.top / scale, 9);
  });

  it('treats a non-positive / non-finite scale as 1 (never blanks the frame)', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const p = placeTargetFrame({ left: 120, top: 90 }, viewport, size, bad);
      expect(p.css).toEqual({ left: 120, top: 90 });
    }
  });
});

describe('serialize / parse round-trip', () => {
  it('round-trips a position', () => {
    const pos = { left: 123, top: 456 };
    expect(parseTargetFramePos(serializeTargetFramePos(pos))).toEqual(pos);
  });

  it('returns null for missing / empty input', () => {
    expect(parseTargetFramePos(null)).toBeNull();
    expect(parseTargetFramePos(undefined)).toBeNull();
    expect(parseTargetFramePos('')).toBeNull();
  });

  it('returns null for corrupt or non-finite data', () => {
    expect(parseTargetFramePos('not json')).toBeNull();
    expect(parseTargetFramePos('{"left":1}')).toBeNull();
    expect(parseTargetFramePos('{"left":"x","top":2}')).toBeNull();
    expect(parseTargetFramePos('{"left":null,"top":2}')).toBeNull();
    expect(parseTargetFramePos(JSON.stringify({ left: Infinity, top: 2 }))).toBeNull();
    expect(parseTargetFramePos(JSON.stringify({ left: Number.NaN, top: 2 }))).toBeNull();
  });

  it('omits `scale` entirely for a move-only frame, so the stored payload is unchanged', () => {
    expect(serializeTargetFramePos({ left: 123, top: 456 })).toBe('{"left":123,"top":456}');
    expect(parseTargetFramePos('{"left":123,"top":456}')).toEqual({ left: 123, top: 456 });
  });

  it('round-trips a scaled frame and clamps a saved multiplier into the legal band', () => {
    const scaled = { left: 40, top: 60, scale: 1.5 };
    expect(parseTargetFramePos(serializeTargetFramePos(scaled))).toEqual(scaled);
    expect(parseTargetFramePos(JSON.stringify({ left: 1, top: 2, scale: 99 }))).toEqual({
      left: 1,
      top: 2,
      scale: FRAME_SCALE_MAX,
    });
    expect(parseTargetFramePos(JSON.stringify({ left: 1, top: 2, scale: 0.01 }))).toEqual({
      left: 1,
      top: 2,
      scale: FRAME_SCALE_MIN,
    });
  });

  it('drops a corrupt scale without losing the position', () => {
    for (const bad of ['x', null, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(parseTargetFramePos(JSON.stringify({ left: 7, top: 8, scale: bad }))).toEqual({
        left: 7,
        top: 8,
      });
    }
  });
});

describe('clampFrameScale', () => {
  it('passes an in-band multiplier through and clamps the rest', () => {
    expect(clampFrameScale(1)).toBe(1);
    expect(clampFrameScale(1.3)).toBe(1.3);
    expect(clampFrameScale(FRAME_SCALE_MAX + 5)).toBe(FRAME_SCALE_MAX);
    expect(clampFrameScale(FRAME_SCALE_MIN - 0.5)).toBe(FRAME_SCALE_MIN);
  });

  it('falls back to 1 on a non-finite read rather than a degenerate transform', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(clampFrameScale(bad)).toBe(1);
    }
  });
});

describe('scaleFromGripDrag', () => {
  const start = { w: 200, h: 100 };

  it('grows by the larger axis ratio and shrinks when the grip is pulled inward', () => {
    // +100px on a 200px width is 1.5x; +10px on a 100px height is only 1.1x.
    expect(scaleFromGripDrag(1, start, 100, 10)).toBeCloseTo(1.5, 9);
    expect(scaleFromGripDrag(1, start, -50, -50)).toBeCloseTo(0.75, 9);
  });

  it('compounds onto the multiplier the frame already carries', () => {
    expect(scaleFromGripDrag(1.2, start, 100, 0)).toBeCloseTo(1.8, 9);
  });

  it('clamps the result into the legal band at both ends', () => {
    expect(scaleFromGripDrag(1, start, 5000, 5000)).toBe(FRAME_SCALE_MAX);
    expect(scaleFromGripDrag(1, start, -199, -99)).toBe(FRAME_SCALE_MIN);
  });

  it('returns the start multiplier when the frame was measured with no box', () => {
    // A frame grabbed while display:none has a 0x0 rect: no ratio exists, and
    // dividing by it would hand the frame a NaN transform.
    expect(scaleFromGripDrag(1.25, { w: 0, h: 0 }, 80, 80)).toBe(1.25);
  });
});
