// Live check of the frames-menu round: the party preview pads to 10 members,
// the Frames Settings dropdown carries the buff/debuff direction toggles and
// the party columns select, the direction toggles flip the aura rows' flex
// direction, and the lowered dimension minimums are reachable by drag.
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
  protocolTimeout: 120000,
  args: ['--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(URL, { waitUntil: 'domcontentloaded' });
console.log(
  'booted:',
  await enterOfflineGame(page, {
    charClass: 'warrior',
    charName: 'MenuProbe',
    gameBootTimeoutMs: 90000,
    settleMs: 5000,
  }),
);

await page.evaluate(() => window.__game.hud.toggleInterfaceUnlock());
await sleep(600);

// 1) The party preview pads to 10 members (offline solo: all 10 are dummies).
const partyRows = await page.evaluate(
  () => document.querySelectorAll('#party-frames .party-frame').length,
);
check('party preview shows 10 members', partyRows === 10, { rows: partyRows });

// 2) The dropdown carries the two direction toggles + the columns select.
await page.evaluate(() => document.getElementById('interface-frames-toggle').click());
await sleep(200);
const menu = await page.evaluate(() => {
  const labels = [
    ...document.querySelectorAll('#interface-frames-menu .frames-menu-settings .frames-menu-row'),
  ].map((row) => row.querySelector('span')?.textContent);
  const select = document.querySelector('#interface-frames-menu .frames-menu-select select');
  return {
    labels,
    selectValue: select?.value,
    selectOptions: select ? [...select.options].map((o) => o.value) : null,
  };
});
check(
  'menu lists the buff/debuff direction toggles',
  menu.labels.includes('Buffs left to right') && menu.labels.includes('Debuffs left to right'),
  menu.labels,
);
check(
  'menu carries the party columns select (1..5, current 1)',
  menu.selectValue === '1' && JSON.stringify(menu.selectOptions) === '["1","2","3","4","5"]',
  menu,
);

// 3) Ticking "Buffs left to right" flips the row's flex direction live.
const dirBefore = await page.evaluate(
  () => getComputedStyle(document.getElementById('buff-bar')).flexDirection,
);
await page.evaluate(() => {
  const row = [...document.querySelectorAll('#interface-frames-menu .frames-menu-row')].find(
    (r) => r.querySelector('span')?.textContent === 'Buffs left to right',
  );
  const box = row.querySelector('input');
  box.checked = true;
  box.dispatchEvent(new Event('change'));
});
await sleep(200);
const dirAfter = await page.evaluate(
  () => getComputedStyle(document.getElementById('buff-bar')).flexDirection,
);
const debuffDir = await page.evaluate(
  () => getComputedStyle(document.getElementById('debuff-bar')).flexDirection,
);
const savedDir = await page.evaluate(
  () => JSON.parse(localStorage.getItem('woc_settings') ?? '{}').buffsLeftToRight,
);
check(
  'buffs toggle flips #buff-bar to row (debuffs stay row-reverse) and persists',
  dirBefore === 'row-reverse' &&
    dirAfter === 'row' &&
    debuffDir === 'row-reverse' &&
    savedDir === true,
  { dirBefore, dirAfter, debuffDir, savedDir },
);

// 4) The columns select drives partyFrameColumns and the preview grid.
await page.evaluate(() => {
  const select = document.querySelector('#interface-frames-menu .frames-menu-select select');
  select.value = '2';
  select.dispatchEvent(new Event('change'));
});
await sleep(200);
const colsState = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#party-frames .party-frame')];
  const tops = new Set(rows.map((r) => Math.round(r.getBoundingClientRect().top)));
  return {
    setting: JSON.parse(localStorage.getItem('woc_settings') ?? '{}').partyFrameColumns,
    rowCount: rows.length,
    distinctTops: tops.size,
  };
});
check(
  'columns select writes partyFrameColumns=2 and the 10 rows fold into 5 grid rows',
  colsState.setting === 2 && colsState.rowCount === 10 && colsState.distinctTops === 5,
  colsState,
);
// Put columns back so the width drag below moves a single-column stack.
await page.evaluate(() => {
  const select = document.querySelector('#interface-frames-menu .frames-menu-select select');
  select.value = '1';
  select.dispatchEvent(new Event('change'));
  document.getElementById('interface-frames-toggle').click();
});
await sleep(200);

// 5) Lowered minimums are reachable: drag the target frame's east edge far
// left; the setting floors at the NEW min (100), below the old 140.
const targetRect = await page.evaluate(() => {
  const r = document.getElementById('target-frame').getBoundingClientRect();
  return { right: r.right, midY: (r.top + r.bottom) / 2 };
});
await page.mouse.move(targetRect.right - 3, targetRect.midY);
await page.mouse.down();
await page.mouse.move(targetRect.right - 400, targetRect.midY, { steps: 8 });
await page.mouse.up();
await sleep(200);
const targetWidth = await page.evaluate(
  () => JSON.parse(localStorage.getItem('woc_settings') ?? '{}').targetFrameWidth,
);
check('target width drags down to the new 100px floor', targetWidth === 100, { targetWidth });

await browser.close();
process.exit(fail > 0 ? 1 : 0);
