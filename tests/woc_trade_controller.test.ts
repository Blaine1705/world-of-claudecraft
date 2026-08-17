// @vitest-environment happy-dom

// Behavior tests for the woc_trade controller's deps-bag seam
// (src/ui/hud/woc_trade/woc_trade_controller.ts): the one thing the extraction
// invented is Hud field access becoming closure indirection, so what is pinned
// here is the seam's contract, not the render markup (the pure model and the
// arm painter have their own suites). staged() must hand back the LIVE object
// (the unstage click mutates it in place), setStaged must replace it on the
// open and close transitions, and the completion report fires exactly once.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WocOfferView } from '../src/net/woc_market_sdk';
import { ITEMS } from '../src/sim/data';
import { itemDisplayName } from '../src/ui/entity_i18n';
import {
  WocTradeController,
  type WocTradeControllerDeps,
} from '../src/ui/hud/woc_trade/woc_trade_controller';
import { t } from '../src/ui/i18n';
import { wocUsdText } from '../src/ui/trade_woc_panel';
import type { WocPendingOffer } from '../src/ui/trade_woc_view';
import type { WocMarketHooks } from '../src/ui/woc_market_window';
import type { IWorld } from '../src/world_api';

interface Rig {
  controller: WocTradeController;
  host: {
    staged: { items: { itemId: string; count: number }[]; copper: number };
    inventory: { itemId: string; count: number }[];
    tradeInfo: {
      otherName: string;
      myOffer: { items: { itemId: string; count: number }[]; copper: number };
      theirOffer: { items: { itemId: string; count: number }[]; copper: number };
      myAccepted: boolean;
      theirAccepted: boolean;
    } | null;
    logs: string[];
    pushed: number;
    bagRenders: number;
    setStagedCalls: number;
    balanceRefreshes: number;
    closed: number;
    cancelled: number;
    confirmed: number;
  };
}

function rig(marketHooks: WocMarketHooks | null = null): Rig {
  document.body.innerHTML =
    '<div id="trade-window" style="display:none"></div><div id="bags" style="display:none"></div>';
  const host: Rig['host'] = {
    staged: { items: [], copper: 0 },
    inventory: [],
    tradeInfo: null,
    logs: [],
    pushed: 0,
    bagRenders: 0,
    setStagedCalls: 0,
    balanceRefreshes: 0,
    closed: 0,
    cancelled: 0,
    confirmed: 0,
  };
  const world = {
    get tradeInfo() {
      return host.tradeInfo;
    },
    get inventory() {
      return host.inventory;
    },
    tradeConfirm: () => {
      host.confirmed++;
    },
    tradeCancel: () => {
      host.cancelled++;
    },
    tradeClose: () => {
      host.closed++;
    },
    tradeSetOffer: () => {},
  } as unknown as IWorld;
  const deps: WocTradeControllerDeps = {
    world: () => world,
    marketHooks: () => marketHooks,
    staged: () => host.staged,
    setStaged: (next) => {
      host.setStagedCalls++;
      host.staged = next;
    },
    pushTradeOffer: () => {
      host.pushed++;
    },
    refreshWocBalance: () => {
      host.balanceRefreshes++;
    },
    log: (text) => {
      host.logs.push(text);
    },
    itemIcon: () => '<span class="icon"></span>',
    attachTooltip: () => {},
    itemTooltip: () => '',
    renderBags: () => {
      host.bagRenders++;
    },
  };
  return { controller: new WocTradeController(deps), host };
}

function openTrade(r: Rig, myItems: { itemId: string; count: number }[] = []): void {
  r.host.tradeInfo = {
    otherName: 'Bree',
    myOffer: { items: myItems, copper: 0 },
    theirOffer: { items: [], copper: 0 },
    myAccepted: false,
    theirAccepted: false,
  };
  r.controller.updateTradeWindow();
}

/** A service offer row, typed as the REAL SDK view so the fixture cannot
 *  silently drift from the fields the controller actually reads (itemId feeds
 *  the completion line, settlementState the phase derivation). */
function offerRow(over: Partial<WocOfferView> = {}): WocOfferView {
  return {
    id: 7,
    status: 'pending',
    role: 'buyer',
    buyerName: 'Aldric',
    sellerName: 'Bree',
    itemId: null,
    usdCents: 100,
    listingId: null,
    buyerAccepted: false,
    sellerAccepted: false,
    listingStatus: null,
    listingResolution: null,
    settlementState: null,
    expiresAtMs: 9_999_999_999_999,
    ...over,
  };
}

