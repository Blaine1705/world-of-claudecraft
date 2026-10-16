// Screenshot rig for Gourdlight Eve (the autumn seasonal event, src/sim/seasonal/):
// boots an offline character, opens the event with /dev season on, and shoots
// each dressed city by day and by night, the trick-or-treat gossip row and its
// answer, a trick, the keeper's shop and the worn pumpkin head.
//
//   GAME_URL=http://localhost:5192 OUT=tmp/gourdlight [SHOTS=a,b] [PRESET=1] \
//     node scripts/gourdlight_eve_shot.mjs
//
// GPU only (the system ANGLE backend, never SwiftShader): the glow and the bloom
// are the point of these shots. PRESET seeds the graphics preset (1 is the
// lowest, the capture default; 4 is High for the art review).
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5192';
const OUT = process.env.OUT ?? 'tmp/gourdlight';
const PRESET = Number(process.env.PRESET ?? 1);
const ONLY = process.env.SHOTS ? new Set(process.env.SHOTS.split(',')) : null;
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  args: [
    '--window-size=1600,900',
    '--use-angle=d3d11',
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    '--enable-features=Vulkan',
  ],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
page.on('console', (m) => {
  const text = m.text();
  if (/Gourdlight|seasonal|GL_|WebGL/i.test(text)) console.log('CONSOLE:', text);
});
await page.evaluateOnNewDocument(`(() => {
  try { localStorage.setItem('woc_settings', JSON.stringify({ graphicsPreset: ${PRESET} })); } catch {}
})()`);
await page.goto(URL, { waitUntil: 'networkidle0', timeout: 60000 });
const booted = await enterOfflineGame(page, {
  charClass: 'warrior',
  charName: 'Hollowmere',
  settleMs: 4000,
  gameBootTimeoutMs: 120000,
  selectorTimeoutMs: 60000,
});
if (!booted) throw new Error('offline world did not boot');
const renderer = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
});
console.log('GPU:', renderer);
if (/swiftshader/i.test(String(renderer))) throw new Error('refusing to capture on SwiftShader');

async function chat(line) {
  await page.evaluate(
    `(()=>{const i=document.querySelector('#chat-input');i.value=${JSON.stringify(line)};i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));})()`,
  );
  await sleep(250);
}
async function frames(n = 6, gap = 250) {
  for (let i = 0; i < n; i++) {
    await page.screenshot({ path: `${OUT}/_frame.png` });
    await sleep(gap);
  }
}
/** Wait out the loading curtain (a teleport into an unstreamed zone raises it). */
async function curtainDown() {
  for (let i = 0; i < 120; i++) {
    const up = await page.evaluate(
      `(()=>{const l=document.querySelector('#loading-screen');if(!l)return false;const s=getComputedStyle(l);return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)>0.05;})()`,
    );
    if (!up) return;
    await frames(1, 400);
  }
}
async function shot(name) {
  if (ONLY && !ONLY.has(name)) return;
  await curtainDown();
  await frames(4, 200);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('SHOT', name);
}
/** Stand at (x, z) facing `facing`, the camera pulled back behind. */
async function standAt(x, z, facing, dist = 9, pitch = 0.32, camYaw = 0) {
  await page.evaluate(
    `(()=>{const g=window.__game;const p=g.sim.player;g.sim.setPlayerLevel(30);p.pos.x=${x};p.pos.z=${z};p.pos.y=g.sim.groundPos(${x},${z}).y;p.prevPos={...p.pos};p.facing=${facing};p.prevFacing=${facing};
      const i=g.input;i.camDist=${dist};i.camPitch=${pitch};i.camYaw=${camYaw};})()`,
  );
  await frames(8, 300);
}
/** Face from (x, z) toward (tx, tz). */
const toward = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);

await page.evaluate(`window.__game.sim.setPlayerLevel(30)`);
await chat('/dev season on');
await frames(10, 400);
// Wait for the event's kit to load and attach.
for (let i = 0; i < 40; i++) {
  const ready = await page.evaluate(
    `(()=>{const r=window.__game.renderer;const s=r.scene.getObjectByName('seasonal-decor');return !!(s&&s.visible&&s.children.length);})()`,
  );
  if (ready) break;
  await frames(1, 300);
}

