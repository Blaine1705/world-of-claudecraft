// Local visual evidence for the dungeon polish fixes. Requires npm run dev.
// SHOT_URL, SHOT_PREFIX, SHOT_W, SHOT_H; optional argument: weather, portal, bridge, guide.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';
import { runDungeonPolishCase } from './dungeon_polish_cases.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';

const out = 'docs/screenshots/dungeon-polish-bugs';
const prefix = process.env.SHOT_PREFIX ?? 'after_';
// biome-ignore lint/suspicious/noUndeclaredEnvVars: Local evidence tooling does not run in a cached task.
const url = process.env.SHOT_URL ?? 'http://127.0.0.1:5265/';
const mode = process.argv[2] ?? 'weather';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
fs.mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
  defaultViewport: {
    width: Number(process.env.SHOT_W ?? 1600),
    height: Number(process.env.SHOT_H ?? 900),
  },
  protocolTimeout: 240000,
});
const errors = new Set();
try {
  const page = await browser.newPage();
  page.on('pageerror', (error) => errors.add(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.add(message.text());
  });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('woc_settings', JSON.stringify({ graphicsPreset: 4 }));
    const Native = window.WebSocket;
    function CaptureSocket(url, protocols) {
      if (String(protocols ?? '').includes('vite')) {
        return {
          readyState: 0,
          addEventListener() {},
          removeEventListener() {},
          send() {},
          close() {},
        };
      }
      return new Native(url, protocols);
    }
    Object.assign(CaptureSocket, Native);
    CaptureSocket.prototype = Native.prototype;
    window.WebSocket = CaptureSocket;
  });
  await page.goto(url, {
    waitUntil: 'networkidle0',
    timeout: 180000,
  });
  if (
    !(await enterOfflineGame(page, {
      charClass: 'warrior',
      charName: 'Icewalker',
      selectorTimeoutMs: 90000,
      gameBootTimeoutMs: 180000,
      settleMs: 4000,
    }))
  )
    throw new Error('Offline world did not boot');
  console.log('BOOTED');
  const painted = async () => {
    await page.waitForFunction(
      () => {
        const cover = document.getElementById('loading-screen');
        return !cover || getComputedStyle(cover).display === 'none';
      },
      { timeout: 240000, polling: 1000 },
    );
    await sleep(1000);
  };
  await painted();
  const chat = async (command) => {
    await page.evaluate((text) => window.__game.world.chat(text), command);
    await sleep(900);
    await painted();
  };
  const ready = async (name) => {
    await page.waitForFunction(
      (field) => {
        let found = false;
        window.__game.renderer.scene.traverse((object) => {
          if (object.name === field) found = true;
        });
        return found;
      },
      { timeout: 240000 },
      name,
    );
    await sleep(8000);
    console.log('READY', name);
  };
  const camera = async (yaw, pitch, distance) => {
    await page.evaluate(
      ([a, b, c]) => {
        const game = window.__game;
        game.world.player.devNoAggro = true;
        game.input.camYaw = a;
        game.input.camPitch = b;
        game.input.camDist = c;
        let style = document.getElementById('polish-hide-ui');
        if (!style) {
          style = document.createElement('style');
          style.id = 'polish-hide-ui';
          document.head.appendChild(style);
        }
        style.textContent = '#ui, #nameplates { display: none !important; }';
      },
      [yaw, pitch, distance],
    );
    await sleep(3000);
  };
  const shot = async (name) => {
    await painted();
    const filename = path.join(out, `${prefix}${name}.png`);
    await page.screenshot({ path: filename });
    console.log('SHOT', filename);
  };
  await chat('/dev level 20');
  await chat('/dev god');
  await runDungeonPolishCase({ mode, page, chat, ready, camera, shot, sleep });
  const gpu = await page.evaluate(() => {
    const prep = window.__game.renderer.perfStats().gpuPrep;
    const events = prep?.events?.events ?? [];
    return {
      budget: prep?.budget,
      livePrograms: events.filter((event) => event.kind === 'live-program').length,
      gateTimeouts: events.filter((event) => event.kind === 'gate-timeout').length,
    };
  });
  const report = { mode, errors: [...errors], gpuPrep: gpu };
  fs.writeFileSync(path.join(out, `${prefix}${mode}.json`), `${JSON.stringify(report, null, 2)}\n`);
  console.log('REPORT', JSON.stringify(report));
} finally {
  await browser.close();
}
