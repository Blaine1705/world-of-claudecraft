// Line-Master Ambrel Tock on the Main Line (docs/design/dungeon-rework/
// stormbrass_foundry.md 5.1): fight on a moving floor (G19 conveyors).
//
//   Line Speed      while he fights, the four belts carry anyone standing on
//                   them 3 yd a second (heroic Overtime: 5) toward the press,
//                   or back toward the chute once reversed.
//   The lever       every 20 s a 2 s klaxon bar, then the belts reverse
//                   (heroic Cross-Feed: they start alternating and each throw
//                   reverses only two of them, the two the klaxon paints red).
//   Stamping Press  each belt's hammer hangs from a carriage on an overhead
//                   rail. Every 7 s (the first at 6 s) one carriage (heroic:
//                   two, on two belts) slides to a player riding the belts: an
//                   8 yd strip is painted on the rail stop nearest where the
//                   belt will carry them in the 2.5 s warning (their z led by
//                   the belt's run, clamped into the belt, snapped to the 2 yd
//                   rail grid), then 250 to 300 and a 1.5 s knockdown to
//                   everyone on it. Nobody riding: a hashed belt. Two strips
//                   never share a belt. A Half-Built Frame under it is crushed.
//   Scalding Vents  every 10 s (the first at 10 s) every walkway is painted
//                   for 1.5 s, then scalds 55 to 65 a second for 5 s anyone
//                   on a walkway inside the belts' run (scalding_vents.ts):
//                   the belts are the floor, and the presses hunt them.
//   Parts Drop      at 70 and 40 percent the chute drops three Half-Built
//                   Frames onto three belts; they ride the line and boot up
//                   8 s later wherever they are (kill them while they ride).
//   Rivet Gun       every 10 s a 1 s bar, then 1.4 times his melee on the one
//                   he is fighting.
//
// The deed (Quality Control): defeat him with nobody caught by the press.
// Deterministic: the press rider and belt, the frames' belts and the
// Cross-Feed pair are hashed (kitHash) over id-ordered lists; the only rng
// draws are damage rolls. Every visible state rides existing fields: the
// belts' encounter objects (template id = idle, run or alarm; facing =
// heading; scale = speed), the press strip objects (a carriage's rail stop is
// its strip's position), the vent strips and the walkway aura, Tock's bars and
// his pressure aura (its clock is the gauge needle), so the online client
// mirrors it with no wire change.

import { MAIN_LINE, MAIN_LINE_BELTS, PARTS_CHUTE } from '../../content/stormbrass_foundry_layout';
import { type ConveyorRegion, carryOnConveyors } from '../../conveyor';
import { spawnKitAdd } from '../../mob/trash_kit/spawn';
import { kitHash } from '../../mob/trash_kit/targets';
import { emitMobYell } from '../../mob/yells';
import type { InstanceSlot } from '../../sim';
import type { SimContext } from '../../sim_context';
import { DT, type Entity, type TockFightState } from '../../types';
import {
  bossTarget,
  claimObjectAt,
  claimPlayers,
  clearCastIf,
  dropAuraById,
  dropEncounterObject,
  grantClaimDeed,
  heavySwing,
  localOf,
  mechanicDamage,
  spawnFoundryObject,
  startBar,
} from './claim';
import {
  beltIndexAt,
  FOUNDRY_BELT_TEMPLATES,
  FOUNDRY_PRESS_STRIP,
  FRAME_BOOTING,
  HALF_BUILT_FRAME_ID,
  inPressStrip,
  pressRailStops,
  pressStripCentre,
  TOCK_TUNING as T,
  TOCK_FLATTENED,
  TOCK_LEVER,
  TOCK_PARTS_DROP,
  TOCK_PRESSURE,
  TOCK_RIVET_GUN,
  TOCK_STAMPING_PRESS,
} from './ids';
import { endVents, freshVents, tickVents, VENTS_YELL } from './scalding_vents';

