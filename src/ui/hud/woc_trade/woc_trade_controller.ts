// The trade window and its $WOC arm, extracted off the Hud coordinator as the
// woc_trade domain (docs/prd/woc/p2p-woc-trade.md). One class owns the window's
// repaint (a signature-gated wholesale rebuild, the market_window idiom) AND the
// p2p offer state machine behind it: the slow REST poll that adopts the standing
// offer, acceptance, escrow, payment through the wallet bridge, and the
// exactly-once completion report. Pure decisions live in woc_trade_offer_view.ts
// (this module keeps the effects); the arm's model/markup helpers stay in
// src/ui/trade_woc_panel.ts and src/ui/trade_woc_view.ts.
//
// Per src/ui/hud/CLAUDE.md this module never imports Hud: every host capability
// (the IWorld, the staged gold offer Hud shares with the bags window, log lines,
// tooltips) arrives through WocTradeControllerDeps. It reads browser state
// (Date.now, setTimeout, document) and is registered in UI_DOM_MODULES; as a
// *_controller.ts it holds the painter gate's cold contract (no forced-reflow
// read, no repeating driver: the estimate debounce is a one-shot timeout).

import { ITEMS } from '../../../sim/data';
import type { InvSlot, ItemDef, ItemInstancePayload } from '../../../sim/types';
import type { IWorld } from '../../../world_api';
import { userFacingApiError } from '../../api_error_i18n';
import { itemDisplayName } from '../../entity_i18n';
import { esc } from '../../esc';
import { captureFocusKey } from '../../focus_restore';
import { formatDateTime, formatMoney as formatLocalizedMoney, t } from '../../i18n';
import type { TranslationKey } from '../../i18n.catalog';
import { knownItemDef } from '../../known_item';
import { buildTradeItemRow, tradeRowTooltipTarget } from '../../trade_view';
import {
  refreshWocTradeArm,
  restoreWocTradeFocus,
  type WocTradePanelDeps,
  wireWocTradeArm,
  wocTradeArmHtml,
  wocTradeModelFrom,
  wocTradeMoneyText,
  wocUsdText,
} from '../../trade_woc_panel';
import {
  inventoryIndexOfStaged,
  type WocPendingOffer,
  type WocTradePartner,
  type WocTradeSplit,
  wocTradableSlot,
} from '../../trade_woc_view';
import { svgIcon } from '../../ui_icons';
import { unknownItemIconHtml } from '../../unknown_item_icon';
import { verifiedWocBalance } from '../../wallet_balance';
import { walletBridgeErrorText } from '../../wallet_bridge_reason_text';
import { wocPaymentPendingText } from '../../woc_market_reason_text';
import type { WocMarketHooks } from '../../woc_market_window';
import {
  adoptedWocOffer,
  selectStandingWocOffer,
  type WocOfferClosedReason,
  wocOfferClosedReason,
  wocOfferPhase,
  wocOfferPollStep,
} from './woc_trade_offer_view';

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => document.querySelector(sel) as T;

/** How often the trade window re-reads the standing $WOC offer. Slow on
 *  purpose: it is a REST read on a short-lived surface, and two seconds of lag
 *  is invisible while two players are talking. */
const WOC_TRADE_OFFER_POLL_MS = 2000;

/** The honest line for each way a deal can die without a sale. */
const WOC_TRADE_CLOSED_KEYS: Record<WocOfferClosedReason, TranslationKey> = {
  cancelled: 'hudChrome.trade.woc.closedCancelled',
  suspended: 'hudChrome.trade.woc.closedSuspended',
  unpaid: 'hudChrome.trade.woc.closedUnpaid',
};

/** The host capabilities the controller borrows from Hud, per the domain
 *  contract (narrow closures, never the Hud class). */
export interface WocTradeControllerDeps {
  /** The IWorld the trade window reads and acts through. */
  world(): IWorld;
  /** The $WOC market hooks once main.ts attaches them; null offline/desktop. */
  marketHooks(): WocMarketHooks | null;
  /** The gold trade's locally staged offer. Owned by Hud because the bags
   *  window stages into it too; the controller resets it on open/close.
   *  MUST return the LIVE object, never a copy: the controller mutates it in
   *  place (item unstage decrements/splices, the coin-input copper write). */
  staged(): { items: InvSlot[]; copper: number };
  setStaged(next: { items: InvSlot[]; copper: number }): void;
  /** Push the staged offer to the server (Hud owns the gold-trade send). */
  pushTradeOffer(): void;
  /** Re-read the wallet footer balance after tokens moved on-chain. */
  refreshWocBalance(): void;
  log(text: string, color?: string): void;
  itemIcon(item: ItemDef): string;
  attachTooltip(el: HTMLElement, html: () => string): void;
  itemTooltip(item: ItemDef, compare?: boolean, instance?: ItemInstancePayload): string;
  renderBags(): void;
}

export class WocTradeController {
  // The arm's state (docs/prd/woc/p2p-woc-trade.md). Held on the controller
  // because the window rebuilds its subtree wholesale, so the seller's mode and
  // typed price must outlive a repaint. usdCents deliberately does NOT enter
  // lastTradeSig: a rebuild per keystroke would destroy the input under the
  // caret, so price edits refresh only the derived lines in place.
  private wocTradeMode: 'gold' | 'woc' = 'gold';
  private wocTradeUsdCents: number | null = null;
  private wocTradeTokens: number | null = null;
  private wocTradeSplit: WocTradeSplit | null = null;
  /** The Exchange's minimum listing price, fetched once from /status for the
   *  courtesy below-min hint. Null until it answers; null never blocks. */
  private wocTradeMinPriceCents: number | null = null;
  /** Durable Marketplace-terms acceptance (from /me, or observed on a send
   *  that carried real consent). Gates the consent row's visibility (R9). */
  private wocTradeTermsAccepted = false;
  /** The consent checkbox's state, controller-held so it survives the
   *  window's wholesale rebuilds (the Exchange window's acceptTerms idiom).
   *  Reset per trade: consent is per commitment until durably recorded. */
  private wocTradeTermsChecked = false;
  /** The buy-now settlement this deal already claimed, so backing out of the
   *  quote review and pressing Pay again re-quotes THAT settlement instead
   *  of re-claiming a lock the buyer already holds (buy_now_locked). */
  private wocTradeSettlementId: number | null = null;
  /** The staged settlement quote awaiting the buyer's explicit Sign and pay.
   *  Its presence renders the review panel; spent or abandoned, it clears. */
  private wocTradeQuote: {
    totalTokens: number | null;
    usdCents: number;
    expiresAtMs: number | null;
    reference: string | null;
    transactionBase64: string | null;
    signatureRequired?: boolean;
  } | null = null;
  private wocTradePartner: WocTradePartner | null = null;
  /** Whether the lookup has ANSWERED, which null alone cannot express. */
  private wocTradePartnerResolved = false;
  /** The name the partner lookup was issued for, so it runs once per trade. */
  private wocTradePartnerFor = '';
  private wocTradeEstimateTimer: number | null = null;
  /** Guards a late estimate from overwriting a newer one (last write wins). */
  private wocTradeEstimateSeq = 0;
  /** The offer standing between these two players, polled while the window is
   *  open so BOTH sides see the same one without a push channel. */
  private wocTradeOffer: WocPendingOffer | null = null;
  private wocTradeOfferPolledAtMs = 0;
  /** Re-entry guard: a second click mid-signature would take two lock+quote
   *  round trips for one purchase. */
  private wocTradePaying = false;
  /** The seller's acceptance is in flight (the step-up challenge mint plus the
   *  wallet round trip). Guards re-entrancy the same way wocTradePaying does
   *  for the pay path, and drives the disabled/waiting face on the Accept
   *  button so a multi-second wallet handoff cannot read as a dead click or
   *  mint a second challenge. */
  private wocTradeAccepting = false;
  /**
   * Offer ids whose outcome this client has already shown.
   *
   * A settled offer stays readable server-side for a grace window, so both
   * players can observe the sale complete. Once THIS client has said so and
   * closed the window, re-adopting the row would reopen it and, worse, block the
   * pair from starting a fresh deal until the window elapsed.
   */
  private readonly wocTradeFinished = new Set<number>();
  private tradeWasOpen = false;
  private lastTradeSig = '';

