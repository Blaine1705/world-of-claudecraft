import type { AccountBankInfo, IWorldBank } from '../world_api/bank';
import { decodeBankInfoWire } from './bank_snapshot_wire';
import { isRecord } from './vault_snapshot_wire';

/** A bank response is one bounded owner-only message, never a snapshot collection. */
export function decodeAccountBankInfo(value: unknown): AccountBankInfo | null {
  if (!isRecord(value) || !Array.isArray(value.characters) || value.characters.length > 20)
    return null;
  const characters: AccountBankInfo['characters'] = [];
  const ids = new Set<number>();
  for (const row of value.characters) {
    if (
      !isRecord(row) ||
      !Number.isSafeInteger(row.characterId) ||
      (row.characterId as number) <= 0 ||
      typeof row.name !== 'string' ||
      row.name.length > 64 ||
      ids.has(row.characterId as number)
    )
      return null;
    ids.add(row.characterId as number);
    characters.push({ characterId: row.characterId as number, name: row.name });
  }
  if (value.selectedCharacterId !== null && !ids.has(value.selectedCharacterId as number))
    return null;
  const bank = decodeBankInfoWire(value.bank, { unpriced: true });
  if (bank === undefined || (bank !== null && value.selectedCharacterId === null)) return null;
  return {
    characters,
    selectedCharacterId: value.selectedCharacterId as number | null,
    bank,
    ...(typeof value.error === 'string' ? { error: value.error.slice(0, 128) } : {}),
  };
}

/** A fresh roster opens a bank straight away instead of waiting on a click: the
 *  last one viewed while it is still listed, else the first. Refusals and
 *  replies that already name a selection never trigger a second read. */
export function accountBankAutoSelect(
  info: AccountBankInfo | null,
  preferred: number | null,
): number | null {
  if (!info || info.error || info.selectedCharacterId !== null || !info.characters.length)
    return null;
  return info.characters.some((c) => c.characterId === preferred)
    ? (preferred as number)
    : info.characters[0].characterId;
}

/** Selecting a tab clears its stale contents and any earlier refusal while the
 *  owner response loads. */
export function selectAccountBankMirror(
  info: AccountBankInfo | null,
  characterId: number,
): AccountBankInfo | null {
  return info ? { ...info, selectedCharacterId: characterId, bank: null, error: undefined } : null;
}
export function accountBankTransferPayload(
  ...[characterId, direction, slotIndex, count, expectedSlot]: Parameters<
    IWorldBank['accountBankTransfer']
  >
) {
  return { characterId, direction, slotIndex, count, expectedSlot };
}
