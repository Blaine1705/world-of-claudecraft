// Claim plumbing for the Wildheart Basin encounters: the live Basin claims,
// the Basin's own ephemeral encounter objects (Seedpods, sun glyphs, the
// Ambush circle), the players standing in an arena, and the planted hold a
// boss keeps while a bar runs. The claim-generic reads (its players, bosses,
// mechanic damage, the deed grant, "is the boss in its fight", the boss bar,
// the mark picker) are the Sunken Bastion's, written claim-generic and shared
// here rather than copied. Zero rng.

import { createGroundObject } from '../../entity';
import type { InstanceSlot } from '../../sim';
import type { SimContext } from '../../sim_context';
import { dist2d, type Entity } from '../../types';
import { WILDHEART_DUNGEON } from './ids';

export { bossTarget, heavySwing } from '../stormbrass_foundry/claim';
export {
  bossEngaged,
  claimBoss,
  claimPlayers,
  clearCastIf,
  dropAuraById,
  dropEncounterBody,
  dropEncounterObject,
  grantClaimDeed,
  localOf,
  mechanicDamage,
  pickMarkTargets,
  startBar,
} from '../sunken_bastion/claim';

/** Every live Wildheart Basin claim. */
export function wildheartClaims(ctx: SimContext): InstanceSlot[] {
  return ctx.instances.filter((i) => i.partyKey !== null && i.dungeonId === WILDHEART_DUNGEON);
}

/** An ephemeral Basin encounter object (a Seedpod, a sun glyph, the Ambush
 *  circle): added to the claim's object roster so a freed claim drops it with
 *  everything else. Its template id carries its look, `scale` its radius.
 *  Instance-local coordinates. */
export function spawnBasinObject(
  ctx: SimContext,
  inst: InstanceSlot,
  templateId: string,
  name: string,
  lx: number,
  lz: number,
  scale: number,
): Entity {
  const o = ctx.instanceOriginOf(inst);
  const obj = createGroundObject(ctx.nextId++, '', name, ctx.groundPos(o.x + lx, o.z + lz));
  obj.templateId = templateId;
  obj.dungeonId = WILDHEART_DUNGEON;
  obj.objectItemId = null;
  obj.lootable = false;
  obj.facing = 0;
  obj.prevFacing = 0;
  obj.scale = scale;
  ctx.addEntity(obj);
  inst.objectIds.push(obj.id);
  return obj;
}

/** Players of `players` standing within `r` yards of an instance-local spot
 *  (an arena), in their given (entity-id) order. */
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

/** Hold a boss where it braced for its bar (the mob AI may walk it). */
export function holdPlanted(
  ctx: SimContext,
  mob: Entity,
  at: { x: number; y: number; z: number },
): void {
  if (mob.pos.x === at.x && mob.pos.z === at.z) return;
  mob.pos.x = at.x;
  mob.pos.y = at.y;
  mob.pos.z = at.z;
  ctx.rebucket(mob);
}

/** Move a body to a world spot at once (a leap, an ambush), on the floor. */
export function placeAt(ctx: SimContext, mob: Entity, x: number, z: number): void {
  const at = ctx.groundPos(x, z);
  mob.pos.x = at.x;
  mob.pos.y = at.y;
  mob.pos.z = at.z;
  mob.prevPos = { ...mob.pos };
  ctx.rebucket(mob);
}

/** The living player standing farthest from `from` (ties to the lower id). */
export function farthestPlayer(players: readonly Entity[], from: Entity): Entity | null {
  let best: Entity | null = null;
  let bestD = -1;
  for (const p of players) {
    if (p.dead) continue;
    const d = dist2d(p.pos, from.pos);
    if (d > bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

/** The living player standing nearest to world (x, z) (ties to the lower id). */
export function nearestPlayerTo(players: readonly Entity[], x: number, z: number): Entity | null {
  let best: Entity | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const p of players) {
    if (p.dead) continue;
    const d = Math.hypot(p.pos.x - x, p.pos.z - z);
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}
