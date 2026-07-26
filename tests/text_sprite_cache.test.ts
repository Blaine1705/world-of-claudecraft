// Behavior pins for the bounded label-sprite cache (src/ui/text_sprite_cache.ts).
//
// Everything here is driven through a fake document + fake 2D context (the
// tests/minimap_painter.test.ts idiom), never a source-substring scan: the pins
// are the rasterized ink, the sprite geometry, the whole-pixel blit destination,
// the cache identity, and the eviction policy.
//
// The fake canvas mirrors the one real-canvas behavior this module depends on:
// assigning width or height RESETS the context state and clears the surface. A
// rasterizer that set its font before sizing would therefore record its ink
// under the reset defaults, and the geometry/ink pins below would fail.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { TEXT_SPRITE_LIMIT, TextSpriteCache } from '../src/ui/text_sprite_cache';

/** One recorded text draw into a sprite's own context, with the state it used. */
interface FakeInk {
  op: 'fill' | 'stroke';
  text: string;
  x: number;
  y: number;
  font: string;
  color: string;
  align: string;
  baseline: string;
  lineWidth: number;
}

interface FakeSprite {
  width: number;
  height: number;
  ink: FakeInk[];
  /** Every measureText, as `${font}|${text}`. */
  measured: string[];
  getContext(kind: string): unknown;
}

interface Trace {
  /** Every canvas minted through document.createElement('canvas'). */
  sprites: FakeSprite[];
  /** Every 3-argument drawImage onto the target context. */
  blits: Array<{ sprite: FakeSprite; dx: number; dy: number }>;
  /** Swapped per test to exercise the metrics fallbacks. */
  metrics: (text: string, font: string) => Partial<TextMetrics>;
  /** When false, every sprite's getContext('2d') returns null. */
  spriteContext: boolean;
}

// Canvas defaults a real context resets to when width/height is assigned.
const DEFAULT_FONT = '10px sans-serif';
const DEFAULT_COLOR = '#000000';

/** Metrics that report the full actual bounding box, like a modern browser.
 *  Half the font size per character keeps the arithmetic checkable by hand. */
function boundingBoxMetrics(text: string, font: string): Partial<TextMetrics> {
  const px = fontPx(font);
  const width = text.length * px * 0.5;
  return {
    width,
    actualBoundingBoxLeft: width / 2,
    actualBoundingBoxRight: width / 2,
    actualBoundingBoxAscent: px * 0.7,
    actualBoundingBoxDescent: px * 0.2,
  };
}

/** Metrics from a platform that reports only the advance width. */
function widthOnlyMetrics(text: string, font: string): Partial<TextMetrics> {
  return { width: text.length * fontPx(font) * 0.5 };
}

function fontPx(font: string): number {
  return Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 10);
}

function makeFakeSprite(trace: Trace): FakeSprite {
  const ctx = {
    font: DEFAULT_FONT,
    fillStyle: DEFAULT_COLOR,
    strokeStyle: DEFAULT_COLOR,
    lineWidth: 1,
    textAlign: 'start',
    textBaseline: 'alphabetic',
    measureText(text: string): Partial<TextMetrics> {
      sprite.measured.push(`${ctx.font}|${text}`);
      return trace.metrics(text, ctx.font);
    },
    fillText(text: string, x: number, y: number): void {
      sprite.ink.push({ op: 'fill', text, x, y, ...state(ctx.fillStyle) });
    },
    strokeText(text: string, x: number, y: number): void {
      sprite.ink.push({ op: 'stroke', text, x, y, ...state(ctx.strokeStyle) });
    },
  };
  const state = (color: string): Omit<FakeInk, 'op' | 'text' | 'x' | 'y'> => ({
    font: ctx.font,
    color,
    align: ctx.textAlign,
    baseline: ctx.textBaseline,
    lineWidth: ctx.lineWidth,
  });
  const sprite = {
    ink: [] as FakeInk[],
    measured: [] as string[],
    getContext: (kind: string): unknown =>
      kind === '2d' && trace.spriteContext ? (ctx as unknown) : null,
  } as unknown as FakeSprite;
  // A real canvas drops its context state and its pixels on a size assignment.
  let w = 300;
  let h = 150;
  const resize = (): void => {
    ctx.font = DEFAULT_FONT;
    ctx.fillStyle = DEFAULT_COLOR;
    ctx.strokeStyle = DEFAULT_COLOR;
    ctx.lineWidth = 1;
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    sprite.ink.length = 0;
  };
  Object.defineProperty(sprite, 'width', {
    get: () => w,
    set: (v: number) => {
      w = v;
      resize();
    },
  });
  Object.defineProperty(sprite, 'height', {
    get: () => h,
    set: (v: number) => {
      h = v;
      resize();
    },
  });
  trace.sprites.push(sprite);
  return sprite;
}

