#!/usr/bin/env node
// Deterministic icon for the World PvP trophy skull (pvp_trophy_skull,
// src/sim/pvp/world_pvp_spoils.ts). No image model: the project's own painted
// Restless Skull (public/ui/items/restless_skull.webp) is mirrored and re-lit
// with a blood-red vignette and a warm crimson key, so the trophy reads as the
// same painted family while never sharing its bytes or its silhouette facing.
// Output: an opaque 128x128 sRGB WebP under the 15 KB item-icon budget.
//
//   node scripts/generate_pvp_trophy_skull_icon.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(repoRoot, 'public/ui/items/restless_skull.webp');
const OUTPUT = path.join(repoRoot, 'public/ui/items/pvp_trophy_skull.webp');
const SIZE = 128;

// A crimson wash over the whole square, strongest at the rim (the vignette) and
// warm in the upper left (the house key light), multiplied into the painting.
const WASH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
  <defs>
    <radialGradient id="rim" cx="46%" cy="44%" r="68%">
      <stop offset="0%" stop-color="#ffe6d8"/>
      <stop offset="55%" stop-color="#d9826f"/>
      <stop offset="100%" stop-color="#5a0f12"/>
    </radialGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#rim)"/>
</svg>`;

// A soft red glow behind the skull, screened in so the dark ground reads as
// dried blood rather than the source's navy.
const GLOW_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="58%" r="60%">
      <stop offset="0%" stop-color="#3a0708"/>
      <stop offset="100%" stop-color="#000000"/>
    </radialGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#glow)"/>
</svg>`;

const base = await sharp(SOURCE)
  .resize(SIZE, SIZE, { fit: 'cover' })
  .flop()
  .removeAlpha()
  .toBuffer();

await sharp(base)
  .composite([
    { input: Buffer.from(WASH_SVG), blend: 'multiply' },
    { input: Buffer.from(GLOW_SVG), blend: 'screen' },
  ])
  .modulate({ brightness: 1.18 })
  .flatten({ background: '#000000' })
  .removeAlpha()
  .toColourspace('srgb')
  .webp({ quality: 90, effort: 6, smartSubsample: true })
  .toFile(OUTPUT);

const meta = await sharp(OUTPUT).metadata();
console.log(`wrote ${path.relative(repoRoot, OUTPUT)} ${meta.width}x${meta.height}`);