export const TOCK_DEED = 'dgn_tock_press';

/** The chat lines (re-localized by src/ui/sim_i18n.ts). */
export const TOCK_LINES = {
  engage: 'More parts for the line! Hold still and be assembled.',
  parts: 'Frames to the line! Bolt them together!',
  death: 'The line... the line has stopped...',
  partsLog: 'The parts chute rattles: Half-Built Frames drop onto the belts!',
  vents: VENTS_YELL,
} as const;

const BELTS = MAIN_LINE_BELTS;
const BELT_COUNT = BELTS.xs.length;
const BELT_MID_Z = (BELTS.z0 + BELTS.z1) / 2;

/** The belts' speed on this claim (heroic Overtime). */
export function beltSpeed(heroic: boolean): number {
  return heroic ? T.overtimeSpeed : T.beltSpeed;
}

/** The starting run: all toward the press (heroic Cross-Feed: alternating). */
export function startingDirs(heroic: boolean): number[] {
  return BELTS.xs.map((_, i) => (heroic && i % 2 === 1 ? -1 : 1));
}

/** The belts a lever throw reverses: all four (heroic: a hashed pair). */
export function leverPair(heroic: boolean, bossId: number, salt: number): number[] {
  if (!heroic) return BELTS.xs.map((_, i) => i);
  const first = kitHash(bossId, salt * 13 + 5) % BELT_COUNT;
  const second = (first + 1 + (kitHash(bossId, salt * 17 + 9) % (BELT_COUNT - 1))) % BELT_COUNT;
  return [Math.min(first, second), Math.max(first, second)];
}

function freshState(inst: InstanceSlot): TockFightState {
  const heroic = inst.difficulty === 'heroic';
  return {
    kind: 'tock',
    dirs: startingDirs(heroic),
    leverTimer: T.leverFirst,
    flipping: [],
    pressTimer: T.pressFirst,
    presses: [],
    vent: freshVents(),
    rivetTimer: T.rivetFirst,
    dropsFired: 0,
    frames: [],
    levers: 0,
    casts: 0,
    pressed: false,
  };
}

/** The claim's object for one belt (created on first use, kept for the
 *  claim's life: its template id carries idle, run or alarm). */
function beltObject(ctx: SimContext, inst: InstanceSlot, i: number): Entity {
  const have = claimObjectAt(ctx, inst, BELTS.xs[i], BELT_MID_Z);
  if (have) return have;
  const o = ctx.instanceOriginOf(inst);
  return spawnFoundryObject(
    ctx,
    inst,
    FOUNDRY_BELT_TEMPLATES.idle,
    'Conveyor Belt',
    o.x + BELTS.xs[i],
    o.z + BELT_MID_Z,
    1,
  );
}

function paintBelts(ctx: SimContext, inst: InstanceSlot, st: TockFightState | null): void {
  const speed = beltSpeed(inst.difficulty === 'heroic');
  for (let i = 0; i < BELT_COUNT; i++) {
    const obj = beltObject(ctx, inst, i);
    if (!st) {
      obj.templateId = FOUNDRY_BELT_TEMPLATES.idle;
      obj.scale = 1;
      continue;
    }
    obj.templateId = st.flipping.includes(i)
      ? FOUNDRY_BELT_TEMPLATES.alarm
      : FOUNDRY_BELT_TEMPLATES.run;
    obj.facing = st.dirs[i] > 0 ? 0 : Math.PI;
    obj.prevFacing = obj.facing;
    obj.scale = speed;
  }
}

/** The belts as conveyor regions in world coordinates. */
export function beltRegions(
  ctx: SimContext,
  inst: InstanceSlot,
  dirs: readonly number[],
): ConveyorRegion[] {
  const o = ctx.instanceOriginOf(inst);
  const speed = beltSpeed(inst.difficulty === 'heroic');
  return BELTS.xs.map((x, i) => ({
    x0: o.x + x - BELTS.halfWidth,
    x1: o.x + x + BELTS.halfWidth,
    z0: o.z + BELTS.z0,
    z1: o.z + BELTS.z1,
    vx: 0,
    vz: dirs[i] * speed,
  }));
}

