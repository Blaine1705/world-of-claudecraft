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
import type { InvSlot, ItemDef } from '../sim/types';
import type { TranslationKey } from './i18n.catalog';

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
  | 'stage_item' // your own side is empty (you are the one selling)
  | 'no_eligible' // you staged something, but none of it may be sold for $WOC
  | 'enter_price'
  | 'gold_offered';

export interface WocTradeInput {
  marketEnabled: boolean;
  selfWalletVerified: boolean;
  partner: WocTradePartner | null;
  /** The items the seller has staged in the trade window. */
  staged: readonly InvSlot[];
  items: Readonly<Record<string, ItemDef>>;
  mode: WocTradeMode;
  /** The USD the seller typed, in cents. Null when the field is empty. */
  usdCents: number | null;
  /** Server passthroughs for `usdCents`; null while unquoted or unavailable. */
  tokens: number | null;
  split: WocTradeSplit | null;
  /** True once the seller's gold offer is non-zero. */
  goldOffered: boolean;
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
  /** Whether the gold field must be disabled (the two are exclusive). */
  goldDisabled: boolean;
  /** Whether the $WOC field must be disabled. */
  wocDisabled: boolean;
  tokens: number | null;
  split: WocTradeSplit | null;
  /** Whether "Send offer" may be pressed. */
  canSend: boolean;
  /** The i18n key explaining why it may not, or null when it may. */
  sendHint: TranslationKey | null;
}

const BLOCK_KEYS: Record<WocArmBlock, TranslationKey> = {
  market_disabled: 'hudChrome.trade.woc.blockDisabled',
  no_wallet: 'hudChrome.trade.woc.blockNoWallet',
  partner_unknown: 'hudChrome.trade.woc.blockPartnerUnknown',
  recipient_no_wallet: 'hudChrome.trade.woc.blockRecipientNoWallet',
};

const SEND_HINT_KEYS: Record<WocSendHint, TranslationKey> = {
  stage_item: 'hudChrome.trade.woc.hintStageItem',
  no_eligible: 'hudChrome.trade.woc.hintNoEligible',
  enter_price: 'hudChrome.trade.woc.hintEnterPrice',
  gold_offered: 'hudChrome.trade.woc.hintGoldOffered',
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

/** The trade window's $WOC arm, as a function of its inputs. */
export function buildWocTradeModel(input: WocTradeInput): WocTradeModel {
  const eligible = input.staged.filter((s) => wocTradableSlot(s, input.items));
  const ineligible = input.staged.filter((s) => !wocTradableSlot(s, input.items));

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

  // Ordered the way a seller does the work: pick the item, then price it. Gold
  // comes first because it makes the whole arm unusable rather than incomplete.
  const hint: WocSendHint | null = input.goldOffered
    ? 'gold_offered'
    : input.staged.length === 0
      ? 'stage_item'
      : eligible.length === 0
        ? 'no_eligible'
        : input.usdCents === null || input.usdCents <= 0
          ? 'enter_price'
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
    goldDisabled: wocMode,
    wocDisabled: !offerable || input.goldOffered,
    tokens: wocMode ? input.tokens : null,
    split: wocMode ? input.split : null,
    canSend: wocMode && hint === null,
    sendHint: wocMode && hint !== null ? SEND_HINT_KEYS[hint] : null,
  };
}