function newTrace(): Trace {
  return { sprites: [], blits: [], metrics: boundingBoxMetrics, spriteContext: true };
}

function installDocument(trace: Trace): void {
  vi.stubGlobal('document', {
    createElement(tag: string): unknown {
      if (tag !== 'canvas') throw new Error(`unexpected createElement(${tag})`);
      return makeFakeSprite(trace);
    },
  });
}

/** The blit target: it records drawImage and nothing else, so a rasterizer that
 *  reached for the text API here would have to invent a method. */
function targetContext(trace: Trace): CanvasRenderingContext2D {
  return {
    drawImage(image: unknown, dx: number, dy: number): void {
      trace.blits.push({ sprite: image as FakeSprite, dx, dy });
    },
  } as unknown as CanvasRenderingContext2D;
}

const OUTLINED = { font: 'bold 12px Georgia', fill: 'ink', stroke: 'halo', lineWidth: 3 };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('text_sprite_cache: rasterize once, blit thereafter', () => {
  it('bakes the outline pass and the fill pass into one sprite, sized after measuring', () => {
    const trace = newTrace();
    installDocument(trace);
    const cache = new TextSpriteCache();

    cache.draw(targetContext(trace), 'AB', 100, 50, OUTLINED);

    expect(trace.sprites).toHaveLength(1);
    const sprite = trace.sprites[0];
    // 'AB' at 12px: width 12, so left = right = 6, ascent 8.4, descent 2.4.
    // pad = ceil(lineWidth / 2) + 2 = 4, so originX = 6 + 4 = 10 and
    // originY = ceil(8.4) + 4 = 13.
    expect(sprite.width).toBe(20); // 10 + ceil(6) + 4
    expect(sprite.height).toBe(20); // 13 + ceil(2.4) + 4
    expect(sprite.measured).toEqual(['bold 12px Georgia|AB']);
    // Both passes recorded AFTER the resize (the fake clears ink on resize), at
    // the sprite origin, centered on the alphabetic baseline.
    expect(sprite.ink).toEqual([
      {
        op: 'stroke',
        text: 'AB',
        x: 10,
        y: 13,
        font: 'bold 12px Georgia',
        color: 'halo',
        align: 'center',
        baseline: 'alphabetic',
        lineWidth: 3,
      },
      {
        op: 'fill',
        text: 'AB',
        x: 10,
        y: 13,
        font: 'bold 12px Georgia',
        color: 'ink',
        align: 'center',
        baseline: 'alphabetic',
        lineWidth: 3,
      },
    ]);
  });

  it('blits the cached sprite on later redraws instead of rasterizing again', () => {
    const trace = newTrace();
    installDocument(trace);
    const cache = new TextSpriteCache();
    const ctx = targetContext(trace);

    cache.beginRedraw();
    cache.draw(ctx, 'Eastbrook', 10, 10, OUTLINED);
    cache.beginRedraw();
    cache.draw(ctx, 'Eastbrook', 20, 20, OUTLINED);
    cache.beginRedraw();
    cache.draw(ctx, 'Eastbrook', 30, 30, OUTLINED);

    expect(trace.sprites).toHaveLength(1);
    expect(trace.blits).toHaveLength(3);
    expect(trace.blits.every((b) => b.sprite === trace.sprites[0])).toBe(true);
    expect(cache.size).toBe(1);
  });

  it('skips the outline pass for a fill-only style', () => {
    const trace = newTrace();
    installDocument(trace);
    const cache = new TextSpriteCache();

    cache.draw(targetContext(trace), '7', 0, 0, { font: 'bold 12px Georgia', fill: 'gold' });

    expect(trace.sprites[0].ink.map((i) => i.op)).toEqual(['fill']);
    // No outline means no half-width allowance: pad is the antialias slack only,
    // so originX = ceil(3) + 2 = 5 ('7' measures 6 wide at 12px).
    expect(trace.sprites[0].width).toBe(10);
  });

  it('draws nothing at all for empty text', () => {
    const trace = newTrace();
    installDocument(trace);
    const cache = new TextSpriteCache();

    cache.draw(targetContext(trace), '', 10, 10, OUTLINED);

    expect(trace.sprites).toEqual([]);
    expect(trace.blits).toEqual([]);
    expect(cache.size).toBe(0);
  });
});

