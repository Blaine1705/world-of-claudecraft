// The Prime Draft in its Gantry (docs/design/dungeon-rework/stormbrass_foundry.md
// 5.4): carry a storm cell into its open chest (G12, storm_cells.ts).
//
//   Awakening       pulled, it wakes in its scaffold: a 3 s bar, then the fight.
//   Charge Cycle    every 30 s (from 15 s; 25 s once Heartless) a rack, west
//                   then east, ejects a Storm Cell onto the floor. Take it with
//                   the interact key; the carrier suffers Static and a slow and
//                   can drop it for someone else.
//   Core Hatch      5 s after each ejection the chest hatch opens for 6 s (3 s
//                   of shuddering first). A carrier inside the gold ring in
//                   front of the open hatch slots the cell: Overload, it is
//                   stunned 6 s and takes 25 percent more damage for 12 s. A
//                   cell carried into a CLOSED hatch's ring arcs back (190 to
//                   210 to the carrier and anyone within 5 yd); a cell not
//                   slotted 15 s after its ejection shorts out over the gantry.
//   Bolted (100-70) its feet are bolted into the gantry: it drags them after
//                   its target at a crawl (never past the Gantry's edge),
//                   Piston Fist slams a player's spot (8 yd, 2 s) and Arm
//                   Sweep covers 120 degrees in front of it (the tank's side).
//   Unbolted (70)   it tears its feet free in a shower of rivets and walks
//                   slowly; Tremor Step every 10 s (a 1.5 s bar, 10 yd).
//   Heartless (35)  its chest flares: Arc Surge every 15 s hits the three
//                   players nearest it; the Charge Cycle quickens; below 15
//                   percent it overdrives (+30 percent damage).
//   Heroic          Jammed Racks (an ejected cell rolls 3 s before it can be
//                   taken) and Double Load (both racks eject; one cell alone
//                   only stuns 2 s, two in the same window are a full Overload).
//
// On its death it kneels and its hatch falls open: the Draft Record lies in
// its chest (a quest object). The deed (Heartless): three Overloads in one
// fight. Deterministic: the fist's victim and the surge's three are hashed or
// distance ordered (ties by id), the racks alternate; the only rng draws are
// damage rolls. Every visible state rides existing fields: the bars, the
// Bolted / Overloaded / Overdrive auras, the hatch ring's template (closed,
// warn, open) and the cells' and the fist marks' objects.

import { CELL_RACKS, GANTRY } from '../../content/stormbrass_foundry_layout';
import { MOBS } from '../../data';
import { createGroundObject } from '../../entity';
import { inCone } from '../../mob/trash_kit/targets';
import { emitMobYell } from '../../mob/yells';
import type { InstanceSlot } from '../../sim';
import type { SimContext } from '../../sim_context';
import {
  angleTo,
  DT,
  dist2d,
  type Entity,
  type PrimeDraftFightState,
  type StormCellState,
} from '../../types';
import {
  arenaPlayers,
  claimPlayers,
  clearCastIf,
  dropAuraById,
  dropEncounterObject,
  grantClaimDeed,
  mechanicDamage,
  pickMarkTargets,
  spawnFoundryObject,
  startBar,
} from './claim';
import {
  DRAFT_ARC_BACK,
  DRAFT_ARC_SURGE,
  DRAFT_ARM_SWEEP,
  DRAFT_AWAKEN,
  DRAFT_BOLTED,
  DRAFT_CELL_CARRY,
  DRAFT_CHARGE_CYCLE,
  DRAFT_ENRAGE,
  DRAFT_OVERLOAD,
  DRAFT_OVERLOADED,
  DRAFT_PISTON_FIST,
  DRAFT_RECORD_ITEM,
  DRAFT_SHORT_OUT,
  DRAFT_TREMOR_STEP,
  DRAFT_UNBOLT,
  FOUNDRY_CELL_TEMPLATES,
  FOUNDRY_DUNGEON,
  FOUNDRY_FIST_MARK,
  FOUNDRY_HATCH_TEMPLATES,
  type HatchState,
  hatchStateAt,
  PRIME_DRAFT_ID,
  staticPerSecond,
  DRAFT_TUNING as T,
} from './ids';
import { layCell, refreshCarry, wearCarry } from './storm_cells';

