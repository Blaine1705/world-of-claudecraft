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
  wocTradeArmHtml,
  wocTradeModelFrom,
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
  const offer = { id: 7, usdCents: 100, tokens: 7812.5, role: 'buyer' as const };

  it('shows the agreed price, and the token figure the server quoted', () => {
    // Both sides read the same numbers: the USD they agreed, and the tokens as
    // quoted once, so neither player sees a different figure from the other.
    const root = paint(deps({ pendingOffer: offer }));
    const text = root.querySelector('.trade-woc-offer')?.textContent ?? '';
    expect(text).toContain('1.00');
    expect(text).toContain('7,812.5');
  });

  it('replaces the price form: you cannot stack a second offer on the first', () => {
    const root = paint(deps({ pendingOffer: offer }));
    expect(root.querySelector('#trade-woc-usd')).toBeNull();
    expect(root.querySelector('[data-woc-send]')).toBeNull();
  });

  it('gives the BUYER withdraw and no accept', () => {
    const root = paint(deps({ pendingOffer: offer }));
    expect(root.querySelector('[data-woc-cancel]')).toBeTruthy();
    expect(root.querySelector('[data-woc-accept]'), 'a buyer must not accept their own offer').toBeNull();
  });

  it('gives the SELLER accept and no withdraw', () => {
    const root = paint(
      deps({ pendingOffer: { ...offer, role: 'seller' }, staged: [slot(EPIC.id)] }),
    );
    expect(root.querySelector<HTMLButtonElement>('[data-woc-accept]')?.disabled).toBe(false);
    expect(root.querySelector('[data-woc-cancel]')).toBeNull();
  });

  it("disables the seller's accept until they stage something eligible, and says why", () => {
    // Acceptance is what escrows the goods, so there must be goods.
    const root = paint(deps({ pendingOffer: { ...offer, role: 'seller' }, staged: [] }));
    expect(root.querySelector<HTMLButtonElement>('[data-woc-accept]')?.disabled).toBe(true);
    expect(root.querySelector('[data-woc-hint]')?.textContent ?? '').not.toBe('');
  });

  it('reports accept and withdraw presses', () => {
    const seller = deps({ pendingOffer: { ...offer, role: 'seller' }, staged: [slot(EPIC.id)] });
    paint(seller).querySelector<HTMLElement>('[data-woc-accept]')?.click();
    expect(seller.onAcceptOffer).toHaveBeenCalled();

    const buyer = deps({ pendingOffer: offer });
    paint(buyer).querySelector<HTMLElement>('[data-woc-cancel]')?.click();
    expect(buyer.onCancelOffer).toHaveBeenCalled();
  });

  it('omits the token figure rather than guessing when the quote is unavailable', () => {
    const root = paint(deps({ pendingOffer: { ...offer, tokens: null } }));
    const text = root.querySelector('.trade-woc-offer')?.textContent ?? '';
    expect(text).toContain('1.00');
    expect(text).not.toContain('(');
  });
});