  constructor(private readonly deps: WocTradeControllerDeps) {}

  // Host shims: the moved bodies below read these under their hud.ts names, so
  // the extraction stays a move (behavior and text identical), not a rewrite.
  private get sim(): IWorld {
    return this.deps.world();
  }
  private get wocMarketHooks(): WocMarketHooks | null {
    return this.deps.marketHooks();
  }
  private get stagedTrade(): { items: InvSlot[]; copper: number } {
    return this.deps.staged();
  }
  private set stagedTrade(next: { items: InvSlot[]; copper: number }) {
    this.deps.setStaged(next);
  }
  private log(text: string, color?: string): void {
    this.deps.log(text, color);
  }
  private itemIcon(item: ItemDef): string {
    return this.deps.itemIcon(item);
  }
  private attachTooltip(el: HTMLElement, html: () => string): void {
    this.deps.attachTooltip(el, html);
  }
  private itemTooltip(item: ItemDef, compare = true, instance?: ItemInstancePayload): string {
    return this.deps.itemTooltip(item, compare, instance);
  }
  private renderBags(): void {
    this.deps.renderBags();
  }
  private pushTradeOffer(): void {
    this.deps.pushTradeOffer();
  }

  /** The arm's deps for the CURRENT trade. Rebuilt per paint; holds no state. */
  private wocTradeDeps(otherName: string): WocTradePanelDeps {
    return {
      staged: this.stagedTrade.items,
      // The accept arm's table: the same authoritative-first read the accept
      // belt and the rendered offer table use, so the hint, the belt, and
      // what the player sees can never disagree about the table's shape.
      stagedAuthoritative: this.sim.tradeInfo?.myOffer.items ?? this.stagedTrade.items,
      theirStaged: this.sim.tradeInfo?.theirOffer.items ?? [],
      goldCopper: this.stagedTrade.copper,
      // Server truth for the other side, not a local echo: their coin closes
      // this side's $WOC arm, so it has to come from the shared trade state.
      partnerGoldCopper: this.sim.tradeInfo?.theirOffer.copper ?? 0,
      // The VERIFIED balance, not the merely-connected one: this gates an offer
      // the account-linked wallet has to honour, and an unverified figure
      // belongs to a wallet that will not be paying.
      walletTokens: verifiedWocBalance(),
      items: ITEMS,
      marketEnabled: this.wocMarketHooks !== null,
      selfWalletVerified: this.wocMarketHooks?.walletLinked() === true,
      partner: this.wocTradePartner,
      partnerResolved: this.wocTradePartnerResolved,
      mode: this.wocTradeMode,
      usdCents: this.wocTradeUsdCents,
      tokens: this.wocTradeTokens,
      split: this.wocTradeSplit,
      minPriceCents: this.wocTradeMinPriceCents,
      termsAccepted: this.wocTradeTermsAccepted,
      termsChecked: this.wocTradeTermsChecked,
      quote: this.wocTradeQuote,
      // The claim round trips (buyNow + quote) in flight: the Pay button
      // must stop looking pressable the moment it is pressed, not when the
      // quote lands two RTTs later.
      paying: this.wocTradePaying,
      // Paint-time clock for the staged quote's expiry face. Deliberately
      // NOT in the repaint signature: the face goes disabled on the next
      // repaint after lapse, and the sign handler re-checks at the click,
      // which is the load-bearing guard.
      nowMs: Date.now(),
      onModeChange: (mode) => {
        this.wocTradeMode = mode;
        this.lastTradeSig = '';
      },
      onPriceInput: (cents) => this.onWocTradePrice(cents),
      onSendOffer: () => void this.sendWocTradeOffer(otherName),
      onCancelOffer: () => void this.cancelWocTradeOffer('withdraw'),
      onDeclineOffer: () => void this.cancelWocTradeOffer('decline'),
      onCancelSale: () => void this.cancelWocDirectedSale(),
      onPayOffer: () => void this.payWocTradeOffer(),
      onTermsChange: (checked) => {
        // No repaint owed: the DOM checkbox already shows the new state, and
        // rebuilding here would eat the click's focus (the Exchange idiom).
        this.wocTradeTermsChecked = checked;
      },
      onSignQuote: () => void this.signWocTradeQuote(),
      onQuoteCancel: () => {
        // Backing out spends nothing: the settlement stays offered with its
        // own deadline, and Pay re-quotes it.
        this.wocTradeQuote = null;
        this.lastTradeSig = '';
      },
      pendingOffer: this.wocTradeOffer,
    };
  }

  /**
   * The standing offer between these two, refreshed on a slow poll.
   *
   * A poll rather than a push because the offer lives on the REST rail, not the
   * world socket, and the trade window is a short-lived surface where a two
   * second lag is invisible. Throttled by wall clock rather than by frame, so
   * the cost does not scale with framerate. Which row is adopted and whether a
   * repaint is owed are the pure decisions in woc_trade_offer_view.ts.
   */
  private pollWocTradeOffer(otherName: string, nowMs: number): void {
    const hooks = this.wocMarketHooks;
    if (!hooks || nowMs - this.wocTradeOfferPolledAtMs < WOC_TRADE_OFFER_POLL_MS) return;
    this.wocTradeOfferPolledAtMs = nowMs;
    void hooks.client.offers().then(async (res) => {
      if (!res.ok || this.sim.tradeInfo?.otherName !== otherName) return;
      const mine = selectStandingWocOffer(res.offers, otherName, this.wocTradeFinished);
      if (!mine) {
        if (this.wocTradeOffer !== null) {
          // The held deal is no longer standing. Before clearing it, say WHY
          // when the lingering row can tell us (the other side resolved it,
          // or the TTL lapsed): a silently emptied arm reads as a glitch,
          // and the resolving side already got its own feedback.
          const gone = res.offers.find((o) => o.id === this.wocTradeOffer?.id);
          this.reportResolvedWocOffer(this.wocTradeOffer.id, gone?.status);
          this.wocTradeOffer = null;
          this.wocTradeQuote = null;
          this.wocTradeSettlementId = null;
          // The adoption-stored split dies with the deal it described, or a
          // later compose form paints the dead deal's Fee / You receive lines.
          this.wocTradeSplit = null;
          this.lastTradeSig = '';
        }
        return;
      }
      const phase = wocOfferPhase(mine, this.wocTradePaying && mine.role === 'buyer');
      const step = wocOfferPollStep(this.wocTradeOffer, mine, phase);
      // The deal is DONE. Say so, in this side's own words, and get out of the
      // way: the window has nothing left to offer and leaving it open reads as
      // an unfinished trade. Reported exactly once per offer.
      if (step.kind === 'settle') {
        this.finishWocTrade(mine);
        return;
      }
      // The deal DIED without a sale (cancelled / suspended / unpaid): report
      // the honest reason once and return the arm to the compose form. The
      // old code fell into the settled arm here and told the seller they had
      // been paid (H13's false payment line).
      if (step.kind === 'closed') {
        this.finishClosedWocTrade(mine);
        return;
      }
      if (step.kind === 'keep') {
        return;
      }
      // Quote the agreed price once, so both sides show the same token figure.
      const est = await hooks.client.estimate(mine.usdCents);
      if (this.sim.tradeInfo?.otherName !== otherName) return;
      this.wocTradeOffer = adoptedWocOffer(mine, phase, est?.amount?.tokens ?? null);
      // The split rides the same estimate: without this an ADOPTED offer (the
      // window reopened mid-deal) showed tokens but blank Fee and You receive
      // lines, because only the typing-time estimate ever stored one.
      this.wocTradeSplit = est?.split ?? null;
      this.lastTradeSig = '';
    });
  }

