import { readFileSync } from 'node:fs';
import { PublicKey } from '@solana/web3.js';
import { describe, expect, it } from 'vitest';
import {
  boundedPositiveTokenMintAddresses,
  MAX_SEEKER_TOKEN_ACCOUNTS,
  MAX_SEEKER_TOKEN_MINTS,
  positiveTokenMintAddresses,
} from '../server/seeker_genesis_token_rpc';

const mint = 'So11111111111111111111111111111111111111112';

function account(mintAddress: unknown, amount: unknown) {
  return {
    account: {
      data: {
        parsed: {
          info: {
            mint: mintAddress,
            tokenAmount: { amount },
          },
        },
      },
    },
  };
}

function mintAddress(index: number): string {
  const bytes = new Uint8Array(32);
  bytes[0] = index & 0xff;
  bytes[1] = (index >> 8) & 0xff;
  bytes[31] = 1;
  return new PublicKey(bytes).toBase58();
}

describe('Seeker token-account RPC parsing', () => {
  it('uses the provider-neutral Solana RPC configured for existing chain reads', () => {
    const source = readFileSync('server/seeker_genesis_token_rpc.ts', 'utf8');
    expect(source).toContain('process.env.SOLANA_RPC_URL');
    expect(source).toContain('getParsedTokenAccountsByOwner');
    expect(source).not.toContain('HELIUS_RPC_URL');
    expect(source).not.toContain('getTokenAccountsByOwnerV2');
  });

  it('keeps unique positive Token-2022 balances only', () => {
    expect(
      positiveTokenMintAddresses([
        account(mint, '1'),
        account(mint, '2'),
        account(mint, '0'),
        account('invalid', '1'),
        account(mint, '-1'),
        account(mint, 1),
        null,
      ]),
    ).toEqual([mint]);
  });

  it('fails closed for malformed response shapes', () => {
    expect(positiveTokenMintAddresses(null)).toEqual([]);
    expect(positiveTokenMintAddresses({ accounts: [] })).toEqual([]);
    expect(positiveTokenMintAddresses([{}, account(mint, 'not-a-number')])).toEqual([]);
  });

  it('accepts responses at the account and unique-mint bounds', () => {
    const accounts = Array.from({ length: MAX_SEEKER_TOKEN_ACCOUNTS }, (_, index) =>
      account(mintAddress(index % MAX_SEEKER_TOKEN_MINTS), '1'),
    );
    expect(boundedPositiveTokenMintAddresses(accounts)).toHaveLength(MAX_SEEKER_TOKEN_MINTS);
  });

  it('fails closed when the token-account response exceeds its bound', () => {
    const accounts = Array.from({ length: MAX_SEEKER_TOKEN_ACCOUNTS + 1 }, () =>
      account(mint, '1'),
    );
    expect(boundedPositiveTokenMintAddresses(accounts)).toBeNull();
  });

  it('fails closed when unique positive mints exceed their bound', () => {
    const accounts = Array.from({ length: MAX_SEEKER_TOKEN_MINTS + 1 }, (_, index) =>
      account(mintAddress(index), '1'),
    );
    expect(boundedPositiveTokenMintAddresses(accounts)).toBeNull();
  });
});
