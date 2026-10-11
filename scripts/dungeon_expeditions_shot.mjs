// Local, real-game smoke and visual review. Requires the dev Vite server.
// GAME_URL=http://127.0.0.1:5264 OUT=tmp/expeditions node scripts/dungeon_expeditions_shot.mjs
// SHOW=1 leaves a visible browser with an open run and a helper application.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';
import { suppressGpuNotice } from './lib/gpu_notice_suppress.mjs';
import { dismissPerfNudge } from './lib/perf_nudge_dismiss.mjs';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5264';
const out = process.env.OUT ?? 'tmp/expeditions';
const show = process.env.SHOW === '1';
fs.mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: !show,
  args: [
    '--use-angle=swiftshader',
    ...(show ? ['--window-size=1360,900'] : []),
    '--disable-dev-shm-usage',
  ],
  defaultViewport: { width: 1280, height: 800 },
});
try {
  const page = await browser.newPage();
  // Resolve and click atomically: authoritative snapshots can replace controls
  // between Puppeteer's query and its async scroll/click preparation.
  const click = (selector) =>
    page.evaluate((key) => {
      const button = document.querySelector(key);
      if (!button || button.disabled) throw new Error(`Unavailable control: ${key}`);
      button.click();
    }, selector);
  const shot = async (options) => {
    await dismissPerfNudge(page);
    await page.evaluate(() =>
      document.querySelector('#gpu-notice:not([hidden]) .gpu-notice-dismiss')?.click(),
    );
    return page.screenshot(options);
  };
  const showLoot = () =>
    page.evaluate(() => {
      const root = document.querySelector('#dungeon-finder-window');
      root.scrollTop = 0;
      const pane = document.body.classList.contains('mobile-touch')
        ? root
        : root.querySelector('.df-detail');
      const filter = root.querySelector('.df-loot-filter');
      pane.scrollTop += filter.getBoundingClientRect().top - pane.getBoundingClientRect().top - 70;
    });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await suppressGpuNotice(page);
  await page.evaluateOnNewDocument(() => {
    const settings = JSON.parse(localStorage.getItem('woc_settings') ?? '{}');
    settings.graphicsPreset = 1;
    settings.graphicsDefaultApplied = true;
    localStorage.setItem('woc_settings', JSON.stringify(settings));
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const booted = await enterOfflineGame(page, {
    charName: 'Expedition',
    gameBootTimeoutMs: 120000,
  });
  if (!booted) {
    await shot({ path: `${out}/boot-failure.png` });
    console.log(
      JSON.stringify({
        booted,
        errors,
        screen: await page.evaluate(() => document.body.innerText.slice(-4000)),
      }),
    );
  }
  assert(booted);
  await page.evaluate(async () => {
    const { TALENTS } = await import('/src/sim/content/talents.ts');
    const sim = window.__game.sim;
    sim.chat('/dev god');
    sim.setPlayerLevel(8);
    sim.setSpec(TALENTS.warrior.specs.find((spec) => spec.role === 'dps').id);
    sim.dungeonFinderSetRoles(['dps']);
    if (!sim.enterDungeon('hollow_crypt')) throw new Error('Local dungeon entry failed');
  });
  await page.waitForSelector('[data-action="solo"]');
  await dismissPerfNudge(page);
  await shot({ path: `${out}/desktop-entry.png` });
  await click('[data-action="solo"]');
  await click('[data-run-status] [data-action="open"]');
  const seeded = await page.evaluate(async () => {
    const { TALENTS } = await import('/src/sim/content/talents.ts');
    const sim = window.__game.sim;
    const spawn = (cls, name, role) => {
      const pid = sim.addPlayer(cls, name, { bot: true });
      sim.setPlayerLevel(8, pid);
      sim.setSpec(TALENTS[cls].specs.find((spec) => spec.role === role).id, pid);
      sim.dungeonFinderSetRoles([role], pid);
      return pid;
    };
    const helper = spawn('priest', 'Mira', 'healer');
    const listing = sim.dungeonFinderInfo.myListing.id;
    const claim = sim.instances.find(
      (entry) => entry.exitId === sim.dungeonFinderInfo.expedition.exitId,
    );
    const other = spawn('warrior', 'Aldric', 'tank');
    if (!sim.enterDungeon('hollow_crypt', other)) throw new Error('Other group entry failed');
    sim.dungeonFinderExpeditionOpen(other);
    const secondLeader = spawn('priest', 'Nerea', 'healer');
    if (!sim.enterDungeon('hollow_crypt', secondLeader))
      throw new Error('Second group entry failed');
    sim.dungeonFinderExpeditionOpen(secondLeader);
    sim.dungeonFinderExpeditionApply(listing, 'healer', helper);
    return { helper, exitId: claim.exitId, mobs: [...claim.mobIds] };
  });
  await page.waitForSelector('[data-action="accept"]');
  await shot({ path: `${out}/desktop-request.png` });
  await click('#expedition-bell');
  await page.waitForSelector('#expedition-panel:not([hidden])');
  await click('[data-action="edit-details"]');
  await page.select('[data-purpose]', 'first_time');
  await page.type('[data-note]', 'First clear - help with bosses');
  await click('[data-action="save-details"]');
  const details = await page.evaluate(() => window.__game.sim.dungeonFinderInfo.myListing.details);
  assert.deepEqual(details, { purpose: 'first_time', note: 'First clear - help with bosses' });
  assert(
    await page.evaluate(
      () =>
        document.querySelector('.expedition-own [data-action="accept"]').getBoundingClientRect()
          .bottom <= document.querySelector('#expedition-panel').getBoundingClientRect().bottom,
    ),
  );
  await shot({ path: `${out}/desktop-board.png` });
  // Apply through real controls to two different leaders, then cancel only one.
  for (const name of ['Aldric', 'Nerea']) {
    const listingId = await page.evaluate(
      (leader) => window.__game.sim.dungeonFinderBoard.find((row) => row.leaderName === leader).id,
      name,
    );
    await click(`[data-action="request"][data-listing="${listingId}"]`);
    await page.select('[data-role]', 'dps');
    await click(`[data-action="send"][data-listing="${listingId}"]`);
    await page.waitForFunction(
      (id) => !!document.querySelector(`[data-action="cancel-application"][data-listing="${id}"]`),
      {},
      listingId,
    );
  }
  assert.equal(
    await page.evaluate(() => window.__game.sim.dungeonFinderInfo.myApplications.length),
    2,
  );
  await shot({ path: `${out}/desktop-multi-requests.png` });
  await click('[data-action="cancel-application"]');
  await page.waitForFunction(() => window.__game.sim.dungeonFinderInfo.myApplications.length === 1);
  await page.waitForFunction(
    () => document.querySelectorAll('[data-action="cancel-application"]').length === 1,
  );
  await click('[data-action="cancel-application"]');
  await page.waitForFunction(() => window.__game.sim.dungeonFinderInfo.myApplications.length === 0);
  // Local preview credit only: normal rewards are covered by real-combat tests.
  await page.evaluate(async () => {
    const { loadQueueRewards } = await import('/src/sim/social/queue_rewards.ts');
    const sim = window.__game.sim;
    sim.players.get(sim.playerId).queueRewards = loadQueueRewards({ balance: 80 });
  });
  await click('[data-action="shop"]');
  await page.waitForFunction(
    () => !document.querySelector('[data-action="buy-reward"][data-reward="bronze"]').disabled,
  );
  await shot({ path: `${out}/desktop-shop.png` });
  assert.equal(
    await page.evaluate(
      () => document.querySelectorAll('.expedition-own,.expedition-other').length,
    ),
    0,
  );
  await click('[data-action="buy-reward"][data-reward="bronze"]');
  await page.waitForFunction(
    () => document.querySelector('#expedition-bell').dataset.finish === 'bronze',
  );
  const reward = await page.evaluate(() => window.__game.sim.dungeonFinderInfo.queueRewards);
  assert.equal(reward.balance, 60);
  assert.deepEqual(reward.unlocked, ['bronze']);
  await click('[data-action="shop"]');
  const geometry = async () =>
    page.evaluate(() => {
      const panel = document.querySelector('#expedition-panel').getBoundingClientRect();
      const bell = document.querySelector('#expedition-bell').getBoundingClientRect();
      return {
        panel: { left: panel.left, right: panel.right, top: panel.top, bottom: panel.bottom },
        bell: { width: bell.width, height: bell.height },
        viewport: { width: innerWidth, height: innerHeight },
      };
    });
  const desktop = await geometry();
  assert(
    desktop.panel.right <= desktop.viewport.width &&
      desktop.panel.bottom <= desktop.viewport.height,
  );
  const media = await page.createCDPSession();
  await media.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'forced-colors', value: 'active' }],
  });
  await shot({ path: `${out}/forced-colors-board.png` });
  assert(await page.evaluate(() => matchMedia('(forced-colors: active)').matches));
  await media.send('Emulation.setEmulatedMedia', { features: [] });
  // Changing Chromium's isMobile/hasTouch mid-session reloads the page.
  // The house layout probe uses the real touch CSS on the current live world.
  await page.setViewport({ width: 844, height: 390 });
  await page.evaluate(() => document.body.classList.add('mobile-touch'));
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await shot({ path: `${out}/mobile-board.png` });
  const mobile = await geometry();
  assert(
    mobile.panel.right <= mobile.viewport.width && mobile.panel.bottom <= mobile.viewport.height,
  );
  assert(mobile.bell.width >= 40 && mobile.bell.height >= 40);
  // Both columns keep their decisions reachable through the shared scrollport.
  for (const [selector, file] of [
    ['.expedition-own [data-action="accept"]', 'mobile-request'],
    ['.expedition-other [data-action="request"]', 'mobile-join'],
  ]) {
    await page.evaluate(
      (key) => document.querySelector(key).scrollIntoView({ block: 'center', inline: 'nearest' }),
      selector,
    );
    assert(
      await page.evaluate((key) => {
        const button = document.querySelector(key).getBoundingClientRect();
        const panel = document.querySelector('#expedition-panel').getBoundingClientRect();
        return button.top >= panel.top && button.bottom <= panel.bottom;
      }, selector),
    );
    await shot({ path: `${out}/${file}.png` });
  }
  await page.evaluate(() => {
    document.querySelector('#expedition-panel').scrollTop = 0;
  });
  await page.setViewport({ width: 390, height: 844 });
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const portrait = await geometry();
  assert(
    portrait.panel.left >= 0 &&
      portrait.panel.right <= portrait.viewport.width &&
      portrait.panel.bottom <= portrait.viewport.height,
  );
  await shot({ path: `${out}/portrait-board.png` });
  await page.setViewport({ width: 1280, height: 800 });
  await page.evaluate(() => document.body.classList.remove('mobile-touch'));
  await click('[data-action="finder"]');
  await page.waitForSelector('[data-loot-class]');
  const guideDefaults = await page.evaluate(() => ({
    cls: document.querySelector('[data-loot-class]').value,
    spec: document.querySelector('[data-loot-spec]').value,
    actualSpec: window.__game.sim.talentSpec,
  }));
  assert.equal(guideDefaults.cls, 'warrior');
  assert.equal(guideDefaults.spec, guideDefaults.actualSpec);
  await shot({ path: `${out}/desktop-guide-dungeons.png` });
  await showLoot();
  await shot({ path: `${out}/desktop-guide-loot.png` });
  await page.select('[data-loot-class]', 'mage');
  const mageSpec = await page.evaluate(
    () => document.querySelector('[data-loot-spec] option[value]:not([value=""])').value,
  );
  await page.select('[data-loot-spec]', mageSpec);
  assert.equal(await page.evaluate(() => window.__game.sim.cfg.playerClass), 'warrior');
  await shot({ path: `${out}/desktop-guide-mage-loot.png` });
  await page.evaluate(() => (document.querySelector('#dungeon-finder-window').scrollTop = 0));
  await click('[data-category="raids"]');
  await shot({ path: `${out}/desktop-guide-raids.png` });
  await click('[data-category="delves"]');
  assert.equal(await page.evaluate(() => document.querySelectorAll('[data-row]').length), 2);
  assert.equal(await page.evaluate(() => document.querySelector('[data-guide-group]')), null);
  await shot({ path: `${out}/desktop-guide-delves.png` });
  await click('[data-category="dungeons"]');
  await page.setViewport({ width: 844, height: 390 });
  await page.evaluate(() => document.body.classList.add('mobile-touch'));
  await shot({ path: `${out}/mobile-guide-list.png` });
  await click('[data-row]');
  await showLoot();
  await shot({ path: `${out}/mobile-guide-loot.png` });
  const guideMobile = await page.evaluate(() => {
    const rect = document.querySelector('#dungeon-finder-window').getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  });
  assert(
    guideMobile.left >= 0 &&
      guideMobile.right <= 844 &&
      guideMobile.top >= 0 &&
      guideMobile.bottom <= 390,
  );
  await page.setViewport({ width: 1280, height: 800 });
  await page.evaluate(() => document.body.classList.remove('mobile-touch'));
  await click('#dungeon-finder-window [data-close]');
  await click('#expedition-bell');
  if (!show) {
    await click('[data-action="accept"]');
    const result = await page.evaluate(({ helper, exitId, mobs }) => {
      const sim = window.__game.sim;
      const info = sim.dungeonFinderInfoFor(helper);
      const claim = sim.instances.find((entry) => entry.exitId === exitId);
      const before = { ...sim.entities.get(helper).pos };
      sim.dungeonFinderExpeditionTravel(helper);
      return {
        party: sim.partyOf(helper)?.leader === sim.playerId,
        sameClaim: info.expedition?.exitId === exitId,
        sameMobs: JSON.stringify(claim.mobIds) === JSON.stringify(mobs),
        moved: JSON.stringify(before) !== JSON.stringify(sim.entities.get(helper).pos),
      };
    }, seeded);
    assert.deepEqual(result, { party: true, sameClaim: true, sameMobs: true, moved: true });
  }
  if (show) {
    await click('[data-action="finder"]');
    await page.select('[data-loot-class]', 'warrior');
    await showLoot();
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    `${out}/smoke.json`,
    JSON.stringify(
      {
        desktop,
        mobile,
        portrait,
        guideDefaults,
        guideMobile,
        multiApply: true,
        details,
        reward,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(`Expedition real-game smoke passed. Screenshots: ${out}`);
  if (show) {
    console.log(
      "Local preview ready. Adventure Guide is open with warrior loot. Close it and use the bell for Mira's request, other groups and the shop. Preview balance: 60 QP (seeded only for testing).",
    );
    await new Promise((resolve) => browser.once('disconnected', resolve));
  }
} finally {
  await browser.close();
}