  /**
   * The completion moment, for whichever side is looking.
   *
   * Both players get a line naming the price and the item, because "it is gone"
   * and "it sold for this" are different pieces of news and only the second one
   * closes the loop. The buyer's balance is re-read rather than assumed: the
   * tokens left their wallet on-chain, and the bag footer would otherwise keep
   * showing the pre-purchase figure until something else happened to refresh it.
   */
  private finishWocTrade(row: {
    id: number;
    usdCents: number;
    role: 'buyer' | 'seller';
    itemId: string | null;
  }): void {
    if (this.wocTradeFinished.has(row.id)) return;
    this.wocTradeFinished.add(row.id);
    // knownItemDef, not a bare index: a stale client can be handed an id this
    // bundle predates, and a prototype-key id must take the unknown arm (R34).
    const item = row.itemId === null ? undefined : knownItemDef(ITEMS, row.itemId);
    this.log(
      t(
        row.role === 'seller' ? 'hudChrome.trade.woc.paidSeller' : 'hudChrome.trade.woc.paidBuyer',
        {
          price: wocUsdText(row.usdCents),
          // The raw id is a last resort, not a blank: a message naming no item at
          // all is worse than one naming an id the player can at least search.
          item: item ? itemDisplayName(item) : (row.itemId ?? ''),
        },
      ),
      '#7fdc4f',
    );
    // Both sides: the seller was paid and the buyer spent, so neither footer is
    // still correct.
    this.deps.refreshWocBalance();
    this.wocTradeOffer = null;
    this.wocTradeSplit = null;
    this.wocTradeQuote = null;
    this.wocTradeSettlementId = null;
    this.lastTradeSig = '';
    // Closing the trade itself is the sim's call, not a display change: the
    // other player's client must learn the trade is over too. CLOSE, not
    // cancel: the sale succeeded, and telling both players it was cancelled
    // contradicts the payment line printed a moment earlier.
    this.sim.tradeClose();
  }

  /**
   * The honest end of a deal that DIED: cancelled, suspended, or unpaid.
   *
   * Reported exactly once per offer, like the settled line, and through the
   * same ledger (wocTradeFinished), so a closed deal can never later be
   * re-adopted or re-reported. The trade session deliberately STAYS OPEN:
   * unlike a sale (goods moved, nothing left to do here), a dead deal leaves
   * two players at a live trade window who may well want to strike a new
   * one, and the arm returns to the compose form under them. The escrowed
   * copy is on its way back to the seller by mail (the return flight), which
   * is exactly what each line says.
   */
  private finishClosedWocTrade(row: {
    id: number;
    listingStatus: string | null;
    listingResolution: string | null;
  }): void {
    if (this.wocTradeFinished.has(row.id)) return;
    this.wocTradeFinished.add(row.id);
    const reason = wocOfferClosedReason(row) ?? 'unpaid';
    this.log(t(WOC_TRADE_CLOSED_KEYS[reason]), '#ff6b6b');
    this.wocTradeOffer = null;
    this.wocTradeSplit = null;
    this.wocTradeQuote = null;
    this.wocTradeSettlementId = null;
    this.lastTradeSig = '';
  }

  /**
   * The honest end of an offer the OTHER side resolved (or the TTL lapsed):
   * the poll found the held row no longer standing. The resolving side got
   * its own feedback at the click; this line is for the side that would
   * otherwise watch the deal silently vanish. Nothing to say for an unknown
   * or missing status (the grace window elapsed): the arm just returns to
   * the form.
   */
  private reportResolvedWocOffer(offerId: number, status: string | undefined): void {
    if (this.wocTradeFinished.has(offerId)) return;
    const key =
      status === 'declined'
        ? 'hudChrome.trade.woc.offerDeclined'
        : status === 'withdrawn'
          ? 'hudChrome.trade.woc.offerWithdrawn'
          : status === 'expired'
            ? 'hudChrome.trade.woc.offerExpired'
            : null;
    if (key === null) return;
    this.wocTradeFinished.add(offerId);
    this.log(t(key), '#ffd100');
  }

  /**
   * Resolve a deal whose window closed before this side saw it finish.
   *
   * Only one player's client has to reach `settled` to end the session, and
   * ending it stops the other's polling mid-flight, because the poll runs only
   * while a trade is open. That raced: whichever side noticed second got no
   * payment line and no balance refresh, which is exactly how a seller ended up
   * with a stale bag. The outcome is therefore resolved once more here, off the
   * window entirely. The server keeps the row readable for a grace window
   * precisely so this lookup can still find it.
   */
  private resolveClosedWocTrade(): void {
    const hooks = this.wocMarketHooks;
    const offer = this.wocTradeOffer;
    this.wocTradeOffer = null;
    this.wocTradeSplit = null;
    this.wocTradeQuote = null;
    this.wocTradeSettlementId = null;
    if (!hooks || !offer || this.wocTradeFinished.has(offer.id)) return;
    void hooks.client.offers().then((res) => {
      if (!res.ok) return;
      const row = res.offers.find((o) => o.id === offer.id);
      if (!row) return;
      const phase = wocOfferPhase(row);
      if (phase === 'settled') {
        this.finishWocTrade(row);
        return;
      }
      if (phase === 'closed') {
        this.finishClosedWocTrade(row);
        return;
      }
      // Still LIVE: the buyer who just closed the window must know the deal
      // did not close with it, and what finishing it takes. The seller needs
      // no line (their next move, accept or decline, reopens a trade anyway,
      // and the offer lapses on its own).
      if (row.status === 'pending' && row.role === 'buyer' && row.expiresAtMs) {
        this.log(
          t('hudChrome.trade.woc.offerStandsUntil', {
            time: formatDateTime(row.expiresAtMs, { timeStyle: 'short' }),
          }),
          '#ffd100',
        );
      } else if (phase === 'awaiting_payment' && row.role === 'buyer') {
        this.log(t('hudChrome.trade.woc.dealAwaitsPayment'), '#ffd100');
      }
    });
  }