function heldOffer(over: Partial<WocPendingOffer> = {}): WocPendingOffer {
  return {
    id: 7,
    usdCents: 100,
    tokens: null,
    role: 'buyer',
    phase: 'review',
    listingId: null,
    buyerAccepted: false,
    sellerAccepted: false,
    ...over,
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Drain the microtask chain a floating poll promise walks through (the poll's
 *  then body awaits the estimate internally, so one turn is not enough; the
 *  deepest traced chain needs four turns, six leaves margin). Keep the count
 *  ahead of the deepest await chain: an under-drain shows up as the PRESENT
 *  mid-test assertions failing, not as a silent pass. */
async function flushAsync(): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

/** A controllable fake of the $WOC market hooks: recorders on every call the
 *  controller makes, with per-test overridable results so a test can hold a
 *  promise in flight or move the service-side truth between polls. */
function fakeHooks(): {
  hooks: WocMarketHooks;
  state: {
    offersResult: { ok: boolean; offers: WocOfferView[] };
    estimateImpl: (cents: number) => Promise<unknown>;
    buyNowImpl: () => Promise<unknown>;
    acceptOfferImpl: () => Promise<unknown>;
    createOfferImpl: () => Promise<unknown>;
    settlementQuoteImpl: () => Promise<unknown>;
    confirmSettlementImpl: () => Promise<unknown>;
    lastAcceptBody: Record<string, unknown> | null;
    lastCreateBody: Record<string, unknown> | null;
    stepUpSignatureRequired: boolean;
    stepUpGate: Promise<void> | null;
    signMessageImpl: (message: string) => Promise<string>;
    calls: {
      offers: number;
      estimates: number[];
      buyNows: number;
      acceptOffers: number[];
      stepUpChallenges: Record<string, unknown>[];
      signMessages: string[];
      createOffers: number;
      resolveOffers: [number, string][];
    };
  };
} {
  const state = {
    offersResult: { ok: true, offers: [] as WocOfferView[] },
    estimateImpl: (_cents: number): Promise<unknown> =>
      Promise.resolve({ amount: { tokens: 800 }, split: null }),
    buyNowImpl: (): Promise<unknown> => Promise.resolve({ ok: false, code: 'woc_market.disabled' }),
    // The waiting branch by default: agreed, the other side has not yet.
    acceptOfferImpl: (): Promise<unknown> => Promise.resolve({ ok: true, listing: null }),
    createOfferImpl: (): Promise<unknown> =>
      Promise.resolve({ ok: false, code: 'woc_market.disabled' }),
    settlementQuoteImpl: (): Promise<unknown> =>
      Promise.resolve({ ok: false, code: 'woc_market.disabled' }),
    confirmSettlementImpl: (): Promise<unknown> =>
      Promise.resolve({ ok: false, code: 'woc_market.disabled' }),
    lastAcceptBody: null as Record<string, unknown> | null,
    lastCreateBody: null as Record<string, unknown> | null,
    // The challenge answer. Default devsig (wallet-free); a test can flip
    // signatureRequired true and/or defer resolution to exercise the real
    // wallet arm and the in-flight face.
    stepUpSignatureRequired: false as boolean,
    stepUpGate: null as null | Promise<void>,
    // The wallet message-signer. Default resolves; a test can reject it (a
    // decline) or count calls.
    signMessageImpl: (_message: string): Promise<string> => Promise.resolve('walletsig'),
    calls: {
      offers: 0,
      estimates: [] as number[],
      buyNows: 0,
      acceptOffers: [] as number[],
      stepUpChallenges: [] as Record<string, unknown>[],
      signMessages: [] as string[],
      createOffers: 0,
      resolveOffers: [] as [number, string][],
    },
  };
  const hooks = {
    client: {
      offers: () => {
        state.calls.offers++;
        return Promise.resolve(state.offersResult);
      },
      estimate: (cents: number) => {
        state.calls.estimates.push(cents);
        return state.estimateImpl(cents);
      },
      buyNow: () => {
        state.calls.buyNows++;
        return state.buyNowImpl();
      },
      // The step-up mint the SELLER accept runs first (B6/R1). The devsig
      // answer keeps these behavioral tests wallet-free while still proving
      // the proof rides the accept body (nonce recorded per call).
      stepUpChallenge: async (req: Record<string, unknown>) => {
        state.calls.stepUpChallenges.push(req);
        // Optional gate to hold the mint open (the in-flight face / re-entrancy
        // tests await this before resolving).
        if (state.stepUpGate) await state.stepUpGate;
        const nonce = `nonce-${state.calls.stepUpChallenges.length}`;
        return {
          ok: true,
          challenge: {
            nonce,
            message: `step-up message ${nonce}`,
            expiresAtMs: 4_000_000_000_000,
            signatureRequired: state.stepUpSignatureRequired,
          },
        };
      },
      acceptOffer: (id: number, body: Record<string, unknown>) => {
        state.calls.acceptOffers.push(id);
        state.lastAcceptBody = body;
        return state.acceptOfferImpl();
      },
      resolveOffer: (id: number, action: string) => {
        state.calls.resolveOffers.push([id, action]);
        return Promise.resolve({ ok: true });
      },
      settlementQuote: () => state.settlementQuoteImpl(),
      confirmSettlement: () => state.confirmSettlementImpl(),
      createOffer: (body: Record<string, unknown>) => {
        state.calls.createOffers++;
        state.lastCreateBody = body;
        return state.createOfferImpl();
      },
      tradePartner: () => Promise.resolve(null),
    },
    characterId: () => 1,
    walletLinked: () => true,
    signAndSendTransactionBase64: () => Promise.reject(new Error('unused')),
    signMessageBase58: (message: string) => {
      state.calls.signMessages.push(message);
      return state.signMessageImpl(message);
    },
  } as unknown as WocMarketHooks;
  return { hooks, state };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the open transition', () => {
  it('shows the window, resets the staged offer through setStaged, and opens the bags', () => {
    const r = rig();
    r.host.staged = { items: [{ itemId: 'wolf_fang', count: 3 }], copper: 500 };
    openTrade(r);
    expect(document.querySelector<HTMLElement>('#trade-window')?.style.display).toBe('block');
    expect(r.host.setStagedCalls).toBe(1);
    expect(r.host.staged).toEqual({ items: [], copper: 0 });
    expect(r.host.bagRenders).toBe(1);
    expect(document.querySelector<HTMLElement>('#bags')?.style.display).toBe('flex');
    expect(document.querySelector('#trade-window .trade-cols')).not.toBeNull();
  });

  it('repaints only when the signature moves: an identical second pass leaves the subtree alone', () => {
    const r = rig();
    openTrade(r);
    const el = document.querySelector<HTMLElement>('#trade-window');
    el?.firstElementChild?.setAttribute('data-probe', 'survives');
    r.controller.updateTradeWindow();
    expect(el?.querySelector('[data-probe]')).not.toBeNull();
  });
});

describe('the unstage click mutates the LIVE staged object', () => {
  it('decrements the very array the host holds and pushes the offer', () => {
    const r = rig();
    openTrade(r);
    // Stage after the open reset, exactly as the bags window does: by writing
    // into the same object staged() returns.
    const live = r.host.staged;
    live.items.push({ itemId: 'wolf_fang', count: 2 });
    r.host.tradeInfo!.myOffer.items = [{ itemId: 'wolf_fang', count: 2 }];
    r.controller.updateTradeWindow();
    const mine = document.querySelector<HTMLElement>('#trade-window .trade-item.mine');
    expect(mine).not.toBeNull();
    mine?.click();
    // The click handler must have walked through staged() to the live array:
    // a defensive copy would leave the host's copy untouched and this red.
    expect(live.items).toEqual([{ itemId: 'wolf_fang', count: 1 }]);
    expect(r.host.staged).toBe(live);
    expect(r.host.pushed).toBe(1);
  });
});

describe('the close transition', () => {
  it('hides the window, resets the staged offer again, and repaints the open bags', () => {
    const r = rig();
    openTrade(r);
    const rendersAfterOpen = r.host.bagRenders;
    r.host.staged.items.push({ itemId: 'wolf_fang', count: 1 });
    r.host.tradeInfo = null;
    r.controller.updateTradeWindow();
    expect(document.querySelector<HTMLElement>('#trade-window')?.style.display).toBe('none');
    expect(r.host.setStagedCalls).toBe(2);
    expect(r.host.staged).toEqual({ items: [], copper: 0 });
    // The bags stayed open through the trade, so the close repaints them.
    expect(r.host.bagRenders).toBe(rendersAfterOpen + 1);
  });
});

type FinishRow = { id: number; usdCents: number; role: 'buyer' | 'seller'; itemId: string | null };

function finishOf(r: Rig): (row: FinishRow) => void {
  return (
    r.controller as unknown as { finishWocTrade: (input: FinishRow) => void }
  ).finishWocTrade.bind(r.controller);
}

describe('the completion report', () => {
  it('fires exactly once per offer id: one line, one balance refresh, one close', () => {
    const r = rig();
    const row: FinishRow = { id: 5, usdCents: 100, role: 'seller', itemId: null };
    const finish = finishOf(r);
    (r.controller as unknown as { wocTradeSplit: unknown }).wocTradeSplit = {
      sellerCents: 90,
      burnCents: 3,
      treasuryCents: 7,
    };
    finish(row);
    finish(row);
    expect(r.host.logs).toHaveLength(1);
    expect(r.host.balanceRefreshes).toBe(1);
    expect(r.host.closed).toBe(1);
    // The settled deal's split dies at the finish clear site too.
    expect((r.controller as unknown as { wocTradeSplit: unknown }).wocTradeSplit).toBeNull();
    // CLOSE, never cancel: a cancel would contradict the payment line just
    // printed, and the sale succeeded.
    expect(r.host.cancelled).toBe(0);
    // A different offer id reports again: the retired set is per id, not global.
    finish({ ...row, id: 6 });
    expect(r.host.logs).toHaveLength(2);
  });

  it('names each side its own news: the seller was PAID, the buyer SPENT', () => {
    const r = rig();
    const finish = finishOf(r);
    finish({ id: 5, usdCents: 100, role: 'seller', itemId: null });
    finish({ id: 6, usdCents: 100, role: 'buyer', itemId: null });
    // The keys are literals HERE, so swapping the role selection in
    // finishWocTrade cannot satisfy both lines.
    expect(r.host.logs[0]).toBe(
      t('hudChrome.trade.woc.paidSeller', { price: wocUsdText(100), item: '' }),
    );
    expect(r.host.logs[1]).toBe(
      t('hudChrome.trade.woc.paidBuyer', { price: wocUsdText(100), item: '' }),
    );
    expect(r.host.logs[0]).not.toBe(r.host.logs[1]);
    // One literal price so the formatter half is not a self-comparison.
    expect(r.host.logs[0]).toContain('$1.00');
  });

  it('resolves a known item id to its display name and keeps a RAW unknown id (R34)', () => {
    const r = rig();
    const finish = finishOf(r);
    finish({ id: 7, usdCents: 100, role: 'seller', itemId: 'wolf_fang' });
    const name = itemDisplayName(ITEMS.wolf_fang);
    expect(name.length).toBeGreaterThan(0);
    expect(r.host.logs[0]).toContain(name);
    // A prototype-key id must take the unknown arm without throwing, and the
    // line names the raw id rather than a blank: a message naming nothing is
    // worse than one the player can at least search.
    finish({ id: 8, usdCents: 100, role: 'seller', itemId: 'constructor' });
    expect(r.host.logs[1]).toContain('constructor');
  });
});

describe('the standing-offer poll ($WOC hooks attached)', () => {
  it('reads the REST rail at most once per 2s window, however often the band repaints', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const h = fakeHooks();
    const r = rig(h.hooks);
    openTrade(r);
    r.controller.updateTradeWindow();
    r.controller.updateTradeWindow();
    // Three passes inside one window: one REST read. The poll runs before the
    // repaint signature, so every pass reaches it; the wall clock is the gate.
    expect(h.state.calls.offers).toBe(1);
    vi.setSystemTime(1_002_000);
    r.controller.updateTradeWindow();
    expect(h.state.calls.offers).toBe(2);
  });

  it('adopts the standing row into the money row and CLEARS it when the row vanishes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const h = fakeHooks();
    h.state.offersResult = { ok: true, offers: [offerRow()] };
    const r = rig(h.hooks);
    openTrade(r);
    await flushAsync();
    r.controller.updateTradeWindow();
    // Side-scoped: a buyer-role offer reads in MY money row (first column),
    // never the counterparty's. The split is a shipped-bug surface.
    expect(
      document.querySelector('#trade-window .trade-col:first-child .trade-woc-money'),
    ).not.toBeNull();
    expect(
      document.querySelector('#trade-window .trade-col:last-child .trade-woc-money'),
    ).toBeNull();
    // The other side withdrew: the service read no longer returns the row. A
    // held offer that never clears paints a deal that no longer exists.
    h.state.offersResult = { ok: true, offers: [] };
    vi.setSystemTime(1_002_000);
    r.controller.updateTradeWindow();
    await flushAsync();
    r.controller.updateTradeWindow();
    expect(document.querySelector('#trade-window .trade-woc-money')).toBeNull();
  });

  it("a seller-role offer reads in THEIR money row, not the seller's own", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const h = fakeHooks();
    // The seller's standing offer: the selector matches sellers by buyerName.
    h.state.offersResult = { ok: true, offers: [offerRow({ role: 'seller', buyerName: 'Bree' })] };
    const r = rig(h.hooks);
    openTrade(r);
    await flushAsync();
    r.controller.updateTradeWindow();
    expect(
      document.querySelector('#trade-window .trade-col:last-child .trade-woc-money'),
    ).not.toBeNull();
    expect(
      document.querySelector('#trade-window .trade-col:first-child .trade-woc-money'),
    ).toBeNull();
  });

  it('the adoption estimate stores the fee split, not only the tokens', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const h = fakeHooks();
    h.state.estimateImpl = () =>
      Promise.resolve({
        amount: { tokens: 800 },
        split: { sellerCents: 90, burnCents: 3, treasuryCents: 7 },
      });
    h.state.offersResult = { ok: true, offers: [offerRow()] };
    const r = rig(h.hooks);
    openTrade(r);
    await flushAsync();
    r.controller.updateTradeWindow();
    await flushAsync();
    // No compose-time estimate ever ran here (nothing was typed): the split
    // must ride the ADOPTION estimate, or a window reopened mid-deal shows
    // blank Fee and You receive lines on the $WOC tab.
    const c = r.controller as unknown as { wocTradeSplit: unknown };
    expect(c.wocTradeSplit).toEqual({ sellerCents: 90, burnCents: 3, treasuryCents: 7 });
  });

  it('a slower earlier estimate never clobbers a newer answer (last write wins)', async () => {
    vi.useFakeTimers();
    const h = fakeHooks();
    const stale = deferred<unknown>();
    const fresh = deferred<unknown>();
    const queue = [stale.promise, fresh.promise];
    h.state.estimateImpl = () => queue.shift() ?? Promise.resolve(null);
    const r = rig(h.hooks);
    openTrade(r);
    const c = r.controller as unknown as {
      onWocTradePrice(cents: number | null): void;
      wocTradeTokens: number | null;
    };
    c.onWocTradePrice(100);
    await vi.advanceTimersByTimeAsync(350);
    c.onWocTradePrice(200);
    await vi.advanceTimersByTimeAsync(350);
    expect(h.state.calls.estimates).toEqual([100, 200]);
    fresh.resolve({ amount: { tokens: 222 }, split: null });
    await flushAsync();
    // The stale answer lands LATE: the sequence guard must drop it.
    stale.resolve({ amount: { tokens: 111 }, split: null });
    await flushAsync();
    expect(c.wocTradeTokens).toBe(222);
  });
});

