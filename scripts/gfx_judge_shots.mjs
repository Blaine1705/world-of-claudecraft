// Visual-judgement capture pass for the graphics overhaul: a portfolio of
// staged screenshots across every graphics tier, plus FPS at the scenic ultra
// locations so the perf story travels with the pictures.
//
// Same rules as scripts/gfx_ab_shot.mjs (read that first): real GPU via ANGLE,
// shared enterOfflineGame entry, pre-boot settings seeded with
// evaluateOnNewDocument, tier forced with ?gfx=<tier>, GM flag so camp mobs
// cannot interrupt a capture, teleport by writing sim.player.pos + input.cam*.
//
// Two things this adds over the A/B harness, both because it runs against a
// worktree that is being edited live:
//   - every shot re-checks window.__game and re-enters the world if a vite HMR
//     reload swallowed it, so one save mid-run costs one shot, not the run;
//   - the town and campfire shots are staged RELATIVE to the spawn point and to
//     fire lights found in the live scene, so they still frame something when
//     the map's absolute coordinates move under us.
//
// Needs `npm run dev -- --port 5173 --strictPort` running in another terminal.
// Usage:  node scripts/gfx_judge_shots.mjs
// Env:    GAME_URL (default http://localhost:5173), SHOT_OUT (default
//         tmp/gfx-photos), SHOT_ONLY (comma-separated names), SHOT_TIERS
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';

const BASE_URL = process.env.GAME_URL ?? 'http://localhost:5173';
const OUT = process.env.SHOT_OUT ?? 'tmp/gfx-photos';
fs.mkdirSync(OUT, { recursive: true });

const LAUNCH_ARGS = [
  '--window-size=1600,900',
  '--ignore-gpu-blocklist',
  '--enable-gpu-rasterization',
  '--use-gl=angle',
  '--use-angle=gl',
  '--enable-webgl',
  '--no-sandbox',
];

// Camera convention (render/renderer.ts updateCamera): the camera sits at
// player - (sin yaw, cos yaw) * dist and looks through the player, so what is
// AHEAD in frame lies at bearing (sin yaw, cos yaw). camPitch clamps to
// [-0.4, 1.35]: POSITIVE lifts the camera and looks down, negative drops it and
// looks up (the skyline framing the A/B shots use). camDist clamps [3, 22].
//
// `at` picks the staging anchor: 'world' uses x/z as absolute coordinates,
// 'spawn' offsets them from the spawn point, 'fire' aims at the nearest warm
// point light (campfire/brazier) and ignores x/z.
const SHOTS = [
  // --- ultra: the four scenic A/B locations (FPS measured here) ------------
  { name: 'ultra_vale_meadow', tier: 'ultra', x: 20, z: 40, yaw: 0.6, pitch: -0.32, fps: true },
  { name: 'ultra_vale_lake', tier: 'ultra', x: -60, z: -80, yaw: 0.6, pitch: -0.33, fps: true },
  { name: 'ultra_marsh_rain', tier: 'ultra', x: 60, z: 360, yaw: 0.5, pitch: -0.3, fps: true },
  { name: 'ultra_peaks_snow', tier: 'ultra', x: 40, z: 720, yaw: 0.5, pitch: -0.25, fps: true },

  // --- ultra: town close-ups on the window/glass emissives -----------------
  { name: 'ultra_town_inn', tier: 'ultra', at: 'spawn', x: -10.5, z: 11.5, yaw: -0.588, pitch: -0.1, dist: 9 },
  { name: 'ultra_town_smithy', tier: 'ultra', at: 'spawn', x: 4, z: 13, yaw: 0.168, pitch: -0.08, dist: 9 },
  { name: 'ultra_town_armoury', tier: 'ultra', at: 'spawn', x: 11, z: -7, yaw: 1.648, pitch: -0.15, dist: 10 },
  { name: 'ultra_town_square', tier: 'ultra', at: 'spawn', x: 0, z: 10, yaw: 3.1416, pitch: -0.18, dist: 14, fps: true },
  { name: 'ultra_town_bank', tier: 'ultra', at: 'spawn', x: 12, z: 6, yaw: 1.35, pitch: -0.1, dist: 9 },

  // --- ultra: flames --------------------------------------------------------
  { name: 'ultra_fire_close', tier: 'ultra', at: 'fire', dist: 5, pitch: 0.05 },
  { name: 'ultra_fire_wide', tier: 'ultra', at: 'fire', dist: 11, pitch: -0.15, back: 6 },

  // --- ultra: grass + ground material detail --------------------------------
  { name: 'ultra_grass_top', tier: 'ultra', x: 22, z: 44, yaw: 0.9, pitch: 1.0, dist: 4 },
  { name: 'ultra_grass_top_b', tier: 'ultra', x: 22, z: 44, yaw: 0.9, pitch: 1.0, dist: 4, reuse: true },
  { name: 'ultra_grass_low', tier: 'ultra', x: 22, z: 44, yaw: 0.9, pitch: 0.1, dist: 5 },
  { name: 'ultra_grass_far', tier: 'ultra', x: 22, z: 44, yaw: 0.9, pitch: -0.1, dist: 20 },
  { name: 'ultra_ground_road', tier: 'ultra', at: 'spawn', x: 16, z: 1.6, yaw: 1.446, pitch: 0.22, dist: 5 },
  { name: 'ultra_ground_rock', tier: 'ultra', x: 30, z: 700, yaw: 0.5, pitch: 0.3, dist: 6 },
  { name: 'ultra_ground_dirt', tier: 'ultra', at: 'spawn', x: 8, z: 0, yaw: 1.3, pitch: 0.5, dist: 4 },

  // --- high: SMAA + bloom path ---------------------------------------------
  { name: 'high_town_inn', tier: 'high', at: 'spawn', x: -10.5, z: 11.5, yaw: -0.588, pitch: -0.1, dist: 9 },
  { name: 'high_town_square', tier: 'high', at: 'spawn', x: 0, z: 10, yaw: 3.1416, pitch: -0.18, dist: 14 },
  { name: 'high_vale_meadow', tier: 'high', x: 20, z: 40, yaw: 0.6, pitch: -0.32, fps: true },

  // --- medium: NO bloom, but the raised emissives still apply ---------------
  { name: 'medium_town_inn', tier: 'medium', at: 'spawn', x: -10.5, z: 11.5, yaw: -0.588, pitch: -0.1, dist: 9 },
  { name: 'medium_town_square', tier: 'medium', at: 'spawn', x: 0, z: 10, yaw: 3.1416, pitch: -0.18, dist: 14 },
  { name: 'medium_town_armoury', tier: 'medium', at: 'spawn', x: 11, z: -7, yaw: 1.648, pitch: -0.15, dist: 10 },
  { name: 'medium_fire_close', tier: 'medium', at: 'fire', dist: 5, pitch: 0.05 },
  { name: 'medium_vale_meadow', tier: 'medium', x: 20, z: 40, yaw: 0.6, pitch: -0.32, fps: true },

  // --- low: Lambert path, sanity only --------------------------------------
  { name: 'low_vale_meadow', tier: 'low', x: 20, z: 40, yaw: 0.6, pitch: -0.32, fps: true },
  { name: 'low_town_inn', tier: 'low', at: 'spawn', x: -10.5, z: 11.5, yaw: -0.588, pitch: -0.1, dist: 9 },
];

