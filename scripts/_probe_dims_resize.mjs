// Live check of resizeMode 'dimensions' (PR #3284): edge drags on the party,
// player, and target frames in the interface editor write the real settings
// (partyFrameWidth/Height, playerFrameWidth/Height, targetFrameWidth/Height)
// the way the raid-frame sliders work, so contents reflow at crisp text
// instead of transform-stretching; a legacy saved scaleX/scaleY is stripped.
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
await page.evaluateOnNewDocument(() => {
  // A legacy party save carrying the old stretch: must load stripped.
  localStorage.setItem(
    'woc_party_frame_pos',
    '{"left":153,"top":301,"scaleX":1.3153846153846154,"scaleY":1.425,"vw":1600,"vh":900}',
  );
});
await page.goto(URL, { waitUntil: 'domcontentloaded' });
console.log(
  'booted:',
  await enterOfflineGame(page, {
    charClass: 'warrior',
    charName: 'DimsProbe',
    gameBootTimeoutMs: 90000,
    settleMs: 5000,
  }),
);

const settings = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('woc_settings') ?? '{}'));

// Legacy stretch stripped at construction, before any gesture.
const strippedSave = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('woc_party_frame_pos') ?? '{}'),
);
check(
  'legacy party scaleX/scaleY stripped and save upgraded at load',
  strippedSave.scaleX === undefined &&
    strippedSave.scaleY === undefined &&
    strippedSave.left === 153,
  strippedSave,
);

await page.evaluate(() => window.__game.hud.toggleInterfaceUnlock());
await sleep(600);

const rectOf = (sel) =>
  page.evaluate((s) => {
    const r = document.querySelector(s)?.getBoundingClientRect();
    return r
      ? {
          left: r.left,
          top: r.top,
          right: r.right,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
        }
      : null;
  }, sel);

const dragEdge = async (from, to) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await sleep(200);
};

// 1) PARTY: east edge +40px writes partyFrameWidth, text metrics untouched.
const partyBefore = await rectOf('#party-frames');
const partyFontBefore = await page.evaluate(() => {
  const el = document.querySelector('#party-frames .pfm-name-text');
  return el ? getComputedStyle(el).fontSize : null;
});
const s0 = await settings();
const pWidth0 = s0.partyFrameWidth ?? 170;
await dragEdge(
  { x: partyBefore.right - 3, y: (partyBefore.top + partyBefore.bottom) / 2 },
  { x: partyBefore.right + 37, y: (partyBefore.top + partyBefore.bottom) / 2 },
);
const s1 = await settings();
const partyRowAfter = await rectOf('#party-frames .party-frame');
const partyFontAfter = await page.evaluate(() => {
  const el = document.querySelector('#party-frames .pfm-name-text');
  return el ? getComputedStyle(el).fontSize : null;
});
const partyTransform = await page.evaluate(
  () => getComputedStyle(document.querySelector('#party-frames')).transform,
);
check(
  'party east drag writes partyFrameWidth (about +40) into woc_settings',
  (s1.partyFrameWidth ?? 170) > pWidth0 + 30 && (s1.partyFrameWidth ?? 170) <= pWidth0 + 45,
  { before: pWidth0, after: s1.partyFrameWidth },
);
// The ROW is what the setting sizes (the outer box keeps a 220px placeholder
// floor while editing, so it only grows past that).
check(
  'party rows follow the setting exactly',
  partyRowAfter.width === (s1.partyFrameWidth ?? 170),
  { row: partyRowAfter.width, setting: s1.partyFrameWidth },
);
check('party name text metrics unchanged (no stretch)', partyFontBefore === partyFontAfter, {
  before: partyFontBefore,
  after: partyFontAfter,
});
check('party frame carries no transform', partyTransform === 'none', partyTransform);

