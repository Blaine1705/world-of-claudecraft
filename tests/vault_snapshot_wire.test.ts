import { describe, expect, it } from 'vitest';
import { decodeVaultInfoWire, vaultWithdrawPayload } from '../src/net/vault_snapshot_wire';

const VALID = {
  stock: { copper_ore: 3 },
  special: [
    {
      itemId: 'copper_ore',
      count: 1,
      instance: { signer: 'Ada', rolled: { quality: 'rare', stats: { sta: 2 } } },
    },
    { itemId: 'future_material', count: 2, craftedRecipeId: 'future_recipe' },
  ],
  upgrades: 2,
  perMaterialCap: 80,
  nextUpgradeCost: 100_000,
};

describe('Materials Vault snapshot wire decoder', () => {
  it('accepts null and a strict identity-preserving snapshot without rebuilding it', () => {
    expect(decodeVaultInfoWire(null)).toBeNull();
    expect(decodeVaultInfoWire(VALID)).toBe(VALID);
  });

  it.each([
    { ...VALID, special: undefined },
    { ...VALID, special: {} },
    { ...VALID, special: [{ itemId: 'copper_ore', count: 1, slot: 4 }] },
    { ...VALID, special: [{ itemId: 'copper_ore', count: 0, instance: {} }] },
    { ...VALID, special: [{ itemId: '', count: 1, instance: {} }] },
    { ...VALID, special: [{ itemId: 'copper_ore', count: 1, instance: [] }] },
    { ...VALID, special: [{ itemId: 'copper_ore', count: 1, instance: { n: Number.NaN } }] },
    { ...VALID, stock: { copper_ore: 1.5 } },
    { ...VALID, stock: { copper_ore: { polluted: true } } },
    { ...VALID, upgrades: 1.5 },
    { ...VALID, upgrades: 6, perMaterialCap: 240, nextUpgradeCost: null },
    { ...VALID, perMaterialCap: 81 },
    { ...VALID, nextUpgradeCost: null },
    { ...VALID, upgrades: 5, perMaterialCap: 200, nextUpgradeCost: 1 },
    {
      ...VALID,
      special: [{ itemId: 'copper_ore', count: 1, instance: { signer: 'x'.repeat(65) } }],
    },
    {
      ...VALID,
      special: [{ itemId: 'copper_ore', count: 1, instance: { ['x'.repeat(65)]: 1 } }],
    },
    { ...VALID, extra: true },
  ])('drops a malformed snapshot instead of exposing partial state: %#', (raw) => {
    expect(decodeVaultInfoWire(raw)).toBeNull();
  });

  it('encodes and deep-clones the exact special withdrawal fingerprint', () => {
    const special = {
      index: 3,
      instance: { signer: 'Ada', rolled: { quality: 'rare' as const, stats: { sta: 2 } } },
      craftedRecipeId: 'smelt_copper',
    };
    const payload = vaultWithdrawPayload('copper_ore', 1, special);

    expect(payload).toEqual({
      itemId: 'copper_ore',
      count: 1,
      special,
    });
    expect(payload.special).not.toBe(special);
    expect(payload.special?.instance).not.toBe(special.instance);
    special.instance.rolled.stats.sta = 99;
    expect(payload.special?.instance?.rolled?.stats?.sta).toBe(2);
  });
});
