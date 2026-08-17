// The step-up challenge protocol's pure core (server/woc_market_stepup.ts):
// binding digest completeness, the signed-message contract, and the
// verifyStepUpProof refusal ladder, all against REAL ed25519 signatures
// (@noble/curves, the same library verifySolanaSignature uses), never a
// stubbed verifier. The store semantics (atomic single-use, cross-account
// isolation, prune) are the pg suite's job
// (tests/woc_market_stepup_pg_integration.test.ts).

import { ed25519 } from '@noble/curves/ed25519';
import bs58 from 'bs58';
import { describe, expect, it } from 'vitest';
import { buildLinkMessage } from '../../server/wallet_link';
import {
  buildStepUpMessage,
  newStepUpNonce,
  stepUpBindingDigest,
  verifyStepUpProof,
  WOC_MARKET_STEPUP_TTL_MS,
  type WocStepUpBinding,
  type WocStepUpChallengeRow,
} from '../../server/woc_market_stepup';

// Deterministic keypair: a fixed 32-byte seed, so a failure reproduces.
const PRIV = new Uint8Array(32).fill(7);
const PUB = ed25519.getPublicKey(PRIV);
const WALLET = bs58.encode(PUB);
const OTHER_PRIV = new Uint8Array(32).fill(9);

const ACCOUNT = 41;
const NOW = 1_755_000_000_000;

const LIST_BINDING: WocStepUpBinding = {
  operation: 'create_listing',
  itemId: 'valorplate_chest',
  format: 'auction_buy_now',
  startCents: 5000,
  reserveCents: 6000,
  buyNowCents: 9000,
  durationHours: 12,
};

const ACCEPT_BINDING: WocStepUpBinding = {
  operation: 'accept_directed_offer',
  offerId: 311,
  itemId: 'valorplate_chest',
  usdCents: 7500,
};

function signB58(message: string, priv: Uint8Array = PRIV): string {
  return bs58.encode(ed25519.sign(new TextEncoder().encode(message), priv));
}

function challengeRow(
  binding: WocStepUpBinding = LIST_BINDING,
  over: Partial<WocStepUpChallengeRow> = {},
): WocStepUpChallengeRow {
  const nonce = over.nonce ?? newStepUpNonce();
  const expiresAtMs = over.expiresAtMs ?? NOW + WOC_MARKET_STEPUP_TTL_MS;
  return {
    nonce,
    accountId: ACCOUNT,
    wallet: WALLET,
    operation: binding.operation,
    bindingDigest: stepUpBindingDigest(binding),
    message: buildStepUpMessage({
      binding,
      accountId: ACCOUNT,
      wallet: WALLET,
      nonce,
      expiresAtIso: new Date(expiresAtMs).toISOString(),
    }),
    expiresAtMs,
    ...over,
  };
}

function verify(
  row: WocStepUpChallengeRow | null,
  over: Partial<Parameters<typeof verifyStepUpProof>[0]> = {},
): ReturnType<typeof verifyStepUpProof> {
  return verifyStepUpProof({
    row,
    proof: { nonce: row?.nonce ?? 'unknown', signature: row ? signB58(row.message) : 'x' },
    expectedDigest: stepUpBindingDigest(LIST_BINDING),
    accountId: ACCOUNT,
    currentWallet: WALLET,
    nowMs: NOW,
    devSig: false,
    ...over,
  });
}