/** Everything standing on the Main Line that a belt can carry: the claim's
 *  players and its living mobs there (Tock and his frames), in id order. */
function lineBodies(ctx: SimContext, inst: InstanceSlot): Entity[] {
  const o = ctx.instanceOriginOf(inst);
  const inLine = (e: Entity) => {
    const x = e.pos.x - o.x;
    const z = e.pos.z - o.z;
    return x >= MAIN_LINE.x0 && x <= MAIN_LINE.x1 && z >= MAIN_LINE.z0 && z <= MAIN_LINE.z1;
  };
  const out = claimPlayers(ctx, inst).filter(inLine);
  for (const id of inst.mobIds) {
    const e = ctx.entities.get(id);
    if (e && e.kind === 'mob' && !e.dead && inLine(e)) out.push(e);
  }
  return out.sort((a, b) => a.id - b.id);
}

/** Players on the Main Line (the fight's reach). */
function linePlayers(ctx: SimContext, inst: InstanceSlot): Entity[] {
  const o = ctx.instanceOriginOf(inst);
  return claimPlayers(ctx, inst).filter((p) => {
    const z = p.pos.z - o.z;
    return (
      Math.abs(p.pos.x - o.x) <= MAIN_LINE.x1 + 4 && z >= MAIN_LINE.z0 - 4 && z <= MAIN_LINE.z1
    );
  });
}

function setPressure(ctx: SimContext, boss: Entity, st: TockFightState): void {
  // The gauge: the aura's clock runs down to the lever throw.
  dropAuraById(boss, TOCK_PRESSURE);
  ctx.applyAura(boss, {
    id: TOCK_PRESSURE,
    name: 'Line Pressure',
    kind: 'buff_dr',
    remaining: Math.max(0.05, st.leverTimer),
    duration: T.leverEvery,
    value: 0,
    sourceId: boss.id,
    school: 'physical',
    undispellable: true,
  });
}

/** Throw the great lever: the klaxon bar, the belts it will reverse turn red. */
export function startLever(
  ctx: SimContext,
  inst: InstanceSlot,
  boss: Entity,
  st: TockFightState,
): void {
  st.levers++;
  st.flipping = leverPair(inst.difficulty === 'heroic', boss.id, st.levers);
  st.leverTimer = T.leverEvery;
  clearCastIf(boss, TOCK_RIVET_GUN);
  startBar(boss, TOCK_LEVER, T.leverCast, null);
  paintBelts(ctx, inst, st);
}

function landLever(ctx: SimContext, inst: InstanceSlot, boss: Entity, st: TockFightState): void {
  for (const i of st.flipping) st.dirs[i] = -st.dirs[i];
  st.flipping = [];
  paintBelts(ctx, inst, st);
  setPressure(ctx, boss, st);
  ctx.emit({
    type: 'spellfx',
    sourceId: boss.id,
    targetId: boss.id,
    school: 'physical',
    fx: 'nova',
    ability: TOCK_LEVER,
  });
}

/** Paint one belt's press strip centred on rail stop `zc` (instance-local):
 *  its carriage slides there and the hammer lands pressWarning later. False
 *  (nothing painted) when that belt's carriage is already out. */
export function paintStrip(
  ctx: SimContext,
  inst: InstanceSlot,
  boss: Entity,
  st: TockFightState,
  belt: number,
  zc: number,
): boolean {
  if (belt < 0 || belt >= BELT_COUNT || st.presses.some((p) => p.belt === belt)) return false;
  const o = ctx.instanceOriginOf(inst);
  const strip = spawnFoundryObject(
    ctx,
    inst,
    FOUNDRY_PRESS_STRIP,
    'Stamping Press',
    o.x + BELTS.xs[belt],
    o.z + zc,
    T.pressLength,
  );
  st.presses.push({ belt, zc, remaining: T.pressWarning, objectId: strip.id });
  ctx.emit({
    type: 'spellfx',
    sourceId: boss.id,
    targetId: strip.id,
    school: 'physical',
    fx: 'windup',
    ability: TOCK_STAMPING_PRESS,
  });
  return true;
}

