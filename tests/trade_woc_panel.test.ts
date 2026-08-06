// @vitest-environment happy-dom
// The trade window's $WOC arm, at the DOM boundary.
//
// The view core's own tests cover what the arm DECIDES; these cover what it
// renders and rewires, and in particular the one property that is easy to lose
// in a refactor: the derived fee/net lines update IN PLACE, without replacing
// the price input, so a seller's caret survives every estimate that lands while
// they are still typing.

import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvSlot, ItemDef } from '../src/sim/types';
import {
  refreshWocTradeArm,
  type WocTradePanelDeps,
  wireWocTradeArm,
  wocOfferPhase,
  wocTradeArmHtml,
  wocTradeModelFrom,
  wocTradeMoneyText,
} from '../src/ui/trade_woc_panel';

const EPIC: ItemDef = {
  id: 'panel_epic_blade',
  name: 'Panel Blade',
  quality: 'epic',
  slot: 'mainhand',
} as unknown as ItemDef;
const TABLE: Record<string, ItemDef> = { [EPIC.id]: EPIC };
const slot = (id: string): InvSlot => ({ itemId: id, count: 1 });

function deps(over: Partial<WocTradePanelDeps> = {}): WocTradePanelDeps {
  return {
    staged: [],
    theirStaged: [slot(EPIC.id)],
    goldCopper: 0,
    pendingOffer: null,
    items: TABLE,
    marketEnabled: true,
    selfWalletVerified: true,
    partner: { name: 'Aldan', walletVerified: true },
    partnerResolved: true,
    mode: 'woc',
    usdCents: 5000,
    tokens: 1234.5,
    split: { sellerCents: 4500, burnCents: 150, treasuryCents: 350 },
    onModeChange: vi.fn(),
    onPriceInput: vi.fn(),
    onSendOffer: vi.fn(),
    onAcceptOffer: vi.fn(),
    onCancelOffer: vi.fn(),
    onPayOffer: vi.fn(),
    ...over,
  };
}

/** Paint the arm into a detached root, exactly as the trade window does. */
function paint(d: WocTradePanelDeps): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = wocTradeArmHtml(wocTradeModelFrom(d), d.usdCents);
  wireWocTradeArm(root, d);
  refreshWocTradeArm(root, wocTradeModelFrom(d));
  return root;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('what the arm renders', () => {
  it('shows the price field, the equivalent, and both money lines', () => {
    const root = paint(deps());
    expect(root.querySelector('#trade-woc-usd')).toBeTruthy();
    expect(root.querySelector('[data-woc-equiv]')?.textContent).toContain('1,234.5');
    // The fee is the two fee legs together; the net is the seller leg. Both come
    // from the server split, never from a percentage computed here.
    expect(root.querySelector('[data-woc-fee]')?.textContent).toContain('5.00');
    expect(root.querySelector('[data-woc-net]')?.textContent).toContain('45.00');
  });

  it('renders the block reason instead of the form, and keeps the tabs', () => {
    const root = paint(deps({ partner: { name: 'Aldan', walletVerified: false } }));
    expect(root.querySelector('.trade-woc-block')?.textContent).toBeTruthy();
    expect(root.querySelector('#trade-woc-usd'), 'no price field while blocked').toBeNull();
    expect(root.querySelectorAll('[data-woc-mode]')).toHaveLength(2);
  });

  it('renders nothing at all when the realm has no exchange', () => {
    expect(wocTradeArmHtml(wocTradeModelFrom(deps({ marketEnabled: false })), null)).toBe('');
  });

  it('shows no money lines when the server sent no split', () => {
    const root = paint(deps({ split: null, tokens: null }));
    expect(root.querySelector('[data-woc-fee]')?.textContent).toBe('');
    expect(root.querySelector('[data-woc-net]')?.textContent).toBe('');
  });

  it('escapes a hostile counterparty name wherever it is interpolated', () => {
    // The name is server-fed player text, so it must never reach innerHTML raw.
    const root = paint(
      deps({ partner: { name: '<img src=x onerror=alert(1)>', walletVerified: false } }),
    );
    expect(root.querySelector('img')).toBeNull();
  });
});

