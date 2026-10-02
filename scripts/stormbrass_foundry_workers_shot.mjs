// Evidence shots of the Stormbrass Foundry's chained workers in a live offline
// world: each camp at work (the miners at the seam, the hauler on its loop,
// the chains to the post), the gossip while the guards stand and once they
// are down ("Free them"), the freed cheering and walking off, the struck
// chains, and the Lift Warden's quest with its tracker. Evidence tooling, not
// a repo test.
//
//   node scripts/stormbrass_foundry_workers_shot.mjs [outDir] [shotId ...]
//
// Env: SHOT_URL (http://127.0.0.1:5214/), SHOT_PRESET (4), SHOT_W / SHOT_H
// (1600x900), SHOT_GPU=0 to force SwiftShader, SHOT_PREFIX ("obreros_").
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';

const URL = process.env.SHOT_URL ?? 'http://127.0.0.1:5214/';
const OUT = process.argv[2] ?? path.join('tmp', 'stormbrass_foundry_workers');
const ONLY = process.argv.slice(3);
const W = Number(process.env.SHOT_W ?? 1600);
const H = Number(process.env.SHOT_H ?? 900);
const PRESET = Number(process.env.SHOT_PRESET ?? 4);
const PREFIX = process.env.SHOT_PREFIX ?? 'obreros_';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// at: instance-local spot the player stands on; face: sim radians (0 = +z);
// the camera orbits at yaw/pitch/dist. cmds run before the shot. talk: open
// the gossip of the nearest worker. free: press its "Free them". hud: keep
// the HUD in frame.
const SHOTS = [
  { id: 'campo_a_trabajando', at: [41, -176], face: 2.6, pitch: 0.32, dist: 13 },
  { id: 'campo_a_cadenas', at: [44.5, -180], face: 2.9, pitch: 0.5, dist: 8 },
  { id: 'campo_a_acarreador', at: [42, -175], face: -2.2, pitch: 0.28, dist: 9, wait: 4200 },
  { id: 'campo_b_trabajando', at: [-75, -66.5], face: 3.0, pitch: 0.34, dist: 12 },
  { id: 'campo_c_trabajando', at: [-33, 124], face: -1.2, pitch: 0.34, dist: 13 },
  {
    id: 'charla_con_guardias',
    at: [46.5, -182],
    face: 2.4,
    pitch: 0.25,
    dist: 9,
    talk: true,
    hud: true,
  },
  {
    id: 'charla_liberalos',
    at: [46.5, -182],
    face: 2.4,
    pitch: 0.25,
    dist: 9,
    cmds: ['/dev foundry kill g2'],
    talk: true,
    hud: true,
  },
  {
    id: 'liberados_celebran',
    at: [41.5, -177],
    face: 2.5,
    pitch: 0.3,
    dist: 11,
    talk: true,
    free: true,
    wait: 1500,
  },
  { id: 'liberados_se_marchan', at: [41.5, -177], face: -1.8, pitch: 0.32, dist: 14, wait: 2600 },
  { id: 'cadenas_caidas', at: [44.5, -180], face: 2.9, pitch: 0.55, dist: 8, wait: 6000 },
  {
    id: 'mision_rastreador',
    at: [41, -176],
    face: 2.6,
    pitch: 0.3,
    dist: 12,
    hud: true,
    wait: 1200,
  },
];

