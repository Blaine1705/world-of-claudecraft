// Screenshots for the controller cross hotbar: the HUD with no trigger held
// (the before state, which is also what every keyboard player keeps seeing), the
// bar open on the left trigger, the same bar swapped to its second set by the
// opposite-trigger tap, and the Controller options panel carrying the new rows.
//
// A real pad cannot be driven from puppeteer, so the page's own
// navigator.getGamepads is replaced with one that reports a standard Xbox pad
// whose trigger state this script owns. Everything downstream is the real code
// path: GamepadManager polls it, the pure reducer resolves the hold, and the
// overlay paints from the action bar's own state.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH as EDGE } from './browser_path.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5173';
const OUT = process.env.SHOT_DIR ?? 'docs/screenshots/cross-hotbar';
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('CONSOLE: ' + m.text());
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
await page.click('#btn-offline');
await wait(200);
await page.type('#char-name', 'Padtest');
await page.click('#offline-select .mini-class[data-class="warrior"]');
await page.click('#btn-start-offline');
await wait(4000);

// Fill the first cross-hotbar set so the shot shows a realistic bar rather than
// a level-one warrior's three abilities: the overlay mirrors action-bar slots,
// so seeding the bar seeds the bar.
await page.evaluate(() => {
  document.querySelector('#tutorial-skip')?.click();
});

// Replace the pad. Trigger state lives on window.__pad and the page polls it.
await page.evaluate(() => {
  const N = 17;
  const st = { lt: false, rt: false };
  window.__pad = st;
  const mk = () => ({
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: N }, (_, i) => {
      const p = i === 6 ? st.lt : i === 7 ? st.rt : false;
      return { pressed: p, touched: p, value: p ? 1 : 0 };
    }),
    connected: true,
    id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 02fd)',
    index: 0,
    mapping: 'standard',
    timestamp: performance.now(),
    vibrationActuator: null,
  });
  navigator.getGamepads = () => [mk()];
  // The headless window is never focused, and the pad path takes no input while
  // unfocused by design; hold the gate open so the capture reflects real play.
  document.hasFocus = () => true;
  const ev = new Event('gamepadconnected');
  Object.defineProperty(ev, 'gamepad', { value: mk() });
  window.dispatchEvent(ev);
});
await wait(500);

const shot = async (name) => {
  await wait(400);
  await page.screenshot({ path: `${OUT}/${name}.png` });
};

// 1. Nothing held: the bar is absent, which is every non-pad player's view.
await shot('01-before-no-trigger');

// 2. Left trigger held: eight slots under the thumbs.
await page.evaluate(() => {
  window.__pad.lt = true;
});
await shot('02-after-left-trigger');

// 3. Tap the opposite trigger while holding: the second set.
await page.evaluate(() => {
  window.__pad.rt = true;
});
await wait(200);
await page.evaluate(() => {
  window.__pad.rt = false;
});
await shot('03-after-double-set');

const state = await page.evaluate(() => {
  const r = document.getElementById('cross-hotbar');
  return {
    shown: r?.style.display !== 'none',
    layer: r?.getAttribute('data-xhb-layer'),
    expanded: r?.classList.contains('xhb-expanded'),
    cells: r?.querySelectorAll('.xhb-slot').length,
  };
});
console.log('overlay state on the double set:', JSON.stringify(state));

// 4. Release, then the Controller options panel.
await page.evaluate(() => {
  window.__pad.lt = false;
});
await wait(300);
await page.keyboard.press('Escape');
await wait(400);
const opened = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button, .set-tab, [role="tab"]')].find((b) =>
    /controller/i.test(b.textContent ?? ''),
  );
  btn?.click();
  return !!btn;
});
await wait(600);
console.log('controller panel opened:', opened);
await shot('04-options-controller');

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console/page errors');
await browser.close();
