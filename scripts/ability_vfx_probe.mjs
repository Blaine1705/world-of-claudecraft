// Ability VFX coverage probe: proves every spec'd ability produces per-ability
// visuals in the real client. Boots the offline game (dev server on :5173),
// then for EVERY id in ABILITY_VFX_SPECS synthesizes the render-side event the
// sim would emit (fx derived from the ability's projectileFx/castTime/spec
// archetype), reads the painter's dev stats hook (window.__game.abilityVfxStats)
// to record claimed/primitives, screenshots every 10th cast to tmp/vfx_ingame/,
// drives one melee auto-attack sequence, and writes tmp/vfx_ingame/report.json.
//
// Usage: npm run dev (":5173") in another terminal, then
//   node scripts/ability_vfx_probe.mjs
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5173';
const OUT_DIR = 'tmp/vfx_ingame';
const CAST_SETTLE_MS = Number(process.env.VFX_PROBE_SETTLE_MS ?? 600);
fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  args: ['--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
const pageerrors = [];
page.on('pageerror', (e) => pageerrors.push(String(e.message ?? e)));

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 60000 });
const booted = await enterOfflineGame(page, { charClass: 'warrior', settleMs: 3000 });
if (!booted) {
  console.error('FAIL: world did not boot');
  await browser.close();
  process.exit(1);
}

// Position near a live mob so targeted events have a real victim in frame, and
// zoom the scene into a stable state.
const setup = await page.evaluate(() => {
  const g = window.__game;
  if (!g.abilityVfxProbe || !g.abilityVfxStats) return { ok: false, reason: 'no dev probe hook' };
  const sim = g.sim;
  const p = sim.player;
  let mob = null;
  let best = 1e9;
  for (const e of sim.entities.values()) {
    if (e.kind === 'mob' && !e.dead && e.ownerId === null) {
      const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
      if (d < best) {
        best = d;
        mob = e;
      }
    }
  }
  if (mob) {
    p.pos.x = mob.pos.x + 4;
    p.pos.z = mob.pos.z;
  }
  // Keep the probe screenshots clean: dismiss the software-GL notice if shown.
  document.querySelector('.gpu-notice-dismiss')?.click();
  return {
    ok: true,
    playerId: p.id,
    mobId: mob ? mob.id : p.id,
    specCount: Object.keys(g.abilityVfxProbe.specs).length,
  };
});
if (!setup.ok) {
  console.error('FAIL:', setup.reason);
  await browser.close();
  process.exit(1);
}
console.log(
  `probing ${setup.specCount} ability specs (player ${setup.playerId}, mob ${setup.mobId})`,
);
await new Promise((r) => setTimeout(r, 500));

const specIds = await page.evaluate(() => Object.keys(window.__game.abilityVfxProbe.specs).sort());

const results = {};
let shot = 0;
for (let i = 0; i < specIds.length; i++) {
  const id = specIds[i];
  const cast = await page.evaluate(
    (abilityId, playerId, mobId) => {
      const g = window.__game;
      const spec = g.abilityVfxProbe.specs[abilityId];
      const ab = g.abilityVfxProbe.abilities[abilityId];
      // Derive the fx kind the sim would emit for this ability: an authored
      // projectile override wins; timed casts launch projectiles; instants
      // read by archetype (novas/shouts pulse at the caster, the rest tick).
      const fx =
        ab?.projectileFx ??
        (ab && ab.castTime > 0
          ? 'projectile'
          : spec.a === 'nova' || spec.a === 'shout'
            ? 'nova'
            : 'tick');
      const school = ab?.school ?? 'nature';
      const selfCentered = fx === 'nova' || !ab || !ab.requiresTarget;
      const targetId = selfCentered ? playerId : mobId;
      // The probe parks the player next to a live mob for framing; top the
      // character up each cast so aggro cannot kill it mid-run (dev harness
      // convention: smoke scripts already write player state directly).
      const p = g.sim.player;
      if (!p.dead) p.hp = p.maxHp;
      const before = g.abilityVfxStats()[abilityId] ?? { claimed: 0, primitives: 0 };
      g.renderer.handleEvent({
        type: 'spellfx',
        sourceId: playerId,
        targetId,
        school,
        fx,
        ability: abilityId,
      });
      return { fx, school, before };
    },
    id,
    setup.playerId,
    setup.mobId,
  );
  await new Promise((r) => setTimeout(r, CAST_SETTLE_MS));
  if (i % 10 === 0) {
    shot++;
    await page.screenshot({
      path: `${OUT_DIR}/${String(i).padStart(3, '0')}_${id}.png`,
    });
  }
  const after = await page.evaluate(
    (abilityId) => window.__game.abilityVfxStats()[abilityId] ?? { claimed: 0, primitives: 0 },
    id,
  );
  results[id] = {
    fx: cast.fx,
    school: cast.school,
    claimed: after.claimed - cast.before.claimed > 0,
    primitives: after.primitives - cast.before.primitives,
  };
}

// Melee auto-attack sequence: a plain swing and a ranged-correlated one. The
// painter adds the subtle slash ribbon; meleeSpark and the swing anim are the
// pre-existing generic path (verified by absence of pageerrors + screenshot).
const auto = await page.evaluate(
  (playerId, mobId) => {
    const g = window.__game;
    const send = (extra) =>
      g.renderer.handleEvent({
        type: 'damage',
        sourceId: playerId,
        targetId: mobId,
        amount: 14,
        crit: false,
        school: 'physical',
        ability: null,
        kind: 'hit',
        ...extra,
      });
    send({});
    send({ attackAnimationStarted: true });
    return { sent: 2 };
  },
  setup.playerId,
  setup.mobId,
);
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: `${OUT_DIR}/auto_attack.png` });

const claimed = Object.values(results).filter((r) => r.claimed);
const withPrimitives = claimed.filter((r) => r.primitives > 0);
const failed = Object.entries(results).filter(([, r]) => !r.claimed || r.primitives <= 0);
const report = {
  url: URL,
  when: new Date().toISOString(),
  specCount: specIds.length,
  claimedCount: claimed.length,
  withPrimitivesCount: withPrimitives.length,
  failed: failed.map(([id, r]) => ({ id, ...r })),
  autoAttack: { ...auto, pageerrorsDuring: pageerrors.length },
  screenshots: shot + 1,
  pageerrors,
  abilities: results,
};
fs.writeFileSync(`${OUT_DIR}/report.json`, JSON.stringify(report, null, 2));
console.log(
  `coverage: ${withPrimitives.length}/${specIds.length} claimed with primitives, ` +
    `${claimed.length} claimed, ${failed.length} failed, ${pageerrors.length} pageerrors`,
);
if (failed.length > 0) console.log('failed:', failed.map(([id]) => id).join(', '));
await browser.close();
process.exit(failed.length > 0 || pageerrors.length > 0 ? 2 : 0);