export const PRIME_DRAFT_DEED = 'dgn_prime_draft_overload';
/** Overloads the deed asks for in one fight. */
export const PRIME_DRAFT_DEED_OVERLOADS = 3;

/** The chat lines (re-localized by src/ui/sim_i18n.ts). */
export const PRIME_DRAFT_LINES = {
  engage: 'The storm... moves... me. I. Stand.',
  unbolt: 'The gantry cannot hold me!',
  heartless: 'Lightning in my chest. No heart. No heart!',
  enrage: 'Every limit... broken.',
  death: 'The storm moves the metal... it cannot... give it a heart...',
  overloadLog: 'The Prime Draft overloads: lightning cascades through the colossus!',
  ejectLog: 'A charging rack ejects a Storm Cell onto the gantry floor!',
} as const;

function freshState(): PrimeDraftFightState {
  return {
    kind: 'prime_draft',
    phase: 'awaken',
    fistTimer: T.fistFirst,
    fists: [],
    sweepTimer: T.sweepFirst,
    sweepYaw: null,
    tremorTimer: T.tremorFirst,
    surgeTimer: T.surgeFirst,
    cycleTimer: T.cycleFirst,
    cycles: 0,
    cells: [],
    hatch: null,
    hatchId: null,
    overloads: 0,
    enraged: false,
    plantedAt: null,
    casts: 0,
  };
}

/** Players on the Gantry. */
export function gantryPlayers(ctx: SimContext, inst: InstanceSlot): Entity[] {
  return arenaPlayers(ctx, inst, claimPlayers(ctx, inst), GANTRY.x, GANTRY.z, GANTRY.r + 8);
}

/** The gold ring in front of the hatch (world coordinates). */
export function hatchRingCentre(boss: Entity): { x: number; z: number } {
  return {
    x: boss.pos.x + Math.sin(boss.facing) * T.hatchRingOut,
    z: boss.pos.z + Math.cos(boss.facing) * T.hatchRingOut,
  };
}

/** The hatch's state right now. */
export function hatchState(st: PrimeDraftFightState): HatchState {
  return st.hatch ? hatchStateAt(st.hatch.t) : 'closed';
}

function hatchObject(
  ctx: SimContext,
  inst: InstanceSlot,
  boss: Entity,
  st: PrimeDraftFightState,
): Entity {
  const have = st.hatchId !== null ? ctx.entities.get(st.hatchId) : undefined;
  if (have) return have;
  const c = hatchRingCentre(boss);
  const obj = spawnFoundryObject(
    ctx,
    inst,
    FOUNDRY_HATCH_TEMPLATES.closed,
    'Core Hatch',
    c.x,
    c.z,
    T.hatchRingRadius,
  );
  st.hatchId = obj.id;
  return obj;
}

/** Keep the ring in front of the chest and its look on the hatch's state. */
function paintHatch(
  ctx: SimContext,
  inst: InstanceSlot,
  boss: Entity,
  st: PrimeDraftFightState,
): void {
  const obj = hatchObject(ctx, inst, boss, st);
  const c = hatchRingCentre(boss);
  if (Math.abs(obj.pos.x - c.x) > 1e-6 || Math.abs(obj.pos.z - c.z) > 1e-6) {
    obj.pos = ctx.groundPos(c.x, c.z);
    ctx.rebucket(obj);
  }
  obj.facing = boss.facing;
  obj.templateId = FOUNDRY_HATCH_TEMPLATES[hatchState(st)];
}

function bolt(ctx: SimContext, boss: Entity): void {
  dropAuraById(boss, DRAFT_BOLTED);
  // A marker, not a root: bolted, it still drags its feet (boltedSpeed).
  ctx.applyAura(boss, {
    id: DRAFT_BOLTED,
    name: 'Bolted',
    kind: 'buff_dr',
    remaining: 3600,
    duration: 3600,
    permanent: true,
    value: 0,
    sourceId: boss.id,
    school: 'physical',
    undispellable: true,
    unbreakableControl: true,
  });
}

