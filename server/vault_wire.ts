// Materials Vault wire glue: the vault command dispatch bodies, the cvault
// snapshot cadence rule, and the per-tick vaultCraftConsume batch, extracted
// from server/game.ts behind narrow host interfaces (the module-first seam:
// none of this needs GameServer's private state). game.ts stays a thin
// consumer: its dispatch cases, self-block emission, and event drain each
// keep a one-line call into this module.
//
// Wire posture (moved verbatim from the game.ts self-block emission):
// - `vault` rides beside `bank` on the same proximity gate (sim vaultInfoFor
//   is null unless the player stands at a banker) and is SELF-BLOCK-ONLY: a
//   private per-character store, so it never enters the interest-scoped
//   entity broadcast and rides only the ANCHOR session's self block. Under
//   moderator spectate the anchor is re-pointed at the spectated character,
//   so a spectating moderator sees the SPECTATED player's vault in their own
//   self block, exactly the posture bank and guildBank have. Not heavy-gated,
//   for bank's reason. It is the third per-session nearBanker scan plus
//   stringify on that path (bank, vault, guildBank), but the common away path
//   is the cheap one: vaultInfoFor early-returns null before it clones any
//   stock, and the unchanged null then delta-elides.
// - `cvault` (the craft-from-vault stock view, Bank Storage Phase 04) has the
//   SAME owner-only self-block posture, but is gated on the craft-draw
//   context predicate (src/sim/vault_craft_gate.ts) instead of banker
//   proximity, because crafting happens at stations and in the open world
//   where vaultInfo is deliberately null. The sim computes the gate
//   (server-authoritative; the client folds a non-null record into the
//   crafting window with zero context logic of its own), so entering an
//   instanced context flips it to an explicit null on the next evaluation
//   and the delta elides it while unchanged. Rows are pre-filtered to the
//   drawable rule, so the payload is bounded by the material set like the
//   vault key. CADENCE-GATED, unlike vault, because the cost property
//   inverts (see CVAULT_WIRE_HZ): off-cadence snapshots omit the key, which
//   the client reads as unchanged.
import type { SimEvent } from '../src/sim/types';
import { DT } from '../src/sim/types';
import type { VaultInfo } from '../src/world_api';
import { recordVaultCraftConsume, recordVaultOp, type VaultCraftConsumption } from './bank_ledger';

/** The cvault snapshot cadence. The gate exists because cvault INVERTS the
 *  vault key's cost property: vaultInfoFor is null (cheap) away from a
 *  banker, while craftVaultStockFor is non-null for every open-world player,
 *  so the expensive path (the place-gate pool scans, the drawable clone, the
 *  stringify diff) would otherwise run per player per tick in the COMMON
 *  case. 4 Hz keeps the crafting window's counts fresh within 250ms, well
 *  inside the family's staleness envelope; off-cadence snapshots simply omit
 *  the key (omission means unchanged on the client). */
export const CVAULT_WIRE_HZ = 4;
export const CVAULT_WIRE_INTERVAL_TICKS = Math.max(1, Math.round(1 / (DT * CVAULT_WIRE_HZ)));

/** The slice of Sim the vault dispatch bodies call; a narrow host interface
 *  so a Vitest drives the bodies without a GameServer. */
export interface VaultSim {
  vaultInfoFor(pid?: number): VaultInfo | null;
  vaultDeposit(slot: number, count?: number, pid?: number): void;
  vaultWithdraw(itemId: string, count?: number, pid?: number): void;
  vaultDepositAll(pid?: number): void;
  vaultBuyUpgrade(pid?: number): void;
}

export type VaultCommandName =
  | 'vault_deposit'
  | 'vault_withdraw'
  | 'vault_deposit_all'
  | 'vault_buy_upgrade';

/** The four vault command-case bodies, moved verbatim from dispatchMessage.
 *  Shape-only checks here (the bank_* idiom): the Sim owns every gameplay
 *  rule (banker proximity, material scope, the per-material cap, the exact
 *  upgrade copper). Deposit takes a carried-inventory index in `slot` with an
 *  optional partial `count`; withdraw is keyed by `itemId` because vault
 *  stock has no slots.
 *  The bank_ledger observer is WIRED (container='vault'), on the same terms
 *  as the bank cases: OBSERVATIONAL and fire-and-forget, never awaited and
 *  never a gameplay dependency. The sim methods return void and emit no
 *  success event, so recordVaultOp derives success by DIFFING the
 *  vaultInfoFor snapshot before and after each call, never from the absence
 *  of an exception; a refused/no-op call diffs empty and writes no row. */
