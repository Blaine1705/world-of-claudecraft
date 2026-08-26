// Consent guard for the personal-bank socket ladder. The wire command carries
// no revision or price, so the UI must verify the confirmed offer against the
// live mirror before sending and then hold that offer until an authoritative
// echo or command-specific refusal releases the shared bounded latch.

import { StorageRungEchoLatch, type StorageRungEchoTimers } from './storage_rung_echo_core';

export interface BankSocketPurchaseOffer {
  socketsUnlocked: number;
  cost: number;
}

export interface BankSocketPurchaseSnapshot {
  socketsUnlocked: number;
  nextSocketCost: number | null;
}

export type BankSocketConfirmDecision = 'send' | 'pending' | 'changed';

const SOCKET_PURCHASE_REFUSALS = new Set([
  'Your bank has no more bag sockets to unlock.',
  'You cannot afford that bag socket.',
]);

export class BankSocketPurchaseCore {
  private readonly echo: StorageRungEchoLatch;

  constructor(timers: StorageRungEchoTimers, onTimeout: () => void) {
    this.echo = new StorageRungEchoLatch(timers, onTimeout);
  }

  get pending(): boolean {
    return this.echo.pending;
  }

  confirm(
    offer: BankSocketPurchaseOffer,
    snapshot: BankSocketPurchaseSnapshot | null | undefined,
  ): BankSocketConfirmDecision {
    if (this.pending) return 'pending';
    if (
      !snapshot ||
      snapshot.socketsUnlocked !== offer.socketsUnlocked ||
      snapshot.nextSocketCost !== offer.cost
    ) {
      return 'changed';
    }
    return this.echo.arm(offer.socketsUnlocked, offer.socketsUnlocked + 1) ? 'send' : 'changed';
  }

  observeRevision(revision: number | null | undefined): boolean {
    return this.echo.observe(revision);
  }

  observeText(text: string): boolean {
    return SOCKET_PURCHASE_REFUSALS.has(text) ? this.echo.refuse() : false;
  }
}
