// Bounded offscreen-sprite cache for outlined canvas labels: the fix for a
// per-item canvas TEXT loop.
//
// WHY IT EXISTS. Every canvas text entry point (the `ctx.font` setter,
// `fillText`, `strokeText`, `measureText`) re-resolves font state against the
// document, so the cost tracks how dirty the style tree is rather than the font
// string or the item count. Measured in Chrome at 17 iterations per redraw
// against a dirty style tree (the crowded-town case: ~80 nameplate transform
// writes land in the same frame): bare `ctx.font` assignments 0.033ms, fillText
// with the font already set 0.037ms, measureText alone 0.0368ms, drawImage
// 0.0062ms. On a quiet page all four are equal. Hoisting `ctx.font` above the
// loop measures no better than leaving it inside (0.0385 vs 0.036): only leaving
// the text API is a fix. See src/ui/CLAUDE.md, "Canvas and DOM hot-path
// techniques".
//
// WHAT IT DOES. Rasterizes each distinct (font, fill, outline, text) label ONCE
// into its own offscreen canvas, then blits it with `drawImage` on every later
// redraw. minimap_painter does the same thing inline for its three fixed NPC
// glyphs; this module is the version for LOCALIZED, OPEN-ENDED text (dungeon
// names, POI labels, player names), which the closed-glyph case does not need:
// the box has to come from measureText rather than a constant, and the live set
// has to be bounded and evicted because ally names are player-supplied.
//
// THE BOUND AND ITS EVICTION. `beginRedraw` trims the cache back to
// TEXT_SPRITE_LIMIT in least-recently-used order; a draw during a redraw never
// evicts. So the cache holds at most TEXT_SPRITE_LIMIT sprites at every redraw
// boundary, plus whatever that one redraw asked for. That ordering is the whole
// point: trimming mid-redraw would let a label-heavy redraw evict the sprites it
// is still drawing and re-rasterize every one of them, every redraw, which is
// worse than the fillText it replaced. Overshoot is reclaimed by the next
// `beginRedraw`.
//
// DOM: needs `document.createElement('canvas')`, so this is a painter-side
// helper, not a pure core. It stays host-agnostic otherwise (no window, no
// Three, no i18n, no CSS-var reads: the caller passes resolved colors), and its
// tests drive it through a fake document + fake 2D context.

/** How one label rasterizes. `stroke` + `lineWidth` are the classic
 *  outlined-label pair (the outline is what keeps a map label readable over
 *  light terrain); omit `stroke` for a fill-only label. */
export interface TextSpriteStyle {
  font: string;
  fill: string;
  stroke?: string;
  lineWidth?: number;
}

/** A rasterized label plus where the caller's (x, y) anchor sits inside it, so
 *  the blit lands the text exactly where fillText would have. */
interface TextSprite {
  canvas: HTMLCanvasElement;
  originX: number;
  originY: number;
}

/** Ink extents around the anchor, in px: `left`/`right` along the baseline,
 *  `ascent`/`descent` above and below it. */
interface TextInk {
  left: number;
  right: number;
  ascent: number;
  descent: number;
}

/** Sprites kept across redraws. Sized for a whole session's map labels (3 zone
 *  titles, 29 POI labels, the dungeon names, the badge digits) plus a healthy
 *  ally-name working set, so ordinary play never evicts. A variable-width label
 *  at these font sizes runs roughly 150x20px, i.e. about 12KB of backing store,
 *  so the resident cost stays in the same class as one cached zone terrain
 *  canvas. */
export const TEXT_SPRITE_LIMIT = 128;

// Slack around the measured ink on every side, so glyph antialiasing is never
// clipped. The outline adds half its width on top (a stroke straddles the path).
const SPRITE_PADDING = 2;
// Fallbacks for platforms whose TextMetrics omits the actualBoundingBox* family
// (older WebKit, and the fake contexts the tests drive this with): derive the
// box from the advance width plus the font's px size. Georgia's descender sits
// near 0.22em, so 0.3 leaves room without a second measurement.
const FALLBACK_DESCENT_RATIO = 0.3;
const FALLBACK_FONT_PX = 12;

/**
 * A bounded per-(font, fill, outline, text) cache of rasterized labels. One
 * instance per painter; the painter calls `beginRedraw` once per redraw and
 * `draw` per label.
 */
export class TextSpriteCache {
  // Insertion order IS the LRU order: a cache hit re-inserts, so the oldest
  // live key is always the front of the iteration.
  private readonly sprites = new Map<string, TextSprite>();

  /** Live sprite count. */
  get size(): number {
    return this.sprites.size;
  }

  /** Open a redraw: trim back to the budget, oldest first. Called BEFORE the
   *  redraw's draws so a label-heavy redraw can overshoot rather than thrash
   *  (see the header). */
  beginRedraw(): void {
    for (const key of this.sprites.keys()) {
      if (this.sprites.size <= TEXT_SPRITE_LIMIT) return;
      this.sprites.delete(key);
    }
  }