  private async acceptWocTradeOffer(): Promise<void> {
    const hooks = this.wocMarketHooks;
    const offer = this.wocTradeOffer;
    // Re-entrancy guard, mirroring the pay path: a second click during the
    // seller's step-up wallet round trip must not mint a second challenge or
    // race two acceptances into escrow.
    if (!hooks || !offer || this.wocTradeAccepting) return;
    // The seller's staged copy is what escrows; the buyer brings only money, so
    // they send no item at all. The copy resolves from the SIM's cleaned offer
    // (tradeInfo.myOffer), never the HUD-local compose state: the local list
    // is id-plus-count only, so resolving from it could only ever match a
    // PLAIN bag copy (the fix-round review: an instanced directed sale either
    // refused at the index resolution or extracted the wrong copy into an
    // item_mismatch), while the cleaned offer carries the per-copy payload the
    // staging preview pinned. The local list stays as the pre-send fallback.
    const stagedAuthoritative = this.sim.tradeInfo?.myOffer.items ?? this.stagedTrade.items;
    // This belt IS the accept-time enforcement of the whole-table one_item
    // rule, not a redundant second line: the woc panel renders no accept
    // button of its own (agreement rides the trade window's Accept, whose
    // disabled state never consults the model), so deleting this gate
    // reopens the ambiguous-slot resolution. The DECISION is the model's own
    // canAccept/acceptHint ladder, read here rather than re-derived, so the
    // belt and the rendered WHY can never disagree about the table's shape.
    // A null hint with a refused accept is the past-review 'nothing' arm:
    // the goods are escrowed and there is nothing to name, so log nothing.
    if (offer.role === 'seller') {
      const model = wocTradeModelFrom(this.wocTradeDeps(this.sim.tradeInfo?.otherName ?? ''));
      if (!model.canAccept) {
        if (model.acceptHint !== null) this.log(t(model.acceptHint), '#ff6b6b');
        return;
      }
    }
    const first =
      offer.role === 'seller'
        ? stagedAuthoritative.find((sl) => wocTradableSlot(sl, ITEMS))
        : undefined;
    if (offer.role === 'seller' && !first) {
      // Unreachable behind canAccept (the single accepted slot is tradable),
      // kept as the extraction belt: refusing beats escrowing the wrong item.
      this.log(t('hudChrome.trade.woc.hintAcceptNeedsItem'), '#ff6b6b');
      return;
    }
    // The extraction keys on an INVENTORY index. Sending the staged position
    // instead reads as 0 for a single staged item and extracts whatever sits
    // first in the bags, which refused the sale at the very last step.
    let itemFields: Record<string, unknown> = {};
    if (first !== undefined) {
      const index = inventoryIndexOfStaged(this.sim.inventory, first);
      if (index < 0) {
        // Not found is not index 0: refusing here beats escrowing the wrong item.
        this.log(t('hudChrome.trade.woc.hintAcceptNeedsItem'), '#ff6b6b');
        return;
      }
      itemFields = {
        itemIndex: index,
        itemId: first.itemId,
        ...(first.instance === undefined ? {} : { expectInstance: first.instance }),
      };
    }
    // Commit to the async round trip: show the disabled/waiting face NOW (the
    // wallet is about to take over the screen), and reset it in finally.
    this.wocTradeAccepting = true;
    this.updateTradeWindow();
    try {
      // The SELLER's acceptance is the custody-committing act, so it carries
      // the wallet step-up proof (B6/R1): a fresh offer-bound challenge signed
      // through the same bridge the payment path uses. The buyer sends none.
      let stepUpFields: { stepUp?: { nonce: string; signature: string } } = {};
      if (offer.role === 'seller') {
        const issued = await hooks.client.stepUpChallenge({
          operation: 'accept_directed_offer',
          offerId: offer.id,
        });
        if (!issued.ok) {
          this.log(userFacingApiError({ code: issued.code, params: issued.params }), '#ff6b6b');
          return;
        }
        let signature: string;
        if (issued.challenge.signatureRequired === false) {
          // The dev economy's devsig arm, mirrored from the payment path:
          // explicit permission only; an absent flag still goes to the wallet.
          signature = `devsig:${issued.challenge.nonce}`;
        } else {
          this.log(t('hudChrome.wocMarket.signing'), '#ffd100');
          try {
            signature = await hooks.signMessageBase58(issued.challenge.message);
          } catch (err) {
            // Dev channel keeps the raw error; the player line is CLASSIFIED
            // (a decline, a timeout, a missing wallet), never the bridge's or
            // a wallet extension's raw English.
            console.warn('[wallet bridge] step-up signature failed', err);
            this.log(walletBridgeErrorText(err, 'sign'), '#ff6b6b');
            return;
          }
        }
        stepUpFields = { stepUp: { nonce: issued.challenge.nonce, signature } };
      }
      const res = await hooks.client.acceptOffer(offer.id, {
        characterId: hooks.characterId() ?? 0,
        ...itemFields,
        ...stepUpFields,
      });
      if (!res.ok) {
        this.log(userFacingApiError({ code: res.code, params: res.params }), '#ff6b6b');
        return;
      }
      if (res.listing === null) {
        // Agreed; the other side has not yet. Nothing has moved.
        this.log(t('hudChrome.trade.woc.waitingOther'), '#ffd100');
        this.lastTradeSig = '';
        return;
      }
      // The window STAYS OPEN and the offer stays in it: escrow is done, and
      // the buyer's payment is the next thing that happens here. Closing at
      // this point is what previously left the deal with nowhere to finish.
      this.log(t('hudChrome.trade.woc.accepted'), '#7fdc4f');
      this.wocTradeOffer = {
        ...offer,
        phase: 'awaiting_payment',
        listingId: res.listing.id,
      };
      this.lastTradeSig = '';
    } finally {
      this.wocTradeAccepting = false;
      this.updateTradeWindow();
    }
  }