export function dispatchVaultCommand(
  sim: VaultSim,
  who: { characterId: number; accountId: number },
  cmd: VaultCommandName,
  msg: Record<string, unknown>,
  pid: number,
): void {
  switch (cmd) {
    case 'vault_deposit':
      if (typeof msg.slot === 'number') {
        const before = sim.vaultInfoFor(pid);
        sim.vaultDeposit(msg.slot, typeof msg.count === 'number' ? msg.count : undefined, pid);
        recordVaultOp('deposit', who, before, sim.vaultInfoFor(pid));
      }
      break;
    case 'vault_withdraw':
      if (typeof msg.itemId === 'string') {
        const before = sim.vaultInfoFor(pid);
        sim.vaultWithdraw(msg.itemId, typeof msg.count === 'number' ? msg.count : undefined, pid);
        recordVaultOp('withdraw', who, before, sim.vaultInfoFor(pid));
      }
      break;
    case 'vault_deposit_all': {
      // Argument-free (the sweep takes the whole carried inventory), so no
      // shape guard; the Sim owns every per-slot rule. ONE before/after diff
      // spans the whole batch, so recordVaultOp writes the sweep's rows (one
      // per material moved) as ONE batched insert.
      const before = sim.vaultInfoFor(pid);
      sim.vaultDepositAll(pid);
      recordVaultOp('deposit', who, before, sim.vaultInfoFor(pid));
      break;
    }
    case 'vault_buy_upgrade': {
      const before = sim.vaultInfoFor(pid);
      sim.vaultBuyUpgrade(pid);
      recordVaultOp('buy_slots', who, before, sim.vaultInfoFor(pid));
      break;
    }
    default: {
      // Closes the union from this end too: a fifth VaultCommandName member
      // whose case is missing here is a compile error, never a silent drop.
      const unhandled: never = cmd;
      throw new Error(`unhandled vault command: ${unhandled as string}`);
    }
  }
}

/** The cvault dueness tracker (a `>=` gate, never tickCount % N, per the
 *  broadcast cadence rule in server/CLAUDE.md): true at most once per
 *  CVAULT_WIRE_INTERVAL_TICKS per session, advancing the session's marker.
 *  Named as a TAKE, not a query: the true arm consumes this interval's turn,
 *  so a second call in the same pass returns false. The comparison keeps the
 *  original inline gate's `>=` form verbatim (its NaN behavior included). */
export function takeCvaultWireTurn(
  session: { lastCvaultWireTick: number },
  tickCount: number,
): boolean {
  if (tickCount - session.lastCvaultWireTick >= CVAULT_WIRE_INTERVAL_TICKS) {
    session.lastCvaultWireTick = tickCount;
    return true;
  }
  return false;
}

/** The per-tick vaultCraftConsume drain (Bank Storage Phase 04): observer
 *  only. The craft resolved inside sim.tick(), so the event IS the
 *  dispatch-bracket-less record of what left the vault. Consumptions
 *  accumulate across the event loop (the deed-unlock idiom) and flush as ONE
 *  batched ledger insert, so a tick where N players complete casts costs one
 *  insert instead of N sequential FIFO round trips. Bots have no session, so
 *  the clients lookup filters them naturally, and no client message reaches
 *  this path: the sim alone emits vaultCraftConsume. Flush is fire-and-forget
 *  FIFO inside the recorder (the recordVaultOp discipline; event order within
 *  the tick is preserved). */
export class VaultCraftConsumeBatch {
  private readonly consumes: VaultCraftConsumption[] = [];

  constructor(
    private readonly clients: ReadonlyMap<number, { characterId: number; accountId: number }>,
  ) {}

  // SimEvent, not a widened structural shape: a sim-side reshape of the
  // vaultCraftConsume variant must break the build here, never degrade into
  // silently skipped audit rows (takes and upgrades are REQUIRED on the
  // narrowed variant, so no fallback defaults exist to hide one).
  offer(ev: SimEvent): void {
    if (ev.type !== 'vaultCraftConsume' || ev.pid === undefined) return;
    const who = this.clients.get(ev.pid);
    if (who) {
      this.consumes.push({ who, takes: ev.takes, upgrades: ev.upgrades });
    }
  }

  flush(): void {
    if (this.consumes.length > 0) recordVaultCraftConsume(this.consumes);
    // Drain on flush so a reused instance (a plausible phase 06+ per-tick
    // allocation cleanup) can never re-insert prior ticks' rows or grow
    // without bound.
    this.consumes.length = 0;
  }
}
