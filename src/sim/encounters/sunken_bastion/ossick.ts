// Gaoler Ossick in the Drowning Yard (docs/design/dungeon-rework/
// sunken_bastion.md, "Boss 2"): race the hooked player to a lit mooring post.
//
//   Gaol Hook        every 20 s (first at 8 s) a 1.2 s bar, then a hooked chain
//                    runs from the Drowning Winch to a non-tank player.
//   Keelhaul         8 s later the winch hauls: a hooked player within 3 yd of a
//                    LIT mooring post is freed (the post takes the pull and goes
//                    dark for 30 s); anyone else is dragged to the cage, stunned
//                    3 s and struck for 160 to 190 frost.
//   Gaoler's Cudgel  every 12 s a 1 s bar, then a heavy blow on the tank (1.5x
//                    melee) and a 30 percent slow for 6 s.
//   Open the Cells   at 60 and 30 percent, three Shackled Prisoners break out.
//   Heroic           Double Hook: two players are hooked at once, and one post
//                    frees only one of them. Heavy Chain: a hooked player moves
//                    30 percent slower.
//
// Zero rng in every pick (the hooked players by the kit's hash over the living
// non-tanks); the only draws are the landing damage rolls.

import { MOORING_POSTS } from '../../content/sunken_bastion_layout';
import { applyKnockback } from '../../knockback';
import { spawnKitAdd } from '../../mob/trash_kit/spawn';
import { kitHash } from '../../mob/trash_kit/targets';
import type { InstanceSlot } from '../../sim';
import type { SimContext } from '../../sim_context';
import { DT, dist2d, type Entity, type OssickFightState } from '../../types';
import { claimObjectAt, claimPlayers, grantClaimDeed, localOf, mechanicDamage } from './claim';
import {
  CELL_DOORS,
  OSSICK_CUDGEL,
  OSSICK_CUDGEL_SLOW,
  OSSICK_GAOL_HOOK,
  OSSICK_HOOKED,
  OSSICK_KEELHAULED,
  OSSICK_TUNING,
  POST_TEMPLATES,
  SHACKLED_PRISONER_ID,
  WINCH,
} from './ids';

const T = OSSICK_TUNING;
export const OSSICK_DEED = 'dgn_ossick_moored';

function freshState(): OssickFightState {
  return {
    kind: 'ossick',
    hookTimer: T.hookFirst,
    cudgelTimer: T.cudgelFirst,
    hooks: [],
    postDarkUntil: {},
    cellsFired: 0,
    keelhauled: false,
    casts: 0,
    pending: [],
  };
}

function clearOurCast(boss: Entity): void {
  if (boss.castingAbility !== OSSICK_GAOL_HOOK && boss.castingAbility !== OSSICK_CUDGEL) return;
  boss.castingAbility = null;
  boss.castRemaining = 0;
  boss.castTotal = 0;
  boss.castTargetId = null;
  boss.channeling = false;
}

/** Keep every post's look on its state: lit unless still dark from a pull. */
function syncPosts(ctx: SimContext, inst: InstanceSlot, st: OssickFightState | null): void {
  for (const post of MOORING_POSTS) {
    const e = claimObjectAt(ctx, inst, post.x, post.z);
    if (!e) continue;
    const dark = st !== null && (st.postDarkUntil[post.id] ?? 0) > ctx.time;
    const want = dark ? POST_TEMPLATES.dark : POST_TEMPLATES.lit;
    if (e.templateId !== want) {
      e.templateId = want;
      e.name = dark ? 'Dark Mooring Post' : 'Lit Mooring Post';
    }
  }
}

/** The players the next Gaol Hook takes: hashed among the living non-tanks
 *  (the tank only when alone), two on heroic. */
export function pickHookTargets(
  boss: Entity,
  players: readonly Entity[],
  count: number,
  salt: number,
): Entity[] {
  const pool = players.filter((p) => p.id !== boss.aggroTargetId);
  const from = pool.length > 0 ? [...pool] : [...players];
  const out: Entity[] = [];
  let k = 0;
  while (out.length < count && from.length > 0) {
    const i = kitHash(boss.id, salt * 7 + k) % from.length;
    out.push(from[i]);
    from.splice(i, 1);
    k++;
  }
  return out;
}

function hookPlayer(
  ctx: SimContext,
  inst: InstanceSlot,
  boss: Entity,
  st: OssickFightState,
  p: Entity,
): void {
  const heavy = inst.difficulty === 'heroic';
  ctx.applyAura(p, {
    id: OSSICK_HOOKED,
    name: 'Gaol Hook',
    kind: 'slow',
    remaining: T.keelhaulAfter,
    duration: T.keelhaulAfter,
    // Heavy Chain (heroic): the chain drags at the runner.
    value: heavy ? T.heavyChainSlow : 1,
    sourceId: boss.id,
    school: 'physical',
    undispellable: true,
  });
  st.hooks.push({ playerId: p.id, remaining: T.keelhaulAfter });
  ctx.emit({
    type: 'spellfx',
    sourceId: boss.id,
    targetId: p.id,
    school: 'physical',
    fx: 'beam',
    ability: OSSICK_GAOL_HOOK,
  });
}

