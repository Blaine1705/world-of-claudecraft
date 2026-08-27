// Focused repro: the user's menu-rail save, toggled 1080 <-> 911 in both
// directions, logging the rail's measured rect each step (its height sits
// near the tall-rule boundary, so the measurement decides the anchor).
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
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.evaluateOnNewDocument(() => {
  localStorage.setItem(
    'woc_hud_frame_side_buttons',
    '{"left":1846.828125,"top":452,"scale":0.9308755760368663,"vw":1920,"vh":1080}',
  );
});
await page.goto(URL, { waitUntil: 'domcontentloaded' });
console.log(
  'booted:',
  await enterOfflineGame(page, {
    charClass: 'warrior',
    charName: 'MenuAnchor',
    gameBootTimeoutMs: 90000,
    settleMs: 5000,
  }),
);

const snap = (label) =>
  page.evaluate((l) => {
    const el = document.querySelector('#side-buttons');
    const r = el.getBoundingClientRect();
    return {
      label: l,
      top: +r.top.toFixed(1),
      h: +r.height.toFixed(1),
      inner: window.innerHeight,
      tallThresholdOfSave: +(1080 * 0.35).toFixed(0),
      stored: localStorage.getItem('woc_hud_frame_side_buttons'),
    };
  }, label);

console.log(JSON.stringify(await snap('boot @1080')));
for (const h of [911, 1080, 911, 1080]) {
  await page.setViewport({ width: 1920, height: h });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await sleep(350);
  console.log(JSON.stringify(await snap(`after resize to ${h}`)));
}
await browser.close();
