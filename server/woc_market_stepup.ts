// Wallet-signature step-up for the $WOC Exchange's custody-moving operations
// (B6/R1): createListing and the seller side of acceptDirectedOffer require a
// fresh server-issued challenge signed by the account's LINKED wallet, so a
// stolen session bearer alone can no longer move item custody.
//
// Protocol shape (the wallet_link_challenges rules, tightened):
// - The server builds and stores the FULL signed message; the client can never
//   choose what gets signed, and the wallet popup shows the player exactly
//   which action and which money figures they are authorizing.
// - Single-use: consuming a challenge deletes its row atomically (DELETE ...
//   RETURNING under the nonce primary key), so two operations racing one
//   challenge resolve to exactly one verification; a failed verification has
//   still consumed it, which keeps a challenge from ever serving as a retry
//   oracle for probing bindings.
// - Bound, not bearer-shaped: the challenge stores a digest over the operation
//   and EVERY money figure the wallet showed (item, format, start, reserve,
//   buy-now, duration; offer id and agreed price on the directed arm), so a
//   signature can never replay onto a different action, item, or price.
// - Expiry is judged from the consumed row rather than inside the SQL WHERE
//   (a deliberate deviation from consumeWalletChallenge): an expired challenge
//   answers its own honest refusal instead of reading as unknown.
// - The verifier checks the CURRENT linked wallet against the one the
//   challenge was issued to, so an unlink-relink between issue and use
//   refuses (the same live re-read rule the directed rail's wallet twins use).
//
// This module is deliberately a sibling of server/woc_market.ts (the
// coordinator must not grow) and holds no SQL: the store lives behind the
// WocMarketDb seam so the service tests run on the in-memory fake and the pg
// suite proves the real predicates.

import { createHash, randomBytes } from 'node:crypto';
import { verifySolanaSignature } from './wallet_link';

/** Challenge lifetime. Five minutes: the flow is immediate (the wallet popup
 *  is already open), shorter-lived than the ten-minute link challenge because
 *  a custody authorization should not outlive the player's attention. */
export const WOC_MARKET_STEPUP_TTL_MS = 5 * 60 * 1000;

export type WocStepUpOperation = 'create_listing' | 'accept_directed_offer';

/** What a challenge authorizes: the operation plus every figure the wallet
 *  showed. The digest over this is the ONE binding judge; the row's operation
 *  column is observability only and deliberately not a second comparator. */
export type WocStepUpBinding =
  | {
      operation: 'create_listing';
      itemId: string;
      format: string;
      startCents: number;
      reserveCents: number | null;
      buyNowCents: number | null;
      durationHours: number;
    }
  | {
      operation: 'accept_directed_offer';
      offerId: number;
      itemId: string;
      usdCents: number;
    };

export type WocStepUpProof = { nonce: string; signature: string };

export interface WocStepUpChallengeRow {
  nonce: string;
  accountId: number;
  wallet: string;
  operation: WocStepUpOperation;
  bindingDigest: string;
  message: string;
  expiresAtMs: number;
}

/** The insert shape: the row plus the realm the store scopes every read by. */
export interface NewWocStepUpChallenge extends WocStepUpChallengeRow {
  realm: string;
}

/** The step-up refusal vocabulary. stepup_required is the bearer-only arm
 *  (no proof supplied at all); the rest come out of verifyStepUpProof. */
export type WocStepUpRefusal =
  | 'stepup_required'
  | 'stepup_challenge_invalid'
  | 'stepup_challenge_expired'
  | 'stepup_wallet_mismatch'
  | 'stepup_binding_mismatch'
  | 'stepup_signature_invalid';

/** 16 random bytes hex, the issueWalletChallenge convention. */
export function newStepUpNonce(): string {
  return randomBytes(16).toString('hex');
}

/**
 * The canonical binding digest. Field order is FIXED and versioned by the
 * leading tag; a null money figure serializes as '-' so absent and zero can
 * never collide. Every member is load-bearing: dropping one from this string
 * reopens a replay lane onto a different value of that member.
 */
