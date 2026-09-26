// The Mirefen muster, alive: the squads Warden Fenwick sent to contain Balgath.
//
// The camps and posts are data (src/sim/content/mirefen_muster.ts). This module is the
// army's whole lifecycle, driven once per tick from the world-boss scheduler pass
// (world_boss.ts), which is the one place that already knows whether the Foreman exists:
//
//   - MUSTER: the army is raised the first time a Balgath exists in the world (the
//     scheduler's own spawn, or a dev spawn found by a once-a-second scan) and then stays.
//     Raising it on the boss rather than at world construction is deliberate: no entity id
//     moves in any world that never sees him (the parity goldens, the RL env), and the
//     muster is only ever in a world that has something for it to contain.
//   - STANCE: soldiers face him while he is within sight, and while he is ENGAGED and
//     close they brace (aggroTargetId on him, which is what the renderer reads to hold a
//     combat idle). They never attack him and never enter combat (mob/muster_soldier.ts).
//   - CHEERS: the moment his eye is put out, and the moment he falls, every soldier in
//     earshot cheers (the overhead emote channel players already use).
//   - WRECKAGE: only his slams kill them (mob/boss_collateral.ts, lethal to a soldier by
//     rule). The dead stay down while the fight goes on and stand back up a few seconds
//     after the pull ends, or at the next dawn at the latest, so the fen is never left
//     without its muster.
//   - LOANS: the muster pike sweep (muster_pike.ts) rides the same pass, because "the pull
//     ended" is decided here.
//
// State lives on Sim (MusterArmyState, a live SimContext view). Draws no rng: every spawn
// is at a fixed post with a fixed facing and a fixed level, every rule is arithmetic.

import {
  MUSTER_BOSS_TEMPLATE_ID,
  MUSTER_CAMPS,
  MUSTER_RACK,
  MUSTER_RACK_NAME,
  MUSTER_RACK_TEMPLATE_ID,
} from './content/mirefen_muster';
import { MOBS } from './data';
import { createGroundObject, createMob } from './entity';
import { eyeWardBlinded } from './mob/eye_ward';
import { type LentPikes, takeMusterPike, tickLentPikes } from './muster_pike';
import type { SimContext } from './sim_context';
import { angleTo, dist2d, type Entity, normAngle } from './types';

export { MUSTER_BOSS_TEMPLATE_ID };
/** Seconds after a pull ends before the fallen stand back up (time for the raid to see
 *  what he did, short enough that the next pull finds the pickets manned). */
export const MUSTER_RESPAWN_DELAY = 12;
/** Soldiers turn to watch him inside this. */
export const MUSTER_WATCH_RANGE = 75;
/** ...and raise their guard inside this while he is engaged. */
export const MUSTER_BRACE_RANGE = 45;
/** A cheer carries this far from him. */
export const MUSTER_CHEER_RANGE = 90;
/** How long one cheer holds the emote channel. */
export const MUSTER_CHEER_SECONDS = 3.2;
/** Soldiers re-aim at him only once he has moved this far round them (radians). */
export const MUSTER_FACING_STEP = 0.15;
/** A boss spawned outside the scheduler (dev tooling) is looked for this often. */
const BOSS_SCAN_EVERY_TICKS = 20;

export interface MusterArmyState {
  /** Every soldier ever raised, in post order. Empty until the muster is raised. */
  soldierIds: number[];
  /** Each soldier's resting facing (his camp's), parallel to soldierIds. */
  homeFacing: number[];
  /** The command camp's weapon rack (a ground object), once raised. */
  rackId: number | null;
  /** The Balgath the muster is watching, while one exists. */
  bossId: number | null;
  /** He was engaged on the previous pass: the falling edge is "the pull ended". */
  engaged: boolean;
  /** Edge detectors for the two cheers. */
  blinded: boolean;
  bossDead: boolean;
  /** Sim time the fallen stand back up, or null while nobody is due. */
  respawnAt: number | null;
  /** Live muster pike loans (muster_pike.ts). */
  lent: LentPikes;
  /** The entity roster version the last dev-spawn scan saw (resolveBoss). */
  scannedRoster: number;
}

export function freshMusterArmy(): MusterArmyState {
  return {
    soldierIds: [],
    homeFacing: [],
    rackId: null,
    bossId: null,
    engaged: false,
    blinded: false,
    bossDead: false,
    respawnAt: null,
    lent: new Map(),
    scannedRoster: -1,
  };
}

/** Is the muster up in this world? */
export function musterRaised(army: MusterArmyState): boolean {
  return army.soldierIds.length > 0;
}

/**
 * One pass, from the world-boss scheduler. `scheduled` is the scheduler's own live Balgath
 * (null when its slot is empty); `dawn` is the scheduler's sunrise edge.
 */
