// scripts/generate_stormbrass_foundry_item_icons.mjs
// Generates the shipping 128x128 WebP item icons for the Stormbrass Foundry's
// loot (src/sim/content/stormbrass_foundry_items.ts, the two trinkets in
// src/sim/content/trinkets.ts, and the Draft Record quest object). Same recipe
// as generate_drowned_temple_item_icons.mjs: an authored SVG composition per
// item over a three-stop radial ground, rasterized with Sharp, meeting the
// woc-item-icon-v1 contract (opaque dark vignette, warm top-left key light,
// cool bottom-right shadow, centered silhouette with safe padding, distinct art
// per item). The palette is the Foundry's own: polished brass, verdigris
// copper, dark riveted iron, storm blue and white-blue lightning, never the
// raid's fire. The script IS the retained source: re-running it reproduces
// every file byte for byte. It never touches mapping.json; the generated batch
// entry there is hand-authored (batch stormbrass-foundry-icons-2026-10-01) with
// its provenance README under docs/achievements/stormbrass-foundry-icons-2026-10-01/.
//
// Usage: node scripts/generate_stormbrass_foundry_item_icons.mjs

import path from 'node:path';
import sharp from 'sharp';

const repoRoot = process.cwd();
const itemsDir = path.join(repoRoot, 'public/ui/items');
const OUT_PX = 128;
const MASTER_PX = 512;

// Shared material gradients (brass, verdigris, iron, leather, stormcloth,
// stormglass, copper) and the lightning glow.
const DEFS = `
  <linearGradient id="brass" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#fff0b8" />
    <stop offset="40%" stop-color="#c9a14a" />
    <stop offset="100%" stop-color="#4a3410" />
  </linearGradient>
  <linearGradient id="verdigris" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#a8e6d2" />
    <stop offset="55%" stop-color="#4e9c8a" />
    <stop offset="100%" stop-color="#173c34" />
  </linearGradient>
  <linearGradient id="iron" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#a4aab0" />
    <stop offset="45%" stop-color="#5a6068" />
    <stop offset="100%" stop-color="#1c2024" />
  </linearGradient>
  <linearGradient id="leather" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#b78556" />
    <stop offset="50%" stop-color="#6e4526" />
    <stop offset="100%" stop-color="#2e1a0c" />
  </linearGradient>
  <linearGradient id="stormcloth" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#b8c6dc" />
    <stop offset="45%" stop-color="#56657a" />
    <stop offset="100%" stop-color="#1a2230" />
  </linearGradient>
  <linearGradient id="stormglass" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#f4fbff" />
    <stop offset="35%" stop-color="#9fd8ff" />
    <stop offset="70%" stop-color="#3f7fd0" />
    <stop offset="100%" stop-color="#14264a" />
  </linearGradient>
  <linearGradient id="copper" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#f2c09a" />
    <stop offset="50%" stop-color="#b8693a" />
    <stop offset="100%" stop-color="#4a2410" />
  </linearGradient>
  <linearGradient id="wood" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#a47a4e" />
    <stop offset="55%" stop-color="#5a3b20" />
    <stop offset="100%" stop-color="#24160a" />
  </linearGradient>
  <linearGradient id="hazard" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%" stop-color="#e6c229" />
    <stop offset="100%" stop-color="#b8961a" />
  </linearGradient>
  <radialGradient id="spark" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95" />
    <stop offset="55%" stop-color="#9fd8ff" stop-opacity="0.35" />
    <stop offset="100%" stop-color="#9fd8ff" stop-opacity="0" />
  </radialGradient>
  <radialGradient id="glint" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#fff6d0" stop-opacity="0.9" />
    <stop offset="60%" stop-color="#e6c229" stop-opacity="0.25" />
    <stop offset="100%" stop-color="#e6c229" stop-opacity="0" />
  </radialGradient>
`;