const views = {
  // Vantages searched against the colliders (open ground, a clear camera boom),
  // each looking at one of the city's garlands.
  eastbrook: { x: -6, z: -114, look: [-20, -95] },
  fenbridge: { x: -34.9, z: 327.1, look: [-34.9, 320.1] },
  highwatch: { x: -11.7, z: 668.5, look: [-11.7, 661.5] },
};
for (const [city, v] of Object.entries(views)) {
  for (const time of ['day', 'night']) {
    if (ONLY && !ONLY.has(`${city}_${time}`)) continue;
    await chat(`/daynight ${time === 'day' ? 'noon' : 'midnight'}`);
    await standAt(v.x, v.z, toward(v.x, v.z, v.look[0], v.look[1]), 9, 0.38);
    await shot(`${city}_${time}`);
  }
}

// The keeper and her shop (night, Eastbrook).
await chat('/daynight dusk');
const keeper = await page.evaluate(
  `(()=>{const e=[...window.__game.sim.entities.values()].find(e=>e.templateId==='gourdlight_keeper');return e?{id:e.id,x:e.pos.x,z:e.pos.z}:null;})()`,
);
if (keeper) {
  await standAt(keeper.x, keeper.z + 4, Math.PI, 6, 0.25);
  await shot('keeper');
  await page.evaluate(
    `(()=>{const g=window.__game;g.sim.addItem('gourdlight_sweet',60);g.sim.targetEntity(${keeper.id});g.hud.questDialog?.open?.(${keeper.id});})()`,
  );
  await shot('keeper_dialog');
  await page.evaluate(`(()=>{const b=document.querySelector('[data-vendor]');b&&b.click();})()`);
  await shot('shop');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
}

// Trick-or-treat at Trader Wilkes: the gossip row, then the answer.
const wilkes = await page.evaluate(
  `(()=>{const e=[...window.__game.sim.entities.values()].find(e=>e.templateId==='trader_wilkes');return e?{id:e.id,x:e.pos.x,z:e.pos.z}:null;})()`,
);
if (wilkes) {
  await standAt(wilkes.x + 2.5, wilkes.z, -Math.PI / 2, 6, 0.22);
  await page.evaluate(
    `(()=>{const g=window.__game;g.sim.targetEntity(${wilkes.id});g.hud.questDialog?.open?.(${wilkes.id});})()`,
  );
  await shot('trick_or_treat_dialog');
  await page.evaluate(
    `(()=>{const b=document.querySelector('[data-trick-or-treat]');b&&b.click();})()`,
  );
  await shot('trick_or_treat_answer');
}
// A trick, forced: the Jar of Mischief until each body shows.
for (const trick of [
  'gourdlight_trick_bat',
  'gourdlight_trick_skeleton',
  'gourdlight_trick_fumes',
]) {
  if (ONLY && !ONLY.has(trick)) continue;
  await page.evaluate(
    `(()=>{const g=window.__game;const p=g.sim.player;p.auras=p.auras.filter(a=>a.kind!=='seasonal_cosmetic'||a.id==='gourdlight_pumpkin_head');p.auras.push({id:'${trick}',name:'trick',kind:'seasonal_cosmetic',value:0,remaining:20,duration:20,sourceId:p.id,school:'physical',undispellable:true});})()`,
  );
  await frames(14, 300);
  await shot(trick);
}
// The pumpkin head, worn, by night.
await page.evaluate(
  `(()=>{const g=window.__game;const p=g.sim.player;p.auras=p.auras.filter(a=>a.kind!=='seasonal_cosmetic');g.sim.addItem('carved_pumpkin_head',1);g.sim.useItem('carved_pumpkin_head');})()`,
);
await chat('/daynight midnight');
await standAt(-14, -96, 0, 3.2, 0.12);
await shot('pumpkin_head_night');
await chat('/daynight noon');
await frames(4);
await shot('pumpkin_head_day');
await browser.close();