describe('the payment re-entry guard', () => {
  it('one buy-now lock per purchase: a second Pay mid-flight is a no-op', async () => {
    const h = fakeHooks();
    const buy = deferred<unknown>();
    h.state.buyNowImpl = () => buy.promise;
    const r = rig(h.hooks);
    const c = r.controller as unknown as {
      wocTradeOffer: WocPendingOffer | null;
      payWocTradeOffer(): Promise<void>;
    };
    c.wocTradeOffer = heldOffer({
      role: 'buyer',
      phase: 'awaiting_payment',
      listingId: 41,
      buyerAccepted: true,
      sellerAccepted: true,
    });
    const first = c.payWocTradeOffer();
    const second = c.payWocTradeOffer();
    buy.resolve({ ok: false, code: 'woc_market.disabled' });
    await Promise.all([first, second]);
    expect(h.state.calls.buyNows).toBe(1);
  });
});

describe('the two window buttons', () => {
  it('accept routes by the standing offer AT CLICK TIME: sim confirm only when none', () => {
    const r = rig();
    openTrade(r);
    const accept = [
      ...document.querySelectorAll<HTMLButtonElement>('#trade-window button.btn'),
    ].find((b) => b.textContent === t('hud.trade.accept'));
    expect(accept).toBeTruthy();
    accept?.click();
    expect(r.host.confirmed).toBe(1);
    // A $WOC offer now stands: the sim confirm must NEVER run for it (it would
    // swap the goods for nothing); acceptance is recorded on the offer instead.
    (r.controller as unknown as { wocTradeOffer: WocPendingOffer | null }).wocTradeOffer =
      heldOffer({ role: 'seller' });
    accept?.click();
    expect(r.host.confirmed).toBe(1);
  });

  it('with hooks attached, the standing-offer accept really reaches the service', async () => {
    // The other half of the routing claim: the click must land on
    // acceptOffer, not merely avoid the sim confirm. A buyer brings only
    // money, so no staged item is needed.
    const h = fakeHooks();
    const r = rig(h.hooks);
    openTrade(r);
    (r.controller as unknown as { wocTradeOffer: WocPendingOffer | null }).wocTradeOffer =
      heldOffer({ role: 'buyer' });
    const accept = [
      ...document.querySelectorAll<HTMLButtonElement>('#trade-window button.btn'),
    ].find((b) => b.textContent === t('hud.trade.accept'));
    accept?.click();
    await flushAsync();
    expect(h.state.calls.acceptOffers).toEqual([7]);
    // The BUYER accept is bearer-only by role: no step-up mint, no proof
    // field (their money path signs its own payment later).
    expect(h.state.calls.stepUpChallenges).toEqual([]);
    expect(Object.hasOwn(h.state.lastAcceptBody ?? {}, 'stepUp')).toBe(false);
    expect(r.host.confirmed).toBe(0);
  });

  it('the cancel button routes to sim.tradeCancel, and only there', () => {
    const r = rig();
    openTrade(r);
    const cancel = [
      ...document.querySelectorAll<HTMLButtonElement>('#trade-window button.btn'),
    ].find((b) => b.textContent === t('hud.trade.cancel'));
    expect(cancel).toBeTruthy();
    cancel?.click();
    expect(r.host.cancelled).toBe(1);
    expect(r.host.closed).toBe(0);
    expect(r.host.confirmed).toBe(0);
  });
});

