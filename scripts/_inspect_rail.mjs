// Scratch inspector: dump the horizontal menu rail's geometry to find the
// visible gap between the two rows.
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';
const URL = process.env.GAME_URL ?? 'http://localhost:5391';
const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  protocolTimeout: 240000,
  args: ['--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
page.setDefaultNavigationTimeout(180000);
await page.evaluateOnNewDocument(() => {
  const s = JSON.parse(localStorage.getItem('woc_settings') ?? '{}');
  s.menuRailHorizontal = true;
  localStorage.setItem('woc_settings', JSON.stringify(s));
});
await page.goto(URL, { waitUntil: 'domcontentloaded' });
console.log(
  'booted:',
  await enterOfflineGame(page, {
    charClass: 'warrior',
    charName: 'RailPeek',
    gameBootTimeoutMs: 120000,
    settleMs: 5000,
  }),
);
const info = await page.evaluate(() => {
  const dump = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      id: el.id || undefined,
      cls: el.className?.toString().slice(0, 40),
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      h: Math.round(r.height),
      w: Math.round(r.width),
      margin: cs.margin,
      padding: cs.padding,
      alignSelf: cs.alignSelf,
      display: cs.display,
    };
  };
  const rail = document.getElementById('side-buttons');
  return {
    rail: dump(rail),
    children: [...rail.children].map((c) => ({
      ...dump(c),
      alignItems: getComputedStyle(c).alignItems,
      kidCount: c.children.length,
    })),
  };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
