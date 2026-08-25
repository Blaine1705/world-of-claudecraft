// The parked-review settlement operator arm (the runbook's pre-enable gate):
// an operator who has verified the payment reference on chain drives the one
// pair of transitions the sweep never takes on its own,
// review -> confirmed (paid: the delivery claim sweep resumes from there) or
// review -> failed (unpaid: the overdue default pass takes over). Hand SQL is
// forbidden for this exact move because it would bypass the transition CAS;
// this module IS the sanctioned surface, built on that same CAS.
import type { WocSettlementState } from './woc_market_rules';

export type WocReviewVerdict = 'paid' | 'unpaid';

/** The stored fail_reason an unpaid ruling stamps. Deliberately NOT in
 *  WOC_MARKET_WIRE_FAIL_REASONS: on the wire it screens to 'other' (the
 *  listed screening contract), while the row keeps the precise operator
 *  provenance a later forensic read needs. */
export const REVIEW_UNPAID_FAIL_REASON = 'review_unpaid';

/** The narrow slice of the market db this arm touches. transitionSettlement
 *  is the shared CAS (state = ANY(from) guards every caller identically);
 *  settlementById only diagnoses a CAS miss into the two operator answers. */
export interface WocReviewResolutionDb {
  transitionSettlement(
    id: number,
    from: WocSettlementState[],
    to: WocSettlementState,
    failReason?: string,
  ): Promise<boolean>;
  settlementById(id: number): Promise<{ state: WocSettlementState } | null>;
}

export type WocReviewResolution =
  | { ok: true; to: 'confirmed' | 'failed' }
  | { ok: false; reason: 'not_found' | 'contended' };

/**
 * Rule on a settlement the overdue sweep parked in 'review'.
 *
 * paid: review -> confirmed. The fail_reason is left untouched on purpose
 * (transitionSettlement COALESCEs it), so a resolved row keeps its
 * 'confirming_overdue' park fingerprint: a confirmed settlement that went
 * through operator review stays distinguishable from one the chain confirmed
 * on time. The delivery sweep claims confirmed rows on its own clock, so
 * delivery needs no extra kick here.
 *
 * unpaid: review -> failed with the review_unpaid provenance stamp; the
 * overdue default pass takes the row from 'failed' exactly as it does for a
 * chain-refused confirmation.
 *
 * A CAS miss answers one of the two operator truths: the row never existed
 * (not_found) or another operator's verdict already moved it (contended:
 * only these arms move a row OUT of review, so a lost race is the sole way
 * a live row misses).
 */
export async function resolveReviewSettlement(
  db: WocReviewResolutionDb,
  id: number,
  verdict: WocReviewVerdict,
): Promise<WocReviewResolution> {
  const to = verdict === 'paid' ? 'confirmed' : 'failed';
  const moved = await db.transitionSettlement(
    id,
    ['review'],
    to,
    verdict === 'unpaid' ? REVIEW_UNPAID_FAIL_REASON : undefined,
  );
  if (moved) return { ok: true, to };
  const row = await db.settlementById(id);
  return { ok: false, reason: row === null ? 'not_found' : 'contended' };
}
