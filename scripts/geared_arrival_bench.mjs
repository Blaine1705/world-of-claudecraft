// Geared-arrival benchmark: reproduces the production "crowd with special
// gear arrives and the client freezes" case (forensics signature: playerCount
// jumps with programs +87..116 in one interval) and measures it A/B.
//
// A HEADED observer client stands in Eastbrook town while WAVES of bots
// arrive by teleport, each bot leveled and equipped with a varied weapon AND
// a Season 1 Armory weapon skin (the hero tiers carry heavy VFX rigs), so
// every arrival brings first-seen models and materials exactly like real
// players do. Skins are granted straight into accounts.cosmetics in the dev
// database before the bot joins (the session loads ownership at join; the
// dev flow deliberately skips the economy service).
//
// The script owns its client: it starts vite with --strictPort from the
// CURRENT checkout and records the SHA, so an A/B is one run per worktree
// against the same shared server and database:
//   npm run db:up ; DATABASE_URL=... ALLOW_DEV_COMMANDS=1 npm run server
//   BENCH_LABEL=fixes    node scripts/geared_arrival_bench.mjs   # feature worktree
//   BENCH_LABEL=baseline node scripts/geared_arrival_bench.mjs   # base worktree
//
// Env: BENCH_PORT (default 5198, strict), BENCH_WAVES (default 5,5,5,5),
//      BENCH_LABEL, BENCH_OUT, BENCH_GFX (default insane), SERVER_URL,
//      DATABASE_URL (default the npm run db:up dev database), BROWSER_PATH,
//      BENCH_BOOT_TIMEOUT_MS (default 240000), BENCH_WAVE_MS (default 12000).
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import puppeteer from 'puppeteer-core';
import WebSocket from 'ws';
import { BROWSER_PATH } from './browser_path.mjs';
import { worldAuthMessage } from './lib/world_auth.mjs';

const PORT = Number(process.env.BENCH_PORT ?? 5198);
const WAVES = (process.env.BENCH_WAVES ?? '5,5,5,5').split(',').map(Number);
const LABEL = process.env.BENCH_LABEL ?? 'run';
const GFX = process.env.BENCH_GFX ?? 'insane';
const SERVER = process.env.SERVER_URL ?? 'http://localhost:8787';
const WS_BASE = SERVER.replace(/^http/, 'ws');
const DB_URL =
  process.env.DATABASE_URL ?? 'postgres://eastbrook:change-me@127.0.0.1:5433/eastbrook';
const BOOT_TIMEOUT_MS = Number(process.env.BENCH_BOOT_TIMEOUT_MS ?? 240000);
const WAVE_MS = Number(process.env.BENCH_WAVE_MS ?? 12000);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = process.env.BENCH_OUT ?? path.join('tmp', `geared-arrival-${LABEL}-${stamp}.json`);

// Observer stands at the Eastbrook town center; the holding pen sits far
// outside the ~120 yd interest radius so parked bots stay invisible until
// their wave teleports in.
const OBSERVER = { x: 0, z: 0 };
const PEN = { x: -150, z: 150 };

// One archetype per weapon type the skin catalog covers, cycled across bots:
// a compatible class, a giveable weapon item, and a rotation of owned skins
// (hero celestial tier first: those carry the heavy VFX rigs).
const LOADOUTS = [
  {
    cls: 'warrior',
    weapon: 'worn_sword',
    skins: ['solheim_sword', 'ice_fang_sword', 'cinderbrand_sword', 'guildmark_arming_sword'],
  },
  {
    cls: 'warrior',
    weapon: 'handaxe',
    skins: ['skyrender_axe', 'glaciersplit_axe', 'emberbite_axe', 'brasscap_axe'],
  },
  {
    cls: 'paladin',
    weapon: 'training_mace',
    skins: ['starfall_mace', 'rimecrusher_mace', 'smoulderfall_mace', 'tempered_flanged_mace'],
  },
  {
    cls: 'rogue',
    weapon: 'rusty_dagger',
    skins: ['astravyr_dagger', 'frostbite_dagger', 'ashspark_dagger', 'guildmark_dirk'],
  },
  {
    cls: 'mage',
    weapon: 'gnarled_staff',
    skins: ['cosmarch_staff', 'hoarfrost_vigil_staff', 'forgeheart_staff', 'brasscrown_staff'],
  },
];

const uniq = Date.now().toString(36);
const alpha = uniq.replace(/[0-9]/g, (d) => 'abcdefghij'[Number(d)]).slice(-6);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function gitOutput(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}
const headSha = gitOutput(['rev-parse', 'HEAD']);
const dirty = (gitOutput(['status', '--porcelain']) ?? '') !== '';

