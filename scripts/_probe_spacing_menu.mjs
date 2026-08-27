// The Frames Settings dropdown carries the party Frame Spacing picker (moved
// out of the options window): 0..12 whole px, current value selected, and a
// change drives --party-frame-spacing so the preview rows' gap moves live.
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
await page.goto(URL, { waitUntil: 'domcontentloaded' });
console.log(
  'booted:',
  await enterOfflineGame(page, {
    charClass: 'warrior',
    charName: 'SpacingProbe',
    gameBootTimeoutMs: 120000,
    settleMs: 5000,
  }),
);
await page.evaluate(() => window.__game.hud.toggleInterfaceUnlock());
await sleep(600);
await page.evaluate(() => document.getElementById('interface-frames-toggle').click());
await sleep(200);

const menu = await page.evaluate(() => {
  const selects = [...document.querySelectorAll('#interface-frames-menu .frames-menu-select')].map(
    (row) => ({
      label: row.querySelector('span')?.textContent,
      value: row.querySelector('select')?.value,
      options: [...row.querySelector('select').options].map((o) => o.value),
    }),
  );
  return selects;
});
const spacing = menu.find((s) => s.label === 'Frame Spacing');
check(
  'menu lists Frame Spacing (0..12, current 4) beside Raid Columns',
  menu.some((s) => s.label === 'Raid Columns') &&
    spacing?.value === '4' &&
    spacing.options.length === 13 &&
    spacing.options[0] === '0' &&
    spacing.options[12] === '12',
  menu,
);

const gapBefore = await page.evaluate(
  () =>
    document.querySelectorAll('#party-frames .party-frame')[1].getBoundingClientRect().top -
    document.querySelectorAll('#party-frames .party-frame')[0].getBoundingClientRect().bottom,
);
await page.evaluate(() => {
  const row = [...document.querySelectorAll('#interface-frames-menu .frames-menu-select')].find(
    (r) => r.querySelector('span')?.textContent === 'Frame Spacing',
  );
  const select = row.querySelector('select');
  select.value = '12';
  select.dispatchEvent(new Event('change'));
});
await sleep(300);
const after = await page.evaluate(() => ({
  gap:
    document.querySelectorAll('#party-frames .party-frame')[1].getBoundingClientRect().top -
    document.querySelectorAll('#party-frames .party-frame')[0].getBoundingClientRect().bottom,
  setting: JSON.parse(localStorage.getItem('woc_settings') ?? '{}').partyFrameSpacing,
  cssVar: getComputedStyle(document.documentElement)
    .getPropertyValue('--party-frame-spacing')
    .trim(),
}));
check(
  'picking 12 writes the setting, the CSS var, and widens the preview row gap live',
  after.setting === 12 && after.cssVar === '12px' && after.gap > gapBefore + 6,
  { gapBefore, ...after },
);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
