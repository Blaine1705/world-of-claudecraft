// Evidence shots of the Stormbrass Foundry in a live offline world: the vistas
// (the Lift Landing over the shelf, the coil tower, the Prime Draft landmark),
// every area of the route, the Gantry Hauler's kit and the trash telegraphs,
// the M map, and (phase 2, ids prefixed by the boss) every boss mechanic:
// Tock's belts, lever, press, Parts Drop and Rivet Gun; the Rangewarden's
// Target Lock trail, bunkers, Proof Shot and Drill Drones; the Voltaic
// Warden's plating, flip, Discharge, plated drones, Static Lash and Coil
// Strike; the Prime Draft's waking, Piston Fist, Arm Sweep, Unbolt, Tremor
// Step, storm cells, the carry, the Core Hatch, Overload and Heartless.
// Evidence tooling, not a repo test. A shot id or an id prefix (tock_,
// rangewarden_, voltaic_, prime_) after the out dir filters the run.
//
//   node scripts/stormbrass_foundry_shot.mjs [outDir] [shotId ...]
//
// Env: SHOT_URL (http://127.0.0.1:5200/), SHOT_PRESET (4), SHOT_W / SHOT_H
// (1600x900), SHOT_GPU=0 to force SwiftShader, SHOT_PREFIX (default
// "fundicion_").
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';

