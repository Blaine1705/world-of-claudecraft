// Browser-mode guard for the label sprite cache (src/ui/text_sprite_cache.ts).
//
// WHY THIS SUITE EXISTS, precisely. The module's correctness rests on a browser
// text-metrics rule that no fake context can enforce: TextMetrics reports the
// actual bounding box RELATIVE TO the current textAlign. The first version of
// this module measured under the default 'start' and drew under 'center', so
// every sprite was sized as if the run began at the anchor while the glyphs
// actually ran half their advance width to its LEFT, and each label shipped with
// roughly its left half cut off. Fifty-two green Node assertions did not see it,
// because the Node fake reported center-anchored metrics whatever alignment the
// code under test measured under. Only rendering it caught it.
//
// So the pin here is deliberately the one a fake cannot fake: rasterize through
// the real cache in real Chromium and read the PIXELS back, asserting the ink
// straddles the anchor on both sides and matches what a plain centered
// strokeText + fillText would have produced. The Node suite
// (tests/text_sprite_cache.test.ts) still owns the cache identity, the eviction
// policy and the geometry arithmetic; this one owns "the glyphs are all there".
//
// It lives under tests/browser/** and ends in .browser.test.ts, so a bare
// `vitest run` (vite.config.ts test.exclude) skips it; only `npm run test:browser`
// (vitest.browser.config.ts, chromium) runs it.

import { describe, expect, it } from 'vitest';
import { TextSpriteCache, type TextSpriteStyle } from '../../src/ui/text_sprite_cache';

// The map's own label typography and its outlined-label pair, so this exercises
// the real shape rather than a synthetic one. The colors are opaque and distinct
// from the transparent surface, which is all the ink scan needs.
const LABEL_FONT = 'bold 13px Georgia';
const LABEL_FILL = 'rgb(255, 209, 0)';
const LABEL_STROKE = 'rgb(0, 0, 0)';
const LABEL_LINE_WIDTH = 3;
const LABEL: TextSpriteStyle = {
  font: LABEL_FONT,
  fill: LABEL_FILL,
  stroke: LABEL_STROKE,
  lineWidth: LABEL_LINE_WIDTH,
};
const SURFACE = 400;
const ANCHOR_X = SURFACE / 2;
const ANCHOR_Y = 120;

// Latin, Cyrillic and CJK: the clipping bug scaled with advance width, and CJK
// additionally reports an ascent under the em box, which is what the sprite's
// union with the em box covers.
const SAMPLES = [
  'Eastbrook Vale',
  'The Hollow Crypt',
  '\u041a\u0440\u0435\u043f\u043e\u0441\u0442\u044c \u0412\u043e\u0440\u043e\u043d\u0430',
  '\u9ed2\u77f3\u306e\u57ce',
];

function surface(): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = SURFACE;
  canvas.height = SURFACE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2D context in the browser runner');
  return ctx;
}

/** Columns and rows that carry any non-transparent pixel. */
function inkExtent(ctx: CanvasRenderingContext2D): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  count: number;
} {
  const { data } = ctx.getImageData(0, 0, SURFACE, SURFACE);
  let minX = SURFACE;
  let maxX = -1;
  let minY = SURFACE;
  let maxY = -1;
  let count = 0;
  for (let y = 0; y < SURFACE; y++) {
    for (let x = 0; x < SURFACE; x++) {
      if (data[(y * SURFACE + x) * 4 + 3] === 0) continue;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, maxX, minY, maxY, count };
}

/** How many bytes of the two surfaces differ (0 means pixel-identical). Counted
 *  rather than deep-compared so a failure reports a number, not 640k entries. */
function differingBytes(a: CanvasRenderingContext2D, b: CanvasRenderingContext2D): number {
  const left = a.getImageData(0, 0, SURFACE, SURFACE).data;
  const right = b.getImageData(0, 0, SURFACE, SURFACE).data;
  let differing = 0;
  for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) differing++;
  return differing;
}

/** The reference: exactly the centered strokeText + fillText the sprite replaced. */
function drawDirect(ctx: CanvasRenderingContext2D, text: string): void {
  ctx.font = LABEL_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.strokeStyle = LABEL_STROKE;
  ctx.lineWidth = LABEL_LINE_WIDTH;
  ctx.strokeText(text, ANCHOR_X, ANCHOR_Y);
  ctx.fillStyle = LABEL_FILL;
  ctx.fillText(text, ANCHOR_X, ANCHOR_Y);
}

describe('text_sprite_cache in a real browser: the sprite carries the whole label', () => {
  for (const text of SAMPLES) {
    it(`straddles the anchor on both sides for "${text}"`, () => {
      const reference = surface();
      drawDirect(reference, text);
      const want = inkExtent(reference);

      const painted = surface();
      new TextSpriteCache().draw(painted, text, ANCHOR_X, ANCHOR_Y, LABEL);
      const got = inkExtent(painted);

      // The bug that motivated this suite left ink on ONE side of the anchor.
      expect(got.count).toBeGreaterThan(0);
      expect(got.minX, 'no ink left of the anchor: the sprite is clipping').toBeLessThan(ANCHOR_X);
      expect(got.maxX, 'no ink right of the anchor').toBeGreaterThan(ANCHOR_X);

      // And it matches the draw it replaced, within the whole-pixel blit snap.
      expect(Math.abs(got.minX - want.minX)).toBeLessThanOrEqual(1);
      expect(Math.abs(got.maxX - want.maxX)).toBeLessThanOrEqual(1);
      expect(Math.abs(got.minY - want.minY)).toBeLessThanOrEqual(1);
      expect(Math.abs(got.maxY - want.maxY)).toBeLessThanOrEqual(1);
      // Ink volume within a few percent: a half-clipped label loses ~45%.
      expect(Math.abs(got.count - want.count) / want.count).toBeLessThan(0.1);
    });
  }

  it('blits a cached sprite to the same pixels it drew the first time', () => {
    const cache = new TextSpriteCache();
    const first = surface();
    cache.draw(first, SAMPLES[0], ANCHOR_X, ANCHOR_Y, LABEL);
    const second = surface();
    cache.draw(second, SAMPLES[0], ANCHOR_X, ANCHOR_Y, LABEL);

    expect(differingBytes(first, second)).toBe(0);
  });

  it('keeps the label crisp with image smoothing left on, as the map painter leaves it', () => {
    // map_window_painter sets imageSmoothingEnabled = true for its terrain blit
    // and never restores it, so every label blit lands under smoothing. A
    // fractional destination resamples to mush there; the rounded one does not.
    const smoothed = surface();
    smoothed.imageSmoothingEnabled = true;
    const cache = new TextSpriteCache();
    cache.draw(smoothed, SAMPLES[0], ANCHOR_X + 0.37, ANCHOR_Y + 0.62, LABEL);

    const crisp = surface();
    crisp.imageSmoothingEnabled = false;
    cache.draw(crisp, SAMPLES[0], ANCHOR_X + 0.37, ANCHOR_Y + 0.62, LABEL);

    // Rounding makes the two settings produce identical pixels: legibility no
    // longer depends on whoever last touched imageSmoothingEnabled.
    expect(differingBytes(smoothed, crisp)).toBe(0);
  });
});
