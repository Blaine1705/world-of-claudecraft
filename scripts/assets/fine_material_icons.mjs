// Derive the nine fine-grade material icons from their base material art.
//
//   node scripts/assets/fine_material_icons.mjs        (writes)
//   node scripts/assets/fine_material_icons.mjs --check (verifies, writes nothing)
//
// A fine grade (src/sim/professions/material_grades.ts) is the SAME material
// worked with a better tool, so its icon is deliberately the same painting
// rather than a new one: a player must read it as "that ore, but better" at
// bag-slot size, and two unrelated paintings would read as two materials.
// The treatment is a warm highlight lift plus a slight saturation gain and a
// thin luminous rim, which survives the 128px downscale and the 3x mobile
// upscale without touching the silhouette.
//
// This is a PRE-COMMIT tool like scripts/convert_item_icons_webp.mjs, not a
// build step: the .webp files it writes are committed, and nothing re-encodes
// in CI. It is deterministic (same inputs, same bytes), so --check can assert
// the committed art still matches its sources, which is what keeps the
// derivation honest after a base icon is ever repainted.
//
// Encode options are copied from convert_item_icons_webp.mjs so the derived
// files sit in the same quality band as the rest of the catalog.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const itemsDir = path.join(root, 'public/ui/items');

// Mirrors "iconSize" in public/ui/items/mapping.json; tests/item_icons.test.ts
// guard G fails any committed icon that is not this square.
const ICON_SIZE = 128;

// Same options as the catalog converter: smartSubsample defeats the 4:2:0
// halo on saturated edges, alphaQuality 100 keeps the transparent matte crisp.
const webpOptions = { quality: 82, alphaQuality: 100, smartSubsample: true, effort: 6 };

// base item id -> fine item id. Mirrors MATERIAL_GRADES in
// src/sim/professions/material_grades.ts; tests/material_grades.test.ts pins
// that this list and that table name the same nine pairs, so a tenth material
// cannot ship with art for eight.
const GRADE_PAIRS = [
  ['copper_ore', 'fine_copper_ore'],
  ['iron_ore', 'fine_iron_ore'],
  ['thorium_ore', 'fine_thorium_ore'],
  ['ironbark_log', 'fine_ironbark_log'],
  ['ashwood_log', 'fine_ashwood_log'],
  ['elderwood_log', 'fine_elderwood_log'],
  ['silverleaf_herb', 'fine_silverleaf_herb'],
  ['goldleaf_herb', 'fine_goldleaf_herb'],
  ['sunpetal_herb', 'fine_sunpetal_herb'],
];

// The rim: a soft ring just inside the icon edge, multiplied over the art so
// it brightens without painting a hard border on the transparent matte.
function rimOverlay() {
  const r = ICON_SIZE / 2;
  return Buffer.from(
    `<svg width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 ${ICON_SIZE} ${ICON_SIZE}">` +
      '<defs><radialGradient id="g" cx="50%" cy="50%" r="50%">' +
      '<stop offset="0.62" stop-color="#ffffff" stop-opacity="0"/>' +
      '<stop offset="0.88" stop-color="#ffe9ad" stop-opacity="0.40"/>' +
      '<stop offset="1" stop-color="#ffd9a0" stop-opacity="0"/>' +
      '</radialGradient></defs>' +
      `<circle cx="${r}" cy="${r}" r="${r}" fill="url(#g)"/>` +
      '</svg>',
  );
}

async function renderFine(baseId) {
  const src = path.join(itemsDir, `${baseId}.webp`);
  return await sharp(readFileSync(src))
    .resize(ICON_SIZE, ICON_SIZE, { fit: 'cover' })
    // Warm highlight lift + saturation gain: "the same ore, cleaner".
    .modulate({ brightness: 1.1, saturation: 1.18 })
    .linear(1.06, -6)
    .composite([{ input: rimOverlay(), blend: 'over' }])
    .webp(webpOptions)
    .toBuffer();
}

async function main() {
  const check = process.argv.includes('--check');
  const stale = [];
  for (const [baseId, fineId] of GRADE_PAIRS) {
    const out = path.join(itemsDir, `${fineId}.webp`);
    const rendered = await renderFine(baseId);
    if (check) {
      let committed = null;
      try {
        committed = readFileSync(out);
      } catch {
        stale.push(`${fineId}.webp is missing`);
        continue;
      }
      if (!committed.equals(rendered)) stale.push(`${fineId}.webp differs from its derivation`);
      continue;
    }
    writeFileSync(out, rendered);
    console.log(`[fine-icons] ${baseId}.webp -> ${fineId}.webp (${rendered.length} bytes)`);
  }
  if (check && stale.length > 0) {
    console.error(`[fine-icons] stale derived art:\n  ${stale.join('\n  ')}`);
    console.error('[fine-icons] re-run: node scripts/assets/fine_material_icons.mjs');
    process.exit(1);
  }
  console.log(`[fine-icons] ${check ? 'checked' : 'wrote'} ${GRADE_PAIRS.length} icons`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
