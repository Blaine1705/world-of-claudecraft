// One-off local capture tool for the Strongbox Charters store category (Bank
// Storage phase 12): shoots the WOC Store tab's charter grid on desktop and
// mobile, in both the all-fit state and the fit-gated state where a part-bought
// ladder leaves room for only the smaller charters.
//
// WHY THIS NEEDS A STUB, and why there is no shared pr_shot_targets entry: the
// WOC Store does not exist offline. src/main.ts builds claudiumHooks inside its
// `if (online)` arm and only then calls hud.attachClaudium, so offline
// storeEnabled() is false, the tab strip is dropped, and the store tab cannot be
// reached at all. The offline capture rig therefore has to attach a stub hooks
// object itself. The stub answers ONLY the reads the store paints from (balance
// plus a store snapshot carrying the four charter rows); it never fakes a
// purchase result, so nothing here can drift from the real spend contract.
//
// The fit gate reads world.bankPurchasedSlots, the ALWAYS-available owner-only
// ladder read (Bank Storage phase 15). Every stage still stands the player at the
// bursar to BUY, because bankBuySlots is proximity-gated, and buys real ladder
// rungs with granted copper so purchasedSlots is genuine state rather than a
// patched field. The away-from-bursar stages then WALK THE PLAYER OUT of banker
// range before opening the store, which is the state ruling 17 recorded: the
// store opens anywhere, and before phase 15 the gate had nothing to read there
// and listed every charter.
//
// Dev-only, not wired into any npm script or CI gate. Needs a vite dev client.
// Captures on the LOW graphics preset (standing repo rule for screenshots).
//
// Usage:
//   BROWSER_PATH=~/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome \
//   GAME_URL=http://localhost:5173 \
//     node scripts/charter_store_shot.mjs
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';
import { suppressGpuNotice } from './lib/gpu_notice_suppress.mjs';

const GAME_URL = process.env.GAME_URL ?? 'http://localhost:5173';
const OUT = process.env.SHOTS_DIR ?? 'docs/screenshots/bank-storage-charters';
fs.mkdirSync(OUT, { recursive: true });

const uniq = Date.now().toString(36).slice(-6);

const MOBILE_VIEWPORT = {
  width: 844,
  height: 390,
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
};

// The four charter prices the stub advertises. They are NOT read from the game,
// and cannot be: prices live only in the economy service catalog and the client
// never computes one, so the rig has to supply them. They MUST therefore be the
// documented launch defaults for the Strongbox charters (500 / 900 / 1500 /
// 2000 Claudium), which docs/claudium-store.md carries as doctrine.
// This rig captures the PR evidence for a monetization feature, and an earlier
// version invented "plausible" ascending numbers instead, which put four prices
// that were never the plan in front of every reviewer (Bank Storage phase 19).
// If the catalog is retuned, retune these and re-shoot.
const CHARTER_PRICES = {
  strongbox_charter_1: 500,
  strongbox_charter_2: 900,
  strongbox_charter_3: 1500,
  strongbox_charter_complete: 2000,
};

