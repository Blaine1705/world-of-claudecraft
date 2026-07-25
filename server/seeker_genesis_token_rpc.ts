import {
  getMetadataPointerState,
  getTokenGroupMemberState,
  TOKEN_2022_PROGRAM_ID,
  unpackMint,
} from '@solana/spl-token';
import { Connection, PublicKey } from '@solana/web3.js';
import {
  isSeekerGenesisToken,
  SEEKER_GENESIS_TOKEN_GROUP_ADDRESS,
  SEEKER_GENESIS_TOKEN_METADATA_ADDRESS,
  SEEKER_GENESIS_TOKEN_MINT_AUTHORITY,
} from './seeker_genesis_token';

const MINT_BATCH_SIZE = 100;
export const MAX_SEEKER_TOKEN_ACCOUNTS = 500;
export const MAX_SEEKER_TOKEN_MINTS = 200;

interface ParsedTokenAccount {
  account?: {
    data?: {
      parsed?: {
        info?: {
          mint?: unknown;
          tokenAmount?: { amount?: unknown };
        };
      };
    };
  };
}

export interface VerifiedSeekerGenesisToken {
  mint: string;
  slot: number | null;
}

export function positiveTokenMintAddresses(accounts: unknown): string[] {
  if (!Array.isArray(accounts)) return [];
  const unique = new Set<string>();
  for (const value of accounts) {
    if (!value || typeof value !== 'object') continue;
    const account = value as ParsedTokenAccount;
    const info = account.account?.data?.parsed?.info;
    if (typeof info?.mint !== 'string' || typeof info.tokenAmount?.amount !== 'string') continue;
    if (!/^\d+$/.test(info.tokenAmount.amount) || BigInt(info.tokenAmount.amount) <= 0n) continue;
    try {
      const mint = new PublicKey(info.mint);
      unique.add(mint.toBase58());
    } catch {
      // Ignore malformed RPC entries and keep the whole verification fail-closed.
    }
  }
  return [...unique];
}

export function boundedPositiveTokenMintAddresses(accounts: unknown): string[] | null {
  if (!Array.isArray(accounts) || accounts.length > MAX_SEEKER_TOKEN_ACCOUNTS) return null;
  const mints = positiveTokenMintAddresses(accounts);
  return mints.length <= MAX_SEEKER_TOKEN_MINTS ? mints : null;
}

export async function findSeekerGenesisToken(
  walletAddress: string,
  rpcUrl = process.env.SOLANA_RPC_URL ?? '',
  signal?: AbortSignal,
): Promise<VerifiedSeekerGenesisToken | null> {
  let owner: PublicKey;
  if (!rpcUrl) return null;
  try {
    owner = new PublicKey(walletAddress);
  } catch {
    return null;
  }

  const connection = new Connection(rpcUrl, {
    commitment: 'confirmed',
    disableRetryOnRateLimit: true,
    fetch: signal
      ? (input, init) =>
          fetch(input, {
            ...init,
            signal,
          })
      : undefined,
  });
  const mints = new Map<string, PublicKey>();
  let slot: number | null = null;
  try {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      owner,
      { programId: TOKEN_2022_PROGRAM_ID },
      'confirmed',
    );
    slot = Number.isSafeInteger(tokenAccounts.context.slot) ? tokenAccounts.context.slot : null;
    const addresses = boundedPositiveTokenMintAddresses(tokenAccounts.value);
    if (!addresses) return null;
    for (const address of addresses) {
      mints.set(address, new PublicKey(address));
    }
  } catch {
    return null;
  }

  const mintList = [...mints.values()];
  for (let offset = 0; offset < mintList.length; offset += MINT_BATCH_SIZE) {
    const batch = mintList.slice(offset, offset + MINT_BATCH_SIZE);
    const infos = await connection.getMultipleAccountsInfo(batch, { commitment: 'confirmed' });
    for (let i = 0; i < batch.length; i++) {
      const mintAddress = batch[i];
      const mintInfo = infos[i];
      if (!mintAddress || !mintInfo) continue;
      try {
        const mint = unpackMint(mintAddress, mintInfo, TOKEN_2022_PROGRAM_ID);
        const metadata = getMetadataPointerState(mint);
        const group = getTokenGroupMemberState(mint);
        if (
          isSeekerGenesisToken({
            mintAddress: mintAddress.toBase58(),
            ownerAmount: '1',
            mintAuthority: mint.mintAuthority?.toBase58() ?? null,
            metadataPointerAuthority: metadata?.authority?.toBase58() ?? null,
            metadataAddress: metadata?.metadataAddress?.toBase58() ?? null,
            groupAddress: group?.group?.toBase58() ?? null,
          })
        ) {
          return { mint: mintAddress.toBase58(), slot };
        }
      } catch {
        // A non-mint or malformed extension is not an SGT.
      }
    }
  }
  return null;
}

export const seekerGenesisTokenIdentity = {
  mintAuthority: SEEKER_GENESIS_TOKEN_MINT_AUTHORITY,
  metadataAddress: SEEKER_GENESIS_TOKEN_METADATA_ADDRESS,
  groupAddress: SEEKER_GENESIS_TOKEN_GROUP_ADDRESS,
} as const;
