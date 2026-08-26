import { describe, expect, it } from 'vitest';
import {
  BANK_PURCHASED_SLOTS_MAX,
  decodeBankPurchasedSlotsWire,
  decodeCraftVaultStockWire,
} from '../src/net/bank_snapshot_wire';
import type { ClientWorld } from '../src/net/online';
import { BANK_EXPANSION_SLOTS } from '../src/sim/bank';
import { bareClient } from './helpers/bare_client';

function playerWire(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    k: 'player',
    tid: 'warrior',
    nm: 'Vaultkeeper',
    lv: 20,
    x: 0,
    y: 0,
    z: 0,
    f: 0,
    hp: 100,
    mhp: 100,
    ...extra,
  };
}

function apply(client: ClientWorld, extra: Record<string, unknown> = {}): void {
  (client as unknown as { applySnapshot(value: unknown): void }).applySnapshot({
    t: 'snap',
    tick: 1,
    ents: [],
    self: playerWire(extra),
  });
}

describe('bank self snapshot wire decoders', () => {
  it('adopts valid craft-vault stock by reference, including an inert own __proto__ row', () => {
    const stock = Object.fromEntries([
      ['copper_ore', 3],
      ['__proto__', Number.MAX_SAFE_INTEGER],
    ]);

    const decoded = decodeCraftVaultStockWire(stock);

    expect(decoded).toBe(stock);
    expect(Object.hasOwn(decoded as object, '__proto__')).toBe(true);
    expect(Object.getOwnPropertyDescriptor(decoded, '__proto__')?.value).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    expect(Object.getPrototypeOf(decoded)).toBe(Object.prototype);
    expect(decodeCraftVaultStockWire(null)).toBeNull();
  });

  it('adopts a valid null-prototype craft-vault record by reference', () => {
    const stock = Object.create(null) as Record<string, number>;
    stock.copper_ore = 4;

    expect(decodeCraftVaultStockWire(stock)).toBe(stock);
    expect(Object.getPrototypeOf(stock)).toBeNull();
  });

  it('keeps server-valid dormant rows beyond 256 keys and with long ids', () => {
    const stock = Object.fromEntries([
      ...Array.from({ length: 300 }, (_, index) => [`future_material_${index}`, index + 1]),
      ['x'.repeat(512), 1],
      ['__proto__', 2],
    ]);

    expect(decodeCraftVaultStockWire(stock)).toBe(stock);
    expect(Object.keys(stock)).toHaveLength(302);
    expect(Object.getOwnPropertyDescriptor(stock, '__proto__')?.value).toBe(2);
  });

  it.each([
    undefined,
    false,
    1,
    'stock',
    [],
    new Date(0),
    { copper_ore: 0 },
    { copper_ore: -1 },
    { copper_ore: 1.5 },
    { copper_ore: Number.NaN },
    { copper_ore: Number.POSITIVE_INFINITY },
    { copper_ore: Number.MAX_SAFE_INTEGER + 1 },
    { copper_ore: '3' },
    { copper_ore: { count: 3 } },
    { '': 1 },
  ])('rejects malformed craft-vault stock without producing a replacement: %#', (value) => {
    expect(decodeCraftVaultStockWire(value)).toBeUndefined();
  });

  it('accepts only the canonical personal-bank ladder positions plus explicit null', () => {
    expect(BANK_PURCHASED_SLOTS_MAX).toBe(72);
    expect(decodeBankPurchasedSlotsWire(null)).toBeNull();
    for (let slots = 0; slots <= BANK_PURCHASED_SLOTS_MAX; slots += BANK_EXPANSION_SLOTS) {
      expect(decodeBankPurchasedSlotsWire(slots)).toBe(slots);
    }
    expect(decodeBankPurchasedSlotsWire(72)).toBe(72);
    expect(decodeBankPurchasedSlotsWire(78)).toBeUndefined();
  });

  it.each([
    undefined,
    false,
    '6',
    [],
    {},
    -1,
    -0,
    0.5,
    BANK_EXPANSION_SLOTS - 1,
    BANK_EXPANSION_SLOTS + 1,
    BANK_PURCHASED_SLOTS_MAX - 1,
    BANK_PURCHASED_SLOTS_MAX + BANK_EXPANSION_SLOTS,
    Number.MAX_SAFE_INTEGER + 1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])('rejects a malformed or off-ladder purchased-slot value: %#', (value) => {
    expect(decodeBankPurchasedSlotsWire(value)).toBeUndefined();
  });

  it('retains the last good ClientWorld mirrors on malformed values and omission', () => {
    const client = bareClient(1);
    const stock = Object.fromEntries([
      ['copper_ore', 3],
      ['__proto__', 2],
    ]);

    apply(client, { cvault: stock, bpsl: 12 });
    expect(client.craftVaultStock).toBe(stock);
    expect(client.bankPurchasedSlots).toBe(12);

    apply(client, { cvault: { copper_ore: 1.5 }, bpsl: 11 });
    expect(client.craftVaultStock).toBe(stock);
    expect(client.bankPurchasedSlots).toBe(12);

    apply(client);
    expect(client.craftVaultStock).toBe(stock);
    expect(client.bankPurchasedSlots).toBe(12);

    apply(client, { cvault: null, bpsl: null });
    expect(client.craftVaultStock).toBeNull();
    expect(client.bankPurchasedSlots).toBeNull();
  });
});