// 2) PLAYER: south edge drag thickens the bars via playerFrameHeight.
const playerBefore = await rectOf('#player-frame');
const barBefore = await page.evaluate(() => {
  const bar = document.querySelector('#player-frame .bar');
  const cs = getComputedStyle(bar);
  return {
    height: cs.height,
    lineHeight: getComputedStyle(bar.parentElement.querySelector('.bar-text') ?? bar).lineHeight,
  };
});
const h0 = (await settings()).playerFrameHeight ?? 15;
await dragEdge(
  { x: (playerBefore.left + playerBefore.right) / 2, y: playerBefore.bottom - 3 },
  { x: (playerBefore.left + playerBefore.right) / 2, y: playerBefore.bottom + 17 },
);
const s2 = await settings();
const barAfter = await page.evaluate(() => {
  const bar = document.querySelector('#player-frame .bar');
  return { height: getComputedStyle(bar).height };
});
check(
  'player south drag writes playerFrameHeight (about +10 at 2 bars)',
  (s2.playerFrameHeight ?? 15) >= h0 + 7 && (s2.playerFrameHeight ?? 15) <= h0 + 13,
  { before: h0, after: s2.playerFrameHeight },
);
check(
  'player .bar height follows the setting',
  Number.parseFloat(barAfter.height) === (s2.playerFrameHeight ?? 15),
  { was: barBefore.height, now: barAfter.height, setting: s2.playerFrameHeight },
);

// 3) PLAYER: east edge widens the frame via playerFrameWidth.
const playerRect2 = await rectOf('#player-frame');
const w0 = (await settings()).playerFrameWidth ?? 612;
await dragEdge(
  { x: playerRect2.right - 3, y: (playerRect2.top + playerRect2.bottom) / 2 },
  { x: playerRect2.right + 47, y: (playerRect2.top + playerRect2.bottom) / 2 },
);
const s3 = await settings();
const playerRect3 = await rectOf('#player-frame');
check(
  'player east drag writes playerFrameWidth (about +50)',
  (s3.playerFrameWidth ?? 612) > w0 + 40 && (s3.playerFrameWidth ?? 612) <= w0 + 55,
  { before: w0, after: s3.playerFrameWidth },
);
check('player frame box grew', playerRect3.width > playerRect2.width + 35, {
  before: playerRect2.width,
  after: playerRect3.width,
});

// 4) TARGET: force-shown placeholder; east edge writes targetFrameWidth.
const targetRect = await rectOf('#target-frame');
const tw0 = (await settings()).targetFrameWidth ?? 190;
await dragEdge(
  { x: targetRect.right - 3, y: (targetRect.top + targetRect.bottom) / 2 },
  { x: targetRect.right + 37, y: (targetRect.top + targetRect.bottom) / 2 },
);
const s4 = await settings();
const tBars = await page.evaluate(
  () => getComputedStyle(document.querySelector('#target-frame .uf-bars')).width,
);
check(
  'target east drag writes targetFrameWidth (about +40)',
  (s4.targetFrameWidth ?? 190) > tw0 + 30 && (s4.targetFrameWidth ?? 190) <= tw0 + 45,
  { before: tw0, after: s4.targetFrameWidth },
);
check(
  'target .uf-bars width follows the setting',
  Number.parseFloat(tBars) === (s4.targetFrameWidth ?? 190),
  { css: tBars, setting: s4.targetFrameWidth },
);

// 5) Reload: the sizes persist through woc_settings and re-apply at boot.
await page.reload({ waitUntil: 'domcontentloaded' });
console.log(
  'rebooted:',
  await enterOfflineGame(page, {
    charClass: 'warrior',
    charName: 'DimsProbe',
    gameBootTimeoutMs: 90000,
    settleMs: 5000,
  }),
);
const barReloaded = await page.evaluate(
  () => getComputedStyle(document.querySelector('#player-frame .bar')).height,
);
const s5 = await settings();
check(
  'reload re-applies the dragged sizes from settings',
  Number.parseFloat(barReloaded) === (s5.playerFrameHeight ?? 15) &&
    s5.playerFrameWidth === s3.playerFrameWidth &&
    s5.partyFrameWidth === s1.partyFrameWidth,
  { bar: barReloaded, settings: s5.playerFrameHeight },
);

await browser.close();
process.exit(fail > 0 ? 1 : 0);
