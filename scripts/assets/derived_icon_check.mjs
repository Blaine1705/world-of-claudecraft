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

// Double the measured cross-platform envelope (17 / 0.33), far below any
// deliberate edit. Tighten only with a fresh measurement on both platforms.
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
  const px = a.info.width * a.info.height;
  let maxDelta = 0;
  let sum = 0;
  for (let i = 0; i < px; i++) {
    const o = i * 4;
    let d = Math.abs(a.data[o + 3] - b.data[o + 3]);
    if (a.data[o + 3] > 0 || b.data[o + 3] > 0) {
      for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(a.data[o + c] - b.data[o + c]));
    }
    if (d > maxDelta) maxDelta = d;
    sum += d;
  }
  const meanDelta = sum / px;
  if (maxDelta > MAX_CHANNEL_DELTA || meanDelta > MAX_MEAN_DELTA) {
    return `differs from its derivation (max channel delta ${maxDelta}, mean ${meanDelta.toFixed(2)}; bounds ${MAX_CHANNEL_DELTA} / ${MAX_MEAN_DELTA})`;
  }
  return null;
}