describe('the coin inputs', () => {
  it('a change writes the combined copper into the LIVE staged object', () => {
    const r = rig();
    openTrade(r);
    // Captured AFTER the open reset: the same object staged() returns.
    const live = r.host.staged;
    const g = document.querySelector<HTMLInputElement>('#trade-g');
    const s = document.querySelector<HTMLInputElement>('#trade-s');
    const c = document.querySelector<HTMLInputElement>('#trade-c');
    expect(g && s && c).toBeTruthy();
    if (!g || !s || !c) return;
    g.value = '5';
    s.value = '32';
    c.value = '45';
    g.dispatchEvent(new Event('change'));
    // A copy anywhere on the staged() path loses this write silently.
    expect(live.copper).toBe(5 * 10000 + 32 * 100 + 45);
    expect(r.host.staged).toBe(live);
    expect(r.host.pushed).toBe(1);
  });
});

describe('the escrow-failed retry face', () => {
  it('both agreed with NO listing reopens Accept; an escrowed deal hides it', () => {
    const h = fakeHooks();
    const r = rig(h.hooks);
    openTrade(r);
    const c = r.controller as unknown as { wocTradeOffer: WocPendingOffer | null };
    // The server reopened the offer after a failed escrow: both accepted, no
    // listing. A "Waiting" dead end here had no exit; the button must be live.
    c.wocTradeOffer = heldOffer({
      role: 'seller',
      tokens: 800,
      buyerAccepted: true,
      sellerAccepted: true,
    });
    r.controller.updateTradeWindow();
    const accept = [
      ...document.querySelectorAll<HTMLButtonElement>('#trade-window button.btn'),
    ].find((b) => b.textContent === t('hud.trade.accept'));
    expect(accept).toBeTruthy();
    expect(accept?.disabled).toBe(false);
    expect(accept?.hidden).toBe(false);
    // Counter-shape: the goods escrowed (a listing exists, the phase moved), so
    // there is nothing left to accept and the button HIDES. Located by
    // position (the accept button is appended first), because its text reads
    // Waiting here: a text-based finder would pass on the label alone even if
    // the hidden flag were dropped.
    c.wocTradeOffer = {
      ...(c.wocTradeOffer as WocPendingOffer),
      listingId: 41,
      phase: 'awaiting_payment',
    };
    r.controller.updateTradeWindow();
    const buttons = document.querySelectorAll<HTMLButtonElement>('#trade-window > button.btn');
    expect(buttons.length).toBe(2);
    expect(buttons[0]?.hidden).toBe(true);
    expect(buttons[0]?.disabled).toBe(true);
  });
});

