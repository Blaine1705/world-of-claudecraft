// Probe: the edit-mode preview samples and the export/import rows. Drags the
// minimap, exports the frame layout, resets, imports the code back (which
// reloads), and verifies the dragged spot returned. Needs `npm run dev`.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5391';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync('tmp', { recursive: true });

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
await page.goto(URL, { waitUntil: 'domcontentloaded' });
console.log(
  'booted:',
  await enterOfflineGame(page, {
    charClass: 'warrior',
    charName: 'PreviewProbe',
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

// --- A. Unlock: the preview samples appear.
await page.evaluate(() => window.__game.hud.toggleInterfaceUnlock());
await sleep(400);
const previews = await page.evaluate(() => ({
  buffIcons: document.querySelectorAll('#buff-bar .tf-preview .tf-preview-icon').length,
  debuffIcons: document.querySelectorAll('#debuff-bar .tf-preview .tf-preview-icon').length,
  // The party sample is now REAL party-frame rows (a second PartyFramesPainter
  // instance over sample members), so assert the live markup: .party-frame
  // rows with the real name/portrait/class structure.
  partyRows: [...document.querySelectorAll('#party-frames .tf-preview-party .party-frame')].map(
    (r) => ({
      name: r.querySelector('.pfm-name-text')?.textContent,
      crest: !!r.querySelector('.pfm-crest')?.getAttribute('src'),
      classVar: r.style.getPropertyValue('--pf-class-color') || r.getAttribute('style') || '',
    }),
  ),
  pet: !!document.querySelector('#pet-frame .tf-preview'),
  target: !!document.querySelector('#target-frame .tf-preview'),
  castLabel: document.querySelector('#castbar .tf-preview-bar-label')?.textContent ?? null,
  castFill: document.querySelector('#castbar .tf-preview-fill')?.style.width ?? null,
  swingFill: document.querySelector('#swingbar .tf-preview-fill')?.style.width ?? null,
}));
check('buff + debuff sample icons render', previews.buffIcons === 4 && previews.debuffIcons === 3, previews);
check(
  'party sample: five REAL party-frame rows with names and crests',
  previews.partyRows.length === 5 &&
    previews.partyRows[0]?.name === 'Warrior 1' &&
    previews.partyRows.every((r) => r.crest),
  previews.partyRows,
);
check('pet sample renders, target sample removed', previews.pet && !previews.target);
check('cast sample is a filled bar with a spell name', previews.castLabel === 'Example Spell' && previews.castFill === '62%', previews.castLabel);
check('swing sample is a filled bar', previews.swingFill === '45%', previews.swingFill);
await page.screenshot({ path: 'tmp/preview_unlocked.png' });

// --- A2. Resolution change (fullscreen exit): a frame parked near the right
// edge clamps into a narrower window and returns EXACTLY when it widens back.
{
  const mm0 = await page.evaluate(() => {
    const r = document.querySelector('#minimap-wrap').getBoundingClientRect();
    return { left: r.left, top: r.top, w: r.width, h: r.height };
  });
  await page.mouse.move(mm0.left + mm0.w / 2, mm0.top + mm0.h / 2);
  await page.mouse.down();
  await page.mouse.move(1700 + mm0.w / 2, 200 + mm0.h / 2, { steps: 6 });
  await page.mouse.up();
  await sleep(200);
  const wide = await page.evaluate(() => {
    const r = document.querySelector('#minimap-wrap').getBoundingClientRect();
    return { left: Math.round(r.left), top: Math.round(r.top) };
  });
  await page.setViewport({ width: 1280, height: 720 });
// Emulated viewport changes update innerWidth/Height but do NOT dispatch a
// resize event (a real window transition always does): dispatch it like the
// real browser would.
await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await sleep(300);
  const narrow = await page.evaluate(() => {
    const r = document.querySelector('#minimap-wrap').getBoundingClientRect();
    return { left: Math.round(r.left), right: Math.round(r.right) };
  });
  check('leaving fullscreen clamps the frame into view', narrow.right <= 1280 && narrow.left < wide.left, { wide, narrow });
  await page.setViewport({ width: 1920, height: 1080 });
// Emulated viewport changes update innerWidth/Height but do NOT dispatch a
// resize event (a real window transition always does): dispatch it like the
// real browser would.
await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await sleep(300);
  const restored = await page.evaluate(() => {
    const r = document.querySelector('#minimap-wrap').getBoundingClientRect();
    return { left: Math.round(r.left), top: Math.round(r.top) };
  });
  check(
    'returning to fullscreen restores the exact saved spot',
    restored.left === wide.left && restored.top === wide.top,
    { wide, restored },
  );

  // The reported scenario: a bar parked near the BOTTOM must keep its distance
  // to the bottom edge when the window loses height (fullscreen to windowed),
  // so it moves WITH the stock bottom-anchored HUD instead of floating.
  const sw0 = await page.evaluate(() => {
    const r = document.querySelector('#swingbar').getBoundingClientRect();
    return { left: r.left, top: r.top, w: r.width, h: r.height };
  });
  await page.mouse.move(sw0.left + sw0.w / 2, sw0.top + sw0.h / 2);
  await page.mouse.down();
  await page.mouse.move(300 + sw0.w / 2, 1000 + sw0.h / 2, { steps: 6 });
  await page.mouse.up();
  await sleep(200);
  const bottomDist = await page.evaluate(() => {
    const r = document.querySelector('#swingbar').getBoundingClientRect();
    return Math.round(window.innerHeight - r.bottom);
  });
  await page.setViewport({ width: 1920, height: 870 });
// Emulated viewport changes update innerWidth/Height but do NOT dispatch a
// resize event (a real window transition always does): dispatch it like the
// real browser would.
await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await sleep(300);
  const windowedDist = await page.evaluate(() => {
    const r = document.querySelector('#swingbar').getBoundingClientRect();
    return Math.round(window.innerHeight - r.bottom);
  });
  check('a bottom-parked bar keeps its distance to the bottom edge', windowedDist === bottomDist, {
    bottomDist,
    windowedDist,
  });
  await page.setViewport({ width: 1920, height: 1080 });
// Emulated viewport changes update innerWidth/Height but do NOT dispatch a
// resize event (a real window transition always does): dispatch it like the
// real browser would.
await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await sleep(300);
  const swBack = await page.evaluate(() => {
    const r = document.querySelector('#swingbar').getBoundingClientRect();
    return { left: Math.round(r.left), top: Math.round(r.top) };
  });
  check('and returns exactly when the height comes back', swBack.left === 300 && swBack.top === 1000, swBack);
}

// --- B. Drag the minimap somewhere distinctive, then lock: previews vanish.
const mm = await page.evaluate(() => {
  const r = document.querySelector('#minimap-wrap').getBoundingClientRect();
  return { left: r.left, top: r.top, w: r.width, h: r.height };
});
await page.mouse.move(mm.left + mm.w / 2, mm.top + mm.h / 2);
await page.mouse.down();
await page.mouse.move(420, 320, { steps: 8 });
await page.mouse.up();
await sleep(200);
const dragged = await page.evaluate(() => {
  const r = document.querySelector('#minimap-wrap').getBoundingClientRect();
  return { left: Math.round(r.left), top: Math.round(r.top) };
});
await page.evaluate(() => window.__game.hud.toggleInterfaceUnlock());
await sleep(300);
const afterLock = await page.evaluate(() => document.querySelectorAll('.tf-preview').length);
check('locking removes every preview node', afterLock === 0, afterLock);

// --- C. Export the frame layout from the options window.
await page.evaluate(() => window.__game.hud.toggleOptionsMenu());
await sleep(300);
await clickByText('#options-menu button', 'interface');
await sleep(300);
await clickByText('#options-menu .opt-tab', 'frames');
await sleep(250);
await clickByText('#options-menu .set-row .set-toggle', 'export');
await sleep(200);
const code = await page.evaluate(
  () => document.querySelector('#options-menu .transfer-code')?.value ?? '',
);
check('export code carries the minimap spot', code.includes('woc_hud_frame_minimap'), code.slice(0, 60));

// --- D. Reset the layout (Frames tab Reset to Defaults), confirm it moved back.
await clickByText('#options-menu > button.btn', 'reset to defaults');
await sleep(400);
const afterReset = await page.evaluate(() => {
  const r = document.querySelector('#minimap-wrap').getBoundingClientRect();
  return { left: Math.round(r.left), top: Math.round(r.top) };
});
check('reset moved the minimap off the dragged spot', Math.abs(afterReset.left - dragged.left) > 50, { dragged, afterReset });

// --- E. Import the code back: Apply reloads, the spot returns.
await clickByText('#options-menu .set-row .set-toggle', 'import');
await sleep(200);
await page.evaluate((text) => {
  const box = document.querySelector('#options-menu .transfer-code');
  box.value = text;
}, code);
await Promise.all([
  page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 90000 }),
  clickByText('#options-menu button.btn', 'apply and reload'),
]);
console.log(
  'rebooted:',
  await enterOfflineGame(page, {
    charClass: 'warrior',
    charName: 'PreviewProbe',
    gameBootTimeoutMs: 90000,
    settleMs: 5000,
  }),
);
const restored = await page.evaluate(() => {
  const r = document.querySelector('#minimap-wrap').getBoundingClientRect();
  return { left: Math.round(r.left), top: Math.round(r.top) };
});
check(
  'import restored the dragged minimap spot after reload',
  Math.abs(restored.left - dragged.left) < 3 && Math.abs(restored.top - dragged.top) < 3,
  { dragged, restored },
);

// --- F. The all-settings export exists on General and carries woc_settings.
await page.evaluate(() => window.__game.hud.toggleOptionsMenu());
await sleep(300);
await clickByText('#options-menu button', 'interface');
await sleep(300);
await clickByText('#options-menu .opt-tab', 'general');
await sleep(250);
await clickByText('#options-menu .set-row .set-toggle', 'export');
await sleep(200);
const settingsCode = await page.evaluate(
  () => document.querySelector('#options-menu .transfer-code')?.value ?? '',
);
check(
  'all-settings export carries the settings + frame families',
  settingsCode.includes('"woc_settings"') && settingsCode.includes('woc_hud_frame_minimap'),
  settingsCode.slice(0, 60),
);
// A frames code pasted into the settings import is refused with the kind message.
await clickByText('#options-menu .set-row .set-toggle', 'import');
await sleep(200);
await page.evaluate((text) => {
  document.querySelector('#options-menu .transfer-code').value = text;
}, code);
await clickByText('#options-menu button.btn', 'apply and reload');
await sleep(300);
const kindMsg = await page.evaluate(
  () => document.querySelector('#options-menu .transfer-pane .set-note')?.textContent ?? '',
);
check('a frames code is refused by the settings import', kindMsg.length > 0 && /different/i.test(kindMsg), kindMsg);

await browser.close();
process.exit(fail > 0 ? 1 : 0);