/** A rack (west, then east; heroic Double Load: both) ejects a Storm Cell. */
export function chargeCycle(
  ctx: SimContext,
  inst: InstanceSlot,
  boss: Entity,
  st: PrimeDraftFightState,
): number {
  const heroic = inst.difficulty === 'heroic';
  st.cycleTimer = st.phase === 'heartless' ? T.heartlessCycleEvery : T.cycleEvery;
  const racks = heroic ? [0, 1] : [st.cycles % CELL_RACKS.length];
  st.cycles++;
  const o = ctx.instanceOriginOf(inst);
  for (const r of racks) {
    const rack = CELL_RACKS[r];
    // A step out from the rack toward the bay's middle.
    const toward = Math.sign(GANTRY.x - rack.x) || 1;
    const cell: StormCellState = {
      objectId: null,
      carrierId: null,
      age: 0,
      held: 0,
      tick: 1,
      roll: heroic ? T.jamRollSeconds : 0,
      rollYaw: angleTo({ x: rack.x, y: 0, z: rack.z }, { x: GANTRY.x, y: 0, z: GANTRY.z }),
      droppedBy: null,
      retakeAt: 0,
    };
    const obj = layCell(ctx, inst, cell, o.x + rack.x + toward * 2.5, o.z + rack.z, heroic);
    st.cells.push(cell);
    ctx.emit({
      type: 'spellfx',
      sourceId: boss.id,
      targetId: obj.id,
      school: 'nature',
      fx: 'nova',
      ability: DRAFT_CHARGE_CYCLE,
    });
  }
  // The hatch's window opens off this ejection (a fresh window each cycle).
  st.hatch = { t: 0, slotted: 0 };
  paintHatch(ctx, inst, boss, st);
  ctx.emit({ type: 'log', text: PRIME_DRAFT_LINES.ejectLog, color: '#9fd8ff', entityId: boss.id });
  return racks.length;
}

function dropCellObject(ctx: SimContext, inst: InstanceSlot, cell: StormCellState): void {
  if (cell.objectId !== null) dropEncounterObject(ctx, inst, cell.objectId);
  cell.objectId = null;
}

function removeCell(
  ctx: SimContext,
  inst: InstanceSlot,
  st: PrimeDraftFightState,
  cell: StormCellState,
): void {
  dropCellObject(ctx, inst, cell);
  if (cell.carrierId !== null) {
    const p = ctx.entities.get(cell.carrierId);
    if (p) dropAuraById(p, DRAFT_CELL_CARRY);
    cell.carrierId = null;
  }
  st.cells = st.cells.filter((c) => c !== cell);
}

/** Overload: stunned, and it takes more damage (heroic half load: shorter). */
export function overload(
  ctx: SimContext,
  boss: Entity,
  st: PrimeDraftFightState,
  full: boolean,
): void {
  const stun = full ? T.overloadStun : T.halfLoadStun;
  const vuln = full ? T.overloadVulnSeconds : T.overloadVulnSeconds / 2;
  if (full) st.overloads++;
  clearCastIf(boss, DRAFT_ARM_SWEEP, DRAFT_TREMOR_STEP, DRAFT_UNBOLT);
  st.sweepYaw = null;
  dropAuraById(boss, DRAFT_OVERLOAD);
  ctx.applyAura(boss, {
    id: DRAFT_OVERLOAD,
    name: 'Overload',
    kind: 'stun',
    remaining: stun,
    duration: stun,
    value: 0,
    sourceId: boss.id,
    school: 'nature',
    unbreakableControl: true,
    undispellable: true,
  });
  dropAuraById(boss, DRAFT_OVERLOADED);
  ctx.applyAura(boss, {
    id: DRAFT_OVERLOADED,
    name: 'Overloaded',
    kind: 'vulnerability',
    remaining: vuln,
    duration: vuln,
    value: T.overloadVuln,
    sourceId: boss.id,
    school: 'nature',
    undispellable: true,
  });
  ctx.emit({
    type: 'spellfx',
    sourceId: boss.id,
    targetId: boss.id,
    school: 'nature',
    fx: 'nova',
    ability: DRAFT_OVERLOAD,
  });
  ctx.emit({
    type: 'log',
    text: PRIME_DRAFT_LINES.overloadLog,
    color: '#9fd8ff',
    entityId: boss.id,
  });
}

