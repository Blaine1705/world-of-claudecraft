// Probe: the round-10 menu changes. Per-tab Reset to Defaults scope, the
// removed UI Scale row, the theme preset dropdown (.ui-dd), and the always-on
// action bar 2/3 rows in the Frames Settings dropdown. Needs `npm run dev`.
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
// Seed off-default values BEFORE the app boots, so the in-memory settings
// store loads them (a post-boot localStorage write would be shadowed).
await page.evaluateOnNewDocument(() => {
  const s = JSON.parse(localStorage.getItem('woc_settings') ?? '{}');
  s.uiScale = 1.15;
  s.stickyTarget = true;
  s.hudOpacity = 0.7;
  localStorage.setItem('woc_settings', JSON.stringify(s));
});
await page.goto(URL, { waitUntil: 'domcontentloaded' });
console.log(
  'booted:',
  await enterOfflineGame(page, {
    charClass: 'warrior',
    charName: 'RoundTen',
    gameBootTimeoutMs: 90000,
    settleMs: 5000,
  }),
);

const clickByText = (sel, text) =>
  page.evaluate(
    ({ sel, text }) => {
      const el = [...document.querySelectorAll(sel)].find((b) =>
        (b.textContent ?? '').trim().toLowerCase().includes(text.toLowerCase()),
      );
      if (el) el.click();
      return !!el;
    },
    { sel, text },
  );
const setting = (key) =>
  page.evaluate((k) => JSON.parse(localStorage.getItem('woc_settings') ?? '{}')[k] ?? null, key);

// Open the options window and the Interface panel.
await page.evaluate(() => window.__game.hud.toggleOptionsMenu());
await sleep(300);
await clickByText('#options-menu .opt-item, #options-menu button', 'interface');
await sleep(300);

// --- General tab: no UI Scale row, theme dropdown present.
const generalState = await page.evaluate(() => {
  const names = [...document.querySelectorAll('#options-menu .set-name')].map((n) =>
    (n.textContent ?? '').trim(),
  );
  return {
    names,
    hasUiScale: names.some((n) => /ui scale/i.test(n)),
    themeDropdowns: document.querySelectorAll('#options-menu .set-row .ui-dd').length,
  };
});
check('General tab: UI Scale row is gone', !generalState.hasUiScale);
check(
  'General tab: theme preset renders as a dropdown',
  generalState.themeDropdowns >= 2,
  generalState.themeDropdowns,
);

// --- Combat tab reset resets ONLY combat keys.
await clickByText('#options-menu .opt-tab', 'combat');
await sleep(250);
await clickByText('#options-menu > button.btn', 'reset to defaults');
await sleep(300);
check(
  'Combat reset clears a combat setting',
  (await setting('stickyTarget')) !== true,
  await setting('stickyTarget'),
);
check(
  'Combat reset leaves General settings alone',
  (await setting('hudOpacity')) === 0.7 && (await setting('uiScale')) === 1.15,
  {
    hudOpacity: await setting('hudOpacity'),
    uiScale: await setting('uiScale'),
  },
);

// --- General tab reset clears uiScale (its off-menu key) + hudOpacity.
await clickByText('#options-menu .opt-tab', 'general');
await sleep(250);
await clickByText('#options-menu > button.btn', 'reset to defaults');
await sleep(300);
check(
  'General reset clears hudOpacity + the retired uiScale',
  (await setting('hudOpacity')) !== 0.7 && (await setting('uiScale')) !== 1.15,
  {
    hudOpacity: await setting('hudOpacity'),
    uiScale: await setting('uiScale'),
  },
);

// Back must still work after tab switches + resets.
await page.click('#options-menu [data-back]');
await sleep(200);
const backWorks = await page.evaluate(
  () => document.querySelector('#options-title')?.textContent ?? '',
);
check('Back still works after per-tab resets', /menu/i.test(backWorks), backWorks);
await page.evaluate(() => window.__game.hud.toggleOptionsMenu());
await sleep(300);

// --- Frames Settings dropdown: bar 2/3 rows always listed while split.
await page.evaluate(() => window.__game.hud.toggleInterfaceUnlock());
await sleep(300);
await page.click('#interface-frames-toggle');
await sleep(150);
const rowsState = () =>
  page.evaluate(() => {
    const rows = [
      ...document.querySelectorAll('#interface-frames-menu .frames-menu-rows .frames-menu-row'),
    ].map((r) => ({
      name: r.querySelector('span')?.textContent,
      checked: r.querySelector('input')?.checked,
    }));
    return {
      rows,
      bar2: rows.find((r) => r.name === 'Action Bar 2'),
      bar3: rows.find((r) => r.name === 'Action Bar 3'),
      bar2Class: document.body.classList.contains('show-actionbar2'),
    };
  });
let rs = await rowsState();
check(
  'bars 2 + 3 listed while split, unticked (disabled)',
  rs.bar2?.checked === false && rs.bar3?.checked === false,
  rs.rows.map((r) => r.name),
);
// Tick bar 2: the bar enables (same path as the plus button).
await page.evaluate(() => {
  const row = [
    ...document.querySelectorAll('#interface-frames-menu .frames-menu-rows .frames-menu-row'),
  ].find((r) => r.querySelector('span')?.textContent === 'Action Bar 2');
  row?.querySelector('input')?.click();
});
await sleep(300);
rs = await rowsState();
check('ticking bar 2 enables it', rs.bar2?.checked === true && rs.bar2Class === true, {
  checked: rs.bar2?.checked,
  bodyClass: rs.bar2Class,
  setting: await setting('showSecondaryActionBar'),
});
// Combine: the bar rows fold away, the group row appears.
await page.evaluate(() => {
  const rows = [
    ...document.querySelectorAll('#interface-frames-menu .frames-menu-settings .frames-menu-row'),
  ];
  rows
    .find((r) => /combine/i.test(r.textContent ?? ''))
    ?.querySelector('input')
    ?.click();
});
await sleep(300);
rs = await rowsState();
check(
  'combined: bar 2/3 rows fold away, the group row remains',
  !rs.bar2 && !rs.bar3 && rs.rows.some((r) => r.name === 'Action Bars'),
  rs.rows.map((r) => r.name),
);
await page.screenshot({ path: 'tmp/round10_frames_menu.png' });

await browser.close();
process.exit(fail > 0 ? 1 : 0);
