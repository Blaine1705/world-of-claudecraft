// Repro with the USER'S exact pre-stamp payloads: bars 2/3 at top 845, swing
// and cast bars mid-screen, saved WITHOUT a viewport stamp. Boot at 1920x1080
// (their fullscreen), verify the one-time migration stamps the saves, then
// leave fullscreen (height 870) and verify the bars ride the bottom edge.
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
// The user's legacy saves, verbatim: NO vw/vh stamp.
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('woc_hud_frame_actionbar2', '{"left":1281,"top":845}');
  localStorage.setItem('woc_hud_frame_actionbar3', '{"left":77,"top":845}');
  localStorage.setItem('woc_hud_frame_swingbar', '{"left":840,"top":743}');
  localStorage.setItem('woc_hud_frame_castbar', '{"left":797,"top":711}');
  const s = JSON.parse(localStorage.getItem('woc_settings') ?? '{}');
  s.showSecondaryActionBar = true;
  s.showThirdActionBar = true;
  localStorage.setItem('woc_settings', JSON.stringify(s));
});
await page.goto(URL, { waitUntil: 'domcontentloaded' });
console.log(
  'booted:',
  await enterOfflineGame(page, {
    charClass: 'warrior',
    charName: 'MigrateProbe',
    gameBootTimeoutMs: 90000,
    settleMs: 5000,
  }),
);

const bars = () =>
  page.evaluate(() => {
    const read = (sel) => {
      const r = document.querySelector(sel)?.getBoundingClientRect();
      return r
        ? { top: Math.round(r.top), bottomGap: Math.round(window.innerHeight - r.bottom) }
        : null;
    };
    return {
      bar2: read('#actionbar2'),
      bar3: read('#actionbar3'),
      stored2: localStorage.getItem('woc_hud_frame_actionbar2'),
      inner: window.innerHeight,
    };
  });

const atFull = await bars();
check(
  'boot at 1920x1080 renders the bars at their saved spots',
  atFull.bar2?.top === 845 && atFull.bar3?.top === 845,
  atFull,
);
check(
  'the legacy save was migrated in place (viewport stamp added, spot kept)',
  atFull.stored2 !== null &&
    JSON.parse(atFull.stored2).left === 1281 &&
    JSON.parse(atFull.stored2).vw === 1920 &&
    JSON.parse(atFull.stored2).vh === 1080,
  atFull.stored2,
);

// Leave fullscreen: the window loses 210px of height.
await page.setViewport({ width: 1920, height: 870 });
// Emulated viewport changes update innerWidth/Height but do NOT dispatch a
// resize event (a real window transition always does): dispatch it like the
// real browser would.
await page.evaluate(() => window.dispatchEvent(new Event('resize')));
await sleep(400);
const windowed = await bars();
check(
  'windowed: both bars keep their distance to the BOTTOM edge',
  windowed.bar2?.bottomGap === atFull.bar2?.bottomGap &&
    windowed.bar3?.bottomGap === atFull.bar3?.bottomGap,
  { full: atFull.bar2, windowed: windowed.bar2 },
);

// And back to fullscreen: the exact saved spots return.
await page.setViewport({ width: 1920, height: 1080 });
// Emulated viewport changes update innerWidth/Height but do NOT dispatch a
// resize event (a real window transition always does): dispatch it like the
// real browser would.
await page.evaluate(() => window.dispatchEvent(new Event('resize')));
await sleep(400);
const backFull = await bars();
check(
  'back to fullscreen: the exact saved spots return',
  backFull.bar2?.top === 845 && backFull.bar3?.top === 845,
  backFull,
);

await browser.close();
process.exit(fail > 0 ? 1 : 0);
