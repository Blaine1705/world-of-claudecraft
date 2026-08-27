// Probe 6: shrink the player frame horizontally (east edge dragged far inward)
// and vertically (south edge) to their floors, then a corner shrink, reporting
// the resulting rect. Expects the FRAME_SCALE_MIN floor: 612 * 0.4 = 244.8 wide.
// Needs `npm run dev`.
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
    charName: 'ShrinkProbe',
    gameBootTimeoutMs: 90000,
    settleMs: 5000,
  }),
);
await page.evaluate(() => window.__game.hud.toggleInterfaceUnlock());
await sleep(300);

const rectOf = () =>
  page.evaluate(() => {
    const el = document.querySelector('#player-frame');
    const r = el.getBoundingClientRect();
    return {
      left: +r.left.toFixed(1),
      top: +r.top.toFixed(1),
      w: +r.width.toFixed(1),
      h: +r.height.toFixed(1),
      transform: el.style.transform,
    };
  });

async function dragEdge(label, fromX, fromY, dx, dy) {
  await page.mouse.move(fromX, fromY);
  await page.mouse.down();
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(fromX + (dx * i) / steps, fromY + (dy * i) / steps);
    await sleep(20);
  }
  await page.mouse.up();
  await sleep(150);
  console.log(label, JSON.stringify(await rectOf()));
}

let r = await rectOf();
console.log('start', JSON.stringify(r));
// East edge dragged far left: horizontal shrink to the floor.
await dragEdge('east shrink -600x ->', r.left + r.w - 4, r.top + r.h / 2, -600, 0);
r = await rectOf();
// South edge dragged far up: vertical shrink to the floor.
await dragEdge('south shrink -200y ->', r.left + r.w / 2, r.top + r.h - 3, 0, -200);
r = await rectOf();
// SE corner outward: proportional grow back from the floors.
await dragEdge('se grow +300x ->', r.left + r.w - 3, r.top + r.h - 3, 300, 300);

await browser.close();
