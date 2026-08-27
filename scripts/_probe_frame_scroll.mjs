// Mechanical check of the Fancy Gold frame containment: force a window to
// scroll and prove (a) scrolling works with the 14px frame border, (b) the
// scrolled CONTENT clips at the padding box and can never paint on the frame
// band (hit-testing the band finds the window itself, not a child), (c) any
// scrollbar renders inside the border box's padding area by construction
// (overlay scrollbars on this platform take zero layout width).
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5391';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync('tmp', { recursive: true });
let fail = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` ${JSON.stringify(extra)}` : ''}`);
  if (!cond) fail += 1;
};
const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  protocolTimeout: 240000,
  args: ['--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
page.setDefaultNavigationTimeout(180000);
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.evaluateOnNewDocument(() => {
  const s = JSON.parse(localStorage.getItem('woc_settings') ?? '{}');
  s.graphicsPreset = 4;
  s.graphicsDefaultApplied = true;
  localStorage.setItem('woc_settings', JSON.stringify(s));
  localStorage.setItem('woc_theme', JSON.stringify({ preset: 'fancyGold', custom: {} }));
});
await page.goto(URL, { waitUntil: 'domcontentloaded' });
console.log(
  'booted:',
  await enterOfflineGame(page, {
    charClass: 'warrior',
    charName: 'ScrollProbe',
    gameBootTimeoutMs: 120000,
    settleMs: 5000,
  }),
);
await page.evaluate(() => window.__game.hud.toggleBags());
await sleep(400);
const state = await page.evaluate(() => {
  const el = document.getElementById('bags');
  const probe = document.createElement('div');
  probe.id = 'frame-probe-content';
  probe.style.height = '1200px';
  probe.style.flex = 'none';
  probe.style.width = '100%';
  probe.style.background = '#f0f';
  el.appendChild(probe);
  el.scrollTop = 300;
  const rect = el.getBoundingClientRect();
  const midY = (rect.top + rect.bottom) / 2;
  // Hit-test points ON the frame band (inside the 14px border, outside the
  // padding box): left band, right band (where a scrollbar would overreach),
  // and the bottom band. Children are clipped at the padding box, so the
  // topmost element there must be the window itself, never the probe child.
  const hits = [
    [rect.left + 6, midY],
    [rect.right - 6, midY],
    [(rect.left + rect.right) / 2, rect.bottom - 6],
  ].map(
    ([x, y]) =>
      document.elementFromPoint(x, y)?.id ?? document.elementFromPoint(x, y)?.className ?? 'none',
  );
  return {
    scrolls: el.scrollHeight > el.clientHeight,
    scrollTop: el.scrollTop,
    borderRight: getComputedStyle(el).borderRightWidth,
    hits,
  };
});
check(
  'the window scrolls with the frame border on',
  state.scrolls && state.scrollTop === 300 && state.borderRight === '14px',
  state,
);
check(
  'the frame band never hit-tests to scrolled content (clipped at the padding box)',
  state.hits.includes('bags') && !state.hits.includes('frame-probe-content'),
  state.hits,
);
await page.screenshot({ path: 'tmp/frame_scroll.png' });
console.log('shot: tmp/frame_scroll.png');
await browser.close();
process.exit(fail > 0 ? 1 : 0);
