import type { VaultInfo } from '../../world_api/bank';
import type { InvSlot } from '../types';

export const COURIER_CAPACITY = 24;
export const COURIER_PAYLOAD_BYTES = 12 * 1024;
/** Reserve bounded metadata separately so flight coordinates never invalidate custody. */
export const COURIER_CUSTODY_BYTES = COURIER_PAYLOAD_BYTES - 512;
/** Admission leaves room for bounded load normalization and armour perfection. */
export const COURIER_ADMISSION_BYTES = COURIER_CUSTODY_BYTES - 512;
export type CourierPhase = 'ready' | 'outbound' | 'returning' | 'waiting';
/** Whole-stack selection. The fingerprint includes quantity and all provenance. */
export interface CourierSelection {
  index: number;
  fingerprint: string;
}
/** One Materials Vault row for a trip. Pooled stock names its material and the
 *  count the window showed (paid as far as it is still held); an identity row
 *  adds its index and full fingerprint, and moves whole or not at all. */
export interface CourierVaultSelection {
  itemId: string;
  count: number;
  special?: CourierSelection;
}
/** Selected stacks for one trip, all for the one banker the courier visits: the
 * personal bank, and optionally the Materials Vault. No selections at all
 * dismisses a ready, empty courier instead (the window closed unsent). */
export interface CourierDispatchRequest {
  deposits: CourierSelection[];
  withdrawals: CourierSelection[];
  /** Carried material stacks the courier puts into the Materials Vault. */
  vaultDeposits?: CourierSelection[];
  /** Vault rows the courier brings back. */
  vaultWithdrawals?: CourierVaultSelection[];
}
/** Selections across every list of one request; COURIER_CAPACITY bounds it. */
export function courierSelectionCount(request: CourierDispatchRequest): number {
  return (
    request.deposits.length +
    request.withdrawals.length +
    (request.vaultDeposits?.length ?? 0) +
    (request.vaultWithdrawals?.length ?? 0)
  );
}
export interface CourierState {
  phase: CourierPhase;
  x: number;
  z: number;
  bankerId: number | null;
  /** Legacy pose distance, saturated at eight units for older clients. */
  travelDistance: number;
  /** Elapsed fixed simulation ticks in this leg; absent on legacy saves. */
  travelTicks?: number;
  legStartX?: number;
  legStartZ?: number;
  /** Route length when the leg started; it alone fixes the leg's duration and speeds. */
  legDistance?: number;
  /** Owner facing locked when the return leg starts: the side it lands on. */
  landingYaw?: number;
  cargo: InvSlot[];
  withdrawals: CourierSelection[];
  /** Outbound stacks bound for the Materials Vault; what does not fit rides home. */
  vaultCargo?: InvSlot[];
  vaultWithdrawals?: CourierVaultSelection[];
  revision: number;
  /** Remaining simulation seconds, so logout never advances custody. */
  retryRemaining: number;
}
export type CourierBankExchange = (
  pid: number,
  deposit: () => void,
  withdraw: () => void,
) => boolean;
export interface CourierInfo
  extends Omit<
    CourierState,
    'retryRemaining' | 'legStartX' | 'legStartZ' | 'legDistance' | 'landingYaw'
  > {
  /** Total ticks of the current leg (at most fifteen seconds); absent while unplanned. */
  legTicks?: number;
  /** Current authoritative target distance; zero while grounded or paused. */
  remainingDistance: number;
  active: boolean;
  bankSlots: InvSlot[];
  bankCapacity: number;
  inventoryRevision: number;
  bankRevision: number;
  /** The owner's vault while the courier waits ready, else null. Published on
   *  its own self key: older clients strictly validate the courierData keys. */
  vault: VaultInfo | null;
}
export type CourierPose = Pick<
  CourierInfo,
  | 'phase'
  | 'x'
  | 'z'
  | 'bankerId'
  | 'inventoryRevision'
  | 'travelDistance'
  | 'remainingDistance'
  | 'travelTicks'
  | 'legTicks'
>;
