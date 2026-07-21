// Rideable ground mounts: collection + selection + mount/dismount rules, a
// sibling sim system behind the SimContext seam (module-first; sim.ts keeps
// thin delegates).
//
// Collection model: EVERY catalog mount is owned while its soulbound reins item
// (ItemDef kind 'mount') sits in the player's bags or bank. The horse
// (DEFAULT_MOUNT) is no longer free: it has its own reins item too, sold by the
// stablemaster, so a fresh player owns nothing until they buy or loot a mount.
// PlayerMeta.selectedMount is the persisted stable pick (horse by default, and
// may name an unowned mount, which is harmless: the toggle falls back to the
// first owned mount). The live "riding X right now" state is Entity.mountKey
// ('' dismounted), which the wire mirrors like `skin` so every host (renderer,
// other clients, the online self extrapolator) reads the same field the
// speed hook uses.
//
// Summoning is not instant: mounting channels a short summon and dismounting a
// quicker put-away (updateMountTransition, driven per tick and interruptible by
// combat or water). Rules: selecting requires owning the mount and meeting its
// level gate; starting a mount re-validates ownership, and is blocked while in
// combat, dead, or a released spirit; dismounting is always allowed; death and
// water force-dismount instantly. Every mount is a ground mount, no flying:
// nothing here touches the vertical axis.
//
// `src/sim`-pure and rng-free.

import {
  MOUNT_KEYS,
  type MountKey,
  mountDef,
  normalizeSelectedMount,
  TRAINING_MOUNT_KEY,
} from './content/mounts';
import { ITEMS } from './data';
import { recalcPlayerStats } from './entity';
import type { PlayerMeta } from './sim';
import type { SimContext } from './sim_context';
import { DT, type Entity, FORM_AURA_KINDS } from './types';

// Summon/dismount channel durations (seconds). Mounting is a short cast the
// player can interrupt by moving into combat or water; dismounting is quicker.
export const MOUNT_SUMMON_SECONDS = 1.5;
export const MOUNT_DISMOUNT_SECONDS = 0.8;

// The reins itemId per catalog mount, derived once from the merged ITEMS table
// (single source: the item record declares `mount`, nothing re-lists the map).
// Static content, so the lazy module-level cache is multi-Sim safe.
let mountItemIds: Map<string, string> | null = null;

/** The collectible item that owns `key` (null for an unknown key, or a catalog
 *  mount with no reins item). Every catalog mount now has one, the horse
 *  included (reins_valorsteed). */
export function mountItemId(key: string): string | null {
  if (!mountItemIds) {
    mountItemIds = new Map();
    for (const def of Object.values(ITEMS)) {
      if (def.kind === 'mount') mountItemIds.set(def.mount, def.id);
    }
  }
  return mountItemIds.get(key) ?? null;
}

/** Whether the player owns the mount: any catalog mount (the horse included)
 *  while its reins item sits in bags or bank (soulbound, so ownership never
 *  transfers). Unknown keys are never owned. A fresh player owns nothing. */
export function mountOwned(meta: PlayerMeta, key: string): boolean {
  if (!mountDef(key)) return false;
  const itemId = mountItemId(key);
  if (!itemId) return false;
  return (
    meta.inventory.some((s) => s.itemId === itemId) ||
    meta.bank.inventory.some((s) => s.itemId === itemId)
  );
}

/** The owned subset of the catalog, in catalog order. Empty for a fresh player.
 *  Single pass over bags + bank: the server rebuilds this per snapshot, so it
 *  never scans the containers once per catalog mount. */
