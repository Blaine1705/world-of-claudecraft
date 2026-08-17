// The player item-lock predicate, extracted to a dependency-free leaf so a
// module that only needs to READ the flag (exchange_eligibility.ts, the shared
// exchange lock predicate) does not drag item_lock.ts's runtime graph (which
// reaches ./bags and ./item_copy_ref, and through them the whole content tree)
// into its own. The full lock SYSTEM (the set command, the capacity-aware
// removal walks) stays in item_lock.ts and re-exports this. Precedent: the same
// extraction transfer_lock.ts performs for isTransferLockedInstance.
//
// `src/sim`-pure: no imports beyond the type, no rng, no clock.

import type { ItemInstancePayload } from './types';

/** True when this copy is locked by its owner against salvage, profession
 *  craft consumption, and vendor sell. A plain (no payload) copy, or one
 *  whose payload never had the flag set, is never locked. */
export function isItemLocked(instance: ItemInstancePayload | undefined): boolean {
  return instance?.locked === true;
}