const URL = process.env.SHOT_URL ?? 'http://127.0.0.1:5200/';
const OUT = process.argv[2] ?? path.join('tmp', 'stormbrass_foundry');
const ONLY = process.argv.slice(3);
const W = Number(process.env.SHOT_W ?? 1600);
const H = Number(process.env.SHOT_H ?? 900);
const PRESET = Number(process.env.SHOT_PRESET ?? 4);
const PREFIX = process.env.SHOT_PREFIX ?? 'fundicion_';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// at: instance-local spot the player stands on; face: sim radians (0 = +z,
// north up the shelf); the camera orbits at yaw/pitch/dist. `js` steps:
// pull:<templateId> pulls the nearest onto the player. `map`: open the M map.
const SHOTS = [
  { id: 'vista_desde_el_ascensor', at: [0, -228], face: 0, pitch: 0.16, dist: 12 },
  { id: 'vista_alta', at: [0, -228], face: 0, pitch: 0.55, dist: 40 },
  { id: 'patio_de_vias', at: [-30, -186], face: 0.6, pitch: 0.3, dist: 22, keep: 'yard' },
  {
    id: 'transportador_golpe_vapor',
    at: [-26, -160],
    face: 0,
    pitch: 0.42,
    dist: 26,
    keep: 'yard',
    js: 'pull:gantry_hauler',
    stepWait: 1500,
    cmds: ['/dev foundry trigger blast'],
    cmdWait: 700,
    wait: 200,
  },
  {
    id: 'transportador_chatarra',
    at: [-26, -160],
    face: 0,
    pitch: 0.5,
    dist: 30,
    keep: 'yard',
    js: 'pull:gantry_hauler',
    stepWait: 1500,
    cmds: ['/dev foundry trigger toss'],
    cmdWait: 900,
    wait: 200,
  },
  { id: 'terrazas', at: [8, -104], face: 0.3, yaw: 0.5, pitch: 0.45, dist: 20 },
  { id: 'linea_principal', at: [0, -30], face: 0, pitch: 0.62, dist: 17 },
  { id: 'prensa_y_cintas', at: [-20, -36], face: 0.4, yaw: 0.6, pitch: 0.55, dist: 24 },
  { id: 'campo_de_pruebas', at: [-78, -18], face: 0, pitch: 0.32, dist: 20 },
  { id: 'escalera_bobina', at: [56, -40], face: 1.4, pitch: 0.35, dist: 24 },
  { id: 'corona_de_la_bobina', at: [88, -4], face: -0.3, pitch: 0.26, dist: 20 },
  { id: 'puente_grua', at: [0, 26], face: -Math.PI / 2, pitch: 0.28, dist: 18 },
  { id: 'patio_de_planos', at: [0, 50], face: 0, pitch: 0.3, dist: 18 },
  { id: 'aproximacion', at: [0, 118], face: 0, pitch: 0.28, dist: 18 },
  { id: 'gantry_prime_draft', at: [0, 186], face: 0, pitch: 0.16, dist: 14 },
  { id: 'prime_draft_contrapicado', at: [-6, 196], face: 0.1, pitch: -0.05, dist: 9 },
  {
    id: 'centinela_golpe_piston',
    at: [0, 50],
    face: 0,
    pitch: 0.45,
    dist: 16,
    cmds: ['/dev foundry spawn sentry'],
    cmdWait: 11800,
    wait: 300,
  },
  {
    id: 'escudero_pantalla_vapor',
    at: [0, 50],
    face: 0,
    pitch: 0.45,
    dist: 18,
    cmds: ['/dev foundry spawn shieldbearer', '/dev foundry spawn sentry'],
    cmdWait: 2600,
    wait: 400,
  },
  { id: 'mapa_m', at: [0, -40], face: 0, pitch: 0.3, dist: 18, map: true },
  // ---- Phase 2: the boss mechanics (HUD on: cast bars and the Foundry alert).
  // stage: [templateId, yards, angle]: pull that boss and stand `yards` from it
  // along `angle` (sim radians, 0 = north of it), facing it.
  ...bossShots('tock', 'line_master_tock', 14, Math.PI * 1.25, [
    { id: 'cintas_en_marcha', pitch: 0.7, dist: 26, wait: 2500 },
    { id: 'palanca_alarma', cmds: ['lever'], cmdWait: 900, pitch: 0.7, dist: 26 },
    { id: 'cintas_invertidas', cmds: ['lever'], cmdWait: 2600, pitch: 0.7, dist: 26 },
    { id: 'prensa_franja', cmds: ['press'], cmdWait: 900, pitch: 0.8, dist: 28 },
    { id: 'piezas_marcos', cmds: ['parts'], cmdWait: 1600, pitch: 0.55, dist: 22 },
    { id: 'pistola_remaches', cmds: ['rivet'], cmdWait: 500, pitch: 0.35, dist: 14 },
  ]),
  ...bossShots('rangewarden', 'rangewarden', 16, Math.PI, [
    {
      id: 'fijar_objetivo_rastro',
      cmds: ['lock'],
      cmdWait: 300,
      walk: { dx: 1.6, dz: 0, steps: 8, ms: 450 },
      pitch: 0.85,
      dist: 30,
    },
    { id: 'bunker_cubre', cmds: ['lock'], cmdWait: 300, bunker: true, pitch: 0.75, dist: 26 },
    { id: 'disparo_de_prueba', cmds: ['proof'], cmdWait: 900, pitch: 0.35, dist: 14 },
    { id: 'drones_taladro', cmds: ['drones'], cmdWait: 1500, pitch: 0.5, dist: 20 },
  ]),
  ...bossShots('voltaic', 'voltaic_warden', 10, 0, [
    { id: 'blindaje', pitch: 0.45, dist: 16, wait: 2200 },
    { id: 'cambio_de_placas', cmds: ['flip'], cmdWait: 1500, pitch: 0.45, dist: 16 },
    { id: 'descarga', cmds: ['discharge'], cmdWait: 300, pitch: 0.45, dist: 18 },
    { id: 'drones_blindados', cmds: ['platedrones'], cmdWait: 1500, pitch: 0.5, dist: 20 },
    { id: 'latigo_estatico', cmds: ['lash'], cmdWait: 500, pitch: 0.35, dist: 14 },
    { id: 'golpe_de_bobina', cmds: ['strike'], cmdWait: 700, pitch: 0.75, dist: 22 },
  ]),
  ...bossShots('prime', 'prime_draft', 16, Math.PI, [
    { id: 'despertar', pitch: 0.2, dist: 20, wait: 1200 },
    { id: 'puno_piston', cmds: ['fist'], cmdWait: 900, pitch: 0.8, dist: 28 },
    { id: 'barrido_de_brazo', cmds: ['sweep'], cmdWait: 700, pitch: 0.75, dist: 28 },
    { id: 'desatornillado', cmds: ['unbolt'], cmdWait: 1200, pitch: 0.6, dist: 30 },
    { id: 'paso_sismico', cmds: ['tremor'], cmdWait: 900, pitch: 0.75, dist: 28 },
    { id: 'celdas_y_escotilla', cmds: ['cell'], cmdWait: 6200, pitch: 0.85, dist: 36 },
    { id: 'llevar_celda', cmds: ['cell'], cmdWait: 900, carry: true, pitch: 0.55, dist: 18 },
    { id: 'sobrecarga', cmds: ['overload'], cmdWait: 700, pitch: 0.35, dist: 20 },
    { id: 'sin_corazon_arco', cmds: ['heartless', 'surge'], cmdWait: 500, pitch: 0.4, dist: 22 },
  ]),
  // ---- Phase 3: the Blender creatures up close, the player's knight beside
  // each (ids end in _f3; name them after the out dir to run them).
  ...bossShots('tock', 'line_master_tock', 7, Math.PI * 1.2, [
    { id: 'cerca_f3', pitch: 0.16, dist: 14, yaw: 0.25, wait: 1500 },
  ]),
  ...bossShots('rangewarden', 'rangewarden', 8, Math.PI * 0.8, [
    { id: 'cerca_f3', pitch: 0.12, dist: 10, yaw: -0.5, wait: 1500 },
  ]),
  ...bossShots('voltaic', 'voltaic_warden', 8, 0.3, [
    { id: 'cerca_f3', pitch: 0.2, dist: 20, yaw: 0.3, wait: 1500 },
  ]),
  ...[
    ['sentry', 'centinela'],
    ['shieldbearer', 'escudero'],
    ['bruiser', 'bruto'],
    ['engineer', 'ingeniero'],
    ['apprentice', 'aprendiza'],
    ['hound', 'sabueso'],
    ['drone', 'dron'],
    ['turret', 'torreta'],
    ['frame', 'marco'],
    ['hauler', 'transportador'],
  ].map(([spawn, name]) => ({
    id: `${name}_cerca_f3`,
    at: [0, 50],
    face: 0,
    yaw: 0.35,
    pitch: 0.15,
    dist: spawn === 'hauler' ? 22 : 10,
    cmds: ['/dev foundry kill trash', `/dev foundry spawn ${spawn}`],
    cmdWait: 2500,
    wait: 300,
  })),
];