  /**
   * Draw `text` centered on (x, y) along the alphabetic baseline: exactly where
   * `ctx.textAlign = 'center'` plus strokeText + fillText at (x, y) would put
   * it, as one blit of a cached sprite. The blitted sprite carries its own font,
   * alignment, baseline, colors and outline width, so this reads NO text state
   * off `ctx` and leaves none behind.
   *
   * ROUNDED, and that is load-bearing rather than cosmetic: marker positions are
   * continuous floats, and a fractional drawImage destination is RESAMPLED.
   * Measured in Chrome across sub-pixel phases 0.2 to 0.8, blitting a 16x16
   * glyph sprite: fractional with imageSmoothingEnabled OFF stays crisp (35 ink
   * pixels, 5 fully solid, at every phase) but fractional with smoothing ON
   * collapses to 53 ink and ZERO fully solid, i.e. mush. Rounded, both settings
   * give the identical 35/5. Callers that leave smoothing ON (map_window_painter
   * does, for its terrain blit) land in the mush case unrounded, so rounding is
   * what stops legibility depending on an unrelated setting several lines away.
   *
   * The tradeoff, deliberately taken: a label now snaps to whole pixels where
   * fillText advanced it in quarter-pixel steps.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    style: TextSpriteStyle,
  ): void {
    // fillText('') draws nothing; skip before minting a cache entry for it.
    if (text === '') return;
    const sprite = this.sprite(text, style);
    if (!sprite) return;
    ctx.drawImage(sprite.canvas, Math.round(x - sprite.originX), Math.round(y - sprite.originY));
  }

  private sprite(text: string, style: TextSpriteStyle): TextSprite | null {
    const key = spriteKey(text, style);
    const cached = this.sprites.get(key);
    if (cached) {
      // Re-insert so the iteration order stays least-recently-used first.
      this.sprites.delete(key);
      this.sprites.set(key, cached);
      return cached;
    }
    const sprite = rasterize(text, style);
    // A transient 2D-context failure must not be cached: freezing a blank canvas
    // would hide that label for the rest of the session. Skipping this redraw's
    // draw self-heals on the next one.
    if (!sprite) return null;
    // Same rule for a label rasterized before the stylesheet applied: the caller
    // resolves '' for every color token then, and '' is an invalid fillStyle the
    // canvas ignores, so the sprite would freeze in the default black. Draw it
    // this redraw (exactly what the inline fillText did on that frame) but never
    // cache it.
    if (style.fill !== '' && style.stroke !== '') this.sprites.set(key, sprite);
    return sprite;
  }
}

// The cache key. `text` goes LAST so no separator collision is possible whatever
// the label says, and the separator is a newline because neither a font
// shorthand nor a resolved CSS color can contain one (a space could:
// `rgb(255 209 0)`). The outlined flag is its own field so a fill-only label can
// never alias one whose outline token has not resolved yet ('').
function spriteKey(text: string, style: TextSpriteStyle): string {
  const outlined = style.stroke === undefined ? 'flat' : 'outlined';
  const stroke = style.stroke ?? '';
  return [style.font, style.fill, outlined, stroke, style.lineWidth ?? 0, text].join('\n');
}

// Rasterize one label into its own canvas, or null when the 2D context fails.
function rasterize(text: string, style: TextSpriteStyle): TextSprite | null {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const outline = style.stroke === undefined ? 0 : (style.lineWidth ?? 0);
  // A stroke straddles the path, so it reaches half its width past the fill ink
  // that measureText reports.
  const pad = Math.ceil(outline / 2) + SPRITE_PADDING;
  const ink = measureInk(ctx, text, style.font);
  const originX = Math.ceil(ink.left) + pad;
  const originY = Math.ceil(ink.ascent) + pad;
  // Assigning width/height RESETS every context property (and clears the
  // canvas), so every draw setting below is applied after the resize.
  canvas.width = Math.max(1, originX + Math.ceil(ink.right) + pad);
  canvas.height = Math.max(1, originY + Math.ceil(ink.descent) + pad);
  ctx.font = style.font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  if (style.stroke !== undefined) {
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = style.lineWidth ?? 0;
    ctx.strokeText(text, originX, originY);
  }
  ctx.fillStyle = style.fill;
  ctx.fillText(text, originX, originY);
  return { canvas, originX, originY };
}

// Ink extents around a centered, alphabetic-baseline anchor. Sizing a sprite
// from an undefined would silently produce a NaN canvas, so every field falls
// back to a derived value on platforms that do not report the actual bounding
// box.
function measureInk(ctx: CanvasRenderingContext2D, text: string, font: string): TextInk {
  ctx.font = font;
  const m: Partial<TextMetrics> | undefined = ctx.measureText(text);
  const width = finite(m?.width, 0);
  const px = fontPx(font);
  return {
    left: finite(m?.actualBoundingBoxLeft, width / 2),
    right: finite(m?.actualBoundingBoxRight, width / 2),
    ascent: finite(m?.actualBoundingBoxAscent, px),
    descent: finite(m?.actualBoundingBoxDescent, px * FALLBACK_DESCENT_RATIO),
  };
}

function finite(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

// The px size out of a CSS shorthand font string ('bold 13px Georgia'), for the
// metrics fallback only.
function fontPx(font: string): number {
  const match = /(\d+(?:\.\d+)?)px/.exec(font);
  return match ? Number(match[1]) : FALLBACK_FONT_PX;
}
