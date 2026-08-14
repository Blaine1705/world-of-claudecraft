// The trade window's $WOC arm: the thin DOM consumer over trade_woc_view.ts.
//
// A COLD painter (src/ui/CLAUDE.md). It repaints only when the trade window
// itself repaints, holds no per-frame path, arms no driver of its own, and
// makes no forced-reflow layout read.
//
// The price field deliberately does NOT ride the window's repaint signature.
// The window rebuilds its whole subtree when that signature changes, so putting
// the typed price in it would destroy and recreate the input on every keystroke
// and fight the caret. Instead the seller's typing updates only the DERIVED
// lines in place (`refreshWocTradeArm`), which is both cheaper and the reason
// no focus-restore dance is needed here at all.
//
// It owns no state and never imports Hud: everything arrives on the injected
// deps bag, which is what lets a test drive it against a plain object. All
// interpolated player text passes through `esc`.

import type { InvSlot, ItemDef } from '../sim/types';
import { esc } from './esc';
import { restoreFirstEnabled } from './focus_restore';
import { formatNumber, t } from './i18n';
import {
  buildWocTradeModel,
  type WocOfferPhase,
  type WocPendingOffer,
  type WocTradeModel,
  type WocTradePartner,
  type WocTradeSplit,
} from './trade_woc_view';

export interface WocTradePanelDeps {
  staged: readonly InvSlot[];
  /** The sim's cleaned own-side offer when a session mirrors one; the accept
   *  arm judges over THIS table (the one the player sees rendered), never the
   *  compose list. Absent means no live mirror. */
  stagedAuthoritative?: readonly InvSlot[];
  theirStaged: readonly InvSlot[];
  goldCopper: number;
  /** The OTHER player's staged gold. Read because the currencies are exclusive
   *  for the trade, not per side: their coin has to close your $WOC arm. */
  partnerGoldCopper: number;
  /** The verified wallet's $WOC balance, or null when unknown. */
  walletTokens: number | null;
  items: Readonly<Record<string, ItemDef>>;
  marketEnabled: boolean;
  selfWalletVerified: boolean;
  partner: WocTradePartner | null;
  partnerResolved: boolean;
  mode: 'gold' | 'woc';
  usdCents: number | null;
  tokens: number | null;
  split: WocTradeSplit | null;
  pendingOffer: WocPendingOffer | null;
  onModeChange(mode: 'gold' | 'woc'): void;
  onPriceInput(usdCents: number | null): void;
  onSendOffer(): void;
  onAcceptOffer(): void;
  onCancelOffer(): void;
  onPayOffer(): void;
}

/** USD cents as a localized money string. Cents in: the caller parses the
 *  field once and owns the number, so nothing economic is derived here. */
/** USD cents as "$1.00". Exported because the HUD's completion message names
 *  the same price, and two spellings of one figure in one trade is a defect. */
