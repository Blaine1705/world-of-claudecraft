// Probe 3: SCREENSHOT the player frame mid- and post-horizontal-drag, plus at
// the right-edge clamp, to catch any visual anomaly the rect numbers cannot
// show (content offset in the box, chrome left behind, outline mismatch).
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
    charName: 'DragProbe',
    gameBootTimeoutMs: 90000,
    settleMs: 5000,
  }),
);
await page.evaluate(() => window.__game.hud.toggleInterfaceUnlock());
await sleep(300);

const rectOf = () =>
  page.evaluate(() => {
    const r = document.querySelector('#player-frame').getBoundingClientRect();
    return { left: r.left, top: r.top, w: r.width, h: r.height };
  });

let r = await rectOf();
await page.screenshot({ path: 'tmp/pf_0_unlocked.png' });

// Drag mid-frame far to the RIGHT and hold (screenshot mid-drag).
const gx = r.left + r.w / 2;
const gy = r.top + r.h / 2;
await page.mouse.move(gx, gy);
await page.mouse.down();
for (let i = 1; i <= 10; i++) {
  await page.mouse.move(gx + 60 * i, gy - 30 * i);
  await sleep(25);
}
await page.screenshot({ path: 'tmp/pf_1_middrag.png' });
await page.mouse.up();
await sleep(150);
r = await rectOf();
console.log('after drag', r);
await page.screenshot({ path: 'tmp/pf_2_dropped.png' });

// Now shove it to the right-edge clamp.
await page.mouse.move(r.left + r.w / 2, r.top + r.h / 2);
await page.mouse.down();
await page.mouse.move(1900, r.top + r.h / 2, { steps: 10 });
await page.mouse.up();
await sleep(150);
r = await rectOf();
console.log('at right clamp', r, 'viewport 1920');
await page.screenshot({ path: 'tmp/pf_3_clamped.png' });

await browser.close();