export function tickMusterArmy(
  ctx: SimContext,
  army: MusterArmyState,
  scheduled: Entity | null,
  dawn: boolean,
): void {
  const boss = resolveBoss(ctx, army, scheduled);
  if (boss && !musterRaised(army)) raiseMuster(ctx, army);
  if (!musterRaised(army)) return;

  const engaged = !!boss && !boss.dead && !boss.asleep && boss.inCombat;
  const pullEnded = army.engaged && !engaged;
  army.engaged = engaged;
  if (pullEnded) army.respawnAt = ctx.time + MUSTER_RESPAWN_DELAY;
  if (dawn) army.respawnAt = ctx.time;

  const blinded = !!boss && !boss.dead && eyeWardBlinded(ctx, boss);
  const bossDead = !!boss && boss.dead;
  const cheer = (blinded && !army.blinded) || (bossDead && !army.bossDead);
  army.blinded = blinded;
  army.bossDead = bossDead;

  const standUp = army.respawnAt !== null && ctx.time >= army.respawnAt;
  for (let i = 0; i < army.soldierIds.length; i++) {
    const s = ctx.entities.get(army.soldierIds[i]);
    if (!s) continue;
    if (s.dead) {
      // Down until the muster stands him up: the ordinary in-place respawn must never
      // bring a soldier back mid-fight, and his body stays where the fist left it.
      s.respawnTimer = Number.POSITIVE_INFINITY;
      if (standUp) reform(ctx, s, army.homeFacing[i]);
      continue;
    }
    holdStance(s, boss, engaged, army.homeFacing[i]);
    if (cheer && boss && dist2d(s.pos, boss.pos) <= MUSTER_CHEER_RANGE) startCheer(ctx, s);
    else if (s.overheadEmoteId !== null && ctx.time >= s.overheadEmoteUntil) {
      s.overheadEmoteId = null;
    }
  }
  if (standUp) army.respawnAt = null;

  tickLentPikes(ctx, army.lent, pullEnded);
}

/** The rack was used: lend a pike (interaction.ts routes the rack's interact here). */
export function useMusterRack(ctx: SimContext, army: MusterArmyState, pid: number): void {
  takeMusterPike(ctx, army.lent, pid);
}

/** Is this entity the muster's weapon rack? */
export function isMusterRack(e: Entity): boolean {
  return e.kind === 'object' && e.templateId === MUSTER_RACK_TEMPLATE_ID;
}

function resolveBoss(ctx: SimContext, army: MusterArmyState, scheduled: Entity | null) {
  if (scheduled && scheduled.templateId === MUSTER_BOSS_TEMPLATE_ID) {
    army.bossId = scheduled.id;
    return scheduled;
  }
  if (army.bossId !== null) {
    const held = ctx.entities.get(army.bossId);
    if (held && held.templateId === MUSTER_BOSS_TEMPLATE_ID) return held;
    army.bossId = null;
  }
  // No scheduled boss: a dev spawn (the boss test drive, /dev tooling) is still a Balgath
  // the muster should answer. A once-a-second scan is the whole cost, and only while no
  // boss is known; the live realm's scheduler hands him over directly.
  // And only when the roster has changed since the last look: a world that never spawns
  // him (the RL env, a long respawn gap on the live realm) pays nothing per second.
  if (ctx.tickCount % BOSS_SCAN_EVERY_TICKS !== 0) return null;
  if (army.scannedRoster === ctx.entityRosterVersion) return null;
  army.scannedRoster = ctx.entityRosterVersion;
  for (const e of ctx.entities.values()) {
    if (e.kind === 'mob' && e.templateId === MUSTER_BOSS_TEMPLATE_ID) {
      army.bossId = e.id;
      return e;
    }
  }
  return null;
}

function raiseMuster(ctx: SimContext, army: MusterArmyState): void {
  for (const camp of MUSTER_CAMPS) {
    for (const slot of camp.soldiers) {
      const template = MOBS[slot.templateId];
      if (!template) continue;
      const pos = ctx.groundPos(camp.center.x + slot.dx, camp.center.z + slot.dz);
      const mob = createMob(ctx.nextId++, template, template.maxLevel, pos);
      mob.hostile = false;
      mob.facing = camp.facing;
      mob.prevFacing = camp.facing;
      mob.idleStationary = true;
      ctx.addEntity(mob);
      army.soldierIds.push(mob.id);
      army.homeFacing.push(camp.facing);
    }
  }
  const rack = createGroundObject(
    ctx.nextId++,
    '',
    MUSTER_RACK_NAME,
    ctx.groundPos(MUSTER_RACK.x, MUSTER_RACK.z),
  );
  rack.templateId = MUSTER_RACK_TEMPLATE_ID;
  rack.objectItemId = null;
  rack.lootable = true; // interactable
  rack.facing = MUSTER_RACK.facing;
  rack.prevFacing = MUSTER_RACK.facing;
  ctx.addEntity(rack);
  army.rackId = rack.id;
}

/** A living soldier's stance for this tick: watch him, brace while he is on them. */
function holdStance(s: Entity, boss: Entity | null, engaged: boolean, home: number): void {
  const watching =
    !!boss && !boss.dead && !boss.asleep && dist2d(s.pos, boss.pos) <= MUSTER_WATCH_RANGE;
  const want = watching && boss ? angleTo(s.pos, boss.pos) : home;
  // Turned in steps rather than tracked every tick: 36 bodies re-aiming 20 times a second
  // at a walking giant is 36 facing deltas per snapshot for every viewer in range, for a
  // turn nobody can see. A step this size is a head-turn the renderer's facing smoothing
  // eases anyway.
  if (Math.abs(normAngle(want - s.facing)) > MUSTER_FACING_STEP) s.facing = want;
  s.aggroTargetId =
    engaged && boss && dist2d(s.pos, boss.pos) <= MUSTER_BRACE_RANGE ? boss.id : null;
}

function startCheer(ctx: SimContext, s: Entity): void {
  s.overheadEmoteId = 'cheer';
  s.overheadEmoteSeq += 1;
  s.overheadEmoteUntil = ctx.time + MUSTER_CHEER_SECONDS;
}

/** Stand a fallen soldier back up on his post, friendly, facing his camp's way. */
function reform(ctx: SimContext, s: Entity, home: number): void {
  ctx.respawnMob(s);
  s.hostile = false;
  s.aggroTargetId = null;
  s.facing = home;
  s.prevFacing = home;
  s.overheadEmoteId = null;
}
