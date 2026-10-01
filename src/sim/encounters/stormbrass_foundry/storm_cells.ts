// The Prime Draft's Storm Cells (G12 carryable encounter objects, docs/design/
// dungeon-rework/stormbrass_foundry.md 5.4): a glowing battery a rack ejects
// onto the Gantry floor. Any player takes it with the interact key (or a click
// on it); the carrier suffers Static (30 a second, +5 every 2 s held) and moves
// at 70 percent; the interact key drops it again, and whoever dropped it cannot
// take it back for 3 s. A cell not slotted into the Core Hatch within 15 s of
// its ejection shorts out over the whole gantry (prime_draft.ts owns the hatch
// and the short-out; this module owns the carry).
//
// Server-authoritative: the take and the drop are the ordinary interact and
// pick-up commands (interaction.ts routes them here first), so the online
// client needs no new command. The carry rides an aura on the carrier
// (DRAFT_CELL_CARRY: a slow, stacks = the Static a second, sourceId = the
// hatch ring) and the floor cell is an encounter object, so every client
// mirrors it with no wire change. Zero rng.

import type { InstanceSlot } from '../../sim';
import type { SimContext } from '../../sim_context';
import { dist2d, type Entity, type PrimeDraftFightState, type StormCellState } from '../../types';
import {
  claimBoss,
  dropAuraById,
  dropEncounterObject,
  foundryClaims,
  spawnFoundryObject,
} from './claim';
import {
  DRAFT_CELL_CARRY,
  FOUNDRY_CELL_TEMPLATES,
  PRIME_DRAFT_ID,
  staticPerSecond,
  DRAFT_TUNING as T,
} from './ids';

/** Is this entity a Storm Cell lying on the floor (taken or still rolling)? */
export function isStormCellObject(e: Entity): boolean {
  return (
    e.kind === 'object' &&
    (e.templateId === FOUNDRY_CELL_TEMPLATES.ready ||
      e.templateId === FOUNDRY_CELL_TEMPLATES.rolling)
  );
}

/** The Prime Draft fight (and its claim) a cell object or a carrier belongs to. */
function findCellFight(
  ctx: SimContext,
  match: (st: PrimeDraftFightState) => StormCellState | undefined,
): { inst: InstanceSlot; boss: Entity; st: PrimeDraftFightState; cell: StormCellState } | null {
  for (const inst of foundryClaims(ctx)) {
    const boss = claimBoss(ctx, inst, PRIME_DRAFT_ID);
    const st = boss?.foundryFight;
    if (!boss || st?.kind !== 'prime_draft') continue;
    const cell = match(st);
    if (cell) return { inst, boss, st, cell };
  }
  return null;
}

/** The cell a player carries, or null. */
export function carriedCell(ctx: SimContext, p: Entity): StormCellState | null {
  return findCellFight(ctx, (st) => st.cells.find((c) => c.carrierId === p.id))?.cell ?? null;
}

/** Put a cell on the floor at (x, z) world (its pickup object). */
export function layCell(
  ctx: SimContext,
  inst: InstanceSlot,
  cell: StormCellState,
  x: number,
  z: number,
  rolling: boolean,
): Entity {
  const obj = spawnFoundryObject(
    ctx,
    inst,
    rolling ? FOUNDRY_CELL_TEMPLATES.rolling : FOUNDRY_CELL_TEMPLATES.ready,
    'Storm Cell',
    x,
    z,
    T.pickupRange,
  );
  // Taken with the interact key or a click (interaction.ts routes the pick-up
  // here); a rolling cell cannot be taken until it settles.
  obj.lootable = !rolling;
  cell.objectId = obj.id;
  cell.carrierId = null;
  return obj;
}

/** The carrier's aura: the slow, the Static a second, the hatch to read. */
export function wearCarry(
  ctx: SimContext,
  p: Entity,
  st: PrimeDraftFightState,
  cell: StormCellState,
): void {
  dropAuraById(p, DRAFT_CELL_CARRY);
  const left = Math.max(0.05, T.cellLife - cell.age);
  ctx.applyAura(p, {
    id: DRAFT_CELL_CARRY,
    name: 'Storm Cell',
    kind: 'slow',
    remaining: left,
    duration: T.cellLife,
    value: T.carrySlow,
    stacks: staticPerSecond(cell.held),
    // The hatch ring: the HUD reads whether it is closed, shuddering or open.
    sourceId: st.hatchId ?? p.id,
    school: 'nature',
    undispellable: true,
    unbreakableControl: true,
  });
}

/** Refresh the carrier aura's Static readout (its stacks) as it rises. */
export function refreshCarry(p: Entity, cell: StormCellState): void {
  const a = p.auras.find((x) => x.id === DRAFT_CELL_CARRY);
  if (a) a.stacks = staticPerSecond(cell.held);
}

/** Take a cell off the floor. Returns true when the press was the cell's
 *  (taken or refused with a reason); false when the object is not a cell. */
export function tryTakeStormCell(ctx: SimContext, obj: Entity, p: Entity): boolean {
  if (!isStormCellObject(obj)) return false;
  const found = findCellFight(ctx, (st) => st.cells.find((c) => c.objectId === obj.id));
  if (!found) return true;
  const { st, cell } = found;
  if (obj.templateId !== FOUNDRY_CELL_TEMPLATES.ready) {
    ctx.error(p.id, 'The Storm Cell is still rolling.');
    return true;
  }
  if (dist2d(p.pos, obj.pos) > T.pickupRange + 0.5) {
    ctx.error(p.id, 'Too far away.');
    return true;
  }
  if (st.cells.some((c) => c.carrierId === p.id)) {
    ctx.error(p.id, 'You are already carrying a Storm Cell.');
    return true;
  }
  if (cell.droppedBy === p.id && ctx.time < cell.retakeAt) {
    ctx.error(p.id, 'The Storm Cell is still crackling from your grip.');
    return true;
  }
  dropEncounterObject(ctx, found.inst, obj.id);
  cell.objectId = null;
  cell.carrierId = p.id;
  cell.held = 0;
  cell.tick = 1;
  wearCarry(ctx, p, st, cell);
  ctx.emit({
    type: 'spellfx',
    sourceId: p.id,
    targetId: p.id,
    school: 'nature',
    fx: 'selfCast',
    ability: DRAFT_CELL_CARRY,
  });
  return true;
}

/** Let go of the cell a carrier holds, at their feet (`lockOut`: the same
 *  player cannot take it back for a while). Returns true when one was held. */
export function releaseCell(
  ctx: SimContext,
  inst: InstanceSlot,
  cell: StormCellState,
  p: Entity,
  lockOut: boolean,
): void {
  dropAuraById(p, DRAFT_CELL_CARRY);
  cell.droppedBy = lockOut ? p.id : null;
  cell.retakeAt = lockOut ? ctx.time + T.retakeLock : 0;
  cell.held = 0;
  layCell(ctx, inst, cell, p.pos.x, p.pos.z, false);
}

/** The interact press while carrying a cell: drop it at your feet. Returns
 *  true when the press was spent on it. */
export function tryDropStormCell(ctx: SimContext, p: Entity): boolean {
  const found = findCellFight(ctx, (st) => st.cells.find((c) => c.carrierId === p.id));
  if (!found) return false;
  releaseCell(ctx, found.inst, found.cell, p, true);
  return true;
}
