// Heal an emptied in-memory vault letter after its paired save failed and a
// fresh character session loaded the durable pre-take character snapshot.

import type { VaultMailRecoveryLetter } from '../src/sim/mail/post_office';
import type { Sim } from '../src/sim/sim';
import { pool } from './db';
import { REALM } from './realm';
import { loadVaultMailRecovery } from './vault_mail_recovery_db';
import type { VaultMailTakeGuard } from './vault_mail_take_guard';

const RETRY_MS = 5_000;

export class VaultMailTakeRecovery {
  private readonly inFlight = new Set<number>();

  constructor(
    private readonly guard: VaultMailTakeGuard,
    private readonly sim: () => Sim,
    private readonly withPermit: <T>(run: () => Promise<T>) => Promise<T>,
    private readonly load: (
      characterId: number,
      custodyRef: string,
    ) => Promise<VaultMailRecoveryLetter | null> = (characterId, custodyRef) =>
      loadVaultMailRecovery(pool, REALM, characterId, custodyRef),
  ) {}

  joinError(characterId: number): string | null {
    const error = this.guard.joinError(characterId, false);
    if (error) this.recover(characterId);
    return error;
  }

  recover(characterId: number): void {
    const ref = this.guard.recoveryRef(characterId);
    if (!ref || this.inFlight.has(characterId)) return;
    this.inFlight.add(characterId);
    void this.withPermit(() => this.load(characterId, ref))
      .then((source) => {
        if (this.guard.recoveryRef(characterId) !== ref) return;
        if (source && !this.sim().postOffice.restoreVaultLetter(String(characterId), ref, source))
          throw new Error(`vault mail ${ref} could not be restored`);
        this.guard.recovered(characterId, ref);
      })
      .catch((error) => {
        console.error(`vault mail recovery ${characterId}:`, error);
        const timer = setTimeout(() => this.recover(characterId), RETRY_MS);
        timer.unref();
      })
      .finally(() => this.inFlight.delete(characterId));
  }
}
