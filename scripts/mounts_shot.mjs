// Visual proof of the rideable mounts feature: boots the offline game, levels
// to 20 via the dev sim handle, opens the Mounts window (the stable), picks a
// mount, and screenshots the window plus mounted riders in the world (the
// rigged Valorsteed and the clipless hover cycle).
//   node scripts/mounts_shot.mjs    (needs `npm run dev`; GAME_URL overrides :5173)
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

import { BROWSER_PATH as EDGE } from './browser_path.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5173';
fs.mkdirSync('tmp', { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
const jsClick = (sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) throw new Error(`missing ${s}`);
    el.click();
  }, sel);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(400);
await jsClick('#btn-offline');
await sleep(300);
await page.type('#char-name', 'Rider');
await jsClick('#offline-select .mini-class[data-class="warrior"]');
await jsClick('#btn-start-offline');
await page.waitForFunction(() => window.__game?.sim?.player, { timeout: 40000 });
await sleep(2000);

// Dismiss the new-adventurer tutorial overlay, which otherwise intercepts input.
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) =>
    /skip tutorial/i.test(b.textContent || ''),
  );
  btn?.click();
});
await sleep(400);

// Level past every mount gate, then open the stable (Z with no pick opens it).
await page.evaluate(() => {
  const sim = window.__game.sim;
  sim.setPlayerLevel(20, sim.playerId);
});
await sleep(300);
await page.keyboard.press('z');
await sleep(600);
await page.screenshot({ path: 'tmp/mounts_window.png' });
console.log('mounts window: tmp/mounts_window.png');

// Pick the base horse and ride it (Z now toggles the mount).
await page.evaluate(() => {
  window.__game.sim.selectMount('valorsteed');
});
await sleep(300);
await page.keyboard.press('Escape');
await sleep(300);
await page.keyboard.press('z');
await sleep(1200); // lazy mount GLB fetch + visual build
// A short run so the shot shows the gallop clip mid-stride.
await page.keyboard.down('w');
await sleep(900);
await page.screenshot({ path: 'tmp/mounts_valorsteed_run.png' });
await page.keyboard.up('w');
console.log('valorsteed: tmp/mounts_valorsteed_run.png');
console.log(
  'state:',
  await page.evaluate(() => {
    const sim = window.__game.sim;
    return {
      selected: sim.selectedMount(),
      mountKey: sim.player.mountKey,
      speedMult: Math.round(sim.moveSpeedMult(sim.player) * 100) / 100,
    };
  }),
);

// Swap live onto the epic Lunar Cheshire, then the clipless hover cycle.
await page.evaluate(() => {
  window.__game.sim.selectMount('lunar_cheshire');
});
await sleep(1200);
await page.screenshot({ path: 'tmp/mounts_cheshire.png' });
console.log('lunar cheshire: tmp/mounts_cheshire.png');

await page.evaluate(() => {
  window.__game.sim.selectMount('aether_hover_cycle');
});
await sleep(1200);
await page.screenshot({ path: 'tmp/mounts_hover_cycle.png' });
console.log('hover cycle: tmp/mounts_hover_cycle.png');

await browser.close();