describe('the accept request body (seller escrow)', () => {
  it('escrows the STAGED copy by its inventory index, or refuses when unfindable', async () => {
    const h = fakeHooks();
    const r = rig(h.hooks);
    // No openTrade here on purpose: the accept path reads staged, inventory,
    // the held offer and the hooks, never the window, and the open poll's
    // empty-result callback would clear the planted offer mid-test.
    // The staged copy sits at inventory index 1: sending the staged POSITION
    // instead read as 0 and escrowed whatever sat first in the bags, which
    // refused the sale at the very last step (the shipped shape).
    r.host.staged.items.push({ itemId: 'worn_sword', count: 1 });
    r.host.inventory.push({ itemId: 'boar_hide', count: 3 }, { itemId: 'worn_sword', count: 1 });
    const c = r.controller as unknown as {
      wocTradeOffer: WocPendingOffer | null;
      acceptWocTradeOffer(): Promise<void>;
    };
    c.wocTradeOffer = heldOffer({ role: 'seller' });
    await c.acceptWocTradeOffer();
    expect(h.state.calls.acceptOffers).toEqual([7]);
    expect(h.state.lastAcceptBody).toMatchObject({
      characterId: 1,
      itemIndex: 1,
      itemId: 'worn_sword',
      // The seller's proof (B6/R1): minted first, devsig under the fake's
      // explicit signatureRequired false, riding the same body.
      stepUp: { nonce: 'nonce-1', signature: 'devsig:nonce-1' },
    });
    expect(h.state.calls.stepUpChallenges).toEqual([
      { operation: 'accept_directed_offer', offerId: 7 },
    ]);
    // The refusal arm: the staged copy is no longer in the bags. Not-found is
    // NOT index 0; refusing beats escrowing the wrong item.
    h.state.calls.acceptOffers.length = 0;
    r.host.inventory.length = 0;
    await c.acceptWocTradeOffer();
    expect(h.state.calls.acceptOffers).toEqual([]);
    expect(r.host.logs.at(-1)).toBe(t('hudChrome.trade.woc.hintAcceptNeedsItem'));
  });

  it('signs the SERVER message on the real-wallet arm, and a DECLINE sends no accept (B6/R1)', async () => {
    // Coverage's untested branch: the fake defaults devsig, so the real
    // signMessageBase58 path never ran. Flip signatureRequired true and reject
    // the sign: the accept must NOT be sent, and the decline copy shows.
    const h = fakeHooks();
    h.state.stepUpSignatureRequired = true;
    h.state.signMessageImpl = () => Promise.reject(new Error('user declined in wallet'));
    const r = rig(h.hooks);
    r.host.staged.items.push({ itemId: 'worn_sword', count: 1 });
    r.host.inventory.push({ itemId: 'worn_sword', count: 1 });
    const c = r.controller as unknown as {
      wocTradeOffer: WocPendingOffer | null;
      acceptWocTradeOffer(): Promise<void>;
    };
    c.wocTradeOffer = heldOffer({ role: 'seller' });
    await c.acceptWocTradeOffer();
    // The wallet was asked to sign the exact server message.
    expect(h.state.calls.signMessages).toEqual(['step-up message nonce-1']);
    // The decline aborts BEFORE acceptOffer: no custody moves on a refused sign.
    expect(h.state.calls.acceptOffers).toEqual([]);
    expect(r.host.logs.at(-1)).toBe('user declined in wallet');
  });

  it('a real signature reaches the accept body as the proof', async () => {
    const h = fakeHooks();
    h.state.stepUpSignatureRequired = true;
    h.state.signMessageImpl = () => Promise.resolve('REALSIG');
    const r = rig(h.hooks);
    r.host.staged.items.push({ itemId: 'worn_sword', count: 1 });
    r.host.inventory.push({ itemId: 'worn_sword', count: 1 });
    const c = r.controller as unknown as {
      wocTradeOffer: WocPendingOffer | null;
      acceptWocTradeOffer(): Promise<void>;
    };
    c.wocTradeOffer = heldOffer({ role: 'seller' });
    await c.acceptWocTradeOffer();
    expect(h.state.lastAcceptBody).toMatchObject({
      stepUp: { nonce: 'nonce-1', signature: 'REALSIG' },
    });
  });

  it('a double-click during the wallet round trip mints exactly one challenge (re-entrancy)', async () => {
    // Frontend blocking: the Accept button stays labeled Accept during the
    // multi-second wallet handoff; without the guard a second click mints a
    // second challenge and races two acceptances into escrow.
    const h = fakeHooks();
    h.state.stepUpSignatureRequired = true;
    let releaseSign!: () => void;
    h.state.signMessageImpl = () =>
      new Promise<string>((resolve) => {
        releaseSign = () => resolve('REALSIG');
      });
    const r = rig(h.hooks);
    r.host.staged.items.push({ itemId: 'worn_sword', count: 1 });
    r.host.inventory.push({ itemId: 'worn_sword', count: 1 });
    const c = r.controller as unknown as {
      wocTradeOffer: WocPendingOffer | null;
      acceptWocTradeOffer(): Promise<void>;
    };
    c.wocTradeOffer = heldOffer({ role: 'seller' });
    // First click: parks awaiting the wallet signature.
    const first = c.acceptWocTradeOffer();
    await flushAsync();
    // Second click while the first is outstanding: the guard returns early. Do
    // NOT await it (without the guard it would park on the same deferred sign
    // and the test would fail by timeout instead of by this assertion); the
    // guard makes it resolve synchronously, and the mint count is the pin.
    void c.acceptWocTradeOffer();
    await flushAsync();
    expect(h.state.calls.stepUpChallenges, 'exactly one mint').toHaveLength(1);
    // Release the wallet and let the first click finish.
    releaseSign();
    await first;
    expect(h.state.calls.acceptOffers, 'exactly one accept').toEqual([7]);
  });

  it('disables the Accept button while the seller acceptance is in flight, and the flag is in the repaint signature', () => {
    const h = fakeHooks();
    const r = rig(h.hooks);
    const c = r.controller as unknown as {
      wocTradeOffer: WocPendingOffer | null;
      wocTradeAccepting: boolean;
      wocTradeOfferPolledAtMs: number;
    };
    openTrade(r, [{ itemId: 'worn_sword', count: 1 }]);
    // Disable the REST poll for the test (a far-future stamp keeps it throttled)
    // so the planted standing offer is not cleared by an empty poll result.
    c.wocTradeOfferPolledAtMs = Date.now() + 1_000_000;
    c.wocTradeOffer = heldOffer({ role: 'seller' });
    // Commit the signature with the offer present and the flag DOWN: the button
    // reads Accept, enabled (production's steady state before the click).
    r.controller.updateTradeWindow();
    const before = [
      ...document.querySelectorAll<HTMLButtonElement>('#trade-window button.btn'),
    ].find((b) => b.textContent === t('hud.trade.accept'));
    expect(before, 'the button reads Accept before the round trip').toBeTruthy();
    expect(before?.disabled).toBe(false);
    // Flip ONLY the in-flight flag and repaint: because wocTradeAccepting is in
    // the signature, the render is NOT elided (the whole point of the fix), and
    // the button flips to a disabled Waiting.
    c.wocTradeAccepting = true;
    r.controller.updateTradeWindow();
    const during = [
      ...document.querySelectorAll<HTMLButtonElement>('#trade-window button.btn'),
    ].find((b) => b.textContent === t('hud.trade.waiting'));
    expect(during, 'the flag flip repainted a disabled Waiting button').toBeTruthy();
    expect(during?.disabled).toBe(true);
    // And back down: the finally's reset repaints an actionable button again.
    c.wocTradeAccepting = false;
    r.controller.updateTradeWindow();
    const after = [
      ...document.querySelectorAll<HTMLButtonElement>('#trade-window button.btn'),
    ].find((b) => b.textContent === t('hud.trade.accept'));
    expect(after, 'the button is not stuck at Waiting after the round trip').toBeTruthy();
    expect(after?.disabled).toBe(false);
  });

  it('the seller accept flips the in-flight flag across its real wallet round trip', async () => {
    // The behavioral half: the flag is true while the wallet sign is
    // outstanding and false once it settles (drives the face above).
    const h = fakeHooks();
    h.state.stepUpSignatureRequired = true;
    let releaseSign!: () => void;
    h.state.signMessageImpl = () =>
      new Promise<string>((resolve) => {
        releaseSign = () => resolve('REALSIG');
      });
    const r = rig(h.hooks);
    r.host.staged.items.push({ itemId: 'worn_sword', count: 1 });
    r.host.inventory.push({ itemId: 'worn_sword', count: 1 });
    const c = r.controller as unknown as {
      wocTradeOffer: WocPendingOffer | null;
      wocTradeAccepting: boolean;
      acceptWocTradeOffer(): Promise<void>;
    };
    c.wocTradeOffer = heldOffer({ role: 'seller' });
    const started = c.acceptWocTradeOffer();
    await flushAsync();
    expect(c.wocTradeAccepting, 'true while the wallet sign is outstanding').toBe(true);
    releaseSign();
    await started;
    expect(c.wocTradeAccepting, 'false once it settles').toBe(false);
  });

  it('resets the in-flight flag on close, so a dismissed wallet does not stick the next trade', () => {
    const h = fakeHooks();
    const r = rig(h.hooks);
    const c = r.controller as unknown as { wocTradeAccepting: boolean };
    // Open the window first (the close-reset lives in the was-open branch), then
    // simulate a wallet round trip left in flight (desktop signer has no
    // timeout), then close: the flag must clear so the next trade is not stuck.
    openTrade(r);
    c.wocTradeAccepting = true;
    r.host.tradeInfo = null;
    r.controller.updateTradeWindow();
    expect(c.wocTradeAccepting, 'closing the window abandons the round trip').toBe(false);
  });

  it('refuses a stale accept over a MULTI-SLOT staged table with the one_item WHY', async () => {
    // This belt is the accept-time enforcement of the whole-table one_item
    // rule (the trade window's Accept button never consults the model):
    // resolving an ambiguous first-eligible slot could only turn into a
    // server-side item_mismatch, so the send path refuses locally instead.
    // The HUD-local list holds ONE slot while the sim's cleaned offer holds
    // two, so this also pins that the belt reads the AUTHORITATIVE list.
    const h = fakeHooks();
    const r = rig(h.hooks);
    r.host.staged.items.push({ itemId: 'worn_sword', count: 1 });
    r.host.tradeInfo = {
      otherPid: 2,
      otherName: 'Borin',
      myOffer: {
        items: [
          { itemId: 'worn_sword', count: 1 },
          { itemId: 'boar_hide', count: 1 },
        ],
        copper: 0,
      },
      theirOffer: { items: [], copper: 0 },
      myAccepted: false,
      theirAccepted: false,
    } as unknown as typeof r.host.tradeInfo;
    r.host.inventory.push({ itemId: 'worn_sword', count: 1 }, { itemId: 'boar_hide', count: 1 });
    const c = r.controller as unknown as {
      wocTradeOffer: WocPendingOffer | null;
      acceptWocTradeOffer(): Promise<void>;
    };
    c.wocTradeOffer = heldOffer({ role: 'seller' });
    await c.acceptWocTradeOffer();
    expect(h.state.calls.acceptOffers).toEqual([]);
    expect(r.host.logs.at(-1)).toBe(t('hudChrome.trade.woc.hintOneItem'));
  });

  it('answers needs-item, never one_item, over a table with NOTHING sellable (arm order)', async () => {
    // The ladder-order pin: with no eligible slot at all, "leave only the one
    // being sold" would point at a table holding nothing sellable, so the
    // needs-item arm must win even though the two-slot shape also satisfies
    // the one_item predicate. Mirrors the model's acceptHint ladder.
    const h = fakeHooks();
    const r = rig(h.hooks);
    r.host.staged.items.push({ itemId: 'worn_sword', count: 1 });
    r.host.tradeInfo = {
      otherPid: 2,
      otherName: 'Borin',
      myOffer: {
        items: [
          { itemId: 'boar_hide', count: 1 },
          { itemId: 'boar_hide', count: 1 },
        ],
        copper: 0,
      },
      theirOffer: { items: [], copper: 0 },
      myAccepted: false,
      theirAccepted: false,
    } as unknown as typeof r.host.tradeInfo;
    const c = r.controller as unknown as {
      wocTradeOffer: WocPendingOffer | null;
      acceptWocTradeOffer(): Promise<void>;
    };
    c.wocTradeOffer = heldOffer({ role: 'seller' });
    await c.acceptWocTradeOffer();
    expect(h.state.calls.acceptOffers).toEqual([]);
    expect(r.host.logs.at(-1)).toBe(t('hudChrome.trade.woc.hintAcceptNeedsItem'));
  });

  it('resolves an INSTANCED staged copy through the sim offer, index and payload both', async () => {
    // The fix-round blocker: the HUD-local compose list is id-plus-count
    // only, so resolving from it could only match a PLAIN bag copy; an
    // instanced directed sale either refused at the index resolution or
    // extracted the wrong copy into an item_mismatch. The sim's cleaned
    // offer (tradeInfo.myOffer) carries the per-copy payload the staging
    // preview pinned, and the accept must resolve through IT.
    const h = fakeHooks();
    const r = rig(h.hooks);
    const signed = { itemId: 'worn_sword', count: 1, instance: { signer: 'Ayla' } };
    r.host.staged.items.push({ itemId: 'worn_sword', count: 1 });
    r.host.tradeInfo = {
      otherPid: 2,
      otherName: 'Borin',
      myOffer: { items: [signed], copper: 0 },
      theirOffer: { items: [], copper: 0 },
      myAccepted: false,
      theirAccepted: false,
    } as unknown as typeof r.host.tradeInfo;
    r.host.inventory.push({ itemId: 'worn_sword', count: 1 }, {
      itemId: 'worn_sword',
      count: 1,
      instance: { signer: 'Ayla' },
    } as unknown as {
      itemId: string;
      count: number;
    });
    const c = r.controller as unknown as {
      wocTradeOffer: WocPendingOffer | null;
      acceptWocTradeOffer(): Promise<void>;
    };
    c.wocTradeOffer = heldOffer({ role: 'seller' });
    await c.acceptWocTradeOffer();
    expect(h.state.calls.acceptOffers).toEqual([7]);
    expect(h.state.lastAcceptBody).toMatchObject({
      itemIndex: 1,
      itemId: 'worn_sword',
      expectInstance: { signer: 'Ayla' },
    });
  });
});

