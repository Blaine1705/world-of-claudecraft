// The trash kit's Stormbrass Foundry mechanics (MobTemplate.trashKit screen,
// deathBurst): the Shieldbearer Frame's Steam Screen and the on-death bursts of
// the Steam Bruiser (Boiler Burst), the Arc Drone (Arc Pop) and the Gantry
// Hauler (Boiler Rupture). A sibling of driver.ts, which routes these keys here.
//
//   screen      an interruptible screen of steam: an absorb shield on every ally
//               in the fight near the caster, each worth a share of that ally's
//               own maximum health. Kick it, or burn through it.
//   deathBurst  the mob bursts where it fell, `delay` seconds after it dies: a
//               splash round the corpse. A delayed burst paints its ring on the
//               floor while it builds (an encounter object the client mirrors),
//               so the melee has time to step out.
//
// Zero rng in every pick (allies in roster order, players in entity-id order);
// the only draws are the burst's damage rolls, in roster order.

import { FOUNDRY_BURST_RING } from '../../encounters/stormbrass_foundry/ids';
import { createGroundObject } from '../../entity';
import type { InstanceSlot } from '../../sim';
import type { SimContext } from '../../sim_context';
import { DT, dist2d, type Entity, type TrashKitDef } from '../../types';
import { FOUNDRY_STEAM_SCREEN_AURA } from './foundry_cast_ids';
import { livingInReach } from './targets';

/** Living mobs of the claim in the fight within `radius` of `from` (the caster
 *  counts), in roster order. */
function screenAllies(ctx: SimContext, inst: InstanceSlot, from: Entity, radius: number): Entity[] {
  const out: Entity[] = [];
  for (const id of inst.mobIds) {
    const e = ctx.entities.get(id);
    if (!e || e.dead || e.hp <= 0 || e.kind !== 'mob') continue;
    if (e.id !== from.id && !e.inCombat) continue;
    if (dist2d(e.pos, from.pos) > radius) continue;
    out.push(e);
  }
  return out;
}

/** Can the Steam Screen start? Only while an ally near the caster is bare. */
export function screenReady(
  ctx: SimContext,
  inst: InstanceSlot,
  mob: Entity,
  kit: TrashKitDef,
): boolean {
  const def = kit.screen;
  if (!def) return false;
  return screenAllies(ctx, inst, mob, def.radius).some(
    (e) => !e.auras.some((a) => a.id === FOUNDRY_STEAM_SCREEN_AURA),
  );
}

/** The screen's bar ran out: every ally in the fight near it takes the shield. */
export function landScreen(
  ctx: SimContext,
  inst: InstanceSlot,
  mob: Entity,
  kit: TrashKitDef,
): number {
  const def = kit.screen;
  if (!def) return 0;
  ctx.emit({
    type: 'spellfx',
    sourceId: mob.id,
    targetId: mob.id,
    school: def.school,
    fx: 'wardBloom',
    ability: def.castId,
  });
  let n = 0;
  for (const ally of screenAllies(ctx, inst, mob, def.radius)) {
    ctx.applyAura(ally, {
      id: FOUNDRY_STEAM_SCREEN_AURA,
      name: def.name,
      kind: 'absorb',
      remaining: def.duration,
      duration: def.duration,
      value: Math.max(1, Math.round(ally.maxHp * def.shieldPct)),
      sourceId: mob.id,
      school: def.school,
    });
    n++;
  }
  return n;
}

function dropObject(ctx: SimContext, inst: InstanceSlot, id: number | null): void {
  if (id === null) return;
  const at = inst.objectIds.indexOf(id);
  if (at >= 0) inst.objectIds.splice(at, 1);
  if (ctx.entities.has(id)) ctx.dropEntity(id);
}

/** A delayed burst's ring on the floor where the mob fell. */
function spawnBurstRing(ctx: SimContext, inst: InstanceSlot, mob: Entity, radius: number): number {
  const obj = createGroundObject(ctx.nextId++, '', mob.name, ctx.groundPos(mob.pos.x, mob.pos.z));
  obj.templateId = FOUNDRY_BURST_RING;
  obj.dungeonId = inst.dungeonId;
  obj.objectItemId = null;
  obj.lootable = false;
  obj.facing = 0;
  obj.prevFacing = 0;
  obj.scale = radius;
  ctx.addEntity(obj);
  inst.objectIds.push(obj.id);
  return obj.id;
}

/**
 * Drop any burst ring whose mob left the world before it went off (a summoned
 * add despawned with its owner): its burst can no longer fire, so its warning
 * must not linger on the floor. Zero rng; only walks the claim's own rosters.
 */
export function sweepOrphanBurstRings(ctx: SimContext, inst: InstanceSlot): number {
  let rings: number[] | null = null;
  for (const id of inst.objectIds) {
    if (ctx.entities.get(id)?.templateId !== FOUNDRY_BURST_RING) continue;
    rings ??= [];
    rings.push(id);
  }
  if (!rings) return 0;
  const owned = new Set<number>();
  for (const id of inst.mobIds) {
    const ring = ctx.entities.get(id)?.deathBurst?.objectId;
    if (ring !== null && ring !== undefined) owned.add(ring);
  }
  let dropped = 0;
  for (const id of rings) {
    if (owned.has(id)) continue;
    dropObject(ctx, inst, id);
    dropped++;
  }
  return dropped;
}

/**
 * A dead kit mob with a death burst: arm it on the tick it is first seen dead,
 * count it down, and go off once. Returns true on the tick it bursts.
 */
export function stepDeathBurst(
  ctx: SimContext,
  inst: InstanceSlot,
  mob: Entity,
  kit: TrashKitDef,
  players: readonly Entity[],
): boolean {
  const def = kit.deathBurst;
  if (!def) return false;
  let st = mob.deathBurst;
  if (!st) {
    st = { remaining: def.delay, objectId: null, done: false };
    mob.deathBurst = st;
    if (def.delay > 0) {
      st.objectId = spawnBurstRing(ctx, inst, mob, def.radius);
      ctx.emit({
        type: 'spellfx',
        sourceId: mob.id,
        targetId: mob.id,
        school: def.school,
        fx: 'windup',
        ability: def.castId,
      });
    }
  }
  if (st.done) return false;
  st.remaining -= DT;
  if (st.remaining > 1e-9) return false;
  st.done = true;
  dropObject(ctx, inst, st.objectId);
  st.objectId = null;
  ctx.emit({
    type: 'spellfx',
    sourceId: mob.id,
    targetId: mob.id,
    school: def.school,
    fx: 'nova',
    ability: def.castId,
  });
  for (const p of livingInReach(players, mob.pos, def.radius)) {
    const amount = Math.max(
      1,
      Math.round(ctx.rng.range(def.min, def.max) * (mob.mechanicDamageMult ?? 1)),
    );
    ctx.dealDamage(mob, p, amount, false, def.school, def.name, 'hit', true);
    // A slowing burst (the Rime Whelp's Hoarfrost Pop) chills whoever it caught.
    if (def.slow && !p.dead) {
      ctx.applyAura(p, {
        id: `${def.castId}_slow`,
        name: def.name,
        kind: 'slow',
        remaining: def.slow.seconds,
        duration: def.slow.seconds,
        value: def.slow.mult,
        sourceId: mob.id,
        school: def.school,
      });
    }
  }
  return true;
}