describe('the derived lines update WITHOUT replacing the price input', () => {
  it('keeps the very same input node across an estimate landing', () => {
    // This is the property that makes typing survivable. If a refresh rebuilt
    // the subtree, the node identity would change and the caret would be gone.
    const d = deps({ tokens: null, split: null });
    const root = paint(d);
    const before = root.querySelector('#trade-woc-usd');
    refreshWocTradeArm(
      root,
      wocTradeModelFrom({
        ...d,
        tokens: 999,
        split: { sellerCents: 4500, burnCents: 150, treasuryCents: 350 },
      }),
    );
    expect(root.querySelector('#trade-woc-usd')).toBe(before);
    expect(root.querySelector('[data-woc-equiv]')?.textContent).toContain('999');
  });

  it('elides a write when the value has not changed', () => {
    const d = deps();
    const root = paint(d);
    const line = root.querySelector('[data-woc-equiv]') as HTMLElement;
    const spy = vi.spyOn(line, 'textContent', 'set');
    refreshWocTradeArm(root, wocTradeModelFrom(d));
    expect(spy, 'an unchanged estimate must cost no DOM write').not.toHaveBeenCalled();
  });

  it('disables send, and the $WOC tab, once gold is on the table', () => {
    // The form stays rendered so the seller can see what they typed; only the
    // action is withheld. Hiding it would make the numbers vanish without
    // explaining why, and gold and $WOC are exclusive rather than one erasing
    // the other.
    const root = paint(deps({ goldCopper: 500 }));
    expect(root.querySelector('#trade-woc-usd'), 'the typed price stays visible').toBeTruthy();
    expect(root.querySelector<HTMLButtonElement>('[data-woc-send]')?.disabled).toBe(true);
    expect(
      root.querySelector<HTMLButtonElement>('[data-woc-mode="woc"]')?.disabled,
      'and the tab cannot be re-entered',
    ).toBe(true);
  });

  it('enables send on a clean, priced, eligible offer', () => {
    const root = paint(deps());
    expect(root.querySelector<HTMLButtonElement>('[data-woc-send]')?.disabled).toBe(false);
  });
});

describe('what the arm reports back', () => {
  it('reports a mode change from either tab', () => {
    const d = deps();
    const root = paint(d);
    root.querySelector<HTMLElement>('[data-woc-mode="gold"]')?.click();
    expect(d.onModeChange).toHaveBeenCalledWith('gold');
  });

  it('reports the typed price in CENTS', () => {
    const d = deps();
    const root = paint(d);
    const input = root.querySelector<HTMLInputElement>('#trade-woc-usd');
    if (!input) throw new Error('no price input');
    input.value = '12.34';
    input.dispatchEvent(new Event('input'));
    expect(d.onPriceInput).toHaveBeenCalledWith(1234);
  });

  it('reports an empty field as no price, never as zero', () => {
    const d = deps();
    const root = paint(d);
    const input = root.querySelector<HTMLInputElement>('#trade-woc-usd');
    if (!input) throw new Error('no price input');
    input.value = '';
    input.dispatchEvent(new Event('input'));
    expect(d.onPriceInput).toHaveBeenCalledWith(null);
  });

  it('reports a non-numeric field as no price rather than NaN cents', () => {
    // A number input can still yield an unparseable value; NaN cents would
    // travel to the server as a malformed price.
    const d = deps();
    const root = paint(d);
    const input = root.querySelector<HTMLInputElement>('#trade-woc-usd');
    if (!input) throw new Error('no price input');
    input.value = 'abc';
    input.dispatchEvent(new Event('input'));
    expect(d.onPriceInput).toHaveBeenCalledWith(null);
  });

  it('reports a send press', () => {
    const d = deps();
    const root = paint(d);
    root.querySelector<HTMLElement>('[data-woc-send]')?.click();
    expect(d.onSendOffer).toHaveBeenCalled();
  });
});

describe('a disabled send button carries its reason in the DOM', () => {
  it('renders the hint beside the button and clears it when sendable', () => {
    // The shipped defect: an empty side gave a dead button and no text at all.
    const blocked = paint(deps({ staged: [slot(EPIC.id)] }));
    expect(blocked.querySelector<HTMLButtonElement>('[data-woc-send]')?.disabled).toBe(true);
    expect(blocked.querySelector('[data-woc-hint]')?.textContent ?? '').not.toBe('');

    const ready = paint(deps());
    expect(ready.querySelector<HTMLButtonElement>('[data-woc-send]')?.disabled).toBe(false);
    expect(ready.querySelector('[data-woc-hint]')?.textContent).toBe('');
  });
});

