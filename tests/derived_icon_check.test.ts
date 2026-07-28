// Unit teeth for the structural derived-icon staleness check
// (scripts/assets/derived_icon_check.mjs). The --check spawn tests in
// tests/material_grades.test.ts and tests/professions_rod_recipes.test.ts only
// prove the happy path, and on the machine the art was rendered on the byte
// fast path short-circuits before a single pixel is decoded, so without this
// file the comparator's FAIL direction and both bounds are exercised by
// nothing: an inverted comparison or a widened bound would pass every suite on
// every platform while stale art sailed through --check.
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  derivedIconStale,
  MAX_CHANNEL_DELTA,
  MAX_MEAN_DELTA,
} from '../scripts/assets/derived_icon_check.mjs';

const SIZE = 8;
const PIXELS = SIZE * SIZE;

/** A flat RGBA raw buffer at the given channel values. */
function rawImage(r: number, g: number, b: number, a = 255): Buffer {
  const buf = Buffer.alloc(PIXELS * 4);
  for (let i = 0; i < PIXELS; i++) buf.set([r, g, b, a], i * 4);
  return buf;
}

/** A matte image: the first `opaque` pixels carry the art, the rest are a
 *  fully transparent matte (alpha 0, encoder-arbitrary RGB stand-in). */
function matteImage(r: number, g: number, b: number, opaque: number, matteRgb = 0): Buffer {
  const buf = Buffer.alloc(PIXELS * 4);
  for (let i = 0; i < PIXELS; i++) {
    if (i < opaque) buf.set([r, g, b, 255], i * 4);
    else buf.set([matteRgb, matteRgb, matteRgb, 0], i * 4);
  }
  return buf;
}

async function png(raw: Buffer, compressionLevel = 6): Promise<Buffer> {
  return await sharp(raw, { raw: { width: SIZE, height: SIZE, channels: 4 } })
    .png({ compressionLevel })
    .toBuffer();
}