async function launchBrowser(mobile) {
  return puppeteer.launch({
    executablePath: BROWSER_PATH,
    headless: 'new',
    protocolTimeout: 180000,
    userDataDir: `/tmp/claude-1000/charter-shot-profile-${uniq}-${mobile ? 'm' : 'd'}`,
    args: ['--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    defaultViewport: mobile ? MOBILE_VIEWPORT : { width: 1600, height: 900, deviceScaleFactor: 1 },
  });
}

/** Seed the LOW graphics preset before any app code runs (the pr_shot_targets
 *  idiom): graphicsPreset 1 is LOW, and graphicsDefaultApplied stops the
 *  first-boot auto-detect from overwriting it. */
async function seedLowGraphics(page) {
  await page.evaluateOnNewDocument(() => {
    try {
      const s = JSON.parse(localStorage.getItem('woc_settings') || '{}');
      s.graphicsPreset = 1;
      s.graphicsDefaultApplied = true;
      localStorage.setItem('woc_settings', JSON.stringify(s));
    } catch {}
  });
}

/** Stand at the bursar (bankBuySlots is proximity-gated) and, for the fit-gated
 *  stages, buy `rungs` real ladder rungs so purchasedSlots is genuine. With
 *  `walkAway`, leave banker range afterwards: bankInfo goes null there and the
 *  ladder read must still answer, which is the whole of ruling 17. */
async function stageBank(page, rungs, walkAway = false) {
  const staged = await page.evaluate(
    ([wantRungs, leave]) => {
      const game = window.__game;
      const sim = game?.sim;
      try {
        for (const e of sim.entities.values()) {
          if (e.kind === 'npc' && e.templateId === 'bursar_fernando') {
            const p = sim.entities.get(sim.playerId);
            p.pos = { ...e.pos };
            p.prevPos = { ...p.pos };
            sim.rebucket(p);
            break;
          }
        }
        if (wantRungs > 0) {
          const meta = sim.players.get(sim.playerId);
          meta.copper += 100000000;
          for (let i = 0; i < wantRungs; i++) sim.bankBuySlots();
        }
        if (leave) {
          const p = sim.entities.get(sim.playerId);
          p.pos = { x: 500, y: p.pos.y, z: 500 };
          p.prevPos = { ...p.pos };
          sim.rebucket(p);
        }
      } catch {}
      return {
        atBursar: sim?.bankInfo?.purchasedSlots ?? null,
        ladder: sim?.bankPurchasedSlots ?? null,
      };
    },
    [rungs, walkAway],
  );
  // The staging above is try/catch swallowed, so a silent miss would otherwise
  // produce a confidently wrong capture. Which read is authoritative depends on
  // where the player is standing, and BOTH directions are asserted, because
  // each says something the other cannot.
  const wantSlots = rungs * 6;
  if (walkAway) {
    // A non-null bankInfo here means the walk failed and the frame would show
    // the proximity-gated state while claiming to show the open world.
    if (staged.atBursar !== null) {
      throw new Error('bank staging failed: still in banker range after walking away');
    }
    if (staged.ladder !== wantSlots) {
      throw new Error(
        `bank staging failed: ladder read ${staged.ladder} away from the bursar, wanted ${wantSlots}`,
      );
    }
    return staged.ladder;
  }
  // A null means the player never reached the bursar (bankInfo is
  // proximity-gated) and the fit gate would be reading "unknown" instead of the
  // state this stage exists to show.
  if (staged.atBursar === null) throw new Error('bank staging failed: no bankInfo at the bursar');
  if (staged.atBursar !== wantSlots) {
    throw new Error(`bank staging failed: purchasedSlots ${staged.atBursar}, wanted ${wantSlots}`);
  }
  return staged.atBursar;
}

/** Attach a stub ClaudiumHooks and open the store on its Store tab.
 *
 *  `skinIds` prices the weapon skins as well. The armory renders EVERY catalog
 *  skin whether or not the service prices it, so a charter-only stub leaves a
 *  wall of "Unavailable" cards above the charter grid: a rig artifact that
 *  makes an otherwise healthy store look broken in the captured frame. The
 *  caller collects the real ids from the first paint and re-attaches. */
async function attachStubHooks(page, prices, skinIds) {
  await page.evaluate(
    (priceMap, skins) => {
      const storeItems = Object.entries(priceMap).map(([itemId, costClaudium]) => ({
        itemId,
        name: itemId,
        kind: 'storage',
        costClaudium,
        owned: false,
      }));
      for (const [i, itemId] of skins.entries()) {
        storeItems.push({
          itemId,
          name: itemId,
          kind: 'skin',
          costClaudium: 300 + i * 50,
          owned: false,
        });
      }
      window.__game.hud.attachClaudium({
        balance: async () => 900,
        storeSnapshot: async () => ({ available: true, balance: 900, storeItems }),
        snapshot: async () => ({ available: false, packs: [], rails: [] }),
        buy: async () => {},
        spend: async () => ({
          granted: false,
          balance: 900,
          costClaudium: null,
          reason: 'unavailable',
        }),
      });
    },
    prices,
    skinIds,
  );
}

async function openStore(page) {
  await page.evaluate(() => window.__game.hud.toggleDailyRewards());
}

/** The skin ids the armory actually painted, read back off the first pass. */
async function paintedSkinIds(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('#daily-rewards-window [data-armory-skin]')]
      .map((el) => el.getAttribute('data-armory-skin'))
      .filter((id) => !!id),
  );
}

/** Loud failure over a partial shot: the category, its four-or-fewer cards, the
 *  scope line and the reused economy disclaimer must all actually be up. */