/** One boss's mechanic shots: each stages a fresh pull and fires its triggers. */
function bossShots(area, templateId, yards, angle, shots) {
  return shots.map((s) => ({
    face: 0,
    ...s,
    id: `${area}_${s.id}`,
    area,
    hud: true,
    stage: [templateId, yards, angle],
    stepWait: s.stepWait ?? 1200,
    cmds: (s.cmds ?? []).map((c) => `/dev foundry trigger ${c}`),
    wait: s.wait ?? 250,
  }));
}

/** In-page: pull `templateId` and say where the player should stand. */
function pageStage([templateId, yards, angle]) {
  const sim = window.__game.world;
  const me = sim.player;
  let boss = null;
  for (const e of sim.entities.values()) {
    if (e.kind === 'mob' && !e.dead && e.templateId === templateId) boss = e;
  }
  if (!boss) return null;
  me.hp = me.maxHp;
  boss.maxHp = Math.max(boss.maxHp, 1e6);
  boss.hp = boss.maxHp;
  if (boss.aiState === 'evade') {
    boss.aiState = 'idle';
    boss.inCombat = false;
  }
  me.devNoAggro = false;
  sim.aggroMob(boss, me, false);
  return {
    x: boss.pos.x + Math.sin(angle) * yards,
    z: boss.pos.z + Math.cos(angle) * yards,
    face: angle + Math.PI,
  };
}

