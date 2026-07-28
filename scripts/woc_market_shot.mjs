// One-off local capture tool for the $WOC Exchange window PR
// (docs/prd/woc/marketplace.md): captures the REAL online window against a
// running server with the dev economy, so the screenshots show a live
// listing, the detail pane with the bid form, the sell tab, and the mobile
// landscape sheet, none of which exist offline (the window is online-only).
//
// Dev-only, not wired into any npm script or CI gate. Needs:
//   - a server started with WOC_MARKET_ENABLED=1 WOC_MARKET_DEV_SERVICE=1
//     ALLOW_DEV_COMMANDS=1 (the dev economy quotes a fixed price and the
//     epic items arrive via /dev give)
//   - a running vite dev client proxying to that server
//
// Usage: GAME_URL=http://localhost:5173 SERVER_URL=http://localhost:8787 \
//        SHOTS_DIR=docs/screenshots/woc-market node scripts/woc_market_shot.mjs
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { ed25519 } from '@noble/curves/ed25519';
import bs58 from 'bs58';
import puppeteer from 'puppeteer-core';
import WebSocket from 'ws';
import { BROWSER_PATH } from './browser_path.mjs';
import { suppressGpuNotice } from './lib/gpu_notice_suppress.mjs';
import { worldAuthMessage } from './lib/world_auth.mjs';

const GAME_URL = process.env.GAME_URL ?? 'http://localhost:5173';
const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:8787';
const WS_BASE = SERVER_URL.replace(/^http/, 'ws');
const OUT = process.env.SHOTS_DIR ?? 'docs/screenshots/woc-market';
const EPIC_ITEM = 'deathlord_warplate';
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const uniq = Date.now().toString(36).slice(-6);
// Character names are letters only (2 to 16), so the name suffix maps digits
// onto letters; usernames may keep the raw base36.
const alpha = uniq.replace(/[0-9]/g, (d) => 'abcdefghij'[Number(d)]);

async function api(path, body, token, method = 'POST') {
  const res = await fetch(SERVER_URL + path, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

// The real wallet-link flow, signed with a throwaway ed25519 key: challenge,
// sign the returned message, link. No custody anywhere, exactly like a wallet.
async function linkThrowawayWallet(token) {
  const secret = randomBytes(32);
  const address = bs58.encode(ed25519.getPublicKey(secret));
  const challenge = await api('/api/wallet/link/challenge', { address }, token);
  if (challenge.status !== 200) throw new Error(`challenge failed: ${challenge.status}`);
  const signature = bs58.encode(
    ed25519.sign(new TextEncoder().encode(challenge.body.message), secret),
  );
  const link = await api(
    '/api/wallet/link',
    { address, signature, nonce: challenge.body.nonce },
    token,
  );
  if (link.status !== 200) {
    throw new Error(`link failed: ${link.status} ${JSON.stringify(link.body)}`);
  }
  return address;
}

async function registerAccount(prefix) {
  const username = `${prefix}${uniq}`;
  const reg = await api('/api/register', {
    username,
    password: 'hunter22',
    email: `${username}@example.com`,
  });
  if (reg.status !== 200) throw new Error(`${prefix} register failed: ${reg.status}`);
  return { username, token: reg.body.token };
}

// The seller: registers, links a wallet, joins over the raw wire, receives the
// epic via /dev give, then lists it on the Exchange through the real REST flow.
async function seedSellerListing() {
  const { username, token } = await registerAccount('wocsell');
  await linkThrowawayWallet(token);
  const char = await api(
    '/api/characters',
    { name: `Aurelia${alpha.slice(0, 4)}`, class: 'warrior' },
    token,
  );
  if (char.status !== 200) throw new Error(`seller character failed: ${char.status}`);
  const characterId = char.body.id;

  const ws = new WebSocket(`${WS_BASE}/ws`);
  await new Promise((resolve, reject) => {
    ws.on('open', () => {
      ws.send(JSON.stringify(worldAuthMessage(token, characterId)));
    });
    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.t === 'hello') resolve(undefined);
      if (msg.t === 'error') reject(new Error(`seller join refused: ${msg.error}`));
    });
    ws.on('error', reject);
  });
  // The epic arrives by dev cheat (ALLOW_DEV_COMMANDS server), then the REAL
  // listing flow escrows it out of the live bags. The inventory index is not
  // knowable from out here, so walk indexes until the server accepts one.
  ws.send(JSON.stringify({ t: 'cmd', cmd: 'chat', text: `/dev give ${EPIC_ITEM}` }));
  await sleep(1500);
  let listed = false;
  for (let index = 0; index < 40 && !listed; index++) {
    const out = await api(
      '/api/woc-market/listings',
      {
        characterId,
        itemIndex: index,
        itemId: EPIC_ITEM,
        format: 'auction_buy_now',
        startCents: 2500,
        reserveCents: 10000,
        buyNowCents: 25000,
        durationHours: 24,
        offerNext: true,
      },
      token,
    );
    if (out.status === 200) listed = true;
  }
  ws.close();
  if (!listed) throw new Error('seller listing never landed; is WOC_MARKET_ENABLED=1 set?');
  console.log(`seller ${username} listed ${EPIC_ITEM}`);
}

