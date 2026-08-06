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
  type WocTradeModel,
  type WocTradePartner,
  type WocTradeSplit,
} from './trade_woc_view';

export interface WocTradePanelDeps {
  staged: readonly InvSlot[];
  goldCopper: number;
  items: Readonly<Record<string, ItemDef>>;
  marketEnabled: boolean;
  selfWalletVerified: boolean;
  partner: WocTradePartner | null;
  partnerResolved: boolean;
  mode: 'gold' | 'woc';
  usdCents: number | null;
  tokens: number | null;
  split: WocTradeSplit | null;
  onModeChange(mode: 'gold' | 'woc'): void;
  onPriceInput(usdCents: number | null): void;
  onSendOffer(): void;
}

/** USD cents as a localized money string. Cents in: the caller parses the
 *  field once and owns the number, so nothing economic is derived here. */
function usd(cents: number): string {
  return `$${formatNumber(cents / 100, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function wocTradeModelFrom(deps: WocTradePanelDeps): WocTradeModel {
  return buildWocTradeModel({
    marketEnabled: deps.marketEnabled,
    selfWalletVerified: deps.selfWalletVerified,
    partner: deps.partner,
    partnerResolved: deps.partnerResolved,
    staged: deps.staged,
    items: deps.items,
    mode: deps.mode,
    usdCents: deps.usdCents,
    tokens: deps.tokens,
    split: deps.split,
    goldOffered: deps.goldCopper > 0,
  });
}

/** The arm's markup, RETURNED rather than written: the trade window composes it
 *  into the single innerHTML it already builds, because a second write would
 *  discard the listeners that window attaches after its own. */
export function wocTradeArmHtml(model: WocTradeModel, usdCents: number | null): string {
  if (!model.armVisible) return '';
  const modeTabs = `
    <div class="trade-woc-modes" role="tablist" aria-label="${esc(t('hudChrome.trade.woc.tabWoc'))}">
      <button type="button" role="tab" class="btn trade-woc-mode${model.mode === 'gold' ? ' active' : ''}" aria-selected="${model.mode === 'gold'}" data-woc-mode="gold">${esc(t('hudChrome.trade.woc.tabGold'))}</button>
      <button type="button" role="tab" class="btn trade-woc-mode${model.mode === 'woc' ? ' active' : ''}" aria-selected="${model.mode === 'woc'}" data-woc-mode="woc"${model.wocDisabled ? ' disabled' : ''}>${esc(t('hudChrome.trade.woc.tabWoc'))}</button>
    </div>`;

  if (model.blockKey !== null) {
    // The arm stays present while blocked so the reason has somewhere to live.
    return `<div class="trade-woc-arm">${modeTabs}<p class="trade-woc-block">${esc(t(model.blockKey))}</p></div>`;
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
    <p class="trade-woc-hint" data-woc-hint></p>
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
  // A disabled button always says why: the hint rides beside it and clears the
  // moment the offer becomes sendable.
  setText('[data-woc-hint]', model.sendHint === null ? '' : t(model.sendHint));
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
}
