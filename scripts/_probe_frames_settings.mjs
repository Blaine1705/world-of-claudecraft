// Probe: the options back-button fix + the Frames Settings restructure.
// Checks: Back survives a setting change and a tab switch; the Edit Frames row
// lives on the Frames tab (not Combat); the frame-scale sliders and the four
// moved toggles are gone from the options window; the edit-mode dropdown is
// named Frames Settings, folds the show/hide list into a sub-menu, and its
// Combine Action Bars toggle works live. Needs `npm run dev`.
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
    charName: 'BackProbe',
    gameBootTimeoutMs: 90000,
    settleMs: 5000,
  }),
);

const optionsTitle = () =>
  page.evaluate(() => document.querySelector('#options-title')?.textContent ?? null);

// --- 1. Open the game menu, enter Interface, and exercise Back after rebuilds.
await page.keyboard.press('Escape');
await sleep(300);
check('game menu opens', (await optionsTitle()) !== null, await optionsTitle());
await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.opt-list button, .opt-list .opt-row')];
  const row = rows.find((r) => /interface/i.test(r.textContent ?? ''));
  row?.click();
});
await sleep(250);
const interfaceTitle = await optionsTitle();
check('interface panel opens', /interface/i.test(interfaceTitle ?? ''), interfaceTitle);

// Tab switch (this alone used to kill Back), then Back.
await page.evaluate(() => {
  const tabs = [...document.querySelectorAll('.opt-tab')];
  tabs.find((tab) => /frames/i.test(tab.textContent ?? ''))?.click();
});
await sleep(250);
const framesTab = await page.evaluate(() => {
  const panel = document.querySelector('#interface-tabpanel');
  const text = panel?.textContent ?? '';
  return {
    hasEditFrames: /edit frames/i.test(text),
    hasScaleSliders: /player frame scale|target frame scale/i.test(text),
  };
});
check('Edit Frames row sits on the Frames tab', framesTab.hasEditFrames);
check('frame scale sliders are gone', !framesTab.hasScaleSliders);

// A setting change on this tab (the other Back killer), then Back.
await page.evaluate(() => {
  document.querySelector('[data-setting-key="partyFrameShowSelf"]')?.click();
});
await sleep(250);
await page.evaluate(() => {
  document.querySelector('[data-back]')?.click();
});
await sleep(250);
const backTitle = await optionsTitle();
check('Back works after a tab switch + setting change', /game menu/i.test(backTitle ?? ''), backTitle);

// Round trip again: Interface > Combat tab must NOT carry the moved rows.
await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.opt-list button, .opt-list .opt-row')];
  rows.find((r) => /interface/i.test(r.textContent ?? ''))?.click();
});
await sleep(250);
await page.evaluate(() => {
  const tabs = [...document.querySelectorAll('.opt-tab')];
  tabs.find((tab) => /combat/i.test(tab.textContent ?? ''))?.click();
});
await sleep(250);
const combatTab = await page.evaluate(() => {
  const text = document.querySelector('#interface-tabpanel')?.textContent ?? '';
  return {
    moved: /combine action bars|hide unused action slots|mouseover cast|lock action bars/i.test(
      text,
    ),
    editFrames: /edit frames/i.test(text),
    stillHasCombatRows: /sticky target|attack/i.test(text),
  };
});
check('moved toggles are gone from the Combat tab', !combatTab.moved);
check('Edit Frames left the Combat tab', !combatTab.editFrames);
check('the Combat tab still renders its own rows', combatTab.stillHasCombatRows);
await page.evaluate(() => document.querySelector('[data-back]')?.click());
await sleep(200);
check('Back works from the Combat tab too', /game menu/i.test((await optionsTitle()) ?? ''));
await page.keyboard.press('Escape');
await sleep(300);

// --- 2. Edit mode: the renamed dropdown, the sub-menu, and the live toggles.
await page.evaluate(() => window.__game.hud.toggleInterfaceUnlock());
await sleep(400);
const dropdown = await page.evaluate(() => {
  const btn = document.querySelector('#interface-frames-toggle');
  return { label: btn?.textContent ?? null };
});
check('menu button reads Frames Settings', dropdown.label === 'Frames Settings', dropdown.label);
await page.click('#interface-frames-toggle');
await sleep(200);
const menuShape = await page.evaluate(() => {
  const menu = document.querySelector('#interface-frames-menu');
  const sub = menu?.querySelector('details.frames-menu-sub');
  return {
    summary: sub?.querySelector('summary')?.textContent ?? null,
    subOpen: sub?.open ?? null,
    frameRowCount: sub?.querySelectorAll('.frames-menu-row').length ?? 0,
    settingLabels: [...(menu?.querySelectorAll('.frames-menu-settings .frames-menu-row span') ?? [])].map(
      (s) => s.textContent,
    ),
  };
});
check('show/hide list folds into a sub-menu', menuShape.summary === 'Show or Hide Frames' && menuShape.subOpen === false, menuShape.summary);
check('sub-menu holds the frame rows', menuShape.frameRowCount >= 10, menuShape.frameRowCount);
check(
  'the four moved settings render as dropdown toggles',
  JSON.stringify(menuShape.settingLabels) ===
    JSON.stringify([
      'Combine Action Bars',
      'Hide Unused Action Slots',
      'Mouseover Cast on Party Frames',
      'Lock Action Bars',
    ]) ||
    (menuShape.settingLabels.length === 4 &&
      /combine/i.test(menuShape.settingLabels[0] ?? '') &&
      /lock/i.test(menuShape.settingLabels[3] ?? '')),
  menuShape.settingLabels,
);

// Expand the sub-menu, then flip Combine Action Bars: the frame set changes,
// the menu rebuilds, and the fold must stay open.
await page.evaluate(() => {
  const sub = document.querySelector('#interface-frames-menu details');
  if (sub) sub.open = true;
});
await sleep(100);
await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#interface-frames-menu .frames-menu-settings .frames-menu-row')];
  const row = rows.find((r) => /combine/i.test(r.textContent ?? ''));
  row?.querySelector('input')?.click();
});
await sleep(300);
const combined = await page.evaluate(() => ({
  bodyClass: document.body.classList.contains('combined-action-bars'),
  subOpen: document.querySelector('#interface-frames-menu details')?.open ?? null,
  combineChecked: (() => {
    const rows = [...document.querySelectorAll('#interface-frames-menu .frames-menu-settings .frames-menu-row')];
    return rows.find((r) => /combine/i.test(r.textContent ?? ''))?.querySelector('input')?.checked;
  })(),
}));
check('combine toggle applies live (body class set)', combined.bodyClass === true);
check('menu rebuild keeps the sub-menu open + ticked state', combined.subOpen === true && combined.combineChecked === true, combined);
await page.screenshot({ path: 'tmp/frames_settings_menu.png' });

// Put the setting back so the tester's HUD is unchanged.
await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#interface-frames-menu .frames-menu-settings .frames-menu-row')];
  rows.find((r) => /combine/i.test(r.textContent ?? ''))?.querySelector('input')?.click();
});
await sleep(200);

await browser.close();
process.exit(fail > 0 ? 1 : 0);
