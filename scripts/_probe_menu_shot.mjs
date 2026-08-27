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
await page.goto(URL, { waitUntil: 'domcontentloaded' });
console.log(
  'booted:',
  await enterOfflineGame(page, {
    charClass: 'warrior',
    charName: 'MenuShotB',
    gameBootTimeoutMs: 90000,
    settleMs: 5000,
  }),
);
await page.evaluate(() => window.__game.hud.toggleInterfaceUnlock());
await new Promise((r) => setTimeout(r, 1200));
// Close the Esc game menu if anything opened it, then open the frames dropdown.
await page.evaluate(() => {
  for (const btn of document.querySelectorAll('button')) {
    if (/return to game/i.test(btn.textContent ?? '')) {
      btn.click();
      break;
    }
  }
});
await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => document.getElementById('interface-frames-toggle').click());
await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => {
  for (const btn of document.querySelectorAll('button')) {
    if (/return to game/i.test(btn.textContent ?? '')) {
      btn.click();
      break;
    }
  }
});
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: 'tmp/frames_menu_round.png' });
console.log('shot: tmp/frames_menu_round.png');
await browser.close();
