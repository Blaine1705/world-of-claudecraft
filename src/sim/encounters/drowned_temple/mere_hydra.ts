// The Mere Hydra in the Hydra Pool (docs/design/dungeon-rework/drowned_temple.md
// 4.3): three stationary heads rising from one moon pool, one pull (G17 linked
// parts: the heads share one fight state, referenced from each head).
//
//   Snap           each head bites whoever stands in its long reach (its own
//                  swing: the tank).
//   Tide Breath    the left and right heads take turns every 10 s: a 2 s bar,
//                  then a 60 degree cone of frost 18 yd long (110 to 130). The
//                  cone locks on its victim's spot when the bar starts.
//   Brine Spit     the centre head, every 8 s: three 4 yd pools under three
//                  players, bursting 1.5 s later (70 to 90).
//   Enraged Hydra  each fallen head drives the others 15 percent harder, so the
//                  group picks the order.
//
// Zero rng in every pick (the breath's and the spit's victims are hashed); the
// only draws are the damage rolls.

import { inCone, kitHash } from '../../mob/trash_kit/targets';
import type { InstanceSlot } from '../../sim';
import type { SimContext } from '../../sim_context';
import { angleTo, DT, dist2d, type Entity, type HydraFightState } from '../../types';
import {
  bossEngaged,
  claimBoss,
  claimPlayers,
  clearCastOf,
  dropEncounterObject,
  grantClaimDeed,
  mechanicDamage,
  spawnTempleObject,
  startCast,
} from './claim';
import {
  BRINE_SPIT_TEMPLATE,
  HYDRA_BRINE_SPIT,
  HYDRA_ENRAGED,
  HYDRA_HEAD_TEMPLATES,
  HYDRA_TIDE_BREATH,
  HYDRA_TUNING,
  POOL,
} from './ids';

const T = HYDRA_TUNING;
export const HYDRA_DEED = 'dgn_mere_hydra';

function freshState(): HydraFightState {
  return {
    kind: 'hydra',
    breathTimer: T.breathFirst,
    breathSide: 0,
    spitTimer: T.spitFirst,
    spits: [],
    casts: 0,
    deaths: [],
  };
}

/** The claim's three heads, left to right (dead or alive), or null when a
 *  claim has none (another dungeon). */
export function hydraHeads(ctx: SimContext, inst: InstanceSlot): (Entity | null)[] | null {
  const heads = HYDRA_HEAD_TEMPLATES.map((id) => claimBoss(ctx, inst, id));
  return heads.some((h) => h !== null) ? heads : null;
}

/** Players round the pool (its rim and a margin). */
function poolPlayers(ctx: SimContext, inst: InstanceSlot): Entity[] {
  const o = ctx.instanceOriginOf(inst);
  return claimPlayers(ctx, inst).filter(
    (p) => !p.dead && Math.hypot(p.pos.x - o.x - POOL.x, p.pos.z - o.z - POOL.z) <= POOL.r + 14,
  );
}

function hashedPick(players: readonly Entity[], seed: number, salt: number): Entity | null {
  if (players.length === 0) return null;
  return players[kitHash(seed, salt) % players.length];
}

/** Start a Tide Breath on one side head, aimed at a hashed victim. */
export function startTideBreath(
  ctx: SimContext,
  inst: InstanceSlot,
  head: Entity,
  st: HydraFightState,
): boolean {
  const players = poolPlayers(ctx, inst).filter(
    (p) => dist2d(p.pos, head.pos) <= T.breathRange + 4,
  );
  st.casts++;
  // Breathe on someone who is not the tank when anyone else is in reach.
  const others = players.filter((p) => p.id !== head.aggroTargetId);
  const victim = hashedPick(others.length > 0 ? others : players, head.id, st.casts);
  if (!victim) return false;
  head.facing = angleTo(head.pos, victim.pos);
  head.prevFacing = head.facing;
  startCast(head, HYDRA_TIDE_BREATH, T.breathCast, victim.id);
  return true;
}

/** Spit three brine pools under three players (fewer when fewer stand there). */
export function startBrineSpit(
  ctx: SimContext,
  inst: InstanceSlot,
  head: Entity,
  st: HydraFightState,
): number {
  const players = poolPlayers(ctx, inst);
  const o = ctx.instanceOriginOf(inst);
  const picked: Entity[] = [];
  for (let k = 0; k < T.spitCount && picked.length < players.length; k++) {
    st.casts++;
    const pool = players.filter((p) => !picked.includes(p));
    const p = hashedPick(pool, head.id, st.casts * 5 + k);
    if (p) picked.push(p);
  }
  for (const p of picked) {
    const x = p.pos.x - o.x;
    const z = p.pos.z - o.z;
    const obj = spawnTempleObject(ctx, inst, BRINE_SPIT_TEMPLATE, 'Brine Spit', x, z, T.spitRadius);
    st.spits.push({ x, z, remaining: T.spitWarn, objectId: obj.id });
  }
  if (picked.length > 0) {
    ctx.emit({
      type: 'spellfx',
      sourceId: head.id,
      targetId: picked[0].id,
      school: 'frost',
      fx: 'windup',
      ability: HYDRA_BRINE_SPIT,
    });
  }
  return picked.length;
}

function landBreath(ctx: SimContext, inst: InstanceSlot, head: Entity): void {
  ctx.emit({
    type: 'spellfx',
    sourceId: head.id,
    targetId: head.id,
    school: 'frost',
    fx: 'frostCone',
    ability: HYDRA_TIDE_BREATH,
    range: T.breathRange,
    angle: T.breathArcDeg,
  });
  for (const p of claimPlayers(ctx, inst)) {
    if (p.dead || !inCone(head.pos, head.facing, p.pos, T.breathRange, T.breathArcDeg)) continue;
    ctx.dealDamage(
      head,
      p,
      mechanicDamage(ctx, head, T.breathMin, T.breathMax),
      false,
      'frost',
      'Tide Breath',
      'hit',
      true,
    );
  }
}

