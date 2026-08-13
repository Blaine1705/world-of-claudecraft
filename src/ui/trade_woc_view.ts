// Pure view-core for the trade window's $WOC arm (docs/prd/woc/p2p-woc-trade.md).
//
// The trade window is the ENTRY POINT for selling an item to a named player for
// $WOC, but a $WOC deal is not the sim's atomic swap: the sim trade moves
// everything in one tick, and a $WOC payment is asynchronous (sign, then chain
// finality, seconds to minutes, and it can fail). So this core decides what the
// window offers and shows, and the deal itself rides the exchange rail as a
// directed offer.
//
// The client computes NO economic value here. Token amounts and the fee split
// are passthroughs of server-provided numbers, because the real split rounds
// each fee leg up and gives the seller the remainder: a percentage recomputed
// here would disagree with the settlement by a cent.
//
// DOM/Three-free (registered in tests/architecture.test.ts UI_PURE_CORES).

import { exchangeHardLock, exchangeItemCategory } from '../sim/exchange_eligibility';
import { itemInstancePayloadsEqual } from '../sim/item_instance_merge';
import type { InvSlot, ItemDef, ItemInstancePayload } from '../sim/types';
import type { TranslationKey } from './i18n.catalog';
import { overWalletBalance } from './woc_affordable_core';

/** What the window knows about the other side, fed by the server (never by the
 *  sim, which sits inside the token firewall and knows nothing about wallets). */
export interface WocTradePartner {
  name: string;
  walletVerified: boolean;
}

/** The server's fee split for the entered amount, or null when unavailable. */
export interface WocTradeSplit {
  sellerCents: number;
  burnCents: number;
  treasuryCents: number;
}

export type WocTradeMode = 'gold' | 'woc';

/**
 * Where a $WOC deal has got to. The window shows one of four faces.
 *
 *  - review: agreed price on the table, each side yet to accept.
 *  - awaiting_payment: both accepted, the goods are in escrow, and the BUYER
 *    still has to sign. The seller can do nothing but wait, which is exactly
 *    what their face should say.
 *  - paying: the payment is in flight. The buyer has signed and the chain has
 *    not finished confirming, which takes tens of seconds on mainnet.
 *  - settled: paid; the item is on its way by mail.
 *
 * `paying` is not cosmetic. Without it the window sat on `awaiting_payment`
 * through the whole confirmation and then emptied, so a buyer signing in their
 * wallet and a buyer who walked away looked identical to the seller, and the
 * sale appeared to complete with no payment ever shown.
 */
export type WocOfferPhase = 'review' | 'awaiting_payment' | 'paying' | 'settled';

/** A sent-but-unresolved $WOC offer, as both sides see it. */
export interface WocPendingOffer {
  id: number;
  usdCents: number;
  /** Server-quoted tokens for that price, or null while unavailable. */
  tokens: number | null;
  /** Which side the VIEWER is on: only the seller may accept, only the buyer pays. */
  role: 'buyer' | 'seller';
  phase: WocOfferPhase;
  /** The directed listing to pay for, once one exists. */
  listingId: number | null;
  /** Each side's agreement. The trade window's Accept button reads THESE rather
   *  than the sim's own accepted flags, because a $WOC deal never confirms the
   *  sim trade and those flags therefore never move. */
  buyerAccepted: boolean;
  sellerAccepted: boolean;
}

/** Why the $WOC arm is unavailable, or null when it is offerable. */
export type WocArmBlock =
  | 'market_disabled' // the realm has no exchange
  | 'no_wallet' // YOUR wallet is not linked
  | 'partner_unknown' // we have not learned whether THEY can be paid
  | 'recipient_no_wallet'; // we have, and they cannot

/**
 * Why "Send offer" is withheld, when the arm itself is usable.
 *
 * Distinct from WocArmBlock, which means $WOC is unavailable and hides the
 * form. These are about the CONTENTS of the offer being incomplete, so the form
 * stays up and the hint says what is missing. A disabled button with no reason
 * is the defect this exists to prevent: a seller typed a price, got a dead
 * button, and had nothing to act on.
 */
export type WocSendHint =
  | 'clear_your_items' // you are BUYING, so your own side must be empty
  | 'await_their_items' // they have staged nothing eligible to buy yet
  | 'one_item' // a directed deal pins EXACTLY one copy; more than one is ambiguous
  | 'enter_price'
  | 'gold_offered'
  | 'insufficient_balance'; // the quote is more $WOC than the wallet holds