export function ownedMounts(meta: PlayerMeta): MountKey[] {
  const owned = new Set<string>();
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

// Recompute the player's derived stats after a mount state change (aura strips,
// mount/dismount): this is the same path an equip change takes.
function recalcFor(ctx: SimContext, e: Entity, meta: PlayerMeta): void {
  recalcPlayerStats(e, meta.cls, meta.equipment, ctx.playerMods(meta), meta.equipmentInstance);
}

/** The riding lesson lets the player ride the training Valorsteed before they own
 *  it: the ONE place an unowned mount is allowed to summon and apply. True only
 *  while a lesson is IN_PROGRESS and the target is the training steed
 *  (src/sim/mounts_training.ts). */
function trainingSummon(meta: PlayerMeta | undefined, key: string): boolean {
  return key === TRAINING_MOUNT_KEY && meta?.mountTraining?.state === 'IN_PROGRESS';
}

/** Force an instant dismount with no put-away channel: clears the live mount and
 *  any in-flight summon/dismount channel, then recomputes stats. Used by the riding
 *  lesson to take the unowned training steed back the moment the lesson ends, and by
 *  the auto-attack loop and cast path to dismount on ability use. */
export function forceDismount(ctx: SimContext, e: Entity): void {
  if (!e.mountKey && (e.mountCastRemaining ?? 0) <= 0 && e.mountCastKey === '') return;
  e.mountKey = '';
  e.mountCastRemaining = 0;
  e.mountCastKey = '';
  const meta = ctx.players.get(e.id);
  if (meta) recalcFor(ctx, e, meta);
}

/** Put an active riding-lesson player straight onto the training Valorsteed.
 *  Used by the start-platform flow, which replaces the old Marla button and
 *  therefore needs the race click to lend the lesson mount immediately. */
export function forceTrainingMount(ctx: SimContext, e: Entity): boolean {
  const meta = ctx.players.get(e.id);
  if (meta?.mountTraining?.state !== 'IN_PROGRESS') return false;
  e.mountKey = TRAINING_MOUNT_KEY;
  e.mountCastRemaining = 0;
  e.mountCastKey = '';
  recalcFor(ctx, e, meta);
  return true;
}

const RIDING_UNTRAINED_MSG = 'You must learn to ride first. Find a riding trainer.';

/** Pick the player's stable mount (persisted). Riding skill-, ownership-, and
 *  level-gated; swaps the live mount in place when already riding. Returns false
 *  on an unknown key or a failed gate (an error event carries the reason). */
export function selectMount(ctx: SimContext, pid: number, key: string): boolean {
  const meta = ctx.players.get(pid);
  const e = ctx.entities.get(pid);
  if (!meta || !e) return false;
  const def = mountDef(key);
  if (!def) return false;
  if (!meta.ridingTrained) {
    ctx.error(pid, RIDING_UNTRAINED_MSG);
    return false;
  }
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
  // bypass toggleMount's combat gate. In combat the pick still updates and applies
  // on the next mount.
  if (e.mountKey && e.mountKey !== def.key && !e.inCombat && !e.dead && !e.ghost) {
    e.mountKey = def.key;
    recalcFor(ctx, e, meta);
  }
  return true;
}

/** Strip all active form auras (FORM_AURA_KINDS) and ghost_wolf from the entity,
 *  emitting aura-removal events for each one removed. Called before a mount summon
 *  starts so the player is never simultaneously shapeshifted and mounting. Calls
 *  recalcFor if any aura was removed so stat effects (speed, etc.) clear immediately. */
function cancelFormsAndGhostWolf(ctx: SimContext, e: Entity): void {
  let stripped = false;
  for (let i = e.auras.length - 1; i >= 0; i--) {
    const aura = e.auras[i];
    if (FORM_AURA_KINDS.has(aura.kind) || aura.id === 'ghost_wolf') {
      e.auras.splice(i, 1);
      ctx.emit({ type: 'aura', targetId: e.id, name: aura.name, gained: false });
      stripped = true;
    }
  }
  if (stripped) {
    const meta = ctx.players.get(e.id);
    if (meta) recalcFor(ctx, e, meta);
  }
}

/** Toggle riding: start a summon channel when dismounted, or a dismount channel
 *  when riding. Returns true when a transition was started (or completed for
 *  dismount), false on a failed gate or an ignored mid-transition toggle. The
 *  live mount state does NOT flip here: updateMountTransition applies it when
 *  the channel finishes. Ownership is resolved here: the stable pick when owned,
 *  else the first owned mount in catalog order; with nothing owned there is
 *  nothing to ride. */
export function toggleMount(ctx: SimContext, pid: number): boolean {
  const meta = ctx.players.get(pid);
  const e = ctx.entities.get(pid);
  if (!meta || !e) return false;
  // A toggle while a summon/dismount is already channeling is ignored.
  if ((e.mountCastRemaining ?? 0) > 0) return false;
  if (e.mountKey) {
    // Start the dismount channel (never gated: dismounting is always allowed).
    e.mountCastRemaining = MOUNT_DISMOUNT_SECONDS;
    e.mountCastKey = '';
    return true;
  }
  // Riding skill gate: the player must have purchased riding from Marla before
  // they can summon any mount. The training lesson is the one exception (it teaches
  // the skill via the quest and lends the Valorsteed during the lesson itself).
  if (!meta.ridingTrained && meta.mountTraining?.state !== 'IN_PROGRESS') {
    ctx.error(pid, RIDING_UNTRAINED_MSG);
    return false;
  }
  // Riding-lesson tutorial: while a lesson is in progress the Mount/Dismount
  // toggle summons the training Valorsteed even though it is UNOWNED (teaching the
  // Z keybind is the whole point). Runs the normal summon channel; it never touches
  // the persisted pick and skips the ownership/level gates (begin already required
  // level 20). Combat/water still cancel the channel via updateMountTransition.
  if (meta.mountTraining?.state === 'IN_PROGRESS') {
    if (e.dead || e.ghost) return false;
    if (e.inCombat) {
      ctx.error(pid, "You can't do that while in combat.");
      return false;
    }
    cancelFormsAndGhostWolf(ctx, e);
    e.mountCastRemaining = MOUNT_SUMMON_SECONDS;
    e.mountCastKey = TRAINING_MOUNT_KEY;
    return true;
  }
  // Resolve which mount to summon: the stable pick if owned, else fall back to
  // the first owned mount in catalog order (and adopt it as the new pick).
  let key: MountKey | '' = '';
  if (mountOwned(meta, meta.selectedMount)) {
    key = normalizeSelectedMount(meta.selectedMount);
  } else {
    key = ownedMounts(meta)[0] ?? '';
    if (key) meta.selectedMount = key;
  }
  if (!key) {
    ctx.error(pid, "You don't have a mount yet.");
    return false;
  }
  const def = mountDef(key);
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
  // Cancel all active form auras and ghost_wolf before the summon channel starts.
  cancelFormsAndGhostWolf(ctx, e);
  // Start the summon channel. mountKey stays '' until the channel completes.
  e.mountCastRemaining = MOUNT_SUMMON_SECONDS;
  e.mountCastKey = def.key;
  return true;
}

/** Per-tick driver for the mount summon/dismount channel (called from the
 *  coordinator's per-player loop). `swimming` is whether the entity is in
 *  fishable/deep water this tick. Water and death force an instant dismount;
 *  a summon channel cancels on entering combat or water; a finished channel
 *  applies the mount (re-validating ownership) or the dismount. */
export function updateMountTransition(ctx: SimContext, e: Entity, swimming: boolean): void {
  const meta = ctx.players.get(e.id);
  // (a) Water force-dismounts instantly: no ground mount swims. Also clears any
  // in-flight channel so a re-mount starts clean once back on land.
  if (swimming && e.mountKey) {
    e.mountKey = '';
    e.mountCastRemaining = 0;
    e.mountCastKey = '';
    if (meta) recalcFor(ctx, e, meta);
    return;
  }
  // (b) Advance an in-flight summon/dismount channel.
  if ((e.mountCastRemaining ?? 0) > 0) {
    // A summon (mountCastKey names a mount) cancels on entering combat or water,
    // with no error toast. A dismount (mountCastKey === '') always proceeds.
    if (e.mountCastKey !== '' && (e.inCombat || swimming)) {
      e.mountCastRemaining = 0;
      e.mountCastKey = '';
      return;
    }
    e.mountCastRemaining -= DT;
    if (e.mountCastRemaining <= 0) {
      const target = e.mountCastKey;
      if (target === '') {
        e.mountKey = '';
      } else if (
        mountDef(target) &&
        meta &&
        (mountOwned(meta, target) || trainingSummon(meta, target))
      ) {
        e.mountKey = target;
      }
      // A summon whose reins vanished mid-channel leaves the player unmounted.
      e.mountCastRemaining = 0;
      e.mountCastKey = '';
      if (meta) recalcFor(ctx, e, meta);
    }
  }
}
