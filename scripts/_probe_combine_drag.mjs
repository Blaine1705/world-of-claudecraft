// Instrumented repro: combine ON, then inspect the group's geometry through a
// center-grab MOVE and a top-edge RESIZE, logging parent/styles at each step.
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
    charName: 'DragProbeC',
    gameBootTimeoutMs: 90000,
    settleMs: 5000,
  }),
);

const snap = (label) =>
  page.evaluate((l) => {
    const g = document.querySelector('#actionbar-group');
    const r = g.getBoundingClientRect();
    const cs = getComputedStyle(g);
    return {
      label: l,
      rect: { left: +r.left.toFixed(1), top: +r.top.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
      parent: g.parentElement?.id || g.parentElement?.tagName,
      pos: cs.position,
      csLeft: cs.left,
      csTop: cs.top,
      margin: cs.margin,
      inline: g.getAttribute('style'),
      detached: g.classList.contains('hud-frame-detached'),
    };
  }, label);

await page.evaluate(() => window.__game.hud.toggleInterfaceUnlock());
await sleep(300);
await page.click('#interface-frames-toggle');
await sleep(150);
await page.evaluate(() => {
  const rows = [
    ...document.querySelectorAll('#interface-frames-menu .frames-menu-settings .frames-menu-row'),
  ];
  rows.find((r) => /combine/i.test(r.textContent ?? ''))?.querySelector('input')?.click();
});
await sleep(300);
console.log(JSON.stringify(await snap('combined, pre-grab'), null, 1));

// MOVE: grab dead center, small horizontal drag.
let r = (await snap('x')).rect;
await page.mouse.move(r.left + r.w / 2, r.top + r.h / 2);
await page.mouse.down();
console.log(JSON.stringify(await snap('after pointerdown (center)'), null, 1));
await page.mouse.move(r.left + r.w / 2 + 10, r.top + r.h / 2);
await sleep(60);
console.log(JSON.stringify(await snap('after +10x move'), null, 1));
await page.mouse.move(r.left + r.w / 2 - 200, r.top + r.h / 2 - 120, { steps: 6 });
await page.mouse.up();
await sleep(150);
console.log(JSON.stringify(await snap('after center drag -200,-120'), null, 1));

// RESIZE: grab the TOP band (the failing shape), drag up 120.
r = (await snap('x')).rect;
await page.mouse.move(r.left + r.w / 2, r.top + 4);
await page.mouse.down();
console.log(JSON.stringify(await snap('after pointerdown (top band)'), null, 1));
await page.mouse.move(r.left + r.w / 2, r.top + 4 - 120, { steps: 6 });
await page.mouse.up();
await sleep(150);
console.log(JSON.stringify(await snap('after north resize -120y'), null, 1));

await browser.close();
