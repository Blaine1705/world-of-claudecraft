import { describe, expect, it } from 'vitest';
import {
  asyncPortraitReadbackUsable,
  flipUnpremultiplyEncodeInto,
  portraitReadbackByteLength,
  srgbEncodeByte,
  unpremultiplyByte,
} from '../src/render/characters/portrait_readback_core';

/** The sRGB OETF in floating point, written out independently of the module's
 *  lookup table so a pin compares against the curve and not against itself. */
function referenceSrgbEncodeByte(channel: number): number {
  const linear = channel / 255;
  const encoded = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
  return Math.round(encoded * 255);
}

/** A bottom-up RGBA buffer whose rows are filled with a per-row marker, the
 *  shape readPixels hands back. */
function bottomUpRows(width: number, height: number, alpha: number): Uint8Array {
  const bytes = new Uint8Array(portraitReadbackByteLength(width, height));
  for (let row = 0; row < height; row++) {
    for (let x = 0; x < width; x++) {
      const at = (row * width + x) * 4;
      bytes[at] = row;
      bytes[at + 1] = x;
      bytes[at + 2] = 0;
      bytes[at + 3] = alpha;
    }
  }
  return bytes;
}

describe('portraitReadbackByteLength', () => {
  it('is four bytes per texel', () => {
    expect(portraitReadbackByteLength(256, 256)).toBe(256 * 256 * 4);
    expect(portraitReadbackByteLength(3, 2)).toBe(24);
  });
});

describe('unpremultiplyByte', () => {
  it('leaves fully opaque texels untouched', () => {
    expect(unpremultiplyByte(200, 255)).toBe(200);
    expect(unpremultiplyByte(0, 255)).toBe(0);
  });

  it('divides a partially covered texel back out of its coverage', () => {
    // Half coverage of a white texel: the buffer holds 128, the PNG holds 255.
    expect(unpremultiplyByte(128, 128)).toBe(255);
    expect(unpremultiplyByte(64, 128)).toBe(128);
  });

  it('clamps rather than overshooting on a rounded premultiplied value', () => {
    expect(unpremultiplyByte(10, 5)).toBe(255);
  });

  it('reports no colour at all where alpha is zero', () => {
    expect(unpremultiplyByte(0, 0)).toBe(0);
    expect(unpremultiplyByte(37, 0)).toBe(0);
  });
});

// The orientation / stride / alpha pins run with the transfer OFF so they
// assert exactly one conversion each; the transfer has its own block below.
describe('flipUnpremultiplyEncodeInto', () => {
  it('reverses the row order (readPixels is bottom-up, ImageData is top-down)', () => {
    const width = 3;
    const height = 2;
    const source = bottomUpRows(width, height, 255);
    const dest = new Uint8ClampedArray(portraitReadbackByteLength(width, height));
    flipUnpremultiplyEncodeInto(source, dest, width, height, false);
    // Source row 0 (marker 0) is the BOTTOM row, so it must land last.
    const stride = width * 4;
    expect(dest[0]).toBe(1);
    expect(dest[stride]).toBe(0);
  });

  it('keeps the within-row order and the whole stride, non-square included', () => {
    const width = 3;
    const height = 2;
    const source = bottomUpRows(width, height, 255);
    const dest = new Uint8ClampedArray(portraitReadbackByteLength(width, height));
    flipUnpremultiplyEncodeInto(source, dest, width, height, false);
    const topRow: number[] = [];
    for (let x = 0; x < width; x++) topRow.push(dest[x * 4 + 1]);
    expect(topRow).toEqual([0, 1, 2]);
    // Nothing outside the flipped rows is written, and nothing is left unset.
    expect(dest.length).toBe(24);
    expect([...dest].every((v) => Number.isFinite(v))).toBe(true);
  });

  it('unpremultiplies while it flips', () => {
    const width = 1;
    const height = 2;
    const source = new Uint8Array([
      // bottom row: half-covered white
      128, 128, 128, 128,
      // top row: fully covered mid grey
      100, 100, 100, 255,
    ]);
    const dest = new Uint8ClampedArray(8);
    flipUnpremultiplyEncodeInto(source, dest, width, height, false);
    expect([...dest.slice(0, 4)]).toEqual([100, 100, 100, 255]);
    expect([...dest.slice(4)]).toEqual([255, 255, 255, 128]);
  });

  it('writes a fully transparent texel as transparent black', () => {
    const source = new Uint8Array([0, 0, 0, 0]);
    const dest = new Uint8ClampedArray(4);
    flipUnpremultiplyEncodeInto(source, dest, 1, 1, false);
    expect([...dest]).toEqual([0, 0, 0, 0]);
  });

  it('round-trips a 256-square buffer at the shipped portrait size', () => {
    const size = 256;
    const source = bottomUpRows(size, size, 255);
    const dest = new Uint8ClampedArray(portraitReadbackByteLength(size, size));
    flipUnpremultiplyEncodeInto(source, dest, size, size, false);
    const stride = size * 4;
    expect(dest[0]).toBe(size - 1);
    expect(dest[(size - 1) * stride]).toBe(0);
  });
});