describe('text_sprite_cache: the blit lands on the anchor, rounded', () => {
  it('rounds the destination to whole pixels', () => {
    const trace = newTrace();
    installDocument(trace);
    const cache = new TextSpriteCache();

    // origin is (10, 13) as computed above, so the raw destination would be
    // (90.4, 37.6): a fractional destination is resampled, which is mush when
    // the caller left imageSmoothingEnabled on.
    cache.draw(targetContext(trace), 'AB', 100.4, 50.6, OUTLINED);

    expect(trace.blits).toEqual([{ sprite: trace.sprites[0], dx: 90, dy: 38 }]);
  });

  it('keeps every destination integral across sub-pixel phases', () => {
    const trace = newTrace();
    installDocument(trace);
    const cache = new TextSpriteCache();
    const ctx = targetContext(trace);

    for (const phase of [0, 0.2, 0.4, 0.5, 0.6, 0.8]) {
      cache.draw(ctx, 'AB', 100 + phase, 50 + phase, OUTLINED);
    }

    expect(trace.blits.map((b) => b.dx).every(Number.isInteger)).toBe(true);
    expect(trace.blits.map((b) => b.dy).every(Number.isInteger)).toBe(true);
    expect(trace.blits.map((b) => b.dx)).toEqual([90, 90, 90, 91, 91, 91]);
  });
});

