// Derive the two crafted fishing-rod icons from the Silverstream rod art.
//
//   node scripts/assets/rod_tier_icons.mjs         (writes)
//   node scripts/assets/rod_tier_icons.mjs --check (verifies, writes nothing)
//
// WHY A DERIVATION AND NOT NEW PAINTINGS, stated plainly because it is a
// weaker fit than the fine-material one next door. A fine grade is literally
// the same material worked better, so sharing its base painting is the
// CORRECT answer there. A Stormreel is not a better-worked Silverstream, it is
// a different rod, so on the merits these two want their own art. What they
// get instead is a deliberate tier treatment of the ladder's top shipped rod:
// the silhouette a player already reads as "a rod" with a temper that says
// which rung. That keeps the family legible at bag-slot size and keeps the ids
// and every gate around them shippable now; replacing either file with a
// painted original later changes nothing but the bytes, since the pipeline
// below is the only thing that owns them.
//
// The two treatments are deliberately far apart rather than two nudges of one
// idea: tier 4 cools the whole rod to storm-steel and tier 5 pushes it warm
// and bright with a heavy rim, so the three rods differ at a glance and none
// of them reads as a placeholder of another.
//
// This is a PRE-COMMIT tool like scripts/assets/fine_material_icons.mjs, not a
// build step: the .webp files it writes are committed and nothing re-encodes
// in CI. It is deterministic (same input, same bytes), so --check asserts the
// committed art still matches its source, which is what keeps the derivation
// honest if the Silverstream art is ever repainted.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const itemsDir = path.join(root, 'public/ui/items');

// Mirrors "iconSize" in public/ui/items/mapping.json; tests/item_icons.test.ts
// guard G fails any committed icon that is not this square.
const ICON_SIZE = 128;

// Same options as the catalog converter and the fine-material derivation, so
// these two files sit in the same quality band as the rest of the catalog.
const webpOptions = { quality: 82, alphaQuality: 100, smartSubsample: true, effort: 6 };

// The rod every rung above the vendor ladder is derived from: the top rod a
// counter sells, which is the last rung a player sees before these two.
const BASE_ROD_ID = 'silverstream_fishing_rod';

// Derived id -> its treatment. Mirrors the fishing gatherTool tiers in
// src/sim/content/items.ts; tests/professions_rod_recipes.test.ts pins that this list
// and the item table name the same two rods, so a third crafted rod cannot
// ship with art for two.
const ROD_TREATMENTS = [
  {
    itemId: 'stormreel_fishing_rod',
    // Storm steel: the colour drained out of it and the contrast pushed up,
    // so it reads as bare hardened metal against a cold sky.
    modulate: { brightness: 0.94, saturation: 0.34, hue: -12 },
    linear: [1.32, -34],
    rim: { inner: '#bfe6ff', outer: '#4d7ec4', opacity: 0.6 },
  },
  {
    itemId: 'tidewrought_fishing_rod',
    // Tidewrought: swung off blue into deep tidal violet and lit from inside,
    // with a gold rim, which is as far from storm steel as one silhouette can
    // be taken while still reading as sea tackle.
    modulate: { brightness: 1.14, saturation: 1.22, hue: 34 },
    linear: [1.08, 6],
    rim: { inner: '#ffdf94', outer: '#e08a2c', opacity: 0.62 },
  },
];

// A soft ring just inside the icon edge, composited over the art so it
// brightens the silhouette without painting a hard border on the transparent
// matte.
function rimOverlay({ inner, outer, opacity }) {
  const r = ICON_SIZE / 2;
  return Buffer.from(
    `<svg width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 ${ICON_SIZE} ${ICON_SIZE}">` +
      '<defs><radialGradient id="g" cx="50%" cy="50%" r="50%">' +
      '<stop offset="0.58" stop-color="#ffffff" stop-opacity="0"/>' +
      `<stop offset="0.86" stop-color="${inner}" stop-opacity="${opacity}"/>` +
      `<stop offset="1" stop-color="${outer}" stop-opacity="0"/>` +
      '</radialGradient></defs>' +
      `<circle cx="${r}" cy="${r}" r="${r}" fill="url(#g)"/>` +
      '</svg>',
  );
}

async function renderRod(treatment) {
  const src = path.join(itemsDir, `${BASE_ROD_ID}.webp`);
  return await sharp(readFileSync(src))
    .resize(ICON_SIZE, ICON_SIZE, { fit: 'cover' })
    .modulate(treatment.modulate)
    .linear(treatment.linear[0], treatment.linear[1])
    .composite([{ input: rimOverlay(treatment.rim), blend: 'over' }])
    .webp(webpOptions)
    .toBuffer();
}

async function main() {
  const check = process.argv.includes('--check');
  const stale = [];
  for (const treatment of ROD_TREATMENTS) {
    const out = path.join(itemsDir, `${treatment.itemId}.webp`);
    const rendered = await renderRod(treatment);
    if (check) {
      let committed = null;
      try {
        committed = readFileSync(out);
      } catch {
        stale.push(`${treatment.itemId}.webp is missing`);
        continue;
      }
      if (!committed.equals(rendered)) {
        stale.push(`${treatment.itemId}.webp differs from its derivation`);
      }
      continue;
    }
    writeFileSync(out, rendered);
    console.log(
      `[rod-icons] ${BASE_ROD_ID}.webp -> ${treatment.itemId}.webp (${rendered.length} bytes)`,
    );
  }
  if (check && stale.length > 0) {
    console.error(`[rod-icons] stale derived art:\n  ${stale.join('\n  ')}`);
    console.error('[rod-icons] re-run: node scripts/assets/rod_tier_icons.mjs');
    process.exit(1);
  }
  console.log(`[rod-icons] ${check ? 'checked' : 'wrote'} ${ROD_TREATMENTS.length} icons`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
