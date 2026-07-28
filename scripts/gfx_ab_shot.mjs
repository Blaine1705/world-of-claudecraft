// Graphics A/B harness: boot the offline client at max graphics on a REAL GPU,
// teleport to scenic locations, screenshot, and record FPS + draw stats to JSON.
// Run the same script on the base commit and on the change, then diff the JSON.
//
// Needs `npm run dev -- --port 5173 --strictPort` running in another terminal.
// Usage:  node scripts/gfx_ab_shot.mjs
// Env:    GAME_URL (default http://localhost:5173), SHOT_TAG (before|after),
//         BROWSER_PATH, SHOT_OUT (default tmp/gfx-ab)
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';

const BASE_URL = process.env.GAME_URL ?? 'http://localhost:5173';
const TAG = process.env.SHOT_TAG ?? 'run';
const OUT = process.env.SHOT_OUT ?? 'tmp/gfx-ab';
// ?gfx=<tier> forces the tier even on software GL (render/gfx.ts forcedTierFromSearch).
const TIER = process.env.SHOT_TIER ?? 'ultra';
const URL = `${BASE_URL}${BASE_URL.includes('?') ? '&' : '?'}gfx=${TIER}`;
fs.mkdirSync(OUT, { recursive: true });

// Real hardware GPU via ANGLE, never swiftshader: a software-GL capture does not
// reflect shipped visual quality and its FPS number is meaningless.
const LAUNCH_ARGS = [
  '--window-size=1600,900',
  '--ignore-gpu-blocklist',
  '--enable-gpu-rasterization',
  '--use-gl=angle',
  '--use-angle=gl',
  '--enable-webgl',
  '--no-sandbox',
];

// Weather and lighting are BIOME-derived, not time-driven: there is no day/night
// cycle. peaks => snow + dawn HDRI, marsh => rain + overcast HDRI, vale => day HDRI.
// Staging "different lighting" means teleporting to a different zone.
const LOCATIONS = [
  { name: 'vale_hub', x: 20, z: 40, yaw: 0.6, pitch: -0.35 },
  { name: 'vale_lake', x: -60, z: -80, yaw: 0.6, pitch: -0.35 },
  { name: 'marsh_rain', x: 60, z: 360, yaw: 0.5, pitch: -0.3 },
  { name: 'peaks_snow', x: 40, z: 720, yaw: 0.5, pitch: -0.25 },
  // Eastbrook civic center is world (0, 2): stand SE of it looking back at the
  // town square so windows/lamps/bloom on buildings are in frame.
  { name: 'eastbrook_town', x: 13, z: 15, yaw: 2.45, pitch: -0.2 },
  // Player-style angles: high camera pitched down at the meadow, and a road
  // closeup, both of which exposed the double-sided card blackout.
  { name: 'topdown_meadow', x: 20, z: 40, yaw: 0.6, pitch: -0.62 },
  { name: 'road_closeup', x: 2, z: 52, yaw: 0.4, pitch: -0.75 },
];

const ONLY = process.env.SHOT_ONLY ? process.env.SHOT_ONLY.split(',') : null;
const ACTIVE = ONLY ? LOCATIONS.filter((l) => ONLY.includes(l.name)) : LOCATIONS;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  args: LAUNCH_ARGS,
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('CONSOLE: ' + m.text());
});

// Preset 5 (Advanced) with every sub-knob at 1 is the shipped visual ceiling;
// showFps turns the perf overlay on so FPS is legible in the capture itself.
await page.evaluateOnNewDocument(() => {
  localStorage.setItem(
    'woc_settings',
    JSON.stringify({
      graphicsPreset: 5,
      terrainDetail: 1,
      foliageDensity: 1,
      effectsQuality: 1,
      shadowQuality: 1,
      renderScale: 1,
      browserEffects: 1,
      showFps: true,
    }),
  );
  localStorage.setItem('woc_perf_overlay', JSON.stringify({ metrics: { gpu: true } }));
});

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 90000 });
await enterOfflineGame(page, { charClass: 'warrior', charName: 'Probe', settleMs: 2500 });

// GM flag no-ops every damage path (sim/combat/damage.ts), so camp mobs never
// interrupt a capture or skew the frame time with combat VFX.
await page.waitForFunction(() => Boolean(window.__game?.sim?.player), { timeout: 60000 });
await page.evaluate(() => {
  window.__game.sim.player.gm = true;
});

const samples = [];
for (const loc of ACTIVE) {
  await page.evaluate((p) => {
    const g = window.__game;
    const player = g.sim.player;
    player.gm = true;
    player.hp = player.maxHp;
    player.pos.x = p.x;
    player.pos.z = p.z;
    player.facing = p.yaw;
    g.input.camYaw = p.yaw;
    g.input.camPitch = p.pitch;
  }, loc);

  // Terrain streams in and precipitation cross-fades over ~2s; then reset the
  // frame meter so the measured window contains no streaming hitches.
  await sleep(5000);
  await page.evaluate(() => window.__game.perf.reset());
  await sleep(6000);

  const s = await page.evaluate((name) => {
    const r = window.__game.perf.report();
    const rr = r.renderer;
    return {
      name,
      fps: r.fps,
      fps10s: r.windows?.last10s?.fps,
      frameP95: r.frameMs.p95,
      frameP99: r.frameMs.p99,
      long50: r.frameMs.long50,
      tier: rr?.tier,
      calls: rr?.calls,
      triangles: rr?.triangles,
      programs: rr?.programs,
      textures: rr?.textures,
    };
  }, loc.name);
  samples.push(s);
  console.log(
    `${s.name.padEnd(14)} fps=${s.fps} p95=${s.frameP95}ms long50=${s.long50} tier=${s.tier} calls=${s.calls} tris=${s.triangles}`,
  );

  await page.screenshot({ path: `${OUT}/${TAG}_${loc.name}.png` });
}

fs.writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify({ tag: TAG, samples }, null, 2));
console.log(`wrote ${OUT}/${TAG}.json and ${LOCATIONS.length} PNGs`);
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 15).join('\n') : 'no page errors');
await browser.close();