describe('text_sprite_cache: cache identity', () => {
  it('gives every distinct text, fill, outline, width and font its own sprite', () => {
    const trace = newTrace();
    installDocument(trace);
    const cache = new TextSpriteCache();
    const ctx = targetContext(trace);

    cache.draw(ctx, 'AB', 0, 0, OUTLINED);
    cache.draw(ctx, 'AC', 0, 0, OUTLINED); // different text
    cache.draw(ctx, 'AB', 0, 0, { ...OUTLINED, fill: 'other' }); // different fill
    cache.draw(ctx, 'AB', 0, 0, { ...OUTLINED, stroke: 'other' }); // different outline
    cache.draw(ctx, 'AB', 0, 0, { ...OUTLINED, lineWidth: 1 }); // different width
    cache.draw(ctx, 'AB', 0, 0, { ...OUTLINED, font: 'bold 16px Georgia' }); // different font
    expect(trace.sprites).toHaveLength(6);

    // Re-requesting each one hits the cache.
    cache.draw(ctx, 'AB', 0, 0, OUTLINED);
    cache.draw(ctx, 'AC', 0, 0, OUTLINED);
    cache.draw(ctx, 'AB', 0, 0, { ...OUTLINED, fill: 'other' });
    cache.draw(ctx, 'AB', 0, 0, { ...OUTLINED, stroke: 'other' });
    cache.draw(ctx, 'AB', 0, 0, { ...OUTLINED, lineWidth: 1 });
    cache.draw(ctx, 'AB', 0, 0, { ...OUTLINED, font: 'bold 16px Georgia' });
    expect(trace.sprites).toHaveLength(6);
    expect(cache.size).toBe(6);
  });

  it('never aliases a fill-only label onto one whose outline token is unresolved', () => {
    const trace = newTrace();
    installDocument(trace);
    const cache = new TextSpriteCache();
    const ctx = targetContext(trace);

    cache.draw(ctx, '7', 0, 0, { font: 'bold 12px Georgia', fill: 'gold' });
    cache.draw(ctx, '7', 0, 0, {
      font: 'bold 12px Georgia',
      fill: 'gold',
      stroke: '',
      lineWidth: 3,
    });

    expect(trace.sprites).toHaveLength(2);
    expect(trace.sprites[0].ink.map((i) => i.op)).toEqual(['fill']);
    expect(trace.sprites[1].ink.map((i) => i.op)).toEqual(['stroke', 'fill']);
  });

  it('does not cache a sprite whose 2D context failed', () => {
    const trace = newTrace();
    trace.spriteContext = false;
    installDocument(trace);
    const cache = new TextSpriteCache();
    const ctx = targetContext(trace);

    cache.draw(ctx, 'AB', 0, 0, OUTLINED);
    expect(trace.blits).toEqual([]); // nothing to blit, rather than a blank box
    expect(cache.size).toBe(0);

    // Self-heals: the next redraw retries instead of serving a frozen blank.
    trace.spriteContext = true;
    cache.draw(ctx, 'AB', 0, 0, OUTLINED);
    expect(trace.sprites).toHaveLength(2);
    expect(trace.blits).toHaveLength(1);
    expect(cache.size).toBe(1);
  });

  it('draws but never caches a label rasterized before the color tokens resolved', () => {
    const trace = newTrace();
    installDocument(trace);
    const cache = new TextSpriteCache();
    const ctx = targetContext(trace);

    // What resolveColors returns before the stylesheet applies: '' for every token.
    cache.draw(ctx, 'AB', 0, 0, { font: 'bold 12px Georgia', fill: '', stroke: '', lineWidth: 3 });
    expect(trace.blits).toHaveLength(1); // still drawn this redraw
    expect(cache.size).toBe(0); // but never frozen in the default black

    cache.draw(ctx, 'AB', 0, 0, { font: 'bold 12px Georgia', fill: '', stroke: '', lineWidth: 3 });
    expect(trace.sprites).toHaveLength(2);

    // An unresolved outline alone is enough to refuse the cache.
    cache.draw(ctx, 'AB', 0, 0, {
      font: 'bold 12px Georgia',
      fill: 'ink',
      stroke: '',
      lineWidth: 3,
    });
    expect(cache.size).toBe(0);
    // Once both resolve, it caches.
    cache.draw(ctx, 'AB', 0, 0, OUTLINED);
    expect(cache.size).toBe(1);
  });
});

