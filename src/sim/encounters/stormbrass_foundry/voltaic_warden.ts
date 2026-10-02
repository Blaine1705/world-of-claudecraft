// The Voltaic Warden on the Coil Crown (docs/design/dungeon-rework/
// stormbrass_foundry.md 5.3): hit it with the right kind of damage (G21
// conduction plating, voltaic_plating.ts).
//
//   Conduction Plating  its plates are Grounded (copper out: physical lands,
//                       spells are turned aside) or Charged (blue out: spells
//                       land, physical is turned aside). Every 15 s (heroic
//                       Rapid Cycling: 10 s) a 3 s bar rattles them, then they
//                       flip. Wrong-kind damage is banked as Stored Charge.
//   Discharge           as the plates flip it releases the bank to every
//                       player on the crown: 20 percent of it, landed, capped
//                       at 400.
//   Arc Drones          every 25 s two drones launch with the OPPOSITE plating
//                       (they flip with it), so whoever cannot hurt the Warden
//                       has a job.
//   Static Lash         every 12 s a 1 s bar, then a lash on the tank that
//                       leaps to the nearest other player within 6 yd of them.
//   Coil Strike         every 18 s the great coil strikes the spot one player
//                       stands on: a 4 yd mark, 1.6 s later 160 to 190.
//   Heroic              Rapid Cycling (flips every 10 s) and Split Plating
//                       (the back half wears the other face).
//
// The deed (Grounded): defeat it without a single Discharge dealing damage.
// Deterministic: the strike and the lash's leap are hashed or entity-id
// ordered; the only rng draws are damage rolls. Every visible state rides
// existing fields: the plating auras (value2 1 on a split Warden; their clock
// is the flip countdown, refreshed every tick and never run out, so a stunned
// Warden past its flip keeps its plates), the Stored Charge aura (stacks =
// the bank), the bars, the strike marks.

import { COIL_CROWN } from '../../content/stormbrass_foundry_layout';
import { spawnKitAdd } from '../../mob/trash_kit/spawn';
import { emitMobYell } from '../../mob/yells';
import type { InstanceSlot } from '../../sim';
import type { SimContext } from '../../sim_context';
import { DT, dist2d, type Entity, type VoltaicFightState } from '../../types';
import {
  arenaPlayers,
  bossTarget,
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
  ARC_DRONE_ID,
  FOUNDRY_COIL_STRIKE_MARK,
  VOLTAIC_TUNING as T,
  VOLTAIC_CHARGED,
  VOLTAIC_COIL_STRIKE,
  VOLTAIC_DISCHARGE,
  VOLTAIC_DRONES,
  VOLTAIC_FLIP,
  VOLTAIC_GROUNDED,
  VOLTAIC_STATIC_LASH,
  VOLTAIC_STORED,
  type VoltaicPlating,
} from './ids';

export const VOLTAIC_DEED = 'dgn_voltaic_grounded';

/** The chat lines (re-localized by src/ui/sim_i18n.ts). */
export const VOLTAIC_LINES = {
  engage: 'Charge rising. Intruders will be grounded.',
  death: 'Charge... spent...',
} as const;

/** The bank a full 400 Discharge needs (the Stored Charge ring's full mark). */
export const STORED_FULL = T.dischargeCap / T.dischargeShare;

function flipEvery(inst: InstanceSlot): number {
  return inst.difficulty === 'heroic' ? T.rapidFlipEvery : T.flipEvery;
}

function other(face: VoltaicPlating): VoltaicPlating {
  return face === 'grounded' ? 'charged' : 'grounded';
}

/** Players on the Coil Crown. */
export function crownPlayers(ctx: SimContext, inst: InstanceSlot): Entity[] {
  return arenaPlayers(
    ctx,
    inst,
    claimPlayers(ctx, inst),
    COIL_CROWN.x,
    COIL_CROWN.z,
    COIL_CROWN.r + 6,
  );
}

