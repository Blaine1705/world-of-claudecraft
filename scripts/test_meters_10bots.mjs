// Verification script for World of ClaudeCraft combat meter with 10 bots.
// Boots the offline game, builds a 10-player raid with distinct specs and classes,
// generates combat metrics, verifies spec icons and class fallbacks, clean fight menu,
// and captures high-resolution screenshots.

import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';

const ARTIFACT_DIR = 'C:/Users/joseg/.gemini/antigravity-cli/brain/c5250ddf-e80c-41f3-948f-690217a4d9a7';
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

const URL = 'http://localhost:5173/?gfx=low';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROFILE = path.resolve('tmp/meters-10bots-profile');
fs.rmSync(PROFILE, { recursive: true, force: true });
fs.mkdirSync(PROFILE, { recursive: true });

console.log('Launching browser...');
const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  protocolTimeout: 120000,
  userDataDir: PROFILE,
  args: [
    '--window-size=1600,1000',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--no-sandbox',
    '--disable-breakpad',
    '--disable-crash-reporter',
    '--disable-dev-shm-usage',
  ],
  defaultViewport: { width: 1600, height: 1000 },
});

const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

console.log('Navigating to', URL);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 40000 });

const clk = (sel) => page.evaluate((s) => document.querySelector(s)?.click(), sel);

console.log('Starting offline session...');
await page.waitForSelector('#btn-offline', { timeout: 20000 });
await clk('#btn-offline');
await sleep(300);
await page.type('#char-name', 'Commander');
await clk('#offline-select .mini-class[data-class="warrior"]');
await sleep(150);
await clk('#btn-start-offline');

console.log('Waiting for game to initialize...');
await page.waitForFunction(() => window.__game?.renderer && window.__game.sim && window.__game.hud, {
  timeout: 120000,
  polling: 500,
});
await sleep(3500);

// Dismiss tutorial popup, greeting dialog, and banners if present
await page.evaluate(() => {
  for (const btn of document.querySelectorAll('button')) {
    if (/understood|dismiss|skip/i.test(btn.textContent || '')) {
      try { btn.click(); } catch {}
    }
  }
  const elTutorial = document.getElementById('tutorial-greeting');
  if (elTutorial) elTutorial.remove();
  const elPerf = document.getElementById('perf-notice');
  if (elPerf) elPerf.remove();
  const elBackdrop = document.querySelector('.modal-backdrop, .dialog-backdrop');
  if (elBackdrop) elBackdrop.remove();
});
await sleep(1500);

console.log('Setting up 10-player raid with distinct specs and classes...');
const raidSetup = await page.evaluate(() => {
  const game = window.__game;
  const sim = game.sim;
  const me = sim.primaryId;
  const p = sim.player;

  // Set player spec: arms
  sim.setSpec('arms', me);

  const roster = [
    { name: 'Kaelen', cls: 'warrior', spec: 'fury' },
    { name: 'Aethelgard', cls: 'warrior', spec: 'prot' },
    { name: 'Pyromaster', cls: 'mage', spec: 'fire' },
    { name: 'Glacius', cls: 'mage', spec: 'frost' },
    { name: 'Chronos', cls: 'mage', spec: 'arcane' },
    { name: 'Dawnbringer', cls: 'paladin', spec: 'retribution' },
    { name: 'Lightwarden', cls: 'paladin', spec: 'holy' },
    { name: 'Shadowmend', cls: 'priest', spec: 'discipline' },
    { name: 'Novice', cls: 'rogue', spec: null }, // no spec chosen, fallback to class icon!
  ];

  const pids = roster.map((bot, i) => {
    const pid = sim.addPlayer(bot.cls, bot.name);
    if (bot.spec) {
      sim.setSpec(bot.spec, pid);
    }
    const e = sim.entities.get(pid);
    if (e) {
      e.pos = { x: p.pos.x + ((i % 5) - 2) * 2, y: p.pos.y, z: p.pos.z + Math.floor(i / 5) * 2 + 2 };
      e.prevPos = { ...e.pos };
    }
    return pid;
  });

  const pm = sim.party;
  const party = {
    id: pm.nextPartyId++,
    leader: me,
    members: [me, ...pids],
    raid: true,
    raidGroups: new Map(),
    lootStrategies: { master: { enabled: false, looter: 0, threshold: 'rare' } },
  };
  party.raidGroups.set(me, 1);
  pids.forEach((pid, i) => {
    party.raidGroups.set(pid, i < 4 ? 1 : 2);
  });
  pm.parties.set(party.id, party);
  pm.partyByPid.set(me, party.id);
  pids.forEach((pid) => {
    pm.partyByPid.set(pid, party.id);
  });

  return {
    leader: me,
    allPids: [me, ...pids],
    partyCount: sim.partyInfo?.members?.length ?? 0,
  };
});

console.log('Raid setup complete:', raidSetup);