  /**
   * The buyer presses Pay: claim the lock and stage the quote FOR REVIEW.
   *
   * The Exchange's own sequence up to the quote, reused rather than
   * reimplemented: take the buy-now lock, ask for a settlement quote. It then
   * STOPS: the review panel shows the token total and the expiry, and only
   * the explicit Sign and pay hands the SERVER-BUILT transaction to the
   * wallet (H13: click-to-wallet with nothing shown in between was the
   * informed-commitment gap). The client never assembles a transaction, and
   * nothing here computes an amount.
   */
  private async payWocTradeOffer(): Promise<void> {
    const hooks = this.wocMarketHooks;
    const offer = this.wocTradeOffer;
    if (!hooks || !offer || offer.listingId === null || this.wocTradePaying) return;
    if (this.wocTradeQuote !== null) return; // already under review
    this.wocTradePaying = true;
    try {
      // Re-entry after Not now (or a lapsed quote): the buyer already holds
      // the settlement, and a second buyNow would refuse over their own lock.
      let settlementId = this.wocTradeSettlementId;
      let usdCents = offer.usdCents;
      if (settlementId === null) {
        const bought = await hooks.client.buyNow({
          listingId: offer.listingId,
          characterId: hooks.characterId() ?? 0,
          // The player's REAL consent state (R9): durable acceptance, or the
          // consent row's checkbox on this very face. Never a bare true.
          acceptTerms: this.wocTradeTermsAccepted || this.wocTradeTermsChecked,
        });
        if (!bought.ok) {
          this.log(userFacingApiError({ code: bought.code, params: bought.params }), '#ff6b6b');
          return;
        }
        // The server recorded the acceptance this send carried.
        this.wocTradeTermsAccepted = true;
        settlementId = bought.settlement.id;
        usdCents = bought.settlement.amountCents ?? offer.usdCents;
        this.wocTradeSettlementId = settlementId;
      }
      const quoted = await hooks.client.settlementQuote(settlementId);
      if (!quoted.ok || !quoted.quote.transactionBase64) {
        this.log(
          userFacingApiError(
            quoted.ok
              ? { code: 'woc_market.quote_unavailable' }
              : { code: quoted.code, params: quoted.params },
          ),
          '#ff6b6b',
        );
        return;
      }
      this.wocTradeQuote = {
        totalTokens: quoted.quote.amount?.tokens ?? null,
        usdCents,
        expiresAtMs: quoted.quote.expiresAtMs ?? null,
        reference: quoted.quote.reference ?? null,
        transactionBase64: quoted.quote.transactionBase64,
        ...(quoted.quote.signatureRequired === undefined
          ? {}
          : { signatureRequired: quoted.quote.signatureRequired }),
      };
      this.lastTradeSig = '';
    } finally {
      this.wocTradePaying = false;
    }
  }

  /**
   * The buyer signs the REVIEWED quote: the wallet step and the confirm.
   */
  private async signWocTradeQuote(): Promise<void> {
    const hooks = this.wocMarketHooks;
    const offer = this.wocTradeOffer;
    const staged = this.wocTradeQuote;
    const settlementId = this.wocTradeSettlementId;
    if (!hooks || !offer || staged === null || settlementId === null || this.wocTradePaying) {
      return;
    }
    // A lapsed quote must never reach the wallet: signing it buys a refusal
    // at best, and the wallet prompt would be the first the buyer hears of
    // the lapse. Spend the stale quote here and send them back to Pay, which
    // re-quotes against the settlement they already hold (no second buyNow).
    if (staged.expiresAtMs !== null && Date.now() > staged.expiresAtMs) {
      this.wocTradeQuote = null;
      this.lastTradeSig = '';
      this.log(userFacingApiError({ code: 'woc_market.quote_expired' }), '#ff6b6b');
      return;
    }
    this.wocTradePaying = true;
    // Show the pending face NOW, not when the next poll happens to notice. The
    // wallet takes over the screen from here, and coming back to a button
    // that still looks pressable is what made a successful payment read as a
    // click that did nothing. The staged quote is SPENT either way: a decline
    // or refusal sends the buyer back to Pay, which re-quotes.
    this.wocTradeQuote = null;
    this.wocTradeOffer = { ...offer, phase: 'paying' };
    this.lastTradeSig = '';
    try {
      let signature: string;
      if (staged.signatureRequired === false) {
        // The service's dev chain: its stand-in transaction is not signable by
        // any wallet, and its verifier matches on the built memo rather than on
        // signature bytes. Handing it to a real wallet threw at atob() before
        // the wallet could even reject it. Explicit permission only, so an
        // absent flag still goes through the wallet.
        signature = `devsig:${staged.reference ?? ''}`;
      } else {
        this.log(t('hudChrome.trade.woc.paying'), '#ffd100');
        try {
          signature = await hooks.signAndSendTransactionBase64(staged.transactionBase64 ?? '');
        } catch (err) {
          // Dev channel keeps the raw error; the player line is classified,
          // never rendered from err.message (the wallet-bridge i18n medium).
          console.warn('[wallet bridge] payment signature failed', err);
          this.log(walletBridgeErrorText(err, 'payment'), '#ff6b6b');
          // Back to the payable face: the decline spent the staged quote,
          // not the deal.
          if (this.wocTradeOffer?.id === offer.id) {
            this.wocTradeOffer = { ...this.wocTradeOffer, phase: 'awaiting_payment' };
          }
          return;
        }
      }
      const done = await hooks.client.confirmSettlement(settlementId, signature);
      if (!done.ok) {
        this.log(userFacingApiError({ code: done.code, params: done.params }), '#ff6b6b');
        return;
      }
      // The Exchange window's ladder, refined: two surfaces describing the
      // same server answer must make the same claim. Only 'confirming' is
      // pending (the chain has not decided; the line says WHICH pending),
      // 'review' is money parked under an operator verdict, a CONFIRMED or
      // DELIVERING answer is decided money whose delivery has not finished
      // (its own sentence: "on its way by mail" was claiming a finalize that
      // had not happened, and the poll's settled line still closes the loop
      // when it does), and 'delivered' is the settled line. A failed retry
      // never reaches here (the outcome arm refuses it), so the settled line
      // cannot fire for lost money.
      if (done.state === 'review') {
        this.log(t('hudChrome.wocMarket.settlementReview'), '#ffd100');
      } else if (done.state === 'confirming') {
        this.log(wocPaymentPendingText(done.reason), '#ffd100');
      } else if (done.state === 'confirmed' || done.state === 'delivering') {
        this.log(t('hudChrome.trade.woc.paymentConfirmed'), '#7fdc4f');
      } else {
        this.log(t('hudChrome.trade.woc.settled'), '#7fdc4f');
      }
      // The paying face's status sentence keys on the settlement state (a
      // confirmed payment is not "confirming on the network"), so carry the
      // answer onto the held offer instead of waiting a poll beat.
      if (this.wocTradeOffer?.id === offer.id) {
        this.wocTradeOffer = { ...this.wocTradeOffer, settlementState: done.state };
      }
    } finally {
      this.wocTradePaying = false;
      this.lastTradeSig = '';
    }
  }

  private async cancelWocTradeOffer(action: 'decline' | 'withdraw'): Promise<void> {
    const hooks = this.wocMarketHooks;
    const offer = this.wocTradeOffer;
    if (!hooks || !offer) return;
    const res = await hooks.client.resolveOffer(offer.id, action);
    if (res.ok) {
      // Mark the offer reported BEFORE the next poll runs: the resolver got
      // their feedback here, and the lingering resolved row must not earn
      // them a second "offer was declined/withdrawn" line from the clear arm.
      this.wocTradeFinished.add(offer.id);
      this.log(
        t(
          action === 'decline'
            ? 'hudChrome.trade.woc.youDeclined'
            : 'hudChrome.trade.woc.youWithdrew',
        ),
        '#ffd100',
      );
      this.wocTradeOffer = null;
      this.wocTradeSplit = null;
      this.wocTradeQuote = null;
      this.wocTradeSettlementId = null;
      this.lastTradeSig = '';
    } else {
      this.log(userFacingApiError({ code: res.code, params: res.params }), '#ff6b6b');
    }
  }

