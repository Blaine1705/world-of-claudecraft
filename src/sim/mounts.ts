// Rideable ground mounts: collection + selection + mount/dismount rules, a
// sibling sim system behind the SimContext seam (module-first; sim.ts keeps
// thin delegates).
//
// Collection model: every player always owns the horse (DEFAULT_MOUNT, never
// an item); every other catalog mount is owned while its soulbound reins item
// (ItemDef kind 'mount', boss drops) sits in the player's bags or bank.
// PlayerMeta.selectedMount is the persisted stable pick (always a valid key,
// horse by default); the live "riding X right now" state is Entity.mountKey
// ('' dismounted), which the wire mirrors like `skin` so every host (renderer,
// other clients, the online self extrapolator) reads the same field the
// speed/crit/block hooks use.
//
// Rules: selecting requires owning the mount and meeting its level gate;
// mounting re-validates ownership (falling back to the horse when the pick's
// item is gone) and is blocked while in combat, dead, or a released spirit;
// dismounting is always allowed; death force-dismounts (combat/damage.ts
// handleDeath). Every mount is a ground mount, no flying: nothing here touches
// the vertical axis.
//
// `src/sim`-pure and rng-free.

import { DEFAULT_MOUNT, MOUNT_KEYS, type MountKey, mountDef } from './content/mounts';
import { ITEMS } from './data';
import { recalcPlayerStats } from './entity';
import type { PlayerMeta } from './sim';
import type { SimContext } from './sim_context';
import type { Entity } from './types';

// The reins itemId per catalog mount, derived once from the merged ITEMS table
// (single source: the item record declares `mount`, nothing re-lists the map).
// Static content, so the lazy module-level cache is multi-Sim safe.
let mountItemIds: Map<string, string> | null = null;

/** The collectible item that owns `key` (null for the horse, which has none). */
export function mountItemId(key: string): string | null {
  if (!mountItemIds) {
    mountItemIds = new Map();
    for (const def of Object.values(ITEMS)) {
      if (def.kind === 'mount') mountItemIds.set(def.mount, def.id);
    }
  }
  return mountItemIds.get(key) ?? null;
}

/** Whether the player owns the mount: the horse always; any other catalog
 *  mount while its reins item sits in bags or bank (soulbound, so ownership
 *  never transfers). Unknown keys are never owned. */
export function mountOwned(meta: PlayerMeta, key: string): boolean {
  if (key === DEFAULT_MOUNT) return true;
  if (!mountDef(key)) return false;
  const itemId = mountItemId(key);
  if (!itemId) return false;
  return (
    meta.inventory.some((s) => s.itemId === itemId) ||
    meta.bank.inventory.some((s) => s.itemId === itemId)
  );
}

/** The owned subset of the catalog, in catalog order (the horse always).
 *  Single pass over bags + bank: the server rebuilds this per snapshot, so it
 *  never scans the containers once per catalog mount. */
export function ownedMounts(meta: PlayerMeta): MountKey[] {
  const owned = new Set<string>([DEFAULT_MOUNT]);
  const collect = (slots: readonly { itemId: string }[]): void => {
    for (const s of slots) {
      const def = ITEMS[s.itemId];
      if (def?.kind === 'mount') owned.add(def.mount);
    }
  };
  collect(meta.inventory);
  collect(meta.bank.inventory);
  return MOUNT_KEYS.filter((key) => owned.has(key));
}

// The mount crit bonus rides Entity.critChance (recalcPlayerStats), so every
// mount/dismount recomputes stats the same way an equip does.
function recalcFor(ctx: SimContext, e: Entity, meta: PlayerMeta): void {
  recalcPlayerStats(e, meta.cls, meta.equipment, ctx.playerMods(meta), meta.equipmentInstance);
}

/** Pick the player's stable mount (persisted). Ownership- and level-gated;
 *  swaps the live mount in place when already riding. Returns false on an
 *  unknown key or a failed gate (an error event carries the reason). */
export function selectMount(ctx: SimContext, pid: number, key: string): boolean {
  const meta = ctx.players.get(pid);
  const e = ctx.entities.get(pid);
  if (!meta || !e) return false;
  const def = mountDef(key);
  if (!def) return false;
  if (!mountOwned(meta, def.key)) {
    // The reins item is not in bags or bank. Reuses the registered useItem
    // deny (sim_i18n error.noItem) instead of minting a new sim string.
    ctx.error(pid, "You don't have that item.");
    return false;
  }
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
 *  mounted state changed. Ownership is re-validated here: a pick whose reins
 *  item is gone silently falls back to the horse (the pick every player owns),
 *  so the toggle never dead-ends on a stale selection. */
export function toggleMount(ctx: SimContext, pid: number): boolean {
  const meta = ctx.players.get(pid);
  const e = ctx.entities.get(pid);
  if (!meta || !e) return false;
  if (e.mountKey) {
    e.mountKey = '';
    recalcFor(ctx, e, meta);
    return true;
  }
  if (!mountOwned(meta, meta.selectedMount)) meta.selectedMount = DEFAULT_MOUNT;
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
