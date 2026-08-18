// One-off local capture tool for the $WOC Exchange window PR
// (docs/prd/woc/marketplace.md): captures the REAL online window against a
// running server with the dev economy, so the screenshots show a live
// listing, the detail pane with the bid form, the sell tab, and the mobile
// landscape sheet, none of which exist offline (the window is online-only).
// The mobile arm also opens BOTH listing shapes' detail panes and asserts the
// money-surface touch floors (40px consent label, terms link and buttons, 24px
// checkbox, the bid field) plus the pre-bid disclosures' DOM order ahead of
// Place bid, the pixel-geometry arm the DOM units cannot see.
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
// TWO listings, because a listing is an auction XOR a buy-now now that the
// combined format is no longer creatable: one of each is what makes the detail
// pane's bid form and its Buy now button both reachable in a capture.
const EPIC_ITEM = 'deathlord_warplate';
const BUY_NOW_ITEM = 'wyrmshadow_harness';
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const uniq = Date.now().toString(36).slice(-6);
// Character names are letters only (2 to 16), so the name suffix maps digits
// onto letters; usernames may keep the raw base36.
const alpha = uniq.replace(/[0-9]/g, (d) => 'abcdefghij'[Number(d)]);
// The TAIL of the base36 stamp, not the head: the leading digits are the coarse
// ones (the 4th from the end only rolls over about once a minute), so slicing
// from the front reused a name across reruns and the register returned 409.
const nameSuffix = alpha.slice(-4);

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
  return { address, secret };
}

// The listing step-up (B6/R1): a server-built challenge signed by the linked
// wallet rides beside the listing params (a bare create refuses
// stepup_required since the step-up landed).
async function stepUpFor(token, secret, params) {
  const ch = await api(
    '/api/woc-market/step-up/challenge',
    { operation: 'create_listing', expectInstance: null, ...params },
    token,
  );
  if (ch.status !== 200) {
    throw new Error(`step-up challenge failed: ${ch.status} ${JSON.stringify(ch.body)}`);
  }
  const c = ch.body.challenge ?? ch.body;
  const signature = bs58.encode(ed25519.sign(new TextEncoder().encode(c.message), secret));
  return { nonce: c.nonce, signature };
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
  const { secret } = await linkThrowawayWallet(token);
  const char = await api(
    '/api/characters',
    { name: `Aurelia${nameSuffix}`, class: 'warrior' },
    token,
  );
  if (char.status !== 200) throw new Error(`seller character failed: ${char.status}`);
  const characterId = char.body.id;

  const ws = new WebSocket(`${WS_BASE}/ws`);
  // The delta-guarded self.inv rides the snapshot: the REAL bag index of each
  // gift, so every listing costs one step-up plus one create (walking forty
  // indexes trips the listing rate limiter now that the step-up doubles the
  // calls per attempt).
  let inv = null;
  await new Promise((resolve, reject) => {
    ws.on('open', () => {
      ws.send(JSON.stringify(worldAuthMessage(token, characterId)));
    });
    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.self && Array.isArray(msg.self.inv)) inv = msg.self.inv;
      if (msg.t === 'hello') resolve(undefined);
      if (msg.t === 'error') reject(new Error(`seller join refused: ${msg.error}`));
    });
    ws.on('error', reject);
  });
  // The epics arrive by dev cheat (ALLOW_DEV_COMMANDS server), then the REAL
  // listing flow escrows them out of the live bags.
  for (const item of [EPIC_ITEM, BUY_NOW_ITEM]) {
    ws.send(JSON.stringify({ t: 'cmd', cmd: 'chat', text: `/dev give ${item}` }));
    await sleep(800);
  }
  await sleep(1200);
  // An AUCTION carries a reserve and no buy-now price, and a BUY-NOW carries the
  // price and no reserve: the rules refuse any other pairing, so these are the
  // only two shapes a new listing can take.
  const shapes = [
    { itemId: EPIC_ITEM, format: 'auction', reserveCents: 10000, buyNowCents: null },
    { itemId: BUY_NOW_ITEM, format: 'buy_now', reserveCents: null, buyNowCents: 25000 },
  ];
  for (
    let i = 0;
    i < 40 &&
    !(inv && [EPIC_ITEM, BUY_NOW_ITEM].every((id) => inv.some((s) => s && s.itemId === id)));
    i++
  ) {
    await sleep(300);
  }
  if (!inv) throw new Error('never saw self.inv on the wire');
  const listed = [];
  for (const shape of shapes) {
    const index = inv.findIndex((s) => s && s.itemId === shape.itemId);
    if (index < 0) throw new Error(`${shape.itemId} not in bags`);
    const params = { startCents: 2500, durationHours: 24, offerNext: true, ...shape };
    const stepUp = await stepUpFor(token, secret, params);
    const out = await api(
      '/api/woc-market/listings',
      { characterId, itemIndex: index, ...params, stepUp },
      token,
    );
    if (out.status === 200) {
      listed.push(shape.format);
      // Let the post-escrow inventory delta land before the next index read.
      await sleep(1500);
    } else {
      console.log(`listing ${shape.format} refused: ${out.status} ${JSON.stringify(out.body)}`);
    }
  }
  ws.close();
  if (listed.length < shapes.length) {
    throw new Error(
      `seller listed only [${listed.join(', ')}]; is WOC_MARKET_ENABLED=1 set on the server?`,
    );
  }
  console.log(`seller ${username} listed ${listed.join(' + ')}`);
}