/** The winch hauls one hooked player: freed at a lit post, else keelhauled.
 *  `taken` lists posts already used by this same haul (Double Hook). */
function haul(
  ctx: SimContext,
  inst: InstanceSlot,
  boss: Entity,
  st: OssickFightState,
  p: Entity,
  taken: Set<string>,
): void {
  p.auras = p.auras.filter((a) => a.id !== OSSICK_HOOKED);
  const at = localOf(ctx, inst, p);
  let post: (typeof MOORING_POSTS)[number] | null = null;
  let best: number = T.postReach;
  for (const candidate of MOORING_POSTS) {
    if (taken.has(candidate.id)) continue;
    if ((st.postDarkUntil[candidate.id] ?? 0) > ctx.time) continue;
    const d = Math.hypot(candidate.x - at.x, candidate.z - at.z);
    if (d <= best) {
      best = d;
      post = candidate;
    }
  }
  if (post) {
    taken.add(post.id);
    st.postDarkUntil[post.id] = ctx.time + T.postDarkSeconds;
    const e = claimObjectAt(ctx, inst, post.x, post.z);
    ctx.emit({
      type: 'spellfx',
      sourceId: boss.id,
      targetId: e?.id ?? p.id,
      school: 'physical',
      fx: 'wardBloom',
      ability: OSSICK_GAOL_HOOK,
    });
    return;
  }
  // Keelhauled: dragged across the yard to the cage, stunned, half drowned.
  st.keelhauled = true;
  const o = ctx.instanceOriginOf(inst);
  const wx = o.x + WINCH.x;
  const wz = o.z + WINCH.z;
  const d = Math.hypot(p.pos.x - wx, p.pos.z - wz);
  if (d > WINCH.r + 1) {
    // A pull toward the winch: a shove away from a point mirrored behind them.
    const mirror = { x: p.pos.x + (p.pos.x - wx), y: p.pos.y, z: p.pos.z + (p.pos.z - wz) };
    applyKnockback(ctx, { ...boss, pos: mirror }, p, d - WINCH.r - 0.6);
  }
  ctx.dealDamage(
    boss,
    p,
    mechanicDamage(ctx, boss, T.min, T.max),
    false,
    'frost',
    'Keelhaul',
    'hit',
    true,
  );
  if (!p.dead) {
    ctx.applyAura(p, {
      id: OSSICK_KEELHAULED,
      name: 'Keelhauled',
      kind: 'stun',
      remaining: T.keelhaulStun,
      duration: T.keelhaulStun,
      value: 0,
      sourceId: boss.id,
      school: 'frost',
    });
  }
  ctx.emit({
    type: 'spellfx',
    sourceId: boss.id,
    targetId: p.id,
    school: 'frost',
    fx: 'nova',
    ability: OSSICK_KEELHAULED,
  });
}

function stepHooks(ctx: SimContext, inst: InstanceSlot, boss: Entity, st: OssickFightState): void {
  if (st.hooks.length === 0) return;
  const due: Entity[] = [];
  for (const h of st.hooks) {
    h.remaining -= DT;
    const p = ctx.entities.get(h.playerId);
    if (!p || p.dead) {
      h.remaining = -1;
      continue;
    }
    if (h.remaining <= 0) due.push(p);
  }
  st.hooks = st.hooks.filter((h) => h.remaining > 0);
  if (due.length === 0) return;
  const taken = new Set<string>();
  for (const p of due.sort((a, b) => a.id - b.id)) haul(ctx, inst, boss, st, p, taken);
}

function landCudgel(ctx: SimContext, boss: Entity, targetId: number | null): void {
  const tank = targetId !== null ? ctx.entities.get(targetId) : undefined;
  if (!tank || tank.dead || dist2d(tank.pos, boss.pos) > 9) return;
  const w = boss.weapon;
  const amount = Math.max(1, Math.round(ctx.rng.range(w.min, w.max) * T.cudgelMult));
  ctx.dealDamage(boss, tank, amount, false, 'physical', "Gaoler's Cudgel", 'hit', true);
  if (tank.dead) return;
  ctx.applyAura(tank, {
    id: OSSICK_CUDGEL_SLOW,
    name: "Gaoler's Cudgel",
    kind: 'slow',
    remaining: T.cudgelSlowSeconds,
    duration: T.cudgelSlowSeconds,
    value: T.cudgelSlow,
    sourceId: boss.id,
    school: 'physical',
  });
}