// The exemplar flow from scripts/social_landscape_online_shot.mjs, verbatim
// where it matters: goto retry, #btn-online, the toggling #login-panel form,
// the realm picker, charcreate, Enter World, the mobile preflight.
async function enterWorldInBrowser(page, { username, charName, cls, mobile = false, register = false }) {
  await suppressGpuNotice(page);
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await page.goto(GAME_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      lastErr = undefined;
      break;
    } catch (e) {
      lastErr = e;
      await sleep(1000);
    }
  }
  if (lastErr) throw lastErr;
  if (mobile) await page.evaluate(() => document.body.classList.add('mobile-touch'));
  await page.waitForSelector('#btn-online', { timeout: 30000 });
  await sleep(1000);
  await page.evaluate(() => document.querySelector('#btn-online')?.click());
  await page.waitForSelector('#login-user', { visible: true, timeout: 45000 });
  let filled = false;
  for (let attempt = 0; attempt < 6 && !filled; attempt++) {
    filled = await page.evaluate(
      (u, p, mail, wantRegister) => {
        const form = document.querySelector('#login-panel');
        const userEl = document.querySelector('#login-user');
        const passEl = document.querySelector('#login-pass');
        const toggle = document.querySelector('#btn-auth-toggle');
        const submit = document.querySelector('#btn-login');
        if (!form || !userEl || !passEl || !toggle || !submit) return false;
        const mode = form.dataset.authMode === 'register' ? 'register' : 'login';
        const wanted = wantRegister ? 'register' : 'login';
        if (mode !== wanted) toggle.click();
        const emailEl = document.querySelector('#login-email');
        userEl.value = u;
        passEl.value = p;
        if (emailEl) emailEl.value = mail;
        submit.click();
        return true;
      },
      username,
      'hunter22',
      `${username}@example.com`,
      register,
    );
    if (!filled) await sleep(400);
  }
  if (!filled) throw new Error('login form never stabilized');
  await page.waitForSelector('#realm-list .realm-row', { timeout: 15000 });
  await page.evaluate(() => {
    const row = document.querySelector('#realm-list .realm-row');
    if (row instanceof HTMLElement) row.click();
  });
  await page.waitForFunction(
    () =>
      !document.querySelector('#charcreate-panel')?.hasAttribute('hidden') ||
      !document.querySelector('#charselect-panel')?.hasAttribute('hidden'),
    { timeout: 15000, polling: 200 },
  );
  const onCreatePanel = await page.evaluate(
    () => !document.querySelector('#charcreate-panel')?.hasAttribute('hidden'),
  );
  if (!onCreatePanel) {
    await page.evaluate(() => document.querySelector('#btn-new-character')?.click());
    await page.waitForFunction(
      () => !document.querySelector('#charcreate-panel')?.hasAttribute('hidden'),
      { timeout: 10000, polling: 200 },
    );
  }
  await page.evaluate(
    (name, wantedClass) => {
      document.querySelector('#new-char-name').value = name;
      document
        .querySelector(`#charcreate-panel .mini-class[data-class="${wantedClass}"]`)
        ?.click();
      document.querySelector('#btn-create-char').click();
    },
    charName,
    cls,
  );
  await page.waitForFunction(
    () => !document.querySelector('#charselect-panel')?.hasAttribute('hidden'),
    { timeout: 10000, polling: 200 },
  );
  await sleep(700);
  await page.evaluate((name) => {
    const rows = [...document.querySelectorAll('#char-list .char-row')];
    const row =
      rows.find((r) => r.querySelector('.char-name')?.textContent?.trim() === name) ?? rows[0];
    row?.querySelector('.enter-world-btn')?.click();
  }, charName);
  if (mobile) {
    await page
      .waitForSelector('#mobile-preflight-continue', { visible: true, timeout: 8000 })
      .catch(() => {});
    await page.evaluate(() => document.querySelector('#mobile-preflight-continue')?.click());
  }
  try {
    await page.waitForFunction(() => window.__game?.world?.entities?.size >= 1, {
      timeout: 60000,
      polling: 500,
    });
  } catch (err) {
    // Dump the stuck page state so a rerun can be diagnosed from the artifact.
    await page.screenshot({ path: `${OUT}/debug-stuck.png` });
    const state = await page.evaluate(() => ({
      login: document.querySelector('#login-panel')?.hasAttribute('hidden'),
      realm: document.querySelector('#realm-list') !== null,
      charcreate: document.querySelector('#charcreate-panel')?.hasAttribute('hidden'),
      charselect: document.querySelector('#charselect-panel')?.hasAttribute('hidden'),
      err: document.querySelector('#charselect-error')?.textContent ?? '',
      loginErr: document.querySelector('#login-error')?.textContent ?? '',
      game: typeof window.__game,
    }));
    console.error('stuck state:', JSON.stringify(state));
    throw err;
  }
  await page.evaluate(() => document.querySelector('button.tut-skip')?.click()).catch(() => {});
  await sleep(800);
}