// The exemplar flow from scripts/social_landscape_online_shot.mjs, verbatim
// where it matters: goto retry, #btn-online, the toggling #login-panel form,
// the realm picker, charcreate, Enter World, the mobile preflight.
async function enterWorldInBrowser(
  page,
  { username, charName, cls, mobile = false, register = false },
) {
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
      document.querySelector(`#charcreate-panel .mini-class[data-class="${wantedClass}"]`)?.click();
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
    if (ui instanceof HTMLElement && ui.style.display === 'none')
      ui.style.removeProperty('display');
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
  const state = await page.evaluate(() => {
    const win = document.querySelector('#woc-market-window');
    const rect = win?.getBoundingClientRect();
    return {
      win: win?.getAttribute('style') ?? 'missing',
      body: (document.querySelector('#woc-market-window .wm-body')?.textContent ?? '').slice(0, 80),
      uiStyle: document.querySelector('#ui')?.getAttribute('style') ?? 'none-attr',
      uiHidden: document.querySelector('#ui')?.hasAttribute('hidden') ?? 'no-el',
      // The layout facts a screenshot cannot tell apart: a window wider than the
      // viewport looks identical to a correctly-sized one that the capture clipped.
      rect: rect ? `${Math.round(rect.left)},${Math.round(rect.width)}` : 'no-rect',
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      uiScale: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim(),
      mobileTouch: document.body.classList.contains('mobile-touch'),
    };
  });
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
    // The index-only Discord CTA banner floats over the top of the viewport and
    // sat across the window header in the first captures. It ships on / but not
    // on /play, so hiding it is the honest framing of the window itself.
    const cta = document.getElementById('discord-cta-banner');
    if (cta !== null) cta.hidden = true;
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
    charName: `Bramble${nameSuffix}`,
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
  // The picker is a combobox now, not a grid of .wm-sell-item buttons. Focus
  // ALONE opens the full list (the delegated focusin arm), and an option commits
  // on MOUSEDOWN rather than click, because the options are non-focusable divs
  // and a click would blur the input first.
  await page.evaluate(() => {
    document.querySelector('#woc-market-window .wm-combo-input')?.focus();
  });
  await sleep(700);
  await shoot(page, 'after-desktop-sell.png');
  await page.evaluate(() => {
    document
      .querySelector('#woc-market-window .wm-combo-item')
      ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
  await sleep(700);
  await shoot(page, 'after-desktop-sell-selected.png');
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
    charName: `Wren${nameSuffix}`,
    cls: 'mage',
  });
  // Puppeteer's OWN setViewport, not a raw Emulation.setDeviceMetricsOverride.
  // A raw CDP override is invisible to puppeteer, and page.screenshot re-asserts
  // the metrics it believes in before capturing: the layout snapped back to
  // 1280 wide and the clip then cropped the top-left of a desktop-width window,
  // which looks exactly like a window overflowing its viewport. The logged rect
  // vs viewport pair below is what caught it.
  // No isMobile/hasTouch here: flipping either makes puppeteer RELOAD the page,
  // which throws away the entered world (window.__game) this flow then drives.
  // The mobile sheet keys on the body.mobile-touch class, set below, so the
  // metrics alone are what the viewport has to supply.
  await mobile.setViewport({ width: 915, height: 412, deviceScaleFactor: 2 });
  const client = await mobile.createCDPSession();
  await client.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await mobile.evaluate(() => {
    document.body.classList.add('mobile-touch');
    window.dispatchEvent(new Event('resize'));
  });
  await sleep(1500);
  await openExchange(mobile);
  // No clip: the viewport IS the frame now that puppeteer owns the metrics.
  await shoot(mobile, 'after-mobile-browse.png', null);

  // The money-surface floors, in a REAL phone viewport: open each listing
  // shape's detail pane and measure what the DOM units cannot (rendered tap
  // heights, on-screen after scroll, the disclosures' DOM order).
  const fails = [];
  const check = (cond, msg) => {
    console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
    if (!cond) fails.push(msg);
  };
  const openRow = async (needle) => {
    const ok = await mobile.evaluate((n) => {
      const row = [...document.querySelectorAll('#woc-market-window .wm-row')].find((r) =>
        (r.textContent || '').includes(n),
      );
      if (row instanceof HTMLElement) {
        row.click();
        return true;
      }
      return false;
    }, needle);
    await sleep(1500);
    return ok;
  };
  const measureDetail = async () =>
    mobile.evaluate(() => {
      const detail = document.querySelector('#woc-market-window .wm-detail');
      const rect = (el) => {
        if (!el) return null;
        el.scrollIntoView({ block: 'nearest' });
        const r = el.getBoundingClientRect();
        return {
          w: Math.round(r.width),
          h: Math.round(r.height),
          onScreen:
            r.top >= 0 &&
            r.bottom <= window.innerHeight &&
            r.left >= 0 &&
            r.right <= window.innerWidth,
        };
      };
      const pick = (sel) => rect(detail?.querySelector(sel) ?? null);
      const order = [...(detail?.querySelectorAll('p.wm-note, button[data-action]') ?? [])].map(
        (el) =>
          `${el.getAttribute('data-action') ?? 'note'}:${(el.textContent || '').trim().slice(0, 40)}`,
      );
      return {
        termsLabel: pick('label.wm-terms'),
        termsBox: pick('label.wm-terms input'),
        termsLink: pick('a.wm-terms-link'),
        buyNow: pick('button[data-action="buy-now"]'),
        placeBid: pick('button[data-action="place-bid"]'),
        bidUsd: pick('input[data-field="bid-usd"]'),
        order,
      };
    });
  const floors = (m, label) => {
    check(m.termsLabel !== null, `${label}: the consent row renders (fresh account)`);
    if (m.termsLabel) {
      check(m.termsLabel.h >= 40, `${label}: consent label height ${m.termsLabel.h} >= 40`);
      check(
        m.termsBox && m.termsBox.w >= 24 && m.termsBox.h >= 24,
        `${label}: consent checkbox ${m.termsBox?.w}x${m.termsBox?.h} >= 24`,
      );
      check(
        m.termsLink && m.termsLink.h >= 40,
        `${label}: terms link height ${m.termsLink?.h} >= 40`,
      );
      check(m.termsLabel.onScreen && m.termsLink?.onScreen, `${label}: consent row on screen`);
    }
  };
  // The BUY-NOW pane (no bid form): the consent row plus the walk-away note.
  check(await openRow('$250'), 'buy-now listing row opened');
  const bn = await measureDetail();
  floors(bn, 'buy-now');
  check(bn.buyNow && bn.buyNow.h >= 40, `buy-now: Buy now button height ${bn.buyNow?.h} >= 40`);
  const noteIdx = bn.order.findIndex((o) => o.startsWith('note:Buy now holds'));
  const buyIdx = bn.order.findIndex((o) => o.startsWith('buy-now:'));
  check(noteIdx >= 0 && noteIdx < buyIdx, 'buy-now: the walk-away note precedes the button');
  await shoot(mobile, 'after-mobile-buy-now-consent.png', null);
  // The AUCTION pane: the bid form with the disclosures BEFORE Place bid.
  check(await openRow('No bids yet'), 'auction listing row opened');
  const au = await measureDetail();
  floors(au, 'auction');
  const bindIdx = au.order.findIndex((o) => /binding/i.test(o));
  const bidIdx = au.order.findIndex((o) => o.startsWith('place-bid:'));
  check(bindIdx >= 0 && bindIdx < bidIdx, 'auction: the binding disclosure precedes Place bid');
  check(au.placeBid && au.placeBid.h >= 40, `auction: Place bid height ${au.placeBid?.h} >= 40`);
  check(au.bidUsd && au.bidUsd.h >= 40, `auction: bid field height ${au.bidUsd?.h} >= 40`);
  await shoot(mobile, 'after-mobile-auction-disclosures.png', null);
  await mobile.close();

  await browser.close();
  console.log(
    fails.length === 0
      ? 'done: all mobile floor checks passed'
      : `${fails.length} mobile floor check(s) FAILED:\n - ${fails.join('\n - ')}`,
  );
  process.exit(fails.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
