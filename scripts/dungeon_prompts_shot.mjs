// Evidence shots of the dungeon encounter prompts (src/ui/hud/dungeon/: the
// Iron Cage escape, Gaoler Ossick's chain alert, the Stormbrass Foundry's
// alert) on desktop and on a touch phone, staged in a live offline world by
// putting the mechanic's aura on the local player (and the body it names on a
// nearby mob), so the HUD reads exactly what a fight would hand it. Evidence
// tooling, not a repo test: it checks the prompts' slot clears the action
// bars, the player frame and the touch action ring.
//
//   node scripts/dungeon_prompts_shot.mjs <outDir> [scenario ...]
//
// Scenarios: chain (anchored, the links left), ally (a party member hooked),
// cell (carrying a Storm Cell into an open hatch), floorcell (a cell on the
// floor), proof (the Rangewarden's Proof Shot at you, the tank), grounded and
// charged (the Voltaic Warden's plating, targeted). Env: SHOT_URL
// (http://127.0.0.1:5200/), SHOT_VIEWPORT (desktop | mobile), SHOT_PREFIX.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';

const URL = process.env.SHOT_URL ?? 'http://127.0.0.1:5200/';
const OUT = process.argv[2] ?? path.join('tmp', 'dungeon_prompts');
const WANT = process.argv.slice(3);
const MOBILE = process.env.SHOT_VIEWPORT === 'mobile';
const PREFIX = process.env.SHOT_PREFIX ?? '';
const VIEW = MOBILE
  ? { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  : { width: 1600, height: 900, deviceScaleFactor: 1 };
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SCENARIOS = ['chain', 'ally', 'cell', 'floorcell', 'proof', 'grounded', 'charged'];

/** In-page: stage one scenario's auras and bodies; returns a label. */
function stage(kind) {
  const w = window.__game.world;
  const p = w.player;
  const mobs = [...w.ctx.entities.values()].filter((e) => e.kind === 'mob' && !e.dead);
  mobs.sort(
    (a, b) =>
      Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z) -
      Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z),
  );
  const body = mobs[0];
  const other = mobs[1] ?? mobs[0];
  p.auras = p.auras.filter((a) => !a.id.startsWith('bastion_') && !a.id.startsWith('foundry_'));
  const aura = (id, extra) => ({
    id,
    name: id,
    kind: 'buff_dr',
    remaining: 900,
    duration: 900,
    value: 0,
    sourceId: body?.id ?? 0,
    school: 'physical',
    ...extra,
  });
  if (!body) return 'no mob nearby';
  if (kind === 'chain' || kind === 'ally') {
    body.templateId = 'bastion_drowned_anchor';
    body.name = 'Drowned Anchor';
    body.maxHp = 12;
    body.hp = 9;
    if (kind === 'chain') p.auras.push(aura('bastion_anchored', { sourceId: body.id }));
    else {
      const ally = [...w.ctx.entities.values()].find((e) => e.kind === 'player' && e.id !== p.id);
      if (ally) ally.auras.push(aura('bastion_anchored', { sourceId: body.id }));
    }
    p.targetId = body.id;
    return `anchor ${body.id}`;
  }
  if (kind === 'cell') {
    other.templateId = 'foundry_hatch_open';
    p.auras.push(aura('foundry_storm_cell_carry', { sourceId: other.id, stacks: 40 }));
    return 'carry';
  }
  if (kind === 'floorcell') {
    body.templateId = 'prime_draft';
    other.templateId = 'foundry_storm_cell';
    other.kind = 'object';
    p.targetId = body.id;
    return 'floor cell';
  }
  if (kind === 'proof') {
    body.templateId = 'rangewarden';
    body.castingAbility = 'foundry_proof_shot';
    body.castTargetId = p.id;
    body.castRemaining = 1.2;
    body.castTotal = 1.5;
    p.auras.push(aura('foundry_dented_plating', { kind: 'expose', stacks: 2, value: 0.2 }));
    p.targetId = body.id;
    return 'proof';
  }
  body.templateId = 'voltaic_warden';
  body.auras = body.auras.filter((a) => !a.id.startsWith('foundry_'));
  body.auras.push(
    aura(kind === 'grounded' ? 'foundry_plating_grounded' : 'foundry_plating_charged', {
      sourceId: body.id,
    }),
    aura('foundry_stored_charge', { sourceId: body.id, stacks: 900, value2: 2000 }),
  );
  p.targetId = body.id;
  return kind;
}

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  args: [
    `--window-size=${VIEW.width},${VIEW.height}`,
    '--use-angle=d3d11',
    '--ignore-gpu-blocklist',
  ],
  defaultViewport: VIEW,
  protocolTimeout: 240000,
});
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 180000 });
  const booted = await enterOfflineGame(page, {
    charClass: 'warrior',
    charName: 'Promptcheck',
    gameBootTimeoutMs: 180000,
    selectorTimeoutMs: 90000,
    settleMs: 4000,
  });
  if (!booted) throw new Error('offline world did not boot');
  if (MOBILE) await page.evaluate(() => document.body.classList.add('mobile-touch'));
  await page.evaluate(() => window.__game.world.chat('/dev god'));
  for (const kind of WANT.length ? WANT : SCENARIOS) {
    const label = await page.evaluate(stage, kind);
    await sleep(900);
    const file = path.join(OUT, `${PREFIX}${MOBILE ? 'movil_' : ''}aviso_${kind}.png`);
    await page.screenshot({ path: file });
    console.log('SHOT', file, label);
  }
} finally {
  await browser.close();
}