function openCells(ctx: SimContext, inst: InstanceSlot, boss: Entity, st: OssickFightState): void {
  const share = boss.maxHp > 0 ? boss.hp / boss.maxHp : 1;
  while (st.cellsFired < T.cells.length && share <= T.cells[st.cellsFired]) {
    st.cellsFired++;
    const players = claimPlayers(ctx, inst);
    const o = ctx.instanceOriginOf(inst);
    for (let k = 0; k < T.prisonersPerCell; k++) {
      const door = CELL_DOORS[k % CELL_DOORS.length];
      const victim =
        players.length > 0
          ? players[kitHash(boss.id, st.cellsFired * 5 + k) % players.length]
          : null;
      spawnKitAdd(ctx, inst, boss, SHACKLED_PRISONER_ID, o.x + door.x, o.z + door.z, victim);
    }
    ctx.emit({
      type: 'spellfx',
      sourceId: boss.id,
      targetId: boss.id,
      school: 'physical',
      fx: 'shout',
      ability: 'bastion_open_the_cells',
    });
  }
}

/** The fight ended: hooks come off, the posts relight. */
export function resetOssick(ctx: SimContext, inst: InstanceSlot, boss: Entity): void {
  const st = boss.bastionFight?.kind === 'ossick' ? boss.bastionFight : null;
  if (st) {
    for (const h of st.hooks) {
      const p = ctx.entities.get(h.playerId);
      if (p) p.auras = p.auras.filter((a) => a.id !== OSSICK_HOOKED);
    }
  }
  clearOurCast(boss);
  boss.bastionFight = undefined;
  syncPosts(ctx, inst, null);
}

/** Start a Gaol Hook bar now (the dev trigger and the cadence share it). */
export function startGaolHook(
  ctx: SimContext,
  inst: InstanceSlot,
  boss: Entity,
  st: OssickFightState,
): boolean {
  const count = inst.difficulty === 'heroic' ? 2 : 1;
  const targets = pickHookTargets(boss, claimPlayers(ctx, inst), count, st.casts);
  if (targets.length === 0) return false;
  st.casts++;
  st.hookTimer = T.hookEvery;
  boss.castingAbility = OSSICK_GAOL_HOOK;
  boss.castTotal = T.hookCast;
  boss.castRemaining = T.hookCast;
  boss.castTargetId = targets[0].id;
  boss.channeling = false;
  st.pending = targets.map((t) => t.id);
  return true;
}

/** One tick of Ossick's fight. */
export function tickOssick(
  ctx: SimContext,
  inst: InstanceSlot,
  boss: Entity,
  engaged: boolean,
): void {
  let st = boss.bastionFight?.kind === 'ossick' ? boss.bastionFight : null;
  if (boss.dead) {
    if (st) {
      if (!st.keelhauled) grantClaimDeed(ctx, inst, OSSICK_DEED);
      resetOssick(ctx, inst, boss);
    }
    return;
  }
  if (!engaged) {
    if (st) resetOssick(ctx, inst, boss);
    return;
  }
  if (!st) {
    st = freshState();
    boss.bastionFight = st;
  }
  syncPosts(ctx, inst, st);
  stepHooks(ctx, inst, boss, st);
  openCells(ctx, inst, boss, st);
  // The cadences run on through a bar; a ready one starts when he is free.
  st.hookTimer -= DT;
  st.cudgelTimer -= DT;
  // A running bar of ours: count it down, land it at the end.
  if (boss.castingAbility === OSSICK_GAOL_HOOK || boss.castingAbility === OSSICK_CUDGEL) {
    boss.swingTimer = Math.max(boss.swingTimer, 0.6);
    boss.castRemaining = Math.max(0, boss.castRemaining - DT);
    const target = boss.castTargetId !== null ? ctx.entities.get(boss.castTargetId) : undefined;
    if (target && !target.dead)
      boss.facing = Math.atan2(target.pos.x - boss.pos.x, target.pos.z - boss.pos.z);
    if (boss.castRemaining > 0) return;
    const cast = boss.castingAbility;
    const targetId = boss.castTargetId;
    clearOurCast(boss);
    if (cast === OSSICK_CUDGEL) {
      landCudgel(ctx, boss, targetId);
    } else {
      for (const id of st.pending) {
        const p = ctx.entities.get(id);
        if (p && !p.dead) hookPlayer(ctx, inst, boss, st, p);
      }
      st.pending = [];
    }
    return;
  }
  if (ctx.isStunned(boss) || boss.castingAbility !== null) return;
  if (st.hookTimer <= 0 && startGaolHook(ctx, inst, boss, st)) return;
  if (st.cudgelTimer <= 0 && boss.aggroTargetId !== null) {
    st.cudgelTimer = T.cudgelEvery;
    boss.castingAbility = OSSICK_CUDGEL;
    boss.castTotal = T.cudgelCast;
    boss.castRemaining = T.cudgelCast;
    boss.castTargetId = boss.aggroTargetId;
    boss.channeling = false;
  }
}
