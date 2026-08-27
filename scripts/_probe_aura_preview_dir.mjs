// The edit-mode aura samples mirror the live bars: default reads right to
// left (first sample icon rightmost, row packed against the box's right end),
// and the buffsLeftToRight toggle flips the SAMPLE the same moment it flips
// the live bar's flex direction.
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
    charName: 'AuraDirProbe',
    gameBootTimeoutMs: 120000,
    settleMs: 5000,
  }),
);
await page.evaluate(() => window.__game.hud.toggleInterfaceUnlock());
await sleep(600);

const measure = () =>
  page.evaluate(() => {
    const read = (barId) => {
      const bar = document.getElementById(barId);
      const row = bar.querySelector('.tf-preview-auras');
      const icons = [...row.querySelectorAll('.tf-preview-icon')].map(
        (el) => el.getBoundingClientRect().left,
      );
      const barRect = bar.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      return {
        firstIsRightmost: icons[0] === Math.max(...icons),
        firstIsLeftmost: icons[0] === Math.min(...icons),
        // Packed against which end of the box? Compare slack on each side.
        hugsRight: barRect.right - Math.max(...icons) - 24 < Math.min(...icons) - barRect.left,
        count: icons.length,
        rowDir: getComputedStyle(row).flexDirection,
      };
    };
    return { buffs: read('buff-bar'), debuffs: read('debuff-bar') };
  });

// 1) Default: both samples read right to left, packed right, like the live bars.
const def = await measure();
check(
  'default: buff sample reads right to left, packed against the right end',
  def.buffs.firstIsRightmost && def.buffs.hugsRight && def.buffs.rowDir === 'row-reverse',
  def.buffs,
);
check(
  'default: debuff sample reads right to left too',
  def.debuffs.firstIsRightmost && def.debuffs.hugsRight && def.debuffs.rowDir === 'row-reverse',
  def.debuffs,
);

// 2) Toggle Buffs left to right in the menu: the BUFF sample flips live, the
// debuff sample stays.
await page.evaluate(() => document.getElementById('interface-frames-toggle').click());
await sleep(200);
await page.evaluate(() => {
  const row = [...document.querySelectorAll('#interface-frames-menu .frames-menu-row')].find(
    (r) => r.querySelector('span')?.textContent === 'Buffs left to right',
  );
  const box = row.querySelector('input');
  box.checked = true;
  box.dispatchEvent(new Event('change'));
});
await sleep(300);
const flipped = await measure();
check(
  'buffs toggle flips the buff SAMPLE to left-to-right while the live bar var flips',
  flipped.buffs.firstIsLeftmost && flipped.buffs.rowDir === 'row',
  flipped.buffs,
);
check(
  'the debuff sample keeps the stock right-to-left read',
  flipped.debuffs.firstIsRightmost && flipped.debuffs.rowDir === 'row-reverse',
  flipped.debuffs,
);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
