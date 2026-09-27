// Owner-facing captures of the Mirefen tavern on the Fenbridge road
// (src/sim/content/mirefen_tavern.ts): from the road (the tankard sign), in the doorway (the
// fire, the bar and the stair at a glance), at the hearth ring, at the bar, on the stair,
// from the gallery looking down, in a guest room, and the player beside a table and in the
// doorway for scale. Offline client, dev build, driven through window.__game the way
// scripts/drakelands_harbor_shot.mjs is.
//
//   npx vite --port 5183
//   GAME_URL=http://localhost:5183 SHOTS_DIR=tmp/tavern GPU=1 node scripts/mirefen_tavern_shot.mjs
//
// GRAPHICS_PRESET picks the preset (1 low, 2 medium, 3 high, the default, 4 ultra). ONLY limits
// the run to a comma list of shot names; PREFIX and SUFFIX wrap every file name.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5183';
const OUT = process.env.SHOTS_DIR ?? 'tmp/tavern';
const PRESET = Number(process.env.GRAPHICS_PRESET ?? 3);
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const PREFIX = process.env.PREFIX ?? '';
const SUFFIX = process.env.SUFFIX ?? '';
const GPU = process.env.GPU === '1';
const WIDTH = Number(process.env.WIDTH ?? 1600);
const HEIGHT = Number(process.env.HEIGHT ?? 900);
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The tavern's local frame (the door faces world +x): TAVERN_ORIGIN in the content. */
const ORIGIN = { x: -17, z: 408 };
const world = (lx, lz) => ({ x: ORIGIN.x + lz, z: ORIGIN.z - lx });

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  args: [
    `--window-size=${WIDTH},${HEIGHT}`,
    ...(GPU
      ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']
      : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
  ],
  defaultViewport: { width: WIDTH, height: HEIGHT },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.evaluateOnNewDocument(`
  try { localStorage.setItem('woc_settings', JSON.stringify({ graphicsPreset: ${PRESET}, graphicsDefaultApplied: true })); } catch {}
`);
await page.goto(URL, { waitUntil: 'networkidle0', timeout: 180000 });
const booted = await enterOfflineGame(page, {
  charClass: 'warrior',
  charName: 'Wanderer',
  gameBootTimeoutMs: 240000,
  selectorTimeoutMs: 120000,
});
if (!booted) throw new Error('offline world did not boot');
await sleep(1500);

function run(body) {
  return page.evaluate(`(async () => { ${body} })()`);
}

await run(`window.__game.sim.setPlayerLevel(20);`);
await page.waitForSelector('#chat-input', { timeout: 120000 });
async function chat(line) {
  await page.evaluate((text) => {
    const box = document.querySelector('#chat-input');
    box.value = text;
    box.dispatchEvent(new Event('input', { bubbles: true }));
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  }, line);
}
await chat(process.env.DAYNIGHT ?? '/daynight day');
await sleep(4000);
console.log(
  'graphics',
  await run(
    `const { GFX } = await import('/src/render/gfx.ts'); return GFX.tier + ' / effects ' + GFX.effectsTier;`,
  ),
);

/** Stand the player at local (lx, lz) on the floor, the camera looking at local (tx, tz). */
async function standAndLook(lx, lz, tx, tz, pitch, dist) {
  const p = world(lx, lz);
  const t = world(tx, tz);
  await run(`
    const g = window.__game;
    const pl = g.sim.player;
    const pos = g.sim.groundPos(${p.x}, ${p.z});
    pl.pos = { ...pos };
    pl.prevPos = { ...pos };
    pl.vx = 0; pl.vy = 0; pl.vz = 0;
    const yaw = Math.atan2(${t.x} - pos.x, ${t.z} - pos.z);
    pl.facing = yaw;
    pl.prevFacing = yaw;
    g.input.camYaw = g.renderer.camYaw = yaw;
    g.input.camPitch = g.renderer.camPitch = ${pitch};
    g.input.camDist = g.renderer.camDist = ${dist};
  `);
}

async function settle(ms) {
  await sleep(1000);
  for (let i = 0; i < 240; i++) {
    const loading = await run(`
      const el = document.querySelector('#loading-screen');
      if (!el) return false;
      const s = getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0.01;
    `);
    if (!loading) break;
    await sleep(500);
  }
  await sleep(GPU ? ms : ms * 2);
}

async function shot(name) {
  await run(
    `for (const id of ['#error-msg']) { const el = document.querySelector(id); if (el) el.style.visibility = 'hidden'; }`,
  );
  const file = path.join(OUT, `${PREFIX}${name}${SUFFIX}.png`);
  await page.screenshot({ path: file });
  console.log('wrote', file);
}

const want = (name) => !ONLY || ONLY.has(name);
// name, stand (local x, z), look at (local x, z), pitch, camera distance
const SHOTS = [
  ['exterior_road', 8.0, 29.0, 0.0, 6.0, 0.22, 24],
  ['exterior_north', 26.0, 10.0, 8.0, -6.0, 0.2, 20],
  ['doorway', 0.0, 12.9, 0.0, -10.0, 0.14, 5],
  ['hearth', 0.0, 8.3, 0.0, 2.4, 0.42, 9],
  ['bar', 7.35, -4.9, 9.0, -8.8, 0.18, 7],
  ['stair', -6.9, -18.8, 2.4, -16.4, 0.32, 6],
  ['gallery', 6.2, -11.4, 0.0, 3.0, 0.3, 6],
  ['room', 7.3, -21.8, 7.3, -25.3, 0.35, 5],
  ['scale_table', -10.0, 1.0, -14.0, 1.0, 0.12, 6],
  ['scale_door', 0.0, 15.0, 0.0, 10.0, 0.05, 8],
];
for (const [name, x, z, tx, tz, pitch, dist] of SHOTS) {
  if (!want(name)) continue;
  await standAndLook(x, z, tx, tz, pitch, dist);
  await settle(5000);
  await standAndLook(x, z, tx, tz, pitch, dist);
  await sleep(1500);
  await shot(name);
}
await browser.close();
