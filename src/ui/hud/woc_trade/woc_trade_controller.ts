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
import { formatMoney as formatLocalizedMoney, t } from '../../i18n';
import { knownItemDef } from '../../known_item';
import { buildTradeItemRow, tradeRowTooltipTarget } from '../../trade_view';
import {
  refreshWocTradeArm,
  restoreWocTradeFocus,
  type WocTradePanelDeps,
  wireWocTradeArm,
  wocOfferPhase,
  wocSettlementInFlight,
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
import type { WocMarketHooks } from '../../woc_market_window';
import { adoptedWocOffer, selectStandingWocOffer, wocOfferPollStep } from './woc_trade_offer_view';

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => document.querySelector(sel) as T;

/** How often the trade window re-reads the standing $WOC offer. Slow on
 *  purpose: it is a REST read on a short-lived surface, and two seconds of lag
 *  is invisible while two players are talking. */
const WOC_TRADE_OFFER_POLL_MS = 2000;

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
      onModeChange: (mode) => {
        this.wocTradeMode = mode;
        this.lastTradeSig = '';
      },
      onPriceInput: (cents) => this.onWocTradePrice(cents),
      onSendOffer: () => void this.sendWocTradeOffer(otherName),
      onAcceptOffer: () => void this.acceptWocTradeOffer(),
      onCancelOffer: () => void this.cancelWocTradeOffer('withdraw'),
      onPayOffer: () => void this.payWocTradeOffer(),
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
          this.wocTradeOffer = null;
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
      if (step.kind === 'keep') {
        return;
      }
      // Quote the agreed price once, so both sides show the same token figure.
      const est = await hooks.client.estimate(mine.usdCents);
      if (this.sim.tradeInfo?.otherName !== otherName) return;
      this.wocTradeOffer = adoptedWocOffer(mine, phase, est?.amount?.tokens ?? null);
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
    this.lastTradeSig = '';
    // Closing the trade itself is the sim's call, not a display change: the
    // other player's client must learn the trade is over too. CLOSE, not
    // cancel: the sale succeeded, and telling both players it was cancelled
    // contradicts the payment line printed a moment earlier.
    this.sim.tradeClose();
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
    if (!hooks || !offer || this.wocTradeFinished.has(offer.id)) return;
    void hooks.client.offers().then((res) => {
      if (!res.ok) return;
      const row = res.offers.find((o) => o.id === offer.id);
      if (row && wocOfferPhase(row) === 'settled') this.finishWocTrade(row);
    });
  }

  private async acceptWocTradeOffer(): Promise<void> {
    const hooks = this.wocMarketHooks;
    const offer = this.wocTradeOffer;
    if (!hooks || !offer) return;
    // The seller's staged copy is what escrows; the buyer brings only money, so
    // they send no item at all. The copy resolves from the SIM's cleaned offer
    // (tradeInfo.myOffer), never the HUD-local compose state: the local list
    // is id-plus-count only, so resolving from it could only ever match a
    // PLAIN bag copy (the fix-round review: an instanced directed sale either
    // refused at the index resolution or extracted the wrong copy into an
    // item_mismatch), while the cleaned offer carries the per-copy payload the
    // staging preview pinned. The local list stays as the pre-send fallback.
    const stagedAuthoritative = this.sim.tradeInfo?.myOffer.items ?? this.stagedTrade.items;
    if (
      offer.role === 'seller' &&
      (stagedAuthoritative.length > 1 || (stagedAuthoritative[0]?.count ?? 1) !== 1)
    ) {
      // The model already disables accept for this shape (the whole-table
      // one_item rule), but the button can be stale against the sim's
      // cleaned offer, so the send path refuses with the same WHY rather
      // than resolving an ambiguous first-eligible slot into a server-side
      // item_mismatch.
      this.log(t('hudChrome.trade.woc.hintOneItem'), '#ff6b6b');
      return;
    }
    const first =
      offer.role === 'seller'
        ? stagedAuthoritative.find((sl) => wocTradableSlot(sl, ITEMS))
        : undefined;
    if (offer.role === 'seller' && !first) {
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
    const res = await hooks.client.acceptOffer(offer.id, {
      characterId: hooks.characterId() ?? 0,
      ...itemFields,
    });
    if (!res.ok) {
      this.log(userFacingApiError({ code: res.code }), '#ff6b6b');
      return;
    }
    if (res.listing === null) {
      // Agreed; the other side has not yet. Nothing has moved.
      this.log(t('hudChrome.trade.woc.waitingOther'), '#ffd100');
      this.lastTradeSig = '';
      return;
    }
    // The window STAYS OPEN and the offer stays in it: escrow is done, and the
    // buyer's payment is the next thing that happens here. Closing at this
    // point is what previously left the deal with nowhere to finish.
    this.log(t('hudChrome.trade.woc.accepted'), '#7fdc4f');
    this.wocTradeOffer = {
      ...offer,
      phase: 'awaiting_payment',
      listingId: res.listing.id,
    };
    this.lastTradeSig = '';
  }

  /**
   * The buyer pays, from the trade window.
   *
   * Exactly the Exchange's own sequence, reused rather than reimplemented: take
   * the buy-now lock, ask for a settlement quote, hand the SERVER-BUILT
   * transaction to the wallet bridge, then confirm with the signature. The
   * client never assembles a transaction, and nothing here computes an amount.
   */
  private async payWocTradeOffer(): Promise<void> {
    const hooks = this.wocMarketHooks;
    const offer = this.wocTradeOffer;
    if (!hooks || !offer || offer.listingId === null || this.wocTradePaying) return;
    this.wocTradePaying = true;
    // Show the pending face NOW, not when the next poll happens to notice. The
    // wallet takes over the screen from here, and coming back to a Pay button
    // that still looks pressable is what made a successful payment read as a
    // click that did nothing.
    this.wocTradeOffer = { ...offer, phase: 'paying' };
    this.lastTradeSig = '';
    try {
      const bought = await hooks.client.buyNow({
        listingId: offer.listingId,
        characterId: hooks.characterId() ?? 0,
        // Terms were accepted when the offer was made; the server records them
        // once per account and this flag is only the per-call assertion.
        acceptTerms: true,
      });
      if (!bought.ok) {
        this.log(userFacingApiError({ code: bought.code }), '#ff6b6b');
        return;
      }
      const quoted = await hooks.client.settlementQuote(bought.settlement.id);
      if (!quoted.ok || !quoted.quote.transactionBase64) {
        this.log(
          userFacingApiError({ code: quoted.ok ? 'woc_market.quote_unavailable' : quoted.code }),
          '#ff6b6b',
        );
        return;
      }
      let signature: string;
      if (quoted.quote.signatureRequired === false) {
        // The service's dev chain: its stand-in transaction is not signable by
        // any wallet, and its verifier matches on the built memo rather than on
        // signature bytes. Handing it to a real wallet threw at atob() before
        // the wallet could even reject it. Explicit permission only, so an
        // absent flag still goes through the wallet.
        signature = `devsig:${quoted.quote.reference ?? ''}`;
      } else {
        this.log(t('hudChrome.trade.woc.paying'), '#ffd100');
        try {
          signature = await hooks.signAndSendTransactionBase64(quoted.quote.transactionBase64);
        } catch (err) {
          // The wallet bridge throws player-facing text already.
          this.log(
            err instanceof Error && err.message ? err.message : t('hudChrome.wocMarket.loadFailed'),
            '#ff6b6b',
          );
          return;
        }
      }
      const done = await hooks.client.confirmSettlement(bought.settlement.id, signature);
      if (!done.ok) {
        this.log(userFacingApiError({ code: done.code }), '#ff6b6b');
        return;
      }
      // "On its way by mail" is a claim about DELIVERY, so it waits for a state
      // that means delivery. A correct payment can come back still confirming
      // (finality takes tens of seconds), and announcing arrival then is the
      // same mistake in reverse as rejecting it: the poll finishes the deal when
      // the chain does, and the pending face stays up until it has.
      if (!wocSettlementInFlight(done.state)) {
        this.log(t('hudChrome.trade.woc.settled'), '#7fdc4f');
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
      this.wocTradeOffer = null;
      this.lastTradeSig = '';
    } else {
      this.log(userFacingApiError({ code: res.code }), '#ff6b6b');
    }
  }

  /** Debounced: one estimate per pause in typing, not one per keystroke. */
  private onWocTradePrice(cents: number | null): void {
    this.wocTradeUsdCents = cents;
    if (this.wocTradeEstimateTimer !== null) window.clearTimeout(this.wocTradeEstimateTimer);
    if (cents === null || cents <= 0) {
      this.wocTradeTokens = null;
      this.wocTradeSplit = null;
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
    });
    if (res.ok) {
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
      };
      this.lastTradeSig = '';
    } else {
      this.log(userFacingApiError({ code: res.code }), '#ff6b6b');
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
      acceptBtn.textContent = accepted ? t('hud.trade.waiting') : t('hud.trade.accept');
      acceptBtn.disabled = accepted || acceptSpent;
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
