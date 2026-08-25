// Personal-bank wire glue: the six bank command-case bodies, extracted from
// server/game.ts behind a narrow host interface (the vault_wire.ts seam:
// none of this needs GameServer's private state, and game.ts stays a thin
// consumer whose dispatch case group keeps a one-line call into this module).
//
// The three slot-bank bodies (deposit / withdraw / buy_slots) moved here
// VERBATIM in Bank Storage phase 07, paying for the three socket case labels
// the same phase adds: server/game.ts sits at a deliberate zero-margin
// monolith ceiling (tests/monolith_budget.test.ts), so new dispatch surface
// lands in a sibling and the ceiling is lowered, never raised.
//
// Shape-only checks here (the bank_* idiom): the Sim owns every gameplay rule
// (banker proximity, capacity, quest-bind, alive-state, exact copper, unlock
// order, the payload-free socket rule, the carried-side unsocket fit). NOTE
// the two senses of `slot` in this one family: on bank_deposit/bank_withdraw
// it is a BANK container index (with `count` optional), while on
// bank_socket_bag it is a CARRIED inventory index naming the exact copy (the
// equip_bag wire shape verbatim: `item` + optional integer `socket` +
// optional integer `slot`), so one client idiom covers both socket families.
//
// The bank_ledger observer is WIRED on the same terms as the vault cases:
// OBSERVATIONAL and fire-and-forget, never awaited and never a gameplay
// dependency. The sim methods return void and emit no success event, so the
// recorders derive success by DIFFING the bankInfoFor snapshot before and
// after each call; a refused/no-op call diffs empty and writes no row.
import { bankPurchasedSlotsFor } from '../src/sim/bank';
import type { BankInfo } from '../src/world_api';
import { recordBankOp, recordBankSocketOp } from './bank_ledger';
import { storagePurchaseInFlight } from './storage_purchases';
import { nextRungClaudiumPriceFor } from './storage_store_cache';

/** The slice of Sim the bank dispatch bodies call; a narrow host interface so
 *  a Vitest drives the bodies without a GameServer. bankSocketBag's third
 *  parameter is the pid arm of the Sim delegate's pid-or-target fold. `ctx`
 *  is the structural sliver of the public Sim.ctx the purchase-lock refusal
 *  line needs (the real SimContext satisfies it; a test hand-rolls it). */
export interface BankSim {
  ctx: {
    // `bank` is the ladder counter emitBankSelfKeys reads through the shared
    // sim helper; `entityId` is what the purchase-lock refusal line addresses.
    resolve(pid?: number): { meta: { entityId: number; bank: { purchasedSlots: number } } } | null;
    error(id: number, text: string): void;
  };
  bankInfoFor(pid: number): BankInfo | null;
  bankDeposit(slot: number, count?: number, pid?: number): void;
  bankWithdraw(slot: number, count?: number, pid?: number): void;
  bankBuySlots(pid?: number): void;
  bankUnlockSocket(pid?: number): void;
  bankSocketBag(itemId: string, socket?: number, pid?: number, slotIndex?: number): void;
  bankUnsocketBag(socket: number, pid?: number): void;
}

export type BankCommandName =
  | 'bank_deposit'
  | 'bank_withdraw'
  | 'bank_buy_slots'
  | 'bank_unlock_socket'
  | 'bank_socket_bag'
  | 'bank_unsocket_bag';

export function dispatchBankCommand(
  sim: BankSim,
  who: { characterId: number; accountId: number },
  cmd: BankCommandName,
  msg: Record<string, unknown>,
  pid: number,
): void {
  switch (cmd) {
    case 'bank_deposit':
      if (typeof msg.slot === 'number') {
        const before = sim.bankInfoFor(pid);
        sim.bankDeposit(msg.slot, typeof msg.count === 'number' ? msg.count : undefined, pid);
        recordBankOp('deposit', who, before, sim.bankInfoFor(pid));
      }
      break;
    case 'bank_withdraw':
      if (typeof msg.slot === 'number') {
        const before = sim.bankInfoFor(pid);
        sim.bankWithdraw(msg.slot, typeof msg.count === 'number' ? msg.count : undefined, pid);
        recordBankOp('withdraw', who, before, sim.bankInfoFor(pid));
      }
      break;
    case 'bank_buy_slots': {
      // A Claudium storage purchase holds this character's purchase mutex
      // from initiation until slot application (server/storage_purchases.ts);
      // a gold rung landing inside that window is exactly the interleaved
      // ladder move the mutex exists to refuse, so the fit check the spend
      // already passed stays true at apply time.
      if (storagePurchaseInFlight(who.characterId)) {
        const entityId = sim.ctx.resolve(pid)?.meta.entityId;
        if (entityId !== undefined) {
          sim.ctx.error(entityId, 'Your bank has a purchase in progress.');
        }
        break;
      }
      const before = sim.bankInfoFor(pid);
      sim.bankBuySlots(pid);
      // The gold rail stamps its paid-with dimension from the server-derived
      // path (never the request); the Claudium rail's twin row is written by
      // the purchase flow's apply site.
      recordBankOp('buy_slots', who, before, sim.bankInfoFor(pid), { paidWith: 'gold' });
      break;
    }
    // The socket trio (Bank Storage phase 07). One socket differ observes all
    // three: the sim mutates only what the command legitimately moves, so the
    // before/after socket diff IS the op record (a swap yields its two rows).
    case 'bank_unlock_socket': {
      // Argument-free like bank_buy_slots: the Sim charges the table price for
      // the next socket in order, or refuses without mutating anything.
      const before = sim.bankInfoFor(pid);
      sim.bankUnlockSocket(pid);
      recordBankSocketOp(who, before, sim.bankInfoFor(pid));
      break;
    }
    case 'bank_socket_bag':
      if (typeof msg.item === 'string') {
        // The equip_bag gate shapes, verbatim: a present-but-malformed socket
        // or slot reads as undefined (first-empty scan / legacy newest-first
        // walk), never as index 0; the sim re-validates range and ownership.
        const socket =
          typeof msg.socket === 'number' && Number.isInteger(msg.socket) ? msg.socket : undefined;
        const slot = Number.isInteger(msg.slot) ? Number(msg.slot) : undefined;
        const before = sim.bankInfoFor(pid);
        sim.bankSocketBag(msg.item, socket, pid, slot);
        recordBankSocketOp(who, before, sim.bankInfoFor(pid));
      }
      break;
    case 'bank_unsocket_bag':
      if (typeof msg.socket === 'number' && Number.isInteger(msg.socket)) {
        const before = sim.bankInfoFor(pid);
        sim.bankUnsocketBag(msg.socket, pid);
        recordBankSocketOp(who, before, sim.bankInfoFor(pid));
      }
      break;
    default: {
      // Closes the union from this end too: a seventh BankCommandName member
      // whose case is missing here is a compile error, never a silent drop.
      const unhandled: never = cmd;
      throw new Error(`unhandled bank command: ${unhandled as string}`);
    }
  }
}