/** In-page: the nearest settled Storm Cell's id and spot. */
function pageCell() {
  const sim = window.__game.world;
  const me = sim.player;
  let best = null;
  let bestD = Infinity;
  for (const e of sim.entities.values()) {
    if (e.templateId !== 'foundry_storm_cell') continue;
    const d = Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best ? { id: best.id, x: best.pos.x, z: best.pos.z } : null;
}

/** In-page: the nearest bunker object (its lee is the side away from the boss). */
function pageBunker() {
  const sim = window.__game.world;
  const me = sim.player;
  let best = null;
  let bestD = Infinity;
  for (const e of sim.entities.values()) {
    if (!String(e.templateId).startsWith('foundry_bunker')) continue;
    const d = Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best ? { x: best.pos.x, z: best.pos.z } : null;
}

/** In-page helper for a shot's js step (offline Sim only). */
function pageStep(step) {
  const sim = window.__game.world;
  const me = sim.player;
  const [, id] = step.split(':');
  let best = null;
  let bestD = Infinity;
  for (const e of sim.entities.values()) {
    if (e.kind !== 'mob' || e.dead || e.templateId !== id) continue;
    const d = Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  if (!best) return 'none';
  me.hp = me.maxHp;
  best.maxHp = Math.max(best.maxHp, 1e6);
  best.hp = best.maxHp;
  // A mob an earlier shot sent home re-pulls from where it stands.
  if (best.aiState === 'evade') {
    best.aiState = 'idle';
    best.inCombat = false;
  }
  sim.aggroMob(best, me, false);
  return best.id;
}

async function main() {
  const gpu = process.env.SHOT_GPU !== '0';
  const browser = await puppeteer.launch({
    executablePath: BROWSER_PATH,
    headless: 'new',
    args: [
      `--window-size=${W},${H}`,
      ...(gpu
        ? ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization']
        : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
    ],
    defaultViewport: { width: W, height: H },
    protocolTimeout: 240000,
  });
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') console.log('CONSOLE:', m.text().slice(0, 300));
    });
    await page.evaluateOnNewDocument((preset) => {
      try {
        localStorage.setItem('woc_settings', JSON.stringify({ graphicsPreset: preset }));
      } catch {
        /* ignore */
      }
    }, PRESET);
    await page.goto(URL, { waitUntil: 'networkidle0', timeout: 180000 });
    const booted = await enterOfflineGame(page, {
      charClass: 'warrior',
      charName: 'Brasswalker',
      gameBootTimeoutMs: 180000,
      selectorTimeoutMs: 90000,
      settleMs: 4000,
    });
    if (!booted) throw new Error('offline world did not boot');
    for (const cmd of ['/dev level 20', '/dev god', '/dev foundry enter', '/dev foundry gates']) {
      await page.evaluate((c) => window.__game.world.chat(c), cmd);
      await sleep(1300);
    }
    await page.waitForFunction(
      () => {
        let found = false;
        window.__game.renderer.scene.traverse((o) => {
          if (o.name === 'stormbrassFoundryField') found = true;
        });
        return found;
      },
      { timeout: 180000, polling: 1000 },
    );
    await sleep(5000);
    await page.evaluate(() => window.__game.world.chat('/dev foundry tp landing'));
    await sleep(900);
    // The landing arrival is instance-local (0, -226): recover the slot origin.
    const origin = await page.evaluate(() => {
      const p = window.__game.world.player;
      return { x: p.pos.x, z: p.pos.z + 226 };
    });
    for (const shot of SHOTS) {
      if (ONLY.length && !ONLY.some((o) => shot.id === o || shot.id.startsWith(o))) continue;
      // The HUD hides for the scenery shots and shows for the map shot.
      await page.evaluate((hide) => {
        let tag = document.getElementById('shot-hide-ui');
        if (!tag) {
          tag = document.createElement('style');
          tag.id = 'shot-hide-ui';
          document.head.appendChild(tag);
        }
        tag.textContent = hide ? '#ui, #nameplates { display: none !important; }' : '';
      }, !shot.map && !shot.hud);
      await sleep(1400);
      const tpCmd = shot.area
        ? `/dev foundry tp ${shot.area}`
        : `/dev tp ${origin.x + shot.at[0]} ${origin.z + shot.at[1]}`;
      await page.evaluate((c) => window.__game.world.chat(c), tpCmd);
      await sleep(700);
      // Strays from an earlier shot leave the stage: spawned mobs die, every
      // pulled mob drops its fight (the placed packs stay for the scenery).
      await page.evaluate(() => {
        const sim = window.__game.world;
        for (const e of [...sim.entities.values()]) {
          if (e.kind !== 'mob' || e.dead) continue;
          if (e.inCombat) {
            e.inCombat = false;
            e.aggroTargetId = null;
            e.aiState = 'evade';
          }
        }
        sim.player.devNoAggro = true;
      });
      await sleep(1200);
      if (shot.stage) {
        const spot = await page.evaluate(pageStage, shot.stage);
        console.log('STAGE', shot.id, JSON.stringify(spot));
        if (spot) {
          await page.evaluate((c) => window.__game.world.chat(c), `/dev tp ${spot.x} ${spot.z}`);
          shot.face = spot.face;
        }
        await sleep(shot.stepWait);
      }
      if (shot.js) {
        await page.evaluate(() => {
          window.__game.world.player.devNoAggro = false;
        });
        console.log('STEP', shot.id, await page.evaluate(pageStep, shot.js));
        await sleep(shot.stepWait ?? 900);
      }
      for (const c of shot.cmds ?? []) {
        await page.evaluate(() => {
          window.__game.world.player.devNoAggro = false;
        });
        await page.evaluate((cmd) => window.__game.world.chat(cmd), c);
        await sleep(shot.cmdWait ?? 1300);
      }
      // Walk the marked player so the Target Lock trail paints behind them.
      if (shot.walk) {
        for (let i = 0; i < shot.walk.steps; i++) {
          await page.evaluate(({ dx, dz }) => {
            const p = window.__game.world.player;
            window.__game.world.chat(`/dev tp ${p.pos.x + dx} ${p.pos.z + dz}`);
          }, shot.walk);
          await sleep(shot.walk.ms);
        }
      }
      // Step into the nearest bunker's lee (its east side, away from the berm).
      if (shot.bunker) {
        const b = await page.evaluate(pageBunker);
        if (b) {
          await page.evaluate((c) => window.__game.world.chat(c), `/dev tp ${b.x + 2} ${b.z}`);
          await sleep(2600);
        }
      }
      // Take the nearest Storm Cell (the pick-up command the client sends).
      if (shot.carry) {
        const cell = await page.evaluate(pageCell);
        if (cell) {
          await page.evaluate((c) => window.__game.world.chat(c), `/dev tp ${cell.x} ${cell.z}`);
          await sleep(500);
          const took = await page.evaluate((id) => window.__game.world.pickUpObject(id), cell.id);
          console.log('CARRY', took);
          await sleep(1200);
        }
      }
      await page.evaluate((s) => {
        const p = window.__game.world.player;
        p.facing = s.face;
        p.prevFacing = s.face;
        const input = window.__game.input;
        input.camYaw = s.yaw ?? 0;
        input.camPitch = s.pitch;
        input.camDist = s.dist;
      }, shot);
      await sleep(shot.wait ?? 2800);
      if (shot.map) {
        await page.keyboard.press('KeyM');
        await sleep(1500);
      }
      const file = path.join(OUT, `${PREFIX}${shot.id}.png`);
      await page.screenshot({ path: file });
      console.log('SHOT', file);
      if (shot.map) {
        await page.keyboard.press('KeyM');
        await sleep(500);
      }
      const perf = await page.evaluate(
        () =>
          new Promise((resolve) => {
            const info = window.__game.renderer.webgl.info.render;
            let frames = 0;
            const t0 = performance.now();
            const tick = () => {
              frames++;
              if (performance.now() - t0 < 1500) requestAnimationFrame(tick);
              else
                resolve({
                  fps: Math.round((frames * 1000) / (performance.now() - t0)),
                  calls: info.calls,
                  tris: info.triangles,
                });
            };
            requestAnimationFrame(tick);
          }),
      );
      console.log('PERF', shot.id, JSON.stringify(perf));
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
