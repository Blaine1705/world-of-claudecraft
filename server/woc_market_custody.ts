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
import type { Sim } from '../src/sim/sim';
import type { InvSlot } from '../src/sim/types';
import type { WocCustodyExtract, WocMarketCustody } from './woc_market';

/** The narrow slice of GameServer the custody module consumes (game.ts
 *  wocCustodySession / persistMailBlob plus the public sim). */
export interface WocCustodyGameHost {
  sim: Sim;
  wocCustodySession(characterId: number): {
    pid: number;
    accountId: number;
    name: string;
    leaseNonce: string | undefined;
  } | null;
  persistMailBlob(): Promise<void>;
}

const LETTERS = {
  delivery: WOC_MARKET_DELIVERY_LETTER,
  return: WOC_MARKET_RETURN_LETTER,
  sold_notice: WOC_MARKET_SOLD_LETTER,
} as const;

export function createWocMarketCustody(host: WocCustodyGameHost): WocMarketCustody {
  return {
    extractCopy(accountId: number, characterId: number, ref: ExtractRef): WocCustodyExtract {
      const session = host.wocCustodySession(characterId);
      // Listing requires the seller online in this realm process: the live
      // bags are the source of truth, and the lease nonce fences the save.
      if (!session) return { ok: false, reason: 'offline' };
      if (session.accountId !== accountId) return { ok: false, reason: 'not_yours' };
      const out = host.sim.extractTradableCopy(session.pid, ref);
      if (!out.ok) return out;
      const state = host.sim.serializeCharacter(session.pid);
      if (!state) {
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
          level: state.level,
          state,
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
        !host.sim.postOffice.hasCustodyParcel(custodyRef)
      ) {
        // Genuine refusal: nothing is booked under this ref. Throwing lands in
        // the caller's failure path (release the claim, retry on a later sweep
        // pass), so the item stays visibly held instead of vanishing.
        throw new Error(`woc_market: mail parcel refused for custodyRef ${custodyRef}`);
      }
      // Failure here PROPAGATES too: the caller must not advance its settlement
      // or dispose flag until the blob holding the parcel is durable. The
      // in-memory letter stays booked; the custodyRef dedupe makes the retry
      // (this process) or the re-book (after a restart) exactly-once.
      await host.persistMailBlob();
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
