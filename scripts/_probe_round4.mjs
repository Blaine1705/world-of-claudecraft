// Live check of the four-feature round: bar 2/3 rows listed while COMBINED,
// the Reset Frame Sizes action, the vertical/horizontal orientation toggles,
// and the movable wishlist reminder with the GitHub/Donate links gone.
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
  s.combineActionBars = true;
  localStorage.setItem('woc_settings', JSON.stringify(s));
});
await page.goto(URL, { waitUntil: 'domcontentloaded' });
console.log(
  'booted:',
  await enterOfflineGame(page, {
    charClass: 'warrior',
    charName: 'RoundProbe',
    gameBootTimeoutMs: 120000,
    settleMs: 5000,
  }),
);

// 4a) The in-game community cluster carries ONLY the wishlist link now.
const community = await page.evaluate(() => {
  const hud = document.getElementById('community-hud');
  return {
    linkCount: hud.querySelectorAll('a').length,
    github: !!hud.querySelector('.community-link.github'),
    donate: !!hud.querySelector('.community-link.donate'),
    wishlist: !!hud.querySelector('.steam-wishlist-chip'),
  };
});
check(
  'community cluster keeps the wishlist link, GitHub and Donate are gone',
  !community.github && !community.donate && community.wishlist && community.linkCount === 1,
  community,
);

await page.evaluate(() => window.__game.hud.toggleInterfaceUnlock());
await sleep(600);
await page.evaluate(() => document.getElementById('interface-frames-toggle').click());
await sleep(200);

// 1) Bar 2/3 rows listed while COMBINED, and ticking bar 2 grows the group.
const rows = await page.evaluate(() => {
  const sub = document.querySelector('#interface-frames-menu .frames-menu-sub');
  sub.open = true;
  return [
    ...document.querySelectorAll('#interface-frames-menu .frames-menu-rows .frames-menu-row'),
  ].map((r) => r.querySelector('span')?.textContent);
});
check(
  'show/hide list carries Action Bar 2 + 3 while combined, and the Wishlist Reminder',
  rows.includes('Action Bar 2') &&
    rows.includes('Action Bar 3') &&
    rows.includes('Wishlist Reminder'),
  rows,
);
const groupBefore = await page.evaluate(
  () => document.getElementById('actionbar-group').getBoundingClientRect().height,
);
await page.evaluate(() => {
  const row = [
    ...document.querySelectorAll('#interface-frames-menu .frames-menu-rows .frames-menu-row'),
  ].find((r) => r.querySelector('span')?.textContent === 'Action Bar 2');
  const box = row.querySelector('input');
  box.checked = true;
  box.dispatchEvent(new Event('change'));
});
await sleep(400);
const groupAfter = await page.evaluate(
  () => document.getElementById('actionbar-group').getBoundingClientRect().height,
);
check(
  'ticking Action Bar 2 while combined grows the combined block',
  groupAfter > groupBefore + 20,
  { before: groupBefore, after: groupAfter },
);

// 2) Reset Frame Sizes: shrink the target frame by drag, then reset.
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
const shrunk = await page.evaluate(
  () => JSON.parse(localStorage.getItem('woc_settings') ?? '{}').targetFrameWidth,
);
await page.evaluate(() => document.getElementById('interface-frames-toggle').click());
await sleep(200);
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('#interface-frames-menu .frames-menu-action')].find(
    (b) => b.textContent === 'Reset Frame Sizes',
  );
  btn.click();
});
await sleep(300);
const afterReset = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('woc_settings') ?? '{}');
  return {
    width: s.targetFrameWidth,
    bars: getComputedStyle(document.querySelector('#target-frame .uf-bars')).width,
  };
});
check(
  'Reset Frame Sizes returns the dragged target width to stock 190',
  shrunk < 150 && afterReset.width === 190 && afterReset.bars === '190px',
  { shrunk, ...afterReset },
);

// 3) Orientation toggles flip the bars and the menu rail live.
const flip = (label) =>
  page.evaluate((text) => {
    const row = [...document.querySelectorAll('#interface-frames-menu .frames-menu-row')].find(
      (r) => r.querySelector('span')?.textContent === text,
    );
    const box = row.querySelector('input');
    box.checked = !box.checked;
    box.dispatchEvent(new Event('change'));
  }, label);
await flip('Vertical Action Bars');
await flip('Horizontal Menu');
await sleep(300);
const orient = await page.evaluate(() => ({
  bar: getComputedStyle(document.getElementById('actionbar')).flexDirection,
  group: getComputedStyle(document.getElementById('actionbar-group')).flexDirection,
  rail: getComputedStyle(document.getElementById('side-buttons')).flexDirection,
  col: getComputedStyle(document.querySelector('.side-buttons-col')).flexDirection,
}));
check(
  'orientation: bars go column (group row), rail goes horizontal',
  orient.bar === 'column' &&
    orient.group === 'row' &&
    orient.rail === 'column' &&
    orient.col === 'row',
  orient,
);
await page.screenshot({ path: 'tmp/round4_vertical.png' });
await flip('Vertical Action Bars');
await flip('Horizontal Menu');
await sleep(200);

// 4b) The wishlist reminder is movable: drag it 200px left and 100 up.
const wl0 = await page.evaluate(() => {
  const r = document.getElementById('community-hud').getBoundingClientRect();
  return { left: r.left, midX: (r.left + r.right) / 2, midY: (r.top + r.bottom) / 2 };
});
await page.mouse.move(wl0.midX, wl0.midY);
await page.mouse.down();
await page.mouse.move(wl0.midX - 200, wl0.midY - 100, { steps: 8 });
await page.mouse.up();
await sleep(250);
const wl1 = await page.evaluate(() => {
  const el = document.getElementById('community-hud');
  return {
    left: el.getBoundingClientRect().left,
    saved: localStorage.getItem('woc_hud_frame_community'),
  };
});
check(
  'the wishlist reminder drags and persists like any HUD frame',
  Math.abs(wl1.left - (wl0.left - 200)) < 3 && !!wl1.saved,
  { from: wl0.left, to: wl1.left, saved: wl1.saved },
);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
