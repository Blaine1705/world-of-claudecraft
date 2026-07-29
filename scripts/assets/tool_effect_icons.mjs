// Derive the two tool-effect charm icons from the arcane material art.
//
//   node scripts/assets/tool_effect_icons.mjs        (writes)
//   node scripts/assets/tool_effect_icons.mjs --check (verifies, writes nothing)
//
// A tool-effect charm (src/sim/content/items.ts gatherers_cache /
// artisans_eye) is Enchanter work condensed from the arcane material ladder,
// so its icon is deliberately derived from that ladder's art rather than
// painted fresh: a player must read it as "arcane work, shaped into a charm"
// beside the dust/essence/shard it was crafted from. Each charm gets a strong
// hue turn away from its source (so the two never read as the raw material),
// a bound ring, and a glyph overlay naming its effect: radiating yield marks
// for the Cache (extra quantity), an iris for the Eye (better grades).
//
// This is a PRE-COMMIT tool like scripts/assets/fine_material_icons.mjs, not
// a build step: the .webp files it writes are committed, and nothing
// re-encodes in CI. Deterministic per machine, but sharp does not render
// identical bytes across platforms, so --check asserts the committed art
// still matches its sources STRUCTURALLY (byte fast path, then the pixel
// bounds in derived_icon_check.mjs).
//
// Encode options are copied from convert_item_icons_webp.mjs so the derived
// files sit in the same quality band as the rest of the catalog.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

import { derivedIconStale } from './derived_icon_check.mjs';

const root = process.cwd();
const itemsDir = path.join(root, 'public/ui/items');

// Mirrors "iconSize" in public/ui/items/mapping.json; tests/item_icons.test.ts
// guard G fails any committed icon that is not this square.
const ICON_SIZE = 128;

// Same options as the catalog converter: smartSubsample defeats the 4:2:0
// halo on saturated edges, alphaQuality 100 keeps the transparent matte crisp.
const webpOptions = { quality: 82, alphaQuality: 100, smartSubsample: true, effort: 6 };

// charm item id -> { source art id, hue turn (degrees), glyph overlay }.
// Mirrors the two live TOOL_EFFECTS entries; the parked Springback Charm has
// no item, so it has no icon row here (tests/professions_tool_effect_craft.
// test.ts derives that absence from the R9 slot policy).
const CHARMS = [
  { id: 'gatherers_cache', source: 'arcane_essence', hue: 140, glyph: cacheGlyph },
  { id: 'artisans_eye', source: 'arcane_shard', hue: 250, glyph: eyeGlyph },
];

// A bound ring just inside the icon edge: the "set into a charm" read both
// derivations share, warmer and harder-edged than the fine-material rim so
// the two families never blur together.
function charmRing() {
  const r = ICON_SIZE / 2;
  return Buffer.from(
    `<svg width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 ${ICON_SIZE} ${ICON_SIZE}">` +
      '<defs><radialGradient id="g" cx="50%" cy="50%" r="50%">' +
      '<stop offset="0.66" stop-color="#ffffff" stop-opacity="0"/>' +
      '<stop offset="0.80" stop-color="#f5d98a" stop-opacity="0.55"/>' +
      '<stop offset="0.90" stop-color="#b98a3c" stop-opacity="0.35"/>' +
      '<stop offset="1" stop-color="#000000" stop-opacity="0"/>' +
      '</radialGradient></defs>' +
      `<circle cx="${r}" cy="${r}" r="${r}" fill="url(#g)"/>` +
      `<circle cx="${r}" cy="${r}" r="${r - 7}" fill="none" stroke="#e9c979" stroke-opacity="0.65" stroke-width="3"/>` +
      '</svg>',
  );
}

// Gatherer's Cache: eight radiating yield marks around the center, the
// "more comes out" read.
function cacheGlyph() {
  const c = ICON_SIZE / 2;
  let marks = '';
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i + Math.PI / 8;
    const x1 = c + Math.cos(a) * 26;
    const y1 = c + Math.sin(a) * 26;
    const x2 = c + Math.cos(a) * 42;
    const y2 = c + Math.sin(a) * 42;
    marks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#ffe9ad" stroke-opacity="0.85" stroke-width="4" stroke-linecap="round"/>`;
  }
  return Buffer.from(
    `<svg width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 ${ICON_SIZE} ${ICON_SIZE}">${marks}</svg>`,
  );
}

// Artisan's Eye: a bright iris ring with a keen center, the "sees the finer
// grade" read.
function eyeGlyph() {
  const c = ICON_SIZE / 2;
  return Buffer.from(
    `<svg width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 ${ICON_SIZE} ${ICON_SIZE}">` +
      `<circle cx="${c}" cy="${c}" r="24" fill="none" stroke="#e6d6ff" stroke-opacity="0.9" stroke-width="5"/>` +
      `<circle cx="${c}" cy="${c}" r="9" fill="#ffffff" fill-opacity="0.9"/>` +
      '</svg>',
  );
}

async function renderCharm({ source, hue, glyph }) {
  const src = path.join(itemsDir, `${source}.webp`);
  return await sharp(readFileSync(src))
    .resize(ICON_SIZE, ICON_SIZE, { fit: 'cover' })
    // The strong hue turn away from the source material, plus a lift so the
    // charm reads brighter than the raw reagent in a dark bag grid.
    .modulate({ hue, brightness: 1.08, saturation: 1.15 })
    .composite([
      { input: charmRing(), blend: 'over' },
      { input: glyph(), blend: 'over' },
    ])
    .webp(webpOptions)
    .toBuffer();
}

async function main() {
  const check = process.argv.includes('--check');
  const stale = [];
  for (const charm of CHARMS) {
    const out = path.join(itemsDir, `${charm.id}.webp`);
    const rendered = await renderCharm(charm);
    if (check) {
      let committed = null;
      try {
        committed = readFileSync(out);
      } catch {
        stale.push(`${charm.id}.webp is missing`);
        continue;
      }
      // A corrupt or truncated committed file must land in the stale list as
      // its own named entry, not abort the sweep with an unnamed decode throw
      // that leaves the remaining icons unchecked.
      let reason = null;
      try {
        reason = await derivedIconStale(committed, rendered);
      } catch (err) {
        reason = `could not be decoded (${err instanceof Error ? err.message : String(err)})`;
      }
      if (reason) stale.push(`${charm.id}.webp ${reason}`);
      continue;
    }
    writeFileSync(out, rendered);
    console.log(
      `[tool-effect-icons] ${charm.source}.webp -> ${charm.id}.webp (${rendered.length} bytes)`,
    );
  }
  if (check && stale.length > 0) {
    console.error(`[tool-effect-icons] stale derived art:\n  ${stale.join('\n  ')}`);
    console.error('[tool-effect-icons] re-run: node scripts/assets/tool_effect_icons.mjs');
    process.exit(1);
  }
  console.log(`[tool-effect-icons] ${check ? 'checked' : 'wrote'} ${CHARMS.length} icons`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
