// Proving Shore camp visuals: the Dawnrest Camp declutter (loose crates gone,
// mailbox off the outfitter's stall), the guild notice board that replaced
// them, the pier ferry bell stood clear of the planks, and the Eastbrook bell
// beside the town mailbox. Offline flow (no server). Needs `npm run dev`.
//   GAME_URL=http://localhost:5173 node scripts/proving_shore_shots.mjs
// Writes PNGs to tmp/.

import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH as EDGE } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync('tmp', { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  // Same cold-dev-server allowance as the E2E: one CDP call may block while
  // Vite is still transforming the module graph on the page's main thread.
  protocolTimeout: 240_000,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--window-size=1600,960',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
  defaultViewport: { width: 1600, height: 960 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR', e.message));

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await page.evaluate(() => localStorage.clear());
const booted = await enterOfflineGame(page, {
  charClass: 'warrior',
  charName: 'Prover',
  gameBootTimeoutMs: 180_000,
  selectorTimeoutMs: 60_000,
});
if (!booted) throw new Error('offline world did not boot');
await page.evaluate(() => document.querySelector('.gpu-notice-dismiss')?.click());
// The spawn greeting would sit over every shot; dismiss it and take the walk
// to the island by hand instead.
await page.waitForFunction(() => !!document.getElementById('tutorial-greeting'), {
  timeout: 15000,
  polling: 200,
});
await page.evaluate(() => document.querySelector('#tutorial-greeting [data-play]')?.click());
await page.waitForFunction(
  () => {
    const sim = window.__game.sim;
    return sim.entities.get(sim.playerId).pos.x < -180;
  },
  { timeout: 15000, polling: 200 },
);
// Odo's arrival note reuses the greeting shell; close it before shooting.
await sleep(800);
await page.evaluate(() => document.querySelector('#tutorial-greeting [data-close]')?.click());

// Stand the camera where a player would be looking at each subject. Setting
// pos directly is the offline sim's own state, the same thing a walk would
// produce, and the renderer reads it on the next frame; the chase camera is
// aimed through the same input fields the other shot scripts drive.
const stand = async (x, z, yaw, dist = 7, pitch = 0.22) => {
  await page.evaluate(
    ({ px, pz, py, d, pi }) => {
      const g = window.__game;
      const p = g.sim.entities.get(g.sim.playerId);
      p.pos.x = px;
      p.pos.z = pz;
      p.facing = py;
      const inp = g.input;
      inp.camYaw = py;
      inp.camDist = d;
      inp.camPitch = pi;
    },
    { px: x, pz: z, py: yaw, d: dist, pi: pitch },
  );
  await sleep(2500); // terrain + prop streaming under software GL
};

const shot = async (name) => {
  // Odo's note and the zone banner both re-arm as the teleports cross the
  // strait, and either would sit across the subject. Clear the note, then let
  // the banner finish its fade before the shutter.
  await page.evaluate(() => {
    const note = document.getElementById('tutorial-greeting');
    note?.querySelector('button')?.click();
  });
  await sleep(4000);
  await page.screenshot({ path: `tmp/proving-shore-${name}.png` });
  console.log('shot', name);
};

// Aim at a subject rather than guessing a heading: stand a few yards off and
// let the yaw fall out of the bearing to it.
const look = (from, at, opts = {}) =>
  stand(from.x, from.z, Math.atan2(at.x - from.x, at.z - from.z), opts.dist, opts.pitch);

// The camp: notice board at (-308, 50), mailbox at (-306, 56), Finch's stall
// at (-305, 55). Stand east of the cluster looking back across it.
await look({ x: -294, z: 54 }, { x: -306, z: 53 }, { dist: 11, pitch: 0.3 });
await shot('camp-overview');

// The guild notice board, read from its own front standing point.
await look({ x: -304, z: 50 }, { x: -308, z: 50 }, { dist: 5, pitch: 0.12 });
await shot('notice-board');

// The pier bell at (-274, 6), now stood clear of the plank end.
await look({ x: -274, z: 16 }, { x: -274, z: 6 }, { dist: 6, pitch: 0.15 });
await shot('island-bell');

// The Eastbrook bell at (3, -7.5), on the far side of the town mailbox
// (mailbox_eastbrook sits at (0, -7.5)). Shot twice: close, so the bell
// itself reads, and from the square, so the pairing with the mailbox does.
await look({ x: 7, z: -6 }, { x: 3, z: -7.5 }, { dist: 5, pitch: 0.1 });
await shot('town-bell');
await look({ x: 2, z: 1 }, { x: 1.5, z: -7.5 }, { dist: 8, pitch: 0.15 });
await shot('town-bell-square');

await browser.close();
console.log('proving shore shots written to tmp/');
