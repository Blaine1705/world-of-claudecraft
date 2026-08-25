// The parked-review operator arm (server/woc_market_review_resolution.ts):
// the sanctioned surface for the one transition pair the sweep never drives,
// review -> confirmed (paid) / review -> failed (unpaid). These pins hold the
// arm to the CAS contract: the from-set is exactly ['review'], the unpaid
// ruling stamps its provenance, the paid ruling keeps the park fingerprint,
// and a CAS miss answers the two operator truths apart.
import { describe, expect, it } from 'vitest';
import {
  REVIEW_UNPAID_FAIL_REASON,
  resolveReviewSettlement,
  type WocReviewResolutionDb,
} from '../../server/woc_market_review_resolution';
import {
  validSettlementTransition,
  WOC_MARKET_WIRE_FAIL_REASONS,
  type WocSettlementState,
} from '../../server/woc_market_rules';

interface TransitionCall {
  id: number;
  from: WocSettlementState[];
  to: WocSettlementState;
  failReason: string | undefined;
}

function fakeDb(opts: { moved: boolean; row: { state: WocSettlementState } | null }): {
  db: WocReviewResolutionDb;
  calls: TransitionCall[];
  lookups: number[];
} {
  const calls: TransitionCall[] = [];
  const lookups: number[] = [];
  return {
    calls,
    lookups,
    db: {
      transitionSettlement: async (id, from, to, failReason) => {
        calls.push({ id, from, to, failReason });
        return opts.moved;
      },
      settlementById: async (id) => {
        lookups.push(id);
        return opts.row;
      },
    },
  };
}

describe('the parked-review settlement operator arm', () => {
  it('both operator arms are legal transitions in the rules table', () => {
    // The module and the state machine must agree; if the rules table ever
    // drops an arm, this fails here instead of as a silent CAS miss in ops.
    expect(validSettlementTransition('review', 'confirmed')).toBe(true);
    expect(validSettlementTransition('review', 'failed')).toBe(true);
  });

  it('paid rules review -> confirmed through the CAS, keeping the park fingerprint', async () => {
    const { db, calls, lookups } = fakeDb({ moved: true, row: null });
    const out = await resolveReviewSettlement(db, 41, 'paid');
    expect(out).toEqual({ ok: true, to: 'confirmed' });
    expect(calls).toEqual([
      // failReason undefined: transitionSettlement COALESCEs, so the row
      // keeps 'confirming_overdue' as its went-through-review provenance.
      { id: 41, from: ['review'], to: 'confirmed', failReason: undefined },
    ]);
    expect(lookups).toEqual([]);
  });

  it('unpaid rules review -> failed with the review_unpaid provenance stamp', async () => {
    const { db, calls } = fakeDb({ moved: true, row: null });
    const out = await resolveReviewSettlement(db, 42, 'unpaid');
    expect(out).toEqual({ ok: true, to: 'failed' });
    expect(calls).toEqual([
      { id: 42, from: ['review'], to: 'failed', failReason: REVIEW_UNPAID_FAIL_REASON },
    ]);
  });

  it('a CAS miss on a live row answers contended (a lost operator race)', async () => {
    const { db, lookups } = fakeDb({ moved: false, row: { state: 'confirmed' } });
    const out = await resolveReviewSettlement(db, 43, 'paid');
    expect(out).toEqual({ ok: false, reason: 'contended' });
    expect(lookups).toEqual([43]);
  });

  it('a CAS miss on a missing row answers not_found', async () => {
    const { db } = fakeDb({ moved: false, row: null });
    const out = await resolveReviewSettlement(db, 44, 'unpaid');
    expect(out).toEqual({ ok: false, reason: 'not_found' });
  });

  it('review_unpaid stays OFF the wire fail-reason list, screening to other', () => {
    // The stored word is operator forensics; the wire deliberately screens it
    // (unknown words -> 'other'). Listing it would create client i18n copy
    // obligations, so a future addition must be a deliberate change here.
    expect(WOC_MARKET_WIRE_FAIL_REASONS).not.toContain(REVIEW_UNPAID_FAIL_REASON);
  });
});