describe('the trade window actually applies the gold lock', () => {
  // The view core decides goldDisabled, but the coin inputs live in hud.ts's own
  // render string, which no behavioural test drives. That gap shipped the bug
  // this pins: goldDisabled was computed and never used, so entering $WOC mode
  // left the gold fields live. A source pin is weaker than driving the DOM, and
  // it is what the coordinator's shape allows; it catches deletion, which is how
  // the defect actually occurred.
  const HUD = readFileSync('src/ui/hud.ts', 'utf8');

  it('derives the attribute from the model, not a constant', () => {
    expect(HUD).toContain("wocModel.goldDisabled ? ' disabled' : ''");
  });

  it('applies it to ALL THREE coin inputs', () => {
    // One missed field is a full hole: a seller could still type silver.
    for (const coin of ['g', 's', 'c']) {
      expect(HUD, `#trade-${coin} must honour the lock`).toContain(
        `id="trade-${coin}"\${goldAttr}`,
      );
    }
  });
});

describe('a standing offer becomes a REVIEW surface for both sides', () => {
  const offer = {
    id: 7,
    usdCents: 100,
    tokens: 7812.5,
    role: 'buyer' as const,
    phase: 'review' as const,
    listingId: null,
    buyerAccepted: false,
    sellerAccepted: false,
  };

  it('renders the agreed price for the Money row, in the asked-for shape', () => {
    // "$1.00 USD (~ 7,812.5 $WOC)". The tilde is load-bearing: the token figure
    // is a preview, and the exact number is set by a fresh quote at payment.
    const text = wocTradeMoneyText(offer);
    expect(text).toContain('$1.00 USD');
    expect(text).toContain('7,812.5');
    expect(text).toContain('~');
  });

  it('falls back to the USD alone when no quote is available', () => {
    const text = wocTradeMoneyText({ ...offer, tokens: null });
    expect(text).toContain('$1.00 USD');
    expect(text).not.toContain('~');
  });

  it('renders nothing for the Money row when no offer stands', () => {
    expect(wocTradeMoneyText(null)).toBe('');
  });

  it('replaces the price form: you cannot stack a second offer on the first', () => {
    const root = paint(deps({ pendingOffer: offer }));
    expect(root.querySelector('#trade-woc-usd')).toBeNull();
    expect(root.querySelector('[data-woc-send]')).toBeNull();
  });

  it('gives the BUYER withdraw and no accept', () => {
    const root = paint(deps({ pendingOffer: offer }));
    expect(root.querySelector('[data-woc-cancel]')).toBeTruthy();
    expect(
      root.querySelector('[data-woc-accept]'),
      'a buyer must not accept their own offer',
    ).toBeNull();
  });

  it("adds NO accept button of its own: the window's Accept does the agreeing", () => {
    // A second accept control beside the trade window's own would be two ways to
    // say the same thing, and only one of them would drive the sim's state.
    for (const role of ['buyer', 'seller'] as const) {
      const root = paint(deps({ pendingOffer: { ...offer, role }, staged: [slot(EPIC.id)] }));
      expect(root.querySelector('[data-woc-accept]'), role).toBeNull();
    }
  });

  it('still tells the seller when they have nothing staged to accept with', () => {
    const root = paint(deps({ pendingOffer: { ...offer, role: 'seller' }, staged: [] }));
    expect(root.querySelector('[data-woc-hint]')?.textContent ?? '').not.toBe('');
  });

  it('reports a withdraw press', () => {
    const buyer = deps({ pendingOffer: offer });
    paint(buyer).querySelector<HTMLElement>('[data-woc-cancel]')?.click();
    expect(buyer.onCancelOffer).toHaveBeenCalled();
  });
});

