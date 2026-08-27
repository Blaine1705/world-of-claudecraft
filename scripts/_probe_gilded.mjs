// Live check: the DEFAULT theme keeps the classic flat window chrome, and
// switching to the Fancy Gold preset through the real options dropdown turns
// on the gilded frame (12 tinted layers, 30px radius, gilt title) plus the
// gold palette LIVE, no reload; switching back restores stock. Seeds a high
// graphics preset (headless swiftshader auto-detects LOW, which sheds the
// ornament by design).
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5391';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync('tmp', { recursive: true });

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
  s.graphicsPreset = 4;
  s.graphicsDefaultApplied = true;
  localStorage.setItem('woc_settings', JSON.stringify(s));
});
await page.goto(URL, { waitUntil: 'domcontentloaded' });
console.log(
  'booted:',
  await enterOfflineGame(page, {
    charClass: 'warrior',
    charName: 'GildProbe',
    gameBootTimeoutMs: 120000,
    settleMs: 5000,
  }),
);

const windowState = () =>
  page.evaluate(() => {
    const el = document.getElementById('bags');
    const cs = getComputedStyle(el);
    const title = el.querySelector('.panel-title');
    return {
      radius: cs.borderRadius,
      svgLayers: (cs.backgroundImage.match(/data:image\/svg\+xml/g) ?? []).length,
      hasGrip: cs.backgroundImage.includes('repeating-linear-gradient'),
      titlePadLeft: title ? getComputedStyle(title).paddingLeft : null,
      gold: getComputedStyle(document.documentElement).getPropertyValue('--gold').trim(),
      gate: document.documentElement.classList.contains('fancy-gold-ui'),
    };
  });

// One preset -> another through the REAL options theme dropdown.
const pickPreset = async (currentLabelRe, wantedLabel) => {
  await page.evaluate(() => window.__game.hud.toggleOptionsMenu());
  await sleep(300);
  const result = await page.evaluate(
    async (currentSrc, wanted) => {
      const current = new RegExp(currentSrc, 'i');
      const root = document.getElementById('options-menu');
      [...root.querySelectorAll('button')].find((b) => b.textContent === 'Interface')?.click();
      await new Promise((r) => setTimeout(r, 300));
      const dd = [...root.querySelectorAll('button, .ui-dd')].find((b) =>
        current.test(b.textContent ?? ''),
      );
      if (!dd) return 'no-dropdown';
      dd.click();
      await new Promise((r) => setTimeout(r, 250));
      const opt = [...document.querySelectorAll('button, [role="option"]')].find(
        (b) => b.textContent?.trim() === wanted,
      );
      if (!opt) return 'no-option';
      opt.click();
      await new Promise((r) => setTimeout(r, 250));
      return JSON.parse(localStorage.getItem('woc_theme') ?? '{}').preset;
    },
    currentLabelRe,
    wantedLabel,
  );
  await page.evaluate(() => window.__game.hud.toggleOptionsMenu());
  await sleep(200);
  return result;
};

// 1) DEFAULT (Classic Gold): the old flat chrome, untouched.
await page.evaluate(() => window.__game.hud.toggleBags());
await sleep(400);
const classic = await windowState();
check(
  'default theme keeps the classic chrome (no gilded layers, 6px radius, stock title pad)',
  classic.svgLayers === 0 &&
    classic.radius === '6px' &&
    classic.hasGrip &&
    classic.titlePadLeft === '12px' &&
    classic.gold === '#ffd100' &&
    classic.gate === false,
  classic,
);
await page.screenshot({ path: 'tmp/gild_default.png' });
await page.evaluate(() => window.__game.hud.toggleBags());

// 2) Switch to Fancy Gold LIVE through the dropdown: gilding + palette land
// on the open bag window with no reload.
const picked = await pickPreset('classic gold', 'Fancy Gold');
console.log('picked preset:', picked);
await page.evaluate(() => window.__game.hud.toggleBags());
await sleep(400);
const fancy = await windowState();
check(
  'Fancy Gold turns on the gilded frame (12 layers, 30px, gilt title) + gold palette live',
  picked === 'fancyGold' &&
    fancy.svgLayers === 12 &&
    fancy.radius === '30px' &&
    fancy.hasGrip &&
    fancy.titlePadLeft === '64px' &&
    fancy.gold === '#f0c86d' &&
    fancy.gate === true,
  fancy,
);
await page.screenshot({ path: 'tmp/gild_fancy.png' });
await page.evaluate(() => window.__game.hud.toggleBags());

// 3) Back to Classic Gold: everything returns to stock, live.
const back = await pickPreset('fancy gold', 'Classic Gold');
console.log('picked preset:', back);
await page.evaluate(() => window.__game.hud.toggleBags());
await sleep(400);
const restored = await windowState();
check(
  'back on Classic Gold everything returns to stock, live',
  back === 'classic' &&
    restored.svgLayers === 0 &&
    restored.radius === '6px' &&
    restored.gold === '#ffd100' &&
    restored.gate === false,
  restored,
);
console.log('shots: tmp/gild_default.png tmp/gild_fancy.png');

await browser.close();
process.exit(fail > 0 ? 1 : 0);