async function api(pathname, body, token, xff) {
  const res = await fetch(SERVER + pathname, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(xff ? { 'X-Forwarded-For': xff } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

class Bot {
  constructor(i) {
    this.i = i;
    this.loadout = LOADOUTS[i % LOADOUTS.length];
    this.skin = this.loadout.skins[Math.floor(i / LOADOUTS.length) % this.loadout.skins.length];
    const li = String(i)
      .split('')
      .map((d) => 'abcdefghij'[+d])
      .join('');
    this.name = `Ga${alpha}${li}`;
    this.username = `geared_${uniq}_${i}`;
  }
  async register(db) {
    const xff = `172.18.${Math.floor(this.i / 254)}.${(this.i % 254) + 1}`;
    this.xff = xff;
    const reg = await api(
      '/api/register',
      { username: this.username, password: 'hunter22', email: `${this.username}@example.com` },
      undefined,
      xff,
    );
    this.token = reg.body.token;
    if (!this.token) throw new Error(`register failed for bot ${this.i}`);
    // Grant every skin of the loadout before the session loads cosmetics.
    // account_weapon_cosmetics is the sole ownership authority (the legacy
    // accounts.cosmetics JSONB only seeds the boot migration), so the grant
    // lands there, mirroring the server's own insert shape.
    const row = await db.query('SELECT id FROM accounts WHERE username = $1', [this.username]);
    const accountId = row.rows[0]?.id;
    if (!Number.isInteger(accountId)) throw new Error(`no account id for bot ${this.i}`);
    await db.query(
      `INSERT INTO account_weapon_cosmetics (account_id, skin_ids)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (account_id) DO UPDATE SET skin_ids = EXCLUDED.skin_ids`,
      [accountId, JSON.stringify(this.loadout.skins)],
    );
    const char = await api(
      '/api/characters',
      { name: this.name, class: this.loadout.cls },
      this.token,
      xff,
    );
    this.charId = char.body.id;
    if (!this.charId) throw new Error(`char create failed for bot ${this.i}`);
  }
  async join() {
    await new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${WS_BASE}/ws`, { headers: { 'X-Forwarded-For': this.xff } });
      const to = setTimeout(() => reject(new Error(`join timeout bot ${this.i}`)), 15000);
      this.ws.on('open', () =>
        this.ws.send(JSON.stringify(worldAuthMessage(this.token, this.charId))),
      );
      this.ws.on('message', (data) => {
        const msg = JSON.parse(String(data));
        if (msg.t === 'hello') {
          clearTimeout(to);
          resolve();
        }
      });
      this.ws.on('error', reject);
    });
  }
  cmd(payload) {
    this.ws?.send(JSON.stringify({ t: 'cmd', ...payload }));
  }
  async gearUp() {
    this.cmd({ cmd: 'dev_level', level: 20 });
    await sleep(150);
    this.ws?.send(JSON.stringify({ t: 'chat', text: `/dev give ${this.loadout.weapon}` }));
    await sleep(250);
    this.cmd({ cmd: 'equip', item: this.loadout.weapon });
    await sleep(250);
    this.cmd({ cmd: 'change_weapon_skin', skin: this.skin });
    await sleep(150);
    this.park();
  }
  park() {
    const a = this.i * 2.39996;
    const r = 6 * Math.sqrt((this.i % 25) / 25);
    this.cmd({ cmd: 'dev_teleport', x: PEN.x + Math.cos(a) * r, z: PEN.z + Math.sin(a) * r });
  }
  arrive() {
    const a = this.i * 2.39996;
    const r = 4 + 5 * Math.sqrt((this.i % 25) / 25);
    this.cmd({
      cmd: 'dev_teleport',
      x: OBSERVER.x + Math.cos(a) * r,
      z: OBSERVER.z + Math.sin(a) * r,
    });
  }
  close() {
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
  }
}

async function startVite() {
  const vite = spawn(
    process.execPath,
    [path.join('node_modules', 'vite', 'bin', 'vite.js'), '--port', String(PORT), '--strictPort'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let output = '';
  vite.stdout.on('data', (chunk) => {
    output += chunk;
  });
  vite.stderr.on('data', (chunk) => {
    output += chunk;
  });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (vite.exitCode !== null) {
      throw new Error(`vite exited before ready (port ${PORT} busy?):\n${output}`);
    }
    try {
      const res = await fetch(`http://localhost:${PORT}/`);
      if (res.ok) return vite;
    } catch {
      /* not up yet */
    }
    await sleep(300);
  }
  vite.kill('SIGTERM');
  throw new Error(`vite not ready on :${PORT} within 30s:\n${output}`);
}

async function enterObserver(page) {
  const u = `gearcam_${uniq}`;
  await api(
    '/api/register',
    { username: u, password: 'hunter22', email: `${u}@example.com` },
    undefined,
    '172.18.31.1',
  );
  await page.goto(`http://localhost:${PORT}/?perf&perfTrace=1&gfx=${GFX}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForFunction(
    () =>
      Boolean(
        document.querySelector('#btn-online') &&
          document.querySelector('#login-user') &&
          document.querySelector('#btn-login'),
      ),
    { timeout: BOOT_TIMEOUT_MS, polling: 200 },
  );
  await page.evaluate(
    (user, pass) => {
      document.querySelector('#btn-online').click();
      document.querySelector('#login-user').value = user;
      document.querySelector('#login-user').dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#login-pass').value = pass;
      document.querySelector('#login-pass').dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#btn-login').click();
    },
    u,
    'hunter22',
  );
  // Panel state machine: realm select, char select, and char create can come
  // in either order depending on account state; advance whichever shows until
  // the world boots.
  const panelDeadline = Date.now() + BOOT_TIMEOUT_MS;
  let created = false;
  for (;;) {
    if (Date.now() > panelDeadline) {
      const debug = await page.evaluate(() => ({
        panel: document.body.dataset.startPanel ?? null,
        errors: [...document.querySelectorAll('.auth-error, .error, [role="alert"]')]
          .map((el) => el.textContent?.trim())
          .filter(Boolean)
          .slice(0, 4),
      }));
      await page.screenshot({ path: 'tmp/geared-observer-stuck.png' }).catch(() => {});
      throw new Error(`observer stuck: ${JSON.stringify(debug)}`);
    }
    const entered = await page.evaluate(() =>
      Boolean(window.__game?.world?.player && window.__game?.perf?.report),
    );
    if (entered) break;
    const panel = await page.evaluate(() => document.body.dataset.startPanel ?? '');
    if (panel === 'realm-panel') {
      await page.evaluate(() =>
        document
          .querySelector('#realm-panel .realm-row, #realm-panel [data-realm], #realm-panel button')
          ?.click(),
      );
    } else if (panel === 'charselect-panel') {
      const hasChar = await page.evaluate(() =>
        Boolean(document.querySelector('.char-row .enter-world-btn')),
      );
      if (hasChar) {
        await page.evaluate(() => document.querySelector('.char-row .enter-world-btn')?.click());
      } else {
        await page.evaluate(() => document.querySelector('#btn-new-character')?.click());
      }
    } else if (panel === 'charcreate-panel' && !created) {
      created = true;
      await page.evaluate((nm) => {
        const name = document.querySelector('#new-char-name');
        name.value = nm;
        name.dispatchEvent(new Event('input', { bubbles: true }));
        document.querySelector('#charcreate-panel .mini-class[data-class="warrior"]').click();
        document.querySelector('#btn-create-char').click();
      }, `Cam${alpha}`);
    }
    await sleep(700);
  }
  const gl = await page.evaluate(() => window.__game.renderer.perfStats().glRenderer ?? '');
  if (/swiftshader|llvmpipe|software/i.test(gl)) {
    throw new Error(`software GL renderer ("${gl}")`);
  }
  await page.evaluate(
    (x, z) => window.__game.world.chat(`/dev tp ${x} ${z}`),
    OBSERVER.x,
    OBSERVER.z,
  );
  await sleep(15000);
}

async function measureWave(page, waveIndex, waveSize) {
  return page.evaluate(async (ms) => {
    const g = window.__game;
    const before = g.renderer.perfStats();
    g.perf.reset();
    const gaps = [];
    let last = performance.now();
    let raf = true;
    const tick = () => {
      const now = performance.now();
      gaps.push(now - last);
      last = now;
      if (raf) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    await new Promise((r) => setTimeout(r, ms));
    raf = false;
    const after = g.renderer.perfStats();
    const s = g.perf.report();
    const sorted = [...gaps].sort((a, b) => b - a);
    let players = 0;
    for (const e of g.world.entities.values()) if (e.kind === 'player') players++;
    return {
      worstGaps: sorted.slice(0, 6).map((v) => Math.round(v * 10) / 10),
      stallsOver150: gaps.filter((v) => v >= 150).length,
      stallsOver50: gaps.filter((v) => v >= 50).length,
      programsDelta: after.programs - before.programs,
      texturesDelta: after.textures - before.textures,
      viewsAfter: after.views,
      visiblePlayers: players,
      hitchByCause: s.hitches?.byCause ?? null,
      // Dev-trace attribution of the wave's worst frames (perfTrace=1 on
      // localhost): spans, long tasks, and stall attributions name where a
      // multi-second arrival frame actually went.
      traceWorst: (s.devTrace?.frames ?? []).slice(0, 3).map((f) => ({
        frameMs: f.frameMs,
        scoreMs: f.scoreMs,
        reasons: f.reasons,
        mainMs: f.mainMs,
        submit: f.renderer?.lastFrame?.phaseMs?.submit ?? null,
        stall: f.stallAttribution
          ? {
              submitMs: f.stallAttribution.submitMs,
              programDelta: f.stallAttribution.programDelta,
              createdViewTypes: f.stallAttribution.createdViewTypes,
              newMaterials: f.stallAttribution.diagnostics.newMaterials.slice(0, 6),
              firstVisible: f.stallAttribution.diagnostics.firstVisibleObjects.slice(0, 6),
            }
          : null,
      })),
      traceSpans: (s.devTrace?.spans ?? []).slice(0, 6).map((sp) => ({
        name: sp.name,
        ms: sp.durationMs,
        detail: sp.detail ?? null,
      })),
      traceLongTasks: (s.devTrace?.longTasks ?? [])
        .filter((t) => t.durationMs >= 500)
        .slice(-4)
        .map((t) => ({
          ms: t.durationMs,
          nearestSpan: t.nearestSpanName ?? null,
          nearestSpanMs: t.nearestSpanMs ?? null,
        })),
    };
  }, WAVE_MS);
}

async function main() {
  console.log(`geared arrival bench: label=${LABEL} sha=${headSha} waves=${WAVES.join(',')}`);
  const db = new pg.Client({ connectionString: DB_URL });
  await db.connect();
  const totalBots = WAVES.reduce((a, b) => a + b, 0);
  const bots = Array.from({ length: totalBots }, (_, i) => new Bot(i));
  console.log(`setting up ${totalBots} geared bots (register, grant skins, join, equip)...`);
  for (const bot of bots) {
    await bot.register(db);
    await bot.join();
    await bot.gearUp();
  }
  await sleep(2000);

  const vite = await startVite();
  let browser = null;
  try {
    browser = await puppeteer.launch({
      executablePath: BROWSER_PATH,
      headless: false,
      args: [
        '--window-size=1600,900',
        '--ignore-gpu-blocklist',
        '--enable-gpu-rasterization',
        '--use-gl=angle',
        '--use-angle=gl',
        '--enable-webgl',
        '--no-sandbox',
        '--mute-audio',
      ],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
    console.log('entering observer...');
    await enterObserver(page);

    const waves = [];
    let cursor = 0;
    for (let w = 0; w < WAVES.length; w++) {
      const size = WAVES[w];
      const arrivals = bots.slice(cursor, cursor + size);
      cursor += size;
      console.log(`wave ${w + 1}/${WAVES.length}: ${size} geared bots arrive`);
      const pending = measureWave(page, w, size);
      await sleep(500);
      for (const bot of arrivals) bot.arrive();
      const result = await pending;
      waves.push({ wave: w + 1, size, ...result });
      console.log(
        `  worst=${result.worstGaps[0]}ms stalls>150=${result.stallsOver150} programs+${result.programsDelta} players=${result.visiblePlayers}`,
      );
      await sleep(3000);
    }

    const evidence = {
      label: LABEL,
      headSha,
      dirty,
      gfx: GFX,
      startedAt: stamp,
      waves,
      aggregate: {
        worstGapMs: Math.max(...waves.map((w) => w.worstGaps[0] ?? 0)),
        totalStallsOver150: waves.reduce((a, w) => a + w.stallsOver150, 0),
        totalProgramsDelta: waves.reduce((a, w) => a + w.programsDelta, 0),
      },
    };
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(evidence, null, 2));
    console.log(`\n${LABEL} @ ${headSha}${dirty ? ' (dirty)' : ''}`);
    console.log(JSON.stringify(evidence.aggregate, null, 2));
    console.log(`evidence: ${OUT}`);
  } finally {
    await browser?.close().catch(() => {});
    vite.kill('SIGTERM');
    for (const bot of bots) bot.close();
    await db.end().catch(() => {});
  }
}

await main();
