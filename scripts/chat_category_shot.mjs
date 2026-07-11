// One-off screenshot of the new All-view chat category filter strip (issue
// #1670), for the PR body. Not wired into CI; run manually against a local
// `npm run dev`. Not part of the shipped diff (repo instructions ask for
// before/after screenshots, this generates them).
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { enterOfflineGame } from './enter_offline_game.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5185';
const OUT = process.env.SHOTS_DIR ?? 'docs/screenshots';
fs.mkdirSync(OUT, { recursive: true });

const { BROWSER_PATH } = await import('./browser_path.mjs');

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  args: ['--window-size=1200,800', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1200, height: 800 },
});

try {
  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await enterOfflineGame(page, { settleMs: 2000 });
  // Skip the spawn cinematic (it hides #ui, the whole HUD chrome, until it
  // finishes or is skipped via Escape).
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 500));

  // Seed a few lines across categories so the strip has something to show/hide.
  await page.evaluate(() => {
    const hud = window.__game?.hud;
    if (!hud) return;
    hud.log('You loot [[i:iron_ore]].', '#7fdc4f', 'loot');
    hud.log('You gain 42 experience.', '#a980d8', 'xp');
    hud.log('Quest updated: Forest Wolf slain (3/8)', '#dcd29f', 'quest');
    hud.log('The Ashen Coliseum: your match has been found!', '#ffa040', 'event');
    hud.log('Welcome to Sowfield Hollow.', '#ffd100', 'game');
  });
  await new Promise((r) => setTimeout(r, 300));

  await page.screenshot({ path: `${OUT}/chat-category-strip-all.png` });

  // Hide Loot + XP to show the strip actually thins the All view.
  await page.evaluate(() => {
    const strip = document.getElementById('chat-category-strip');
    const buttons = [...strip.querySelectorAll('.chat-category-toggle')];
    for (const b of buttons) if (b.dataset.cat === 'loot' || b.dataset.cat === 'xp') b.click();
  });
  await new Promise((r) => setTimeout(r, 200));
  await page.screenshot({ path: `${OUT}/chat-category-strip-filtered.png` });

  console.log(`wrote ${OUT}/chat-category-strip-all.png and chat-category-strip-filtered.png`);
} finally {
  await browser.close();
}
