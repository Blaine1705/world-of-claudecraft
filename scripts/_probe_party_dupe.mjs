// Repro + fix check for the N + 10 party stack while editing: seed rows into
// the LIVE .party-rows wrapper (standing in for a real party's frames), then
// unlock. The live wrapper must fold away (display none), the visible stack
// must be exactly the preview's 10 sample rows, and locking must bring the
// live rows back.
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
    charName: 'DupeProbe',
    gameBootTimeoutMs: 120000,
    settleMs: 5000,
  }),
);

// Seed three fake live rows (what a 4-member party's painter would hold).
await page.evaluate(() => {
  const box = document.getElementById('party-frames');
  let wrapper = box.querySelector(':scope > .party-rows');
  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.className = 'party-rows';
    box.appendChild(wrapper);
  }
  for (let i = 0; i < 3; i += 1) {
    const row = document.createElement('div');
    row.className = 'party-frame';
    row.textContent = `live ${i + 1}`;
    wrapper.appendChild(row);
  }
});

await page.evaluate(() => window.__game.hud.toggleInterfaceUnlock());
await sleep(600);
const editing = await page.evaluate(() => {
  const box = document.getElementById('party-frames');
  const liveWrapper = box.querySelector(':scope > .party-rows');
  const rows = [...box.querySelectorAll('.party-frame')];
  return {
    liveDisplay: getComputedStyle(liveWrapper).display,
    visibleRows: rows.filter((r) => r.getBoundingClientRect().height > 0).length,
    previewRows: box.querySelectorAll('.tf-preview-party .party-frame').length,
  };
});
check(
  'while editing: live rows fold away, exactly the 10 preview rows show',
  editing.liveDisplay === 'none' && editing.visibleRows === 10 && editing.previewRows === 10,
  editing,
);

await page.evaluate(() => window.__game.hud.toggleInterfaceUnlock());
await sleep(400);
const locked = await page.evaluate(() => {
  const box = document.getElementById('party-frames');
  return {
    liveDisplay: getComputedStyle(box.querySelector(':scope > .party-rows')).display,
    previewGone: box.querySelectorAll('.tf-preview-party').length === 0,
  };
});
check(
  'locking restores the live rows and removes the preview',
  locked.liveDisplay !== 'none' && locked.previewGone,
  locked,
);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
