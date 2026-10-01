// Claim plumbing for the Stormbrass Foundry encounters: the live Foundry claims
// and the Foundry's own ephemeral encounter objects. The claim-generic reads
// (its players, bosses, mechanic damage, the deed grant, "is the boss in its
// fight") are the Sunken Bastion's, written claim-generic and shared here
// rather than copied. Zero rng.

import { createGroundObject } from '../../entity';
import type { InstanceSlot } from '../../sim';
import type { SimContext } from '../../sim_context';
import type { Entity } from '../../types';
import { FOUNDRY_DUNGEON } from './ids';

export {
  bossEngaged,
  claimBoss,
  claimPlayers,
  clearCastIf,
  dropEncounterObject,
  grantClaimDeed,
  localOf,
  mechanicDamage,
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