async function assertCharterUp(page, expectedCards, expectScope = true) {
  const state = await page.evaluate(
    ([want, wantScope]) => {
      const section = document.querySelector('#daily-rewards-window .charter-section');
      if (!section) return { err: 'no-charter-section' };
      // The scope line carries the gold pointer, so it appears wherever the
      // bursar can still act on it: beside the cards, and in the empty arm below
      // the ceiling. AT the ceiling neither rail has anything left, so it must be
      // ABSENT rather than read as an invitation to a purchase that cannot happen.
      const scope = section.querySelector('.charter-scope')?.textContent ?? '';
      if (wantScope && !scope) return { err: 'no-scope-line' };
      if (!wantScope && scope) return { err: 'scope line shown where gold cannot help' };
      const cards = [...section.querySelectorAll('.charter-card')];
      if (want === 0) {
        if (cards.length) return { err: 'expected the empty arm, found cards' };
        const empty = section.querySelector('.charter-empty')?.textContent ?? '';
        if (!empty) return { err: 'no-empty-line' };
        return { cards: 0, empty };
      }
      if (!section.querySelector('.charter-disclaimer')?.textContent)
        return { err: 'no-disclaimer' };
      if (!cards.length) return { err: 'no-cards' };
      if (!cards.every((c) => c.querySelector('.charter-cost')))
        return { err: 'a-card-has-no-cost' };
      return { cards: cards.length };
    },
    [expectedCards, expectScope],
  );
  if (state.err) throw new Error(`charter category not staged: ${state.err}`);
  if (state.cards !== expectedCards) {
    throw new Error(`expected ${expectedCards} charter cards, found ${state.cards}`);
  }
  if (state.empty) console.log(`  empty arm: ${state.empty}`);
  return state.cards;
}

/** Blocks until #loading-screen is not painted over the viewport.
 *
 *  This MUST run immediately before every capture, not once after entry. The
 *  backdrop comes back: each stage teleports the player to a bursar to buy real
 *  rungs, and the world load behind that re-raises it long after window.__game
 *  was published. The desktop capture is an ELEMENT clip, which shoots the
 *  viewport region the element occupies, so a raised backdrop lands in the file
 *  INSTEAD of the store, and every DOM assertion still passes because it reads
 *  the real window underneath. That is the silent failure this closes: a
 *  re-shoot exited 0 with eight loading screens in it (Bank Storage phase 19). */
async function awaitWorldPainted(page) {
  await page.waitForFunction(
    () => {
      const el = document.getElementById('loading-screen');
      if (!el) return false;
      const cs = getComputedStyle(el);
      return cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0;
    },
    { timeout: 120000 },
  );
}

/** Closes the compulsory-tutorial greeting if it is up.
 *
 *  The release that landed the Proving Shore tutorial greets a fresh offline
 *  character with a #tutorial-greeting window (Ferryman Odo), which paints OVER
 *  the store and lands in the capture. It does not close on its own and it is
 *  unrelated to anything this rig evidences, so it is dismissed before shooting.
 *  The id was found by probing the live page, not guessed: the first attempt
 *  targeted #quest-dialog, which is a DIFFERENT window and left the greeting up
 *  in a capture that still exited 0 (Bank Storage phase 19). */
async function dismissTutorialDialog(page) {
  await page.evaluate(() => {
    const dlg = document.getElementById('tutorial-greeting');
    if (!dlg || getComputedStyle(dlg).display === 'none') return;
    const btn = [...dlg.querySelectorAll('button')].at(-1);
    if (btn) btn.click();
    else dlg.style.display = 'none';
  });
  await new Promise((r) => setTimeout(r, 400));
}

async function shoot(page, file, mobile) {
  await awaitWorldPainted(page);
  await dismissTutorialDialog(page);
  // The bank family's mobile idiom is a FULL FRAME capture: an element clip on
  // the paired layout misframes (bank-chips precedent, phase 08).
  if (mobile) {
    await page.screenshot({ path: file });
    return;
  }
  const el = await page.$('#daily-rewards-window');
  if (!el) throw new Error('store window vanished before the capture');
  await el.screenshot({ path: file });
}

