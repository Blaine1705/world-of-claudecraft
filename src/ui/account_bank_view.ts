import { isItemLocked } from '../sim/item_lock';
import type { InvSlot, ItemDef } from '../sim/types';
import type { AccountBankInfo } from '../world_api/bank';
import type { TranslationKey } from './i18n';

/** Only transferable copies can cross character ownership. The server rechecks. */
export function accountBankTransferAllowed(slot: InvSlot, item: ItemDef | undefined): boolean {
  return (
    !!item &&
    !item.soulbound &&
    !slot.instance?.boundTo &&
    !isItemLocked(slot.instance) &&
    item.kind !== 'quest'
  );
}

/** What the Other characters pane shows before (or instead of) the two grids. */
export type AccountBankStage =
  | { kind: 'membership' }
  | { kind: 'loading' }
  | { kind: 'no_characters' }
  | { kind: 'choose' }
  | { kind: 'opening'; characterId: number }
  | { kind: 'failed'; characterId: number | null; errorKey: TranslationKey }
  | { kind: 'ready'; characterId: number };

export function accountBankStage(
  info: AccountBankInfo | null,
  membershipActive: boolean | undefined,
): AccountBankStage {
  if (membershipActive !== true) return { kind: 'membership' };
  // The roster request is in flight (or its reply was refused by the decoder).
  if (!info) return { kind: 'loading' };
  const characterId = info.selectedCharacterId;
  if (info.error) return { kind: 'failed', characterId, errorKey: accountBankErrorKey(info.error) };
  if (info.characters.length === 0) return { kind: 'no_characters' };
  if (characterId === null) return { kind: 'choose' };
  return info.bank ? { kind: 'ready', characterId } : { kind: 'opening', characterId };
}

/** Server refusal codes (membership_bank_service / membership_bank_db) to the line
 *  the pane shows. Unknown codes read as the generic unavailable line. */
export function accountBankErrorKey(error: string): TranslationKey {
  switch (error) {
    case 'membership_required':
      return 'hudChrome.bank.accountMembership';
    case 'online':
      return 'hudChrome.bank.accountOnline';
    case 'busy':
    case 'rate_limited':
      return 'hudChrome.bank.accountBusy';
    case 'no_fit':
      return 'hudChrome.bank.accountNoFit';
    case 'stale':
      return 'hudChrome.bank.accountStale';
    case 'bound':
      return 'hudChrome.bank.accountBound';
    case 'too_large':
      return 'hudChrome.bank.accountTooLarge';
    default:
      return 'hudChrome.bank.accountUnavailable';
  }
}
