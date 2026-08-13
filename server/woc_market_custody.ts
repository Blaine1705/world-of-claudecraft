// $WOC Exchange custody bridge: the ONE place marketplace code touches the
// live Sim (docs/prd/woc/marketplace.md "Item custody"). Escrow extraction
// runs against the online seller's live bags; deliveries and returns book
// Ravenpost system parcels (instance payloads intact, book-once by
// custodyRef) and persist the realm mail blob before the caller advances its
// settlement row, so a crash anywhere in between reconciles to exactly one
// parcel. The sim stays currency-blind: nothing here mentions prices, tokens,
// or wallets, only item copies and letters.

import {
  WOC_MARKET_DELIVERY_LETTER,
  WOC_MARKET_RETURN_LETTER,
  WOC_MARKET_SOLD_LETTER,
} from '../src/sim/content/letters';
import type { ExtractRef } from '../src/sim/inventory_extract';
import type { CharacterState, Sim } from '../src/sim/sim';
import type { InvSlot } from '../src/sim/types';
import type { WocCustodyExtract, WocCustodyGrant, WocMarketCustody } from './woc_market';

/** The narrow slice of GameServer the custody module consumes (game.ts
 *  wocCustodySession / persistMailBlob plus the public sim, and the
 *  per-character save FIFO seam the escrow persist rides). */
export interface WocCustodyGameHost {
  sim: Sim;
  wocCustodySession(characterId: number): {
    pid: number;
    accountId: number;
    name: string;
    leaseNonce: string | undefined;
  } | null;
  persistMailBlob(): Promise<void>;
  /** The per-character save FIFO (game.ts characterSaveQueues): a job runs
   *  only after every earlier save or job for that character settled, so
   *  commit order is enqueue order. A job must never await another enqueue
   *  for the same character (self-deadlock). */
  enqueueCharacterWrite<T>(characterId: number, job: () => Promise<T>): Promise<T>;
  /** The save-shaped snapshot (live serialization PLUS the session save
   *  fixups: jail/spectate position, stowed pet, the jail flag). Every blob
   *  this module hands to a durable write comes from here; a raw
   *  sim.serializeCharacter is a jail escape. Null when the session is
   *  gone, torn down, or escrow-quarantined. */
  serializeCharacterForPersist(
    characterId: number,
  ): { level: number; state: CharacterState } | null;
  hasDirtyGuildBooks(characterId: number): boolean;
  flushDirtyGuildBooks(characterId: number): Promise<void>;
}

/** How long a listing request may WAIT for its turn on the character's save
 *  FIFO before refusing typed 'contended' (the job is cancelled before it
 *  starts, so nothing was extracted). Sized beside the pool's own 5s
 *  connect deadline: past that, something is wedged and holding the HTTP
 *  request open only invites a retry pile-up. */
export const ESCROW_QUEUE_WAIT_MS = 5_000;
/** Queue waits past this warn (rate-unlimited by design: one line per slow
 *  listing attempt is the observability for the new FIFO coupling). */
export const ESCROW_QUEUE_WARN_MS = 2_000;

const LETTERS = {
  delivery: WOC_MARKET_DELIVERY_LETTER,
  return: WOC_MARKET_RETURN_LETTER,
  sold_notice: WOC_MARKET_SOLD_LETTER,
} as const;

