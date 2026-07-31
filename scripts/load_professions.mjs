// Professions load rig: the phase 16 / R36 1,000-concurrent baseline capture.
//
// Drives BOTS synthetic professions sessions against a LOCAL dev server:
// gather bots tour real GATHER_NODES positions (dev_teleport + the tool-press
// 'use' command, which self-picks the nearest ready node), fish bots stand at
// discovered fishable shore spots, cast the rod, answer the fishingBite event
// inside the reel window, and recast on every outcome. A sampled subset of
// bots are parsing OBSERVERS that record snapshot sizes, snapshot gaps, and
// the per-snapshot ncd/tslot payload bytes on the arm under measurement;
// every other bot only counts frames and bytes so one rig process can hold
// 1,000 sockets without distorting the server it measures. The rig reports
// its own driver-loop lag so a saturated rig cannot silently pollute a run.
//
// The verdict (scripts/lib/bench_gate.mjs, evaluateProfessionsLoadRun, pinned
// by tests/bench_gate.test.ts) is a GATE: partial joins fail, a run whose
// observers rode the wrong timer-wire arm fails (STABLE=1 must see the tw
// echo, STABLE=0 must not), and a hollow run (no non-empty ncd for a gather
// observer, zero fishing outcomes for a fish observer) fails. Evidence lands
// in JSON_OUT before the exit code is decided.
//
// Setup (full recipe: docs/design/player-performance/professions-load-baseline.md):
//   ulimit -n 10240                      # BOTH shells: 1,000 sockets each side
//   ALLOW_DEV_COMMANDS=1 PERF_TICK_LOG=1 PORT=8799 DATABASE_URL=<throwaway pg> \
//     npm run server
//   DATABASE_URL=<same> SERVER_URL=http://127.0.0.1:8799 BOTS=1000 MODE=mixed \
//     STABLE=1 JSON_OUT=tmp/prof-load.json node scripts/load_professions.mjs
//
// Env: SERVER_URL, DATABASE_URL (required, loopback only), REALM_NAME, BOTS,
//      MODE (gather|fish|mixed), STABLE (1 = request the stable timer wire),
//      DURATION_MS, CONNECT_CONCURRENCY, STEP_MS, TOUR_SEC, NODES_PER_BOT,
//      OBSERVERS, BOT_LEVEL, REPORT_MS, RUN_ID, JSON_OUT, CLEANUP=1.
//
// Seeding is direct-to-Postgres like scripts/load_players.mjs (no bcrypt
// register storm ahead of the measurement window); each bot rides its own
// X-Forwarded-For so loopback per-IP caps never throttle the fleet.

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import pg from 'pg';
import { parse as parsePgTarget } from 'pg-connection-string';
import WebSocket from 'ws';
import { evaluateProfessionsLoadRun, gapStats, sampleStats } from './lib/bench_gate.mjs';
import { worldAuthMessage } from './lib/world_auth.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASE = (process.env.SERVER_URL ?? 'http://localhost:8787').replace(/\/+$/, '');
const WS_BASE = BASE.replace(/^http/, 'ws');

