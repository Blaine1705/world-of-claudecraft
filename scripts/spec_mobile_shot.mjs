// Mobile screenshots of the Specialization tab (talents window) in portrait and
// landscape, to verify the stacked-panel mobile layout. Needs `npm run dev`.
// Writes PNGs to tmp/. Warrior only (spec cards are authored for warrior).

import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

import { BROWSER_PATH as EDGE } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';

const URL = (process.env.GAME_URL ?? 'http://localhost:5173') + '/?gfx=ultra';
fs.mkdirSync('tmp', { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({
  width: 390,
  height: 844,
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
const cdp = await page.target().createCDPSession();
await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'coarse' }] });

const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`);
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tap = (sel) => page.evaluate((s) => document.querySelector(s)?.click(), sel);

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
await enterOfflineGame(page, { charClass: 'warrior', charName: 'Bladus' });
await page
  .waitForSelector('#mobile-preflight-continue', { visible: true, timeout: 10000 })
  .catch(() => {});
await tap('#mobile-preflight-continue');
await page.waitForFunction(() => window.__game?.sim?.player, { timeout: 30000 });
await wait(1200);

// Level 20 so the talent economy is fully unlocked, god-mode so mobs don't kill us.
await page.evaluate(() => {
  const p = window.__game.sim.player;
  p.maxHp = 99999;
  p.hp = 99999;
  p.level = 20;
});
await tap('.tut-skip');
await wait(300);

const openSpecTab = async () => {
  await page.evaluate(() => window.__game.hud.toggleTalents());
  await wait(400);
  await tap('.tal-tab[data-tab="spec"]');
  await wait(500);
};

// Portrait.
await openSpecTab();
await page.screenshot({ path: 'tmp/spec_mobile_portrait.png' });
// Close before rotating.
await page.evaluate(() => window.__game.hud.toggleTalents());
await wait(300);

// Landscape.
await page.setViewport({
  width: 844,
  height: 390,
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
await wait(400);
await openSpecTab();
await page.screenshot({ path: 'tmp/spec_mobile_landscape.png' });

if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
console.log('wrote tmp/spec_mobile_portrait.png and tmp/spec_mobile_landscape.png');
await browser.close();
