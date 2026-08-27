// Live check of the round-6 tweaks: the options Frames tab's Frame Layout
// row sits ABOVE the Party Frame Options subsection, and the horizontal
// menu strip packs its buttons flush (no per-item gap, rows touching).
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
  s.menuRailHorizontal = true;
  localStorage.setItem('woc_settings', JSON.stringify(s));
});
await page.goto(URL, { waitUntil: 'domcontentloaded' });
console.log(
  'booted:',
  await enterOfflineGame(page, {
    charClass: 'warrior',
    charName: 'RoundSix',
    gameBootTimeoutMs: 120000,
    settleMs: 5000,
  }),
);

// 1) Horizontal menu: zero gap inside each row, rows touching, buttons flush.
const rail = await page.evaluate(() => {
  const cols = [...document.querySelectorAll('#side-buttons .side-buttons-col')];
  const seams = [];
  for (const col of cols) {
    const kids = [...col.children].filter((k) => k.offsetParent !== null);
    for (let i = 1; i < kids.length; i++) {
      seams.push(
        Math.round(
          (kids[i].getBoundingClientRect().left - kids[i - 1].getBoundingClientRect().right) * 10,
        ) / 10,
      );
    }
  }
  const a = document.getElementById('side-buttons-col-a').getBoundingClientRect();
  const b = document.getElementById('side-buttons-col-b').getBoundingClientRect();
  // The BUTTON bands, not just the containers: a tall child (the daily
  // rewards chest) once inflated its row, floating the row's top edge 30px
  // above its own 30px buttons while the container seam still measured 0.
  const band = (col) => {
    const kids = [...col.children].filter((k) => k.offsetParent !== null);
    return {
      top: Math.min(...kids.map((k) => k.getBoundingClientRect().top)),
      bottom: Math.max(...kids.map((k) => k.getBoundingClientRect().bottom)),
    };
  };
  const bandA = band(document.getElementById('side-buttons-col-a'));
  const bandB = band(document.getElementById('side-buttons-col-b'));
  return {
    colGaps: [...new Set(cols.map((c) => getComputedStyle(c).columnGap))],
    maxSeam: Math.max(...seams),
    rowSeam: Math.abs(b.top - a.bottom),
    bandSeam: bandB.top - bandA.bottom,
  };
});
check(
  'horizontal menu buttons pack flush: no per-item gap, button rows touch',
  rail.colGaps.every((g) => g === '0px' || g === 'normal') &&
    rail.maxSeam <= 0 &&
    rail.rowSeam < 1 &&
    rail.bandSeam <= 0,
  rail,
);
await page.screenshot({ path: 'tmp/round6_horizontal_menu.png' });

// 2) Options Frames tab: Frame Layout row above the Party Frame Options subhead.
await page.evaluate(() => window.__game.hud.toggleOptionsMenu());
await sleep(300);
const order = await page.evaluate(async () => {
  const root = document.getElementById('options-menu');
  [...root.querySelectorAll('button')].find((b) => b.textContent === 'Interface')?.click();
  await new Promise((r) => setTimeout(r, 300));
  [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Frames')?.click();
  await new Promise((r) => setTimeout(r, 300));
  const sub = root.querySelector('.set-subhead');
  const layoutName = [...root.querySelectorAll('.set-row .set-name')].find(
    (n) => n.textContent === 'Frame Layout',
  );
  const row = layoutName?.closest('.set-row');
  return {
    subheadText: sub?.textContent,
    layoutFound: !!row,
    layoutAboveSubhead:
      !!row && !!sub && !!(row.compareDocumentPosition(sub) & Node.DOCUMENT_POSITION_FOLLOWING),
  };
});
check(
  'Frame Layout export/import row sits above the Party Frame Options subsection',
  order.layoutFound && order.subheadText === 'Party Frame Options' && order.layoutAboveSubhead,
  order,
);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
