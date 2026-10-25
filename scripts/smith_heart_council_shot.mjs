// Evidence captures for the Smith's Heart's Hammer Council (docs/design/raid/
// smith_heart.md sections 5.18 and 7.1): the three on the Quarry floor, a
// Mountain's Wrath with the raid hiding behind the pillars, Wake the Stone
// raising a pillar, a Resonance cracking one, a Falling Rock soak, and the
// inheritance's light when one of them falls. A small raid of dev-only
// stand-in players is added to the offline world so the marks have someone
// to fall on. Evidence tooling, not a repo test. Needs a dev Vite serving the
// worktree (ALLOW_DEV_COMMANDS is implied offline).
//
//   node scripts/smith_heart_council_shot.mjs <outDir> [label]
//
// Env: SHOT_URL (http://127.0.0.1:5191/), SHOT_W / SHOT_H (1600x900),
// SHOT_PRESET (4), SHOT_ONLY (comma list of shot names), SHOT_HEROIC=1.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';

const URL = process.env.SHOT_URL ?? 'http://127.0.0.1:5191/';
const OUT = process.argv[2] ?? path.join('tmp', 'smith_heart_council');
const LABEL = process.argv[3] ?? 'consejo';
const W = Number(process.env.SHOT_W ?? 1600);
const H = Number(process.env.SHOT_H ?? 900);
const PRESET = Number(process.env.SHOT_PRESET ?? 4);
const ONLY = process.env.SHOT_ONLY ? new Set(process.env.SHOT_ONLY.split(',')) : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ENTRY = { x: -196, z: -210 };
const MID = { x: 8, z: -170 };

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  args: [`--window-size=${W},${H}`, '--use-angle=d3d11', '--ignore-gpu-blocklist'],
  defaultViewport: { width: W, height: H },
  protocolTimeout: 240000,
});
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || /THREE\.|shader|WebGL/i.test(m.text()))
      console.log('CONSOLE:', m.type(), m.text().slice(0, 400));
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
    charName: 'Heartwalker',
    gameBootTimeoutMs: 180000,
    selectorTimeoutMs: 90000,
    settleMs: 4000,
  });
  if (!booted) throw new Error('offline world did not boot');
  const chat = async (c, wait = 900) => {
    await page.evaluate((line) => window.__game.world.chat(line), c);
    await sleep(wait);
  };
  // The camera's own player is never the council's foe (/dev noaggro).
  for (const c of ['/dev level 20', '/dev god', '/dev heart enter', '/dev noaggro'])
    await chat(c, 1500);
  for (const p of ['h1', 'h2', 'h3']) await chat(`/dev heart kill pack ${p}`, 300);
  if (process.env.SHOT_HEROIC === '1') await chat('/dev heart council heroic on', 300);
  await page.waitForFunction(
    () => {
      let found = false;
      window.__game.renderer.scene.traverse((o) => {
        if (o.name === 'smithHeartField') found = true;
      });
      return found;
    },
    { timeout: 180000, polling: 1000 },
  );
  await page.addStyleTag({ content: '#ui { display: none !important; }' });
  const O = await page.evaluate(
    ([ex, ez]) => {
      const p = window.__game.world.player;
      return { x: p.pos.x - ex, z: p.pos.z - ez };
    },
    [ENTRY.x, ENTRY.z],
  );
  console.log('origin', O);
  // The stand-in raid: eight players of several classes, god-moded.
  await page.evaluate(() => {
    const w = window.__game.world;
    const classes = ['warrior', 'paladin', 'mage', 'priest', 'rogue', 'hunter', 'druid', 'shaman'];
    window.__raid = classes.map((c, i) => {
      const id = w.addPlayer(c, `Raider${i + 1}`);
      const e = w.entities.get(id);
      e.devGod = true;
      return id;
    });
  });
  // Place the camera's own player and hold the camera.
  const place = async (at, look, yaw, pitch, dist) =>
    page.evaluate(
      ([ox, oz, x, z, fx, fz, yaw, pitch, dist]) => {
        const w = window.__game.world;
        const p = w.player;
        const g = w.ctx.groundPos(ox + x, oz + z);
        p.pos = { ...g };
        p.prevPos = { ...g };
        p.facing = Math.atan2(fx - x, fz - z);
        p.prevFacing = p.facing;
        const input = window.__game.input;
        window.__shotHold = { yaw: p.facing + yaw, pitch, dist };
        if (!window.__shotHoldLoop) {
          window.__shotHoldLoop = true;
          const hold = () => {
            const h = window.__shotHold;
            if (h) {
              input.zoomMax = Math.max(input.zoomMax, h.dist);
              input.camYaw = h.yaw;
              input.camPitch = h.pitch;
              input.camDist = h.dist;
            }
            requestAnimationFrame(hold);
          };
          requestAnimationFrame(hold);
        }
      },
      [O.x, O.z, at[0], at[1], look[0], look[1], yaw, pitch, dist],
    );
  // Put raider `i` at instance-local (x, z).
  const raider = (i, x, z) =>
    page.evaluate(
      ([ox, oz, i, x, z]) => {
        const w = window.__game.world;
        const e = w.entities.get(window.__raid[i]);
        const g = w.ctx.groundPos(ox + x, oz + z);
        e.pos = { ...g };
        e.prevPos = { ...g };
        w.ctx.rebucket(e);
      },
      [O.x, O.z, i, x, z],
    );
  // The council's shared state (a read of its live fight).
  const state = () =>
    page.evaluate(() => {
      for (const e of window.__game.world.entities.values()) {
        const st = e.smithHeartFight;
        if (st) return JSON.parse(JSON.stringify(st));
      }
      return null;
    });
  const pull = async () => {
    // The council pulls onto raider 1 (the tank), at the Quarry's middle.
    await raider(0, MID.x - 4, MID.z);
    await page.evaluate(() => {
      const w = window.__game.world;
      const tank = w.entities.get(window.__raid[0]);
      for (const e of w.entities.values())
        if (/^heart_(hammer_guardian|slabwright|seam_singer)$/.test(e.templateId) && !e.dead)
          w.ctx.aggroMob(e, tank, false);
    });
    await sleep(800);
    const st = await state();
    if (st) {
      // Park the clocks: each shot calls its own mechanic.
      await page.evaluate(() => {
        for (const e of window.__game.world.entities.values()) {
          const st = e.smithHeartFight;
          if (!st) continue;
          Object.assign(st, {
            weightTimer: 999,
            wakeTimer: 999,
            rockTimer: 999,
            boltTimer: 999,
            songTimer: 999,
            songDue: null,
            energy: 0,
          });
          break;
        }
      });
    }
  };
  const reset = () => chat('/dev heart council reset', 1500);
  const col = (k, out) => {
    const deg = [20, 92, 164, 236, 308][k];
    const a = (deg * Math.PI) / 180;
    return [MID.x + Math.sin(a) * (24 + out), MID.z + Math.cos(a) * (24 + out)];
  };
  const shoot = async (name) => {
    const buf = await page.screenshot();
    fs.mkdirSync(OUT, { recursive: true });
    const file = path.join(OUT, `${name}_${LABEL}.png`);
    fs.writeFileSync(file, buf);
    console.log('SHOT', file);
  };

  const scenes = {
    // The three on the Quarry floor among the five columns.
    async '01_consejo'() {
      await reset();
      await place([-16, -177], [8, -170], 0.15, 0.22, 17);
      await sleep(5000);
    },
    // A Wrath with the raid hiding behind the pillars (one caught out).
    async '02_ira'() {
      await reset();
      await pull();
      for (let i = 1; i < 8; i++) {
        const [x, z] = i === 7 ? [MID.x - 16, MID.z + 6] : col(i % 5, 5 + (i > 5 ? 2.5 : 0));
        await raider(i, x, z);
      }
      await place([MID.x - 30, MID.z - 18], [MID.x, MID.z], 0.1, 0.62, 40);
      await sleep(1200);
      await chat('/dev heart council wrath', 0);
      await sleep(2600);
    },
    // Wake the Stone: a pillar bursting out of the floor under its player.
    async '03_despertar'() {
      await reset();
      await pull();
      await raider(1, MID.x - 14, MID.z + 10);
      await raider(2, MID.x - 6, MID.z - 15);
      for (let i = 3; i < 8; i++) await raider(i, MID.x + 14 + i, MID.z + 18);
      await place([MID.x - 26, MID.z + 4], [MID.x - 10, MID.z], -0.1, 0.24, 20);
      await chat('/dev heart council wake', 0);
      await sleep(1200 + 5000 + 230);
    },
    // Resonance cracking a pillar: its ring, the thread, the pillar humming.
    async '04_resonancia'() {
      await reset();
      await pull();
      for (let i = 1; i < 8; i++) await raider(i, MID.x - 10 - i, MID.z - 6 + i);
      await chat('/dev heart council resonance 1', 200);
      const st = await state();
      const pid = st?.resonance?.[0]?.playerId;
      const [x, z] = col(2, -4.5);
      await page.evaluate(
        ([ox, oz, pid, x, z]) => {
          const w = window.__game.world;
          const e = w.entities.get(pid);
          if (!e) return;
          const g = w.ctx.groundPos(ox + x, oz + z);
          e.pos = { ...g };
          e.prevPos = { ...g };
          w.ctx.rebucket(e);
        },
        [O.x, O.z, pid, x, z],
      );
      // From the Quarry's middle side (the council behind the camera).
      await place(col(2, -11), col(2, 0), 0.0, 0.42, 9);
      await sleep(2400);
    },
    // A Falling Rock: the soak with three under it, the boulder dropping.
    async '05_roca'() {
      await reset();
      await pull();
      for (let i = 1; i < 8; i++) await raider(i, MID.x - 12 - i * 0.3, MID.z + 12);
      await chat('/dev heart council rock', 1500);
      const st = await state();
      const pid = st?.rock?.playerId;
      const at = [MID.x - 14, MID.z + 12];
      await page.evaluate(
        ([ox, oz, pid, x, z, raid]) => {
          const w = window.__game.world;
          const ids = [pid, ...raid.slice(1, 4)];
          ids.forEach((id, k) => {
            const e = w.entities.get(id);
            if (!e) return;
            const g = w.ctx.groundPos(ox + x + (k % 2) * 1.6 - 0.8, oz + z + (k > 1 ? 1.4 : -0.6));
            e.pos = { ...g };
            e.prevPos = { ...g };
            w.ctx.rebucket(e);
          });
        },
        [O.x, O.z, pid, at[0], at[1], await page.evaluate(() => window.__raid)],
      );
      await place([at[0] - 12, at[1] - 4], at, 0.05, 0.34, 14);
      // Shoot as the boulder drops into the soak.
      const until = Date.now() + 8000;
      while (Date.now() < until) {
        const s2 = await state();
        if (!s2?.rock || s2.rock.remaining < 0.2) break;
        await sleep(25);
      }
    },
    // The stone remembers: the Slabwright falls and its light flows on.
    async '06_herencia'() {
      await reset();
      await pull();
      for (let i = 1; i < 8; i++) await raider(i, MID.x - 12 - i, MID.z - 12 + i);
      await place([MID.x - 22, MID.z + 2], [MID.x, MID.z - 4], 0.0, 0.32, 18);
      await sleep(800);
      // The Slabwright a few strides from its siblings, so its light arcs to them.
      await page.evaluate(
        ([ox, oz, x, z]) => {
          const w = window.__game.world;
          for (const e of w.entities.values()) {
            if (e.templateId !== 'heart_slabwright' || e.dead) continue;
            const g = w.ctx.groundPos(ox + x, oz + z);
            e.pos = { ...g };
            e.prevPos = { ...g };
            w.ctx.rebucket(e);
          }
        },
        [O.x, O.z, MID.x - 2, MID.z - 15],
      );
      await chat('/dev heart kill slabwright', 0);
      await sleep(1000);
    },
    // Review only (never delivered): the two bodies close, the energy, the
    // Weight and a bolt.
    async r_cuerpos() {
      await reset();
      await place([MID.x - 9, MID.z + 3], [MID.x + 3, MID.z], 0.0, 0.12, 9);
      await sleep(3000);
    },
    async r_energia() {
      await reset();
      await pull();
      for (let i = 1; i < 8; i++) await raider(i, MID.x - 12 - i, MID.z - 12 + i);
      await chat('/dev heart council energy 92', 300);
      await place([MID.x - 16, MID.z + 6], [MID.x, MID.z], 0.0, 0.2, 14);
      await sleep(1500);
    },
    async r_peso() {
      await reset();
      await pull();
      await chat('/dev heart council weight', 0);
      await place([MID.x - 16, MID.z + 6], [MID.x - 4, MID.z], 0.0, 0.2, 12);
      await sleep(1500 + 1200);
    },
    async r_rayo() {
      await reset();
      await pull();
      for (let i = 1; i < 8; i++) await raider(i, MID.x - 12 - i, MID.z - 12 + i);
      await chat('/dev heart council bolt', 0);
      await place([MID.x - 16, MID.z - 12], [MID.x, MID.z], 0.0, 0.2, 14);
      await sleep(2050);
    },
  };
  for (const [name, run] of Object.entries(scenes)) {
    if (!ONLY && name.startsWith('r_')) continue;
    if (ONLY && !ONLY.has(name)) continue;
    await run();
    await shoot(name);
  }
} finally {
  await browser.close();
}
