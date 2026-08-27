// The Fancy Gold frame contract: 14px transparent frame border (content and
// scrollbar clip INSIDE it), 22px interior padding, ornament anchored to the
// border box, scrollbar inset past the frame band on a genuinely scrolling
// window.
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
    charName: 'FrameProbe',
    gameBootTimeoutMs: 120000,
    settleMs: 5000,
  }),
);

// The spellbook scrolls; open it and measure the frame contract.
await page.setViewport({ width: 1600, height: 560 });
await page.evaluate(() => window.dispatchEvent(new Event('resize')));
await sleep(400);
await page.evaluate(() => window.__game.hud.toggleDeeds());
await sleep(500);
const state = await page.evaluate(() => {
  const el = document.getElementById('deeds-window');
  const cs = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  // A child at the content's right edge: does anything paint past the
  // padding box (i.e. onto the frame band)?
  const scrolls = el.scrollHeight > el.clientHeight;
  return {
    borderWidth: cs.borderTopWidth,
    padding: cs.paddingTop,
    origin: cs.backgroundOrigin,
    radius: cs.borderRadius,
    scrolls,
    // clientWidth excludes the scrollbar AND the border: the scrollbar band
    // lives between clientWidth and (width - borders), i.e. inside the frame.
    scrollbarInset:
      rect.width -
      Number.parseFloat(cs.borderLeftWidth) -
      Number.parseFloat(cs.borderRightWidth) -
      el.clientWidth,
    svgLayers: (cs.backgroundImage.match(/data:image\/svg\+xml/g) ?? []).length,
  };
});
check(
  'spellbook wears the frame border (14px) with 22px interior padding, ornament on the border box',
  state.borderWidth === '14px' && state.padding === '22px' && state.origin.includes('border-box'),
  state,
);
check(
  'the window scrolls and its scrollbar sits INSIDE the frame band',
  state.scrolls && state.scrollbarInset > 0,
  { scrolls: state.scrolls, scrollbarInset: state.scrollbarInset },
);
check('the 12 frame layers are painting', state.svgLayers === 12, state.svgLayers);
// Scroll to the middle so the shot shows content clipped inside the frame.
await page.evaluate(() => {
  document.getElementById('deeds-window').scrollTop = 200;
});
await sleep(300);
await page.screenshot({ path: 'tmp/frame_contract.png' });
console.log('shot: tmp/frame_contract.png');

await browser.close();
process.exit(fail > 0 ? 1 : 0);
