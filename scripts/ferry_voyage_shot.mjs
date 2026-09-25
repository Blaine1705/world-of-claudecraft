// Owner-facing captures of the Eastbrook ferry's Phase 3 (the walkable
// moving deck and the voyage in sight): walking the deck at sea, the ship
// sailing past seen from the shore, the view from the forecastle with the
// wake, the arrival at Wickharbor, and a short clip of a walk on the deck
// while the ship turns. Offline client, dev build (the /dev ferry commands
// are dev-only), driven through window.__game and the real keyboard.
//
// Needs `npx vite --port <port>` running (GAME_URL, default
// http://localhost:5178). Writes PNGs (and deck_walk.gif when ffmpeg-static
// is installed) to SHOTS_DIR (default tmp/ferry-voyage).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5178';
const OUT = process.env.SHOTS_DIR ?? 'tmp/ferry-voyage';
const PRESET = Number(process.env.GRAPHICS_PRESET ?? 2);
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  args: ['--window-size=1280,720', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.evaluateOnNewDocument(`
  try { localStorage.setItem('woc_settings', JSON.stringify({ graphicsPreset: ${PRESET} })); } catch {}
`);
await page.goto(URL, { waitUntil: 'networkidle0', timeout: 120000 });
const booted = await enterOfflineGame(page, {
  charClass: 'warrior',
  charName: 'Deckhand',
  gameBootTimeoutMs: 180000,
  selectorTimeoutMs: 90000,
});
if (!booted) throw new Error('offline world did not boot');
await sleep(1500);

/** Run a string-form async body in the page (no bundler-injected helpers). */
function run(body) {
  return page.evaluate(`(async () => { ${body} })()`);
}

// Level up (the vale's mobs must not decide a capture), and bring the
// schedule module in for the clock arithmetic.
await run(`
  const g = window.__game;
  g.sim.setPlayerLevel(60);
  window.__ferry = await import('/src/sim/transport_schedule.ts');
  window.__ships = await import('/src/sim/content/transport_ships.ts');
  window.__deck = await import('/src/sim/transport_deck.ts');
`);

/** Set the ferry clock to `clock` seconds of the cycle. */
async function setClock(clock) {
  await run(`
    const g = window.__game;
    g.sim.transportClockOffset = ${clock} - g.sim.time;
  `);
}

/** The voyage second (lane 0, Eastbrook to Wickharbor) nearest a world point. */
async function voyageSecondNear(x, z) {
  return run(`
    const { EASTBROOK_WICKHARBOR_FERRY: R } = window.__ships;
    const F = window.__ferry;
    const p = { x: 0, z: 0, rot: 0 };
    let best = 0, bestD = Infinity;
    const T = F.transportVoyageSeconds(R, 0);
    for (let t = 0; t < T; t += 0.25) {
      F.transportShipPoseAt(R, R.timings.docked + t, p);
      const d = Math.hypot(p.x - ${x}, p.z - ${z});
      if (d < bestD) { bestD = d; best = t; }
    }
    return best;
  `);
}

/** Stand the player at (x, z) on the ground, facing `facing`, camera at yaw. */
async function standAt(x, z, facing, yaw, pitch, dist) {
  await run(`
    const g = window.__game;
    const p = g.sim.player;
    const pos = g.sim.groundPos(${x}, ${z});
    p.pos = { ...pos };
    p.prevPos = { ...pos };
    p.facing = ${facing};
    p.prevFacing = ${facing};
    p.vx = 0; p.vy = 0; p.vz = 0;
    g.renderer.camYaw = ${yaw};
    g.renderer.camPitch = ${pitch};
    g.renderer.camDist = ${dist};
  `);
}

/** Board the ship wherever it is and aim the camera relative to its bow;
 *  `aft` moves the player that far aft of the waist boarding spot first. */
async function board(yawOffBow, pitch, dist, facingOffBow = 0, aft = 0) {
  await run(`
    const g = window.__game;
    g.sim.chat('/dev ferry board');
    const F = window.__ferry;
    const { EASTBROOK_WICKHARBOR_FERRY: R } = window.__ships;
    const pose = F.transportShipPoseAt(R, g.sim.time + g.sim.transportClockOffset, { x: 0, z: 0, rot: 0 });
    const p = g.sim.player;
    if (${aft} !== 0) {
      const at = window.__deck.deckToWorld(pose, 0, 4 - ${aft}, { x: 0, z: 0 });
      p.pos.x = at.x;
      p.pos.z = at.z;
      p.pos.y = -4.3 + ${aft > 9 ? 6.3 : 3.3};
      p.prevPos = { ...p.pos };
    }
    p.facing = pose.rot + ${facingOffBow};
    p.prevFacing = p.facing;
    g.renderer.camYaw = pose.rot + ${yawOffBow};
    g.renderer.camPitch = ${pitch};
    g.renderer.camDist = ${dist};
  `);
}

/** Keep the camera's yaw locked relative to the ship's bow for `ms`. */
async function holdCamera(yawOffBow, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    await run(`
      const g = window.__game;
      const F = window.__ferry;
      const { EASTBROOK_WICKHARBOR_FERRY: R } = window.__ships;
      const pose = F.transportShipPoseAt(R, g.sim.time + g.sim.transportClockOffset, { x: 0, z: 0, rot: 0 });
      g.renderer.camYaw = pose.rot + ${yawOffBow};
    `);
    await sleep(100);
  }
}

