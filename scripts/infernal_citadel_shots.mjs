// Infernal Citadel visual E2E: enter offline, open the authored set-piece rift via
// window.__game.world, and screenshot each of its seven rooms plus both bosses and
// the Blood Orb states, to eyeball the layout and confirm the authored render path
// (rooms, doors, Tripo decor, pentagram) throws nothing.
// Needs `npm run dev` running (offline enables devCommands in the vite dev server).

import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5174';
const OUT = process.env.SHOT_DIR ?? 'tmp/citadel';
fs.mkdirSync(OUT, { recursive: true });

const errors = [];
// One viewport per run (a mid-run setViewport with isMobile tears down the page
// context and loses window.__game): pass MOBILE=1 for the landscape-phone pass.
const mobile = process.env.MOBILE === '1';
const vp = mobile
  ? { width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  : { width: 1280, height: 760 };
const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  protocolTimeout: 60000,
  args: [
    `--window-size=${vp.width},${vp.height}`,
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
  defaultViewport: vp,
});
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`);
});

console.log('loading + entering offline...');
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
// The shared entry helper drives Play Offline -> name -> class -> Enter World and
// dismisses the touch preflight, which the phone viewport gates the world behind.
await enterOfflineGame(page, { charName: 'Pactbreaker', settleMs: 2500 });
await page.waitForFunction(() => !!window.__game?.world?.player, { timeout: 30000, polling: 200 });
await page.evaluate(() => window.__game.world.chat('/dev god', window.__game.world.player.id));

async function tick(frames = 40) {
  await page.evaluate(async (n) => {
    for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r));
  }, frames);
}

// The first seed that opens the citadel (isSetPieceSeed is pure; mirror its roll by
// asking the sim which one it built).
const seed = Number(process.env.CITADEL_SEED ?? 5);
await page.evaluate(
  (s) => window.__game.world.enterRift(s, 22, window.__game.world.player.id),
  seed,
);
await tick(70);

const floor = await page.evaluate(() => window.__game.world.riftFloor);
console.log(`entered: ${JSON.stringify(floor)}`);

/** Park the camera at an instance-local spot looking along `facing`, then shoot. */
async function shoot(label, lx, lz, facing = 0) {
  await page.evaluate(
    (x, z, f) => {
      const w = window.__game.world;
      const origin = window.__riftOrigin;
      w.player.pos = { x: origin.x + x, y: w.player.pos.y, z: origin.z + z };
      w.player.prevPos = { ...w.player.pos };
      w.player.facing = f;
      w.player.hp = w.player.maxHp;
    },
    lx,
    lz,
    facing,
  );
  await tick(35);
  await page.screenshot({ path: `${OUT}/${label}.png` });
  console.log(`shot ${label} at (${lx}, ${lz})`);
}

// Publish the instance origin once so `shoot` can work in instance-local coords.
await page.evaluate(() => {
  const w = window.__game.world;
  // The player spawned at the floor's entry (0, -11): origin = pos - entry.
  window.__riftOrigin = { x: w.player.pos.x, z: w.player.pos.z + 11 };
});

await shoot('01_entrance', 0, -14, 0);
await shoot('02_sacrificial_hall', 0, 14, 0);
await shoot('03_altar_orb_dormant', 0, 34, 0);
await shoot('04_relic_gallery', 26, 14, 0);
await shoot('05_west_gallery', -25, 30, 0);
await shoot('06_pentagram_miniboss', -26, 2, Math.PI); // look south down onto the sigil

// Kill the ritualist: the orb wakes.
await page.evaluate(() => {
  const w = window.__game.world;
  const inst = w.riftInstances.find((i) => i.partyKey !== null);
  const mini = w.entities.get(inst.minibossId);
  if (mini) {
    mini.hp = 0;
    mini.dead = true;
  }
});
await tick(45); // let the 1 Hz driver arm the orb
await shoot('07_altar_orb_active', 0, 34, 0);

// Touch it: the portcullis opens.
await shoot('08_gate_opens', 0, 37.8, 0);
await tick(25);
const gate = await page.evaluate(() => {
  const w = window.__game.world;
  const inst = w.riftInstances.find((i) => i.partyKey !== null);
  return { orbActive: inst.orbActive, gateOpen: inst.gateOpen };
});
console.log(`gate state: ${JSON.stringify(gate)}`);

await shoot('09_bone_chamber', -26, 84, 0);
await shoot('10_hell_forge', 26, 66, 0);
await shoot('11_great_temple', 0, 56, 0);
// Stand in front of the pit lord and face him.
await shoot('12_pitlord', 0, 71, 0);
await shoot('13_demon_idol', 0, 86, 0);

const bossInfo = await page.evaluate(() => {
  const w = window.__game.world;
  const inst = w.riftInstances.find((i) => i.partyKey !== null);
  const boss = inst?.bossId != null ? w.entities.get(inst.bossId) : null;
  return { name: boss?.name, scale: boss?.scale, hp: boss?.maxHp, mobs: inst?.mobIds.length };
});
console.log(`boss: ${JSON.stringify(bossInfo)}`);

await browser.close();
console.log(`\nerrors during run: ${errors.length}`);
for (const e of errors.slice(0, 12)) console.log(`  ${e}`);
process.exit(errors.length ? 1 : 0);