async function openExchange(page) {
  // The online entry can leave the intro overlays up (enterOfflineGame handles
  // these for offline tours); dismiss anything that hides #ui before opening.
  await page.evaluate(() => {
    document.querySelector('button.tut-skip')?.click();
    document.querySelector('#intro-skip')?.click();
    document.querySelector('.camera-prompt-confirm')?.click();
    const ui = document.querySelector('#ui');
    if (ui instanceof HTMLElement && ui.style.display === 'none') ui.style.removeProperty('display');
    document.body.classList.remove('intro-active');
  });
  await sleep(400);
  await page.evaluate(() => window.__game.hud.toggleWocMarket());
  await page.waitForFunction(
    () =>
      document.querySelector('#woc-market-window .wm-table') !== null ||
      document.querySelector('#woc-market-window .wm-status') !== null,
    { timeout: 15000, polling: 250 },
  );
  await sleep(1200);
  const state = await page.evaluate(() => ({
    win: document.querySelector('#woc-market-window')?.getAttribute('style') ?? 'missing',
    body: (document.querySelector('#woc-market-window .wm-body')?.textContent ?? '').slice(0, 80),
    uiStyle: document.querySelector('#ui')?.getAttribute('style') ?? 'none-attr',
    uiHidden: document.querySelector('#ui')?.hasAttribute('hidden') ?? 'no-el',
  }));
  console.log('exchange state:', JSON.stringify(state));
}

async function shoot(page, file, clip) {
  // The camera-choice prompt mounts a beat after world entry and would
  // overlay the window; dismiss it (and any lingering tutorial chip) at the
  // last moment before every capture.
  const dismissed = await page.evaluate(() => {
    const confirm = document.querySelector('.camera-prompt-confirm');
    if (confirm instanceof HTMLElement) confirm.click();
    document.querySelector('button.tut-skip')?.click();
    return confirm !== null;
  });
  if (dismissed) await sleep(500);
  await page.screenshot({ path: `${OUT}/${file}`, ...(clip ? { clip } : {}) });
  console.log(`wrote ${OUT}/${file}`);
}

async function main() {
  await seedSellerListing();

  const browser = await puppeteer.launch({
    executablePath: BROWSER_PATH,
    headless: 'new',
    args: ['--window-size=1600,1000', '--use-angle=swiftshader'],
  });

  // Buyer main: the account exists (and has its wallet linked) BEFORE the
  // browser signs in, so refreshWalletLinkStatus sees the link at login and
  // the window renders its wallet-live state.
  const buyer = await registerAccount('wocbuy');
  await linkThrowawayWallet(buyer.token);
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  await enterWorldInBrowser(page, {
    username: buyer.username,
    charName: `Bramble${alpha.slice(0, 4)}`,
    cls: 'rogue',
  });
  // An epic in the buyer's own bags gives the Sell tab a real row.
  await page.evaluate((item) => window.__game.world.chat(`/dev give ${item}`), EPIC_ITEM);
  await sleep(1200);
  await openExchange(page);
  await page.evaluate(() => {
    const row = document.querySelector('#woc-market-window .wm-row');
    if (row instanceof HTMLElement) row.click();
  });
  await sleep(1500);
  await shoot(page, 'after-desktop-browse.png');

  await page.evaluate(() => {
    const tab = document.querySelector('#woc-market-window .wm-tab[data-tab="sell"]');
    if (tab instanceof HTMLElement) tab.click();
  });
  await sleep(600);
  await page.evaluate(() => {
    const item = document.querySelector('#woc-market-window .wm-sell-item');
    if (item instanceof HTMLElement) item.click();
  });
  await sleep(600);
  await shoot(page, 'after-desktop-sell.png');
  await page.close();

  // Mobile landscape (in-game mobile is landscape-only on the web client).
  // Entry happens on the desktop shell (the mobile marketing shell's login
  // path diverges under emulation), then the viewport flips to landscape
  // device metrics + mobile-touch, which is what the HUD's sheet layout keys
  // on (body class + viewport), before the window opens.
  const mob = await registerAccount('wocmob');
  await linkThrowawayWallet(mob.token);
  // A fresh browser context: the default profile keeps the buyer's stored
  // session, whose auto-resume skips the login panel this flow waits on.
  const mobileContext = await browser.createBrowserContext();
  const mobile = await mobileContext.newPage();
  await mobile.setViewport({ width: 1280, height: 800 });
  await enterWorldInBrowser(mobile, {
    username: mob.username,
    charName: `Wren${alpha.slice(0, 4)}`,
    cls: 'mage',
  });
  const client = await mobile.createCDPSession();
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 915,
    height: 412,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await client.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await mobile.evaluate(() => {
    document.body.classList.add('mobile-touch');
    window.dispatchEvent(new Event('resize'));
  });
  await sleep(1500);
  await openExchange(mobile);
  // CDP screenshots shoot the WINDOW, not the emulated viewport: clip.
  await shoot(mobile, 'after-mobile-browse.png', { x: 0, y: 0, width: 915, height: 412 });
  await mobile.close();

  await browser.close();
  console.log('done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