/** The floor the flip clock rides at: the plating aura never runs out, even
 *  on a Warden stunned past its flip (its rattle waits) or one that lost its
 *  target for a moment. Under the floor, or while the fight is held, the aura
 *  is only topped up as it nears its end (FLIP_CLOCK_TOP_UP), so its deadline
 *  holds still between top-ups instead of sliding (and resending) every tick. */
const FLIP_CLOCK_FLOOR = 0.5;
const FLIP_CLOCK_TOP_UP = 0.2;

interface FlipClock {
  /** Seconds to the next flip (may be under the floor, or negative). */
  left: number;
  cycle: number;
  /** The flip timer ran this tick (false while the fight is held). */
  running: boolean;
}

/** The plating aura's clock: the seconds to the next flip (the HUD's
 *  countdown; on the wire as an ordinary aura deadline). */
function flipClock(inst: InstanceSlot, st: VoltaicFightState, running = true): FlipClock {
  return { left: st.flipTimer, cycle: flipEvery(inst), running };
}

/** Put a plating face on a body (the Warden: split on heroic). */
function wearPlating(
  ctx: SimContext,
  e: Entity,
  face: VoltaicPlating,
  split: boolean,
  clock: FlipClock,
): void {
  dropAuraById(e, VOLTAIC_GROUNDED);
  dropAuraById(e, VOLTAIC_CHARGED);
  const grounded = face === 'grounded';
  ctx.applyAura(e, {
    id: grounded ? VOLTAIC_GROUNDED : VOLTAIC_CHARGED,
    name: grounded ? 'Grounded Plating' : 'Charged Plating',
    kind: 'buff_dr',
    remaining: Math.max(FLIP_CLOCK_FLOOR, clock.left),
    duration: clock.cycle,
    value: 0,
    value2: split ? 1 : 0,
    sourceId: e.id,
    school: grounded ? 'physical' : 'nature',
    undispellable: true,
  });
}

function setStored(ctx: SimContext, boss: Entity, st: VoltaicFightState, amount: number): void {
  st.stored = amount;
  const have = boss.auras.find((a) => a.id === VOLTAIC_STORED);
  if (have) {
    have.stacks = Math.round(amount);
    return;
  }
  ctx.applyAura(boss, {
    id: VOLTAIC_STORED,
    name: 'Stored Charge',
    kind: 'buff_dr',
    remaining: 3600,
    duration: 3600,
    permanent: true,
    value: 0,
    value2: STORED_FULL,
    stacks: Math.round(amount),
    sourceId: boss.id,
    school: 'nature',
    undispellable: true,
  });
}

function freshState(): VoltaicFightState {
  return {
    kind: 'voltaic',
    plating: 'grounded',
    flipTimer: 0,
    stored: 0,
    dronesTimer: T.dronesFirst,
    droneIds: [],
    lashTimer: T.lashFirst,
    strikeTimer: T.strikeFirst,
    strikes: [],
    casts: 0,
    discharged: false,
  };
}

/** The living drones it launched. */
function liveDrones(ctx: SimContext, st: VoltaicFightState): Entity[] {
  st.droneIds = st.droneIds.filter((id) => {
    const e = ctx.entities.get(id);
    return e !== undefined && !e.dead;
  });
  return st.droneIds.map((id) => ctx.entities.get(id) as Entity);
}

/** The plates flip: the bank is released as Discharge, every face turns. */
export function flipPlating(
  ctx: SimContext,
  inst: InstanceSlot,
  boss: Entity,
  st: VoltaicFightState,
): number {
  const heroic = inst.difficulty === 'heroic';
  const mult = boss.mechanicDamageMult ?? 1;
  const cap = T.dischargeCap * mult;
  const amount = Math.min(cap, Math.round(st.stored * T.dischargeShare));
  ctx.emit({
    type: 'spellfx',
    sourceId: boss.id,
    targetId: boss.id,
    school: 'nature',
    fx: 'nova',
    ability: VOLTAIC_DISCHARGE,
  });
  if (amount > 0) {
    for (const p of crownPlayers(ctx, inst)) {
      const dealt = ctx.dealDamage(boss, p, amount, false, 'nature', 'Discharge', 'hit', true);
      if (dealt > 0) st.discharged = true;
    }
  }
  setStored(ctx, boss, st, 0);
  st.plating = other(st.plating);
  st.flipTimer = flipEvery(inst);
  const clock = flipClock(inst, st);
  wearPlating(ctx, boss, st.plating, heroic, clock);
  for (const d of liveDrones(ctx, st)) wearPlating(ctx, d, other(st.plating), false, clock);
  return amount;
}