/** A cell carried into the ring: slotted while the hatch is open, arcing back
 *  while it is closed (the shudder waits). */
function tryDeliver(
  ctx: SimContext,
  inst: InstanceSlot,
  boss: Entity,
  st: PrimeDraftFightState,
  cell: StormCellState,
  carrier: Entity,
): void {
  const c = hatchRingCentre(boss);
  if (Math.hypot(carrier.pos.x - c.x, carrier.pos.z - c.z) > T.hatchRingRadius) return;
  const state = hatchState(st);
  if (state === 'warn') return;
  removeCell(ctx, inst, st, cell);
  if (state === 'open' && st.hatch) {
    st.hatch.slotted++;
    const heroic = inst.difficulty === 'heroic';
    // Heroic Double Load: the first cell is a half load, the second a full one.
    overload(ctx, boss, st, !heroic || st.hatch.slotted >= 2);
    return;
  }
  ctx.emit({
    type: 'spellfx',
    sourceId: boss.id,
    targetId: carrier.id,
    school: 'nature',
    fx: 'nova',
    ability: DRAFT_ARC_BACK,
  });
  for (const p of claimPlayers(ctx, inst)) {
    if (dist2d(p.pos, carrier.pos) > T.arcBackRadius) continue;
    ctx.dealDamage(
      boss,
      p,
      mechanicDamage(ctx, boss, T.arcBackMin, T.arcBackMax),
      false,
      'nature',
      'Arc Back',
      'hit',
      true,
    );
  }
}

function shortOut(
  ctx: SimContext,
  inst: InstanceSlot,
  boss: Entity,
  st: PrimeDraftFightState,
  cell: StormCellState,
): void {
  const at = cell.carrierId !== null ? ctx.entities.get(cell.carrierId) : null;
  const target = at?.id ?? cell.objectId ?? boss.id;
  ctx.emit({
    type: 'spellfx',
    sourceId: boss.id,
    targetId: target,
    school: 'nature',
    fx: 'nova',
    ability: DRAFT_SHORT_OUT,
  });
  removeCell(ctx, inst, st, cell);
  for (const p of gantryPlayers(ctx, inst)) {
    ctx.dealDamage(
      boss,
      p,
      mechanicDamage(ctx, boss, T.shortOutMin, T.shortOutMax),
      false,
      'nature',
      'Short Out',
      'hit',
      true,
    );
  }
}

function stepCells(
  ctx: SimContext,
  inst: InstanceSlot,
  boss: Entity,
  st: PrimeDraftFightState,
): void {
  if (st.hatch) {
    st.hatch.t += DT;
    if (st.hatch.t >= T.hatchOpenAfter + T.hatchOpenFor) st.hatch = null;
  }
  for (const cell of [...st.cells]) {
    cell.age += DT;
    if (cell.age >= T.cellLife - 1e-9) {
      shortOut(ctx, inst, boss, st, cell);
      continue;
    }
    // Heroic Jammed Racks: it rolls out before it can be taken.
    if (cell.roll > 0 && cell.objectId !== null) {
      cell.roll -= DT;
      const obj = ctx.entities.get(cell.objectId);
      if (obj) {
        obj.pos = ctx.groundPos(
          obj.pos.x + Math.sin(cell.rollYaw) * T.jamRollSpeed * DT,
          obj.pos.z + Math.cos(cell.rollYaw) * T.jamRollSpeed * DT,
        );
        ctx.rebucket(obj);
        if (cell.roll <= 1e-9) {
          obj.templateId = FOUNDRY_CELL_TEMPLATES.ready;
          obj.lootable = true;
        }
      }
    }
    if (cell.carrierId === null) continue;
    const carrier = ctx.entities.get(cell.carrierId);
    // A carrier who left the run alive (a hearth, a port out) takes nothing
    // with them: the cell is gone, like a carrier who disconnected.
    if (carrier && !carrier.dead && !claimPlayers(ctx, inst).includes(carrier)) {
      dropAuraById(carrier, DRAFT_CELL_CARRY);
      removeCell(ctx, inst, st, cell);
      continue;
    }
    if (!carrier || carrier.dead) {
      // A fallen carrier lets it go where they fell.
      if (carrier) {
        dropAuraById(carrier, DRAFT_CELL_CARRY);
        layCell(ctx, inst, cell, carrier.pos.x, carrier.pos.z, false);
      } else {
        removeCell(ctx, inst, st, cell);
      }
      cell.held = 0;
      continue;
    }
    // Something stripped the carry aura (a snare breaker): wear it again.
    if (!carrier.auras.some((a) => a.id === DRAFT_CELL_CARRY)) wearCarry(ctx, carrier, st, cell);
    cell.held += DT;
    cell.tick -= DT;
    if (cell.tick <= 1e-9) {
      cell.tick += 1;
      const amount = Math.max(
        1,
        Math.round(staticPerSecond(cell.held - DT) * (boss.mechanicDamageMult ?? 1)),
      );
      ctx.dealDamage(boss, carrier, amount, false, 'nature', 'Static', 'hit', true);
      refreshCarry(carrier, cell);
    }
    if (!carrier.dead && st.cells.includes(cell)) tryDeliver(ctx, inst, boss, st, cell, carrier);
  }
}

