// The screened payment-verdict vocabulary's player copy
// (src/ui/woc_market_reason_text.ts): word-to-text, with a generic fallback in
// each direction so an unlearned service word never leaks a machine token.

import { describe, expect, it } from 'vitest';
import { wocPaymentPendingText, wocSettlementFailText } from '../src/ui/woc_market_reason_text';

describe('wocPaymentPendingText', () => {
  it('distinguishes the three pending kinds by name', () => {
    expect(wocPaymentPendingText('awaiting_finality')).toBe(
      'Payment seen on the ledger. Waiting for final confirmation.',
    );
    expect(wocPaymentPendingText('not_yet_visible')).toBe(
      'No payment is visible on the ledger yet. It can take a moment to appear.',
    );
    expect(wocPaymentPendingText('service_unavailable')).toBe(
      'The payment service is unreachable. Your payment stays recorded and will be re-checked.',
    );
  });

  it('answers the generic line for anything else, never the raw word', () => {
    const generic = 'Your payment is submitted and awaiting confirmation.';
    expect(wocPaymentPendingText('other')).toBe(generic);
    expect(wocPaymentPendingText('dev_chain_unknown_memo')).toBe(generic);
    expect(wocPaymentPendingText(null)).toBe(generic);
    expect(wocPaymentPendingText(undefined)).toBe(generic);
    expect(wocPaymentPendingText('other')).not.toContain('other');
  });
});

describe('wocSettlementFailText', () => {
  it('explains the four verifier verdicts by name', () => {
    expect(wocSettlementFailText('burn_missing')).toBe(
      'The payment did not include the required token burn.',
    );
    expect(wocSettlementFailText('burn_mismatch')).toBe(
      'The payment burned the wrong token amount.',
    );
    expect(wocSettlementFailText('burn_authority_mismatch')).toBe(
      'The token burn came from a wallet this purchase did not name.',
    );
    expect(wocSettlementFailText('unexpected_credit')).toBe(
      'The transaction paid a wallet outside this purchase.',
    );
  });

  it('answers the generic line for any other word and null for no reason', () => {
    const generic = 'The payment did not match this purchase.';
    expect(wocSettlementFailText('leg_mismatch')).toBe(generic);
    expect(wocSettlementFailText('other')).toBe(generic);
    expect(wocSettlementFailText(null)).toBeNull();
    expect(wocSettlementFailText(undefined)).toBeNull();
  });
});
