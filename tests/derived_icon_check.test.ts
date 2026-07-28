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
