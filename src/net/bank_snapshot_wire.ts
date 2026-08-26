// Strict decode for the two owner-only bank self fields that are useful away
// from a banker. Kept ClientWorld-free so malformed or version-skewed frames
// can be judged without growing online.ts or partially replacing a good mirror.

import { BANK_EXPANSION_SLOTS, BANK_PURCHASED_SLOTS_MAX } from '../sim/bank';

export { BANK_PURCHASED_SLOTS_MAX };

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Decode `self.cvault`. Undefined means malformed and tells the caller to
 * retain its prior mirror; null is the explicit craft-draw gate closure. A
 * valid record is returned by reference so an own `__proto__` row stays inert
 * data instead of passing through a prototype-setting keyed assignment.
 *
 * There is deliberately no second row-count or key-length ceiling here. The
 * outer snapshot frame already owns the byte bound, while the authoritative
 * load path preserves arbitrary nonempty dormant keys and craftVaultStockFor
 * emits every drawable one. A narrower client-only limit would make the online
 * crafting view disagree with the same saved character in an offline world. */
export function decodeCraftVaultStockWire(
  value: unknown,
): Record<string, number> | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  for (const [key, count] of Object.entries(value)) {
    if (key.length === 0 || !Number.isSafeInteger(count) || Number(count) <= 0) {
      return undefined;
    }
  }
  return value as Record<string, number>;
}

/** Decode `self.bpsl`. The resolver-backed server emitter can explicitly send
 * null when no player is resolvable; every numeric value must be one exact
 * position on the personal-bank expansion ladder. */
export function decodeBankPurchasedSlotsWire(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    Object.is(value, -0) ||
    value < 0 ||
    value > BANK_PURCHASED_SLOTS_MAX ||
    value % BANK_EXPANSION_SLOTS !== 0
  ) {
    return undefined;
  }
  return value;
}
