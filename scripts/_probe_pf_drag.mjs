// Probe: drag the PLAYER FRAME horizontally and vertically while the interface
// is unlocked, with the target frame and minimap as controls, and report how
// far each frame's rect actually moved versus the pointer travel. Repro rig for
// "the player frame does not drag correctly horizontally". Needs `npm run dev`.
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
const booted = await enterOfflineGame(page, { charClass: 'warrior', charName: 'DragProbe' });
console.log('booted:', booted);

// Unlock the interface through the same public method the options row uses.
await page.evaluate(() => window.__game.hud.toggleInterfaceUnlock());
await sleep(300);

const rectOf = (sel) =>
  page.evaluate((s) => {
    const r = document.querySelector(s)?.getBoundingClientRect();
    return r ? { left: r.left, top: r.top, w: r.width, h: r.height } : null;
  }, sel);

async function drag(sel, grab, dx, dy) {
  const before = await rectOf(sel);
  if (!before) return console.log(`${sel}: MISSING`);
  const gx = before.left + (grab?.x ?? before.w / 2);
  const gy = before.top + (grab?.y ?? before.h / 2);
  await page.mouse.move(gx, gy);
  await page.mouse.down();
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(gx + (dx * i) / steps, gy + (dy * i) / steps);
    await sleep(30);
  }
  await page.mouse.up();
  await sleep(150);
  const after = await rectOf(sel);
  console.log(
    `${sel} drag(${dx},${dy}) grab(${Math.round(gx)},${Math.round(gy)})`,
    `moved(${(after.left - before.left).toFixed(1)},${(after.top - before.top).toFixed(1)})`,
    `before(${before.left.toFixed(1)},${before.top.toFixed(1)} ${before.w.toFixed(0)}x${before.h.toFixed(0)})`,
    `after(${after.left.toFixed(1)},${after.top.toFixed(1)} ${after.w.toFixed(0)}x${after.h.toFixed(0)})`,
  );
  return { before, after };
}

// Player frame: pure horizontal, then pure vertical, then again horizontal
// (post-detach), grabbing the middle of the frame body.
await drag('#player-frame', null, 240, 0);
await drag('#player-frame', null, 0, -160);
await drag('#player-frame', null, -240, 0);
// Controls: the target frame placeholder and the minimap.
await drag('#target-frame', null, 200, 0);
await drag('#minimap-wrap', null, -200, 0);

await browser.close();
