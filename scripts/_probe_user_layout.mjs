// Repro with the user's CURRENT (stamped) layout export, verbatim: boot at
// their windowed 1920x911, go to fullscreen 1080, and verify the top-right
// cluster (minimap, buffs, debuffs, menu) stays EXACTLY still while the
// bottom cluster (bars 2/3, swing, cast, chat) rides the bottom edge; then
// back to 911 restores every frame exactly.
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
  args: ['--window-size=1920,911', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1920, height: 911 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.evaluateOnNewDocument(() => {
  const entries = {
    woc_hud_frame_debuffbar: '{"left":1677,"top":401.5,"vw":1920,"vh":911}',
    woc_hud_frame_actionbar2: '{"left":1284,"top":845,"vw":1920,"vh":911}',
    woc_hud_frame_minimap:
      '{"left":1683.3565673828125,"top":8,"scale":1.3449612403100775,"vw":1920,"vh":911}',
    woc_party_frame_pos:
      '{"left":153,"top":301,"scaleX":1.3153846153846154,"scaleY":1.425,"vw":1920,"vh":911}',
    woc_hud_frame_swingbar: '{"left":871,"top":743.5,"vw":1920,"vh":911}',
    woc_hud_frame_castbar:
      '{"left":825,"top":706.5,"scaleX":1,"scaleY":0.9583333333333334,"vw":1920,"vh":911}',
    woc_hud_frame_side_buttons:
      '{"left":1846.828125,"top":452,"scale":0.9308755760368663,"vw":1920,"vh":1080}',
    woc_hud_frame_actionbar3: '{"left":73,"top":843,"vw":1920,"vh":911}',
    woc_chat_geometry: '{"left":8,"top":631.5,"width":370,"height":184,"vw":1920,"vh":911}',
    woc_hud_frame_buffbar: '{"left":1677,"top":365.5,"vw":1920,"vh":911}',
    woc_hud_frame_stancebar_hidden: '1',
    woc_hud_frame_xpbar_hidden: '1',
  };
  for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
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
    charName: 'LayoutProbe',
    gameBootTimeoutMs: 90000,
    settleMs: 5000,
  }),
);

const SELS = {
  minimap: '#minimap-wrap',
  buffs: '#buff-bar',
  debuffs: '#debuff-bar',
  menu: '#side-buttons',
  bar2: '#actionbar2',
  bar3: '#actionbar3',
  swing: '#swingbar',
  cast: '#castbar',
  chat: '#chatlog-wrap',
};
const snap = () =>
  page.evaluate((sels) => {
    const out = { inner: window.innerHeight };
    for (const [k, sel] of Object.entries(sels)) {
      const el = document.querySelector(sel);
      const r = el?.getBoundingClientRect();
      out[k] = r
        ? {
            top: +r.top.toFixed(1),
            bottomGap: +(window.innerHeight - r.bottom).toFixed(1),
            // Hidden frames (the idle swing/cast bars while locked) have a
            // zero rect; their applied position still lives in the inline top.
            styleTop: Number.parseFloat(el.style.top || 'NaN'),
            hidden: r.height === 0,
          }
        : null;
    }
    return out;
  }, SELS);

const w0 = await snap();
check(
  'boot at 1920x911: every frame at its saved spot',
  w0.minimap?.top === 8 &&
    w0.buffs?.top === 365.5 &&
    w0.debuffs?.top === 401.5 &&
    w0.bar2?.top === 845,
  { minimap: w0.minimap?.top, buffs: w0.buffs?.top, bar2: w0.bar2?.top },
);

// Fullscreen: +169px of height.
await page.setViewport({ width: 1920, height: 1080 });
await page.evaluate(() => window.dispatchEvent(new Event('resize')));
await sleep(400);
const full = await snap();
check(
  'fullscreen: the top-right cluster does NOT move',
  full.minimap?.top === 8 && full.buffs?.top === 365.5 && full.debuffs?.top === 401.5,
  { minimap: full.minimap?.top, buffs: full.buffs?.top, debuffs: full.debuffs?.top },
);
// The tall menu rail's lower end is its nearest edge, so it rides the BOTTOM
// (owner report: pinning its top floated it to mid-screen in fullscreen).
check(
  'fullscreen: the menu rail keeps its bottom gap',
  full.menu?.bottomGap === w0.menu?.bottomGap,
  {
    windowed: w0.menu,
    fullscreen: full.menu,
  },
);
const HEIGHT_DELTA = 1080 - 911;
check(
  'fullscreen: the bottom cluster rides the bottom edge (gaps preserved)',
  full.bar2?.bottomGap === w0.bar2?.bottomGap &&
    full.bar3?.bottomGap === w0.bar3?.bottomGap &&
    full.chat?.bottomGap === w0.chat?.bottomGap &&
    // The idle swing/cast bars are hidden while locked (zero rect), so their
    // bottom-anchoring shows in the applied inline top instead.
    full.swing?.styleTop === w0.swing?.styleTop + HEIGHT_DELTA &&
    full.cast?.styleTop === w0.cast?.styleTop + HEIGHT_DELTA,
  {
    bar2: [w0.bar2?.bottomGap, full.bar2?.bottomGap],
    swingTop: [w0.swing?.styleTop, full.swing?.styleTop],
    castTop: [w0.cast?.styleTop, full.cast?.styleTop],
    chat: [w0.chat?.bottomGap, full.chat?.bottomGap],
  },
);

// Back to windowed: everything returns exactly.
await page.setViewport({ width: 1920, height: 911 });
await page.evaluate(() => window.dispatchEvent(new Event('resize')));
await sleep(400);
const w1 = await snap();
const same = Object.keys(SELS).every((k) =>
  w1[k]?.hidden
    ? w1[k]?.styleTop === w0[k]?.styleTop
    : w1[k]?.top === w0[k]?.top && w1[k]?.bottomGap === w0[k]?.bottomGap,
);
check('back to 911: every frame returns exactly', same, {
  before: { buffs: w0.buffs, bar2: w0.bar2 },
  after: { buffs: w1.buffs, bar2: w1.bar2 },
});

await browser.close();
process.exit(fail > 0 ? 1 : 0);