const ONLY = process.env.SHOT_ONLY ? process.env.SHOT_ONLY.split(',') : null;
const TIERS = process.env.SHOT_TIERS
  ? process.env.SHOT_TIERS.split(',')
  : ['ultra', 'high', 'medium', 'low'];
const ACTIVE = SHOTS.filter((s) => TIERS.includes(s.tier)).filter(
  (s) => !ONLY || ONLY.includes(s.name),
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const samples = [];
const errors = [];
const notes = [];

const SETTINGS_SEED = () => {
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
};

for (const tier of TIERS) {
  const shots = ACTIVE.filter((s) => s.tier === tier);
  if (!shots.length) continue;

  const browser = await puppeteer.launch({
    executablePath: BROWSER_PATH,
    headless: 'new',
    args: LAUNCH_ARGS,
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(`[${tier}] PAGEERROR: ` + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[${tier}] CONSOLE: ` + m.text());
  });

  // Preset 5 (Advanced) with every sub-knob at 1 leaves the tier defaults
  // untouched (gfx.ts only DOWNGRADES from the advanced hints), so each tier
  // renders its own shipped ceiling rather than a hand-nerfed variant.
  await page.evaluateOnNewDocument(SETTINGS_SEED);
  await page.goto(`${BASE_URL}?gfx=${tier}`, { waitUntil: 'networkidle0', timeout: 90000 });

  let reloads = 0;
  const enter = async () => {
    await enterOfflineGame(page, { charClass: 'warrior', charName: 'Probe', settleMs: 2500 });
    await page.waitForFunction(() => Boolean(window.__game?.sim?.player), { timeout: 60000 });
  };
  const ensureGame = async () => {
    const alive = await page
      .evaluate(() => Boolean(window.__game?.sim?.player))
      .catch(() => false);
    if (alive) return false;
    reloads++;
    await enter();
    return true;
  };
  await enter();

  const spawn = await page.evaluate(() => ({
    x: window.__game.sim.player.pos.x,
    z: window.__game.sim.player.pos.z,
  }));
  notes.push(`[${tier}] spawn ${spawn.x.toFixed(1)}, ${spawn.z.toFixed(1)}`);

  for (const shot of shots) {
    if (!shot.reuse) {
      await ensureGame();
      const placed = await page.evaluate(
        (p) => {
          const g = window.__game;
          const player = g.sim.player;
          player.gm = true;
          player.hp = player.maxHp;
          let x = p.x ?? 0;
          let z = p.z ?? 0;
          let yaw = p.yaw ?? 0;
          if (p.at === 'spawn') {
            x += p.spawnX;
            z += p.spawnZ;
          } else if (p.at === 'fire') {
            // Warm point lights are the campfire/brazier fire lights (props.ts
            // adds one per flame). Stand `back` metres from the closest one and
            // face it, so the shot frames a fire wherever the map put it.
            const lights = [];
            g.renderer.scene.traverse((o) => {
              if (!o.isPointLight || o.intensity <= 0) return;
              if (!(o.color.r > o.color.g && o.color.g >= o.color.b)) return;
              const v = new o.position.constructor();
              o.getWorldPosition(v);
              lights.push(v);
            });
            if (!lights.length) return { ok: false, reason: 'no fire lights in scene' };
            lights.sort(
              (a, b) =>
                Math.hypot(a.x - player.pos.x, a.z - player.pos.z) -
                Math.hypot(b.x - player.pos.x, b.z - player.pos.z),
            );
            const fire = lights[0];
            const back = p.back ?? 3.5;
            // stand back along +x/+z diagonal from the fire, then look at it
            const ang = 2.2;
            x = fire.x + Math.sin(ang) * back;
            z = fire.z + Math.cos(ang) * back;
            yaw = Math.atan2(fire.x - x, fire.z - z);
            return applyPose();
            function applyPose() {
              player.pos.x = x;
              player.pos.z = z;
              player.facing = yaw;
              g.input.camYaw = yaw;
              g.input.camPitch = p.pitch;
              g.input.camDist = p.dist ?? 12;
              g.renderer.camDist = p.dist ?? 12;
              return { ok: true, x, z, yaw, fire: { x: fire.x, z: fire.z } };
            }
          }
          player.pos.x = x;
          player.pos.z = z;
          player.facing = yaw;
          g.input.camYaw = yaw;
          g.input.camPitch = p.pitch;
          g.input.camDist = p.dist ?? 12;
          g.renderer.camDist = p.dist ?? 12;
          return { ok: true, x, z, yaw };
        },
        { ...shot, spawnX: spawn.x, spawnZ: spawn.z },
      );
      if (!placed.ok) {
        notes.push(`[${shot.name}] SKIPPED: ${placed.reason}`);
        continue;
      }
      notes.push(
        `[${shot.name}] at ${placed.x.toFixed(1)}, ${placed.z.toFixed(1)} yaw ${placed.yaw.toFixed(2)}` +
          (placed.fire ? ` fire ${placed.fire.x.toFixed(1)}, ${placed.fire.z.toFixed(1)}` : ''),
      );
      // Terrain/foliage stream in and precipitation cross-fades over ~2s; give
      // the world a long settle so nothing pops in mid-capture.
      await sleep(shot.fps ? 6000 : 10000);
    } else {
      // Wind/animation delta frame: same pose, 1.5s later.
      await sleep(1500);
    }

    // A reload between the teleport and the shutter would photograph the spawn
    // point instead of the staged pose: redo the shot rather than file a lie.
    if (await ensureGame()) {
      notes.push(`[${shot.name}] page reloaded mid-shot, retrying`);
      shots.push({ ...shot, reuse: false });
      continue;
    }

    if (shot.fps) {
      await page.evaluate(() => window.__game.perf.reset());
      await sleep(6000);
      if (await ensureGame()) {
        notes.push(`[${shot.name}] reloaded during FPS window, retrying`);
        shots.push({ ...shot, reuse: false });
        continue;
      }
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
        };
      }, shot.name);
      samples.push(s);
      console.log(
        `${s.name.padEnd(22)} fps=${s.fps} p95=${s.frameP95}ms long50=${s.long50} tier=${s.tier} calls=${s.calls} tris=${s.triangles}`,
      );
    }

    await page.screenshot({ path: `${OUT}/${shot.name}.png` });
    if (!shot.fps) console.log(`${shot.name.padEnd(22)} captured`);
  }
  notes.push(`[${tier}] reload recoveries: ${reloads}`);
  await browser.close();
}

fs.writeFileSync(`${OUT}/judge_fps.json`, JSON.stringify({ samples, notes }, null, 2));
console.log('\n' + notes.join('\n'));
console.log(`\nwrote ${OUT}/judge_fps.json`);
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 20).join('\n') : 'no page errors');