describe('flipUnpremultiplyEncodeInto: the sRGB transfer', () => {
  it('encodes a straight linear byte rather than passing it through', () => {
    // A linear mid grey is NOT its own sRGB byte: leaving the transfer out is
    // exactly the "every portrait came back dark" bug.
    const source = new Uint8Array([128, 128, 128, 255]);
    const dest = new Uint8ClampedArray(4);
    flipUnpremultiplyEncodeInto(source, dest, 1, 1, true);
    expect([...dest]).toEqual([188, 188, 188, 255]);
    expect(dest[0]).not.toBe(128);
    expect(dest[0]).toBe(referenceSrgbEncodeByte(128));
  });

  it('matches the reference curve across the whole byte domain', () => {
    for (let i = 0; i < 256; i++) expect(srgbEncodeByte(i)).toBe(referenceSrgbEncodeByte(i));
    expect(srgbEncodeByte(0)).toBe(0);
    expect(srgbEncodeByte(255)).toBe(255);
  });

  it('leaves the bytes alone when the output space carries no sRGB transfer', () => {
    const source = new Uint8Array([128, 128, 128, 255]);
    const dest = new Uint8ClampedArray(4);
    flipUnpremultiplyEncodeInto(source, dest, 1, 1, false);
    expect([...dest]).toEqual([128, 128, 128, 255]);
  });

  it('unpremultiplies BEFORE it encodes, which is what an edge texel shows', () => {
    // Half-covered dark grey: the readback holds 32 at alpha 128.
    const source = new Uint8Array([32, 32, 32, 128]);
    const dest = new Uint8ClampedArray(4);
    flipUnpremultiplyEncodeInto(source, dest, 1, 1, true);

    const straight = unpremultiplyByte(32, 128);
    expect([...dest]).toEqual([
      referenceSrgbEncodeByte(straight),
      referenceSrgbEncodeByte(straight),
      referenceSrgbEncodeByte(straight),
      128,
    ]);
    // The other order (encode the premultiplied value, then divide alpha out)
    // is a different number here, so this pin is decisive rather than
    // incidental. `<colorspace_fragment>` runs before the blend stage, so the
    // canvas held alpha * srgbEncode(colour) and toBlob handed the PNG
    // srgbEncode(colour): the unpremultiply comes first.
    const wrongOrder = unpremultiplyByte(referenceSrgbEncodeByte(32), 128);
    expect(dest[0]).not.toBe(wrongOrder);
    expect(dest[0]).toBe(137);
    expect(wrongOrder).toBe(197);
  });

  it('is order-insensitive on a fully opaque texel', () => {
    const source = new Uint8Array([90, 90, 90, 255]);
    const dest = new Uint8ClampedArray(4);
    flipUnpremultiplyEncodeInto(source, dest, 1, 1, true);
    expect(dest[0]).toBe(referenceSrgbEncodeByte(90));
    expect(unpremultiplyByte(referenceSrgbEncodeByte(90), 255)).toBe(dest[0]);
  });

  it('still writes a fully transparent texel as transparent black', () => {
    const source = new Uint8Array([0, 0, 0, 0]);
    const dest = new Uint8ClampedArray(4);
    flipUnpremultiplyEncodeInto(source, dest, 1, 1, true);
    expect([...dest]).toEqual([0, 0, 0, 0]);
  });
});

describe('asyncPortraitReadbackUsable', () => {
  const base = {
    hasAsyncReadback: true,
    failedBefore: false,
    contextLost: false,
    captureInFlight: false,
  };

  it('takes the async path when the context can fence and nothing failed', () => {
    expect(asyncPortraitReadbackUsable(base)).toBe(true);
  });

  it('falls back when the renderer exposes no async readback', () => {
    expect(asyncPortraitReadbackUsable({ ...base, hasAsyncReadback: false })).toBe(false);
  });

  it('falls back for good once an async capture failed', () => {
    expect(asyncPortraitReadbackUsable({ ...base, failedBefore: true })).toBe(false);
  });

  it('falls back on a lost context', () => {
    expect(asyncPortraitReadbackUsable({ ...base, contextLost: true })).toBe(false);
  });

  it('falls back while another capture owns the shared buffers', () => {
    expect(asyncPortraitReadbackUsable({ ...base, captureInFlight: true })).toBe(false);
  });
});