/** Set one body's plating aura to the flip clock (a face something stripped
 *  is put back). */
function stampFace(
  ctx: SimContext,
  e: Entity,
  face: VoltaicPlating,
  split: boolean,
  clock: FlipClock,
): void {
  const id = face === 'grounded' ? VOLTAIC_GROUNDED : VOLTAIC_CHARGED;
  const a = e.auras.find((x) => x.id === id);
  if (!a) {
    wearPlating(ctx, e, face, split, clock);
    return;
  }
  a.duration = clock.cycle;
  if (clock.running && clock.left > FLIP_CLOCK_FLOOR) a.remaining = clock.left;
  else if (a.remaining < FLIP_CLOCK_TOP_UP) a.remaining = FLIP_CLOCK_FLOOR;
}

/** Keep every plating aura on the flip clock: the Warden's and its drones'. */
function stampFlipClock(
  ctx: SimContext,
  inst: InstanceSlot,
  boss: Entity,
  st: VoltaicFightState,
  running = true,
): void {
  const clock = flipClock(inst, st, running);
  stampFace(ctx, boss, st.plating, inst.difficulty === 'heroic', clock);
  for (const d of liveDrones(ctx, st)) stampFace(ctx, d, other(st.plating), false, clock);
}

/** A held fight (the Warden lost its target for a moment, index.ts paused):
 *  nothing runs, but the plates stay up on the Warden and its drones. */
export function holdVoltaicPlating(ctx: SimContext, inst: InstanceSlot, boss: Entity): void {
  const st = boss.foundryFight?.kind === 'voltaic' ? boss.foundryFight : null;
  if (st && !boss.dead) stampFlipClock(ctx, inst, boss, st, false);
}

/** Two Arc Drones with the opposite plating. Returns how many. */
export function launchPlatedDrones(
  ctx: SimContext,
  inst: InstanceSlot,
  boss: Entity,
  st: VoltaicFightState,
): number {
  st.casts++;
  st.dronesTimer = T.dronesEvery;
  const victim = bossTarget(ctx, boss);
  let n = 0;
  for (let k = 0; k < T.dronesCount; k++) {
    // Out of the coil's two sides, toward the crown's edge.
    const a = boss.facing + (k === 0 ? Math.PI / 2 : -Math.PI / 2);
    const drone = spawnKitAdd(
      ctx,
      inst,
      boss,
      ARC_DRONE_ID,
      boss.pos.x + Math.sin(a) * 6,
      boss.pos.z + Math.cos(a) * 6,
      victim,
    );
    if (!drone) continue;
    wearPlating(ctx, drone, other(st.plating), false, flipClock(inst, st));
    st.droneIds.push(drone.id);
    n++;
  }
  ctx.emit({
    type: 'spellfx',
    sourceId: boss.id,
    targetId: boss.id,
    school: 'nature',
    fx: 'nova',
    ability: VOLTAIC_DRONES,
  });
  return n;
}

