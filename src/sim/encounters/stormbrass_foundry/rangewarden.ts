// The Rangewarden on the Proving Range (docs/design/dungeon-rework/
// stormbrass_foundry.md 5.2): a marked player keeps moving, and the shells
// follow (G20 trail salvo).
//
//   Target Lock   every 18 s two non-tank players (heroic Walking Barrage:
//                 three) are marked for 8 s. Every second the berm turrets
//                 fire at the spot where each marked player stood 1.5 s
//                 earlier: a 5 yd circle paints for 0.6 s, then 250 to 300 to
//                 everyone in it. Keep moving and the shells land behind you;
//                 stand still and you are shelled; run through the group and
//                 you drag the shells into your friends.
//   Bunkers       the range's two low bunkers are cover: a shell landing in a
//                 bunker's lee (east of the wall, away from the berm) bursts on
//                 the wall instead, three times per Target Lock before the
//                 bunker is blown open until the next lock.
//   Proof Shot    every 15 s a 1.5 s bar, then a heavy shell at the tank (1.5
//                 times its melee) and Dented Plating: +10 percent physical
//                 damage taken for 12 s, up to 3 stacks.
//   Drill Drones  at 66 and 33 percent three Arc Drones launch from its back.
//   Heroic        Walking Barrage (three marks) and Shrapnel: each impact
//                 leaves shrapnel for 6 s, 40 a second, so a trail cannot be
//                 crossed back quickly.
//
// The deed (Clean Range): defeat it with nobody hit by a salvo shell.
// Deterministic: the marks are hashed (pickMarkTargets), each marked player's
// trail is a fixed-tick position history (one sample a tick), the only rng
// draws are damage rolls. Every visible state rides existing fields: the
// Target Lock aura, the shell and shrapnel objects, the bunker objects
// (sound or breached), the Proof Shot bar.

import { PROVING_RANGE, RANGE_BUNKERS } from '../../content/stormbrass_foundry_layout';
import { spawnKitAdd } from '../../mob/trash_kit/spawn';
import { emitMobYell } from '../../mob/yells';
import type { InstanceSlot } from '../../sim';
import type { SimContext } from '../../sim_context';
import { DT, type Entity, type RangewardenFightState } from '../../types';
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
  pickMarkTargets,
  spawnFoundryObject,
  startBar,
} from './claim';
import {
  ARC_DRONE_ID,
  bunkerLeeAt,
  FOUNDRY_BUNKER_TEMPLATES,
  FOUNDRY_SHELL_MARK,
  FOUNDRY_SHRAPNEL,
  RANGE_DENTED,
  RANGE_DRILL_DRONES,
  RANGE_PROOF_SHOT,
  RANGE_SALVO,
  RANGE_SHRAPNEL,
  RANGE_TARGET_LOCK,
  RANGE_TUNING as T,
} from './ids';

export const RANGEWARDEN_DEED = 'dgn_rangewarden_clean';

/** The chat lines (re-localized by src/ui/sim_i18n.ts). */
export const RANGEWARDEN_LINES = {
  engage: 'Live-fire drill. Targets, take your positions.',
  drones: 'Drill drones, launch. Flush them out.',
  death: 'Range... clear...',
} as const;

/** Trail samples kept per marked player: the shell lag at 20 Hz plus slack. */
const TRAIL_SAMPLES = Math.ceil(T.shellLag / DT) + 4;
const LAG_TICKS = Math.round(T.shellLag / DT);

function freshState(): RangewardenFightState {
  return {
    kind: 'rangewarden',
    lockTimer: T.lockFirst,
    marks: [],
    shells: [],
    shrapnel: [],
    bunkerHits: RANGE_BUNKERS.map(() => 0),
    proofTimer: T.proofFirst,
    drillsFired: 0,
    casts: 0,
    shelled: false,
  };
}

/** Players on the Proving Range (and a margin round it). */
export function rangePlayers(ctx: SimContext, inst: InstanceSlot): Entity[] {
  const o = ctx.instanceOriginOf(inst);
  const R = PROVING_RANGE;
  return claimPlayers(ctx, inst).filter((p) => {
    const x = p.pos.x - o.x;
    const z = p.pos.z - o.z;
    return x >= R.x0 - 6 && x <= R.x1 + 6 && z >= R.z0 - 6 && z <= R.z1 + 6;
  });
}

/** The claim's object for one bunker (created on first use, kept for the
 *  claim's life: its template id carries sound or breached). */
