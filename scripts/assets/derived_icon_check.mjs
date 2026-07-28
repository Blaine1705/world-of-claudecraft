// Structural (pixel-bound) staleness check for the derived-icon --check arms.
//
// The derivations in fine_material_icons.mjs and rod_tier_icons.mjs are
// deterministic on one machine, but sharp/libvips does not render identical
// BYTES across platforms: re-rendering the darwin-committed art on linux-x64
// with the identical sharp 0.35.3 moved 6 of the 11 icons (measured
// 2026-07-28: max per-pixel channel delta 17, mean delta 0.33, at most 12
// percent of pixels touched). A byte-equality --check therefore reds CI on
// ubuntu against art committed on a Mac while both trees are honest.
//
// So byte equality stays the fast path, and when bytes differ the check
// decodes both sides to RGBA and bounds the pixel difference instead.
// Platform noise sits far below these bounds; a repainted base icon or an
// edited treatment shifts nearly every opaque pixel in one direction and
// blows the MEAN bound (a global brightness step of 2 units alone doubles
// it), and any silhouette change blows the MAX bound.
//
// Per-pixel delta: the largest channel difference, where alpha always
// participates and RGB participates when either side is visible (RGB under
// a fully transparent matte is encoder-arbitrary).

import sharp from 'sharp';

// Headroom over the measured cross-platform envelope (max 17, mean 0.33 on
// linux-x64 vs darwin, 2026-07-28): the max bound is roughly twice the
// measured max, the mean bound roughly three times the measured mean. Both
// sit far below the deliberate-edit signal (a 0.03 brightness step alone
// measures mean above 3). Tighten only with a fresh measurement on both
// platforms, per constant, never by re-deriving from a single multiplier.
export const MAX_CHANNEL_DELTA = 32;
export const MAX_MEAN_DELTA = 1.0;

async function rgba(buf) {
  return await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

// Returns null when the committed bytes still match their derivation within
// the bounds above, else a short human-readable reason for the stale list.
export async function derivedIconStale(committed, rendered) {
  if (committed.equals(rendered)) return null;
  const a = await rgba(committed);
  const b = await rgba(rendered);
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) {
    return `differs from its derivation (${a.info.width}x${a.info.height} vs ${b.info.width}x${b.info.height})`;
  }
  // The delta loop indexes stride 4: a non-RGBA decode (ensureAlpha on a
  // grayscale source yields 2 channels) would read past the buffer as
  // undefined and poison the sums with NaN, which compares false against
  // both bounds. Refuse the shape instead of silently passing it.
  if (a.info.channels !== 4 || b.info.channels !== 4) {
    return `differs from its derivation (${a.info.channels} vs ${b.info.channels} channels; expected RGBA)`;
  }
  const px = a.info.width * a.info.height;
  let maxDelta = 0;
  let sum = 0;
  let visible = 0;
  for (let i = 0; i < px; i++) {
    const o = i * 4;
    let d = Math.abs(a.data[o + 3] - b.data[o + 3]);
    if (a.data[o + 3] > 0 || b.data[o + 3] > 0) visible++;
    // RGB participates only where BOTH sides are visible: under a fully
    // transparent matte on either side the RGB is encoder-arbitrary, and an
    // alpha-rounding difference at a matte edge must not read the garbage
    // channel as a 200-unit edit (a real silhouette change still trips
    // through the alpha term, which always participates).
    if (a.data[o + 3] > 0 && b.data[o + 3] > 0) {
      for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(a.data[o + c] - b.data[o + c]));
    }
    if (d > maxDelta) maxDelta = d;
    sum += d;
  }
  // The mean is over pixels visible on EITHER side, not the whole canvas:
  // signal lives only where art exists, and a transparent matte would
  // otherwise dilute a real whole-icon repaint below the bound. The shipped
  // derived icons are fully opaque today, so this denominator equals the one
  // the platform envelope was measured with.
  const meanDelta = visible > 0 ? sum / visible : 0;
  if (maxDelta > MAX_CHANNEL_DELTA || meanDelta > MAX_MEAN_DELTA) {
    return `differs from its derivation (max channel delta ${maxDelta}, mean ${meanDelta.toFixed(2)}; bounds ${MAX_CHANNEL_DELTA} / ${MAX_MEAN_DELTA})`;
  }
  return null;
}