export function createWocMarketCustody(
  host: WocCustodyGameHost,
  opts: { escrowWaitMs?: number } = {},
): WocMarketCustody {
  const escrowWaitMs = opts.escrowWaitMs ?? ESCROW_QUEUE_WAIT_MS;
  /** Depth cap 1 per character: the ids with an escrow job queued or running. */
  const escrowJobsInFlight = new Set<number>();
  return {
    extractCopy(accountId: number, characterId: number, ref: ExtractRef): WocCustodyExtract {
      const session = host.wocCustodySession(characterId);
      // Listing requires the seller online in this realm process: the live
      // bags are the source of truth, and the lease nonce fences the save.
      if (!session) return { ok: false, reason: 'offline' };
      if (session.accountId !== accountId) return { ok: false, reason: 'not_yours' };
      const out = host.sim.extractTradableCopy(session.pid, ref);
      if (!out.ok) return out;
      // The save-shaped snapshot, never the raw serialization: the session
      // save fixups (jail/spectate) must ride every durable blob.
      const snap = host.serializeCharacterForPersist(characterId);
      if (!snap) {
        // The session raced a teardown mid-call: undo and report offline.
        restoreInto(host, session.pid, out.extracted);
        return { ok: false, reason: 'offline' };
      }
      return {
        ok: true,
        extracted: out.extracted,
        characterName: session.name,
        save: {
          characterId,
          level: snap.level,
          state: snap.state,
          leaseNonce: session.leaseNonce,
        },
      };
    },

    async runSerialized<T>(characterId: number, job: () => Promise<T>): Promise<T | 'contended'> {
      // The escrow critical section (extract, re-check, durable write,
      // compensation) runs as ONE job on the character's save FIFO, so no
      // autosave can interleave anywhere inside it and a snapshot serialized
      // in-job is fresher than every previously committed one. Policy lives
      // here, not in the queue: at most ONE queued escrow job per character
      // (a second concurrent listing request refuses 'contended' instead of
      // stacking HTTP waiters), a wait deadline that cancels a job BEFORE it
      // starts (a cancelled job has extracted nothing, so refusing is free),
      // and the dirty-guild-book guard: the escrow write persists the
      // character row ALONE, so book-paired deltas are flushed atomically
      // FIRST (never from inside the job: self-deadlock), and residue that
      // re-dirtied during the wait refuses rather than tears.
      if (escrowJobsInFlight.has(characterId)) return 'contended';
      escrowJobsInFlight.add(characterId);
      let cancelled = false;
      let started = false;
      let timer: NodeJS.Timeout | undefined;
      try {
        await host.flushDirtyGuildBooks(characterId);
        const enqueuedAt = Date.now();
        const run = host.enqueueCharacterWrite(characterId, async (): Promise<T | 'contended'> => {
          if (cancelled) return 'contended';
          started = true;
          const waited = Date.now() - enqueuedAt;
          if (waited > ESCROW_QUEUE_WARN_MS) {
            console.warn(`[woc_market] escrow queue wait ${waited}ms for character ${characterId}`);
          }
          if (host.hasDirtyGuildBooks(characterId)) return 'contended';
          return job();
        });
        const timeout = new Promise<'timeout'>((resolve) => {
          timer = setTimeout(() => resolve('timeout'), escrowWaitMs);
        });
        const winner = await Promise.race([run, timeout]);
        if (winner !== 'timeout') return winner;
        // The deadline fired. If the job already started, its runtime is
        // bounded by the transaction's own timeouts and its outcome is the
        // truth (returning 'contended' for a write that may commit would lie
        // to the seller); only a job still WAITING is cancelled.
        if (started) return await run;
        cancelled = true;
        return 'contended';
      } finally {
        if (timer !== undefined) clearTimeout(timer);
        escrowJobsInFlight.delete(characterId);
      }
    },

    grantCopy(accountId: number, characterId: number, slot: InvSlot): WocCustodyGrant {
      // Delivery straight into the buyer's bags, for a deal struck face to face.
      // Every refusal here is ORDINARY and none of them is an error: a buyer who
      // logged out, or whose bags are full, simply gets the parcel by mail
      // instead. The caller must therefore be able to fall back, and this must
      // leave nothing behind when it declines.
      const session = host.wocCustodySession(characterId);
      if (!session) return { ok: false, reason: 'offline' };
      if (session.accountId !== accountId) return { ok: false, reason: 'not_yours' };
      if (!host.sim.grantTradableCopy(session.pid, slot)) return { ok: false, reason: 'no_space' };
      const snap = host.serializeCharacterForPersist(characterId);
      if (!snap) {
        // Defensive: today resolve() and the persist snapshot share their
        // preconditions with grantTradableCopy and no await separates them,
        // so this branch is unreachable, but nothing PINS that coincidence.
        // If it ever fires, the grant has already mutated the LIVE bags and a
        // teardown's ordinary flush may still persist them, so this is NOT a
        // clean refusal the caller may mail over (that would be the second
        // copy): it is ambiguous, and ambiguity parks.
        return { ok: false, reason: 'ambiguous' };
      }
      return {
        ok: true,
        save: {
          characterId,
          level: snap.level,
          state: snap.state,
          leaseNonce: session.leaseNonce,
        },
      };
    },

    snapshotCopy(accountId: number, characterId: number): WocCustodyGrant {
      // Re-serialize a live session WITHOUT granting anything: the resume arm
      // of a direct hand-off whose atomic save threw mid-flight. The caller
      // has proven (via its pendingGrants session identity) that these live
      // bags already hold the earlier grant, so persisting this snapshot
      // retries the delivery without minting a second copy.
      const session = host.wocCustodySession(characterId);
      if (!session) return { ok: false, reason: 'offline' };
      if (session.accountId !== accountId) return { ok: false, reason: 'not_yours' };
      const snap = host.serializeCharacterForPersist(characterId);
      if (!snap) return { ok: false, reason: 'offline' };
      return {
        ok: true,
        save: {
          characterId,
          level: snap.level,
          state: snap.state,
          leaseNonce: session.leaseNonce,
        },
      };
    },

    restoreCopy(characterId: number, slot: InvSlot): void {
      const session = host.wocCustodySession(characterId);
      if (session) {
        restoreInto(host, session.pid, slot);
        return;
      }
      // The seller logged out between extraction and the refused persist (a
      // narrow race): the leave flush already saved bags without the copy, so
      // hand it back by return parcel instead. Best-effort persist; the
      // parcel also rides the next ordinary mail save.
      host.sim.mailSystemParcel(
        { key: String(characterId), name: String(characterId) },
        WOC_MARKET_RETURN_LETTER,
        [slot],
      );
      void host.persistMailBlob().catch(() => {});
    },

    async persistMailParcel(
      recipient: { key: string; name: string },
      letter: 'delivery' | 'return' | 'sold_notice',
      items: InvSlot[],
      custodyRef: string,
    ): Promise<void> {
      // The BOOLEAN matters and must not be dropped. Discarding it let
      // bookCustodyOnce mark the ref booked and the settlement advance to
      // 'delivered' against a letter carrying nothing, which is the silent item
      // loss the refusal exists to prevent.
      //
      // But false has TWO causes and only one is a failure: goods were offered
      // and none survived validation (a real refusal), OR this custodyRef is
      // already booked in the blob (a retry, which is success). Treating both as
      // fatal would wedge the recovery path forever: a pass that booked the
      // parcel but died before markCustodyRefBooked would throw on every
      // retry, so the settlement could never advance. hasCustodyParcel is what
      // tells them apart.
      if (
        !host.sim.mailSystemParcel(recipient, LETTERS[letter], items, custodyRef) &&
        !host.sim.hasCustodyParcel(custodyRef)
      ) {
        // Genuine refusal: no parcel exists under this ref. Throwing lands in
        // the caller's failure path, which KEEPS the claim unbooked and
        // visible for the operator (bookCustodyOnce parks it: the attempt is
        // already marked written, so only a parcel's own presence in the book
        // could authorize a retry, and a refused parcel is never in the
        // book). The item stays visibly held instead of vanishing.
        throw new Error(`woc_market: mail parcel refused for custodyRef ${custodyRef}`);
      }
      // Failure here PROPAGATES too: the caller must not advance its settlement
      // or dispose flag until the blob holding the parcel is durable. The
      // in-memory letter stays booked; the custodyRef dedupe makes the retry
      // (this process) or the re-book (after a restart) exactly-once.
      await host.persistMailBlob();
    },

    hasParcel(custodyRef: string): boolean {
      // Advisory by nature: a collected letter can be deleted, so absence
      // never proves the parcel was not sent. The resume paths treat
      // presence as permission and absence as ambiguity (woc_market.ts
      // bookCustodyOnce).
      return host.sim.hasCustodyParcel(custodyRef);
    },
  };
}

/** Silent add-back of an extracted copy (escrow compensation): the player
 *  never observably lost the item, so no loot toast fires. */
function restoreInto(host: WocCustodyGameHost, pid: number, slot: InvSlot): void {
  if (slot.instance) {
    host.sim.addItemInstance(slot.itemId, slot.instance, pid, slot.count, {
      silent: true,
      ...(slot.craftedRecipeId === undefined ? {} : { craftedRecipeId: slot.craftedRecipeId }),
    });
  } else {
    host.sim.addItem(slot.itemId, slot.count, pid, {
      silent: true,
      ...(slot.craftedRecipeId === undefined ? {} : { craftedRecipeId: slot.craftedRecipeId }),
    });
  }
}