describe('text_sprite_cache: the bound and its eviction', () => {
  it('trims to the budget at the redraw boundary, least recently used first', () => {
    const trace = newTrace();
    installDocument(trace);
    const cache = new TextSpriteCache();
    const ctx = targetContext(trace);
    const over = 3;

    cache.beginRedraw();
    for (let i = 0; i < TEXT_SPRITE_LIMIT + over; i++) {
      cache.draw(ctx, `L${i}`, 0, 0, OUTLINED);
    }
    // No eviction DURING a redraw, so the redraw keeps every sprite it drew.
    expect(cache.size).toBe(TEXT_SPRITE_LIMIT + over);
    // Touching the oldest label makes it the most recently used one.
    cache.draw(ctx, 'L0', 0, 0, OUTLINED);
    expect(trace.sprites).toHaveLength(TEXT_SPRITE_LIMIT + over);

    cache.beginRedraw();
    expect(cache.size).toBe(TEXT_SPRITE_LIMIT);

    // L1..L3 were the least recently used, so they are the ones that went.
    const before = trace.sprites.length;
    cache.draw(ctx, 'L1', 0, 0, OUTLINED);
    cache.draw(ctx, 'L2', 0, 0, OUTLINED);
    cache.draw(ctx, 'L3', 0, 0, OUTLINED);
    expect(trace.sprites).toHaveLength(before + over);
    // The touched one survived, and so did everything after the evicted run.
    cache.draw(ctx, 'L0', 0, 0, OUTLINED);
    cache.draw(ctx, 'L4', 0, 0, OUTLINED);
    cache.draw(ctx, `L${TEXT_SPRITE_LIMIT + over - 1}`, 0, 0, OUTLINED);
    expect(trace.sprites).toHaveLength(before + over);
  });

  it('leaves the cache at the budget when a redraw asks for nothing new', () => {
    const trace = newTrace();
    installDocument(trace);
    const cache = new TextSpriteCache();
    const ctx = targetContext(trace);

    for (let i = 0; i < TEXT_SPRITE_LIMIT; i++) cache.draw(ctx, `L${i}`, 0, 0, OUTLINED);
    cache.beginRedraw();
    expect(cache.size).toBe(TEXT_SPRITE_LIMIT);
    cache.beginRedraw();
    expect(cache.size).toBe(TEXT_SPRITE_LIMIT);
  });

  it('rasterizes a label-heavy redraw once per label rather than thrashing', () => {
    const trace = newTrace();
    installDocument(trace);
    const cache = new TextSpriteCache();
    const ctx = targetContext(trace);
    const labels = TEXT_SPRITE_LIMIT + 5;

    // One redraw whose label count exceeds the budget, each label drawn twice
    // (a map can draw the same name for two markers). Evicting mid-redraw would
    // re-rasterize on the second pass, which is worse than the fillText this
    // replaces; the trim happens at the boundary instead.
    cache.beginRedraw();
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < labels; i++) cache.draw(ctx, `L${i}`, 0, 0, OUTLINED);
    }

    expect(trace.sprites).toHaveLength(labels);
    expect(trace.blits).toHaveLength(labels * 2);
    // The overshoot is reclaimed at the next boundary.
    cache.beginRedraw();
    expect(cache.size).toBe(TEXT_SPRITE_LIMIT);
  });
});

describe('text_sprite_cache: metrics fallback', () => {
  it('sizes from the advance width and font size when the bounding box is absent', () => {
    const trace = newTrace();
    trace.metrics = widthOnlyMetrics;
    installDocument(trace);
    const cache = new TextSpriteCache();

    cache.draw(targetContext(trace), 'AB', 100, 50, OUTLINED);

    // width 12 -> left = right = 6; ascent falls back to the 12px font size and
    // descent to 0.3 of it (3.6). pad = 4.
    const sprite = trace.sprites[0];
    expect(sprite.width).toBe(20); // (6 + 4) + 6 + 4
    expect(sprite.height).toBe(24); // (12 + 4) + ceil(3.6) + 4
    expect(trace.blits).toEqual([{ sprite, dx: 90, dy: 34 }]);
  });

  it('sizes a real box even when the platform reports no metrics at all', () => {
    const trace = newTrace();
    trace.metrics = () => ({});
    installDocument(trace);
    const cache = new TextSpriteCache();

    cache.draw(targetContext(trace), 'AB', 100, 50, OUTLINED);

    const sprite = trace.sprites[0];
    expect(sprite.width).toBeGreaterThan(0);
    expect(sprite.height).toBeGreaterThan(0);
    expect(Number.isFinite(trace.blits[0].dx)).toBe(true);
    expect(Number.isFinite(trace.blits[0].dy)).toBe(true);
  });
});