/** The rail stop a carriage takes to catch a body at local z `z` on `belt`:
 *  that z led by the belt's run over the warning, snapped to the rail grid. */
function ledStop(inst: InstanceSlot, st: TockFightState, belt: number, z: number): number {
  const speed = beltSpeed(inst.difficulty === 'heroic');
  return pressStripCentre(BELTS, z + st.dirs[belt] * speed * T.pressWarning);
}

/** One press cycle: a carriage (heroic: two) slides to the players riding the
 *  belts, a hashed rider on a free belt each; nobody riding a free belt, a
 *  hashed free belt aimed at a hashed Main Line player's z (else the press
 *  end). Returns the belts painted, in paint order. */
export function startPress(
  ctx: SimContext,
  inst: InstanceSlot,
  boss: Entity,
  st: TockFightState,
): number[] {
  st.casts++;
  st.pressTimer = T.pressEvery;
  const count = inst.difficulty === 'heroic' ? T.heroicPresses : 1;
  const players = linePlayers(ctx, inst);
  const free = (b: number) => b >= 0 && !st.presses.some((p) => p.belt === b);
  const painted: number[] = [];
  for (let n = 0; n < count; n++) {
    const salt = st.casts * 7 + n * 31 + 3;
    const riders: { belt: number; z: number }[] = [];
    for (const p of players) {
      const at = localOf(ctx, inst, p);
      const belt = beltIndexAt(BELTS, at.x, at.z);
      if (free(belt)) riders.push({ belt, z: at.z });
    }
    if (riders.length > 0) {
      const rider = riders[kitHash(boss.id, salt) % riders.length];
      if (paintStrip(ctx, inst, boss, st, rider.belt, ledStop(inst, st, rider.belt, rider.z)))
        painted.push(rider.belt);
      continue;
    }
    const open = BELTS.xs.map((_, i) => i).filter(free);
    if (open.length === 0) break;
    const belt = open[kitHash(boss.id, salt) % open.length];
    const near = players.length > 0 ? players[kitHash(boss.id, salt + 1) % players.length] : null;
    const zc = near
      ? ledStop(inst, st, belt, localOf(ctx, inst, near).z)
      : pressRailStops(BELTS)[0];
    if (paintStrip(ctx, inst, boss, st, belt, zc)) painted.push(belt);
  }
  return painted;
}

function landPress(
  ctx: SimContext,
  inst: InstanceSlot,
  boss: Entity,
  st: TockFightState,
  press: TockFightState['presses'][number],
): void {
  ctx.emit({
    type: 'spellfx',
    sourceId: boss.id,
    targetId: press.objectId,
    school: 'physical',
    fx: 'nova',
    ability: TOCK_STAMPING_PRESS,
  });
  dropEncounterObject(ctx, inst, press.objectId);
  for (const p of claimPlayers(ctx, inst)) {
    const at = localOf(ctx, inst, p);
    if (!inPressStrip(BELTS, press.belt, press.zc, at.x, at.z)) continue;
    st.pressed = true;
    ctx.dealDamage(
      boss,
      p,
      mechanicDamage(ctx, boss, T.pressMin, T.pressMax),
      false,
      'physical',
      'Stamping Press',
      'hit',
      true,
    );
    if (p.dead) continue;
    ctx.applyAura(p, {
      id: TOCK_FLATTENED,
      name: 'Flattened',
      kind: 'stun',
      remaining: T.pressKnockdown,
      duration: T.pressKnockdown,
      value: 0,
      sourceId: boss.id,
      school: 'physical',
    });
  }
  // The press does not care what it stamps: a frame under it is crushed.
  for (const id of [...inst.mobIds]) {
    const e = ctx.entities.get(id);
    if (!e || e.dead || e.templateId !== HALF_BUILT_FRAME_ID) continue;
    const at = localOf(ctx, inst, e);
    if (inPressStrip(BELTS, press.belt, press.zc, at.x, at.z)) ctx.handleDeath(e, null);
  }
}