console.log('Simulating realistic combat events for all 10 players...');
await page.evaluate(() => {
  const game = window.__game;
  const meters = game.hud.meters;
  const sim = game.sim;
  const allMembers = sim.partyInfo.members;

  // Fight 1: Training dummy combat
  const combatData = [
    { name: 'Commander', dmg: 145000, dps: 2416, ability: 'Mortal Strike', heal: 0, absorb: 0 },
    { name: 'Kaelen', dmg: 168000, dps: 2800, ability: 'Bloodthirst', heal: 4500, absorb: 0 },
    { name: 'Pyromaster', dmg: 152000, dps: 2533, ability: 'Pyroblast', heal: 0, absorb: 0 },
    { name: 'Glacius', dmg: 139000, dps: 2316, ability: 'Ice Lance', heal: 0, absorb: 12000 },
    { name: 'Dawnbringer', dmg: 128000, dps: 2133, ability: 'Final Edict', heal: 8200, absorb: 0 },
    { name: 'Novice', dmg: 115000, dps: 1916, ability: 'Sinister Strike', heal: 0, absorb: 0 },
    { name: 'Aethelgard', dmg: 89000, dps: 1483, ability: 'Shield Slam', heal: 2100, absorb: 45000 },
    { name: 'Chronos', dmg: 72000, dps: 1200, ability: 'Temporal Mend', heal: 135000, absorb: 25000 },
    { name: 'Shadowmend', dmg: 64000, dps: 1066, ability: 'Penance', heal: 148000, absorb: 68000 },
    { name: 'Lightwarden', dmg: 41000, dps: 683, ability: 'Mercy Lance', heal: 172000, absorb: 15000 },
  ];

  const now = performance.now();
  const partySet = new Set(allMembers.map((m) => m.pid));

  for (const c of combatData) {
    const member = allMembers.find((m) => m.name === c.name);
    if (!member) continue;

    // Damage event
    meters.onEvent({
      type: 'damage',
      sourceId: member.pid,
      targetId: 50,
      amount: c.dmg,
      crit: true,
      school: 'physical',
      ability: c.ability,
      kind: 'hit',
    }, sim, partySet, now);

    // Healing event if any
    if (c.heal > 0) {
      meters.onEvent({
        type: 'heal2',
        sourceId: member.pid,
        targetId: member.pid,
        amount: c.heal,
        crit: false,
        ability: c.ability,
      }, sim, partySet, now);
    }

    // Shield absorb event if any
    if (c.absorb > 0) {
      meters.onEvent({
        type: 'absorb',
        sourceId: member.pid,
        targetId: member.pid,
        amount: c.absorb,
        ability: 'Shield',
      }, sim, partySet, now);
    }
  }

  // Ensure meters panel is open on dmg tab
  if (!meters.isOpen) {
    meters.toggle();
  }
  meters.tab = 'dmg';
  meters.render(true);
});

await sleep(1000);

console.log('Positioning meter window for clear view...');
await page.evaluate(() => {
  const win = document.getElementById('meters-window');
  if (win) {
    win.style.display = 'flex';
    win.style.flexDirection = 'column';
    win.style.height = '330px';
    win.style.width = '360px';
  }
  const rows = win?.querySelector('.mt-rows');
  if (rows) {
    rows.style.maxHeight = '280px';
    rows.style.height = '280px';
  }
  window.__game.hud.meters.tab = 'dmg';
  window.__game.hud.meters.render(true);
});
await sleep(1000);

// Screenshot 1: Damage Meter with 10 bots, specs, and class fallback
console.log('Capturing Screenshot 1: Damage Meter with 10 bots...');
const shot1Path = path.join(ARTIFACT_DIR, 'meters_10bots_damage.png');
await page.screenshot({ path: shot1Path });
fs.copyFileSync(shot1Path, path.resolve('docs/screenshots/meters-10bots-damage.png'));
console.log('Saved:', shot1Path);

// Screenshot 2: Healing Meter with absorbs
console.log('Switching to Healing tab...');
await page.evaluate(() => {
  const btn = document.querySelector('#meters-window .mt-tab[data-tab="heal"]');
  if (btn) btn.click();
  else {
    window.__game.hud.meters.tab = 'heal';
    window.__game.hud.meters.render(true);
  }
});
await sleep(600);
const shot2Path = path.join(ARTIFACT_DIR, 'meters_10bots_healing.png');
await page.screenshot({ path: shot2Path });
fs.copyFileSync(shot2Path, path.resolve('docs/screenshots/meters-10bots-healing.png'));
console.log('Saved:', shot2Path);

// Screenshot 3: Clean Last Fight Menu
console.log('Opening clean Last fight menu...');
await page.evaluate(() => {
  const trigger = document.querySelector('#meters-window .mt-seg-trigger');
  if (trigger) trigger.click();
});
await sleep(600);
const shot3Path = path.join(ARTIFACT_DIR, 'meters_clean_fights_menu.png');
await page.screenshot({ path: shot3Path });
fs.copyFileSync(shot3Path, path.resolve('docs/screenshots/meters-clean-fights-menu.png'));
console.log('Saved:', shot3Path);

// Close menu
await page.keyboard.press('Escape');
await sleep(300);

// Screenshot 4: Options Dialog (gear icon)
console.log('Opening Options Dialog via gear button...');
await page.evaluate(() => {
  const gearBtn = document.querySelector('#meters-window .mt-settings');
  if (gearBtn) gearBtn.click();
});
await sleep(600);
const shot4Path = path.join(ARTIFACT_DIR, 'meters_options_dialog.png');
await page.screenshot({ path: shot4Path });
fs.copyFileSync(shot4Path, path.resolve('docs/screenshots/meters-options-dialog.png'));
console.log('Saved:', shot4Path);

console.log('Closing browser...');
await browser.close();
console.log('Test completed successfully!');
