// The woc-market half of the desktop browser-signing path (issue #3692): the
// Exchange's quotes and step-up challenges are pre-registered here so the
// desktop-wallet handoff routes (server/wallet.ts) can mint a browser handoff
// for them by reference/nonce, exactly the claudium_proxy precedent for
// native quotes. Registration is BEST-EFFORT and never fails the issuing
// call: a full store only disables the desktop signing arm for that quote or
// challenge (the player re-quotes or retries), while browser web is
// unaffected. The store is process-local and prunes on its own TTLs.
import type {
  DesktopWalletStepUpAuthorization,
  DesktopWalletTransactionAuthorization,
} from './desktop_wallet_handoff';
import type { WocQuoteIntent } from './woc_market';

/** The slice of the handoff store the woc-market service registers into
 *  (WocMarketDeps.desktopHandoff; main.ts wires the process singleton). */
export interface WocDesktopHandoffRegistrar {
  authorizeTransaction(
    accountId: number,
    authorization: DesktopWalletTransactionAuthorization,
  ): void;
  authorizeStepUp(accountId: number, authorization: DesktopWalletStepUpAuthorization): void;
}

/** Register one payable quote for the desktop browser-signing path. A quote
 *  that is not ok, needs no signature (the dev economy), or lacks any of the
 *  reference/transaction/expiry legs registers nothing. */
export function registerWocQuoteHandoff(
  registrar: WocDesktopHandoffRegistrar | undefined,
  accountId: number,
  buyerWallet: string,
  intent: WocQuoteIntent,
): void {
  if (!registrar || !intent.ok || !intent.signatureRequired) return;
  if (intent.reference === null || intent.transactionBase64 === null) return;
  if (intent.expiresAtMs === null) return;
  try {
    registrar.authorizeTransaction(accountId, {
      reference: intent.reference,
      transactionBase64: intent.transactionBase64,
      expectedAddress: buyerWallet,
      rail: 'woc',
      // The transfer splits across seller/burn/treasury legs; the single
      // informational amount is the buyer's total, when the service sent one.
      amountBase: intent.amount?.base ?? null,
      destination: null,
      expiresAtMs: intent.expiresAtMs,
    });
  } catch (err) {
    console.warn('[woc-market] desktop quote handoff registration failed', err);
  }
}

/** Register one issued step-up challenge for the desktop browser-signing
 *  path. The dev-economy devsig arm (signatureRequired false) never needs a
 *  wallet, so it registers nothing. */
export function registerWocStepUpHandoff(
  registrar: WocDesktopHandoffRegistrar | undefined,
  accountId: number,
  wallet: string,
  challenge: { nonce: string; message: string; expiresAtMs: number; signatureRequired: boolean },
): void {
  if (!registrar || !challenge.signatureRequired) return;
  try {
    registrar.authorizeStepUp(accountId, {
      nonce: challenge.nonce,
      message: challenge.message,
      expectedAddress: wallet,
      expiresAtMs: challenge.expiresAtMs,
    });
  } catch (err) {
    console.warn('[woc-market] desktop step-up handoff registration failed', err);
  }
}