export interface WocTradeInput {
  marketEnabled: boolean;
  selfWalletVerified: boolean;
  partner: WocTradePartner | null;
  /** YOUR own staged items. Offering $WOC means buying, so this must be empty:
   *  items go one way and $WOC the other. */
  staged: readonly InvSlot[];
  /** What the OTHER player has staged, which is what you are paying for. */
  theirStaged: readonly InvSlot[];
  items: Readonly<Record<string, ItemDef>>;
  mode: WocTradeMode;
  /** The USD the seller typed, in cents. Null when the field is empty. */
  usdCents: number | null;
  /** Server passthroughs for `usdCents`; null while unquoted or unavailable. */
  tokens: number | null;
  split: WocTradeSplit | null;
  /**
   * The live offer standing between these two players, if one has been sent.
   *
   * While it exists the arm stops being a form and becomes a REVIEW surface:
   * both sides see the same price, and each gets the action that is theirs. The
   * trade window deliberately stays open across this, because reviewing and
   * agreeing IS the trade, and closing it would leave both players guessing.
   */
  pendingOffer: WocPendingOffer | null;
  /**
   * True once gold sits on the table from EITHER side.
   *
   * Either, not just your own: the two currencies are exclusive for the whole
   * trade, not per player, and a rule that only watched your own side let one
   * player put gold down while the other was still offered the $WOC arm. The
   * pair would then have agreed a deal neither half could carry.
   */
  goldOffered: boolean;
  /**
   * The VERIFIED wallet's $WOC balance, or null when it is not known.
   *
   * Null is deliberately NOT treated as zero. The balance is fetched
   * asynchronously and can be absent for reasons that say nothing about what the
   * player holds (still loading, an RPC blip, a wallet connected but not yet
   * linked). Refusing the offer then would block a player who can perfectly well
   * pay, on no evidence. The server re-checks the balance at payment time and is
   * the authority; this only stops the obviously-doomed offer before two people
   * spend a round trip agreeing to it.
   */
  walletTokens: number | null;
  /**
   * Whether the counterparty lookup has produced an answer yet.
   *
   * Separate from `partner` being non-null on purpose. A null partner is
   * ambiguous: it is both "still asking" and "asked, and there is no such
   * character". Only the caller knows which, so it tells us, and an
   * unanswered lookup never accuses the other player of anything.
   */
  partnerResolved: boolean;
}

export interface WocTradeModel {
  /** Whether to render the $WOC toggle at all. */
  armVisible: boolean;
  /** Why it is unavailable, when it is not offerable. Null means offerable. */
  block: WocArmBlock | null;
  /** The i18n key for the block message, or null. Typed, not a bare
   *  string, so the painter renders it through t() with no cast. */
  blockKey: TranslationKey | null;
  mode: WocTradeMode;
  /** Staged items that may legally be sold for $WOC. */
  eligible: readonly InvSlot[];
  /** Staged items that may not, so the window can say which and why. */
  ineligible: readonly InvSlot[];
  /** Whether the coin INPUTS must be disabled (the two currencies are
   *  exclusive). Covers composing a $WOC price as well as a standing deal; the
   *  Gold TAB is gated by wocDealStanding instead. */
  goldDisabled: boolean;
  /**
   * Whether a $WOC deal is standing for either side.
   *
   * ONE cause with two effects, which is why it is one flag: the Gold tab is
   * disabled and the coin inputs come off screen entirely. Distinct from
   * goldDisabled, which also covers merely COMPOSING a price: the tab must stay
   * live then, or a player who opened the $WOC arm to look at it can never get
   * back to gold.
   */
  wocDealStanding: boolean;
  /** Whether the $WOC field must be disabled. */
  wocDisabled: boolean;
  /** Whether the quoted amount exceeds the wallet's balance, so the figure can
   *  be shown as the problem it is rather than as an ordinary estimate. */
  insufficientBalance: boolean;
  tokens: number | null;
  split: WocTradeSplit | null;
  /** The live offer to review, or null while none is standing. */
  pendingOffer: WocPendingOffer | null;
  /** Whether the SELLER may accept the standing offer (they hold the goods). */
  canAccept: boolean;
  /** Whether the BUYER may start paying: escrow is done and it is their turn. */
  canPay: boolean;
  /** Whether "Send offer" may be pressed. */
  canSend: boolean;
  /** The i18n key explaining why it may not, or null when it may. */
  sendHint: TranslationKey | null;
  /** The exact copy the offer pins (H10): the partner's ONE eligible staged
   *  item, or null while the table is empty or ambiguous. Non-null whenever
   *  canSend is true, by the hint ladder's one_item arm. */
  agreedItem: InvSlot | null;
  /**
   * What the standing deal is doing, in words, for the VIEWER's side. Null when
   * there is nothing to say (no offer, or the offer is theirs to act on and the
   * button already says so).
   *
   * Per role, not just per phase: while a payment confirms, the buyer is waiting
   * on their own transaction and the seller is waiting on someone else's, and
   * one sentence cannot honestly describe both.
   */
  statusKey: TranslationKey | null;
  /** Whether to show the pending indicator beside that line. */
  busy: boolean;
}