/** Count every hammer down; land those whose warning ran out (paint order). */
function stepPresses(ctx: SimContext, inst: InstanceSlot, boss: Entity, st: TockFightState): void {
  for (const p of st.presses) p.remaining -= DT;
  if (!st.presses.some((p) => p.remaining <= 1e-9)) return;
  const due = st.presses.filter((p) => p.remaining <= 1e-9);
  st.presses = st.presses.filter((p) => p.remaining > 1e-9);
  for (const p of due) landPress(ctx, inst, boss, st, p);
}

/** Parts Drop: three Half-Built Frames onto three belts at the chute end,
 *  booting up 8 s later. Returns how many dropped. */
export function dropParts(
  ctx: SimContext,
  inst: InstanceSlot,
  boss: Entity,
  st: TockFightState,
): number {
  st.casts++;
  const victim = bossTarget(ctx, boss);
  const o = ctx.instanceOriginOf(inst);
  const skip = kitHash(boss.id, st.casts * 11 + 1) % BELT_COUNT;
  const belts = BELTS.xs.map((_, i) => i).filter((i) => i !== skip);
  let n = 0;
  for (const b of belts.slice(0, T.partsCount)) {
    const frame = spawnKitAdd(
      ctx,
      inst,
      boss,
      HALF_BUILT_FRAME_ID,
      o.x + BELTS.xs[b],
      o.z + PARTS_CHUTE.z + 3,
      victim,
    );
    if (!frame) continue;
    frame.facing = 0;
    frame.prevFacing = 0;
    // Self-sourced, so its CC immunity never refuses its own boot sequence.
    ctx.applyAura(frame, {
      id: FRAME_BOOTING,
      name: 'Booting Up',
      kind: 'stun',
      remaining: T.frameBoot,
      duration: T.frameBoot,
      value: 0,
      sourceId: frame.id,
      school: 'physical',
      unbreakableControl: true,
      undispellable: true,
    });
    st.frames.push({ id: frame.id, boot: T.frameBoot });
    n++;
  }
  ctx.emit({
    type: 'spellfx',
    sourceId: boss.id,
    targetId: boss.id,
    school: 'physical',
    fx: 'nova',
    ability: TOCK_PARTS_DROP,
  });
  ctx.emit({ type: 'log', text: TOCK_LINES.partsLog, color: '#ffc870', entityId: boss.id });
  emitMobYell(ctx, boss, TOCK_LINES.parts);
  return n;
}

function stepFrames(ctx: SimContext, st: TockFightState): void {
  for (let i = st.frames.length - 1; i >= 0; i--) {
    const f = st.frames[i];
    f.boot -= DT;
    const e = ctx.entities.get(f.id);
    if (!e || e.dead || f.boot <= 0) st.frames.splice(i, 1);
  }
}

/** The fight ended: the belts stop, the strip goes, the gauge empties. */
function endTockFight(ctx: SimContext, inst: InstanceSlot, boss: Entity): void {
  const st = boss.foundryFight?.kind === 'tock' ? boss.foundryFight : null;
  for (const p of st?.presses ?? []) dropEncounterObject(ctx, inst, p.objectId);
  endVents(ctx, inst, st);
  clearCastIf(boss, TOCK_LEVER, TOCK_RIVET_GUN);
  dropAuraById(boss, TOCK_PRESSURE);
  paintBelts(ctx, inst, null);
  boss.foundryFight = undefined;
}

