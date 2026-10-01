// Claim plumbing for the Stormbrass Foundry encounters: the live Foundry claims
// and the Foundry's own ephemeral encounter objects. The claim-generic reads
// (its players, bosses, mechanic damage, the deed grant, "is the boss in its
// fight") are the Sunken Bastion's, written claim-generic and shared here
// rather than copied. Zero rng.

import { effectiveArmorOf } from '../../effective_stats';
import { createGroundObject } from '../../entity';
import type { InstanceSlot } from '../../sim';
import type { SimContext } from '../../sim_context';
import { type Entity, mobArmorReduction } from '../../types';
import { FOUNDRY_DUNGEON } from './ids';

export {
  bossEngaged,
  claimBoss,
  claimObjectAt,
  claimPlayers,
  clearCastIf,
  dropAuraById,
  dropEncounterObject,
  grantClaimDeed,
  localOf,
  mechanicDamage,
  pickMarkTargets,
  startBar,
} from '../sunken_bastion/claim';

/** Every live Stormbrass Foundry claim. */
export function foundryClaims(ctx: SimContext): InstanceSlot[] {
  return ctx.instances.filter((i) => i.partyKey !== null && i.dungeonId === FOUNDRY_DUNGEON);
}

/** An ephemeral Foundry encounter object (a Scrap Toss mark): added to the
 *  claim's object roster so a freed claim drops it with everything else. Its
 *  template id carries its look; `scale` its radius. World coordinates. */
export function spawnFoundryObject(
  ctx: SimContext,
  inst: InstanceSlot,
  templateId: string,
  name: string,
  x: number,
  z: number,
  scale: number,
): Entity {
  const obj = createGroundObject(ctx.nextId++, '', name, ctx.groundPos(x, z));
  obj.templateId = templateId;
  obj.dungeonId = FOUNDRY_DUNGEON;
  obj.objectItemId = null;
  obj.lootable = false;
  obj.facing = 0;
  obj.prevFacing = 0;
  obj.scale = scale;
  ctx.addEntity(obj);
  inst.objectIds.push(obj.id);
  return obj;
}

/** Living, present players of a claim standing within `r` yards of an
 *  instance-local spot (an arena), in entity-id order. */
export function arenaPlayers(
  ctx: SimContext,
  inst: InstanceSlot,
  players: readonly Entity[],
  lx: number,
  lz: number,
  r: number,
): Entity[] {
  const o = ctx.instanceOriginOf(inst);
  return players.filter((p) => !p.dead && Math.hypot(p.pos.x - o.x - lx, p.pos.z - o.z - lz) <= r);
}

/** A heavy swing at the one a boss is fighting: `mult` of its own melee roll,
 *  through the target's armor like any swing (the Rivet Gun, the Proof Shot). */
export function heavySwing(
  ctx: SimContext,
  boss: Entity,
  target: Entity,
  mult: number,
  ability: string,
): number {
  const roll = ctx.rng.range(boss.weapon.min, boss.weapon.max) * mult;
  const dr = mobArmorReduction(boss, target, effectiveArmorOf(target));
  const amount = Math.max(1, Math.round(roll * (1 - dr)));
  return ctx.dealDamage(boss, target, amount, false, 'physical', ability, 'hit', true);
}

/** The boss's own living current target, or null. */
export function bossTarget(ctx: SimContext, boss: Entity): Entity | null {
  if (boss.aggroTargetId === null) return null;
  const t = ctx.entities.get(boss.aggroTargetId);
  return t && !t.dead ? t : null;
}
