// Probe 5: the player frame's BOX vs its visible CONTENT at a non-default
// Player Frame Scale, docked and after a first drag. The box is a fixed 612px
// while the children zoom with --player-frame-scale, and pf-detached flips
// justify-content, so the content is expected to jump left on grab and the
// outline to overhang the content on the right. Needs `npm run dev`.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5391';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync('tmp', { recursive: true });

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  protocolTimeout: 120000,
  args: ['--window-size=1920,1080', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1920, height: 1080 },
});
const page = await browser.newPage();
await page.goto(URL, { waitUntil: 'domcontentloaded' });
console.log(
  'booted:',
  await enterOfflineGame(page, {
    charClass: 'warrior',
    charName: 'ScaleProbe',
    gameBootTimeoutMs: 90000,
    settleMs: 5000,
  }),
);

const measure = (label) =>
  page.evaluate((tag) => {
    const pf = document.querySelector('#player-frame');
    const box = pf.getBoundingClientRect();
    // The visible content: union of the portrait and the bar column.
    let left = Infinity;
    let right = -Infinity;
    for (const sel of ['.portrait-wrap', '.uf-bars']) {
      const el = pf.querySelector(sel);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      left = Math.min(left, r.left);
      right = Math.max(right, r.right);
    }
    return {
      tag,
      box: { left: +box.left.toFixed(1), right: +box.right.toFixed(1), w: +box.width.toFixed(1) },
      content: { left: +left.toFixed(1), right: +right.toFixed(1), w: +(right - left).toFixed(1) },
      deadRight: +(box.right - right).toFixed(1),
      deadLeft: +(left - box.left).toFixed(1),
    };
  }, label);

await page.evaluate(() => {
  document.documentElement.style.setProperty('--player-frame-scale', '0.75');
  window.__game.hud.toggleInterfaceUnlock();
});
await sleep(300);

console.log(JSON.stringify(await measure('docked, pfs 0.75'), null, 2));
await page.screenshot({ path: 'tmp/pfscale_0_docked.png' });

// First grab + a pure horizontal drag.
let m = await measure('grab');
const gx = (m.content.left + m.content.right) / 2;
const gy = await page.evaluate(() => {
  const r = document.querySelector('#player-frame').getBoundingClientRect();
  return r.top + r.height / 2;
});
await page.mouse.move(gx, gy);
await page.mouse.down();
await page.mouse.move(gx + 5, gy);
await sleep(100);
console.log(JSON.stringify(await measure('mid-drag +5px (content jump?)'), null, 2));
await page.screenshot({ path: 'tmp/pfscale_1_grabbed.png' });
await page.mouse.up();
await sleep(150);

// Shove to the right-edge clamp: how far short of the edge does the CONTENT stop?
m = await measure('pre-clamp');
await page.mouse.move((m.content.left + m.content.right) / 2, gy);
await page.mouse.down();
await page.mouse.move(1910, gy, { steps: 10 });
await page.mouse.up();
await sleep(150);
const clamped = await measure('at right clamp');
console.log(JSON.stringify(clamped, null, 2));
console.log('content stops', (1920 - clamped.content.right).toFixed(1), 'px short of the screen edge');
await page.screenshot({ path: 'tmp/pfscale_2_clamped.png' });

await browser.close();
