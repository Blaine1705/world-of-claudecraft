// Live check of the round-5 changes: per-bar vertical toggles while split
// (one combined toggle otherwise), the fixed fit-content vertical bar box,
// the horizontal plus/minus on a vertical bar, the gapless horizontal menu
// rows, per-frame Reset size buttons in the show/hide list, and the options
// Frames tab's new shape (no reset-positions row, no bars note, a Party
// Frame Options subsection).
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5391';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
  s.showSecondaryActionBar = true;
  localStorage.setItem('woc_settings', JSON.stringify(s));
});
await page.goto(URL, { waitUntil: 'domcontentloaded' });
console.log(
  'booted:',
  await enterOfflineGame(page, {
    charClass: 'warrior',
    charName: 'RoundFive',
    gameBootTimeoutMs: 120000,
    settleMs: 5000,
  }),
);

await page.evaluate(() => window.__game.hud.toggleInterfaceUnlock());
await sleep(600);
await page.evaluate(() => document.getElementById('interface-frames-toggle').click());
await sleep(200);

// 1) Split: three per-bar vertical toggles; flip only bar 2.
const toggleLabels = await page.evaluate(() =>
  [
    ...document.querySelectorAll('#interface-frames-menu .frames-menu-settings .frames-menu-row'),
  ].map((r) => r.querySelector('span')?.textContent),
);
check(
  'split bars: three per-bar vertical toggles, no combined one',
  toggleLabels.includes('Vertical Action Bar') &&
    toggleLabels.includes('Vertical Action Bar 2') &&
    toggleLabels.includes('Vertical Action Bar 3') &&
    !toggleLabels.includes('Vertical Action Bars'),
  toggleLabels,
);
const flip = (label) =>
  page.evaluate((text) => {
    const row = [...document.querySelectorAll('#interface-frames-menu .frames-menu-row')].find(
      (r) => r.querySelector('span')?.textContent === text,
    );
    const box = row.querySelector('input');
    box.checked = !box.checked;
    box.dispatchEvent(new Event('change'));
  }, label);
await flip('Vertical Action Bar 2');
await sleep(300);
const split = await page.evaluate(() => ({
  bar1: getComputedStyle(document.getElementById('actionbar')).flexDirection,
  bar2: getComputedStyle(document.getElementById('actionbar2')).flexDirection,
  bar2Width: document.getElementById('actionbar2').getBoundingClientRect().width,
}));
check(
  'flipping only bar 2 makes it a compact column while bar 1 stays a row',
  split.bar1 === 'row' && split.bar2 === 'column' && split.bar2Width < 120,
  split,
);

// 2) Flip bar 1 too: its plus/minus toggle lies horizontal.
await flip('Vertical Action Bar');
await sleep(300);
const toggleDir = await page.evaluate(() => ({
  bar1: getComputedStyle(document.getElementById('actionbar')).flexDirection,
  plusMinus: getComputedStyle(document.querySelector('#actionbar .bar-toggle')).flexDirection,
  bar1Width: document.getElementById('actionbar').getBoundingClientRect().width,
}));
check(
  'a vertical bar 1 keeps its plus/minus side by side and a compact box',
  toggleDir.bar1 === 'column' && toggleDir.plusMinus === 'row' && toggleDir.bar1Width < 120,
  toggleDir,
);
await page.screenshot({ path: 'tmp/round5_vertical_bars.png' });
await flip('Vertical Action Bar');
await flip('Vertical Action Bar 2');
await sleep(200);

// 3) Combined: one toggle drives all three.
await flip('Combine Action Bars');
await sleep(400);
const combinedLabels = await page.evaluate(() =>
  [
    ...document.querySelectorAll('#interface-frames-menu .frames-menu-settings .frames-menu-row'),
  ].map((r) => r.querySelector('span')?.textContent),
);
check(
  'combined: the one Vertical Action Bars toggle replaces the per-bar three',
  combinedLabels.includes('Vertical Action Bars') &&
    !combinedLabels.includes('Vertical Action Bar 2'),
  combinedLabels,
);
await flip('Vertical Action Bars');
await sleep(300);
const combined = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('woc_settings') ?? '{}');
  return {
    keys: [s.actionBar1Vertical, s.actionBar2Vertical, s.actionBar3Vertical],
    group: getComputedStyle(document.getElementById('actionbar-group')).flexDirection,
  };
});
check(
  'the combined toggle writes all three settings and rows the block',
  combined.keys.every(Boolean) && combined.group === 'row',
  combined,
);
await flip('Vertical Action Bars');
await flip('Combine Action Bars');
await sleep(300);