function boundedInt(raw, fallback, min, max) {
  const n = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

const L = 'abcdefghijklmnopqrstuvwxyz';
function randomLetters(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += L[Math.floor(Math.random() * 26)];
  return s;
}

const BOTS = boundedInt(process.env.BOTS, 100, 1, 1200);
const MODE = ['gather', 'fish', 'mixed'].includes(process.env.MODE ?? '')
  ? process.env.MODE
  : 'mixed';
// 2 is STABLE_TIMER_WIRE_VERSION (src/world_api.ts). A stale constant cannot
// silently measure the wrong arm: the gate fails any STABLE=1 run whose
// observers never see the server's tw echo, and any STABLE=0 run that does.
const STABLE = process.env.STABLE === '1';
const DURATION_MS = boundedInt(process.env.DURATION_MS, 180000, 5000, 24 * 3600 * 1000);
const CONNECT_CONCURRENCY = boundedInt(process.env.CONNECT_CONCURRENCY, 20, 1, 50);
const STEP_MS = boundedInt(process.env.STEP_MS, 250, 50, 5000);
const TOUR_SEC = boundedInt(process.env.TOUR_SEC, 6, 3, 120);
const NODES_PER_BOT = boundedInt(process.env.NODES_PER_BOT, 40, 1, 120);
const OBSERVERS = boundedInt(process.env.OBSERVERS, 32, 1, 128);
const BOT_LEVEL = boundedInt(process.env.BOT_LEVEL, 60, 1, 60);
const WARMUP_MS = boundedInt(process.env.WARMUP_MS, 45000, 2000, 300000);
const REPORT_MS = boundedInt(process.env.REPORT_MS, 10000, 1000, 60000);
const REALM = process.env.REALM_NAME ?? 'Claudemoon';
const JSON_OUT = process.env.JSON_OUT ?? '';
const CLEANUP = process.env.CLEANUP === '1';
const RUN_ID = (process.env.RUN_ID ?? '').replace(/[^a-z]/gi, '').slice(0, 8) || randomLetters(5);

// This rig seeds token-only accounts straight into the database and drives
// /dev cheats; every target must be loopback (the admin_professions_shot.mjs
// policy), including the host node-postgres will ACTUALLY use (?host= override
// aware via pg-connection-string).
function assertLoopbackUrl(urlStr, label) {
  const host = new URL(urlStr).hostname.replace(/^\[/, '').replace(/\]$/, '');
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(`${label} must be local (got ${host}); this rig seeds token-only accounts`);
  }
}
assertLoopbackUrl(BASE, 'SERVER_URL');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required (direct bot seeding)');
{
  let dbHost;
  try {
    dbHost = String(parsePgTarget(process.env.DATABASE_URL).host ?? '').toLowerCase();
  } catch {
    throw new Error('invalid DATABASE_URL (not a parseable connection string)');
  }
  const bare = dbHost.replace(/^\[/, '').replace(/\]$/, '');
  if (!['localhost', '127.0.0.1', '::1'].includes(bare)) {
    throw new Error(`refusing non-loopback DATABASE_URL host "${dbHost || '(none)'}"`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function lettersOf(n) {
  let s = '';
  let x = n + 1;
  while (x > 0) {
    s = L[x % 26] + s;
    x = Math.floor(x / 26);
  }
  return s;
}
// Deterministic per-bot rng so tour routes are stable across runs of one
// scenario (comparable baselines); this is a rig, not sim code.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ipFor = (n) => `9.${(n >> 8) & 255}.${n & 255}.7`;

// Tier-3 tools cover every shipped node tier (asserted against the live
// content below) and the tier-3 rod covers every zone's water. The tier-1
// kit wields at proficiency 0, so presses landing before the queued /dev
// gather grants apply still harvest tier-1 nodes instead of denying.
const TOOL_BY_NODE_TYPE = {
  ore: 'mithril_mining_pick',
  wood: 'ironbark_axe',
  herb: 'silverleaf_sickle',
};
const T1_TOOLS = ['copper_mining_pick', 'handaxe', 'gathering_sickle'];
const ROD_ITEM = 'silverstream_fishing_rod';
const GATHER_PROFS = ['mining', 'logging', 'herbalism'];

const SNAP_PREFIX = Buffer.from('{"t":"snap"');
const EVENTS_PREFIX = Buffer.from('{"t":"events"');

// Real sim content, bundled at run time the export_loot_spreadsheet.mjs way
// (scripts never import TS sources raw).
async function loadSimData() {
  const build = await esbuild.build({
    stdin: {
      contents: `
        export { GATHER_NODES } from './src/sim/content/gather_nodes.ts';
        export { zoneAt } from './src/sim/data.ts';
        export { firstFishableSampleAhead } from './src/sim/professions/fishing.ts';
        export { groundHeight, waterLevelAt } from './src/sim/world.ts';
        export { WORLD_SEED } from './src/sim/world_seed.ts';
      `,
      resolveDir: ROOT,
      sourcefile: 'prof-load-entry.ts',
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    logLevel: 'silent',
  });
  const dataUrl = `data:text/javascript;base64,${Buffer.from(build.outputFiles[0].text).toString('base64')}`;
  return import(dataUrl);
}

// Dry-footed standing spots with fishable water ahead: spiral out from the
// gather-node anchors (guaranteed near play space) probing the sim's own
// water walk. The discovered facing is reused verbatim by the bot.
function findFishingSpots(sim, want) {
  const spots = [];
  const seen = new Set();
  for (let radius = 0; radius <= 96 && spots.length < want; radius += 12) {
    for (const node of sim.GATHER_NODES) {
      if (spots.length >= want) break;
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2;
        const x = node.pos.x + Math.sin(ang) * radius;
        const z = node.pos.z + Math.cos(ang) * radius;
        const cell = `${Math.round(x / 8)},${Math.round(z / 8)}`;
        if (seen.has(cell)) continue;
        seen.add(cell);
        if (sim.groundHeight(x, z, sim.WORLD_SEED) < sim.waterLevelAt(x, z)) continue; // swimming
        for (let f = 0; f < 12; f++) {
          const facing = (f / 12) * Math.PI * 2;
          const sample = sim.firstFishableSampleAhead(x, z, facing, sim.WORLD_SEED);
          if (sample) {
            spots.push({ x, z, facing, zoneId: sim.zoneAt(sample.x, sample.z).id });
            break;
          }
        }
      }
    }
  }
  return spots;
}

async function seedBots(pool) {
  const records = [];
  for (let i = 0; i < BOTS; i += 1) {
    const username = `prof_${RUN_ID.toLowerCase()}_${String(i).padStart(4, '0')}`;
    const name = `P${RUN_ID}${lettersOf(i)}`.slice(0, 16);
    const token = randomBytes(32).toString('hex');
    const account = await pool.query(
      `INSERT INTO accounts (username, password_hash)
       VALUES ($1, $2)
       ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash
       RETURNING id`,
      [username, 'loadtest:token-only'],
    );
    const accountId = account.rows[0].id;
    await pool.query(
      `INSERT INTO auth_tokens (token, account_id, expires_at)
       VALUES ($1, $2, now() + interval '12 hours')`,
      [token, accountId],
    );
    const character = await pool.query(
      `INSERT INTO characters (account_id, name, class, realm, state)
       VALUES ($1, $2, $3, $4, NULL)
       RETURNING id`,
      [accountId, name, 'warrior', REALM],
    );
    records.push({ token, characterId: character.rows[0].id, accountId });
  }
  return records;
}

async function cleanupBots(pool, records) {
  const accountIds = records.map((r) => r.accountId);
  if (accountIds.length === 0) return;
  await pool.query('DELETE FROM accounts WHERE id = ANY($1::int[])', [accountIds]);
}

class Bot {
  constructor(index, record, role, isObserver) {
    this.index = index;
    this.token = record.token;
    this.characterId = record.characterId;
    this.role = role; // 'gather' | 'fish'
    this.isObserver = isObserver;
    this.ip = ipFor(index + 1);
    this.pid = -1;
    this.alive = false;
    // fleet-wide cheap counters
    this.bytes = 0;
    this.frames = 0;
    // observer evidence
    this.snapTimes = [];
    this.snapSizes = [];
    this.snapCount = 0;
    this.ncdCount = 0;
    this.ncdBytes = 0;
    this.tslotCount = 0;
    this.tslotBytes = 0;
    this.sawStableTw = false;
    this.ncdSeen = false;
    this.fishingOutcomes = 0;
    // fish driver state
    this.fishState = 'idle';
    this.nextCastAt = 0;
    this.castStartedAt = 0;
    // gather driver state
    this.route = [];
    this.routeIndex = 0;
    this.nextTourAt = 0;
    this.pressAt = 0;
    this.spot = null;
  }

  async join() {
    const authExtra = STABLE ? { timerWire: 2 } : {};
    await new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${WS_BASE}/ws`, { headers: { 'X-Forwarded-For': this.ip } });
      // A rejected join must CLOSE the socket: a hello landing after this
      // timeout would otherwise put an uncounted bot in the world and skew
      // both the join gate and the measurement (seen live: 831 alive of 627
      // joined on the first 1,000-bot attempt).
      const abort = (err) => {
        clearTimeout(to);
        try {
          this.ws.terminate();
        } catch {
          /* already gone */
        }
        reject(err);
      };
      const to = setTimeout(() => abort(new Error('join timeout')), 15000);
      this.ws.on('open', () => {
        this.ws.send(
          JSON.stringify({ ...worldAuthMessage(this.token, this.characterId), ...authExtra }),
        );
      });
      const onJoinMessage = (data) => {
        let msg;
        try {
          msg = JSON.parse(String(data));
        } catch {
          return;
        }
        if (msg.t === 'hello') {
          this.pid = msg.id ?? msg.pid;
          this.alive = true;
          clearTimeout(to);
          this.ws.off('message', onJoinMessage);
          this.ws.on('message', (d) => this.onFrame(d));
          this.seedSession();
          resolve();
        } else if (msg.t === 'error') {
          abort(new Error(msg.error ?? 'auth error'));
        }
      };
      this.ws.on('message', onJoinMessage);
      this.ws.on('error', (e) => abort(e));
      this.ws.on('close', () => {
        this.alive = false;
      });
    });
  }

  // Runs the moment THIS bot's hello lands, so the fleet disperses while it
  // is still joining. Fresh characters all spawn on one spawn point; letting
  // hundreds pile up there makes interest quadratic, drags the loop callback
  // past the server's 10 s auth deadline, and starves the remaining joins
  // (the failure shape of the first 1,000-bot attempt). The chat volley
  // stays inside the chat lane's burst of 8.
  seedSession() {
    this.cmd({ cmd: 'dev_level', level: BOT_LEVEL });
    this.cmd({ cmd: 'chat', text: '/dev god' });
    if (this.role === 'gather') {
      for (const prof of GATHER_PROFS) this.cmd({ cmd: 'chat', text: `/dev gather ${prof} 100` });
      for (const item of Object.values(TOOL_BY_NODE_TYPE)) this.cmd({ cmd: 'dev_give', item });
      for (const item of T1_TOOLS) this.cmd({ cmd: 'dev_give', item });
      const first = this.route[0];
      this.cmd({ cmd: 'dev_teleport', x: first.pos.x, z: first.pos.z });
      this.routeIndex = 1;
      this.pendingTool = TOOL_BY_NODE_TYPE[first.type];
    } else {
      this.cmd({ cmd: 'chat', text: '/dev gather fishing 100' });
      this.cmd({ cmd: 'chat', text: '/dev gather fishing 100' });
      this.cmd({ cmd: 'dev_give', item: ROD_ITEM });
      this.cmd({ cmd: 'dev_teleport', x: this.spot.x, z: this.spot.z });
      this.input({}, this.spot.facing);
    }
  }

  // Called once when every join has landed: phase-stagger the fleet so tour
  // teleports and casts spread evenly instead of thundering on one step.
  armDriver(now, fleetSize) {
    if (this.role === 'gather') {
      this.pressAt = now + 500 + Math.floor((this.index / fleetSize) * 2000);
      this.nextTourAt = now + 2500 + Math.floor((this.index / fleetSize) * TOUR_SEC * 1000);
    } else {
      this.nextCastAt = now + Math.floor((this.index / fleetSize) * 2000);
    }
  }

  // A fish bot whose casts never resolve (bad spot, server-side water
  // disagreement) rotates to another discovered spot instead of denying
  // forever; self-healing keeps a 1,000-bot run from failing on one spot.
  rotateSpot(spots) {
    this.spotRotations = (this.spotRotations ?? 0) + 1;
    this.spot = spots[(this.index + this.spotRotations) % spots.length];
    this.cmd({ cmd: 'dev_teleport', x: this.spot.x, z: this.spot.z });
    this.input({}, this.spot.facing);
  }

  // The per-frame hot path for 1,000 sockets: byte and frame counters for
  // everyone; prefix-checked cheap scans for fish drivers; a full parse only
  // on the sampled observers.
  onFrame(data) {
    this.frames += 1;
    this.bytes += data.length;
    const isSnap = data.length > 11 && data.subarray(0, 11).equals(SNAP_PREFIX);
    const isEvents = !isSnap && data.length > 13 && data.subarray(0, 13).equals(EVENTS_PREFIX);
    if (this.role === 'fish' && isEvents) {
      if (data.includes('"fishingBite"')) {
        // the reel: re-press the rod inside the server's reaction window
        this.cmd({ cmd: 'use', item: ROD_ITEM });
        this.fishState = 'reeling';
      }
      if (
        data.includes('"fishingResult"') ||
        data.includes('"fishingGotAway"') ||
        data.includes('"fishingEmptyHook"')
      ) {
        this.fishingOutcomes += 1;
        this.deadCasts = 0;
        this.fishState = 'idle';
        this.nextCastAt = Date.now() + 800;
      }
    }
    if (!this.isObserver) return;
    if (isSnap) {
      this.snapTimes.push(performance.now());
      this.snapSizes.push(data.length);
      this.snapCount += 1;
      let msg;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      if (msg.tw === 2) this.sawStableTw = true;
      const self = msg.self;
      if (self && self.ncd !== undefined) {
        this.ncdCount += 1;
        this.ncdBytes += JSON.stringify(self.ncd).length;
        if (Object.keys(self.ncd).length > 0) this.ncdSeen = true;
      }
      if (self && self.tslot !== undefined) {
        this.tslotCount += 1;
        this.tslotBytes += JSON.stringify(self.tslot).length;
      }
    }
  }

  cmd(p) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ t: 'cmd', ...p }));
  }
  input(mi, facing) {
    if (this.ws?.readyState === 1)
      this.ws.send(JSON.stringify({ t: 'input', mi, ...(facing !== undefined ? { facing } : {}) }));
  }
  close() {
    try {
      // clean leave (lane-exempt) so a scenario's fleet does not linger as
      // 1,000 linkdead entities under the next scenario's measurement
      if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ t: 'logout' }));
      this.ws?.close();
    } catch {
      /* already closing */
    }
  }

  resetMeasurement() {
    this.bytes = 0;
    this.frames = 0;
    this.snapTimes.length = 0;
    this.snapSizes.length = 0;
    this.snapCount = 0;
    this.ncdCount = 0;
    this.ncdBytes = 0;
    this.tslotCount = 0;
    this.tslotBytes = 0;
    this.fishingOutcomes = 0;
    // sawStableTw and ncdSeen deliberately survive the reset: the arm and the
    // first-harvest evidence were established during warmup and stay true.
  }
}

function aggregateObservers(observers) {
  const byRole = {};
  for (const role of ['gather', 'fish']) {
    const rows = observers.filter((o) => o.role === role);
    if (rows.length === 0) continue;
    const allSizes = rows.flatMap((o) => o.snapSizes);
    const allGapArrays = rows.map((o) => gapStats(o.snapTimes));
    const totalSnaps = rows.reduce((a, o) => a + o.snapCount, 0);
    const ncdCount = rows.reduce((a, o) => a + o.ncdCount, 0);
    const ncdBytes = rows.reduce((a, o) => a + o.ncdBytes, 0);
    const tslotCount = rows.reduce((a, o) => a + o.tslotCount, 0);
    const tslotBytes = rows.reduce((a, o) => a + o.tslotBytes, 0);
    byRole[role] = {
      observers: rows.length,
      snapshots: totalSnaps,
      snapBytes: sampleStats(allSizes),
      gapP95Median: +[...allGapArrays.map((g) => g.p95)]
        .sort((a, b) => a - b)
        [Math.floor(allGapArrays.length / 2)].toFixed(1),
      gapMaxWorst: Math.max(...allGapArrays.map((g) => g.max)),
      ncd: {
        presenceRatio: totalSnaps ? +(ncdCount / totalSnaps).toFixed(4) : 0,
        bytesPerSnapshot: totalSnaps ? +(ncdBytes / totalSnaps).toFixed(1) : 0,
        bytesWhenPresent: ncdCount ? +(ncdBytes / ncdCount).toFixed(1) : 0,
      },
      tslot: {
        presenceRatio: totalSnaps ? +(tslotCount / totalSnaps).toFixed(4) : 0,
        bytesPerSnapshot: totalSnaps ? +(tslotBytes / totalSnaps).toFixed(1) : 0,
        bytesWhenPresent: tslotCount ? +(tslotBytes / tslotCount).toFixed(1) : 0,
      },
    };
  }
  return byRole;
}

async function main() {
  const startIso = new Date().toISOString();
  let gitHead = 'unknown';
  try {
    gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim();
  } catch {
    /* not a git checkout */
  }
  console.log(
    `[prof-load] target=${BASE} bots=${BOTS} mode=${MODE} stable=${STABLE ? 1 : 0} duration=${DURATION_MS}ms run=${RUN_ID}`,
  );
  const st = await fetch(`${BASE}/api/status`)
    .then((r) => r.json())
    .catch(() => null);
  if (!st?.ok) {
    console.error('server not reachable / not ok at', BASE);
    process.exit(1);
  }

  const sim = await loadSimData();
  const maxNodeTier = Math.max(...sim.GATHER_NODES.map((n) => n.tier));
  if (maxNodeTier > 3) {
    throw new Error(
      `content grew a tier-${maxNodeTier} node; the rig's tier-3 tool kit no longer covers every node`,
    );
  }

  const fishCount = MODE === 'fish' ? BOTS : MODE === 'mixed' ? Math.floor(BOTS / 2) : 0;
  const spots = fishCount > 0 ? findFishingSpots(sim, Math.min(64, Math.max(8, fishCount))) : [];
  if (fishCount > 0 && spots.length === 0) throw new Error('no fishable shore spots discovered');
  if (spots.length) {
    const zones = [...new Set(spots.map((s) => s.zoneId))];
    console.log(`[prof-load] ${spots.length} fishing spots across ${zones.length} zones`);
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  console.log(`[prof-load] seeding ${BOTS} bots (direct DB, run id ${RUN_ID})`);
  const records = await seedBots(pool);

  // roles and observers: fish bots first so a mixed fleet interleaves both
  // roles across the observer stride. Routes and spots are assigned BEFORE
  // the join so seedSession can disperse each bot the moment it lands.
  const bots = records.map((record, i) => {
    const role = i < fishCount ? 'fish' : 'gather';
    const bot = new Bot(i, record, role, false);
    if (role === 'gather') {
      const rng = mulberry32(0xbeef + i);
      bot.route = [...sim.GATHER_NODES].sort(() => rng() - 0.5).slice(0, NODES_PER_BOT);
    } else {
      bot.spot = spots[i % spots.length];
    }
    return bot;
  });
  const stride = Math.max(1, Math.floor(BOTS / OBSERVERS));
  let observersPicked = 0;
  for (let i = 0; i < bots.length && observersPicked < OBSERVERS; i += stride) {
    bots[i].isObserver = true;
    observersPicked += 1;
  }
  // a mixed run must observe BOTH roles: force one of each if the stride missed
  for (const role of MODE === 'mixed' ? ['gather', 'fish'] : []) {
    if (!bots.some((b) => b.isObserver && b.role === role)) {
      const candidate = bots.find((b) => b.role === role);
      if (candidate) candidate.isObserver = true;
    }
  }

  // ---- join (CONNECT_CONCURRENCY at a time). Joined bots stand GEARED and
  // DISPERSED but idle: driving the workload during the ramp saturates the
  // loop callback and starves later handshakes past the server's 10 s auth
  // deadline (observed live: 604 of 1,000). The workload starts when the
  // last join lands, runs a staggered WARMUP_MS, then the window opens. ----
  let joined = 0;
  let cursor = 0;
  let joinsDone = false;
  const failures = [];
  const failedBots = [];
  const joinPromise = Promise.all(
    Array.from({ length: CONNECT_CONCURRENCY }, async () => {
      while (cursor < bots.length) {
        const bot = bots[cursor];
        cursor += 1;
        try {
          await bot.join();
          joined += 1;
        } catch (e) {
          failures.push(`bot ${bot.index}: ${e.message}`);
          failedBots.push(bot);
        }
      }
    }),
  )
    .then(async () => {
      // Bounded retry passes at low concurrency: the tail of a 1,000-bot ramp
      // sits on a busy loop where a handshake can wait out the server's 10 s
      // auth deadline or catch an autosave wave holding the pool; a later
      // attempt normally lands (a real client retries too). The gate judges
      // the FINAL count, and a fleet with a broken join path (more than 10
      // percent failed) is never retried into a false pass.
      for (let pass = 1; pass <= 5 && failedBots.length > 0; pass++) {
        if (failedBots.length > Math.max(50, BOTS / 10)) break;
        const retrying = failedBots.splice(0);
        console.log(`[prof-load] retry pass ${pass}: ${retrying.length} bots`);
        await sleep(5000);
        let rcursor = 0;
        await Promise.all(
          Array.from({ length: 5 }, async () => {
            while (rcursor < retrying.length) {
              const bot = retrying[rcursor];
              rcursor += 1;
              try {
                await bot.join();
                joined += 1;
              } catch (e) {
                failures.push(`bot ${bot.index} (retry ${pass}): ${e.message}`);
                failedBots.push(bot);
              }
            }
          }),
        );
      }
    })
    .then(() => {
      joinsDone = true;
      console.log(`[prof-load] joined ${joined}/${BOTS}`);
      for (const f of failures.slice(0, 5)) console.error(`  join failure: ${f}`);
    });

  // ---- warmup + measurement driver ----
  const perfMid = [];
  const loopLag = [];
  let driving = false;
  let measuring = false;
  let settleAt = Number.POSITIVE_INFINITY;
  let start = performance.now();
  let lastReport = performance.now();
  let step = 0;
  let expectedAt = performance.now() + STEP_MS;
  for (;;) {
    await sleep(Math.max(0, expectedAt - performance.now()));
    if (measuring) loopLag.push(Math.max(0, performance.now() - expectedAt));
    expectedAt += STEP_MS;
    step += 1;
    const now = Date.now();
    if (!driving && joinsDone) {
      driving = true;
      settleAt = now + WARMUP_MS;
      for (const b of bots) if (b.alive) b.armDriver(now, bots.length);
      console.log(`[prof-load] workload armed, warmup ${WARMUP_MS}ms`);
    }
    if (driving) {
      for (const b of bots) {
        if (!b.alive) continue;
        if (b.role === 'gather') {
          if (now >= b.nextTourAt) {
            const node = b.route[b.routeIndex % b.route.length];
            b.routeIndex += 1;
            b.nextTourAt = now + TOUR_SEC * 1000;
            b.cmd({ cmd: 'dev_teleport', x: node.pos.x, z: node.pos.z });
            b.pressAt = now + 500;
            b.pendingTool = TOOL_BY_NODE_TYPE[node.type];
          } else if (b.pressAt && now >= b.pressAt) {
            b.cmd({ cmd: 'use', item: b.pendingTool });
            b.pressAt = 0;
          }
        } else {
          if (b.fishState === 'idle' && now >= b.nextCastAt) {
            b.cmd({ cmd: 'use', item: ROD_ITEM });
            b.fishState = 'casting';
            b.castStartedAt = now;
          } else if (b.fishState !== 'idle' && now - b.castStartedAt > 12000) {
            // A successful cast ALWAYS produces a bite within ~8.5 s plus the
            // reel window, so 12 s with no outcome means the cast never
            // started (facing denial, combat-camped shore, swim edge). The
            // spot is bad for this bot: rotate to another discovered spot
            // (which also teleport-drops any camping mob) and recast.
            b.fishState = 'idle';
            b.nextCastAt = now + 400;
            b.rotateSpot(spots);
          }
        }
        if (step % Math.max(1, Math.round(1000 / STEP_MS)) === b.index % 4) {
          b.input({}, b.role === 'fish' ? b.spot.facing : 0);
        }
      }
    }
    if (!measuring) {
      if (now >= settleAt) {
        for (const b of bots) b.resetMeasurement();
        measuring = true;
        start = performance.now();
        expectedAt = performance.now() + STEP_MS;
        console.log('[prof-load] measurement window open');
      }
    } else if (performance.now() - start >= DURATION_MS) {
      break;
    }
    if (performance.now() - lastReport >= REPORT_MS) {
      lastReport = performance.now();
      const alive = bots.filter((b) => b.alive).length;
      const mb = bots.reduce((a, b) => a + b.bytes, 0) / 1e6;
      const perf = await fetch(`${BASE}/api/perf`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      if (perf && measuring)
        perfMid.push({
          atMs: Math.round(performance.now() - start),
          online: perf.online,
          tickHz: perf.tickHz,
        });
      console.log(
        `[prof-load] ${measuring ? 't=' + Math.round((performance.now() - start) / 1000) + 's' : 'warmup'} alive=${alive} joined=${joined} rx=${mb.toFixed(1)}MB tickHz=${perf?.tickHz ?? '?'}`,
      );
    }
  }
  await joinPromise;
  const live = bots.filter((b) => b.alive);

  // ---- report ----
  const perf = await fetch(`${BASE}/api/perf`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  const aliveEnd = live.filter((b) => b.alive);
  const seconds = DURATION_MS / 1000;
  const observers = live.filter((b) => b.isObserver);
  const observerRows = observers.map((o) => ({
    label: `obs-${o.index}`,
    role: o.role,
    gaps: gapStats(o.snapTimes).gaps,
    sawStableTw: o.sawStableTw,
    ncdSeen: o.ncdSeen,
    fishingOutcomes: o.fishingOutcomes,
  }));
  const report = {
    base: BASE,
    runId: RUN_ID,
    gitHead,
    startIso,
    bots: joined,
    aliveAtEnd: aliveEnd.length,
    mode: MODE,
    stable: STABLE,
    durationMs: DURATION_MS,
    botLevel: BOT_LEVEL,
    tourSec: TOUR_SEC,
    nodesPerBot: NODES_PER_BOT,
    stepMs: STEP_MS,
    fishSpots: spots.length,
    fishSpotRotations: bots.reduce((a, b) => a + (b.spotRotations ?? 0), 0),
    observerCount: observers.length,
    fleet: {
      rxBytesPerSecondPerBot: aliveEnd.length
        ? Math.round(live.reduce((a, b) => a + b.bytes, 0) / seconds / aliveEnd.length)
        : 0,
      rxFramesPerSecondPerBot: aliveEnd.length
        ? +(live.reduce((a, b) => a + b.frames, 0) / seconds / aliveEnd.length).toFixed(1)
        : 0,
    },
    roles: aggregateObservers(observers),
    rig: { loopLagMs: sampleStats(loopLag) },
    serverPerfMid: perfMid,
    serverPerf: perf,
  };
  const verdict = evaluateProfessionsLoadRun({
    joined,
    expected: BOTS,
    mode: MODE,
    stable: STABLE,
    durationMs: DURATION_MS,
    observers: observerRows,
  });
  report.verdict = verdict;

  console.log('\n===== RESULT =====');
  console.log(
    `bots: ${report.bots} joined, ${report.aliveAtEnd} alive at end; fleet rx ${report.fleet.rxBytesPerSecondPerBot} B/s/bot`,
  );
  for (const [role, r] of Object.entries(report.roles)) {
    console.log(
      `${role}: snapBytes p50/p95/p99/max=${r.snapBytes.p50}/${r.snapBytes.p95}/${r.snapBytes.p99}/${r.snapBytes.max} ncd ratio=${r.ncd.presenceRatio} perSnap=${r.ncd.bytesPerSnapshot}B tslot ratio=${r.tslot.presenceRatio}`,
    );
  }
  if (perf?.phases) {
    const cols = ['total', 'tick', 'broadcast', 'bcastSelf', 'bcastGrid', 'events', 'social'];
    console.log(
      `SERVER p50/p95/max (ms): ${cols
        .map(
          (n) =>
            `${n}=${perf.phases[n]?.p50 ?? 0}/${perf.phases[n]?.p95 ?? 0}/${perf.phases[n]?.max ?? 0}`,
        )
        .join(
          ' ',
        )} (samples=${perf.samples}, ents=${perf.simEntities}, tickHz=${perf.tickHz ?? 'n/a'})`,
    );
  }
  console.log(`rig loop lag p95=${report.rig.loopLagMs.p95}ms max=${report.rig.loopLagMs.max}ms`);
  for (const f of verdict.failures) console.error(`GATE FAIL: ${f}`);
  console.log(`verdict: ${verdict.ok ? 'PASS' : 'FAIL'}`);
  if (JSON_OUT) {
    fs.writeFileSync(JSON_OUT, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`wrote ${JSON_OUT}`);
  }

  for (const b of bots) b.close();
  await sleep(300);
  if (CLEANUP) await cleanupBots(pool, records);
  await pool.end();
  process.exit(verdict.ok ? 0 : 1);
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
