import { describe, expect, it } from 'vitest';
import {
  type BankInfo,
  ONLINE_WORLD_AUTH_TYPE,
  ONLINE_WORLD_LAYOUT_VERSION,
} from '../src/world_api';

// Exact required BankInfo shape from origin/release/v0.41.0. Keeping the
// historical fixture here makes the epoch rationale reviewable without relying
// on a comment or on whichever fields a current UI happens to read first.
const RELEASE_V041_BANK_INFO = {
  slots: [],
  capacity: 24,
  purchasedSlots: 0,
  bonusSlots: 0,
  nextExpansionCost: 500,
  bonusSources: [],
} as const;

const BANK_STORAGE_REQUIRED_KEYS = [
  'socketsUnlocked',
  'socketBags',
  'nextSocketCost',
  'generalCapacity',
  'materialsCapacity',
  'generalUsed',
  'materialsUsed',
] as const satisfies readonly (keyof BankInfo)[];

describe('BankInfo wire compatibility epoch', () => {
  it('separates the bank-storage snapshot from release/v0.41.0 before admission', () => {
    for (const key of BANK_STORAGE_REQUIRED_KEYS) {
      expect(key in RELEASE_V041_BANK_INFO, key).toBe(false);
    }

    expect(ONLINE_WORLD_LAYOUT_VERSION).toBe(10);
    expect(ONLINE_WORLD_AUTH_TYPE).toBe('auth-world-10');
    expect(ONLINE_WORLD_AUTH_TYPE).not.toBe('auth-world-9');
  });
});