function bunkerObject(ctx: SimContext, inst: InstanceSlot, i: number): Entity {
  const b = RANGE_BUNKERS[i];
  const have = claimObjectAt(ctx, inst, b.x, b.z);
  if (have) return have;
  const o = ctx.instanceOriginOf(inst);
  return spawnFoundryObject(
    ctx,
    inst,
    FOUNDRY_BUNKER_TEMPLATES.sound,
    'Range Bunker',
    o.x + b.x,
    o.z + b.z,
    b.hw,
  );
}

function paintBunkers(ctx: SimContext, inst: InstanceSlot, hits: readonly number[]): void {
  RANGE_BUNKERS.forEach((_, i) => {
    const obj = bunkerObject(ctx, inst, i);
    obj.templateId =
      (hits[i] ?? 0) >= T.bunkerShells
        ? FOUNDRY_BUNKER_TEMPLATES.breached
        : FOUNDRY_BUNKER_TEMPLATES.sound;
  });
}

/** Target Lock: mark two (heroic three) non-tank players. Returns how many. */
export function startTargetLock(
  ctx: SimContext,
  inst: InstanceSlot,
  boss: Entity,
  st: RangewardenFightState,
): number {
  st.casts++;
  st.lockTimer = T.lockEvery;
  // Each lock the bunkers stand sound again.
  st.bunkerHits = RANGE_BUNKERS.map(() => 0);
  paintBunkers(ctx, inst, st.bunkerHits);
  const count = inst.difficulty === 'heroic' ? T.heroicLockCount : T.lockCount;
  const busy = new Set(st.marks.map((m) => m.playerId));
  const picks = pickMarkTargets(boss, rangePlayers(ctx, inst), count, st.casts, busy);
  for (const p of picks) {
    const at = localOf(ctx, inst, p);
    st.marks.push({
      playerId: p.id,
      remaining: T.lockSeconds,
      shellTimer: T.shellEvery,
      trail: [at],
    });
    ctx.applyAura(p, {
      id: RANGE_TARGET_LOCK,
      name: 'Target Lock',
      // A mark, not a slow: the value leaves the runner at full speed.
      kind: 'slow',
      remaining: T.lockSeconds,
      duration: T.lockSeconds,
      value: 1,
      sourceId: boss.id,
      school: 'physical',
      undispellable: true,
    });
    ctx.emit({
      type: 'spellfx',
      sourceId: boss.id,
      targetId: p.id,
      school: 'physical',
      fx: 'windup',
      ability: RANGE_TARGET_LOCK,
    });
  }
  return picks.length;
}

/** Where the mark stood `shellLag` seconds ago (its oldest sample before then). */
export function trailSpot(trail: readonly { x: number; z: number }[]): { x: number; z: number } {
  const i = Math.max(0, trail.length - 1 - LAG_TICKS);
  return trail[i];
}

function fireShell(
  ctx: SimContext,
  inst: InstanceSlot,
  boss: Entity,
  st: RangewardenFightState,
  at: { x: number; z: number },
): void {
  const o = ctx.instanceOriginOf(inst);
  const obj = spawnFoundryObject(
    ctx,
    inst,
    FOUNDRY_SHELL_MARK,
    'Shell',
    o.x + at.x,
    o.z + at.z,
    T.shellRadius,
  );
  st.shells.push({ x: at.x, z: at.z, remaining: T.shellWarning, objectId: obj.id });
  ctx.emit({
    type: 'spellfx',
    sourceId: boss.id,
    targetId: obj.id,
    school: 'fire',
    fx: 'windup',
    ability: RANGE_SALVO,
  });
}

function stepMarks(
  ctx: SimContext,
  inst: InstanceSlot,
  boss: Entity,
  st: RangewardenFightState,
): void {
  for (let i = st.marks.length - 1; i >= 0; i--) {
    const m = st.marks[i];
    const p = ctx.entities.get(m.playerId);
    if (!p || p.dead) {
      st.marks.splice(i, 1);
      continue;
    }
    m.trail.push(localOf(ctx, inst, p));
    if (m.trail.length > TRAIL_SAMPLES) m.trail.shift();
    m.remaining -= DT;
    m.shellTimer -= DT;
    if (m.shellTimer <= 1e-9) {
      m.shellTimer += T.shellEvery;
      fireShell(ctx, inst, boss, st, trailSpot(m.trail));
    }
    if (m.remaining <= 1e-9) {
      st.marks.splice(i, 1);
      dropAuraById(p, RANGE_TARGET_LOCK);
    }
  }
}