describe('the payment phase, in the window rather than elsewhere', () => {
  const paying = {
    id: 7,
    usdCents: 100,
    tokens: 7812.5,
    role: 'buyer' as const,
    phase: 'awaiting_payment' as const,
    listingId: 41,
    buyerAccepted: true,
    sellerAccepted: true,
  };

  it('derives the phase from the LISTING, not the offer status', () => {
    // The offer says only "agreed"; what decides whether money is still owed is
    // the listing, which exists from acceptance and closes when the sale settles.
    expect(wocOfferPhase({ listingId: null, listingStatus: null, listingResolution: null })).toBe(
      'review',
    );
    expect(wocOfferPhase({ listingId: 41, listingStatus: 'active', listingResolution: null })).toBe(
      'awaiting_payment',
    );
    expect(
      wocOfferPhase({ listingId: 41, listingStatus: 'closed', listingResolution: 'sold' }),
    ).toBe('settled');
  });

  it('gives the BUYER a pay button naming the agreed price', () => {
    const root = paint(deps({ pendingOffer: paying }));
    const btn = root.querySelector('[data-woc-pay]');
    expect(btn?.textContent).toContain('1.00');
  });

  it('gives the SELLER a waiting state and NO control', () => {
    // They can do nothing at this point, so offering a button would be a lie.
    const root = paint(deps({ pendingOffer: { ...paying, role: 'seller' } }));
    expect(root.querySelector('.trade-woc-waiting')?.textContent ?? '').not.toBe('');
    expect(root.querySelector('[data-woc-pay]')).toBeNull();
    expect(
      root.querySelector('[data-woc-cancel]'),
      'escrow is done; no withdrawing now',
    ).toBeNull();
  });

  it('shows both sides the settled state once paid', () => {
    for (const role of ['buyer', 'seller'] as const) {
      const root = paint(deps({ pendingOffer: { ...paying, role, phase: 'settled' } }));
      expect(root.querySelector('.trade-woc-done')?.textContent ?? '', role).not.toBe('');
      expect(root.querySelector('[data-woc-pay]'), role).toBeNull();
    }
  });

  it('reports a pay press', () => {
    const d = deps({ pendingOffer: paying });
    paint(d).querySelector<HTMLElement>('[data-woc-pay]')?.click();
    expect(d.onPayOffer).toHaveBeenCalled();
  });

  it('never offers pay to the seller, nor before escrow', () => {
    // Paying before the goods are escrowed would take money for an item still
    // sitting in someone's bags.
    expect(wocTradeModelFrom(deps({ pendingOffer: { ...paying, role: 'seller' } })).canPay).toBe(
      false,
    );
    expect(
      wocTradeModelFrom(deps({ pendingOffer: { ...paying, phase: 'review', listingId: null } }))
        .canPay,
    ).toBe(false);
    // The case the listingId check alone does NOT catch: a settled offer still
    // carries its listing id, so without the phase test it would stay payable
    // and a second click would buy the same item twice.
    expect(wocTradeModelFrom(deps({ pendingOffer: { ...paying, phase: 'settled' } })).canPay).toBe(
      false,
    );
    expect(wocTradeModelFrom(deps({ pendingOffer: paying })).canPay).toBe(true);
  });
});

describe('the window follows a $WOC deal THROUGH acceptance', () => {
  // The two defects this pins, which compounded into a dead end in real play:
  // the client dropped any offer that was no longer 'pending', and a successful
  // acceptance closed the window. Between them the payment phase was
  // unreachable and both sides were left holding a stale offer id to press.
  const HUD = readFileSync('src/ui/hud.ts', 'utf8');

  it('polls accepted offers, not only pending ones', () => {
    expect(HUD).toContain("o.status === 'pending' || o.status === 'accepted'");
  });

  it('does not cancel the trade when an acceptance succeeds', () => {
    // The acceptance handler must leave the window open; only the buyer's own
    // withdraw and the sim's own cancel may close it.
    const accept = HUD.slice(
      HUD.indexOf('private async acceptWocTradeOffer'),
      HUD.indexOf('private async cancelWocTradeOffer'),
    );
    expect(accept).not.toContain('tradeCancel');
    expect(accept, 'it should advance the phase instead').toContain("phase: 'awaiting_payment'");
  });

  it('drives the Accept button from the OFFER, not the sim trade', () => {
    // A $WOC deal never confirms the sim trade, so info.myAccepted never moves:
    // reading it left the button saying "Accept" after the player had accepted.
    expect(HUD).toContain('wocModel.pendingOffer.buyerAccepted');
    expect(HUD).toContain('wocModel.pendingOffer.sellerAccepted');
  });
});

describe('the wallet is skipped only on explicit server permission', () => {
  const HUD = readFileSync('src/ui/hud.ts', 'utf8');

  it('requires an explicit false, so an absent flag still signs', () => {
    // Fail-safe direction: a service that omits the field is not saying "no
    // signature needed". A truthiness check here would skip signing whenever
    // the field were missing, which is the one mistake that must not happen.
    expect(HUD).toContain('quoted.quote.signatureRequired === false');
    expect(HUD).not.toContain('!quoted.quote.signatureRequired');
  });

  it('hides the coin inputs when a $WOC amount takes the Money row', () => {
    // Gold and $WOC are mutually exclusive, so the fields are removed rather
    // than left greyed beside an amount in another currency.
    expect(HUD).toContain('class="trade-coins"${wocMoneyMine');
  });
});