function landFists(
  ctx: SimContext,
  inst: InstanceSlot,
  boss: Entity,
  st: PrimeDraftFightState,
): void {
  const o = ctx.instanceOriginOf(inst);
  for (let i = st.fists.length - 1; i >= 0; i--) {
    const f = st.fists[i];
    f.remaining -= DT;
    if (f.remaining > 1e-9) continue;
    st.fists.splice(i, 1);
    ctx.emit({
      type: 'spellfx',
      sourceId: boss.id,
      targetId: f.objectId,
      school: 'physical',
      fx: 'nova',
      ability: DRAFT_PISTON_FIST,
    });
    dropEncounterObject(ctx, inst, f.objectId);
    for (const p of claimPlayers(ctx, inst)) {
      if (Math.hypot(p.pos.x - o.x - f.x, p.pos.z - o.z - f.z) > T.fistRadius) continue;
      ctx.dealDamage(
        boss,
        p,
        mechanicDamage(ctx, boss, T.fistMin, T.fistMax),
        false,
        'physical',
        'Piston Fist',
        'hit',
        true,
      );
    }
  }
}

/** Piston Fist: a hashed player's spot (never the tank while others stand). */
export function startPistonFist(
  ctx: SimContext,
  inst: InstanceSlot,
  boss: Entity,
  st: PrimeDraftFightState,
): boolean {
  st.casts++;
  st.fistTimer = T.fistEvery;
  const [p] = pickMarkTargets(boss, gantryPlayers(ctx, inst), 1, st.casts);
  if (!p) return false;
  const o = ctx.instanceOriginOf(inst);
  const mark = spawnFoundryObject(
    ctx,
    inst,
    FOUNDRY_FIST_MARK,
    'Piston Fist',
    p.pos.x,
    p.pos.z,
    T.fistRadius,
  );
  st.fists.push({
    x: p.pos.x - o.x,
    z: p.pos.z - o.z,
    remaining: T.fistWarning,
    objectId: mark.id,
  });
  ctx.emit({
    type: 'spellfx',
    sourceId: boss.id,
    targetId: mark.id,
    school: 'physical',
    fx: 'windup',
    ability: DRAFT_PISTON_FIST,
  });
  return true;
}

/** Arc Surge: the three players nearest it (ties by id). Returns how many. */
export function arcSurge(
  ctx: SimContext,
  inst: InstanceSlot,
  boss: Entity,
  st: PrimeDraftFightState,
): number {
  st.surgeTimer = T.surgeEvery;
  const near = gantryPlayers(ctx, inst)
    .map((p) => ({ p, d: dist2d(p.pos, boss.pos) }))
    .sort((a, b) => a.d - b.d || a.p.id - b.p.id)
    .slice(0, T.surgeCount);
  for (const { p } of near) {
    ctx.emit({
      type: 'spellfx',
      sourceId: boss.id,
      targetId: p.id,
      school: 'nature',
      fx: 'nova',
      ability: DRAFT_ARC_SURGE,
    });
    ctx.dealDamage(
      boss,
      p,
      mechanicDamage(ctx, boss, T.surgeMin, T.surgeMax),
      false,
      'nature',
      'Arc Surge',
      'hit',
      true,
    );
  }
  return near.length;
}

