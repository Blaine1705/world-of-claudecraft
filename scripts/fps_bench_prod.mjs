// Production A/B benchmark: baseline (merge-base build) vs graphics branch
// build, both served locally via vite preview, measured SIMULTANEOUSLY in two
// headless ANGLE-GPU browsers so ambient load is identical for every sample.
// Offline entry, ultra preset pinned. Tour: teleport (confirmed) -> idle ->
// camera orbit -> held-W run, per waypoint. Outputs fps stats + per-browser
// process-tree CPU and GPU-process CPU (matched on --type=gpu-process).
// Usage: node scripts/fps_bench_prod.mjs
// Env: BENCH_TARGETS override "label=url,label=url"; BENCH_OUT json path.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';

const TARGETS = (process.env.BENCH_TARGETS ?? 'baseline=http://localhost:5190,branch=http://localhost:5191')
  .split(',')
  .map((s) => {
    const [label, url] = s.split('=');
    return { label, url };
  });

const SETTLE_MS = 8000;
const PHASES = [
  { name: 'idle', ms: 8000, orbit: 0, run: false },
  { name: 'orbit', ms: 6000, orbit: 0.9, run: false },
  { name: 'run', ms: 6000, orbit: 0.25, run: true },
];
const WAYPOINTS = [
  { name: 'meadow', x: 15, z: 45, yaw: 1.0, pitch: 0.35, dist: 9 },
  { name: 'path', x: 40, z: 9.5, yaw: 1.41, pitch: 0.4, dist: 8 },
  { name: 'town', x: 13, z: 15, yaw: 2.45, pitch: -0.2, dist: 12 },
  { name: 'peaks', x: 30, z: 700, yaw: 0.5, pitch: 0.3, dist: 8 },
];
const LAUNCH_ARGS = [
  '--window-size=1600,900',
  '--ignore-gpu-blocklist',
  '--enable-gpu-rasterization',
  '--use-gl=angle',
  '--use-angle=gl',
  '--enable-webgl',
  '--no-sandbox',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function psSnapshot(rootPids) {
  return new Promise((resolve) => {
    execFile('ps', ['-Ao', 'pid=,ppid=,%cpu=,args='], { maxBuffer: 16e6 }, (err, out) => {
      if (err) return resolve(null);
      const rows = out
        .trim()
        .split('\n')
        .map((l) => {
          const m = l.trim().match(/^(\d+)\s+(\d+)\s+([\d.]+)\s+(.*)$/);
          return m && { pid: +m[1], ppid: +m[2], cpu: +m[3], args: m[4] };
        })
        .filter(Boolean);
      const byParent = new Map();
      for (const r of rows) {
        if (!byParent.has(r.ppid)) byParent.set(r.ppid, []);
        byParent.get(r.ppid).push(r);
      }
      const result = {};
      for (const [label, root] of Object.entries(rootPids)) {
        const seen = new Set();
        const stack = [root];
        let total = 0;
        let gpu = 0;
        while (stack.length) {
          const pid = stack.pop();
          if (seen.has(pid)) continue;
          seen.add(pid);
          const row = rows.find((r) => r.pid === pid);
          if (row) {
            total += row.cpu;
            if (row.args.includes('--type=gpu-process')) gpu += row.cpu;
          }
          for (const child of byParent.get(pid) ?? []) stack.push(child.pid);
        }
        result[label] = { total, gpu };
      }
      resolve(result);
    });
  });
}

async function teleport(page, wp, label) {
  await page.evaluate((p) => {
    const g = window.__game;
    g.sim.chat(`/dev tp ${p.x} ${p.z}`);
    g.input.camYaw = p.yaw;
    g.input.camPitch = p.pitch;
    g.input.camDist = p.dist;
    if (g.renderer) g.renderer.camDist = p.dist;
  }, wp);
  let arrived = await page
    .waitForFunction(
      (p) => {
        const pos = window.__game?.sim?.player?.pos;
        return pos && Math.hypot(pos.x - p.x, pos.z - p.z) < 8;
      },
      { timeout: 8000 },
      wp,
    )
    .then(() => true)
    .catch(() => false);
  if (!arrived) {
    // offline sims accept direct writes; use as fallback so the tour never
    // silently samples the wrong place
    await page.evaluate((p) => {
      const g = window.__game;
      g.sim.player.pos.x = p.x;
      g.sim.player.pos.z = p.z;
      g.sim.player.facing = p.yaw;
    }, wp);
    arrived = await page
      .waitForFunction(
        (p) => {
          const pos = window.__game?.sim?.player?.pos;
          return pos && Math.hypot(pos.x - p.x, pos.z - p.z) < 8;
        },
        { timeout: 3000 },
        wp,
      )
      .then(() => true)
      .catch(() => false);
    console.log(`${label}: chat teleport unconfirmed at ${wp.name}, pos-write fallback ${arrived ? 'ok' : 'FAILED'}`);
  }
  return arrived;
}

function samplePhase(page, phase) {
  return page.evaluate(
    async (ms, orbitRate) => {
      return await new Promise((resolve) => {
        const g = window.__game;
        const deltas = [];
        let last = performance.now();
        const t0 = last;
        const step = (t) => {
          deltas.push(t - last);
          last = t;
          if (g?.input && orbitRate) g.input.camYaw += ((t - t0) / 1000) * 0 + orbitRate * (deltas[deltas.length - 1] / 1000);
          if (t - t0 < ms) requestAnimationFrame(step);
          else resolve(deltas);
        };
        requestAnimationFrame(step);
      });
    },
    phase.ms,
    phase.orbit,
  );
}

function stats(deltas) {
  let acc = 0;
  let cut = 0;
  while (cut < deltas.length && acc < 1500) acc += deltas[cut++];
  const d = deltas.slice(cut).sort((a, b) => a - b);
  if (!d.length) return null;
  const avg = d.reduce((a, b) => a + b, 0) / d.length;
  const p = (q) => d[Math.min(d.length - 1, Math.floor(d.length * q))];
  return {
    avgFps: 1000 / avg,
    onePctLowFps: 1000 / p(0.99),
    p95ms: p(0.95),
    worstMs: d[d.length - 1],
  };
}

// ---- boot both targets ----
const sessions = {};
const rootPids = {};
for (const t of TARGETS) {
  const browser = await puppeteer.launch({
    executablePath: BROWSER_PATH,
    headless: 'new',
    args: LAUNCH_ARGS,
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
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
      }),
    );
  });
  await page.goto(`${t.url}/?gfx=ultra`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const hasEntry = await page
    .waitForSelector('#btn-offline', { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  if (!hasEntry) {
    await page.evaluate(() => document.querySelector('#btn-play')?.click());
    await page.waitForSelector('#btn-offline', { timeout: 60000 });
  }
  await enterOfflineGame(page, {
    charClass: 'warrior',
    charName: 'BenchProbe',
    settleMs: 2500,
    gameBootTimeoutMs: 120000,
  });
  await page.waitForFunction(() => Boolean(window.__game?.sim?.player), { timeout: 120000 });
  sessions[t.label] = { browser, page };
  rootPids[t.label] = browser.process()?.pid;
  console.log(`${t.label}: in-world (${t.url})`);
}

// ---- warm-up lap: visit every waypoint once so first-view shader program
// compilation and chunk streaming happen OUTSIDE the measured windows (the
// game prewarms its known materials at boot, but a benchmark that punishes
// first-view compiles would misattribute them as steady-state cost) ----
for (const t of TARGETS) {
  for (const wp of WAYPOINTS) {
    await teleport(sessions[t.label].page, wp, `${t.label}-warmup`);
    await sleep(3500);
  }
  console.log(`${t.label}: warm-up lap done`);
}

// ---- synchronized tour ----
const labels = TARGETS.map((t) => t.label);
const results = [];
const cpuSamples = Object.fromEntries(labels.map((l) => [l, []]));
const cpuTimer = setInterval(async () => {
  const snap = await psSnapshot(rootPids);
  if (snap) for (const l of labels) cpuSamples[l].push(snap[l]);
}, 1000);

for (const wp of WAYPOINTS) {
  await Promise.all(labels.map((l) => teleport(sessions[l].page, wp, l)));
  await sleep(SETTLE_MS);
  for (const phase of PHASES) {
    const cpuMark = Object.fromEntries(labels.map((l) => [l, cpuSamples[l].length]));
    if (phase.run)
      await Promise.all(labels.map((l) => sessions[l].page.keyboard.down('KeyW').catch(() => {})));
    const deltas = await Promise.all(labels.map((l) => samplePhase(sessions[l].page, phase)));
    if (phase.run)
      await Promise.all(labels.map((l) => sessions[l].page.keyboard.up('KeyW').catch(() => {})));
    labels.forEach((l, i) => {
      const cpu = cpuSamples[l].slice(cpuMark[l]);
      const cpuAvg = cpu.length ? cpu.reduce((a, b) => a + b.total, 0) / cpu.length : null;
      const gpuAvg = cpu.length ? cpu.reduce((a, b) => a + b.gpu, 0) / cpu.length : null;
      results.push({
        target: l,
        waypoint: wp.name,
        phase: phase.name,
        ...stats(deltas[i]),
        cpuPct: cpuAvg,
        gpuProcPct: gpuAvg,
      });
    });
    const line = labels
      .map((l, i) => {
        const s = stats(deltas[i]);
        return `${l} ${s.avgFps.toFixed(1)}fps/1%${s.onePctLowFps.toFixed(0)}`;
      })
      .join('  vs  ');
    console.log(`${wp.name.padEnd(8)} ${phase.name.padEnd(6)} ${line}`);
  }
}
clearInterval(cpuTimer);
for (const l of labels) await sessions[l].browser.close();

const out = process.env.BENCH_OUT ?? 'tmp/fps-bench-prod.json';
fs.writeFileSync(out, JSON.stringify(results, null, 2));
console.log(`\nwritten ${out}`);
process.exit(0);
