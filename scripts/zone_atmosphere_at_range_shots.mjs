// Visual A/B for the biome haze field (src/render/biome_haze_field.ts): stand
// at a zone border vantage and look across it, once with the field on and once
// with `?zonehaze=off`, so the pair shows whether a neighbouring realm reads as
// its own place from a distance instead of borrowing the camera zone's air.
//
// Needs `npm run dev` running. Writes tmp/zonehaze-<vantage>-<on|off>.png.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

import { BROWSER_PATH as EDGE } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';

const BASE = process.env.GAME_URL ?? 'http://localhost:5173';
const PHASE = process.env.DAY_PHASE ?? 'day';
fs.mkdirSync('tmp', { recursive: true });

// Each vantage stands just inside one realm looking across a border into the
// next, which is exactly the sightline the effect exists for.
const VANTAGES = [
  // The Eastbrook coast, looking east along the bay at the Farshore isle and
  // the Galecrest column beyond it.
  { name: 'eastbrook-coast', x: -40, z: -186, yaw: Math.PI / 2, pitch: 1.45, dist: 26 },
  // The Amberfall's southern shoulder looking down into the Nightbloom: warm
  // golden air over the amber downs, lavender dream-haze over the violet ones.
  { name: 'amberfall-to-nightbloom', x: -360, z: 1880, yaw: Math.PI, pitch: 1.42, dist: 30 },
  // The Wraithwood looking south into the Evergarden: the world's tightest
  // murk against its clearest parkland air. Off by default because a full
  // ultra vista frame under SwiftShader is minutes of rasterization; set
  // ALL_VANTAGES=1 for the complete sweep.
  ...(process.env.ALL_VANTAGES
    ? [{ name: 'wraithwood-to-evergarden', x: 360, z: 1310, yaw: Math.PI, pitch: 1.44, dist: 30 }]
    : []),
];

async function capture(hazeOn) {
  const suffix = hazeOn ? 'on' : 'off';
  const url = `${BASE}/?gfx=ultra${hazeOn ? '' : '&zonehaze=off'}`;
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    args: ['--window-size=1280,720', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    defaultViewport: { width: 1280, height: 720 },
    // An ultra-tier whole-world vista frame under SwiftShader takes minutes to
    // rasterize; the default 180s protocol timeout aborts the capture itself.
    protocolTimeout: 900000,
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR: ' + e.message));
  // domcontentloaded, not networkidle0: with no `npm run server` behind the
  // dev proxy the site-presence heartbeat retries forever and the page never
  // goes idle. enterOfflineGame owns the real readiness waits.
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // The launcher decodes the character-preview assets before it paints, which
  // under SwiftShader on a loaded machine outruns enterOfflineGame's own 30s
  // wait for the same hook; absorb that here so the shared helper stays as is.
  await page.waitForSelector('#btn-offline', { timeout: 240000 });
  await enterOfflineGame(page, {
    charName: 'Skywatcher',
    settleMs: 6000,
    selectorTimeoutMs: 120000,
    gameBootTimeoutMs: 180000,
  });

  await page.waitForSelector('#chat-input', { timeout: 120000 });
  await page.evaluate((phase) => {
    const chat = document.querySelector('#chat-input');
    chat.value = `/daynight ${phase}`;
    chat.dispatchEvent(new Event('input', { bubbles: true }));
    chat.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  }, PHASE);
  await new Promise((r) => setTimeout(r, 8000)); // the grade lerps in

  for (const v of VANTAGES) {
    await page.evaluate((s) => {
      const g = window.__game;
      const p = g.sim.player;
      p.pos.x = s.x;
      p.pos.z = s.z;
      p.facing = s.yaw;
      g.input.camYaw = s.yaw;
      g.input.camPitch = s.pitch;
      g.input.camDist = s.dist;
    }, v);
    // The far vista streams its tiles across idle slots and the zone terrain
    // prepares behind it: give both time or the frame shows an empty horizon.
    await new Promise((r) => setTimeout(r, 20000));
    const path = `tmp/zonehaze-${v.name}-${suffix}.png`;
    await page.screenshot({ path });
    console.log('wrote', path);
  }
  await browser.close();
}

await capture(true);
await capture(false);
console.log('done');