export function stepUpBindingDigest(binding: WocStepUpBinding): string {
  const parts =
    binding.operation === 'create_listing'
      ? [
          'v1',
          binding.operation,
          binding.itemId,
          binding.format,
          String(binding.startCents),
          binding.reserveCents === null ? '-' : String(binding.reserveCents),
          binding.buyNowCents === null ? '-' : String(binding.buyNowCents),
          String(binding.durationHours),
        ]
      : [
          'v1',
          binding.operation,
          String(binding.offerId),
          binding.itemId,
          String(binding.usdCents),
        ];
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

const usd = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

/**
 * The exact human-readable text the wallet is asked to sign. English by
 * protocol: the signature binds these bytes, so localizing them would fork
 * verification (the buildLinkMessage precedent). The first line is the domain
 * separator: it shares no prefix with the wallet-link message, so a step-up
 * signature can never verify as a link proof or the reverse.
 */
export function buildStepUpMessage(opts: {
  binding: WocStepUpBinding;
  accountId: number;
  wallet: string;
  nonce: string;
  expiresAtIso: string;
}): string {
  const b = opts.binding;
  const action =
    b.operation === 'create_listing'
      ? [
          `Action: list ${b.itemId} on the $WOC Exchange`,
          `Format: ${b.format}`,
          `Starting price: ${usd(b.startCents)}`,
          `Reserve: ${b.reserveCents === null ? 'none' : usd(b.reserveCents)}`,
          `Buy now: ${b.buyNowCents === null ? 'none' : usd(b.buyNowCents)}`,
          `Duration: ${b.durationHours}h`,
        ]
      : [
          `Action: accept directed offer #${b.offerId} on the $WOC Exchange`,
          `Item: ${b.itemId}`,
          `Agreed price: ${usd(b.usdCents)}`,
        ];
  return [
    'World of ClaudeCraft $WOC Exchange: authorize moving an item into escrow.',
    '',
    ...action,
    '',
    `Account: #${opts.accountId}`,
    `Wallet: ${opts.wallet}`,
    `Nonce: ${opts.nonce}`,
    `Expires At: ${opts.expiresAtIso}`,
    '',
    'Signing is free and authorizes ONLY the action above, once.',
  ].join('\n');
}

/**
 * Judge a consumed challenge against the operation actually being performed.
 *
 * The caller has already consumed the row (or got null); consumption on a
 * refused proof is deliberate, see the header. Refusal order is fixed and
 * affects only WHICH honest reason the player sees; every check must pass.
 * The dev arm accepts `devsig:<nonce>` ONLY when devSig is true, which the
 * caller wires from the same double-gated switch that selects the dev economy
 * (ALLOW_DEV_COMMANDS and WOC_MARKET_DEV_SERVICE both set); in production the
 * string falls through to ed25519 verification and refuses.
 */
export function verifyStepUpProof(args: {
  row: WocStepUpChallengeRow | null;
  proof: WocStepUpProof;
  expectedDigest: string;
  accountId: number;
  currentWallet: string | null;
  nowMs: number;
  devSig: boolean;
}): { ok: true } | { ok: false; reason: Exclude<WocStepUpRefusal, 'stepup_required'> } {
  const { row } = args;
  // Unknown, already consumed (replay), or another account's nonce: one
  // constant answer, so existence never leaks across accounts.
  if (row === null || row.accountId !== args.accountId) {
    return { ok: false, reason: 'stepup_challenge_invalid' };
  }
  if (args.nowMs >= row.expiresAtMs) return { ok: false, reason: 'stepup_challenge_expired' };
  // The CURRENT linked wallet must still be the one the challenge named: a
  // relink between issue and use invalidates the authorization.
  if (args.currentWallet === null || row.wallet !== args.currentWallet) {
    return { ok: false, reason: 'stepup_wallet_mismatch' };
  }
  if (row.bindingDigest !== args.expectedDigest) {
    return { ok: false, reason: 'stepup_binding_mismatch' };
  }
  if (args.devSig && args.proof.signature === `devsig:${row.nonce}`) return { ok: true };
  if (!verifySolanaSignature(row.message, args.proof.signature, row.wallet)) {
    return { ok: false, reason: 'stepup_signature_invalid' };
  }
  return { ok: true };
}
