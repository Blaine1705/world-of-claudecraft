// Blockout evidence for the Smith's Heart raid (docs/design/raid/smith_heart.md)
// in a live offline world: the balcony's first view, the Ring, and each vein's
// guardian arena. Evidence tooling, not a repo test. Needs a dev Vite
// (ALLOW_DEV_COMMANDS is implied offline) serving the worktree.
//
//   node scripts/smith_heart_blockout_shot.mjs <outDir> [label]
//
// Env: SHOT_URL (http://127.0.0.1:5186/), SHOT_W / SHOT_H (1600x900),
// SHOT_PRESET (4).
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';

const URL = process.env.SHOT_URL ?? 'http://127.0.0.1:5186/';
const OUT = process.argv[2] ?? path.join('tmp', 'smith_heart');
const LABEL = process.argv[3] ?? 'fase1';
const W = Number(process.env.SHOT_W ?? 1600);
const H = Number(process.env.SHOT_H ?? 900);
const PRESET = Number(process.env.SHOT_PRESET ?? 4);
// SHOT_DRY=1: walk the whole recipe and log where the player lands, no images.
const DRY = process.env.SHOT_DRY === '1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// name, stand (instance-local), look-at, camera yaw offset, pitch, distance.
const SHOTS = [
  ['01_balcon', [0, -70], [0, 0], 0, 0.32, 16],
  ['02_anillo', [-60, 40], [0, 0], 0.5, 0.42, 22],
  ['03_martillo_foso', [24, -170], [0, -150], 0.2, 0.5, 26],
  ['04_aliento_cornisa', [-30, 182], [0, 206], 0.3, 0.45, 26],
  ['05_temple_lago', [176, -30], [186, 10], 0.2, 0.5, 26],
  ['06_calor_yunque', [-150, 18], [-196, 0], 0.4, 0.45, 26],
];

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  args: [`--window-size=${W},${H}`, '--use-angle=d3d11', '--ignore-gpu-blocklist'],
  defaultViewport: { width: W, height: H },
  protocolTimeout: 240000,
});
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('CONSOLE:', m.text().slice(0, 300));
  });
  await page.evaluateOnNewDocument((preset) => {
    try {
      localStorage.setItem('woc_settings', JSON.stringify({ graphicsPreset: preset }));
    } catch {
      /* ignore */
    }
  }, PRESET);
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 180000 });
  const booted = await enterOfflineGame(page, {
    charClass: 'warrior',
    charName: 'Heartwalker',
    gameBootTimeoutMs: 180000,
    selectorTimeoutMs: 90000,
    settleMs: 4000,
  });
  if (!booted) throw new Error('offline world did not boot');
  const chat = async (c, wait = 900) => {
    await page.evaluate((line) => window.__game.world.chat(line), c);
    await sleep(wait);
  };
  for (const c of ['/dev level 20', '/dev god', '/dev noaggro', '/dev heart enter'])
    await chat(c, 1500);
  // The Hammer and the Breath are down: two colours on the seal, the ochre and
  // storm-blue rivers lit, as the design's first view shows the freed vein.
  await chat('/dev heart kill hammer', 800);
  await chat('/dev heart kill breath', 800);
  for (const p of ['h1', 'h2', 'h3']) await chat(`/dev heart kill pack ${p}`, 300);
  await page.waitForFunction(
    () => {
      let found = false;
      window.__game.renderer.scene.traverse((o) => {
        if (/smithHeart/i.test(o.name)) found = true;
      });
      return found;
    },
    { timeout: 180000, polling: 1000 },
  );
  await page.addStyleTag({ content: '#ui { display: none !important; }' });
  const O = await page.evaluate(() => {
    const p = window.__game.world.player;
    // The entry is at (-100, -224) instance-local.
    return { x: p.pos.x + 100, z: p.pos.z + 224 };
  });
  console.log('origin', O);
  for (const [name, at, look, yaw, pitch, dist] of SHOTS) {
    await page.evaluate(
      ([ox, oz, x, z, fx, fz, yaw, pitch, dist]) => {
        const w = window.__game.world;
        const p = w.player;
        const g = w.ctx.groundPos(ox + x, oz + z);
        p.pos = { ...g };
        p.prevPos = { ...g };
        p.facing = Math.atan2(fx - x, fz - z);
        p.prevFacing = p.facing;
        const input = window.__game.input;
        input.camYaw = p.facing + yaw;
        input.camPitch = pitch;
        input.camDist = dist;
      },
      [O.x, O.z, at[0], at[1], look[0], look[1], yaw, pitch, dist],
    );
    await sleep(DRY ? 1500 : 6000);
    const where = await page.evaluate(() => {
      const p = window.__game.world.player;
      return `${p.pos.x.toFixed(1)} ${p.pos.y.toFixed(1)} ${p.pos.z.toFixed(1)}`;
    });
    console.log(name, 'at', where);
    if (DRY) continue;
    fs.mkdirSync(OUT, { recursive: true });
    const file = path.join(OUT, `${name}_${LABEL}.png`);
    await page.screenshot({ path: file });
    console.log('SHOT', file);
  }
} finally {
  await browser.close();
}
