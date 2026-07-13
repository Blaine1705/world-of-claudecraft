// Rideable ground mounts: selection + mount/dismount rules, a sibling sim
// system behind the SimContext seam (module-first; sim.ts keeps thin delegates).
//
// State model: PlayerMeta.selectedMount is the persisted stable pick; the live
// "riding X right now" state is Entity.mountKey ('' dismounted), which the wire
// mirrors like `skin` so every host (renderer, other clients, the online self
// extrapolator) reads the same field the speed/crit/block hooks use.
//
// Rules: selecting and riding are level-gated by the MountDef; mounting is
// blocked while in combat, dead, or a released spirit; dismounting is always
// allowed; death force-dismounts (combat/damage.ts handleDeath). Every mount
// is a ground mount, no flying: nothing here touches the vertical axis.
//
// `src/sim`-pure and rng-free.

import { mountDef } from './content/mounts';
import { recalcPlayerStats } from './entity';
import type { PlayerMeta } from './sim';
import type { SimContext } from './sim_context';
import type { Entity } from './types';

// The mount crit bonus rides Entity.critChance (recalcPlayerStats), so every
// mount/dismount recomputes stats the same way an equip does.
function recalcFor(ctx: SimContext, e: Entity, meta: PlayerMeta): void {
  recalcPlayerStats(e, meta.cls, meta.equipment, ctx.playerMods(meta), meta.equipmentInstance);
}

/** Pick the player's stable mount (persisted). Level-gated; swaps the live
 *  mount in place when already riding. Returns false on an unknown key or a
 *  failed gate (an error event carries the reason). */
export function selectMount(ctx: SimContext, pid: number, key: string): boolean {
  const meta = ctx.players.get(pid);
  const e = ctx.entities.get(pid);
  if (!meta || !e) return false;
  const def = mountDef(key);
  if (!def) return false;
  if (e.level < def.level) {
    ctx.error(pid, `You must be level ${def.level} to ride that mount.`);
    return false;
  }
  meta.selectedMount = def.key;
  // Swap the ridden mount in place only OUT of combat: a mid-fight swap would
  // bypass toggleMount's combat gate and grant a stronger mount's crit/block
  // reactively. In combat the pick still updates and applies on the next mount.
  if (e.mountKey && e.mountKey !== def.key && !e.inCombat && !e.dead && !e.ghost) {
    e.mountKey = def.key;
    recalcFor(ctx, e, meta);
  }
  return true;
}

/** Mount the selected mount, or dismount when riding. Returns true when the
 *  mounted state changed. No selection is a silent no-op: the client opens the
 *  Mounts window for that case instead of round-tripping an error. */
export function toggleMount(ctx: SimContext, pid: number): boolean {
  const meta = ctx.players.get(pid);
  const e = ctx.entities.get(pid);
  if (!meta || !e) return false;
  if (e.mountKey) {
    e.mountKey = '';
    recalcFor(ctx, e, meta);
    return true;
  }
  const def = mountDef(meta.selectedMount);
  if (!def) return false;
  if (e.dead || e.ghost) return false;
  if (e.level < def.level) {
    ctx.error(pid, `You must be level ${def.level} to ride that mount.`);
    return false;
  }
  if (e.inCombat) {
    ctx.error(pid, "You can't do that while in combat.");
    return false;
  }
  e.mountKey = def.key;
  recalcFor(ctx, e, meta);
  return true;
}