/** Mark a Coil Strike under one player (hashed, the tank only when alone). */
export function startCoilStrike(
  ctx: SimContext,
  inst: InstanceSlot,
  boss: Entity,
  st: VoltaicFightState,
): boolean {
  st.casts++;
  st.strikeTimer = T.strikeEvery;
  const [p] = pickMarkTargets(boss, crownPlayers(ctx, inst), 1, st.casts);
  if (!p) return false;
  const o = ctx.instanceOriginOf(inst);
  const mark = spawnFoundryObject(
    ctx,
    inst,
    FOUNDRY_COIL_STRIKE_MARK,
    'Coil Strike',
    p.pos.x,
    p.pos.z,
    T.strikeRadius,
  );
  st.strikes.push({
    x: p.pos.x - o.x,
    z: p.pos.z - o.z,
    remaining: T.strikeWarning,
    objectId: mark.id,
  });
  ctx.emit({
    type: 'spellfx',
    sourceId: boss.id,
    targetId: mark.id,
    school: 'nature',
    fx: 'windup',
    ability: VOLTAIC_COIL_STRIKE,
  });
  return true;
}

function stepStrikes(
  ctx: SimContext,
  inst: InstanceSlot,
  boss: Entity,
  st: VoltaicFightState,
): void {
  const o = ctx.instanceOriginOf(inst);
  for (let i = st.strikes.length - 1; i >= 0; i--) {
    const s = st.strikes[i];
    s.remaining -= DT;
    if (s.remaining > 1e-9) continue;
    st.strikes.splice(i, 1);
    ctx.emit({
      type: 'spellfx',
      sourceId: boss.id,
      targetId: s.objectId,
      school: 'nature',
      fx: 'nova',
      ability: VOLTAIC_COIL_STRIKE,
    });
    dropEncounterObject(ctx, inst, s.objectId);
    for (const p of claimPlayers(ctx, inst)) {
      if (Math.hypot(p.pos.x - o.x - s.x, p.pos.z - o.z - s.z) > T.strikeRadius) continue;
      ctx.dealDamage(
        boss,
        p,
        mechanicDamage(ctx, boss, T.strikeMin, T.strikeMax),
        false,
        'nature',
        'Coil Strike',
        'hit',
        true,
      );
    }
  }
}

/** The lash lands on the tank and leaps to the nearest player beside them. */
function landLash(ctx: SimContext, inst: InstanceSlot, boss: Entity, tank: Entity): void {
  ctx.emit({
    type: 'spellfx',
    sourceId: boss.id,
    targetId: tank.id,
    school: 'nature',
    fx: 'nova',
    ability: VOLTAIC_STATIC_LASH,
  });
  ctx.dealDamage(
    boss,
    tank,
    mechanicDamage(ctx, boss, T.lashTankMin, T.lashTankMax),
    false,
    'nature',
    'Static Lash',
    'hit',
    true,
  );
  let leap: Entity | null = null;
  let best = T.lashChainRange + 1e-9;
  for (const p of crownPlayers(ctx, inst)) {
    if (p.id === tank.id) continue;
    const d = dist2d(p.pos, tank.pos);
    if (d < best - 1e-9) {
      leap = p;
      best = d;
    }
  }
  if (!leap) return;
  ctx.emit({
    type: 'spellfx',
    sourceId: tank.id,
    targetId: leap.id,
    school: 'nature',
    fx: 'nova',
    ability: VOLTAIC_STATIC_LASH,
  });
  ctx.dealDamage(
    boss,
    leap,
    mechanicDamage(ctx, boss, T.lashChainMin, T.lashChainMax),
    false,
    'nature',
    'Static Lash',
    'hit',
    true,
  );
}

/** The fight ended: the plates settle, the bank empties, the marks go. */
function endVoltaicFight(ctx: SimContext, inst: InstanceSlot, boss: Entity): void {
  const st = boss.foundryFight?.kind === 'voltaic' ? boss.foundryFight : null;
  if (st) for (const s of st.strikes) dropEncounterObject(ctx, inst, s.objectId);
  // Drones that outlive the fight (it fell first) shed their plating with it.
  if (st) {
    for (const id of st.droneIds) {
      const drone = ctx.entities.get(id);
      if (!drone) continue;
      dropAuraById(drone, VOLTAIC_GROUNDED);
      dropAuraById(drone, VOLTAIC_CHARGED);
    }
  }
  dropAuraById(boss, VOLTAIC_GROUNDED);
  dropAuraById(boss, VOLTAIC_CHARGED);
  dropAuraById(boss, VOLTAIC_STORED);
  clearCastIf(boss, VOLTAIC_FLIP, VOLTAIC_STATIC_LASH);
  boss.foundryFight = undefined;
}