/** Hold it where it stands for a bar (and while it wakes), facing its aim. */
function hold(ctx: SimContext, boss: Entity, st: PrimeDraftFightState): void {
  if (!st.plantedAt) st.plantedAt = { ...boss.pos };
  if (boss.pos.x !== st.plantedAt.x || boss.pos.z !== st.plantedAt.z) {
    boss.pos.x = st.plantedAt.x;
    boss.pos.y = st.plantedAt.y;
    boss.pos.z = st.plantedAt.z;
    ctx.rebucket(boss);
  }
}

/** Bolted, it never walks past the Gantry's edge: back onto the circle
 *  `gantryMargin` inside it. */
function keepInGantry(ctx: SimContext, inst: InstanceSlot, boss: Entity): void {
  const o = ctx.instanceOriginOf(inst);
  const cx = o.x + GANTRY.x;
  const cz = o.z + GANTRY.z;
  const dx = boss.pos.x - cx;
  const dz = boss.pos.z - cz;
  const d = Math.hypot(dx, dz);
  const edge = GANTRY.r - T.gantryMargin;
  if (d <= edge) return;
  boss.pos = ctx.groundPos(cx + (dx / d) * edge, cz + (dz / d) * edge);
  ctx.rebucket(boss);
}

function landBar(
  ctx: SimContext,
  inst: InstanceSlot,
  boss: Entity,
  st: PrimeDraftFightState,
  castId: string,
): void {
  if (castId === DRAFT_AWAKEN) {
    st.phase = 'bolted';
    boss.moveSpeed = T.boltedSpeed;
    return;
  }
  if (castId === DRAFT_UNBOLT) {
    st.phase = 'unbolted';
    dropAuraById(boss, DRAFT_BOLTED);
    boss.moveSpeed = T.unboltedSpeed;
    st.plantedAt = null;
    ctx.emit({
      type: 'spellfx',
      sourceId: boss.id,
      targetId: boss.id,
      school: 'physical',
      fx: 'nova',
      ability: DRAFT_UNBOLT,
    });
    for (const p of gantryPlayers(ctx, inst)) {
      if (dist2d(p.pos, boss.pos) > T.rivetShowerRadius) continue;
      ctx.dealDamage(
        boss,
        p,
        mechanicDamage(ctx, boss, T.rivetShowerMin, T.rivetShowerMax),
        false,
        'physical',
        'Rivet Shower',
        'hit',
        true,
      );
    }
    return;
  }
  if (castId === DRAFT_ARM_SWEEP) {
    const yaw = st.sweepYaw ?? boss.facing;
    st.sweepYaw = null;
    ctx.emit({
      type: 'spellfx',
      sourceId: boss.id,
      targetId: boss.id,
      school: 'physical',
      fx: 'nova',
      ability: DRAFT_ARM_SWEEP,
    });
    for (const p of claimPlayers(ctx, inst)) {
      if (!inCone(boss.pos, yaw, p.pos, T.sweepRange, T.sweepArcDeg)) continue;
      ctx.dealDamage(
        boss,
        p,
        mechanicDamage(ctx, boss, T.sweepMin, T.sweepMax),
        false,
        'physical',
        'Arm Sweep',
        'hit',
        true,
      );
    }
    return;
  }
  if (castId === DRAFT_TREMOR_STEP) {
    ctx.emit({
      type: 'spellfx',
      sourceId: boss.id,
      targetId: boss.id,
      school: 'physical',
      fx: 'nova',
      ability: DRAFT_TREMOR_STEP,
    });
    for (const p of claimPlayers(ctx, inst)) {
      if (dist2d(p.pos, boss.pos) > T.tremorRadius) continue;
      ctx.dealDamage(
        boss,
        p,
        mechanicDamage(ctx, boss, T.tremorMin, T.tremorMax),
        false,
        'physical',
        'Tremor Step',
        'hit',
        true,
      );
    }
  }
}