describe('the createOffer request body (buyer send)', () => {
  it('names the EXACT copy on the table, and asserts the terms per call', async () => {
    // The offer pins a fingerprint of the copy it is for (H10): the server
    // refuses acceptance of any other copy, so an id-only body would let a
    // seller swap in a re-rolled instance after the price was agreed. The
    // per-call terms flag is the other half: the pay arm's "terms were
    // accepted when the offer was made" premise is only true because the SEND
    // carries it.
    const h = fakeHooks();
    h.state.createOfferImpl = () => Promise.resolve({ ok: true, offer: { id: 11, usdCents: 250 } });
    const r = rig(h.hooks);
    // No openTrade: the send path reads the model's inputs and the hooks, and
    // the open poll's empty-result callback would clear state mid-test (the
    // accept-body suite's rationale).
    const agreed = {
      itemId: 'worn_sword',
      count: 1,
      instance: { signer: 'Ayla', enchant: 'flame_weapon' },
      craftedRecipeId: 'recipe_worn_sword',
    };
    r.host.tradeInfo = {
      otherPid: 2,
      otherName: 'Borin',
      myOffer: { items: [], copper: 0 },
      theirOffer: { items: [agreed], copper: 0 },
      myAccepted: false,
      theirAccepted: false,
    } as unknown as typeof r.host.tradeInfo;
    const c = r.controller as unknown as {
      wocTradeMode: 'gold' | 'woc';
      wocTradeUsdCents: number | null;
      wocTradePartner: { name: string; walletVerified: boolean } | null;
      wocTradePartnerResolved: boolean;
      wocTradeOffer: WocPendingOffer | null;
      sendWocTradeOffer(otherName: string): Promise<void>;
    };
    c.wocTradeMode = 'woc';
    c.wocTradeUsdCents = 250;
    c.wocTradePartner = { name: 'Borin', walletVerified: true };
    c.wocTradePartnerResolved = true;

    await c.sendWocTradeOffer('Borin');

    expect(h.state.calls.createOffers).toBe(1);
    // The WHOLE body, so a dropped field fails here rather than at the server.
    expect(h.state.lastCreateBody).toEqual({
      characterId: 1,
      sellerCharacterName: 'Borin',
      usdCents: 250,
      itemId: 'worn_sword',
      itemInstance: { signer: 'Ayla', enchant: 'flame_weapon' },
      itemCraftedRecipeId: 'recipe_worn_sword',
      acceptTerms: true,
    });
    expect(h.state.lastCreateBody?.acceptTerms).toBe(true);
    // The ok arm really ran: the returned row is what the window now holds.
    expect(c.wocTradeOffer?.id).toBe(11);
    expect(r.host.logs.at(-1)).toBe(t('hudChrome.trade.woc.offerSent', { name: 'Borin' }));
  });

  it('omits the per-copy fields for a PLAIN staged copy rather than sending nulls', async () => {
    // The two optional legs are spread conditionally: a plain copy carries no
    // instance and no marker, and sending either as an explicit null would
    // fingerprint a copy that does not exist.
    const h = fakeHooks();
    h.state.createOfferImpl = () => Promise.resolve({ ok: true, offer: { id: 12, usdCents: 250 } });
    const r = rig(h.hooks);
    r.host.tradeInfo = {
      otherPid: 2,
      otherName: 'Borin',
      myOffer: { items: [], copper: 0 },
      theirOffer: { items: [{ itemId: 'worn_sword', count: 1 }], copper: 0 },
      myAccepted: false,
      theirAccepted: false,
    } as unknown as typeof r.host.tradeInfo;
    const c = r.controller as unknown as {
      wocTradeMode: 'gold' | 'woc';
      wocTradeUsdCents: number | null;
      wocTradePartner: { name: string; walletVerified: boolean } | null;
      wocTradePartnerResolved: boolean;
      sendWocTradeOffer(otherName: string): Promise<void>;
    };
    c.wocTradeMode = 'woc';
    c.wocTradeUsdCents = 250;
    c.wocTradePartner = { name: 'Borin', walletVerified: true };
    c.wocTradePartnerResolved = true;

    await c.sendWocTradeOffer('Borin');

    expect(h.state.calls.createOffers).toBe(1);
    expect(Object.keys(h.state.lastCreateBody ?? {}).sort()).toEqual([
      'acceptTerms',
      'characterId',
      'itemId',
      'sellerCharacterName',
      'usdCents',
    ]);
  });
});

