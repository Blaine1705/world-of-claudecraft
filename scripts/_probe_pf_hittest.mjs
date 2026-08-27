// Probe 4: hit-test a grid of points across the unlocked player frame and
// report which element (and which registered frame ancestor) would receive a
// pointerdown there. Catches another frame's chrome stealing the grab, the
// failure a rect-tracking drag probe cannot see. Needs `npm run dev`.
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5391';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    charName: 'HitProbe',
    gameBootTimeoutMs: 90000,
    settleMs: 5000,
  }),
);
await page.evaluate(() => window.__game.hud.toggleInterfaceUnlock());
await sleep(300);

const report = await page.evaluate(() => {
  const pf = document.querySelector('#player-frame');
  const r = pf.getBoundingClientRect();
  const rows = [];
  const misses = new Map();
  const GRID_X = 24;
  const GRID_Y = 8;
  for (let iy = 0; iy < GRID_Y; iy++) {
    for (let ix = 0; ix < GRID_X; ix++) {
      const x = r.left + ((ix + 0.5) * r.width) / GRID_X;
      const y = r.top + ((iy + 0.5) * r.height) / GRID_Y;
      const el = document.elementFromPoint(x, y);
      const inPf = el ? pf.contains(el) || el === pf : false;
      if (!inPf) {
        const key = el
          ? `${el.tagName.toLowerCase()}#${el.id || ''}.${el.className?.toString?.().slice(0, 60) || ''}`
          : 'null';
        misses.set(key, (misses.get(key) ?? 0) + 1);
        rows.push({ x: Math.round(x), y: Math.round(y), hit: key });
      }
    }
  }
  return {
    rect: { left: r.left, top: r.top, w: r.width, h: r.height },
    total: GRID_X * GRID_Y,
    missCount: rows.length,
    misses: [...misses.entries()],
    sample: rows.slice(0, 20),
  };
});
console.log(JSON.stringify(report, null, 2));

await browser.close();