/** Tock's fight state, started on his first engaged tick. */
export function tockState(ctx: SimContext, inst: InstanceSlot, boss: Entity): TockFightState {
  if (boss.foundryFight?.kind === 'tock') return boss.foundryFight;
  const st = freshState(inst);
  boss.foundryFight = st;
  paintBelts(ctx, inst, st);
  setPressure(ctx, boss, st);
  emitMobYell(ctx, boss, TOCK_LINES.engage);
  return st;
}

function stepBars(ctx: SimContext, inst: InstanceSlot, boss: Entity, st: TockFightState): boolean {
  const casting = boss.castingAbility;
  // A lever bar cut short (an interrupt) still throws the lever.
  if (st.flipping.length > 0 && casting !== TOCK_LEVER) landLever(ctx, inst, boss, st);
  if (casting !== TOCK_LEVER && casting !== TOCK_RIVET_GUN) return false;
  boss.swingTimer = Math.max(boss.swingTimer, 0.6);
  boss.castRemaining = Math.max(0, boss.castRemaining - DT);
  if (boss.castRemaining > 0) return true;
  const targetId = boss.castTargetId;
  clearCastIf(boss, casting);
  if (casting === TOCK_LEVER) {
    landLever(ctx, inst, boss, st);
    return true;
  }
  const tank = targetId !== null ? ctx.entities.get(targetId) : undefined;
  if (!tank || tank.dead) return true;
  ctx.emit({
    type: 'spellfx',
    sourceId: boss.id,
    targetId: tank.id,
    school: 'physical',
    fx: 'nova',
    ability: TOCK_RIVET_GUN,
  });
  heavySwing(ctx, boss, tank, T.rivetMult, 'Rivet Gun');
  return true;
}

/** One tick of Tock's fight (after the mob AI). */
export function tickTock(
  ctx: SimContext,
  inst: InstanceSlot,
  boss: Entity,
  engaged: boolean,
): void {
  const live = boss.foundryFight?.kind === 'tock' ? boss.foundryFight : null;
  if (boss.dead) {
    if (live) {
      if (!live.pressed) grantClaimDeed(ctx, inst, TOCK_DEED);
      emitMobYell(ctx, boss, TOCK_LINES.death);
      endTockFight(ctx, inst, boss);
    }
    return;
  }
  if (!engaged) {
    if (live) endTockFight(ctx, inst, boss);
    return;
  }
  const st = tockState(ctx, inst, boss);
  // The belts carry everything on them, then the hammer and the bars resolve.
  carryOnConveyors(ctx, lineBodies(ctx, inst), beltRegions(ctx, inst, st.dirs), DT);
  stepFrames(ctx, st);
  stepPresses(ctx, inst, boss, st);
  while (
    st.dropsFired < T.partsAtHpPct.length &&
    boss.maxHp > 0 &&
    boss.hp / boss.maxHp <= T.partsAtHpPct[st.dropsFired]
  ) {
    st.dropsFired++;
    dropParts(ctx, inst, boss, st);
  }
  const onLine = linePlayers(ctx, inst).length > 0;
  st.pressTimer -= DT;
  if (st.pressTimer <= 0 && onLine) startPress(ctx, inst, boss, st);
  tickVents(ctx, inst, boss, st, onLine);
  st.leverTimer -= DT;
  if (stepBars(ctx, inst, boss, st)) return;
  if (ctx.isStunned(boss) || boss.castingAbility !== null) return;
  if (st.leverTimer <= 0) {
    startLever(ctx, inst, boss, st);
    return;
  }
  st.rivetTimer -= DT;
  if (st.rivetTimer <= 0 && boss.aggroTargetId !== null) {
    st.rivetTimer = T.rivetEvery;
    startBar(boss, TOCK_RIVET_GUN, T.rivetCast, boss.aggroTargetId);
  }
}

/** Which belt (or -1) a body stands on, for tests and the dev log. */
export function beltUnder(ctx: SimContext, inst: InstanceSlot, e: Entity): number {
  const at = localOf(ctx, inst, e);
  return beltIndexAt(BELTS, at.x, at.z);
}