/** The status line per phase and side. Only the states where SOMETHING is
 *  happening that the player cannot act on need one. */
const STATUS_KEYS: Partial<Record<`${WocOfferPhase}:${'buyer' | 'seller'}`, TranslationKey>> = {
  'awaiting_payment:seller': 'hudChrome.trade.woc.statusAwaitingBuyer',
  'paying:buyer': 'hudChrome.trade.woc.statusPayingBuyer',
  'paying:seller': 'hudChrome.trade.woc.statusPayingSeller',
};

const BLOCK_KEYS: Record<WocArmBlock, TranslationKey> = {
  market_disabled: 'hudChrome.trade.woc.blockDisabled',
  no_wallet: 'hudChrome.trade.woc.blockNoWallet',
  partner_unknown: 'hudChrome.trade.woc.blockPartnerUnknown',
  recipient_no_wallet: 'hudChrome.trade.woc.blockRecipientNoWallet',
};

const SEND_HINT_KEYS: Record<WocSendHint, TranslationKey> = {
  clear_your_items: 'hudChrome.trade.woc.hintClearYourItems',
  await_their_items: 'hudChrome.trade.woc.hintAwaitTheirItems',
  one_item: 'hudChrome.trade.woc.hintOneItem',
  enter_price: 'hudChrome.trade.woc.hintEnterPrice',
  gold_offered: 'hudChrome.trade.woc.hintGoldOffered',
  insufficient_balance: 'hudChrome.trade.woc.hintInsufficientBalance',
};

/**
 * Whether one staged slot may be sold for $WOC.
 *
 * Shares `exchangeHardLock` / `exchangeItemCategory` with the server's
 * eligibility policy and the sim's escrow extraction, so the window cannot
 * offer something the server would refuse. It is deliberately the CATEGORY test
 * only: the quality floor is policy the server owns and may retune, and a
 * client copy of it would drift.
 */
export function wocTradableSlot(slot: InvSlot, items: Readonly<Record<string, ItemDef>>): boolean {
  const def = items[slot.itemId];
  if (!def) return false;
  if (exchangeHardLock(def, slot.instance)) return false;
  // 'other' is the taxonomy's CLOSED default, not an absent value: anything it
  // does not recognize is deliberately not tradable. Testing against null here
  // instead would be vacuously true and offer every item in the game.
  return exchangeItemCategory(def) !== 'other';
}

/**
 * Where a staged slot lives in the player's INVENTORY.
 *
 * The escrow extraction keys on an inventory index (ExtractRef.index), while the
 * trade window works in its own staged array. Passing the staged position
 * straight through is the bug this exists to prevent: with one item staged it
 * reads as index 0, which extracts whatever happens to sit first in the bags,
 * and the mismatch refuses the whole sale.
 *
 * Matched on id AND per-instance payload through the sim's ORDER-INDEPENDENT
 * structural comparator, never a JSON.stringify key: since staged slots carry
 * real payloads (the per-copy staging), this comparison decides whether an
 * instanced directed sale can resolve at all, and stringify would silently
 * depend on key insertion order surviving every clone and wire hop. Returns
 * -1 when the slot cannot be found, which the caller must treat as "do not
 * send", never as index 0.
 */
export function inventoryIndexOfStaged(inventory: readonly InvSlot[], staged: InvSlot): number {
  return inventory.findIndex(
    (s) =>
      s.itemId === staged.itemId &&
      (s.instance === undefined) === (staged.instance === undefined) &&
      (s.instance === undefined ||
        itemInstancePayloadsEqual(s.instance, staged.instance as ItemInstancePayload)),
  );
}

