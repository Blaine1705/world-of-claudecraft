// Strict decoder for the owner-only Materials Vault snapshot. The world epoch
// guarantees this required shape, but every field is still validated at the
// browser boundary so a malformed frame is dropped instead of feeding
// undefined counts or aliased payload junk into the vault painter.

import { MAX_INSTANCE_STRING_LENGTH } from '../sim/item_instance_load';
import { cloneItemInstancePayload, type InvSlot } from '../sim/types';
import type { VaultInfo, VaultSpecialRef } from '../world_api';

const VAULT_KEYS = new Set(['stock', 'special', 'upgrades', 'perMaterialCap', 'nextUpgradeCost']);
const SPECIAL_KEYS = new Set(['itemId', 'count', 'instance', 'craftedRecipeId']);
const MAX_JSON_DEPTH = 12;
const MAX_JSON_NODES = 1_024;
const MAX_VAULT_UPGRADES = 5;
const VAULT_CAP_PER_UPGRADE = 40;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSafeCount(value: unknown, allowZero = false): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && (allowZero ? value >= 0 : value > 0)
  );
}

function isBoundedJson(value: unknown): boolean {
  let nodes = 0;
  const visit = (current: unknown, depth: number): boolean => {
    if (++nodes > MAX_JSON_NODES || depth > MAX_JSON_DEPTH) return false;
    if (current === null || typeof current === 'boolean') return true;
    if (typeof current === 'string') return current.length <= MAX_INSTANCE_STRING_LENGTH;
    if (typeof current === 'number') return Number.isFinite(current);
    if (Array.isArray(current)) return current.every((entry) => visit(entry, depth + 1));
    if (!isRecord(current)) return false;
    return Object.entries(current).every(
      ([key, entry]) => key.length <= MAX_INSTANCE_STRING_LENGTH && visit(entry, depth + 1),
    );
  };
  return visit(value, 0);
}

function isSpecialSlot(value: unknown): value is InvSlot {
  if (!isRecord(value) || Object.keys(value).some((key) => !SPECIAL_KEYS.has(key))) return false;
  if (typeof value.itemId !== 'string' || value.itemId === '' || !isSafeCount(value.count)) {
    return false;
  }
  if (
    value.craftedRecipeId !== undefined &&
    (typeof value.craftedRecipeId !== 'string' ||
      value.craftedRecipeId === '' ||
      value.craftedRecipeId.length > MAX_INSTANCE_STRING_LENGTH)
  ) {
    return false;
  }
  if (
    value.instance !== undefined &&
    (!isRecord(value.instance) || !isBoundedJson(value.instance))
  ) {
    return false;
  }
  return true;
}

/** Decode one full `vault` self field. Explicit null closes the view; any
 *  malformed object also resolves to null, dropping the whole unsafe row
 *  rather than rendering a partial or internally inconsistent snapshot. */
export function decodeVaultInfoWire(value: unknown): VaultInfo | null {
  if (value === null) return null;
  if (!isRecord(value) || Object.keys(value).some((key) => !VAULT_KEYS.has(key))) return null;
  if (!isRecord(value.stock) || !Array.isArray(value.special)) return null;
  if (
    !isSafeCount(value.upgrades, true) ||
    value.upgrades > MAX_VAULT_UPGRADES ||
    value.perMaterialCap !== value.upgrades * VAULT_CAP_PER_UPGRADE
  ) {
    return null;
  }
  if (value.upgrades === MAX_VAULT_UPGRADES) {
    if (value.nextUpgradeCost !== null) return null;
  } else if (!isSafeCount(value.nextUpgradeCost, true)) return null;
  for (const count of Object.values(value.stock)) {
    if (!isSafeCount(count)) return null;
  }
  if (!value.special.every(isSpecialSlot)) return null;
  return value as unknown as VaultInfo;
}

export interface VaultWithdrawPayload {
  itemId: string;
  count?: number;
  special?: VaultSpecialRef;
}

/** Build a withdrawal intent without aliasing the UI's identity fingerprint. */
export function vaultWithdrawPayload(
  itemId: string,
  count?: number,
  special?: VaultSpecialRef,
): VaultWithdrawPayload {
  return {
    itemId,
    ...(count === undefined ? {} : { count }),
    ...(special === undefined
      ? {}
      : {
          special: {
            index: special.index,
            ...(special.instance === undefined
              ? {}
              : { instance: cloneItemInstancePayload(special.instance) }),
            ...(special.craftedRecipeId === undefined
              ? {}
              : { craftedRecipeId: special.craftedRecipeId }),
          },
        }),
  };
}
