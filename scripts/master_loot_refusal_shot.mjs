// Screenshot harness for #2526: what the master looter sees when the sim REFUSES
// an assignment. Boots the offline world, forms a three-person party with master
// loot on, opens a REAL curate-phase roll off a real corpse, drops one candidate
// out of the roll, then assigns to exactly that departed candidate through the
// actual checkbox + Roll button.
//
// Shoots the same fixed region three times so the branch and the base produce
// comparable frames:
//   1-prompt   the curate prompt, open (identical on both)
//   2-refused  immediately after the refused assignment: the row is gone
//   3-restored past the re-show grace. On this branch the reconcile surface has
//              brought the prompt back, minus the departed candidate. On the base
//              tree it stays empty until the 300s timeout, which IS the bug.
//
// Every frame is captured with the row state read in the SAME step and printed, so
// the artifact says what it contains rather than being trusted. That matters here:
// at ?gfx=ultra a swiftshader frame can take longer than the 2s re-show grace, and a
// screenshot that waits for one silently captures the wrong moment.
//
// Needs a dev server (default :5173, override GAME_URL). Renders at ?gfx=medium,
// deliberately: the subject is a DOM panel, and a cheap frame is what keeps the
// "row is gone" capture honest.
// Output prefix defaults to tmp/master-loot-refusal-, override SHOT_PREFIX.

import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';

const URL = `${process.env.GAME_URL ?? 'http://localhost:5173'}/?gfx=medium`;
const PREFIX = process.env.SHOT_PREFIX ?? 'tmp/master-loot-refusal-';
fs.mkdirSync(PREFIX.slice(0, PREFIX.lastIndexOf('/')) || '.', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  args: [
    '--window-size=1600,900',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-crash-reporter',
    '--disable-breakpad',
    `--user-data-dir=${fs.mkdtempSync('/tmp/woc-chrome-')}`,
  ],
  defaultViewport: { width: 1600, height: 900, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('CONSOLE:', m.text());
});

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
// The shared entry flow, which also dismisses the intro cinematic that otherwise
// keeps #ui hidden (and would make every clip measure zero).
const booted = await enterOfflineGame(page, {
  charClass: 'warrior',
  charName: 'Sortwyn',
  settleMs: 2500,
  gameBootTimeoutMs: 120000,
});
if (!booted) throw new Error('the offline world never booted');
await page.waitForFunction(() => window.__game?.hud, { timeout: 60000 });

// A real three-person party on a real corpse holding a threshold drop, with master
// loot on. Nothing here is faked into the HUD: lootCorpse opens the roll and emits
// the masterLoot event the prompt renders from.
const staged = await page.evaluate(() => {
  const sim = window.__game.sim;
  const me = sim.playerId;
  const player = sim.entities.get(me);
  const berta = sim.addPlayer('mage', 'Berta');
  const cara = sim.addPlayer('rogue', 'Cara');
  for (const pid of [berta, cara]) {
    sim.partyInvite(pid, me);
    sim.partyAccept(pid);
    const e = sim.entities.get(pid);
    e.pos = { x: player.pos.x + 1, y: player.pos.y, z: player.pos.z + 1 };
    e.prevPos = { ...e.pos };
  }
  sim.setPartyLootMaster(true, 0, 'uncommon', me);

  // Hijack a live world mob into a freshly tapped corpse next to the party, so the
  // loot path is the real one (no createMob import is reachable from the page).
  const mob = [...sim.entities.values()].find((e) => e.kind === 'mob' && !e.dead);
  if (!mob) return { ok: false, reason: 'no mob available in the generated world' };
  mob.pos = { x: player.pos.x, y: player.pos.y, z: player.pos.z + 2 };
  mob.prevPos = { ...mob.pos };
  mob.dead = true;
  mob.lootable = true;
  mob.tappedById = me;
  mob.loot = { copper: 0, items: [{ itemId: 'greyjaw_hide_boots', count: 1 }] };
  sim.lootCorpse(mob.id, me);
  const roll = sim.activeMasterLootRolls
    ? sim.activeMasterLootRolls(me)[0]
    : { rollId: null, candidates: [] };
  return { ok: true, me, berta, cara, rollId: roll?.rollId ?? null };
});
if (!staged.ok) throw new Error(staged.reason);
await sleep(800);

// The fixed clip: the prompt's own box while it is up, padded. Reused for all three
// frames so the empty states are the SAME region, not a shrunken one.
const box = await page.evaluate(() => {
  const el = document.querySelector('#loot-rolls');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
});
if (!box || box.width === 0) throw new Error('the master-loot prompt never rendered');
const clip = {
  x: Math.max(0, box.x - 16),
  y: Math.max(0, box.y - 16),
  width: box.width + 32,
  height: box.height + 32,
};
// Reads the row state and shoots in one step, and reports both, so a frame that
// drifted past the moment it is named for cannot pass unnoticed.
const shots = [];
async function capture(name) {
  const state = await page.evaluate(() => {
    const row = document.querySelector('#loot-rolls .loot-roll.master');
    if (!row) return { shown: false, candidates: [] };
    return { shown: true, candidates: [...row.querySelectorAll('.ml-pick')].map((p) => p.value) };
  });
  await page.screenshot({ path: `${PREFIX}${name}.png`, clip });
  shots.push({ name, ...state });
  return state;
}

await capture('1-prompt');

// Cara logs out during the curate window, so the sim drops her from the roll while
// the already-rendered checkbox list still offers her.
await page.evaluate((cara) => window.__game.sim.removePlayer(cara), staged.cara);
await sleep(400);

// Assign to exactly that departed candidate, through the real controls.
const clicked = await page.evaluate(() => {
  const row = document.querySelector('#loot-rolls .loot-roll.master');
  if (!row) return { ok: false, reason: 'no master row on screen' };
  const picks = [...row.querySelectorAll('.ml-pick')];
  const target = picks[picks.length - 1];
  if (!target) return { ok: false, reason: 'no candidate checkboxes' };
  target.checked = true;
  target.dispatchEvent(new Event('change'));
  const roll = row.querySelector('.ml-roll');
  if (!roll || roll.disabled) return { ok: false, reason: 'roll button stayed disabled' };
  roll.click();
  return { ok: true, pid: target.value };
});
if (!clicked.ok) throw new Error(clicked.reason);
await sleep(150);
const refused = await capture('2-refused');
if (refused.shown) throw new Error('the row was still up when the refused frame was taken');

// Past the re-show grace (LOOT_ROLL_REGRACE_MS is 2s), with frames still running.
// On the base tree this stays empty until MASTER_LOOT_TIMEOUT, which is the bug.
await sleep(4000);
await capture('3-restored');

await browser.close();
console.log(`assigned to the departed pid ${clicked.pid}`);
for (const shot of shots) console.log(`  ${PREFIX}${shot.name}.png`, JSON.stringify(shot));