describe('the accept belt past the review window', () => {
  it('logs NOTHING once the goods are escrowed: an empty table is the correct state', async () => {
    // The retired copy named "stage the item" whenever no staged slot
    // resolved, which past review is a lie: the goods left the bags into
    // escrow, so the table is empty BY DESIGN. The model answers a null hint
    // outside review, and a null hint with a refused accept says nothing.
    const h = fakeHooks();
    const r = rig(h.hooks);
    r.host.tradeInfo = {
      otherPid: 2,
      otherName: 'Borin',
      myOffer: { items: [], copper: 0 },
      theirOffer: { items: [], copper: 0 },
      myAccepted: false,
      theirAccepted: false,
    } as unknown as typeof r.host.tradeInfo;
    const c = r.controller as unknown as {
      wocTradeOffer: WocPendingOffer | null;
      acceptWocTradeOffer(): Promise<void>;
    };
    c.wocTradeOffer = heldOffer({
      role: 'seller',
      phase: 'awaiting_payment',
      listingId: 41,
      buyerAccepted: true,
      sellerAccepted: true,
    });

    await c.acceptWocTradeOffer();

    expect(r.host.logs).toEqual([]);
    expect(h.state.calls.acceptOffers).toEqual([]);

    // The counter-shape, so the silence above is a decision rather than a dead
    // path: the SAME empty table inside the review window still earns the
    // needs-item line, because there the goods really are missing.
    c.wocTradeOffer = heldOffer({ role: 'seller' });
    await c.acceptWocTradeOffer();
    expect(r.host.logs).toEqual([t('hudChrome.trade.woc.hintAcceptNeedsItem')]);
    expect(h.state.calls.acceptOffers).toEqual([]);
  });
});