describe('derivedIconStale', () => {
  it('pins the bounds: platform headroom, far below a deliberate edit', () => {
    expect(MAX_CHANNEL_DELTA).toBe(32);
    expect(MAX_MEAN_DELTA).toBe(1.0);
  });

  it('byte-identical buffers match without decoding', async () => {
    const a = await png(rawImage(100, 120, 140));
    expect(await derivedIconStale(a, a)).toBeNull();
  });

  it('byte-different encodings of identical pixels match through the structural path', async () => {
    // The cross-platform case in miniature: same pixels, different bytes.
    // This is the arm that forces the pixel-bounds body to actually run and
    // return null, which no committed-art test can do on the authoring
    // machine.
    const raw = rawImage(100, 120, 140);
    const a = await png(raw, 9);
    const b = await png(raw, 0);
    expect(a.equals(b)).toBe(false);
    expect(await derivedIconStale(a, b)).toBeNull();
  });

  it('sub-envelope noise stays within bounds', async () => {
    // One channel of one pixel off by one: max 1, mean 1/64.
    const noisy = rawImage(100, 120, 140);
    noisy[0] = 101;
    expect(await derivedIconStale(await png(rawImage(100, 120, 140)), await png(noisy))).toBeNull();
  });

  it('a global brightness step trips the MEAN bound alone', async () => {
    // +2 on every channel: max 2 sits inside the platform envelope, so the
    // mean bound is the only tooth against a subtle whole-icon repaint. This
    // is the load-bearing arm: relaxing MAX_MEAN_DELTA past ~2 greenlights
    // stale art everywhere.
    const stale = await derivedIconStale(
      await png(rawImage(100, 120, 140)),
      await png(rawImage(102, 122, 142)),
    );
    expect(stale).toMatch(/mean 2\.00/);
  });

  it('a single-pixel silhouette edit trips the MAX bound alone', async () => {
    // One channel off by 33: mean 33/64 is in bounds, max is not.
    const edited = rawImage(100, 120, 140);
    edited[0] = 133;
    const stale = await derivedIconStale(await png(rawImage(100, 120, 140)), await png(edited));
    expect(stale).toMatch(/max channel delta 33/);
  });

  it('a dimension mismatch is stale before any pixel math', async () => {
    const big = await sharp(rawImage(100, 120, 140), {
      raw: { width: SIZE, height: SIZE, channels: 4 },
    })
      .resize(SIZE * 2, SIZE * 2)
      .png()
      .toBuffer();
    const stale = await derivedIconStale(await png(rawImage(100, 120, 140)), big);
    expect(stale).toMatch(/8x8 vs 16x16/);
  });

  it('a transparent matte does not dilute the mean: sparse art still trips the bound', async () => {
    // 16 of 64 pixels are art; a +2 brightening of the art alone is a real
    // whole-icon repaint of what EXISTS. Over the whole canvas the mean would
    // be 0.5 and pass; over visible pixels it is 2.00 and correctly fails.
    // This is the arm that pins the visible-pixel denominator itself.
    const stale = await derivedIconStale(
      await png(matteImage(100, 120, 140, 16)),
      await png(matteImage(102, 122, 142, 16)),
    );
    expect(stale).toMatch(/mean 2\.00/);
  });

  it('encoder-arbitrary RGB under a one-sided matte edge is not a staleness signal', async () => {
    // The cross-platform false red this module exists to prevent: at a matte
    // edge, alpha rounds 0 on one platform and 1 on the other, and the RGB
    // underneath the transparent side is whatever the encoder left there.
    // The alpha delta (1) participates; the garbage RGB must not.
    const a = matteImage(100, 120, 140, 16, 255); // matte RGB left at 255
    const b = matteImage(100, 120, 140, 16, 0);
    b[16 * 4 + 3] = 1; // one matte-edge pixel rounds to alpha 1 on this side
    expect(await derivedIconStale(await png(a), await png(b))).toBeNull();
    // Control: the alpha term itself is alive at full strength. The same
    // pixel fully OPAQUE on one side only is a solid silhouette change.
    const c = matteImage(100, 120, 140, 16, 0);
    c.set([100, 120, 140, 255], 16 * 4);
    const stale = await derivedIconStale(await png(matteImage(100, 120, 140, 16, 0)), await png(c));
    expect(stale).toMatch(/max channel delta 255/);
  });

  it('a translucent one-sided element under the max bound is tolerated BY DESIGN', async () => {
    // The documented trade (see the module header): an element present on one
    // side only registers at its own alpha, so a faint wisp whose alpha sits
    // under the max bound (and whose mean contribution stays under the mean
    // bound) is inside the platform tolerance. If this arm ever needs to
    // fail, the contract itself is being renegotiated, not regressed.
    const ghost = matteImage(100, 120, 140, 16, 0);
    ghost.set([255, 0, 0, 16], 20 * 4);
    expect(
      await derivedIconStale(await png(matteImage(100, 120, 140, 16, 0)), await png(ghost)),
    ).toBeNull();
  });

  it('undecodable bytes throw so the check scripts can name the file', async () => {
    // The --check loops wrap this call per icon and turn a throw into a named
    // stale entry; this arm keeps that catch provably load-bearing.
    await expect(
      derivedIconStale(Buffer.from('garbage'), await png(rawImage(100, 120, 140))),
    ).rejects.toThrow();
  });

  it('a greyscale re-encode of identical pixels still matches', async () => {
    // On this sharp version ensureAlpha promotes a single-channel greyscale
    // decode to full RGBA, so the comparator sees identical pixels and
    // matches. The channel guard inside derivedIconStale covers sharp
    // versions where ensureAlpha does NOT promote (a 2-channel decode would
    // otherwise NaN-poison the stride-4 delta loop and silently pass).
    const grey = await sharp(rawImage(100, 100, 100), {
      raw: { width: SIZE, height: SIZE, channels: 4 },
    })
      .greyscale()
      .toColourspace('b-w')
      .png()
      .toBuffer();
    expect(await derivedIconStale(grey, await png(rawImage(100, 100, 100)))).toBeNull();
  });
});