  /**
   * The seller cancels the directed listing while the buyer has not paid:
   * the PRD's own mitigation for a buyer who agreed and stalled, previously
   * unreachable from any surface (H13). Rides the ordinary cancel route with
   * the settlement-aware guards: an unpaid claim window turns the cancel
   * into CANCEL-PENDING (the buyer keeps their window; the listing closes on
   * its own unless they pay), and a paid window refuses settlement_in_flight
   * honestly. The deal stays held on cancel-pending, because it may still
   * settle; a plain cancel ends it here and the return flight brings the
   * copy home by mail.
   */
  private async cancelWocDirectedSale(): Promise<void> {
    const hooks = this.wocMarketHooks;
    const offer = this.wocTradeOffer;
    if (!hooks || !offer || offer.listingId === null || offer.role !== 'seller') return;
    const res = await hooks.client.cancelListing(offer.listingId);
    if (!res.ok) {
      this.log(userFacingApiError({ code: res.code, params: res.params }), '#ff6b6b');
      return;
    }
    if (res.cancelPending === true) {
      this.log(t('hudChrome.wocMarket.listingCancelPending'), '#ffd100');
      return;
    }
    this.wocTradeFinished.add(offer.id);
    this.log(t('hudChrome.wocMarket.listingCancelled'), '#ffd100');
    this.wocTradeOffer = null;
    this.wocTradeSplit = null;
    this.wocTradeQuote = null;
    this.wocTradeSettlementId = null;
    this.lastTradeSig = '';
  }

  /** Debounced: one estimate per pause in typing, not one per keystroke. */
  private onWocTradePrice(cents: number | null): void {
    this.wocTradeUsdCents = cents;
    if (this.wocTradeEstimateTimer !== null) window.clearTimeout(this.wocTradeEstimateTimer);
    // EVERY change blanks the derived lines immediately, not just an emptied
    // field: through the debounce plus the round trip, the old figures
    // described the PREVIOUS price, and a seller reading "You receive" against
    // the number they just typed was being quoted someone else's total.
    this.wocTradeTokens = null;
    this.wocTradeSplit = null;
    if (cents === null || cents <= 0) {
      this.refreshWocTradeArm();
      return;
    }
    const seq = ++this.wocTradeEstimateSeq;
    this.wocTradeEstimateTimer = window.setTimeout(() => {
      void this.wocMarketHooks?.client.estimate(cents).then((est) => {
        // A slower earlier request must never clobber a newer answer.
        if (seq !== this.wocTradeEstimateSeq) return;
        this.wocTradeTokens = est?.amount?.tokens ?? null;
        this.wocTradeSplit = est?.split ?? null;
        this.refreshWocTradeArm();
      });
    }, 350);
    this.refreshWocTradeArm();
  }

  private refreshWocTradeArm(): void {
    const info = this.sim.tradeInfo;
    if (!info) return;
    refreshWocTradeArm($('#trade-window'), wocTradeModelFrom(this.wocTradeDeps(info.otherName)));
  }

  private async sendWocTradeOffer(otherName: string): Promise<void> {
    const hooks = this.wocMarketHooks;
    const model = wocTradeModelFrom(this.wocTradeDeps(otherName));
    if (!hooks || !model.canSend || this.wocTradeUsdCents === null) return;
    // The offer names the EXACT copy on the table (H10): the server pins its
    // fingerprint at creation and refuses acceptance of any other copy, so a
    // seller cannot swap in a re-rolled instance after the price is agreed.
    // canSend guarantees agreedItem (the one_item hint arm); the null check is
    // a belt for a raced model rebuild.
    const agreed = model.agreedItem;
    if (agreed === null) return;
    const res = await hooks.client.createOffer({
      characterId: hooks.characterId() ?? 0,
      sellerCharacterName: otherName,
      usdCents: this.wocTradeUsdCents,
      itemId: agreed.itemId,
      ...(agreed.instance === undefined ? {} : { itemInstance: agreed.instance }),
      ...(agreed.craftedRecipeId === undefined
        ? {}
        : { itemCraftedRecipeId: agreed.craftedRecipeId }),
      // The player's REAL consent (R9): durable acceptance from /me, or the
      // consent row rendered ON this compose face. The hard-coded true this
      // replaces recorded acceptance the panel never showed; guardTerms
      // refuses terms_required honestly when neither holds.
      acceptTerms: this.wocTradeTermsAccepted || this.wocTradeTermsChecked,
    });
    if (res.ok) {
      // The server recorded the acceptance this send carried.
      this.wocTradeTermsAccepted = true;
      // The window STAYS OPEN. The offer now sits in it for both players to
      // read, and the seller accepts from there; closing it here left both
      // sides staring at nothing, with no way to agree.
      this.log(t('hudChrome.trade.woc.offerSent', { name: otherName }), '#7fdc4f');
      this.wocTradeOffer = {
        id: res.offer.id,
        usdCents: res.offer.usdCents,
        tokens: this.wocTradeTokens,
        role: 'buyer',
        phase: 'review',
        listingId: null,
        buyerAccepted: false,
        sellerAccepted: false,
        expiresAtMs: res.offer.expiresAtMs ?? null,
        settlementState: null,
      };
      this.lastTradeSig = '';
    } else {
      this.log(userFacingApiError({ code: res.code, params: res.params }), '#ff6b6b');
    }
  }