describe('the binding digest covers every figure the wallet showed', () => {
  it('is stable for an identical binding and hex-shaped', () => {
    expect(stepUpBindingDigest(LIST_BINDING)).toBe(stepUpBindingDigest({ ...LIST_BINDING }));
    expect(stepUpBindingDigest(LIST_BINDING)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('moves when ANY listing member moves, each on its own', () => {
    // Every member is load-bearing: dropping one from the canonical string
    // reopens a replay lane onto a different value of that member (the
    // start-price-only binding would have let a thief add a 25-cent buy-now).
    const base = stepUpBindingDigest(LIST_BINDING);
    const variants: WocStepUpBinding[] = [
      { ...LIST_BINDING, itemId: 'other_item' },
      { ...LIST_BINDING, format: 'auction' },
      { ...LIST_BINDING, startCents: 5001 },
      { ...LIST_BINDING, reserveCents: 6001 },
      { ...LIST_BINDING, reserveCents: null },
      { ...LIST_BINDING, buyNowCents: 9001 },
      { ...LIST_BINDING, buyNowCents: null },
      { ...LIST_BINDING, durationHours: 13 },
    ];
    for (const v of variants) expect(stepUpBindingDigest(v), JSON.stringify(v)).not.toBe(base);
  });

  it('moves when any directed-accept member moves, and across operations', () => {
    const base = stepUpBindingDigest(ACCEPT_BINDING);
    expect(stepUpBindingDigest({ ...ACCEPT_BINDING, offerId: 312 })).not.toBe(base);
    expect(stepUpBindingDigest({ ...ACCEPT_BINDING, itemId: 'other_item' })).not.toBe(base);
    expect(stepUpBindingDigest({ ...ACCEPT_BINDING, usdCents: 7501 })).not.toBe(base);
    // The operation tag itself separates the two shapes: a listing challenge
    // can never digest-collide with an accept challenge.
    expect(stepUpBindingDigest(LIST_BINDING)).not.toBe(base);
  });

  it('keeps a null money figure distinct from zero', () => {
    expect(stepUpBindingDigest({ ...LIST_BINDING, reserveCents: null })).not.toBe(
      stepUpBindingDigest({ ...LIST_BINDING, reserveCents: 0 }),
    );
  });
});

describe('the signed message', () => {
  it('names the action, every money figure, the nonce, and the expiry', () => {
    const row = challengeRow();
    expect(row.message).toContain('list valorplate_chest');
    expect(row.message).toContain('$50.00');
    expect(row.message).toContain('$60.00');
    expect(row.message).toContain('$90.00');
    expect(row.message).toContain('12h');
    expect(row.message).toContain(`Nonce: ${row.nonce}`);
    expect(row.message).toContain(new Date(row.expiresAtMs).toISOString());
  });

  it('names the offer and agreed price on the directed arm', () => {
    const row = challengeRow(ACCEPT_BINDING);
    expect(row.message).toContain('accept directed offer #311');
    expect(row.message).toContain('$75.00');
  });

  it('is domain-separated from the wallet-link message', () => {
    // A step-up signature must never verify as a link proof or the reverse;
    // the first line is the separator, so it is pinned distinct.
    const stepFirst = challengeRow().message.split('\n')[0];
    const linkFirst = buildLinkMessage({
      domain: 'play.example',
      accountId: ACCOUNT,
      address: WALLET,
      nonce: 'n',
      issuedAt: new Date(NOW).toISOString(),
    }).split('\n')[0];
    expect(stepFirst).not.toBe(linkFirst);
    expect(stepFirst).toContain('escrow');
    expect(linkFirst).toContain('link');
  });
});

describe('verifyStepUpProof: the refusal ladder', () => {
  it('accepts a real signature over the stored message', () => {
    expect(verify(challengeRow())).toEqual({ ok: true });
  });

  it('answers challenge_invalid for a missing row (unknown, replayed, or foreign nonce)', () => {
    expect(verify(null)).toEqual({ ok: false, reason: 'stepup_challenge_invalid' });
  });

  it('answers the same challenge_invalid for another account, leaking nothing', () => {
    const row = challengeRow();
    expect(verify(row, { accountId: ACCOUNT + 1 })).toEqual({
      ok: false,
      reason: 'stepup_challenge_invalid',
    });
  });

  it('refuses exactly AT the expiry instant, and passes one millisecond before', () => {
    const row = challengeRow();
    expect(verify(row, { nowMs: row.expiresAtMs })).toEqual({
      ok: false,
      reason: 'stepup_challenge_expired',
    });
    expect(verify(row, { nowMs: row.expiresAtMs - 1 })).toEqual({ ok: true });
  });

  it('refuses when the linked wallet changed since issue, or is gone', () => {
    const row = challengeRow();
    const relinked = bs58.encode(ed25519.getPublicKey(OTHER_PRIV));
    expect(verify(row, { currentWallet: relinked })).toEqual({
      ok: false,
      reason: 'stepup_wallet_mismatch',
    });
    expect(verify(row, { currentWallet: null })).toEqual({
      ok: false,
      reason: 'stepup_wallet_mismatch',
    });
  });

  it('refuses a proof bound to a different action, item, or price', () => {
    const row = challengeRow();
    expect(verify(row, { expectedDigest: stepUpBindingDigest(ACCEPT_BINDING) })).toEqual({
      ok: false,
      reason: 'stepup_binding_mismatch',
    });
    expect(
      verify(row, { expectedDigest: stepUpBindingDigest({ ...LIST_BINDING, startCents: 25 }) }),
    ).toEqual({ ok: false, reason: 'stepup_binding_mismatch' });
  });

  it('refuses garbage, a wrong-key signature, and a right-key signature over other bytes', () => {
    const row = challengeRow();
    for (const signature of [
      'not-base58-!!!',
      signB58(row.message, OTHER_PRIV),
      signB58(`${row.message} `),
    ]) {
      expect(verify(row, { proof: { nonce: row.nonce, signature } })).toEqual({
        ok: false,
        reason: 'stepup_signature_invalid',
      });
    }
  });

  it('refuses a signature with one flipped byte', () => {
    const row = challengeRow();
    const good = bs58.decode(signB58(row.message));
    good[0] ^= 0xff;
    expect(verify(row, { proof: { nonce: row.nonce, signature: bs58.encode(good) } })).toEqual({
      ok: false,
      reason: 'stepup_signature_invalid',
    });
  });

  it('accepts devsig ONLY for this nonce and ONLY under the dev switch', () => {
    const row = challengeRow();
    const devProof = { nonce: row.nonce, signature: `devsig:${row.nonce}` };
    expect(verify(row, { devSig: true, proof: devProof })).toEqual({ ok: true });
    expect(
      verify(row, { devSig: true, proof: { nonce: row.nonce, signature: 'devsig:other' } }),
    ).toEqual({ ok: false, reason: 'stepup_signature_invalid' });
    // Production fail-closed: the dev string is not base58 and can never
    // verify as a real signature.
    expect(verify(row, { devSig: false, proof: devProof })).toEqual({
      ok: false,
      reason: 'stepup_signature_invalid',
    });
    // The dev switch loosens nothing else: a real signature still verifies
    // and a wrong binding still refuses under devSig.
    expect(verify(row, { devSig: true })).toEqual({ ok: true });
    expect(verify(row, { devSig: true, proof: devProof, expectedDigest: 'ffff' })).toEqual({
      ok: false,
      reason: 'stepup_binding_mismatch',
    });
  });

  it('pins the refusal order: expiry before wallet before binding before signature', () => {
    // Conjunctive refusals; the order only decides WHICH honest reason the
    // player hears, and the earliest broken rung answers.
    const row = challengeRow();
    const everythingWrong = {
      currentWallet: 'somebody-else',
      expectedDigest: 'ffff',
      proof: { nonce: row.nonce, signature: 'garbage' },
    };
    expect(verify(row, { ...everythingWrong, nowMs: row.expiresAtMs })).toEqual({
      ok: false,
      reason: 'stepup_challenge_expired',
    });
    expect(verify(row, everythingWrong)).toEqual({
      ok: false,
      reason: 'stepup_wallet_mismatch',
    });
    expect(
      verify(row, { expectedDigest: 'ffff', proof: { nonce: row.nonce, signature: 'g' } }),
    ).toEqual({ ok: false, reason: 'stepup_binding_mismatch' });
  });
});

describe('nonce generation', () => {
  it('is 32 hex chars and does not repeat across draws', () => {
    const seen = new Set(Array.from({ length: 64 }, () => newStepUpNonce()));
    expect(seen.size).toBe(64);
    for (const nonce of seen) expect(nonce).toMatch(/^[0-9a-f]{32}$/);
  });
});
