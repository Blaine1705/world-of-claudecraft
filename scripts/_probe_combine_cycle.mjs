// Probe: the full Combine Action Bars lifecycle through the Frames Settings
// dropdown: ON (combined group + chrome), drag the group, lock, RELOAD (must
// persist), then OFF (bars split back). Needs `npm run dev`.
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
  args: ['--window-size=1920,1080', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1920, height: 1080 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(URL, { waitUntil: 'domcontentloaded' });
console.log(
  'booted:',
  await enterOfflineGame(page, {
    charClass: 'warrior',
    charName: 'CombineProbe',
    gameBootTimeoutMs: 90000,
    settleMs: 5000,
  }),
);

const state = () =>
  page.evaluate(() => {
    const group = document.querySelector('#actionbar-group');
    const r = group?.getBoundingClientRect();
    return {
      combinedClass: document.body.classList.contains('combined-action-bars'),
      setting: JSON.parse(localStorage.getItem('woc_settings') ?? '{}').combineActionBars ?? null,
      groupUnlocked: group?.classList.contains('tf-unlocked') ?? null,
      bar1Unlocked: document.querySelector('#actionbar')?.classList.contains('tf-unlocked'),
      rect: r ? { left: Math.round(r.left), top: Math.round(r.top), w: Math.round(r.width) } : null,
    };
  });

const clickCombine = () =>
  page.evaluate(() => {
    const rows = [
      ...document.querySelectorAll('#interface-frames-menu .frames-menu-settings .frames-menu-row'),
    ];
    rows
      .find((r) => /combine/i.test(r.textContent ?? ''))
      ?.querySelector('input')
      ?.click();
  });

// --- A. Unlock, open dropdown, combine ON.
await page.evaluate(() => window.__game.hud.toggleInterfaceUnlock());
await sleep(300);
await page.click('#interface-frames-toggle');
await sleep(150);
await clickCombine();
await sleep(300);
let s = await state();
check('combine ON: body class + persisted setting', s.combinedClass && s.setting === true, s);
check(
  'combine ON: group gains the unlock chrome, bars lose it',
  s.groupUnlocked === true && s.bar1Unlocked === false,
  s,
);

// --- B. Drag the combined group (grabbed dead center, clear of the 8px
// resize band along each edge) and lock.
const before = s.rect;
const grabY = before.top + 30;
await page.mouse.move(before.left + before.w / 2, grabY);
await page.mouse.down();
await page.mouse.move(before.left + before.w / 2 - 200, grabY - 120, { steps: 8 });
await page.mouse.up();
await sleep(200);
s = await state();
check(
  'combined group drags',
  Math.abs(s.rect.left - (before.left - 200)) < 2 && Math.abs(s.rect.top - (before.top - 120)) < 2,
  s.rect,
);
await page.click('#interface-lock-all');
await sleep(200);

// --- C. Reload: the setting and the dragged spot must survive.
await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
console.log(
  'rebooted:',
  await enterOfflineGame(page, {
    charClass: 'warrior',
    charName: 'CombineProbe',
    gameBootTimeoutMs: 90000,
    settleMs: 5000,
  }),
);
s = await state();
check('after reload: bars still combined', s.combinedClass === true && s.setting === true, s);
check(
  'after reload: dragged spot restored',
  s.rect !== null && Math.abs(s.rect.top - (before.top - 120)) < 8,
  s.rect,
);

// --- D. Combine OFF from the dropdown; bars split back.
await page.evaluate(() => window.__game.hud.toggleInterfaceUnlock());
await sleep(300);
await page.click('#interface-frames-toggle');
await sleep(150);
const checkedBefore = await page.evaluate(() => {
  const rows = [
    ...document.querySelectorAll('#interface-frames-menu .frames-menu-settings .frames-menu-row'),
  ];
  return rows.find((r) => /combine/i.test(r.textContent ?? ''))?.querySelector('input')?.checked;
});
check('dropdown reflects the persisted ON state after reload', checkedBefore === true);
await clickCombine();
await sleep(300);
s = await state();
check(
  'combine OFF: class cleared + setting persisted false',
  !s.combinedClass && s.setting === false,
  s,
);
check(
  'combine OFF: bars regain their own chrome',
  s.bar1Unlocked === true && s.groupUnlocked === false,
  s,
);

await browser.close();
process.exit(fail > 0 ? 1 : 0);