const DRAFT_BARS = new Set([DRAFT_AWAKEN, DRAFT_UNBOLT, DRAFT_ARM_SWEEP, DRAFT_TREMOR_STEP]);

/** Start the Arm Sweep bar, its cone locked where the bar starts. */
export function startArmSweep(boss: Entity, st: PrimeDraftFightState): void {
  st.sweepTimer = T.sweepEvery;
  st.sweepYaw = boss.facing;
  startBar(boss, DRAFT_ARM_SWEEP, T.sweepCast, boss.aggroTargetId);
}

export function startTremorStep(boss: Entity, st: PrimeDraftFightState): void {
  st.tremorTimer = T.tremorEvery;
  startBar(boss, DRAFT_TREMOR_STEP, T.tremorCast, null);
}

/** It tears its feet out of the gantry (the 70 percent turn). */
export function startUnbolt(ctx: SimContext, boss: Entity, st: PrimeDraftFightState): void {
  clearCastIf(boss, DRAFT_ARM_SWEEP, DRAFT_TREMOR_STEP);
  st.sweepYaw = null;
  st.phase = 'unbolted';
  startBar(boss, DRAFT_UNBOLT, T.unboltCast, null);
  emitMobYell(ctx, boss, PRIME_DRAFT_LINES.unbolt);
}

/** The heart flares (the 35 percent turn). */
export function goHeartless(ctx: SimContext, boss: Entity, st: PrimeDraftFightState): void {
  st.phase = 'heartless';
  st.surgeTimer = T.surgeFirst;
  st.cycleTimer = Math.min(st.cycleTimer, T.heartlessCycleEvery);
  emitMobYell(ctx, boss, PRIME_DRAFT_LINES.heartless);
}

function enrage(ctx: SimContext, boss: Entity, st: PrimeDraftFightState): void {
  st.enraged = true;
  ctx.applyAura(boss, {
    id: DRAFT_ENRAGE,
    name: 'Overdrive',
    kind: 'buff_dmg_done',
    remaining: 3600,
    duration: 3600,
    permanent: true,
    value: T.enrageDamage,
    sourceId: boss.id,
    school: 'nature',
    undispellable: true,
  });
  emitMobYell(ctx, boss, PRIME_DRAFT_LINES.enrage);
}

/** The fight ended: the cells go dark, the hatch closes, the bolts come back. */
function endDraftFight(ctx: SimContext, inst: InstanceSlot, boss: Entity): void {
  const st = boss.foundryFight?.kind === 'prime_draft' ? boss.foundryFight : null;
  if (st) {
    for (const cell of [...st.cells]) removeCell(ctx, inst, st, cell);
    for (const f of st.fists) dropEncounterObject(ctx, inst, f.objectId);
    if (st.hatchId !== null) dropEncounterObject(ctx, inst, st.hatchId);
  }
  clearCastIf(boss, ...DRAFT_BARS);
  for (const id of [DRAFT_BOLTED, DRAFT_ENRAGE, DRAFT_OVERLOAD, DRAFT_OVERLOADED])
    dropAuraById(boss, id);
  // It walks home (or stands in its scaffold again) at its own pace.
  boss.moveSpeed = MOBS[PRIME_DRAFT_ID]?.moveSpeed ?? boss.moveSpeed;
  boss.foundryFight = undefined;
}

/** On its death: it kneels, the hatch falls open, the Draft Record lies in
 *  its chest (the quest object of The First Draft). */
function openChest(ctx: SimContext, inst: InstanceSlot, boss: Entity): void {
  const c = hatchRingCentre(boss);
  const record = createGroundObject(
    ctx.nextId++,
    DRAFT_RECORD_ITEM,
    'Draft Record',
    ctx.groundPos(c.x, c.z),
  );
  record.dungeonId = FOUNDRY_DUNGEON;
  ctx.addEntity(record);
  inst.objectIds.push(record.id);
}