/** A row of `n` rivets from (x0, y) to (x1, y). */
function rivets(x0, x1, y, n, r = 2) {
  let out = '';
  for (let i = 0; i < n; i++) {
    const x = n > 1 ? x0 + ((x1 - x0) * i) / (n - 1) : x0;
    out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="url(#brass)" stroke="#2a1c08" stroke-width="0.6" />`;
  }
  return out;
}

/** A jagged lightning bolt from (x0, y0) to (x1, y1) in `n` segments. */
function bolt(x0, y0, x1, y1, n, w = 2.2, color = '#eaf6ff') {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const jitter = i === 0 || i === n ? 0 : (i % 2 === 0 ? 1 : -1) * 5;
    const dx = y1 - y0;
    const dy = -(x1 - x0);
    const len = Math.hypot(dx, dy) || 1;
    pts.push([x0 + (x1 - x0) * t + (dx / len) * jitter, y0 + (y1 - y0) * t + (dy / len) * jitter]);
  }
  const d = pts
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ');
  return `<path d="${d}" stroke="${color}" stroke-width="${w}" fill="none" stroke-linejoin="round" />`;
}

/** A small cog at (x, y) with `teeth` teeth of radius r. */
function cog(x, y, r, teeth, fill = 'url(#brass)') {
  let d = '';
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i / (teeth * 2)) * Math.PI * 2;
    const rr = i % 2 === 0 ? r : r * 0.78;
    d += `${i === 0 ? 'M' : 'L'} ${(x + Math.cos(a) * rr).toFixed(1)} ${(y + Math.sin(a) * rr).toFixed(1)} `;
  }
  return `<path d="${d}Z" fill="${fill}" stroke="#2a1c08" stroke-width="1" /><circle cx="${x}" cy="${y}" r="${(r * 0.32).toFixed(1)}" fill="#1c1408" />`;
}

const SHADOW = (d, extra = '') =>
  `<path d="${d}" fill="#000" opacity="0.35" transform="translate(4 4)" ${extra} />`;

const ITEMS_TO_GENERATE = [
  // ---- Line-Master Ambrel Tock ----
  {
    id: 'riveters_gauntlets',
    bgDark: '#0a0806',
    bgMid: '#2a1f12',
    bgGlow: '#5a4424',
    svgArt: `
      <!-- A riveted mail gauntlet, a brass riveter nozzle strapped on its back -->
      ${SHADOW('M 36 104 L 34 54 Q 34 34 50 32 L 84 32 Q 96 36 94 54 L 92 104 Z')}
      <path d="M 36 104 L 34 54 Q 34 34 50 32 L 84 32 Q 96 36 94 54 L 92 104 Z" fill="url(#iron)" stroke="#14181c" stroke-width="1.8" />
      ${rivets(40, 88, 46, 6)}${rivets(40, 88, 62, 6)}${rivets(40, 88, 78, 6)}
      <rect x="34" y="92" width="58" height="12" rx="3" fill="url(#leather)" stroke="#2e1a0c" stroke-width="1" />
      <rect x="66" y="40" width="34" height="12" rx="4" fill="url(#brass)" stroke="#3a2808" stroke-width="1.4" transform="rotate(-20 83 46)" />
      <circle cx="102" cy="36" r="5" fill="#1c1408" stroke="url(#brass)" stroke-width="2" />
    `,
  },
  {
    id: 'beltrunners_boots',
    bgDark: '#08090a',
    bgMid: '#1f2226',
    bgGlow: '#444b52',
    svgArt: `
      <!-- Leather boots with hazard-chevron soles for running a moving belt -->
      ${SHADOW('M 40 22 L 66 22 L 68 80 L 104 86 Q 110 102 96 104 L 38 104 Q 32 102 34 88 Z')}
      <path d="M 40 22 L 66 22 L 68 80 L 104 86 Q 110 102 96 104 L 38 104 Q 32 102 34 88 Z" fill="url(#leather)" stroke="#1e120a" stroke-width="1.8" />
      <rect x="38" y="22" width="30" height="8" fill="url(#brass)" />
      <path d="M 36 98 L 104 98 L 102 106 L 36 106 Z" fill="#1a1a1a" />
      ${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M ${42 + i * 11} 106 l 5 -7 l 5 7" stroke="url(#hazard)" stroke-width="2.4" fill="none" />`).join('')}
      <path d="M 44 46 h 18 M 44 58 h 18" stroke="url(#brass)" stroke-width="2.2" />
    `,
  },
  {
    id: 'draftsmans_mantle',
    bgDark: '#070a10',
    bgMid: '#152238',
    bgGlow: '#2e4a70',
    svgArt: `
      <!-- A cloth mantle printed with blueprint lines, a brass compass pinned on -->
      ${SHADOW('M 16 88 Q 18 44 64 38 Q 110 44 112 88 Q 64 74 16 88 Z')}
      <path d="M 16 88 Q 18 44 64 38 Q 110 44 112 88 Q 64 74 16 88 Z" fill="#2a4a7a" stroke="#0e1a30" stroke-width="1.8" />
      <path d="M 28 78 Q 64 62 100 78 M 34 64 Q 64 52 94 64 M 64 42 L 64 74 M 44 50 L 48 76 M 84 50 L 80 76" stroke="#bcd8ff" stroke-width="1" fill="none" opacity="0.8" />
      <circle cx="64" cy="58" r="10" fill="none" stroke="#bcd8ff" stroke-width="1" opacity="0.8" />
      <path d="M 76 30 L 70 56 M 76 30 L 84 56" stroke="url(#brass)" stroke-width="3" stroke-linecap="round" />
      <circle cx="76" cy="30" r="4" fill="url(#brass)" stroke="#3a2808" stroke-width="1" />
    `,
  },
  {
    id: 'tocks_torque_wrench',
    bgDark: '#0b0806',
    bgMid: '#2c2012',
    bgGlow: '#62482a',
    svgArt: `
      <!-- A brass torque wrench heavy enough to swing, its gauge at the grip -->
      <path d="M 28 104 L 84 40" stroke="#000" stroke-width="12" opacity="0.35" stroke-linecap="round" transform="translate(4 4)" />
      <path d="M 28 104 L 84 40" stroke="url(#iron)" stroke-width="10" stroke-linecap="round" />
      <path d="M 32 98 L 44 86" stroke="url(#leather)" stroke-width="12" stroke-linecap="round" />
      <path d="M 76 20 Q 108 18 106 46 L 94 50 L 92 40 L 80 38 L 82 28 Z" fill="url(#brass)" stroke="#3a2808" stroke-width="1.8" />
      <path d="M 68 44 Q 64 70 92 60 L 92 50 L 80 52 L 80 44 Z" fill="url(#brass)" stroke="#3a2808" stroke-width="1.8" />
      <circle cx="54" cy="76" r="9" fill="#f2ead2" stroke="url(#brass)" stroke-width="2.4" />
      <path d="M 54 76 L 59 70" stroke="#a02018" stroke-width="1.6" />
    `,
  },
  // ---- The Rangewarden ----
  {
    id: 'proofplate_legguards',
    bgDark: '#0a0808',
    bgMid: '#26201c',
    bgGlow: '#4e4236',
    svgArt: `
      <!-- Proofed mail legguards, a painted target dented by test shots -->
      ${SHADOW('M 42 20 L 86 20 L 92 106 L 70 106 L 64 58 L 58 106 L 36 106 Z')}
      <path d="M 42 20 L 86 20 L 92 106 L 70 106 L 64 58 L 58 106 L 36 106 Z" fill="url(#iron)" stroke="#14181c" stroke-width="1.8" />
      <rect x="42" y="20" width="44" height="10" fill="url(#brass)" stroke="#3a2808" stroke-width="1" />
      <circle cx="50" cy="66" r="9" fill="none" stroke="#c83a2a" stroke-width="2.4" />
      <circle cx="50" cy="66" r="3" fill="#c83a2a" />
      <circle cx="80" cy="82" r="3.4" fill="#2a2e34" stroke="#c9ced4" stroke-width="1" />
      <circle cx="74" cy="56" r="2.6" fill="#2a2e34" stroke="#c9ced4" stroke-width="1" />
    `,
  },
  {
    id: 'rangefinders_hood',
    bgDark: '#090a08',
    bgMid: '#22261a',
    bgGlow: '#464e32',
    svgArt: `
      <!-- A leather hood with a brass rangefinder lens hinged over one eye -->
      ${SHADOW('M 24 100 Q 22 30 64 22 Q 106 30 104 100 L 86 100 Q 84 60 64 58 Q 44 60 42 100 Z')}
      <path d="M 24 100 Q 22 30 64 22 Q 106 30 104 100 L 86 100 Q 84 60 64 58 Q 44 60 42 100 Z" fill="url(#leather)" stroke="#1e120a" stroke-width="1.8" />
      <circle cx="78" cy="56" r="13" fill="url(#stormglass)" stroke="url(#brass)" stroke-width="4" />
      <path d="M 70 56 h 16 M 78 48 v 16" stroke="#c83a2a" stroke-width="1.2" />
      <path d="M 62 44 L 72 46" stroke="url(#brass)" stroke-width="3" />
    `,
  },
  {
    id: 'coilwound_cord',
    bgDark: '#070a09',
    bgMid: '#14261f',
    bgGlow: '#2c5244',
    svgArt: `
      <!-- A cloth cord wound tight with copper coil, a spark at its knot -->
      <ellipse cx="66" cy="74" rx="48" ry="16" fill="#000" opacity="0.35" />
      <path d="M 14 60 Q 64 46 114 60 L 112 74 Q 64 60 16 74 Z" fill="url(#stormcloth)" stroke="#1a2230" stroke-width="1.6" />
      ${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<ellipse cx="${20 + i * 11}" cy="${(64 - Math.sin((i / 8) * Math.PI) * 6).toFixed(1)}" rx="3.4" ry="8" fill="none" stroke="url(#copper)" stroke-width="2.4" />`).join('')}
      <circle cx="64" cy="70" r="7" fill="url(#copper)" stroke="#4a2410" stroke-width="1.4" />
      <circle cx="64" cy="70" r="14" fill="url(#spark)" opacity="0.7" />
    `,
  },
  {
    id: 'proving_range_quiver',
    bgDark: '#0a0806',
    bgMid: '#281e12',
    bgGlow: '#56422a',
    svgArt: `
      <!-- A brass-banded quiver of test bolts, a target painted on its side -->
      ${SHADOW('M 44 30 L 84 24 L 92 104 L 52 108 Z')}
      <path d="M 44 30 L 84 24 L 92 104 L 52 108 Z" fill="url(#leather)" stroke="#1e120a" stroke-width="1.8" />
      <path d="M 45 40 L 85 34 M 48 92 L 90 88" stroke="url(#brass)" stroke-width="5" />
      ${[0, 1, 2, 3].map((i) => `<path d="M ${52 + i * 9} 30 L ${48 + i * 9} 8" stroke="url(#wood)" stroke-width="3" /><path d="M ${45 + i * 9} 12 l 3 -8 l 4 7 Z" fill="url(#brass)" />`).join('')}
      <circle cx="68" cy="64" r="11" fill="none" stroke="#e6c229" stroke-width="2.4" />
      <circle cx="68" cy="64" r="4" fill="#c83a2a" />
    `,
  },
  {
    // The Heroic clone of the chase quiver (content/heroic_variants.ts): the same
    // quiver under a storm-lit ground, its bolts crackling.
    id: 'heroic_proving_range_quiver',
    bgDark: '#060812',
    bgMid: '#16203a',
    bgGlow: '#34507e',
    svgArt: `
      <!-- The proving quiver charged for live fire, lightning on its bolt heads -->
      <circle cx="64" cy="40" r="40" fill="url(#spark)" opacity="0.45" />
      ${SHADOW('M 44 30 L 84 24 L 92 104 L 52 108 Z')}
      <path d="M 44 30 L 84 24 L 92 104 L 52 108 Z" fill="url(#leather)" stroke="#1e120a" stroke-width="1.8" />
      <path d="M 45 40 L 85 34 M 48 92 L 90 88" stroke="url(#brass)" stroke-width="5" />
      ${[0, 1, 2, 3].map((i) => `<path d="M ${52 + i * 9} 30 L ${48 + i * 9} 8" stroke="url(#wood)" stroke-width="3" /><path d="M ${45 + i * 9} 12 l 3 -8 l 4 7 Z" fill="url(#stormglass)" />`).join('')}
      ${bolt(40, 10, 30, 30, 4, 1.8)}${bolt(90, 8, 100, 28, 4, 1.8)}
      <circle cx="68" cy="64" r="11" fill="none" stroke="#9fd8ff" stroke-width="2.4" />
      <circle cx="68" cy="64" r="4" fill="#eaf6ff" />
    `,
  },
  // ---- The Voltaic Warden ----
  {
    id: 'grounding_pauldrons',
    bgDark: '#060a08',
    bgMid: '#13261e',
    bgGlow: '#2c5242',
    svgArt: `
      <!-- A verdigris-copper pauldron with a grounding rod rising from it -->
      ${SHADOW('M 18 88 Q 20 46 64 40 Q 108 46 110 88 Q 64 74 18 88 Z')}
      <path d="M 18 88 Q 20 46 64 40 Q 108 46 110 88 Q 64 74 18 88 Z" fill="url(#verdigris)" stroke="#0f2a22" stroke-width="1.8" />
      <path d="M 26 80 Q 64 64 102 80 M 32 68 Q 64 54 96 68" stroke="url(#copper)" stroke-width="3" fill="none" />
      ${rivets(36, 92, 74, 5, 2.4)}
      <path d="M 64 42 L 64 10" stroke="url(#copper)" stroke-width="4" stroke-linecap="round" />
      <path d="M 56 20 L 72 20 M 58 28 L 70 28" stroke="url(#copper)" stroke-width="2.4" />
      <circle cx="64" cy="10" r="4" fill="url(#brass)" />
    `,
  },
  {
    id: 'arcstep_treads',
    bgDark: '#06080e',
    bgMid: '#151c30',
    bgGlow: '#2e3c62',
    svgArt: `
      <!-- Light leather treads trailing white-blue arcs from their heels -->
      ${SHADOW('M 40 22 L 66 22 L 68 82 L 104 88 Q 110 104 96 106 L 38 106 Q 32 104 34 90 Z')}
      <path d="M 40 22 L 66 22 L 68 82 L 104 88 Q 110 104 96 106 L 38 106 Q 32 104 34 90 Z" fill="url(#leather)" stroke="#1e120a" stroke-width="1.8" />
      <rect x="38" y="22" width="30" height="8" fill="url(#verdigris)" />
      <circle cx="34" cy="96" r="16" fill="url(#spark)" opacity="0.7" />
      ${bolt(34, 92, 14, 78, 4)}${bolt(36, 100, 14, 108, 3, 1.6)}
      <path d="M 46 52 l 10 -8 l -4 10 l 10 -6" stroke="#9fd8ff" stroke-width="2" fill="none" />
    `,
  },
  {
    id: 'stormglass_circlet',
    bgDark: '#06080f',
    bgMid: '#141c34',
    bgGlow: '#2c3c6a',
    svgArt: `
      <!-- A brass circlet set with a storm-blue glass stone, lightning in its heart -->
      <ellipse cx="64" cy="72" rx="44" ry="18" fill="#000" opacity="0.35" />
      <ellipse cx="64" cy="66" rx="44" ry="18" fill="none" stroke="url(#brass)" stroke-width="7" />
      <ellipse cx="64" cy="66" rx="44" ry="18" fill="none" stroke="#3a2808" stroke-width="1" />
      <path d="M 64 30 L 78 48 L 64 62 L 50 48 Z" fill="url(#stormglass)" stroke="#14264a" stroke-width="1.6" />
      ${bolt(60, 38, 68, 56, 3, 1.4)}
      <circle cx="64" cy="46" r="20" fill="url(#spark)" opacity="0.45" />
    `,
  },
  {
    id: 'voltaic_coil_staff',
    bgDark: '#05070e',
    bgMid: '#121a32',
    bgGlow: '#2c3e70',
    svgArt: `
      <!-- A tall staff crowned with a glass coil, lightning arcing across it -->
      <path d="M 30 112 L 82 34" stroke="#000" stroke-width="9" opacity="0.35" stroke-linecap="round" transform="translate(4 4)" />
      <path d="M 30 112 L 82 34" stroke="url(#wood)" stroke-width="7" stroke-linecap="round" />
      <path d="M 40 98 l 6 4 M 48 86 l 6 4" stroke="url(#copper)" stroke-width="2.6" />
      <rect x="76" y="10" width="20" height="34" rx="8" fill="url(#stormglass)" stroke="#14264a" stroke-width="1.6" transform="rotate(34 86 27)" />
      ${[0, 1, 2, 3].map((i) => `<ellipse cx="${(78 + i * 3).toFixed(1)}" cy="${(20 + i * 6).toFixed(1)}" rx="11" ry="3" fill="none" stroke="url(#copper)" stroke-width="2" transform="rotate(34 86 27)" />`).join('')}
      <circle cx="88" cy="24" r="22" fill="url(#spark)" opacity="0.55" />
      ${bolt(76, 14, 106, 40, 4, 1.8)}
    `,
  },
  // ---- The Prime Draft ----
  {
    id: 'draftplate_breastplate',
    bgDark: '#0b0806',
    bgMid: '#2a1e10',
    bgGlow: '#5e4422',
    svgArt: `
      <!-- A riveted brass breastplate with the first draft's chest seam -->
      ${SHADOW('M 40 20 L 88 20 L 104 44 L 94 52 L 92 108 L 36 108 L 34 52 L 24 44 Z')}
      <path d="M 40 20 L 88 20 L 104 44 L 94 52 L 92 108 L 36 108 L 34 52 L 24 44 Z" fill="url(#brass)" stroke="#3a2808" stroke-width="1.8" />
      <path d="M 64 22 L 64 106" stroke="#3a2808" stroke-width="2" />
      ${rivets(42, 86, 40, 6)}${rivets(40, 88, 70, 6)}${rivets(40, 88, 96, 6)}
      <rect x="54" y="50" width="20" height="14" rx="3" fill="url(#iron)" stroke="#14181c" stroke-width="1.2" />
    `,
  },
  {
    id: 'gearwork_jerkin',
    bgDark: '#0a0806',
    bgMid: '#261a10',
    bgGlow: '#523822',
    svgArt: `
      <!-- A leather jerkin fastened with three brass cog buckles -->
      ${SHADOW('M 40 20 L 88 20 L 104 44 L 94 52 L 92 108 L 36 108 L 34 52 L 24 44 Z')}
      <path d="M 40 20 L 88 20 L 104 44 L 94 52 L 92 108 L 36 108 L 34 52 L 24 44 Z" fill="url(#leather)" stroke="#1e120a" stroke-width="1.8" />
      <path d="M 64 22 L 64 106" stroke="#2e1a0c" stroke-width="2" />
      ${cog(64, 44, 8, 8)}${cog(64, 66, 8, 8)}${cog(64, 88, 8, 8)}
      <path d="M 40 30 L 50 30 M 78 30 L 88 30" stroke="url(#brass)" stroke-width="3" />
    `,
  },
  {
    id: 'stormbrass_robe',
    bgDark: '#06080e',
    bgMid: '#161e30',
    bgGlow: '#34445e',
    svgArt: `
      <!-- A storm-grey robe hemmed in brass, a lightning bolt down its front -->
      ${SHADOW('M 44 18 L 84 18 L 98 40 L 92 46 L 100 110 L 28 110 L 36 46 L 30 40 Z')}
      <path d="M 44 18 L 84 18 L 98 40 L 92 46 L 100 110 L 28 110 L 36 46 L 30 40 Z" fill="url(#stormcloth)" stroke="#1a2230" stroke-width="1.8" />
      <path d="M 28 104 L 100 104" stroke="url(#brass)" stroke-width="6" />
      <path d="M 44 18 L 64 40 L 84 18" stroke="url(#brass)" stroke-width="3" fill="none" />
      ${bolt(66, 46, 60, 96, 5, 3)}
      <circle cx="62" cy="70" r="22" fill="url(#spark)" opacity="0.3" />
    `,
  },
  {
    id: 'piston_maul',
    bgDark: '#0a0806',
    bgMid: '#2a1f12',
    bgGlow: '#5a4424',
    svgArt: `
      <!-- A two-handed maul whose head is a brass piston and its cylinder -->
      <path d="M 26 112 L 78 46" stroke="#000" stroke-width="11" opacity="0.35" stroke-linecap="round" transform="translate(4 4)" />
      <path d="M 26 112 L 78 46" stroke="url(#iron)" stroke-width="8" stroke-linecap="round" />
      <path d="M 30 104 L 42 90" stroke="url(#leather)" stroke-width="11" stroke-linecap="round" />
      <rect x="56" y="16" width="52" height="32" rx="6" fill="url(#brass)" stroke="#3a2808" stroke-width="2" transform="rotate(38 82 32)" />
      <rect x="92" y="24" width="18" height="18" rx="2" fill="url(#iron)" stroke="#14181c" stroke-width="1.4" transform="rotate(38 82 32)" />
      ${[0, 1, 2].map((i) => `<path d="M ${66 + i * 10} ${18 + i * 7} l 8 6" stroke="#3a2808" stroke-width="2" />`).join('')}
      <circle cx="40" cy="22" r="8" fill="#e9eef0" opacity="0.5" /><circle cx="30" cy="16" r="5" fill="#e9eef0" opacity="0.35" />
    `,
  },
  {
    id: 'cellspark_dagger',
    bgDark: '#05070e',
    bgMid: '#111a30',
    bgGlow: '#2a3e6a',
    svgArt: `
      <!-- A slim dagger whose grip is a tiny storm cell, sparks along the edge -->
      <path d="M 34 96 L 94 30" stroke="#000" stroke-width="10" opacity="0.35" stroke-linecap="round" transform="translate(4 4)" />
      <path d="M 50 80 L 96 24 L 104 22 L 102 30 L 58 86 Z" fill="url(#iron)" stroke="#14181c" stroke-width="1.6" />
      <path d="M 54 82 L 99 27" stroke="#eaf6ff" stroke-width="1.2" />
      <path d="M 42 76 L 62 92 L 58 96 L 38 80 Z" fill="url(#brass)" stroke="#3a2808" stroke-width="1.2" />
      <rect x="28" y="88" width="16" height="22" rx="4" fill="url(#stormglass)" stroke="url(#brass)" stroke-width="2" transform="rotate(40 36 99)" />
      <circle cx="80" cy="44" r="16" fill="url(#spark)" opacity="0.6" />
      ${bolt(70, 50, 96, 30, 4, 1.4)}
    `,
  },
  {
    id: 'governors_scepter',
    bgDark: '#0a0806',
    bgMid: '#2a2012',
    bgGlow: '#5c462a',
    svgArt: `
      <!-- A scepter crowned with a spinning flyball governor of brass -->
      <path d="M 34 112 L 74 50" stroke="#000" stroke-width="8" opacity="0.35" stroke-linecap="round" transform="translate(4 4)" />
      <path d="M 34 112 L 74 50" stroke="url(#wood)" stroke-width="6" stroke-linecap="round" />
      <path d="M 74 50 L 82 18" stroke="url(#brass)" stroke-width="4" />
      <path d="M 80 26 L 64 44 M 80 26 L 98 40" stroke="url(#brass)" stroke-width="2.4" />
      <circle cx="64" cy="44" r="7" fill="url(#brass)" stroke="#3a2808" stroke-width="1.2" />
      <circle cx="98" cy="40" r="7" fill="url(#brass)" stroke="#3a2808" stroke-width="1.2" />
      <ellipse cx="81" cy="36" rx="24" ry="6" fill="none" stroke="#fff0b8" stroke-width="1" opacity="0.6" />
      <circle cx="82" cy="16" r="5" fill="url(#stormglass)" />
      <circle cx="82" cy="32" r="22" fill="url(#glint)" opacity="0.35" />
    `,
  },
  // ---- Heroic epics ----
  {
    id: 'line_masters_steam_hammer',
    bgDark: '#0b0806',
    bgMid: '#2e2010',
    bgGlow: '#6a4c22',
    svgArt: `
      <!-- An epic steam hammer: an iron head on a pressure tank, a gauge needle
           in the red and steam venting from its valve -->
      <path d="M 24 114 L 74 50" stroke="#000" stroke-width="11" opacity="0.35" stroke-linecap="round" transform="translate(4 4)" />
      <path d="M 24 114 L 74 50" stroke="url(#iron)" stroke-width="8" stroke-linecap="round" />
      <path d="M 28 106 L 40 92" stroke="url(#leather)" stroke-width="11" stroke-linecap="round" />
      <rect x="50" y="14" width="58" height="40" rx="8" fill="url(#iron)" stroke="#14181c" stroke-width="2" transform="rotate(38 79 34)" />
      <rect x="58" y="20" width="40" height="28" rx="12" fill="url(#brass)" stroke="#3a2808" stroke-width="1.6" transform="rotate(38 79 34)" />
      <circle cx="78" cy="34" r="9" fill="#f2ead2" stroke="#3a2808" stroke-width="1.6" />
      <path d="M 78 34 L 84 28" stroke="#c83a2a" stroke-width="2" />
      <circle cx="104" cy="14" r="9" fill="#e9eef0" opacity="0.55" /><circle cx="114" cy="6" r="6" fill="#e9eef0" opacity="0.35" />
      <circle cx="78" cy="34" r="30" fill="url(#glint)" opacity="0.3" />
    `,
  },
  {
    id: 'rangewardens_targeting_visor',
    bgDark: '#0a0606',
    bgMid: '#2a1414',
    bgGlow: '#5a2a26',
    svgArt: `
      <!-- An epic visor of riveted leather and brass, a red crosshair burning in
           its single great lens -->
      ${SHADOW('M 22 96 Q 20 32 64 24 Q 108 32 106 96 L 88 96 Q 86 64 64 62 Q 42 64 40 96 Z')}
      <path d="M 22 96 Q 20 32 64 24 Q 108 32 106 96 L 88 96 Q 86 64 64 62 Q 42 64 40 96 Z" fill="url(#leather)" stroke="#1e120a" stroke-width="1.8" />
      <rect x="32" y="40" width="64" height="20" rx="8" fill="url(#brass)" stroke="#3a2808" stroke-width="1.6" />
      <circle cx="64" cy="50" r="16" fill="url(#stormglass)" stroke="url(#brass)" stroke-width="3" />
      <circle cx="64" cy="50" r="8" fill="none" stroke="#ff4a3a" stroke-width="1.6" />
      <path d="M 50 50 h 28 M 64 36 v 28" stroke="#ff4a3a" stroke-width="1.4" />
      <circle cx="64" cy="50" r="24" fill="#ff4a3a" opacity="0.12" />
    `,
  },
  {
    id: 'stormglass_robes',
    bgDark: '#04060e',
    bgMid: '#10183a',
    bgGlow: '#2c3e7a',
    svgArt: `
      <!-- Epic robes paneled with stormglass, lightning held inside each pane -->
      ${SHADOW('M 44 16 L 84 16 L 100 40 L 92 46 L 102 112 L 26 112 L 36 46 L 28 40 Z')}
      <path d="M 44 16 L 84 16 L 100 40 L 92 46 L 102 112 L 26 112 L 36 46 L 28 40 Z" fill="url(#stormcloth)" stroke="#1a2230" stroke-width="1.8" />
      <path d="M 44 50 L 56 50 L 54 104 L 38 104 Z" fill="url(#stormglass)" opacity="0.9" />
      <path d="M 72 50 L 84 50 L 90 104 L 74 104 Z" fill="url(#stormglass)" opacity="0.9" />
      ${bolt(48, 54, 46, 98, 4, 1.4)}${bolt(78, 54, 82, 98, 4, 1.4)}
      <path d="M 44 16 L 64 38 L 84 16" stroke="url(#brass)" stroke-width="3" fill="none" />
      <path d="M 26 106 L 102 106" stroke="url(#brass)" stroke-width="5" />
      <circle cx="64" cy="70" r="40" fill="url(#spark)" opacity="0.25" />
    `,
  },
  {
    id: 'prime_draft_core_plate',
    bgDark: '#0b0806',
    bgMid: '#2c1e0e',
    bgGlow: '#664a20',
    svgArt: `
      <!-- The Prime Draft's chest plate: two hatch leaves over an empty socket,
           lightning flickering where a heart should be -->
      ${SHADOW('M 38 18 L 90 18 L 106 44 L 96 52 L 94 110 L 34 110 L 32 52 L 22 44 Z')}
      <path d="M 38 18 L 90 18 L 106 44 L 96 52 L 94 110 L 34 110 L 32 52 L 22 44 Z" fill="url(#brass)" stroke="#3a2808" stroke-width="1.8" />
      ${rivets(40, 88, 30, 6)}${rivets(38, 90, 100, 6)}
      <circle cx="64" cy="64" r="20" fill="#0a0c12" stroke="url(#iron)" stroke-width="4" />
      <path d="M 44 64 L 62 46 L 62 82 Z" fill="url(#iron)" stroke="#14181c" stroke-width="1.2" />
      <path d="M 84 64 L 66 46 L 66 82 Z" fill="url(#iron)" stroke="#14181c" stroke-width="1.2" />
      <circle cx="64" cy="64" r="22" fill="url(#spark)" opacity="0.55" />
      ${bolt(56, 58, 72, 70, 3, 1.4)}
    `,
  },
  {
    id: 'heartless_gearmask',
    bgDark: '#06080c',
    bgMid: '#1a1e26',
    bgGlow: '#3a4250',
    svgArt: `
      <!-- An unfinished brass face mask, one glass eye lit and one socket bare,
           gears turning at the temple -->
      ${SHADOW('M 30 30 Q 64 10 98 30 L 96 80 Q 64 112 32 80 Z')}
      <path d="M 30 30 Q 64 10 98 30 L 96 80 Q 64 112 32 80 Z" fill="url(#brass)" stroke="#3a2808" stroke-width="1.8" />
      <circle cx="50" cy="54" r="10" fill="url(#stormglass)" stroke="#3a2808" stroke-width="1.6" />
      <circle cx="50" cy="54" r="16" fill="url(#spark)" opacity="0.6" />
      <circle cx="78" cy="54" r="10" fill="#0a0c12" stroke="#3a2808" stroke-width="1.6" />
      <path d="M 50 82 L 78 82" stroke="#3a2808" stroke-width="3" />
      ${cog(96, 34, 10, 8, 'url(#iron)')}${cog(104, 52, 7, 7)}
      <path d="M 64 24 L 64 40" stroke="#3a2808" stroke-width="1.6" />
    `,
  },
  // ---- The trinkets ----
  {
    id: 'rangefinders_lens',
    bgDark: '#0a0806',
    bgMid: '#2a1f12',
    bgGlow: '#5a4424',
    svgArt: `
      <!-- A brass rangefinder lens engraved with range marks, a red reticle at
           its centre -->
      <circle cx="68" cy="68" r="38" fill="#000" opacity="0.35" />
      <circle cx="64" cy="64" r="38" fill="url(#brass)" stroke="#3a2808" stroke-width="2" />
      <circle cx="64" cy="64" r="28" fill="url(#stormglass)" stroke="#3a2808" stroke-width="1.6" />
      ${Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2;
        const r0 = i % 4 === 0 ? 30 : 33;
        return `<path d="M ${(64 + Math.cos(a) * r0).toFixed(1)} ${(64 + Math.sin(a) * r0).toFixed(1)} L ${(64 + Math.cos(a) * 37).toFixed(1)} ${(64 + Math.sin(a) * 37).toFixed(1)}" stroke="#3a2808" stroke-width="1.6" />`;
      }).join('')}
      <circle cx="64" cy="64" r="9" fill="none" stroke="#ff4a3a" stroke-width="1.6" />
      <path d="M 46 64 h 36 M 64 46 v 36" stroke="#ff4a3a" stroke-width="1.2" />
      <path d="M 50 50 Q 56 44 66 44" stroke="#ffffff" stroke-width="2" fill="none" opacity="0.7" />
    `,
  },
  {
    id: 'overclocked_governor',
    bgDark: '#05070e',
    bgMid: '#131a30',
    bgGlow: '#2e3e6a',
    svgArt: `
      <!-- A flyball governor spun past its limit, sparks flying off its balls -->
      <ellipse cx="66" cy="102" rx="30" ry="7" fill="#000" opacity="0.35" />
      <rect x="44" y="92" width="40" height="10" rx="3" fill="url(#iron)" stroke="#14181c" stroke-width="1.2" />
      <path d="M 64 92 L 64 22" stroke="url(#brass)" stroke-width="5" />
      <path d="M 64 34 L 34 58 M 64 34 L 94 58 M 64 66 L 40 60 M 64 66 L 88 60" stroke="url(#brass)" stroke-width="3" />
      <circle cx="34" cy="58" r="10" fill="url(#brass)" stroke="#3a2808" stroke-width="1.4" />
      <circle cx="94" cy="58" r="10" fill="url(#brass)" stroke="#3a2808" stroke-width="1.4" />
      <ellipse cx="64" cy="58" rx="40" ry="9" fill="none" stroke="#eaf6ff" stroke-width="1.4" opacity="0.7" />
      <circle cx="34" cy="58" r="16" fill="url(#spark)" opacity="0.7" />
      <circle cx="94" cy="58" r="16" fill="url(#spark)" opacity="0.7" />
      ${bolt(18, 44, 30, 54, 3, 1.4)}${bolt(110, 44, 98, 54, 3, 1.4)}
      <circle cx="64" cy="20" r="5" fill="url(#stormglass)" />
    `,
  },
  // ---- The First Draft's quest object ----
  {
    id: 'draft_record',
    bgDark: '#08070a',
    bgMid: '#201a24',
    bgGlow: '#44384c',
    svgArt: `
      <!-- A blueprint roll in a brass case: the Prime Draft's half-drawn frame and
           an empty circle where its heart was never set -->
      ${SHADOW('M 22 34 L 102 26 L 106 92 L 26 100 Z')}
      <path d="M 22 34 L 102 26 L 106 92 L 26 100 Z" fill="#2a4a7a" stroke="#0e1a30" stroke-width="1.8" />
      <path d="M 50 40 L 50 86 M 74 38 L 76 84 M 50 52 L 76 50 M 50 72 L 76 70" stroke="#bcd8ff" stroke-width="1.2" opacity="0.85" />
      <circle cx="63" cy="60" r="8" fill="none" stroke="#bcd8ff" stroke-width="1.2" stroke-dasharray="2 2" />
      <path d="M 38 46 L 44 44 M 38 58 L 44 56 M 82 44 L 90 42 M 82 56 L 90 54" stroke="#bcd8ff" stroke-width="1" opacity="0.7" />
      <rect x="10" y="26" width="16" height="80" rx="7" fill="url(#brass)" stroke="#3a2808" stroke-width="1.6" transform="rotate(-6 18 66)" />
      <rect x="100" y="20" width="14" height="78" rx="6" fill="url(#brass)" stroke="#3a2808" stroke-width="1.6" transform="rotate(-6 107 59)" />
    `,
  },
];

function composeSvg(item, px) {
  return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 128 128">
        <defs>
          <radialGradient id="bgGrad" cx="38%" cy="32%" r="72%">
            <stop offset="0%" stop-color="${item.bgGlow}" />
            <stop offset="50%" stop-color="${item.bgMid}" />
            <stop offset="100%" stop-color="${item.bgDark}" />
          </radialGradient>
          <radialGradient id="shade" cx="78%" cy="80%" r="60%">
            <stop offset="0%" stop-color="#0a1830" stop-opacity="0.35" />
            <stop offset="100%" stop-color="#0a1830" stop-opacity="0" />
          </radialGradient>
          ${DEFS}
          <filter id="grain" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" />
            <feColorMatrix type="matrix" values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0.22 0" />
          </filter>
          <filter id="soft"><feGaussianBlur stdDeviation="0.35" /></filter>
        </defs>
        <rect width="128" height="128" fill="url(#bgGrad)" />
        <g filter="url(#soft)" transform="translate(64 66) scale(${item.scale ?? 1.05}) translate(-64 -66)">${item.svgArt}</g>
        <rect width="128" height="128" fill="url(#shade)" />
        <rect width="128" height="128" filter="url(#grain)" style="mix-blend-mode: overlay" />
      </svg>
    `;
}

async function main() {
  console.log(`Generating ${ITEMS_TO_GENERATE.length} Stormbrass Foundry WebP icons...`);
  for (const item of ITEMS_TO_GENERATE) {
    const destFile = path.join(itemsDir, `${item.id}.webp`);
    // Rasterize at the 512 master size, then downscale to the shipping 128.
    await sharp(Buffer.from(composeSvg(item, MASTER_PX)))
      .resize(OUT_PX, OUT_PX)
      .flatten({ background: item.bgDark })
      .webp({ quality: 85, effort: 6 })
      .toFile(destFile);
    console.log(`Generated: ${item.id}.webp`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
