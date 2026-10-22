import { courierSlotFingerprint } from '../../../sim/courier/identity';
import type {
  CourierDispatchRequest,
  CourierInfo,
  CourierSelection,
  CourierVaultSelection,
} from '../../../sim/courier/types';
import { COURIER_CAPACITY, courierSelectionCount } from '../../../sim/courier/types';
import { ITEMS } from '../../../sim/data';
import { isVaultDepositableSlot, vaultMaterialIds } from '../../../sim/materials_vault';
import type { InvSlot } from '../../../sim/types';
import type { VaultInfo } from '../../../world_api/bank';

export const COURIER_SELECTION_LIMIT = COURIER_CAPACITY;

/** The window's draft: every list present, so toggles never branch on absence. */
export type CourierDraft = Required<CourierDispatchRequest>;
/** The lists that select stacks by index: bag stacks for the bank or the vault,
 *  and bank stacks to bring back. */
export type CourierStackSide = 'deposits' | 'withdrawals' | 'vaultDeposits';

export function courierStackSelectable(slot: InvSlot | undefined): boolean {
  return !!slot && ITEMS[slot.itemId]?.kind !== 'quest';
}
/** Only materials go in the vault; the server rechecks with the same rule. */
export function courierVaultStackSelectable(slot: InvSlot | undefined): boolean {
  return !!slot && courierStackSelectable(slot) && isVaultDepositableSlot(slot, vaultMaterialIds());
}
export function emptyCourierDraft(): CourierDraft {
  return { deposits: [], withdrawals: [], vaultDeposits: [], vaultWithdrawals: [] };
}
export function courierSelectionMatches(
  selection: CourierSelection,
  slots: readonly InvSlot[],
): boolean {
  const slot = slots[selection.index];
  return courierStackSelectable(slot) && courierSlotFingerprint(slot) === selection.fingerprint;
}

/** One selectable Materials Vault row as the window shows it: pooled stock by
 *  material, or an identity row by its index. */
export interface CourierVaultRow {
  itemId: string;
  count: number;
  special?: { index: number; slot: InvSlot };
}
export function courierVaultRows(vault: VaultInfo | null): CourierVaultRow[] {
  if (!vault) return [];
  const pooled = Object.entries(vault.stock)
    .filter(([, count]) => Number.isSafeInteger(count) && count > 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([itemId, count]) => ({ itemId, count }));
  const special = vault.special.map((slot, index) => ({
    itemId: slot.itemId,
    count: slot.count,
    special: { index, slot },
  }));
  return [...pooled, ...special];
}
function vaultRowSelection(row: CourierVaultRow): CourierVaultSelection {
  return row.special
    ? {
        itemId: row.itemId,
        count: row.count,
        special: {
          index: row.special.index,
          fingerprint: courierSlotFingerprint(row.special.slot),
        },
      }
    : { itemId: row.itemId, count: row.count };
}
const sameVaultRow = (a: CourierVaultSelection, b: CourierVaultSelection): boolean =>
  a.itemId === b.itemId &&
  a.count === b.count &&
  a.special?.index === b.special?.index &&
  a.special?.fingerprint === b.special?.fingerprint;
export function courierVaultRowSelected(draft: CourierDraft, row: CourierVaultRow): boolean {
  const wanted = vaultRowSelection(row);
  return draft.vaultWithdrawals.some((s) => sameVaultRow(s, wanted));
}

/** Do not retarget a selected stack when the inventory compacts or an item is
 *  replaced; a vault row must still read exactly as it was selected. */
export function reconcileCourierDraft(
  draft: CourierDraft,
  bags: readonly InvSlot[],
  bank: readonly InvSlot[],
  vault: VaultInfo | null = null,
): CourierDraft {
  const rows = courierVaultRows(vault).map(vaultRowSelection);
  return {
    deposits: draft.deposits.filter((s) => courierSelectionMatches(s, bags)),
    withdrawals: draft.withdrawals.filter((s) => courierSelectionMatches(s, bank)),
    vaultDeposits: draft.vaultDeposits.filter(
      (s) => courierSelectionMatches(s, bags) && courierVaultStackSelectable(bags[s.index]),
    ),
    vaultWithdrawals: draft.vaultWithdrawals.filter((s) => rows.some((r) => sameVaultRow(r, s))),
  };
}

/** Toggle one stack. A carried stack goes to one store: choosing the vault for
 *  it drops a bank choice and the other way round. */
export function toggleCourierStack(
  draft: CourierDraft,
  side: CourierStackSide,
  index: number,
  slots: readonly InvSlot[],
): CourierDraft {
  const slot = slots[index];
  if (side === 'vaultDeposits' ? !courierVaultStackSelectable(slot) : !courierStackSelectable(slot))
    return draft;
  const fingerprint = courierSlotFingerprint(slot);
  const exists = draft[side].some((s) => s.index === index && s.fingerprint === fingerprint);
  const other =
    side === 'deposits' ? 'vaultDeposits' : side === 'vaultDeposits' ? 'deposits' : null;
  const moving = other !== null && draft[other].some((s) => s.index === index);
  if (!exists && !moving && courierSelectionCount(draft) >= COURIER_SELECTION_LIMIT) return draft;
  const next: CourierDraft = {
    ...draft,
    [side]: exists
      ? draft[side].filter((s) => s.index !== index)
      : [...draft[side].filter((s) => s.index !== index), { index, fingerprint }],
  };
  if (other !== null) next[other] = draft[other].filter((s) => s.index !== index);
  return next;
}
export function toggleCourierVaultRow(draft: CourierDraft, row: CourierVaultRow): CourierDraft {
  const wanted = vaultRowSelection(row);
  if (courierVaultRowSelected(draft, row))
    return {
      ...draft,
      vaultWithdrawals: draft.vaultWithdrawals.filter((s) => !sameVaultRow(s, wanted)),
    };
  if (courierSelectionCount(draft) >= COURIER_SELECTION_LIMIT) return draft;
  return { ...draft, vaultWithdrawals: [...draft.vaultWithdrawals, wanted] };
}

/** The wire request: empty vault lists are left off, so a bank-only trip reads
 *  exactly as it did before the vault leg existed. */
export function courierDispatchRequest(draft: CourierDraft): CourierDispatchRequest {
  return {
    deposits: draft.deposits,
    withdrawals: draft.withdrawals,
    ...(draft.vaultDeposits.length ? { vaultDeposits: draft.vaultDeposits } : {}),
    ...(draft.vaultWithdrawals.length ? { vaultWithdrawals: draft.vaultWithdrawals } : {}),
  };
}
export function canDispatchCourier(info: CourierInfo | null, draft: CourierDraft): boolean {
  const count = courierSelectionCount(draft);
  return !!info?.active && info.phase === 'ready' && count > 0 && count <= COURIER_SELECTION_LIMIT;
}