/** The Draft's fight state, started on its first engaged tick (it wakes). */
export function draftState(
  ctx: SimContext,
  inst: InstanceSlot,
  boss: Entity,
): PrimeDraftFightState {
  if (boss.foundryFight?.kind === 'prime_draft') return boss.foundryFight;
  const st = freshState();
  boss.foundryFight = st;
  bolt(ctx, boss);
  startBar(boss, DRAFT_AWAKEN, T.awakenCast, null);
  paintHatch(ctx, inst, boss, st);
  emitMobYell(ctx, boss, PRIME_DRAFT_LINES.engage);
  return st;
}

/** One tick of the Prime Draft's fight (after the mob AI). */
export function tickPrimeDraft(
  ctx: SimContext,
  inst: InstanceSlot,
  boss: Entity,
  engaged: boolean,
): void {
  const live = boss.foundryFight?.kind === 'prime_draft' ? boss.foundryFight : null;
  if (boss.dead) {
    if (live) {
      if (live.overloads >= PRIME_DRAFT_DEED_OVERLOADS) grantClaimDeed(ctx, inst, PRIME_DRAFT_DEED);
      emitMobYell(ctx, boss, PRIME_DRAFT_LINES.death);
      openChest(ctx, inst, boss);
      endDraftFight(ctx, inst, boss);
    }
    return;
  }
  if (!engaged) {
    if (live) endDraftFight(ctx, inst, boss);
    return;
  }
  const st = draftState(ctx, inst, boss);
  const hp = boss.maxHp > 0 ? boss.hp / boss.maxHp : 1;
  // Waking it never steps off its spot; bolted it crawls, inside the Gantry.
  if (st.phase === 'awaken') hold(ctx, boss, st);
  else if (st.phase === 'bolted') keepInGantry(ctx, inst, boss);
  stepCells(ctx, inst, boss, st);
  landFists(ctx, inst, boss, st);
  paintHatch(ctx, inst, boss, st);
  if (st.phase !== 'awaken') {
    st.cycleTimer -= DT;
    if (st.cycleTimer <= 0) chargeCycle(ctx, inst, boss, st);
  }
  if (!st.enraged && hp <= T.enrageAtHpPct) enrage(ctx, boss, st);
  const casting = boss.castingAbility;
  if (casting !== null && DRAFT_BARS.has(casting)) {
    hold(ctx, boss, st);
    if (casting === DRAFT_ARM_SWEEP && st.sweepYaw !== null) boss.facing = st.sweepYaw;
    boss.swingTimer = Math.max(boss.swingTimer, 0.6);
    boss.castRemaining = Math.max(0, boss.castRemaining - DT);
    if (boss.castRemaining > 0) return;
    clearCastIf(boss, casting);
    // The bar is done: it walks again from where it stood.
    st.plantedAt = null;
    landBar(ctx, inst, boss, st, casting);
    return;
  }
  if (ctx.isStunned(boss) || boss.castingAbility !== null) return;
  // An Unbolt bar cut short (an Overload landed mid-bar) still tears it free.
  if (st.phase !== 'bolted' && boss.auras.some((a) => a.id === DRAFT_BOLTED)) {
    startBar(boss, DRAFT_UNBOLT, T.unboltCast, null);
    return;
  }
  // The phase turns.
  if (st.phase === 'bolted' && hp <= T.unboltAtHpPct) {
    startUnbolt(ctx, boss, st);
    return;
  }
  if (st.phase === 'unbolted' && hp <= T.heartlessAtHpPct) goHeartless(ctx, boss, st);
  if (st.phase === 'bolted') {
    st.fistTimer -= DT;
    if (st.fistTimer <= 0) startPistonFist(ctx, inst, boss, st);
  } else {
    st.tremorTimer -= DT;
    if (st.tremorTimer <= 0) {
      startTremorStep(boss, st);
      return;
    }
  }
  if (st.phase === 'heartless') {
    st.surgeTimer -= DT;
    if (st.surgeTimer <= 0) arcSurge(ctx, inst, boss, st);
  }
  st.sweepTimer -= DT;
  if (st.sweepTimer <= 0 && boss.aggroTargetId !== null) startArmSweep(boss, st);
}
