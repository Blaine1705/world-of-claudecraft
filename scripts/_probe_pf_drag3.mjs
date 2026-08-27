// Probe 2: player-frame horizontal behaviors that a plain center-grab drag
// does not cover: an east-edge stretch, a drag AFTER the stretch, grabs near
// the frame's left and right ends, and a west-edge resize. Needs `npm run dev`.
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
await page.evaluateOnNewDocument(() => { try { const s = JSON.parse(localStorage.getItem('woc_settings') ?? '{}'); s.uiScale = 1.25; localStorage.setItem('woc_settings', JSON.stringify(s)); } catch {} });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(URL, { waitUntil: 'domcontentloaded' });
console.log('booted:', await enterOfflineGame(page, { charClass: 'warrior', charName: 'DragProbe' }));
await page.evaluate(() => window.__game.hud.toggleInterfaceUnlock());
await sleep(300);

const SEL = '#player-frame';
const rectOf = () =>
  page.evaluate((s) => {
    const r = document.querySelector(s)?.getBoundingClientRect();
    const el = document.querySelector(s);
    return r
      ? {
          left: +r.left.toFixed(1),
          top: +r.top.toFixed(1),
          w: +r.width.toFixed(1),
          h: +r.height.toFixed(1),
          transform: el.style.transform,
          cursor: el.style.cursor,
        }
      : null;
  }, SEL);

async function gesture(label, fromX, fromY, dx, dy) {
  const before = await rectOf();
  await page.mouse.move(fromX, fromY);
  await sleep(60);
  const hover = (await rectOf()).cursor;
  await page.mouse.down();
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(fromX + (dx * i) / steps, fromY + (dy * i) / steps);
    await sleep(25);
  }
  await page.mouse.up();
  await sleep(150);
  const after = await rectOf();
  console.log(
    label,
    `hoverCursor='${hover}'`,
    `moved(${(after.left - before.left).toFixed(1)},${(after.top - before.top).toFixed(1)})`,
    `size ${before.w}x${before.h} -> ${after.w}x${after.h}`,
    `tf '${after.transform}'`,
  );
  return { before, after };
}

let r = await rectOf();
console.log('start', r);
// 1. Grab near the LEFT end of the frame body (x = left+30, outside the 8px band).
await gesture('left-end grab drag +200x', r.left + 30, r.top + r.h / 2, 200, 0);
r = await rectOf();
// 2. Grab near the RIGHT end (x = right-30).
await gesture('right-end grab drag -200x', r.left + r.w - 30, r.top + r.h / 2, -200, 0);
r = await rectOf();
// 3. East-edge stretch +153 (expect scaleX 1.25, width 765).
await gesture('east-edge stretch +153x', r.left + r.w - 4, r.top + r.h / 2, 153, 0);
r = await rectOf();
// 4. Drag horizontally AFTER the stretch, grabbing the center.
await gesture('post-stretch drag +150x', r.left + r.w / 2, r.top + r.h / 2, 150, 0);
r = await rectOf();
// 5. West-edge resize -100 (expect width to grow, right border anchored).
await gesture('west-edge stretch -100x', r.left + 4, r.top + r.h / 2, -100, 0);
r = await rectOf();
// 6. Drag once more.
await gesture('final drag -100x', r.left + r.w / 2, r.top + r.h / 2, -100, 0);

await browser.close();
