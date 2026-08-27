// Diagnose the intermittent no-anchor on viewport change: count resize events,
// record the innerHeight each one observed, and poll the bar rect afterwards.
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
await page.evaluateOnNewDocument(() => {
  localStorage.setItem(
    'woc_hud_frame_actionbar2',
    '{"left":1281,"top":845,"vw":1920,"vh":1080}',
  );
  const s = JSON.parse(localStorage.getItem('woc_settings') ?? '{}');
  s.showSecondaryActionBar = true;
  localStorage.setItem('woc_settings', JSON.stringify(s));
  window.__rzLog = [];
  window.addEventListener('resize', () => {
    window.__rzLog.push(`${window.innerWidth}x${window.innerHeight}`);
  });
});
await page.goto(URL, { waitUntil: 'domcontentloaded' });
console.log(
  'booted:',
  await enterOfflineGame(page, {
    charClass: 'warrior',
    charName: 'RaceProbe',
    gameBootTimeoutMs: 90000,
    settleMs: 5000,
  }),
);
await page.setViewport({ width: 1920, height: 870 });
for (let i = 0; i < 8; i++) {
  await sleep(150);
  const s = await page.evaluate(() => ({
    rz: window.__rzLog,
    inner: `${window.innerWidth}x${window.innerHeight}`,
    top: Math.round(document.querySelector('#actionbar2')?.getBoundingClientRect().top ?? -1),
  }));
  console.log(`t+${(i + 1) * 150}ms`, JSON.stringify(s));
}
await browser.close();
