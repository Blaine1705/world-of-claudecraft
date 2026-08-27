import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5391';
mkdirSync('tmp', { recursive: true });
const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  protocolTimeout: 120000,
  args: ['--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => {
  const s = JSON.parse(localStorage.getItem('woc_settings') ?? '{}');
  Object.assign(s, {
    playerFrameWidth: 720,
    playerFrameHeight: 24,
    targetFrameWidth: 260,
    targetFrameHeight: 22,
    partyFrameWidth: 220,
    partyFrameHeight: 54,
  });
  localStorage.setItem('woc_settings', JSON.stringify(s));
});
await page.goto(URL, { waitUntil: 'domcontentloaded' });
console.log(
  'booted:',
  await enterOfflineGame(page, {
    charClass: 'warrior',
    charName: 'ShotProbe',
    gameBootTimeoutMs: 90000,
    settleMs: 5000,
  }),
);
await page.evaluate(() => window.__game.hud.toggleInterfaceUnlock());
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: 'tmp/dims_resize_edit.png' });
console.log('shot: tmp/dims_resize_edit.png');
await browser.close();