/** In-page: the nearest living worker's entity id. */
function pageNearestWorker() {
  const sim = window.__game.world;
  const me = sim.player;
  let best = null;
  let bestD = Infinity;
  for (const e of sim.entities.values()) {
    if (e.kind !== 'mob' || e.dead || !String(e.templateId).startsWith('sf_')) continue;
    const d = Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best ? best.id : null;
}

async function setHud(page, hidden) {
  await page.evaluate((hide) => {
    let tag = document.getElementById('shot-hide-ui');
    if (!tag) {
      tag = document.createElement('style');
      tag.id = 'shot-hide-ui';
      document.head.appendChild(tag);
    }
    tag.textContent = hide ? '#ui, #nameplates { display: none !important; }' : '';
  }, hidden);
}

async function aim(page, shot) {
  await page.evaluate((s) => {
    const p = window.__game.world.player;
    p.facing = s.face;
    p.prevFacing = s.face;
    const input = window.__game.input;
    input.camYaw = s.yaw ?? s.face;
    input.camPitch = s.pitch;
    input.camDist = s.dist;
  }, shot);
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
      charName: 'Chainbreaker',
      gameBootTimeoutMs: 180000,
      selectorTimeoutMs: 90000,
      settleMs: 4000,
    });
    if (!booted) throw new Error('offline world did not boot');
    const chat = (c) => page.evaluate((cmd) => window.__game.world.chat(cmd), c);
    await chat('/dev level 20');
    await sleep(800);
    await chat('/dev god');
    await sleep(500);

    // The quest at the Lift Warden first (outside, at the lift station).
    if (!ONLY.length || ONLY.includes('mision')) {
      const warden = await page.evaluate(() => {
        const sim = window.__game.world;
        for (const e of sim.entities.values()) {
          if (e.templateId === 'lift_warden_corwin') return { id: e.id, x: e.pos.x, z: e.pos.z };
        }
        return null;
      });
      if (warden) {
        await chat(`/dev tp ${warden.x + 2.5} ${warden.z - 2.5}`);
        // The jump streams a new zone in: wait the loading screen out.
        await sleep(2000);
        await page.waitForFunction(
          () => {
            const el = document.querySelector('#loading-screen');
            if (!el) return true;
            const cs = getComputedStyle(el);
            return cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0;
          },
          { timeout: 120000, polling: 500 },
        );
        await sleep(4000);
        await setHud(page, false);
        await aim(page, { face: -0.8, pitch: 0.2, dist: 8 });
        await page.evaluate((id) => window.__game.hud.openQuestDialog(id), warden.id);
        await sleep(1500);
        await page.screenshot({
          path: path.join(OUT, `${PREFIX}mision_guardian_del_ascensor.png`),
        });
        await page.evaluate(() => {
          document.querySelector('[data-quest="q_sf_free_the_workers"]')?.click();
        });
        await sleep(1200);
        await page.screenshot({ path: path.join(OUT, `${PREFIX}mision_dialogo.png`) });
        console.log('SHOT mision');
        await page.evaluate(() => window.__game.world.acceptQuest('q_sf_free_the_workers'));
        await sleep(600);
        await page.evaluate(() => window.__game.hud.closeQuestDialog?.());
      }
    }

    for (const cmd of ['/dev foundry enter', '/dev foundry gates']) {
      await chat(cmd);
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
    await chat('/dev foundry tp landing');
    await sleep(900);
    const origin = await page.evaluate(() => {
      const p = window.__game.world.player;
      return { x: p.pos.x, z: p.pos.z + 226 };
    });
    await page.evaluate(() => {
      window.__game.world.player.devNoAggro = true;
    });
    for (const shot of SHOTS) {
      if (ONLY.length && !ONLY.some((o) => shot.id === o || shot.id.startsWith(o))) continue;
      await setHud(page, !shot.hud);
      await chat(`/dev tp ${origin.x + shot.at[0]} ${origin.z + shot.at[1]}`);
      await sleep(1500);
      for (const c of shot.cmds ?? []) {
        await chat(c);
        await sleep(1200);
      }
      await aim(page, shot);
      if (shot.talk) {
        const id = await page.evaluate(pageNearestWorker);
        console.log('TALK', shot.id, id);
        if (id !== null) await page.evaluate((wid) => window.__game.hud.openQuestDialog(wid), id);
        await sleep(900);
      }
      if (shot.free) {
        const pressed = await page.evaluate(() => {
          const b = document.querySelector('[data-free-workers]');
          if (b) b.click();
          return !!b;
        });
        console.log('FREE', pressed);
        await setHud(page, true);
      }
      await sleep(shot.wait ?? 2400);
      const file = path.join(OUT, `${PREFIX}${shot.id}.png`);
      await page.screenshot({ path: file });
      console.log('SHOT', file);
      // Close the gossip itself (Escape with no dialog up opens the game menu).
      if (shot.talk) await page.evaluate(() => window.__game.hud.closeQuestDialog?.());
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
