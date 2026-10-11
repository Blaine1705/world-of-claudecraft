// Playwright/Puppeteer script to verify and capture the World of Warcraft-style
// Death Recap feature.
// Captures:
// 1. Death overlay with "Liberar espiritu" and "Resumen" buttons
// 2. Opened Death Recap window with combat event cards, HP bars, lethal badge, and summary
// 3. Ability tooltip on card hover

import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';

const ARTIFACT_DIR = 'C:/Users/joseg/.gemini/antigravity-cli/brain/c5250ddf-e80c-41f3-948f-690217a4d9a7';
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

const URL = 'http://localhost:5173/?gfx=low';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROFILE = path.resolve('tmp/death-recap-profile');
fs.rmSync(PROFILE, { recursive: true, force: true });
fs.mkdirSync(PROFILE, { recursive: true });

console.log('Launching browser...');
const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  protocolTimeout: 120000,
  userDataDir: PROFILE,
  args: [
    '--window-size=1600,1000',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--no-sandbox',
    '--disable-breakpad',
    '--disable-crash-reporter',
    '--disable-dev-shm-usage',
  ],
  defaultViewport: { width: 1600, height: 1000 },
});

try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

  console.log('Navigating to', URL);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 40000 });

  const clk = (sel) => page.evaluate((s) => document.querySelector(s)?.click(), sel);

  console.log('Starting offline session...');
  await page.waitForSelector('#btn-offline', { timeout: 20000 });
  await clk('#btn-offline');
  await sleep(300);
  await page.type('#char-name', 'WarriorHero');
  await clk('#offline-select .mini-class[data-class="warrior"]');
  await sleep(150);
  await clk('#btn-start-offline');

  console.log('Waiting for game to initialize...');
  await page.waitForFunction(
    () => window.__game?.renderer && window.__game.sim && window.__game.hud,
    { timeout: 120000, polling: 500 },
  );
  await sleep(4000);

  // Dismiss tutorial / greeting dialogs
  await page.evaluate(() => {
    for (const btn of document.querySelectorAll('button')) {
      if (/understood|dismiss|skip|cerrar|close/i.test(btn.textContent || '')) {
        try {
          btn.click();
        } catch {}
      }
    }
  });
  await sleep(1000);

  console.log('Injecting combat log events and triggering player death...');
  await page.evaluate(() => {
    const game = window.__game;
    const p = game.sim.player;
    const now = performance.now();

    // Set player max HP & starting combat HP
    p.maxHp = 1200;
    p.hp = 1200;
    p.dead = false;
    p.ghost = false;

    // Register synthetic entities in world if needed for clean names
    if (!game.sim.entities.has(201)) {
      game.sim.entities.set(201, { id: 201, kind: 'mob', name: 'Defias Bandit', templateId: 'bandit' });
    }
    if (!game.sim.entities.has(202)) {
      game.sim.entities.set(202, { id: 202, kind: 'mob', name: 'Defias Pillager', templateId: 'pillager' });
    }
    if (!game.sim.entities.has(102)) {
      game.sim.entities.set(102, { id: 102, kind: 'player', name: 'Allied Priest', templateId: 'priest' });
    }

    // Event 1: Melee strike from Defias Bandit (-280 HP)
    game.hud.meters.onEvent({
      type: 'damage',
      kind: 'hit',
      sourceId: 201,
      sourceName: 'Defias Bandit',
      targetId: p.id,
      targetName: p.name,
      amount: 280,
      abilityId: 'attack',
      ability: 'Melee',
      school: 'physical',
      crit: false,
    });
    p.hp = 920;

    // Event 2: Flash Heal from Allied Priest (+190 HP)
    game.hud.meters.onEvent({
      type: 'heal2',
      sourceId: 102,
      sourceName: 'Allied Priest',
      targetId: p.id,
      targetName: p.name,
      amount: 190,
      effectiveAmount: 190,
      abilityId: 'flash_heal',
      ability: 'Flash Heal',
      school: 'holy',
      crit: true,
    });
    p.hp = 1110;

    // Event 3: Fireball from Defias Pillager (-420 HP)
    game.hud.meters.onEvent({
      type: 'damage',
      kind: 'hit',
      sourceId: 202,
      sourceName: 'Defias Pillager',
      targetId: p.id,
      targetName: p.name,
      amount: 420,
      abilityId: 'fireball',
      ability: 'Fireball',
      school: 'fire',
      crit: false,
    });
    p.hp = 690;

    // Event 4: Fatal Shadow Bolt (Crit) from Defias Pillager (-690 HP)
    game.hud.meters.onEvent({
      type: 'damage',
      kind: 'hit',
      sourceId: 202,
      sourceName: 'Defias Pillager',
      targetId: p.id,
      targetName: p.name,
      amount: 690,
      abilityId: 'shadow_bolt',
      ability: 'Shadow Bolt',
      school: 'shadow',
      crit: true,
    });
    p.hp = 0;

    // Player dies
    p.dead = true;
    p.ghost = false;
    game.hud.meters.onEvent({
      type: 'death',
      pid: p.id,
      name: p.name,
      killerName: 'Defias Pillager',
      killerAbility: 'Shadow Bolt',
    });

    // Explicitly show death overlay
    const deathOverlay = document.getElementById('death-overlay');
    if (deathOverlay) {
      deathOverlay.style.display = 'flex';
    }
  });

  await sleep(800);

  // Capture screenshot 1: Death overlay dialog with Release & Recap buttons
  const deathOverlayPath = path.join(ARTIFACT_DIR, 'death_overlay_dialog.png');
  await page.screenshot({ path: deathOverlayPath });
  console.log('Saved death overlay screenshot:', deathOverlayPath);

  // Click on Death Recap button (#death-recap-btn)
  console.log('Clicking Death Recap button...');
  await clk('#death-recap-btn');
  await sleep(1000);

  // Capture screenshot 2: Death Recap window
  const deathRecapPath = path.join(ARTIFACT_DIR, 'death_recap_window.png');
  await page.screenshot({ path: deathRecapPath });
  console.log('Saved death recap window screenshot:', deathRecapPath);

  // Hover over the lethal Shadow Bolt card to show ability tooltip
  console.log('Hovering over lethal strike card for tooltip...');
  const lethalCard = await page.$('.recap-card-lethal');
  if (lethalCard) {
    const box = await lethalCard.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 80, box.y + 24);
      await sleep(1000);
    }
  } else {
    console.log('No lethal card found to hover on');
  }

  // Capture screenshot 3: Death Recap window with tooltip
  const deathRecapTooltipPath = path.join(ARTIFACT_DIR, 'death_recap_with_tooltip.png');
  await page.screenshot({ path: deathRecapTooltipPath });
  console.log('Saved death recap with tooltip screenshot:', deathRecapTooltipPath);

  console.log('All screenshots captured successfully!');
} finally {
  await browser.close();
}