/** The owner-only bank snapshot the encoder sends (Bank Storage phase 11):
 *  the sim's proximity-gated readout, augmented server-side with the next
 *  rung's Claudium price from the cached service store, joined against THIS
 *  character's ladder position. Never on a broadcast snapshot: the caller is
 *  the per-session self block. The field is simply absent when the cache
 *  has no answer (service unreachable, ladder full, offline catalog), which
 *  is the graceful-degradation contract the client renders as gold alone. */
export function bankInfoForWire(
  sim: BankSim,
  session: { pid: number; accountId: number },
): BankInfo | null {
  const info = sim.bankInfoFor(session.pid);
  if (!info) return null;
  const price = nextRungClaudiumPriceFor(info.purchasedSlots, session.accountId);
  return price === undefined ? info : { ...info, nextRungClaudiumPrice: price };
}

/** The bank family's two owner-only self-block keys, emitted through the
 *  caller's delta-eliding `maybe`. game.ts keeps a one-line call; the posture of
 *  each key is documented HERE, beside the emission, so a reader who changes one
 *  sees why the two are keyed differently.
 *
 *  - `bank` is null unless the player stands at a banker, so it only rides the
 *    wire for players browsing their deposit box (the mail pattern). Not
 *    heavy-gated: it appears from proximity, not this session's own commands.
 *    bankInfoForWire joins the cached next-rung Claudium price. Keyed on the
 *    ANCHOR session, so a spectating moderator sees the SPECTATED character's
 *    box, the posture every proximity-gated owner-only key shares.
 *  - `bpsl` is the ALWAYS-AVAILABLE ladder counter (Bank Storage phase 15,
 *    ruling 17). The Strongbox store opens anywhere and gates its charter list
 *    on it, so it cannot ride the proximity gate. Keyed on the VIEWING session
 *    rather than the anchor, and that is deliberate in both directions: this
 *    number decides what the VIEWER may buy with the VIEWER's own Claudium, and
 *    keying it on the anchor would let it move DOWN on a spectate enter, voiding
 *    the monotonicity the client's fit gate rests on (src/world_api/bank.ts).
 *    Still owner-only and self-block-only: it never enters the interest-scoped
 *    entity broadcast, and a viewer only ever receives their own.
 *
 *  Both ride the caller's delta elision: an unchanged value omits its key
 *  entirely, which the client reads as unchanged and never as absent.
 *
 *  WHY `bpsl` NEEDS NO CADENCE GATE, and the condition under which it would.
 *  It is a SCALAR. `maybe` stringifies unconditionally, before its diff, so the
 *  build is two Map lookups and the stringify is free; the elision then keeps it
 *  off the wire entirely until the count moves. That is the opposite of `cvault`,
 *  whose 4 Hz gate (CVAULT_WIRE_HZ, server/vault_wire.ts) exists because its
 *  BUILD is expensive in the common case. Widen this key to a record (a
 *  bonus-slot breakdown, a per-rung state, a price join like `bank` does) and
 *  the unconditional stringify stops being free: re-open the cadence question
 *  then, and not before. A gate today would also delay the charter list by up to
 *  a period after a purchase, which is the blindness ruling 17 exists to close.
 *
 *  PARAMETER ORDER IS LOAD-BEARING and only structurally typed: passing
 *  `anchorSession` in the `session` slot type-checks and would leak the
 *  SPECTATED character's count to a moderator's own store. There is exactly ONE
 *  server call site by design (game.ts), which also keeps the `emit` call site
 *  monomorphic on a 20 Hz path. The behaviour is pinned end to end by the
 *  "follows the VIEWER, not the spectate anchor" arm in tests/bank_wire.test.ts. */
export function emitBankSelfKeys(
  emit: (key: string, value: unknown) => void,
  sim: BankSim,
  session: { pid: number },
  anchorSession: { pid: number; accountId: number },
): void {
  emit('bank', bankInfoForWire(sim, anchorSession));
  emit('bpsl', bankPurchasedSlotsFor(sim.ctx, session.pid));
}
