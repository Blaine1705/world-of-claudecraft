// Localizes the $WOC Exchange's SCREENED payment-verdict vocabulary into
// player text. The server never sends English here: the confirm responses and
// the settlement views carry a word from the pinned wire vocabulary
// (server/woc_market_rules.ts screens it; an unknown service word arrives as
// the stable 'other'), and this module owns the word-to-copy mapping with a
// generic fallback in each direction, so a vocabulary the client has not
// learned yet renders honestly instead of leaking a machine token.
//
// DOM-free and host-agnostic (a Vitest drives it directly), the
// api_error_i18n.ts pattern.

import { type TranslationKey, t } from './i18n';

/** Pending confirm verdicts: WHICH kind of waiting this is. */
const PENDING_KEYS: Readonly<Record<string, TranslationKey>> = {
  // The ledger MATCHED the payment; only finality is outstanding.
  awaiting_finality: 'hudChrome.wocMarket.paymentSeenAwaitingFinality',
  // The ledger has shown nothing for the signature (yet).
  not_yet_visible: 'hudChrome.wocMarket.paymentNotYetVisible',
  // Infrastructure verdict from the game's own proxy, not the chain.
  service_unavailable: 'hudChrome.wocMarket.paymentServiceUnreachable',
};

/** Terminal fail reasons a FAILED settlement row explains to its buyer. */
const FAIL_KEYS: Readonly<Record<string, TranslationKey>> = {
  burn_missing: 'hudChrome.wocMarket.settlementFailBurnMissing',
  burn_mismatch: 'hudChrome.wocMarket.settlementFailBurnMismatch',
  burn_authority_mismatch: 'hudChrome.wocMarket.settlementFailBurnAuthority',
  unexpected_credit: 'hudChrome.wocMarket.settlementFailUnexpectedCredit',
};

/** The word-to-key maps, exported for the vocabulary drift pin: the test
 *  asserts every mapped word is a member of the server wire vocabulary and
 *  pins the deliberately-generic remainder. */
export const WOC_MARKET_REASON_TEXT_KEYS = { pending: PENDING_KEYS, fail: FAIL_KEYS } as const;

/** Player copy for a pending confirm answer; generic when the word is new. */
export function wocPaymentPendingText(reason: string | null | undefined): string {
  const key = reason == null ? undefined : PENDING_KEYS[reason];
  return t(key ?? 'hudChrome.wocMarket.paymentPendingGeneric');
}

/**
 * Player copy for a failed settlement's verdict, or null when there is no
 * reason to explain. Callers gate on state === 'failed': an EXPIRED row keeps
 * a failReason too (a chain-refused try is preserved across expiry), but its
 * row label already says "expired unpaid" and a mismatch line under it would
 * accuse a buyer who simply walked away.
 */
export function wocSettlementFailText(reason: string | null | undefined): string | null {
  if (reason == null) return null;
  return t(FAIL_KEYS[reason] ?? 'hudChrome.wocMarket.settlementFailGeneric');
}