async function runStage({
  mobile,
  rungs,
  expectedCards,
  expectScope = true,
  walkAway = false,
  file,
}) {
  const browser = await launchBrowser(mobile);
  try {
    const page = await browser.newPage();
    await seedLowGraphics(page);
    // Headless runs on swiftshader, so the real GPU-acceleration toast always
    // fires and lands in the frame. Suppress it for the capture SESSION only
    // (it is a legitimate player notice and stays in game code).
    await suppressGpuNotice(page);
    await page.goto(GAME_URL, { waitUntil: 'domcontentloaded' });
    await enterOfflineGame(page, { settleMs: 4000 });
    // src/main.ts publishes window.__game only inside its post-entry callback,
    // after the spawn cinematic and the camera prompt resolve, so a fixed
    // settle is a race. Wait for the handle itself; every stage below reads it.
    await page.waitForFunction(() => !!window.__game?.hud?.attachClaudium, { timeout: 120000 });
    await awaitWorldPainted(page);
    if (mobile) {
      await page.evaluate(() => document.body.classList.add('mobile-touch'));
    }
    const purchased = await stageBank(page, rungs, walkAway);
    // Pass one: charters only, so the armory paints and names its skin ids.
    await attachStubHooks(page, CHARTER_PRICES, []);
    await openStore(page);
    // The store body paints from an async snapshot; give the promise a turn and
    // let the cold window settle before any DOM read (the bank-family probe
    // lesson: cold HUD windows repaint on a ~1s cadence).
    await page.waitForFunction(
      () => !!document.querySelector('#daily-rewards-window .charter-section'),
      { timeout: 30000 },
    );
    await new Promise((r) => setTimeout(r, 1500));
    // Pass two: re-attach with those skins priced and reopen, so the frame shows
    // a healthy store rather than a stub-induced wall of "Unavailable".
    const skinIds = await paintedSkinIds(page);
    await attachStubHooks(page, CHARTER_PRICES, skinIds);
    await openStore(page);
    await openStore(page);
    await page.waitForFunction(
      () => !!document.querySelector('#daily-rewards-window .charter-section'),
      { timeout: 30000 },
    );
    await new Promise((r) => setTimeout(r, 1500));
    const cards = await assertCharterUp(page, expectedCards, expectScope);
    // Scroll the category into frame so the desktop clip actually shows it.
    await page.evaluate(() => {
      document
        .querySelector('#daily-rewards-window .charter-section')
        ?.scrollIntoView({ block: 'center' });
    });
    await new Promise((r) => setTimeout(r, 400));
    await shoot(page, `${OUT}/${file}`, mobile);
    console.log(
      `${file}: purchasedSlots=${purchased} cards=${cards}${walkAway ? ' (away from every bursar)' : ''}`,
    );
  } finally {
    await browser.close();
  }
}

const STAGES = [
  { mobile: false, rungs: 0, expectedCards: 4, file: 'after-desktop.png' },
  { mobile: true, rungs: 0, expectedCards: 4, file: 'after-mobile.png' },
  // 8 rungs = 48 purchased of 72, so only the 12 and 24 slot charters still fit
  // their FULL grant. The 48 and 72 charters are omitted entirely, never
  // clamped and never shown disabled.
  { mobile: false, rungs: 8, expectedCards: 2, file: 'after-desktop-fit-gated.png' },
  { mobile: true, rungs: 8, expectedCards: 2, file: 'after-mobile-fit-gated.png' },
  // The two EMPTY arms, which say different things and must not be collapsed.
  // Eleven rungs leaves room on the ladder that no charter can fill, so the
  // honest sentence is that no charter fits and the bursar sells the rest for
  // gold. Twelve rungs is the ceiling, where nothing can ever fit again.
  { mobile: false, rungs: 11, expectedCards: 0, file: 'after-desktop-no-charter-fits.png' },
  {
    mobile: false,
    rungs: 12,
    expectedCards: 0,
    expectScope: false,
    file: 'after-desktop-ladder-full.png',
  },
  // Bank Storage phase 15, ruling 17: the SAME 8-rung ladder, read from the open
  // world instead of the bursar's counter. Before this phase the gate had no
  // count to read there and listed all four charters; these frames are the
  // before/after pair for that, and their names say where the player is standing
  // rather than which build took them.
  {
    mobile: false,
    rungs: 8,
    walkAway: true,
    expectedCards: 2,
    file: 'after-desktop-fit-gated-away-from-bursar.png',
  },
  {
    mobile: true,
    rungs: 8,
    walkAway: true,
    expectedCards: 2,
    file: 'after-mobile-fit-gated-away-from-bursar.png',
  },
];

for (const stage of STAGES) {
  await runStage(stage);
}
console.log('done');
