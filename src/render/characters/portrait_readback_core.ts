// Pure buffer math for the portrait capture's asynchronous GPU readback, plus
// the predicate that picks between that path and the synchronous canvas one.
// No GL, no DOM: the adapter (portrait_snapshot.ts) owns the render target, the
// fence-backed readback and the PNG encode, and calls in here for the three
// conversions that stand between a readPixels buffer and canvas ImageData.
//
// Three conversions, and all of them are needed for the async result to match
// what canvas.toBlob produced off the default framebuffer:
// - ORIENTATION. readPixels numbers rows from the BOTTOM-left, ImageData from
//   the TOP-left, so the rows are reversed one scanline at a time.
// - ALPHA. The drawing buffer and a render target both hold PREMULTIPLIED
//   colour (that is how three blends), while ImageData and the PNG that
//   toBlob wrote are UNPREMULTIPLIED. Skipping this darkens every partially
//   covered texel, which on a portrait is the whole antialiased silhouette.
// - TRANSFER. three's output conversion runs in the fragment shader, and for a
//   non-XR render target `getParameters` sets its outputColorSpace to the
//   LINEAR working space whatever the renderer's own outputColorSpace says
//   (three 0.185.1; the same fact the renderer's prewarm comment records).
//   The target's `texture.colorSpace` governs SAMPLING only, and these bytes go
//   straight to readPixels, never through a sampler. So the buffer holds linear
//   values where the canvas held encoded ones, and the encode has to happen
//   here or every portrait comes back visibly dark.
//
// The ORDER of the last two is fixed by what the old path actually stored.
// `<colorspace_fragment>` encodes the fragment BEFORE the blend stage
// multiplies it by alpha, so the canvas held `alpha * srgbEncode(colour)` and
// toBlob's unpremultiply handed the PNG `srgbEncode(colour)`. Reproducing that
// means UNPREMULTIPLY FIRST, THEN ENCODE: encoding the premultiplied value
// instead would hand back `unpremultiply(srgbEncode(alpha * colour))`, which is
// a different number at every partially covered texel, i.e. all along the
// silhouette a portrait is mostly made of.

/** RGBA. */
const CHANNELS = 4;

/** Bytes a `width` x `height` RGBA readback needs. */
export function portraitReadbackByteLength(width: number, height: number): number {
  return width * height * CHANNELS;
}

/** One premultiplied channel back to its straight value. Alpha 0 carries no
 *  colour at all (nothing was blended into it), so it stays 0 rather than
 *  dividing by zero. */
export function unpremultiplyByte(channel: number, alpha: number): number {
  if (alpha <= 0) return 0;
  if (alpha >= 255) return channel;
  return Math.min(255, Math.round((channel * 255) / alpha));
}

/** The sRGB OETF over the whole byte domain, tabulated once. three keeps its
 *  own scalar form module-private (three.core.js `LinearToSRGB`), so the
 *  piecewise curve is spelled out here; 256 entries make it exact for every
 *  input this path can produce and cost no pow per channel. */
const SRGB_ENCODED_BYTE = buildSrgbEncodedByteTable();

function buildSrgbEncodedByteTable(): Uint8Array {
  const table = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const linear = i / 255;
    const encoded = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
    table[i] = Math.min(255, Math.max(0, Math.round(encoded * 255)));
  }
  return table;
}

/** One straight linear channel byte as its sRGB-encoded byte. */
export function srgbEncodeByte(channel: number): number {
  return SRGB_ENCODED_BYTE[channel];
}

/**
 * Flip `source` (bottom-up, premultiplied, linear, straight from readPixels)
 * into `dest` (top-down, straight alpha, encoded, ready for `new ImageData`).
 * `encodeSrgb` says whether the renderer's own output space carries the sRGB
 * transfer, which is what the canvas path would have applied. Both buffers are
 * `portraitReadbackByteLength(width, height)` long and are caller-owned, so a
 * repeated capture at one size allocates nothing.
 */
export function flipUnpremultiplyEncodeInto(
  source: ArrayLike<number>,
  dest: { [index: number]: number; length: number },
  width: number,
  height: number,
  encodeSrgb: boolean,
): void {
  const stride = width * CHANNELS;
  for (let y = 0; y < height; y++) {
    const from = (height - 1 - y) * stride;
    const to = y * stride;
    for (let x = 0; x < stride; x += CHANNELS) {
      const alpha = source[from + x + 3];
      const r = unpremultiplyByte(source[from + x], alpha);
      const g = unpremultiplyByte(source[from + x + 1], alpha);
      const b = unpremultiplyByte(source[from + x + 2], alpha);
      dest[to + x] = encodeSrgb ? SRGB_ENCODED_BYTE[r] : r;
      dest[to + x + 1] = encodeSrgb ? SRGB_ENCODED_BYTE[g] : g;
      dest[to + x + 2] = encodeSrgb ? SRGB_ENCODED_BYTE[b] : b;
      dest[to + x + 3] = alpha;
    }
  }
}

/** What the adapter knows about its context when it has to choose a path. */
export interface PortraitReadbackSupport {
  /** The renderer exposes `readRenderTargetPixelsAsync`. */
  hasAsyncReadback: boolean;
  /** An earlier async capture on this context failed (a rejected readback, a
   *  render target that would not read, a 2D context that would not encode). */
  failedBefore: boolean;
  /** The WebGL context is lost. */
  contextLost: boolean;
  /** Another capture already owns this target's shared buffers. */
  captureInFlight: boolean;
}

/**
 * True when the capture should render into a render target and read it back
 * behind a fence. False sends it down the synchronous default-framebuffer
 * path instead: slower (`toBlob` stalls the main thread on the readback) but
 * always available, which is what keeps a failure from dropping portraits.
 */
export function asyncPortraitReadbackUsable(support: PortraitReadbackSupport): boolean {
  return (
    support.hasAsyncReadback &&
    !support.failedBefore &&
    !support.contextLost &&
    !support.captureInFlight
  );
}