function landShell(
  ctx: SimContext,
  inst: InstanceSlot,
  boss: Entity,
  st: RangewardenFightState,
  shell: RangewardenFightState['shells'][number],
): void {
  // The impact (or the burst on a bunker) plays on the shell's own circle.
  ctx.emit({
    type: 'spellfx',
    sourceId: boss.id,
    targetId: shell.objectId,
    school: 'fire',
    fx: 'nova',
    ability: RANGE_SALVO,
  });
  dropEncounterObject(ctx, inst, shell.objectId);
  // A bunker in the way takes the shell (while it holds).
  const bunker = bunkerLeeAt(RANGE_BUNKERS, shell.x, shell.z);
  if (bunker >= 0 && st.bunkerHits[bunker] < T.bunkerShells) {
    st.bunkerHits[bunker]++;
    paintBunkers(ctx, inst, st.bunkerHits);
    return;
  }
  const o = ctx.instanceOriginOf(inst);
  for (const p of claimPlayers(ctx, inst)) {
    if (Math.hypot(p.pos.x - o.x - shell.x, p.pos.z - o.z - shell.z) > T.shellRadius) continue;
    st.shelled = true;
    ctx.dealDamage(
      boss,
      p,
      mechanicDamage(ctx, boss, T.shellMin, T.shellMax),
      false,
      'fire',
      'Salvo',
      'hit',
      true,
    );
  }
  // Heroic Shrapnel lingers where it burst.
  if (inst.difficulty !== 'heroic') return;
  const field = spawnFoundryObject(
    ctx,
    inst,
    FOUNDRY_SHRAPNEL,
    'Shrapnel',
    o.x + shell.x,
    o.z + shell.z,
    T.shrapnelRadius,
  );
  st.shrapnel.push({
    x: shell.x,
    z: shell.z,
    remaining: T.shrapnelSeconds,
    tick: 1,
    objectId: field.id,
  });
  ctx.emit({
    type: 'spellfx',
    sourceId: boss.id,
    targetId: field.id,
    school: 'physical',
    fx: 'windup',
    ability: RANGE_SHRAPNEL,
  });
}

function stepShells(
  ctx: SimContext,
  inst: InstanceSlot,
  boss: Entity,
  st: RangewardenFightState,
): void {
  for (let i = st.shells.length - 1; i >= 0; i--) {
    const s = st.shells[i];
    s.remaining -= DT;
    if (s.remaining > 1e-9) continue;
    st.shells.splice(i, 1);
    landShell(ctx, inst, boss, st, s);
  }
  const o = ctx.instanceOriginOf(inst);
  for (let i = st.shrapnel.length - 1; i >= 0; i--) {
    const s = st.shrapnel[i];
    s.remaining -= DT;
    s.tick -= DT;
    if (s.tick <= 1e-9) {
      s.tick += 1;
      for (const p of claimPlayers(ctx, inst)) {
        if (Math.hypot(p.pos.x - o.x - s.x, p.pos.z - o.z - s.z) > T.shrapnelRadius) continue;
        const amount = Math.max(
          1,
          Math.round(T.shrapnelPerSecond * (boss.mechanicDamageMult ?? 1)),
        );
        ctx.dealDamage(boss, p, amount, false, 'physical', 'Shrapnel', 'hit', true);
      }
    }
    if (s.remaining <= 1e-9) {
      st.shrapnel.splice(i, 1);
      dropEncounterObject(ctx, inst, s.objectId);
    }
  }
}

/** Drill Drones: three Arc Drones launch from its back. Returns how many. */
export function launchDrillDrones(
  ctx: SimContext,
  inst: InstanceSlot,
  boss: Entity,
  st: RangewardenFightState,
): number {
  st.casts++;
  const victim = bossTarget(ctx, boss);
  const back = boss.facing + Math.PI;
  let n = 0;
  for (let k = 0; k < T.drillCount; k++) {
    const a = back + (k - (T.drillCount - 1) / 2) * 0.6;
    const drone = spawnKitAdd(
      ctx,
      inst,
      boss,
      ARC_DRONE_ID,
      boss.pos.x + Math.sin(a) * 4,
      boss.pos.z + Math.cos(a) * 4,
      victim,
    );
    if (drone) n++;
  }
  ctx.emit({
    type: 'spellfx',
    sourceId: boss.id,
    targetId: boss.id,
    school: 'nature',
    fx: 'nova',
    ability: RANGE_DRILL_DRONES,
  });
  emitMobYell(ctx, boss, RANGEWARDEN_LINES.drones);
  return n;
}

