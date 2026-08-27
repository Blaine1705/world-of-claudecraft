// Focused repro: drag the swing bar to the bottom, print its stored payload,
// change the viewport height, and print the payload + rect again.
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
await page.goto(URL, { waitUntil: 'domcontentloaded' });
console.log(
  'booted:',
  await enterOfflineGame(page, {
    charClass: 'warrior',
    charName: 'AnchorDbg',
    gameBootTimeoutMs: 90000,
    settleMs: 5000,
  }),
);
await page.evaluate(() => window.__game.hud.toggleInterfaceUnlock());
await sleep(400);

const snap = (label) =>
  page.evaluate((l) => {
    const el = document.querySelector('#swingbar');
    const r = el.getBoundingClientRect();
    return {
      label: l,
      rect: { left: +r.left.toFixed(1), top: +r.top.toFixed(1), h: +r.height.toFixed(1) },
      stored: localStorage.getItem('woc_hud_frame_swingbar'),
      inline: el.getAttribute('style'),
      inner: { w: window.innerWidth, h: window.innerHeight },
    };
  }, label);

const s0 = await page.evaluate(() => {
  const r = document.querySelector('#swingbar').getBoundingClientRect();
  return { left: r.left, top: r.top, w: r.width, h: r.height };
});
await page.mouse.move(s0.left + s0.w / 2, s0.top + s0.h / 2);
await page.mouse.down();
await page.mouse.move(300 + s0.w / 2, 1000 + s0.h / 2, { steps: 6 });
await page.mouse.up();
await sleep(200);
console.log(JSON.stringify(await snap('after drag @1920x1080'), null, 1));
await page.setViewport({ width: 1920, height: 870 });
await sleep(400);
console.log(JSON.stringify(await snap('after shrink to 870'), null, 1));
await browser.close();