describe('the close-path recovery (the stale-bag race)', () => {
  it('resolves a deal that settled after the window closed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const h = fakeHooks();
    const r = rig(h.hooks);
    openTrade(r);
    // The deal both sides held when the window shut; this side's poll never
    // saw it settle, which is exactly how a seller ended up with a stale bag.
    (r.controller as unknown as { wocTradeOffer: WocPendingOffer | null }).wocTradeOffer =
      heldOffer({ role: 'seller', phase: 'awaiting_payment', listingId: 41 });
    // Server truth at the off-window re-read: the listing resolved sold.
    h.state.offersResult = {
      ok: true,
      offers: [
        offerRow({
          status: 'accepted',
          buyerAccepted: true,
          sellerAccepted: true,
          listingId: 41,
          listingStatus: 'closed',
          listingResolution: 'sold',
          itemId: 'wolf_fang',
        }),
      ],
    };
    r.host.tradeInfo = null;
    r.controller.updateTradeWindow();
    await flushAsync();
    expect(r.host.logs.some((l) => l.includes(itemDisplayName(ITEMS.wolf_fang)))).toBe(true);
    expect(r.host.balanceRefreshes).toBe(1);
    expect(r.host.closed).toBe(1);
  });
});

describe('withdrawing the standing offer', () => {
  it('clears the held offer and names the action to the service', async () => {
    const h = fakeHooks();
    const r = rig(h.hooks);
    // No openTrade: same poll-race rationale as the accept-body suite above.
    const c = r.controller as unknown as {
      wocTradeOffer: WocPendingOffer | null;
      wocTradeSplit: unknown;
      cancelWocTradeOffer(action: 'decline' | 'withdraw'): Promise<void>;
    };
    c.wocTradeOffer = heldOffer();
    c.wocTradeSplit = { sellerCents: 90, burnCents: 3, treasuryCents: 7 };
    await c.cancelWocTradeOffer('withdraw');
    expect(h.state.calls.resolveOffers).toEqual([[7, 'withdraw']]);
    expect(c.wocTradeOffer).toBeNull();
    // The dead deal's split dies with it, at this clear site like the poll's:
    // a later compose form must not paint its Fee / You receive lines.
    expect(c.wocTradeSplit).toBeNull();
  });
});

describe('the pay verdict ladder matches the Exchange window', () => {
  // Two surfaces describing the same confirm answer must make the same claim:
  // review parks to its own line, only 'confirming' takes the pending mapper,
  // and a decided state (confirmed / delivering) takes the settled line. The
  // dev-chain quote (signatureRequired false) skips the wallet, so the ladder
  // is reachable without a wallet stub.
  async function payTo(confirmAnswer: unknown): Promise<string[]> {
    const h = fakeHooks();
    h.state.buyNowImpl = () => Promise.resolve({ ok: true, settlement: { id: 5 }, quote: null });
    h.state.settlementQuoteImpl = () =>
      Promise.resolve({
        ok: true,
        quote: {
          reference: 'dev_woc_1',
          transactionBase64: 'dHg=',
          signatureRequired: false,
          amount: null,
          seller: null,
          burn: null,
          treasury: null,
          bondCents: null,
          expiresAtMs: 9_999_999_999_999,
        },
      });
    h.state.confirmSettlementImpl = () => Promise.resolve(confirmAnswer);
    const r = rig(h.hooks);
    const c = r.controller as unknown as {
      wocTradeOffer: WocPendingOffer | null;
      payWocTradeOffer(): Promise<void>;
    };
    c.wocTradeOffer = heldOffer({
      role: 'buyer',
      phase: 'awaiting_payment',
      listingId: 41,
      buyerAccepted: true,
      sellerAccepted: true,
    });
    await c.payWocTradeOffer();
    return r.host.logs;
  }

  it('a review park logs the review line, never the generic pending one', async () => {
    const logs = await payTo({ ok: true, state: 'review' });
    expect(logs).toContain(t('hudChrome.wocMarket.settlementReview'));
    expect(logs).not.toContain(t('hudChrome.trade.woc.settled'));
  });

  it('a confirming answer names WHICH pending it is', async () => {
    const logs = await payTo({ ok: true, state: 'confirming', reason: 'not_yet_visible' });
    expect(logs).toContain(t('hudChrome.wocMarket.paymentNotYetVisible'));
    expect(logs).not.toContain(t('hudChrome.trade.woc.settled'));
  });

  it('a DECIDED payment (confirmed, delivery owed) logs the settled line, as the Exchange does', async () => {
    const logs = await payTo({ ok: true, state: 'confirmed' });
    expect(logs).toContain(t('hudChrome.trade.woc.settled'));
    expect(logs).not.toContain(t('hudChrome.wocMarket.paymentPendingGeneric'));
  });
});

describe('the adoption-stored split dies with its deal', () => {
  it('clearing the offer clears the split, so a later compose form cannot render it', async () => {
    const h = fakeHooks();
    h.state.estimateImpl = () =>
      Promise.resolve({
        amount: { tokens: 800 },
        split: { sellerCents: 90, burnCents: 3, treasuryCents: 7 },
      });
    h.state.offersResult = {
      ok: true,
      offers: [offerRow({ buyerAccepted: true, sellerAccepted: false })],
    };
    const r = rig(h.hooks);
    openTrade(r);
    const c = r.controller as unknown as {
      wocTradeSplit: unknown;
      wocTradeOffer: WocPendingOffer | null;
    };
    vi.useFakeTimers();
    r.controller.updateTradeWindow();
    await vi.advanceTimersByTimeAsync(2100);
    r.controller.updateTradeWindow();
    await flushAsync();
    expect(c.wocTradeSplit, 'the adoption stored the split').not.toBeNull();
    // The other side declines: the next poll finds no standing offer.
    h.state.offersResult = { ok: true, offers: [] };
    await vi.advanceTimersByTimeAsync(2100);
    r.controller.updateTradeWindow();
    await flushAsync();
    expect(c.wocTradeOffer, 'the dead deal is gone').toBeNull();
    expect(c.wocTradeSplit, 'and its split with it').toBeNull();
    vi.useRealTimers();
  });
});
