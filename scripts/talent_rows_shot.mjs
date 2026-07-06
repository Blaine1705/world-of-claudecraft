// E2E of the choice-row talents tab: boot offline warrior at cap, open the
// talents window, switch to the Choices tab, pick Crushing Charge, verify the
// pick landed in the sim and the UI, and screenshot. Needs `npm run dev`.

import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';

const URL = (process.env.GAME_URL ?? 'http://localhost:5173') + '/';
fs.mkdirSync('tmp', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const check = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) fails.push(msg);
};

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  args: [
    '--window-size=1600,900',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--no-sandbox',
  ],
  defaultViewport: { width: 1600, height: 900, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => fails.push('PAGEERROR: ' + e.message));

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 45000 });
await page.evaluate(() => document.querySelector('#btn-offline').click());
await sleep(300);
await page.evaluate(() =>
  (
    document.querySelector('#offline-select .mini-class[data-class="warrior"]') ||
    document.querySelector('.class-card[data-class="warrior"]')
  )?.click(),
);
await sleep(150);
await page.evaluate(() => {
  const n = document.querySelector('#char-name');
  if (n) n.value = 'Aki';
});
await page.evaluate(() => document.querySelector('#btn-start-offline')?.click());
await page.waitForFunction(() => window.__game?.sim?.entities?.size > 5, {
  timeout: 60000,
  polling: 250,
});
await sleep(2000);
await page.keyboard.press('Escape'); // skip the spawn cinematic
await sleep(400);
await page.evaluate(() => document.querySelector('.tut-skip')?.click());
await sleep(300);

// Cap the character, open the talents window, switch to the rows tab.
await page.evaluate(() => {
  window.__game.sim.setPlayerLevel(20);
  window.__game.hud.toggleTalents();
});
await sleep(400);
const tabInfo = await page.evaluate(() => {
  const tab = document.querySelector('.tal-tab[data-tab="rows"]');
  return { exists: !!tab, label: tab?.querySelector('.tal-tab-label')?.textContent ?? null };
});
check(tabInfo.exists, `Choices tab present (label "${tabInfo.label}")`);
await page.evaluate(() =>
  document
    .querySelector('.tal-tab[data-tab="rows"]')
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true })),
);
await sleep(400);
const rows = await page.evaluate(() => ({
  rowCount: document.querySelectorAll('.tal-row').length,
  optCount: document.querySelectorAll('.tal-row-opt').length,
  lockedRows: document.querySelectorAll('.tal-row.locked').length,
  firstNames: [...document.querySelectorAll('.tal-row:first-child .tal-row-opt b')].map(
    (b) => b.textContent,
  ),
}));
check(rows.rowCount === 6, `6 rows rendered (got ${rows.rowCount})`);
check(rows.optCount === 18, `18 options rendered (got ${rows.optCount})`);
check(rows.lockedRows === 0, `no locked rows at level 20 (got ${rows.lockedRows})`);
console.log('row 1 options:', JSON.stringify(rows.firstNames));
// MoP band layout: the whole tab must fit without scrolling on a desktop viewport.
const fit = await page.evaluate(() => {
  const win = document.querySelector('#talents-window');
  const r = win.getBoundingClientRect();
  return {
    winBottom: Math.round(r.bottom),
    viewport: window.innerHeight,
    scrollable: win.scrollHeight - win.clientHeight,
  };
});
check(
  fit.winBottom <= fit.viewport,
  `window fits the viewport (bottom ${fit.winBottom} <= ${fit.viewport})`,
);
check(fit.scrollable <= 2, `no internal scroll needed (overflow ${fit.scrollable}px)`);
await page.screenshot({ path: 'tmp/rows_tab.png' });

// Pick Crushing Charge and verify sim + UI.
await page.evaluate(() =>
  document.querySelector('.tal-row-opt[data-opt="war_row_crushing_charge"]')?.click(),
);
await sleep(500);
const after = await page.evaluate(() => ({
  simPick: window.__game.sim.rowPicks[0],
  pressed: document
    .querySelector('.tal-row-opt[data-opt="war_row_crushing_charge"]')
    ?.getAttribute('aria-pressed'),
  badge: document.querySelector('.tal-tab[data-tab="rows"] .tt-pts')?.textContent,
  chargeAdds: window.__game.sim.entities
    ? (window.__game.sim.talents, window.__game.sim.player, null)
    : null,
}));
check(after.simPick === 'war_row_crushing_charge', `sim.rowPicks[0] = ${after.simPick}`);
check(after.pressed === 'true', `picked card aria-pressed=${after.pressed}`);
check(after.badge === '1', `tab badge shows 1 (got ${after.badge})`);
await page.screenshot({ path: 'tmp/rows_picked.png' });

// Level gate check: a fresh low-level character sees locked rows.
await page.evaluate(() => {
  window.__game.sim.setPlayerLevel(8);
  window.__game.hud.toggleTalents();
  window.__game.hud.toggleTalents();
});
await sleep(300);
await page.evaluate(() =>
  document
    .querySelector('.tal-tab[data-tab="rows"]')
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true })),
);
await sleep(300);
const locked = await page.evaluate(() => ({
  lockedRows: document.querySelectorAll('.tal-row.locked').length,
  disabled: document.querySelectorAll('.tal-row-opt:disabled').length,
  pending: document.querySelectorAll('.tal-row-opt.pending .tal-soon').length,
}));
check(locked.lockedRows === 4, `4 locked rows at level 8 (got ${locked.lockedRows})`);
// 12 options in the 4 locked rows; every warrior option is live now, so no
// Coming-soon badge disables anything in the unlocked tiers.
check(locked.disabled === 12, `12 disabled options at level 8 (got ${locked.disabled})`);
check(locked.pending === 0, `0 Coming-soon badges (got ${locked.pending})`);
await page.screenshot({ path: 'tmp/rows_locked.png' });

await browser.close();
console.log(fails.length ? `\nFAILURES:\n- ${fails.join('\n- ')}` : '\nAll checks passed.');
process.exit(fails.length ? 1 : 0);