function stepBreath(ctx: SimContext, inst: InstanceSlot, head: Entity): void {
  if (head.castingAbility !== HYDRA_TIDE_BREATH) return;
  head.swingTimer = Math.max(head.swingTimer, 0.6);
  // The cone holds the aim it took when the bar started.
  head.facing = head.prevFacing;
  head.castRemaining = Math.max(0, head.castRemaining - DT);
  if (head.castRemaining > 0) return;
  clearCastOf(head, HYDRA_TIDE_BREATH);
  landBreath(ctx, inst, head);
}

function stepSpits(ctx: SimContext, inst: InstanceSlot, st: HydraFightState, source: Entity): void {
  const o = ctx.instanceOriginOf(inst);
  for (let i = st.spits.length - 1; i >= 0; i--) {
    const s = st.spits[i];
    s.remaining -= DT;
    if (s.remaining > 0) continue;
    st.spits.splice(i, 1);
    ctx.emit({
      type: 'spellfx',
      sourceId: source.id,
      targetId: s.objectId,
      school: 'frost',
      fx: 'nova',
      ability: HYDRA_BRINE_SPIT,
    });
    for (const p of claimPlayers(ctx, inst)) {
      if (p.dead || Math.hypot(p.pos.x - o.x - s.x, p.pos.z - o.z - s.z) > T.spitRadius) continue;
      ctx.dealDamage(
        source,
        p,
        mechanicDamage(ctx, source, T.spitMin, T.spitMax),
        false,
        'frost',
        'Brine Spit',
        'hit',
        true,
      );
    }
    dropEncounterObject(ctx, inst, s.objectId);
  }
}

/** Enraged Hydra: every living head wears one stack per fallen head. */
function applyEnrage(ctx: SimContext, heads: readonly (Entity | null)[], fallen: number): void {
  for (const h of heads) {
    if (!h || h.dead) continue;
    const have = h.auras.find((a) => a.id === HYDRA_ENRAGED);
    if (fallen <= 0) {
      if (have) h.auras = h.auras.filter((a) => a.id !== HYDRA_ENRAGED);
      continue;
    }
    const value = T.enragePerHead * fallen;
    if (have && Math.abs(have.value - value) < 1e-9) continue;
    ctx.applyAura(h, {
      id: HYDRA_ENRAGED,
      name: 'Enraged Hydra',
      kind: 'buff_dmg_done',
      remaining: 9999,
      duration: 9999,
      value,
      stacks: fallen,
      sourceId: h.id,
      school: 'physical',
    });
  }
}

/** The fight ended without a kill: the pools drain and the heads settle. */
function resetHydra(ctx: SimContext, inst: InstanceSlot, heads: readonly (Entity | null)[]): void {
  for (const h of heads) {
    if (!h) continue;
    const st = h.templeFight?.kind === 'hydra' ? h.templeFight : null;
    if (st) for (const s of st.spits) dropEncounterObject(ctx, inst, s.objectId);
    if (st) st.spits = [];
    clearCastOf(h, HYDRA_TIDE_BREATH);
    h.auras = h.auras.filter((a) => a.id !== HYDRA_ENRAGED);
    h.templeFight = undefined;
  }
}

/** One tick of the Mere Hydra's fight (all three heads). */
export function tickMereHydra(ctx: SimContext, inst: InstanceSlot): void {
  const heads = hydraHeads(ctx, inst);
  if (!heads) return;
  const living = heads.filter((h): h is Entity => h !== null && !h.dead);
  const anyState = heads.find((h) => h?.templeFight?.kind === 'hydra')?.templeFight;
  let st = anyState?.kind === 'hydra' ? anyState : null;
  if (living.length === 0) {
    if (st) {
      const d = st.deaths;
      while (d.length < 3) d.push(ctx.time);
      if (d.length === 3 && d[2] - d[0] <= T.deedWindow) grantClaimDeed(ctx, inst, HYDRA_DEED);
      resetHydra(ctx, inst, heads);
    }
    return;
  }
  const engaged = living.some((h) => bossEngaged(h));
  if (!engaged) {
    if (st) resetHydra(ctx, inst, heads);
    return;
  }
  if (!st) {
    st = freshState();
    for (const h of heads) if (h) h.templeFight = st;
  }
  // Heads that fell since the last tick.
  const fallen = heads.filter((h) => h !== null && h.dead).length;
  while (st.deaths.length < fallen) st.deaths.push(ctx.time);
  applyEnrage(ctx, heads, fallen);
  for (const h of living) stepBreath(ctx, inst, h);
  const center = heads[1];
  stepSpits(ctx, inst, st, center && !center.dead ? center : living[0]);
  // The side heads take turns breathing; a fallen side leaves it to the other.
  st.breathTimer -= DT;
  if (st.breathTimer <= 0) {
    const first = heads[st.breathSide];
    const second = heads[st.breathSide === 0 ? 2 : 0];
    const breather =
      first && !first.dead && first.castingAbility === null && !ctx.isStunned(first)
        ? first
        : second && !second.dead && second.castingAbility === null && !ctx.isStunned(second)
          ? second
          : null;
    if (breather && startTideBreath(ctx, inst, breather, st)) {
      st.breathTimer = T.breathEvery;
      st.breathSide = breather === heads[0] ? 2 : 0;
    } else {
      st.breathTimer = 1;
    }
  }
  st.spitTimer -= DT;
  if (st.spitTimer <= 0) {
    st.spitTimer = T.spitEvery;
    if (center && !center.dead) startBrineSpit(ctx, inst, center, st);
  }
}
