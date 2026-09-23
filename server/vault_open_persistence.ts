// The shared Sim opens a sealed hoard entrance when a map is dug. The live
// server must commit the consumed map and retry marker in the character blob
// before the entrance becomes usable. This observer never owns game rules:
// it only acknowledges the exact attempt after the existing fenced save FIFO.

import type { Sim } from '../src/sim/sim';
import { confirmVaultAttemptDurable } from '../src/sim/treasure_vault';
import type { SimEvent } from '../src/sim/types';

export interface VaultOpenPersistenceDeps {
  attemptIdFor(pid: number): string | null;
  save(pid: number): Promise<boolean>;
  confirm(pid: number, attemptId: string): boolean;
  onError(pid: number, error: unknown): void;
}

export function createVaultOpenPersistenceDeps<Session extends { left: boolean }>(
  sim: () => Sim,
  sessionFor: (pid: number) => Session | undefined,
  saveSession: (session: Session) => Promise<boolean>,
): VaultOpenPersistenceDeps {
  return {
    attemptIdFor: (pid) => {
      const meta = sim().meta(pid);
      return meta?.vaultAttemptDurable ? null : (meta?.vaultAttempt?.id ?? null);
    },
    save: (pid) => {
      const session = sessionFor(pid);
      return session && !session.left ? saveSession(session) : Promise.resolve(false);
    },
    confirm: (pid, attemptId) => confirmVaultAttemptDurable(sim().ctx, pid, attemptId),
    onError: (pid, error) => console.error(`vault open save failed for pid ${pid}:`, error),
  };
}

export function persistNewVaultOpens(
  events: readonly SimEvent[],
  inFlight: Set<string>,
  deps: VaultOpenPersistenceDeps,
): Promise<void>[] {
  const tasks: Promise<void>[] = [];
  for (const event of events) {
    if (event.type !== 'treasureVaultOpened' || event.pid === undefined) continue;
    const pid = event.pid;
    const attemptId = deps.attemptIdFor(pid);
    if (!attemptId || inFlight.has(attemptId)) continue;
    inFlight.add(attemptId);
    tasks.push(
      deps
        .save(pid)
        .then((saved) => {
          if (saved) deps.confirm(pid, attemptId);
        })
        .catch((error: unknown) => deps.onError(pid, error))
        .finally(() => inFlight.delete(attemptId)),
    );
  }
  return tasks;
}