// 4) Horizontal menu: the two rows touch (no gap).
await flip('Horizontal Menu');
await sleep(300);
const rail = await page.evaluate(() => {
  const a = document.getElementById('side-buttons-col-a').getBoundingClientRect();
  const b = document.getElementById('side-buttons-col-b').getBoundingClientRect();
  return {
    gap: getComputedStyle(document.getElementById('side-buttons')).rowGap,
    seam: Math.abs(b.top - a.bottom),
  };
});
check('horizontal menu rows touch (gap 0)', rail.gap === '0px' && rail.seam < 1, rail);
await flip('Horizontal Menu');
await sleep(200);

// 5) Per-frame Reset size: shrink the target frame, then reset via ITS row.
await page.evaluate(() => document.getElementById('interface-frames-toggle').click());
await sleep(150);
const tRect = await page.evaluate(() => {
  const r = document.getElementById('target-frame').getBoundingClientRect();
  return { right: r.right, midY: (r.top + r.bottom) / 2 };
});
await page.mouse.move(tRect.right - 3, tRect.midY);
await page.mouse.down();
await page.mouse.move(tRect.right - 300, tRect.midY, { steps: 6 });
await page.mouse.up();
await sleep(200);
await page.evaluate(() => document.getElementById('interface-frames-toggle').click());
await sleep(200);
const resetInfo = await page.evaluate(async () => {
  const sub = document.querySelector('#interface-frames-menu .frames-menu-sub');
  sub.open = true;
  const wraps = [
    ...document.querySelectorAll('#interface-frames-menu .frames-menu-rows .frames-menu-row-wrap'),
  ];
  const target = wraps.find(
    (w) => w.querySelector('.frames-menu-row span')?.textContent === 'Target',
  );
  const btn = target?.querySelector('.frames-menu-reset');
  const aria = btn?.getAttribute('aria-label');
  btn?.click();
  await new Promise((r) => setTimeout(r, 250));
  const s = JSON.parse(localStorage.getItem('woc_settings') ?? '{}');
  return { aria, width: s.targetFrameWidth, rowCount: wraps.length };
});
check(
  'the Target row carries its own Reset size and restores the stock width',
  resetInfo.aria === 'Target: Reset size' && resetInfo.width === 190 && resetInfo.rowCount > 10,
  resetInfo,
);

// 6) Options Frames tab: no reset-positions row, no bars note, the Party
// Frame Options subsection present.
await page.evaluate(() => window.__game.hud.toggleInterfaceUnlock());
await sleep(300);
await page.evaluate(() => window.__game.hud.toggleOptionsMenu());
await sleep(300);
const framesTab = await page.evaluate(async () => {
  const root = document.getElementById('options-menu');
  [...root.querySelectorAll('button')].find((b) => b.textContent === 'Interface')?.click();
  await new Promise((r) => setTimeout(r, 300));
  [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Frames')?.click();
  await new Promise((r) => setTimeout(r, 300));
  const text = root.textContent ?? '';
  return {
    subhead: !!root.querySelector('.set-subhead'),
    subheadText: root.querySelector('.set-subhead')?.textContent,
    resetPositions: text.includes('Reset Frame Positions'),
    barsNote: text.includes('plus and minus') || text.includes('plus/minus'),
  };
});
check(
  'Frames tab: Party Frame Options subsection, no reset-positions row, no bars note',
  framesTab.subhead &&
    framesTab.subheadText === 'Party Frame Options' &&
    !framesTab.resetPositions &&
    !framesTab.barsNote,
  framesTab,
);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