/** The trade window's $WOC arm, as a function of its inputs. */
export function buildWocTradeModel(input: WocTradeInput): WocTradeModel {
  // Eligibility is about what you are BUYING, so it reads the other side.
  const eligible = input.theirStaged.filter((s) => wocTradableSlot(s, input.items));
  const ineligible = input.theirStaged.filter((s) => !wocTradableSlot(s, input.items));

  // Order matters, and it is "what can this player act on". A missing exchange
  // is nobody's fault; your own wallet is yours to fix; theirs is the message
  // the requester asked for by name. Reporting the recipient first would tell a
  // player to go and ask someone else when their own wallet is the problem.
  const block: WocArmBlock | null = !input.marketEnabled
    ? 'market_disabled'
    : !input.selfWalletVerified
      ? 'no_wallet'
      : // "We have not been told yet" is its OWN state, ahead of the accusation.
        // Collapsing the two says something false about the other player on any
        // slow, failed, or unsupported lookup.
        !input.partnerResolved
        ? 'partner_unknown'
        : !input.partner?.walletVerified
          ? 'recipient_no_wallet'
          : null;

  const offerable = block === null;
  const wocMode = offerable && input.mode === 'woc';

  // Shared with the Exchange's bid and buy-now gates: the fail-open semantics
  // are the subtle part, and one definition is what stops them drifting.
  const shortfall = overWalletBalance(input.tokens, input.walletTokens);

  // Ordered the way a seller does the work: pick the item, then price it. Gold
  // comes first because it makes the whole arm unusable rather than incomplete.
  // Ordered the way a buyer hits them: clear your own side, wait for goods, then
  // price them. Gold comes first because it makes the arm unusable outright.
  const hint: WocSendHint | null = input.goldOffered
    ? 'gold_offered'
    : input.staged.length > 0
      ? 'clear_your_items'
      : eligible.length === 0
        ? 'await_their_items'
        : // An offer pins EXACTLY ONE copy (H10: the server refuses acceptance
          // of any copy but the pinned one), so the WHOLE table must hold
          // exactly one single-unit slot: a second eligible item, a stack of
          // several units, or even an ineligible companion beside the real
          // one is ambiguous about what the price buys (the buyer sees a
          // full table while the deal covers one copy). Silently pinning
          // one slot would be the bait-and-switch surface inverted.
          input.theirStaged.length > 1 || (eligible[0]?.count ?? 1) !== 1
          ? 'one_item'
          : input.usdCents === null || input.usdCents <= 0
            ? 'enter_price'
            : shortfall
              ? 'insufficient_balance'
              : null;

  return {
    // The arm stays VISIBLE while blocked: hiding it would leave a player who
    // expected to trade for $WOC with no explanation of why they cannot, which
    // is the case the "recipient must connect a wallet" copy exists to answer.
    armVisible: input.marketEnabled,
    block,
    blockKey: block === null ? null : BLOCK_KEYS[block],
    mode: wocMode ? 'woc' : 'gold',
    eligible,
    ineligible,
    // Mutual exclusivity is enforced here as a DISPLAY rule only. The structural
    // guarantee is elsewhere and stronger: a $WOC deal is a directed listing,
    // which has no copper field at all, so no reachable state carries both.
    //
    // A STANDING offer closes gold for BOTH players, not just the one composing
    // it: the deal on the table is priced in $WOC, and the other side being
    // able to add coin to it would offer them a trade the settlement cannot
    // carry.
    goldDisabled: wocMode || input.pendingOffer !== null,
    // Hidden rather than merely greyed once a deal is standing. A disabled coin
    // field still reads as part of the offer, and the money row above it is
    // already showing the agreed $WOC figure, so leaving three dead inputs under
    // it invites the question of which number counts.
    wocDealStanding: input.pendingOffer !== null,
    // Holding items means you are the SELLER in this trade, so the $WOC tab is
    // not yours to use: the requester's rule that the button is disabled once
    // you have an item offered. Gold from EITHER side closes it too.
    wocDisabled: !offerable || input.goldOffered || input.staged.length > 0,
    insufficientBalance: shortfall,
    tokens: wocMode ? input.tokens : null,
    split: wocMode ? input.split : null,
    pendingOffer: input.pendingOffer,
    // Only the seller accepts, and only with something eligible on the table:
    // acceptance is what escrows the goods, so there must be goods.
    canAccept:
      input.pendingOffer?.phase === 'review' &&
      input.pendingOffer.role === 'seller' &&
      input.staged.filter((s) => wocTradableSlot(s, input.items)).length > 0,
    // Only the buyer pays, and only once the goods are actually in escrow: a pay
    // button before that would take money for an item still in someone's bags.
    canPay:
      input.pendingOffer?.phase === 'awaiting_payment' &&
      input.pendingOffer.role === 'buyer' &&
      input.pendingOffer.listingId !== null,
    // A standing offer replaces the form: you cannot send a second one over it.
    canSend: wocMode && hint === null && input.pendingOffer === null,
    sendHint: wocMode && hint !== null ? SEND_HINT_KEYS[hint] : null,
    agreedItem:
      input.theirStaged.length === 1 && eligible.length === 1 && eligible[0].count === 1
        ? eligible[0]
        : null,
    statusKey:
      input.pendingOffer === null
        ? null
        : (STATUS_KEYS[`${input.pendingOffer.phase}:${input.pendingOffer.role}`] ?? null),
    // Only the payment itself spins. Waiting on the other player to press a
    // button is not progress and must not look like it, or every wait reads as
    // "something is happening" and the player never knows when to act.
    busy: input.pendingOffer?.phase === 'paying',
  };
}