/** Proof Shot lands: the heavy shell, then a dent in the tank's plating. */
function landProofShot(ctx: SimContext, boss: Entity, tank: Entity): void {
  ctx.emit({
    type: 'spellfx',
    sourceId: boss.id,
    targetId: tank.id,
    school: 'physical',
    fx: 'nova',
    ability: RANGE_PROOF_SHOT,
  });
  heavySwing(ctx, boss, tank, T.proofMult, 'Proof Shot');
  if (tank.dead) return;
  const prior = tank.auras.find((a) => a.id === RANGE_DENTED);
  const stacks = Math.min(T.dentedMax, (prior?.stacks ?? 0) + 1);
  dropAuraById(tank, RANGE_DENTED);
  ctx.applyAura(tank, {
    id: RANGE_DENTED,
    name: 'Dented Plating',
    kind: 'expose',
    remaining: T.dentedSeconds,
    duration: T.dentedSeconds,
    value: T.dentedPct * stacks,
    stacks,
    sourceId: boss.id,
    school: 'physical',
  });
}

/** The fight ended: the marks fade, the shells and the shrapnel go, the
 *  bunkers stand sound. */
function endRangeFight(ctx: SimContext, inst: InstanceSlot, boss: Entity): void {
  const st = boss.foundryFight?.kind === 'rangewarden' ? boss.foundryFight : null;
  if (st) {
    for (const m of st.marks) {
      const p = ctx.entities.get(m.playerId);
      if (p) dropAuraById(p, RANGE_TARGET_LOCK);
    }
    for (const s of st.shells) dropEncounterObject(ctx, inst, s.objectId);
    for (const s of st.shrapnel) dropEncounterObject(ctx, inst, s.objectId);
    paintBunkers(ctx, inst, []);
  }
  clearCastIf(boss, RANGE_PROOF_SHOT);
  boss.foundryFight = undefined;
}

/** The Rangewarden's fight state, started on its first engaged tick. */
export function rangeState(
  ctx: SimContext,
  inst: InstanceSlot,
  boss: Entity,
): RangewardenFightState {
  if (boss.foundryFight?.kind === 'rangewarden') return boss.foundryFight;
  const st = freshState();
  boss.foundryFight = st;
  paintBunkers(ctx, inst, st.bunkerHits);
  emitMobYell(ctx, boss, RANGEWARDEN_LINES.engage);
  return st;
}

/** One tick of the Rangewarden's fight (after the mob AI). */
export function tickRangewarden(
  ctx: SimContext,
  inst: InstanceSlot,
  boss: Entity,
  engaged: boolean,
): void {
  const live = boss.foundryFight?.kind === 'rangewarden' ? boss.foundryFight : null;
  if (boss.dead) {
    if (live) {
      if (!live.shelled) grantClaimDeed(ctx, inst, RANGEWARDEN_DEED);
      emitMobYell(ctx, boss, RANGEWARDEN_LINES.death);
      endRangeFight(ctx, inst, boss);
    }
    return;
  }
  if (!engaged) {
    if (live) endRangeFight(ctx, inst, boss);
    return;
  }
  const st = rangeState(ctx, inst, boss);
  stepMarks(ctx, inst, boss, st);
  stepShells(ctx, inst, boss, st);
  while (
    st.drillsFired < T.drillAtHpPct.length &&
    boss.maxHp > 0 &&
    boss.hp / boss.maxHp <= T.drillAtHpPct[st.drillsFired]
  ) {
    st.drillsFired++;
    launchDrillDrones(ctx, inst, boss, st);
  }
  st.lockTimer -= DT;
  if (st.lockTimer <= 0) startTargetLock(ctx, inst, boss, st);
  if (boss.castingAbility === RANGE_PROOF_SHOT) {
    boss.swingTimer = Math.max(boss.swingTimer, 0.6);
    boss.castRemaining = Math.max(0, boss.castRemaining - DT);
    if (boss.castRemaining > 0) return;
    const targetId = boss.castTargetId;
    clearCastIf(boss, RANGE_PROOF_SHOT);
    const tank = targetId !== null ? ctx.entities.get(targetId) : undefined;
    if (tank && !tank.dead) landProofShot(ctx, boss, tank);
    return;
  }
  if (ctx.isStunned(boss) || boss.castingAbility !== null) return;
  st.proofTimer -= DT;
  if (st.proofTimer <= 0 && boss.aggroTargetId !== null) {
    st.proofTimer = T.proofEvery;
    startBar(boss, RANGE_PROOF_SHOT, T.proofCast, boss.aggroTargetId);
  }
}