export function wocUsdText(cents: number): string {
  return `$${formatNumber(cents / 100, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
const usd = wocUsdText;

/**
 * The standing offer as it reads in the trade window's Money row.
 *
 * "$1.00 USD (~ 7,812.5 $WOC)": the currency the two players agreed in, with
 * the server-quoted token figure beside it. The tilde is doing real work, since
 * the token amount is a preview and the exact number is set by a fresh quote at
 * payment time. Empty string when there is no offer, so the caller can fall
 * back to gold without a branch on null.
 */
export function wocTradeMoneyText(offer: WocPendingOffer | null): string {
  if (offer === null) return '';
  const price = t('hudChrome.trade.woc.moneyUsd', { usd: usd(offer.usdCents) });
  if (offer.tokens === null) return price;
  return `${price} ${t('hudChrome.trade.woc.moneyTokens', {
    tokens: formatNumber(offer.tokens, { maximumFractionDigits: 4 }),
  })}`;
}

/**
 * Which face of the deal a server-side offer row is showing.
 *
 * Derived from the listing rather than the offer's own status, because the
 * offer says only "agreed": what decides whether money is still owed is the
 * LISTING, which exists from acceptance and closes when the sale settles.
 */
export function wocOfferPhase(
  row: {
    listingId: number | null;
    listingStatus: string | null;
    listingResolution: string | null;
    settlementState?: string | null;
  },
  /** The viewer's own payment is in flight locally. The buyer knows this before
   *  any server round trip, and waiting for the poll to catch up is a visible
   *  gap where their click appears to have done nothing. */
  payingLocally = false,
): WocOfferPhase {
  if (row.listingId === null) return 'review';
  if (row.listingResolution === 'sold' || row.listingStatus === 'closed') return 'settled';
  if (payingLocally || SETTLING_STATES.has(row.settlementState ?? '')) return 'paying';
  return 'awaiting_payment';
}

/**
 * Settlement states that mean money is moving.
 *
 * 'offered' is deliberately ABSENT: a quote exists but nothing has been signed,
 * so the buyer still has to act and their button must stay live. Treating it as
 * in-flight would show a spinner to a player whose next move is to press Pay.
 * 'review' is PRESENT: an operator-parked payment is not settled and not lost,
 * and announcing delivery for it would tell the buyer of money under review
 * that the purchase completed (the custody-lie class the row label rule
 * already covers); the poll finishes the deal when the resolution does.
 */
const SETTLING_STATES = new Set(['confirming', 'confirmed', 'delivering', 'review']);

/** Whether a settlement state means the payment is still in flight. Exported so
 *  the HUD does not announce delivery while the chain is still confirming. */
export function wocSettlementInFlight(state: string | null | undefined): boolean {
  return SETTLING_STATES.has(state ?? '');
}

export function wocTradeModelFrom(deps: WocTradePanelDeps): WocTradeModel {
  return buildWocTradeModel({
    marketEnabled: deps.marketEnabled,
    selfWalletVerified: deps.selfWalletVerified,
    partner: deps.partner,
    partnerResolved: deps.partnerResolved,
    staged: deps.staged,
    stagedAuthoritative: deps.stagedAuthoritative,
    theirStaged: deps.theirStaged,
    items: deps.items,
    mode: deps.mode,
    usdCents: deps.usdCents,
    tokens: deps.tokens,
    split: deps.split,
    pendingOffer: deps.pendingOffer,
    goldOffered: deps.goldCopper > 0 || deps.partnerGoldCopper > 0,
    walletTokens: deps.walletTokens,
  });
}

/** The arm's markup, RETURNED rather than written: the trade window composes it
 *  into the single innerHTML it already builds, because a second write would
 *  discard the listeners that window attaches after its own. */
export function wocTradeArmHtml(model: WocTradeModel, usdCents: number | null): string {
  if (!model.armVisible) return '';
  const modeTabs = `
    <div class="trade-woc-modes" role="tablist" aria-label="${esc(t('hudChrome.trade.woc.tabWoc'))}">
      <button type="button" role="tab" class="btn trade-woc-mode${model.mode === 'gold' ? ' active' : ''}" aria-selected="${model.mode === 'gold'}" data-woc-mode="gold"${model.wocDealStanding ? ' disabled' : ''}>${esc(t('hudChrome.trade.woc.tabGold'))}</button>
      <button type="button" role="tab" class="btn trade-woc-mode${model.mode === 'woc' ? ' active' : ''}" aria-selected="${model.mode === 'woc'}" data-woc-mode="woc"${model.wocDisabled ? ' disabled' : ''}>${esc(t('hudChrome.trade.woc.tabWoc'))}</button>
    </div>`;

  if (model.blockKey !== null) {
    // The arm stays present while blocked so the reason has somewhere to live.
    return `<div class="trade-woc-arm">${modeTabs}<p class="trade-woc-block">${esc(t(model.blockKey))}</p></div>`;
  }
  if (model.pendingOffer !== null) {
    const o = model.pendingOffer;
    // Both sides read the SAME price, in the currency they agreed it in, with
    // the token figure as the server quoted it. The seller gets Accept; the
    // buyer gets Withdraw. Neither is offered an action that is not theirs.
    if (o.phase === 'settled') {
      return `<div class="trade-woc-arm">${modeTabs}
        <p class="trade-woc-done">${esc(t('hudChrome.trade.woc.settled'))}</p>
      </div>`;
    }
    if (o.phase === 'awaiting_payment' || o.phase === 'paying') {
      // The goods are already in escrow. Exactly one face here is actionable:
      // the buyer's Pay button, and only while the payment has not started. Every
      // other combination is a WAIT, and each says whose wait it is, because the
      // seller watching a confirmation and the buyer watching their own
      // transaction are not the same sentence.
      //
      // The status line is announced: a state the player cannot see change (a
      // chain confirmation) is exactly the case a screen reader must be told
      // about, and it replaces the only feedback a sighted player gets.
      const body =
        model.canPay && o.role === 'buyer'
          ? `<button type="button" class="btn trade-woc-pay" data-woc-pay>${esc(
              t('hudChrome.trade.woc.payNow', { usd: usd(o.usdCents) }),
            )}</button>`
          : `<p class="trade-woc-waiting" role="status">${
              model.busy ? '<span class="trade-woc-spinner" aria-hidden="true"></span>' : ''
            }${esc(t(model.statusKey ?? 'hudChrome.trade.woc.awaitingPayment'))}</p>`;
      return `<div class="trade-woc-arm">${modeTabs}
        ${body}
        <p class="trade-woc-hint" data-woc-hint role="status"></p>
      </div>`;
    }
    // No Accept button of its own: agreement rides the trade window's existing
    // Accept, on both sides, exactly as a gold trade does. The only action here
    // is the buyer's withdraw, which has no equivalent in the window's chrome.
    const action =
      o.role === 'buyer'
        ? `<button type="button" class="btn trade-woc-cancel" data-woc-cancel>${esc(t('hudChrome.trade.woc.withdraw'))}</button>`
        : '';
    return `<div class="trade-woc-arm">${modeTabs}
      <p class="trade-woc-warn">${esc(t('hudChrome.trade.woc.notInstant'))}</p>
      ${action}
      <p class="trade-woc-hint" data-woc-hint role="status"></p>
    </div>`;
  }
  if (model.mode !== 'woc') return `<div class="trade-woc-arm">${modeTabs}</div>`;

  const priceValue = usdCents === null ? '' : (usdCents / 100).toFixed(2);
  return `<div class="trade-woc-arm">${modeTabs}
    <label class="trade-woc-price-label" for="trade-woc-usd">${esc(t('hudChrome.trade.woc.priceLabel'))}</label>
    <input id="trade-woc-usd" class="coininput trade-woc-price" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(priceValue)}" placeholder="${esc(t('hudChrome.trade.woc.pricePlaceholder'))}" data-focus-key="trade-woc-usd">
    <p class="trade-woc-equiv" data-woc-equiv></p>
    <p class="trade-woc-fee" data-woc-fee></p>
    <p class="trade-woc-net" data-woc-net></p>
    <p class="trade-woc-note" data-woc-ineligible></p>
    <p class="trade-woc-warn">${esc(t('hudChrome.trade.woc.variableWarning'))}</p>
    <p class="trade-woc-warn">${esc(t('hudChrome.trade.woc.notInstant'))}</p>
    <button type="button" class="btn trade-woc-send" data-woc-send>${esc(t('hudChrome.trade.woc.sendOffer'))}</button>
    <p class="trade-woc-hint" data-woc-hint role="status"></p>
  </div>`;
}

/**
 * Update only the derived lines, in place.
 *
 * Called on every price edit and whenever a fresh server estimate lands. It
 * writes text and one disabled flag and touches nothing structural, so the
 * caret in the price field survives. Each write is elided against the value
 * already there, so an unchanged estimate costs no DOM work.
 */
export function refreshWocTradeArm(root: ParentNode, model: WocTradeModel): void {
  const setText = (sel: string, text: string): void => {
    const el = root.querySelector<HTMLElement>(sel);
    if (el && el.textContent !== text) el.textContent = text;
  };
  setText(
    '[data-woc-equiv]',
    model.tokens === null
      ? ''
      : t('hudChrome.trade.woc.equivalent', {
          tokens: formatNumber(model.tokens, { maximumFractionDigits: 4 }),
        }),
  );
  // The figure itself carries the problem, not just the hint below it: the
  // number is what the player is looking at while typing.
  const equiv = root.querySelector<HTMLElement>('[data-woc-equiv]');
  if (equiv && equiv.classList.contains('over-balance') !== model.insufficientBalance) {
    equiv.classList.toggle('over-balance', model.insufficientBalance);
  }
  // Absent split means show nothing, never a client-derived percentage: the
  // real split rounds each fee leg up and gives the seller the remainder.
  setText(
    '[data-woc-fee]',
    model.split === null
      ? ''
      : t('hudChrome.trade.woc.feeLine', {
          fee: usd(model.split.burnCents + model.split.treasuryCents),
        }),
  );
  setText(
    '[data-woc-net]',
    model.split === null
      ? ''
      : t('hudChrome.trade.woc.netLine', { net: usd(model.split.sellerCents) }),
  );
  setText(
    '[data-woc-ineligible]',
    model.ineligible.length === 0
      ? ''
      : t('hudChrome.trade.woc.ineligibleNote', {
          count: formatNumber(model.ineligible.length, { maximumFractionDigits: 0 }),
        }),
  );
  // A disabled affordance always says why: the hint rides beside it and
  // clears the moment the action becomes available. The model picks the
  // accept-side key (nothing sellable staged vs a table holding more than
  // the one agreed copy), so the panel renders it verbatim.
  setText(
    '[data-woc-hint]',
    model.pendingOffer !== null
      ? model.acceptHint === null
        ? ''
        : t(model.acceptHint)
      : model.sendHint === null
        ? ''
        : t(model.sendHint),
  );
  const send = root.querySelector<HTMLButtonElement>('[data-woc-send]');
  if (send && send.disabled !== !model.canSend) send.disabled = !model.canSend;
}

/**
 * Re-focus the arm's own control after the trade window rebuilds.
 *
 * The restore lives HERE rather than in the caller because this module owns the
 * `data-focus-key` it emits, and `data-focus-key` is a namespace shared across
 * every window: the shared helper carries the containment check that stops one
 * window's repaint stealing focus from another (#2528).
 */
export function restoreWocTradeFocus(root: ParentNode, focusKey: string | null): void {
  if (focusKey === null) return;
  restoreFirstEnabled([root.querySelector<HTMLInputElement>(`[data-focus-key="${focusKey}"]`)]);
}

/** Attach the arm's listeners to a freshly painted root. */
export function wireWocTradeArm(root: ParentNode, deps: WocTradePanelDeps): void {
  root.querySelectorAll<HTMLElement>('[data-woc-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      deps.onModeChange(btn.dataset.wocMode === 'woc' ? 'woc' : 'gold');
    });
  });
  const price = root.querySelector<HTMLInputElement>('#trade-woc-usd');
  price?.addEventListener('input', () => {
    const raw = price.value.trim();
    if (raw === '') {
      deps.onPriceInput(null);
      return;
    }
    // Guard the parse rather than trusting the number input: a non-finite value
    // would become NaN cents and travel to the server as a malformed price.
    const dollars = Number(raw);
    deps.onPriceInput(Number.isFinite(dollars) ? Math.round(dollars * 100) : null);
  });
  root
    .querySelector<HTMLElement>('[data-woc-send]')
    ?.addEventListener('click', () => deps.onSendOffer());
  root
    .querySelector<HTMLElement>('[data-woc-accept]')
    ?.addEventListener('click', () => deps.onAcceptOffer());
  root
    .querySelector<HTMLElement>('[data-woc-cancel]')
    ?.addEventListener('click', () => deps.onCancelOffer());
  root
    .querySelector<HTMLElement>('[data-woc-pay]')
    ?.addEventListener('click', () => deps.onPayOffer());
}
