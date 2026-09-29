// Shared claim helpers for the Sunken Bastion encounters: the claim's origin,
// its players, its bosses by template, its encounter objects by template and
// spot, ephemeral encounter objects, mechanic damage and the deed grant.
// Every read walks the claim's own rosters in their stored order, so the
// encounters stay deterministic (zero rng here).

import { grantDeed } from '../../deeds';
import { createGroundObject } from '../../entity';
import type { InstanceSlot } from '../../sim';
import type { SimContext } from '../../sim_context';
import type { Entity } from '../../types';

export const BASTION_DUNGEON = 'sunken_bastion';

/** Every live Sunken Bastion claim. */
export function bastionClaims(ctx: SimContext): InstanceSlot[] {
  return ctx.instances.filter((i) => i.partyKey !== null && i.dungeonId === BASTION_DUNGEON);
}

/** Living, present players of a claim, in entity-id order. */
export function claimPlayers(ctx: SimContext, inst: InstanceSlot): Entity[] {
  const o = ctx.instanceOriginOf(inst);
  const out: Entity[] = [];
  for (const meta of ctx.players.values()) {
    const e = ctx.entities.get(meta.entityId);
    if (!e || e.dead || e.ghost) continue;
    if (Math.abs(e.pos.x - o.x) < 120 && Math.abs(e.pos.z - o.z) < 250) out.push(e);
  }
  return out.sort((a, b) => a.id - b.id);
}

/** The first roster mob of a template (a boss), dead or alive. */
export function claimBoss(ctx: SimContext, inst: InstanceSlot, templateId: string): Entity | null {
  for (const id of inst.mobIds) {
    const e = ctx.entities.get(id);
    if (e && e.kind === 'mob' && e.templateId === templateId) return e;
  }
  return null;
}

/** The claim's encounter object standing at an instance-local spot, or null. */
export function claimObjectAt(
  ctx: SimContext,
  inst: InstanceSlot,
  lx: number,
  lz: number,
): Entity | null {
  const o = ctx.instanceOriginOf(inst);
  for (const id of inst.objectIds) {
    const e = ctx.entities.get(id);
    if (!e) continue;
    if (Math.abs(e.pos.x - o.x - lx) < 0.75 && Math.abs(e.pos.z - o.z - lz) < 0.75) return e;
  }
  return null;
}

/** An ephemeral encounter object (a flooded lane): added to the claim's object
 *  roster so a freed claim drops it with everything else. */
export function spawnEncounterObject(
  ctx: SimContext,
  inst: InstanceSlot,
  templateId: string,
  name: string,
  lx: number,
  lz: number,
  facing: number,
  scale: number,
): Entity {
  const o = ctx.instanceOriginOf(inst);
  const obj = createGroundObject(ctx.nextId++, '', name, ctx.groundPos(o.x + lx, o.z + lz));
  obj.templateId = templateId;
  obj.dungeonId = BASTION_DUNGEON;
  obj.objectItemId = null;
  obj.lootable = false;
  obj.facing = facing;
  obj.prevFacing = facing;
  obj.scale = scale;
  ctx.addEntity(obj);
  inst.objectIds.push(obj.id);
  return obj;
}

/** Remove an ephemeral encounter object from the world and the claim. */
export function dropEncounterObject(ctx: SimContext, inst: InstanceSlot, id: number): void {
  const at = inst.objectIds.indexOf(id);
  if (at >= 0) inst.objectIds.splice(at, 1);
  if (ctx.entities.has(id)) ctx.dropEntity(id);
}

/** A mechanic's damage roll, scaled by the claim's difficulty transform. */
export function mechanicDamage(ctx: SimContext, mob: Entity, min: number, max: number): number {
  return Math.max(1, Math.round(ctx.rng.range(min, max) * (mob.mechanicDamageMult ?? 1)));
}

/** Grant a deed to every player present in the claim. */
export function grantClaimDeed(ctx: SimContext, inst: InstanceSlot, deedId: string): void {
  const o = ctx.instanceOriginOf(inst);
  for (const meta of ctx.players.values()) {
    const e = ctx.entities.get(meta.entityId);
    if (!e) continue;
    if (Math.abs(e.pos.x - o.x) >= 120 || Math.abs(e.pos.z - o.z) >= 250) continue;
    grantDeed(ctx, meta, deedId);
  }
}

/** Is a boss in its fight (pulled and not walking home)? */
export function bossEngaged(boss: Entity): boolean {
  return (
    !boss.dead &&
    boss.hp > 0 &&
    boss.inCombat &&
    boss.aggroTargetId !== null &&
    (boss.aiState === 'chase' || boss.aiState === 'attack')
  );
}

/** Instance-local (x, z) of an entity. */
export function localOf(ctx: SimContext, inst: InstanceSlot, e: Entity): { x: number; z: number } {
  const o = ctx.instanceOriginOf(inst);
  return { x: e.pos.x - o.x, z: e.pos.z - o.z };
}