  updateTradeWindow(): void {
    const el = $('#trade-window');
    const info = this.sim.tradeInfo;
    if (!info) {
      if (this.tradeWasOpen) {
        el.style.display = 'none';
        this.tradeWasOpen = false;
        this.stagedTrade = { items: [], copper: 0 };
        this.wocTradePartner = null;
        this.wocTradePartnerResolved = false;
        this.wocTradePartnerFor = '';
        // Before clearing it: a deal that was still live when the window shut
        // may have settled, and this side may not have seen it yet. Clears
        // wocTradeOffer itself, so the assignment it replaces is not repeated.
        this.resolveClosedWocTrade();
        this.wocTradeOfferPolledAtMs = 0;
        // Clear any in-flight guard on close: the desktop wallet-standard signer
        // has no timeout, so a dismissed popup would otherwise leave the Accept
        // (or Pay) button stuck disabled for the rest of the session on the next
        // trade. Closing the window abandons the round trip.
        this.wocTradeAccepting = false;
        this.wocTradePaying = false;
        this.lastTradeSig = '';
        if ($('#bags').style.display !== 'none') this.renderBags();
      }
      return;
    }
    if (!this.tradeWasOpen) {
      this.tradeWasOpen = true;
      this.stagedTrade = { items: [], copper: 0 };
      this.wocTradeMode = 'gold';
      this.wocTradeUsdCents = null;
      this.wocTradeTokens = null;
      this.wocTradeSplit = null;
      this.renderBags();
      $('#bags').style.display = 'flex';
      // The Exchange floor for the courtesy below-min hint, once per
      // controller (a realm-static knob); null until it answers, and null
      // never blocks: the server's own refusal stays the authority.
      if (this.wocMarketHooks !== null && this.wocTradeMinPriceCents === null) {
        void this.wocMarketHooks.client.status().then((status) => {
          if (status.ok && status.enabled) {
            this.wocTradeMinPriceCents = status.minPriceCents;
          }
        });
      }
      // Fresh consent per trade until durably recorded; then learn the
      // durable state so the row hides for a player who already accepted
      // (the Exchange window's own contract, via the same /me field).
      this.wocTradeTermsChecked = false;
      if (this.wocMarketHooks !== null && !this.wocTradeTermsAccepted) {
        void this.wocMarketHooks.client.me().then((res) => {
          if (res.ok && res.activity.termsAcceptedAtMs !== null) {
            this.wocTradeTermsAccepted = true;
            this.lastTradeSig = '';
          }
        });
      }
    }
    // Once per counterparty: whether they can be paid in $WOC is server data the
    // sim cannot know (src/sim/social/trade.ts is inside the token firewall), so
    // it rides beside TradeInfo rather than on it.
    // The standing offer is polled every pass (self-throttled by wall clock),
    // because either side may create or resolve one at any moment.
    this.pollWocTradeOffer(info.otherName, Date.now());
    if (this.wocMarketHooks !== null && this.wocTradePartnerFor !== info.otherName) {
      this.wocTradePartnerFor = info.otherName;
      const name = info.otherName;
      void this.wocMarketHooks.client.tradePartner(name).then((partner) => {
        if (this.wocTradePartnerFor !== name) return; // the trade moved on
        this.wocTradePartner = partner;
        this.wocTradePartnerResolved = true;
        this.lastTradeSig = ''; // one repaint, to show the arm or its reason
      });
    }
    const sig = JSON.stringify([
      info.myOffer,
      info.theirOffer,
      info.myAccepted,
      info.theirAccepted,
      this.stagedTrade,
      // The arm's structural state. usdCents is deliberately ABSENT: including
      // it would rebuild the subtree on every keystroke and destroy the input
      // under the caret. Price edits refresh the derived lines in place.
      this.wocTradeMode,
      this.wocTradePartner,
      this.wocTradeOffer,
      // The staged quote review and the consent row's visibility are both
      // structural render state; the CHECKBOX state is deliberately absent
      // (toggling must not rebuild the subtree under the click). The quote
      // rides as a STRUCTURAL PROJECTION: transactionBase64 and reference
      // render nowhere, and serializing a whole transaction blob on every
      // medium-band pass buys no repaint the projected fields do not.
      this.wocTradeQuote === null
        ? null
        : [
            this.wocTradeQuote.totalTokens,
            this.wocTradeQuote.usdCents,
            this.wocTradeQuote.expiresAtMs,
          ],
      this.wocTradeTermsAccepted,
      // The Pay claim in flight disables the button, so it is render state.
      this.wocTradePaying,
      // The seller's step-up round trip changes the Accept button (Waiting +
      // disabled), so it must invalidate the signature or the pending face is
      // elided and the button reads Accept through the whole wallet handoff.
      this.wocTradeAccepting,
    ]);
    if (sig === this.lastTradeSig) return;
    // The rebuild below replaces the whole subtree, so a seller typing a $WOC
    // price loses the caret when the OTHER side changes their offer (which moves
    // the signature). Carry the focused control's identity across, the same way
    // every other rebuilding painter does.
    const keptFocusKey = captureFocusKey(el);
    // Visible BEFORE the render body: the panel's CSS default is
    // display:none, and a throw on the FIRST paint used to leave a live
    // trade with no panel at all (no Accept, no Cancel). A partial paint
    // the player can see and escape beats an invisible one.
    el.style.display = 'block';

    // The whole render sits in one try: it is throw-free by construction
    // (buildTradeItemRow resolves unknown ids), so the catch is the blast
    // radius bound for an UNKNOWN future throw, which would otherwise abort
    // every update() call banded after this one (arena, fiesta, the Vale
    // Cup surfaces). The finally commits the repaint signature on BOTH
    // paths, deliberately: on success that is commit-after-complete-paint;
    // on a throw it means the panel shows its last complete paint until the
    // OFFER DATA next changes (which re-derives the signature and retries),
    // with one console.error per attempt. The alternative, committing on
    // success only, would re-run a deterministic throw every band tick for
    // pure log spam. What the shipped bug did that this does not: the
    // signature committed BEFORE the render outside any try, so each data
    // change re-threw straight into the band (aborting the callers after
    // this one) and every other frame skipped the repaint entirely.
    try {
      // The $WOC arm's model also decides whether the GOLD fields are live: the
      // two currencies are mutually exclusive, so entering $WOC mode must grey
      // gold out rather than leaving a field that silently invalidates the deal.
      const wocModel = wocTradeModelFrom(this.wocTradeDeps(info.otherName));
      const goldAttr = wocModel.goldDisabled ? ' disabled' : '';
      // The standing $WOC offer reads in the MONEY row of whichever side owes
      // it, in the currency the two players agreed plus the quoted tokens. It
      // replaces that side's gold, because the two are mutually exclusive.
      const wocMoneyText = wocTradeMoneyText(wocModel.pendingOffer);
      const wocMoneyMine =
        wocModel.pendingOffer?.role === 'buyer' && wocMoneyText !== ''
          ? `<span class="trade-woc-money">${esc(wocMoneyText)}</span>`
          : '';
      const wocMoneyTheirs =
        wocModel.pendingOffer?.role === 'seller' && wocMoneyText !== ''
          ? `<span class="trade-woc-money">${esc(wocMoneyText)}</span>`
          : '';
      const itemRow = (s: InvSlot, mine: boolean) => {
        // Stale-client guard (R34): the other side's offer is server truth and
        // can carry an id this bundle predates; buildTradeItemRow keeps the raw
        // id as the label and the icon falls back instead of dereferencing the
        // missing def (the shipped failure shape threw here and froze the offer
        // display behind the already-set repaint signature).
        const { item, label } = buildTradeItemRow(s, ITEMS);
        const inner = `${item ? this.itemIcon(item) : unknownItemIconHtml(s.itemId)}<span>${esc(label)}</span>`;
        return mine
          ? `<button type="button" class="trade-item mine" data-item="${esc(s.itemId)}">${inner}</button>`
          : `<div class="trade-item">${inner}</div>`;
      };
      el.innerHTML = `
        <div class="panel-title"><span>${esc(t('hud.trade.title', { name: info.otherName }))}</span><button type="button" class="x-btn" data-close aria-label="${esc(t('hud.trade.cancel'))}">${svgIcon('close')}</button></div>
        <div class="trade-cols">
          <div class="trade-col ${info.myAccepted ? 'accepted' : ''}">
            <h4>${esc(t('hud.trade.yourOffer'))}</h4>
            <div class="trade-items">${info.myOffer.items.map((s) => itemRow(s, true)).join('') || `<div class="trade-empty">${esc(t('hud.trade.emptyMine'))}</div>`}</div>
            <div class="trade-money"><span class="trade-money-label">${esc(t('hud.trade.money'))}:</span>${wocMoneyMine}
              <span class="trade-coins"${wocModel.wocDealStanding ? ' hidden' : ''}>
                <input class="coininput" id="trade-g"${goldAttr} type="number" min="0" value="${Math.floor(this.stagedTrade.copper / 10000)}" aria-label="${esc(t('itemUi.money.gold'))}"><span class="coin g" aria-hidden="true"></span><span class="mkt-coin-tag">${esc(t('itemUi.money.goldShort'))}</span>
                <input class="coininput" id="trade-s"${goldAttr} type="number" min="0" max="99" value="${Math.floor((this.stagedTrade.copper % 10000) / 100)}" aria-label="${esc(t('itemUi.money.silver'))}"><span class="coin s" aria-hidden="true"></span><span class="mkt-coin-tag">${esc(t('itemUi.money.silverShort'))}</span>
                <input class="coininput" id="trade-c"${goldAttr} type="number" min="0" max="99" value="${this.stagedTrade.copper % 100}" aria-label="${esc(t('itemUi.money.copper'))}"><span class="coin c" aria-hidden="true"></span><span class="mkt-coin-tag">${esc(t('itemUi.money.copperShort'))}</span>
              </span>
            </div>
          </div>
          <div class="trade-col ${info.theirAccepted ? 'accepted' : ''}">
            <h4>${esc(t('hud.trade.theirOffer', { name: info.otherName }))}</h4>
            <div class="trade-items">${info.theirOffer.items.map((s) => itemRow(s, false)).join('') || `<div class="trade-empty">${esc(t('hud.trade.emptyTheirs'))}</div>`}</div>
            <div class="trade-money">${esc(t('hud.trade.money'))}: ${wocMoneyTheirs || `<span class="gold">${formatLocalizedMoney(info.theirOffer.copper)}</span>`}</div>
          </div>
        </div>
        <div class="trade-hint">${esc(t('hud.trade.hint'))}</div>
        ${wocTradeArmHtml(wocModel, this.wocTradeUsdCents)}`;
      const acceptBtn = document.createElement('button');
      acceptBtn.className = 'btn';
      // With a $WOC offer standing, agreement lives on the OFFER, not on the sim
      // trade (which this deal never confirms). Reading myAccepted here left the
      // button saying "Accept" after the player had already accepted, and
      // pressing it again sent a second acceptance for a deal already agreed.
      const bothAgreed =
        wocModel.pendingOffer !== null &&
        wocModel.pendingOffer.buyerAccepted &&
        wocModel.pendingOffer.sellerAccepted;
      // Both agreed but no listing means the ESCROW failed and the server
      // reopened the offer. Leaving the button on "Waiting" there is a dead end
      // neither side can leave, so it becomes pressable again to retry.
      const escrowFailed = bothAgreed && wocModel.pendingOffer?.listingId === null;
      const wocAccepted =
        wocModel.pendingOffer === null
          ? null
          : escrowFailed
            ? false
            : wocModel.pendingOffer.role === 'buyer'
              ? wocModel.pendingOffer.buyerAccepted
              : wocModel.pendingOffer.sellerAccepted;
      const accepted = wocAccepted ?? info.myAccepted;
      // Once the goods are escrowed there is nothing left to accept: the buyer
      // pays and the seller waits, both inside the arm.
      const acceptSpent =
        wocModel.pendingOffer !== null && wocModel.pendingOffer.phase !== 'review';
      // The seller's acceptance is in flight (challenge mint plus wallet): the
      // button reads "Waiting..." and disables, so the multi-second handoff
      // never looks like a dead click (frontend pending-face contract).
      const acceptInFlight = this.wocTradeAccepting;
      acceptBtn.textContent =
        accepted || acceptInFlight ? t('hud.trade.waiting') : t('hud.trade.accept');
      acceptBtn.disabled = accepted || acceptSpent || acceptInFlight;
      acceptBtn.hidden = acceptSpent;
      acceptBtn.addEventListener('click', () => {
        // With a $WOC offer standing, the sim's confirm must NEVER run: it swaps
        // atomically the moment both sides accept, and this deal carries no gold
        // and no buyer items, so it would hand the goods over for nothing.
        // Agreement is recorded on the offer instead, and the second acceptance
        // is what escrows.
        if (this.wocTradeOffer !== null) {
          void this.acceptWocTradeOffer();
          return;
        }
        this.sim.tradeConfirm();
      });
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn';
      cancelBtn.textContent = t('hud.trade.cancel');
      cancelBtn.addEventListener('click', () => this.sim.tradeCancel());
      el.append(acceptBtn, cancelBtn);
      el.querySelector('[data-close]')?.addEventListener('click', () => this.sim.tradeCancel());
      wireWocTradeArm(el, this.wocTradeDeps(info.otherName));
      refreshWocTradeArm(el, wocTradeModelFrom(this.wocTradeDeps(info.otherName)));
      restoreWocTradeFocus(el, keptFocusKey);
      el.querySelectorAll('.trade-item.mine').forEach((row) => {
        row.addEventListener('click', () => {
          const itemId = (row as HTMLElement).dataset.item ?? '';
          const idx = this.stagedTrade.items.findIndex((s) => s.itemId === itemId);
          if (idx >= 0) {
            this.stagedTrade.items[idx].count--;
            if (this.stagedTrade.items[idx].count <= 0) this.stagedTrade.items.splice(idx, 1);
            this.pushTradeOffer();
          }
        });
      });
      // Wire the same stat tooltip bag/vendor/bank slots use onto both offer
      // sides, keyed positionally (the rendered rows are the offer's own items
      // in order, with no other `.trade-item` siblings to misalign against).
      // Both offer sides render from the same InvSlot shape (TradeOffer.items
      // in src/world_api/trade.ts), so the trade-slot tooltip reuses the exact
      // bag tooltip (item + per-instance enchant/masterwork/signature detail)
      // rather than any bespoke trade-only summary.
      const attachTradeTooltips = (rows: NodeListOf<Element>, slots: InvSlot[]) => {
        rows.forEach((row, i) => {
          const target = tradeRowTooltipTarget(slots, i);
          if (!target) return;
          this.attachTooltip(row as HTMLElement, () =>
            this.itemTooltip(target.item, true, target.instance),
          );
        });
      };
      attachTradeTooltips(
        el.querySelectorAll('.trade-col:first-child .trade-item'),
        info.myOffer.items,
      );
      attachTradeTooltips(
        el.querySelectorAll('.trade-col:last-child .trade-item'),
        info.theirOffer.items,
      );
      const goldInput = el.querySelector('#trade-g') as HTMLInputElement;
      const silverInput = el.querySelector('#trade-s') as HTMLInputElement;
      const copperInput = el.querySelector('#trade-c') as HTMLInputElement;
      const syncTradeMoney = () => {
        const gg = Math.max(0, Math.floor(Number(goldInput?.value) || 0));
        const ss = Math.max(0, Math.floor(Number(silverInput?.value) || 0));
        const cc = Math.max(0, Math.floor(Number(copperInput?.value) || 0));
        this.stagedTrade.copper = gg * 10000 + ss * 100 + cc;
        this.pushTradeOffer();
      };
      [goldInput, silverInput, copperInput].forEach((input) => {
        input?.addEventListener('change', syncTradeMoney);
      });
    } catch (err) {
      console.error('[hud] trade window render failed', err);
    } finally {
      this.lastTradeSig = sig;
    }
  }
}