async function shot(name) {
  if (ONLY && !ONLY.has(name)) return;
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  console.log('wrote', file);
}

const want = (name) => !ONLY || ONLY.has(name);
const DOCKED = 60;

// 1) Walking the deck at sea, on the long southern reach at cruise.
if (want('deck_walk_at_sea')) {
  await setClock(DOCKED + 45);
  await board(0, 0.28, 11);
  // software rendering runs a frame or two a second: let the dev boarding's
  // HUD transients (the breath bar's linger) run out first
  await sleep(10000);
  await page.keyboard.down('w');
  await holdCamera(0, 1200);
  await shot('deck_walk_at_sea');
  await page.keyboard.up('w');
}

// 2) From the quarterdeck, looking aft over the taffrail at the wake.
if (want('deck_view_wake')) {
  await setClock(DOCKED + 50);
  await board(Math.PI, 0.5, 20, Math.PI, 16);
  await holdCamera(Math.PI, 4000);
  await shot('deck_view_wake');
}

// 3) The ship sailing past, seen from the shore of the vale's south coast.
if (want('ship_from_shore')) {
  const t = await voyageSecondNear(-40, -180);
  await setClock(DOCKED + t - 6);
  await standAt(-40, -140, Math.PI, Math.PI, 0.18, 16);
  // keep the camera on the ship as it passes
  const until = Date.now() + 5000;
  while (Date.now() < until) {
    await run(`
      const g = window.__game;
      const F = window.__ferry;
      const { EASTBROOK_WICKHARBOR_FERRY: R } = window.__ships;
      const s = F.transportShipPoseAt(R, g.sim.time + g.sim.transportClockOffset, { x: 0, z: 0, rot: 0 });
      const p = g.sim.player;
      g.renderer.camYaw = Math.atan2(s.x - p.pos.x, s.z - p.pos.z) + 0.25;
    `);
    await sleep(150);
  }
  await shot('ship_from_shore');
}

// 4) Casting off from Eastbrook, seen from the ferry pier.
if (want('departure_eastbrook')) {
  await setClock(DOCKED + 7);
  await standAt(-110, -54, -Math.PI / 2, -Math.PI / 2 - 0.35, 0.22, 14);
  await sleep(2500);
  await shot('departure_eastbrook');
}

// 5) Arriving at Wickharbor, seen from the deepwater pier.
if (want('arrival_wickharbor')) {
  const voyage = await run(`
    const { EASTBROOK_WICKHARBOR_FERRY: R } = window.__ships;
    return window.__ferry.transportVoyageSeconds(R, 0);
  `);
  await setClock(DOCKED + voyage - 9);
  await standAt(466, 378, 0.4, -0.2, 0.2, 18);
  await sleep(4500);
  await shot('arrival_wickharbor');
}

// 6) A short clip: walking forward on the deck while the ship turns through
// the western strait's elbow.
if (want('deck_walk_clip')) {
  await setClock(DOCKED + 14);
  await board(0, 0.3, 12);
  await sleep(1200);
  const frames = path.join(OUT, 'clip');
  fs.mkdirSync(frames, { recursive: true });
  await page.keyboard.down('w');
  for (let i = 0; i < 45; i++) {
    if (i === 20) {
      await page.keyboard.up('w');
      await page.keyboard.down('d');
    }
    if (i === 30) await page.keyboard.up('d');
    await page.screenshot({ path: path.join(frames, `f${String(i).padStart(3, '0')}.png`) });
    await sleep(80);
  }
  await page.keyboard.up('w');
  try {
    const ffmpeg = (await import('ffmpeg-static')).default;
    execFileSync(ffmpeg, [
      '-y',
      '-framerate',
      '8',
      '-i',
      path.join(frames, 'f%03d.png'),
      '-vf',
      'scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
      path.join(OUT, 'deck_walk.gif'),
    ]);
    console.log('wrote', path.join(OUT, 'deck_walk.gif'));
  } catch (err) {
    console.log('no gif (ffmpeg unavailable):', String(err).slice(0, 200));
  }
}

await browser.close();