/** The Warden's fight state, started on its first engaged tick (Grounded). */
export function voltaicState(ctx: SimContext, inst: InstanceSlot, boss: Entity): VoltaicFightState {
  if (boss.foundryFight?.kind === 'voltaic') return boss.foundryFight;
  const st = freshState();
  st.flipTimer = flipEvery(inst);
  boss.foundryFight = st;
  wearPlating(ctx, boss, st.plating, inst.difficulty === 'heroic', flipClock(inst, st));
  setStored(ctx, boss, st, 0);
  emitMobYell(ctx, boss, VOLTAIC_LINES.engage);
  return st;
}

/** Start the rattle bar now (the dev trigger and the flip clock). */
export function startFlip(boss: Entity, st: VoltaicFightState): void {
  clearCastIf(boss, VOLTAIC_STATIC_LASH);
  startBar(boss, VOLTAIC_FLIP, T.flipCast, null);
  st.flipTimer = T.flipCast;
}

/** One tick of the Voltaic Warden's fight (after the mob AI). */
export function tickVoltaicWarden(
  ctx: SimContext,
  inst: InstanceSlot,
  boss: Entity,
  engaged: boolean,
): void {
  const live = boss.foundryFight?.kind === 'voltaic' ? boss.foundryFight : null;
  if (boss.dead) {
    if (live) {
      if (!live.discharged) grantClaimDeed(ctx, inst, VOLTAIC_DEED);
      emitMobYell(ctx, boss, VOLTAIC_LINES.death);
      endVoltaicFight(ctx, inst, boss);
    }
    return;
  }
  if (!engaged) {
    if (live) endVoltaicFight(ctx, inst, boss);
    return;
  }
  const st = voltaicState(ctx, inst, boss);
  stepStrikes(ctx, inst, boss, st);
  st.flipTimer -= DT;
  st.dronesTimer -= DT;
  st.strikeTimer -= DT;
  stampFlipClock(ctx, inst, boss, st);
  if (st.dronesTimer <= 0) launchPlatedDrones(ctx, inst, boss, st);
  if (st.strikeTimer <= 0) startCoilStrike(ctx, inst, boss, st);
  if (boss.castingAbility === VOLTAIC_FLIP || boss.castingAbility === VOLTAIC_STATIC_LASH) {
    boss.swingTimer = Math.max(boss.swingTimer, 0.6);
    boss.castRemaining = Math.max(0, boss.castRemaining - DT);
    if (boss.castRemaining > 0) return;
    const castId = boss.castingAbility;
    const targetId = boss.castTargetId;
    clearCastIf(boss, castId);
    if (castId === VOLTAIC_FLIP) {
      flipPlating(ctx, inst, boss, st);
      return;
    }
    const tank = targetId !== null ? ctx.entities.get(targetId) : undefined;
    if (tank && !tank.dead) landLash(ctx, inst, boss, tank);
    return;
  }
  // The rattle owns its slot in the cycle: it starts flipCast before the flip,
  // whatever else is due.
  if (st.flipTimer <= T.flipCast && !ctx.isStunned(boss)) {
    clearCastIf(boss, VOLTAIC_STATIC_LASH);
    if (boss.castingAbility === null) {
      startFlip(boss, st);
      return;
    }
  }
  if (ctx.isStunned(boss) || boss.castingAbility !== null) return;
  st.lashTimer -= DT;
  if (st.lashTimer <= 0 && boss.aggroTargetId !== null && st.flipTimer > T.flipCast + 1) {
    st.lashTimer = T.lashEvery;
    startBar(boss, VOLTAIC_STATIC_LASH, T.lashCast, boss.aggroTargetId);
  }
}
