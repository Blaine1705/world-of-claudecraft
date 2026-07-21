// Long-term Rift itemization: personal Rift gear drops plus deterministic forge
// operations (upgrade, enchant, gems). Static ItemDefs remain the combat-safe
// shell; all per-copy progression lives in ItemInstancePayload.

import {
  RIFT_EPIC_ITEM_IDS,
  RIFT_ESSENCE_ITEM_ID,
  RIFT_GEM_IDS,
  RIFT_LEGENDARY_ITEM_ID,
  RIFT_RARE_ITEM_IDS,
  type RiftGemId,
} from '../content/rift/items';
import { ITEMS } from '../data';
import type { PlayerMeta } from '../sim';
import type { SimContext } from '../sim_context';
import type { Entity, ItemInstancePayload, PlayerClass, RiftTier } from '../types';
import { riftRankForBaseLevel } from './ranks';

export const RIFT_ENCHANT_STATS = [
  'str',
  'agi',
  'sta',
  'int',
  'spi',
  'critRating',
  'hasteRating',
] as const;
export type RiftEnchantStat = (typeof RIFT_ENCHANT_STATS)[number];

const TIER_POWER: Record<RiftTier, number> = { C: 1, B: 2, A: 3, S: 4 };
const MELEE_CLASSES = new Set<PlayerClass>(['warrior', 'paladin', 'shaman']);
const AGILITY_CLASSES = new Set<PlayerClass>(['rogue', 'hunter', 'druid']);

export type RiftForgeAction = 'upgrade' | 'enchant' | 'socket';
export interface RiftForgeResult {
  ok: boolean;
  action: RiftForgeAction;
  itemId: string;
  reason?:
    | 'not_found'
    | 'not_rift_gear'
    | 'max_upgrade'
    | 'insufficient_essence'
    | 'invalid_stat'
    | 'invalid_gem'
    | 'sockets_full';
  upgradeLevel?: number;
  essenceSpent?: number;
}

function shellForClass(cls: PlayerClass): {
  itemId: string;
  primary: 'str' | 'agi' | 'int';
  secondary: 'sta' | 'spi';
} {
  if (MELEE_CLASSES.has(cls)) {
    return { itemId: 'riftbound_band_of_might', primary: 'str', secondary: 'sta' };
  }
  if (AGILITY_CLASSES.has(cls)) {
    return { itemId: 'riftbound_band_of_guile', primary: 'agi', secondary: 'sta' };
  }
  return { itemId: 'riftbound_band_of_insight', primary: 'int', secondary: 'spi' };
}

function rebuildRolledStats(instance: ItemInstancePayload): void {
  const rift = instance.rift;
  if (!rift) return;
  const stats: Record<string, number> = { ...rift.baseStats };
  const primary = Object.keys(rift.baseStats)[0];
  if (primary) stats[primary] = (stats[primary] ?? 0) + rift.upgradeLevel;
  stats.sta = (stats.sta ?? 0) + Math.floor(rift.upgradeLevel / 2);
  if (rift.enchant) stats[rift.enchant.stat] = (stats[rift.enchant.stat] ?? 0) + rift.enchant.value;
  for (const gem of rift.gems) {
    if (gem === 'rift_gem_crimson') stats.str = (stats.str ?? 0) + 2;
    else if (gem === 'rift_gem_azure') stats.int = (stats.int ?? 0) + 2;
    else if (gem === 'rift_gem_verdant') stats.sta = (stats.sta ?? 0) + 2;
  }
  instance.rolled = { ...(instance.rolled ?? {}), quality: 'epic', stats };
}

const SHELL_STATS: Readonly<
  Record<string, { primary: 'str' | 'agi' | 'int'; secondary: 'sta' | 'spi' }>
> = {
  riftbound_band_of_might: { primary: 'str', secondary: 'sta' },
  riftbound_band_of_insight: { primary: 'int', secondary: 'spi' },
  riftbound_band_of_guile: { primary: 'agi', secondary: 'sta' },
};

/** Rebuild a persisted copy from bounded progression inputs; rolled stats and
 * baseStats are never trusted from JSONB. Null downgrades a malformed copy to
 * its harmless static ItemDef shell at the load boundary. */
export function sanitizeRiftGearInstance(
  itemId: string,
  input: ItemInstancePayload,
  ownerId: number,
): ItemInstancePayload | null {
  const source = input.rift;
  const shell = SHELL_STATS[itemId];
  if (!source || !shell || !['C', 'B', 'A', 'S'].includes(source.tier)) return null;
  const power = TIER_POWER[source.tier];
  if (
    !Number.isInteger(source.upgradeLevel) ||
    source.upgradeLevel < 0 ||
    source.upgradeLevel > 5 ||
    typeof source.sourceEventId !== 'string' ||
    source.sourceEventId.length < 1 ||
    source.sourceEventId.length > 128
  ) {
    return null;
  }
  const gemSlots = source.tier === 'S' ? 2 : 1;
  const gems = Array.isArray(source.gems)
    ? source.gems.filter((gem): gem is RiftGemId =>
        (RIFT_GEM_IDS as readonly string[]).includes(gem),
      )
    : [];
  if (gems.length > gemSlots) return null;
  const enchant = source.enchant;
  if (
    enchant &&
    (!(RIFT_ENCHANT_STATS as readonly string[]).includes(enchant.stat) ||
      enchant.value !== Math.max(1, Math.ceil(power / 2)))
  ) {
    return null;
  }
  const clean: ItemInstancePayload = {
    boundTo: ownerId,
    rolled: { quality: 'epic', stats: {} },
    rift: {
      sourceEventId: source.sourceEventId,
      tier: source.tier,
      power,
      upgradeLevel: source.upgradeLevel,
      maxUpgradeLevel: 5,
      baseStats: {
        [shell.primary]: power,
        [shell.secondary]: Math.max(1, Math.ceil(power / 2)),
      },
      ...(enchant && { enchant: { ...enchant } }),
      gemSlots,
      gems: [...gems],
    },
  };
  rebuildRolledStats(clean);
  return clean;
}

export function createRiftGearInstance(
  eventId: string,
  tier: RiftTier,
  cls: PlayerClass,
  boundTo: number,
): { itemId: string; instance: ItemInstancePayload } {
  const shell = shellForClass(cls);
  const power = TIER_POWER[tier];
  const instance: ItemInstancePayload = {
    boundTo,
    rolled: { quality: 'epic', stats: {} },
    rift: {
      sourceEventId: eventId,
      tier,
      power,
      upgradeLevel: 0,
      maxUpgradeLevel: 5,
      baseStats: { [shell.primary]: power, [shell.secondary]: Math.max(1, Math.ceil(power / 2)) },
      gemSlots: tier === 'S' ? 2 : 1,
      gems: [],
    },
  };
  rebuildRolledStats(instance);
  return { itemId: shell.itemId, instance };
}

// Clear-time epic/legendary odds per rank. Economy rationale: these land ONLY
// on a completed final-boss kill (never a static loot table), so a C farm can
// never mint epics (it gets a guaranteed rare instead), and the cadence is
// bound by the ranked portal spawns. B now guarantees one epic, matching the
// heroic five-man floor for a rank that carries the same heroic stat transform.
// A guarantees one epic; S guarantees one with a real shot at a second, plus
// the game's one legendary chase roll.
const RIFT_EPIC_CHANCE_B = 1.0; // guaranteed: B carries heroic stat transform
const RIFT_SECOND_EPIC_CHANCE_S = 0.35;
const RIFT_LEGENDARY_CHANCE_S = 0.04;

// Clear-time coin bonuses by rank (added on top of the static boss coin, which
// stays rank-invariant). C gets a normal-dungeon-scale bonus; B tastes a small
// windfall; A/S scale toward the Korzul (50 000c) and Nythraxis benchmarks.
// Named constants so balance tuning stays in one place.
export const RIFT_COIN_BONUS_C = 10_000; // 10 000c: mirrors normal-dungeon economy
export const RIFT_COIN_BONUS_B = 10_000; // 10 000c (10 silver)
export const RIFT_COIN_BONUS_A = 35_000; // 35 000c (35 silver)
export const RIFT_COIN_BONUS_S = 50_000; // 50 000c, matches Korzul Heroic peak (per-capita: 5-player vs 10-player)

// Blue (rare) mount reins that roll on A or S clears. A 0.6% independent roll
// picks one of these two at random; they are appended AFTER all gear draws so
// the gear draw-order stays byte-identical to pre-mount builds.
export const RIFT_BLUE_MOUNT_REINS = ['reins_aether_hover_cycle', 'reins_shadowjump_toad'] as const;
export const RIFT_BLUE_MOUNT_CHANCE = 0.006; // 0.6% per A/S clear

// Epic mount reins that roll on S clears only. 0.3% independent roll picks one
// of the two at random; appended after the blue mount draw.
export const RIFT_EPIC_MOUNT_REINS = [
  'reins_stormfeather_griffin',
  'reins_thunderstrut_gobbler',
] as const;
export const RIFT_EPIC_MOUNT_CHANCE = 0.003; // 0.3% per S clear

/** Rank-gated gear payout on the winning clear: pushed onto the final boss's
 * corpse as PLAIN drops, so the normal party loot rules (rolls) decide who
 * takes them. Runs for every winning clear, ranked race or dev portal, with
 * the rank derived from the descriptor baseLevel.
 *
 * Draw order (APPEND-ONLY; inserting before any existing draw breaks parity):
 *   0. C: guaranteed rare from RIFT_RARE_ITEM_IDS pool (rng.int pick)
 *   1. B: guaranteed epic gear (RIFT_EPIC_CHANCE_B = 1.0, preserves rng draw)
 *   2. A/S: guaranteed first epic gear (rng.int pick)
 *   3. S: optional second epic gear (RIFT_SECOND_EPIC_CHANCE_S)
 *   4. S: optional legendary gear (RIFT_LEGENDARY_CHANCE_S)
 *   5. A/S: optional blue mount (RIFT_BLUE_MOUNT_CHANCE + rng.int pick)
 *   6. S: optional epic mount (RIFT_EPIC_MOUNT_CHANCE + rng.int pick)
 *
 * B/A/S draws are unaffected by the new C draw (C returns after draw 0).
 */
export function addRiftClearGearLoot(ctx: SimContext, boss: Entity, baseLevel: number): void {
  const rank = riftRankForBaseLevel(baseLevel);
  const loot = boss.loot ?? { copper: 0, items: [] };

  // --- Draw 0: C-rank guaranteed rare + coin (normal-tier payout; exits here) ---
  if (rank === 'C') {
    const rare = RIFT_RARE_ITEM_IDS[ctx.rng.int(0, RIFT_RARE_ITEM_IDS.length - 1)];
    loot.items.push({ itemId: rare, count: 1 });
    loot.copper = (loot.copper ?? 0) + RIFT_COIN_BONUS_C;
    boss.loot = loot;
    boss.lootable = true;
    return;
  }

  const epic = (): string => RIFT_EPIC_ITEM_IDS[ctx.rng.int(0, RIFT_EPIC_ITEM_IDS.length - 1)];

  // --- Draws 1-4: clear-time gear (existing order preserved for parity) ---
  if (rank === 'B') {
    if (ctx.rng.chance(RIFT_EPIC_CHANCE_B)) loot.items.push({ itemId: epic(), count: 1 });
  } else {
    loot.items.push({ itemId: epic(), count: 1 });
    if (rank === 'S') {
      if (ctx.rng.chance(RIFT_SECOND_EPIC_CHANCE_S)) {
        loot.items.push({ itemId: epic(), count: 1 });
      }
      if (ctx.rng.chance(RIFT_LEGENDARY_CHANCE_S)) {
        loot.items.push({ itemId: RIFT_LEGENDARY_ITEM_ID, count: 1 });
      }
    }
  }

  // --- Draw 5: blue mount on A or S clears (APPENDED after all gear draws) ---
  if ((rank === 'A' || rank === 'S') && ctx.rng.chance(RIFT_BLUE_MOUNT_CHANCE)) {
    const reins = RIFT_BLUE_MOUNT_REINS[ctx.rng.int(0, RIFT_BLUE_MOUNT_REINS.length - 1)];
    loot.items.push({ itemId: reins, count: 1 });
  }

  // --- Draw 6: epic mount on S clears only (APPENDED after blue mount draw) ---
  if (rank === 'S' && ctx.rng.chance(RIFT_EPIC_MOUNT_CHANCE)) {
    const reins = RIFT_EPIC_MOUNT_REINS[ctx.rng.int(0, RIFT_EPIC_MOUNT_REINS.length - 1)];
    loot.items.push({ itemId: reins, count: 1 });
  }

  // --- Rank coin bonus (no rng; purely additive to the static boss coin) ---
  const coinBonus =
    rank === 'B' ? RIFT_COIN_BONUS_B : rank === 'A' ? RIFT_COIN_BONUS_A : RIFT_COIN_BONUS_S;
  loot.copper = (loot.copper ?? 0) + coinBonus;

  boss.loot = loot;
  if (loot.items.length > 0 || loot.copper > 0) boss.lootable = true;
}

/** First-clear personal loot. Every winner gets a class-appropriate non-fungible
 * ring, Rift Essence, and an A/S gem; all remain on the corpse until looted. */
export function addRiftProgressionLoot(
  ctx: SimContext,
  boss: Entity,
  eventId: string,
  tier: RiftTier,
  participants: readonly number[],
  lootMultiplier = 1,
  craftingMaterialBias = 0.25,
): void {
  const loot = boss.loot ?? { copper: 0, items: [] };
  loot.copper = Math.round(loot.copper * Math.max(0.5, Math.min(2, lootMultiplier)));
  const essenceCount = Math.max(
    1,
    Math.min(8, Math.round(TIER_POWER[tier] * Math.max(0.5, Math.min(2, lootMultiplier)))),
  );
  for (let i = 0; i < participants.length; i++) {
    const pid = participants[i];
    const meta = ctx.players.get(pid);
    if (!meta) continue;
    const gear = createRiftGearInstance(eventId, tier, meta.cls, pid);
    loot.items.push({
      itemId: gear.itemId,
      count: 1,
      instance: gear.instance,
      personalFor: [pid],
    });
    for (let essence = 0; essence < essenceCount; essence++) {
      loot.items.push({
        itemId: RIFT_ESSENCE_ITEM_ID,
        count: 1,
        personalFor: [pid],
      });
    }
    if (tier === 'A' || tier === 'S' || craftingMaterialBias >= 0.5) {
      loot.items.push({
        itemId: RIFT_GEM_IDS[i % RIFT_GEM_IDS.length],
        count: 1,
        personalFor: [pid],
      });
    }
  }
  boss.loot = loot;
  boss.lootable = true;
}

function riftInventorySlot(meta: PlayerMeta, itemId: string) {
  for (let i = meta.inventory.length - 1; i >= 0; i--) {
    const slot = meta.inventory[i];
    if (slot.itemId === itemId && slot.instance?.rift) return slot;
  }
  return null;
}

function emitResult(ctx: SimContext, pid: number, result: RiftForgeResult): RiftForgeResult {
  ctx.emit({ type: 'riftForgeResult', pid, ...result });
  if (result.ok) {
    const name = ITEMS[result.itemId]?.name ?? result.itemId;
    const line =
      result.action === 'upgrade'
        ? `Rift upgrade completed for ${name}.`
        : result.action === 'enchant'
          ? `Rift enchant completed for ${name}.`
          : `Rift gem socketed for ${name}.`;
    ctx.emit({
      type: 'log',
      text: line,
      color: '#c9f',
      pid,
    });
  }
  return result;
}

export function upgradeRiftItem(ctx: SimContext, itemId: string, pid?: number): RiftForgeResult {
  const r = ctx.resolve(pid);
  if (!r) return { ok: false, action: 'upgrade', itemId, reason: 'not_found' };
  const slot = riftInventorySlot(r.meta, itemId);
  if (!slot?.instance?.rift) {
    return emitResult(ctx, r.meta.entityId, {
      ok: false,
      action: 'upgrade',
      itemId,
      reason: 'not_rift_gear',
    });
  }
  const gear = slot.instance.rift;
  if (gear.upgradeLevel >= gear.maxUpgradeLevel) {
    return emitResult(ctx, r.meta.entityId, {
      ok: false,
      action: 'upgrade',
      itemId,
      reason: 'max_upgrade',
    });
  }
  const cost = 2 + gear.upgradeLevel * 2;
  if (ctx.countItem(RIFT_ESSENCE_ITEM_ID, r.meta.entityId) < cost) {
    return emitResult(ctx, r.meta.entityId, {
      ok: false,
      action: 'upgrade',
      itemId,
      reason: 'insufficient_essence',
    });
  }
  ctx.removeItem(RIFT_ESSENCE_ITEM_ID, cost, r.meta.entityId);
  gear.upgradeLevel += 1;
  rebuildRolledStats(slot.instance);
  r.meta.wireRev++;
  return emitResult(ctx, r.meta.entityId, {
    ok: true,
    action: 'upgrade',
    itemId,
    upgradeLevel: gear.upgradeLevel,
    essenceSpent: cost,
  });
}

export function enchantRiftItem(
  ctx: SimContext,
  itemId: string,
  stat: string,
  pid?: number,
): RiftForgeResult {
  const r = ctx.resolve(pid);
  if (!r) return { ok: false, action: 'enchant', itemId, reason: 'not_found' };
  const slot = riftInventorySlot(r.meta, itemId);
  if (!slot?.instance?.rift) {
    return emitResult(ctx, r.meta.entityId, {
      ok: false,
      action: 'enchant',
      itemId,
      reason: 'not_rift_gear',
    });
  }
  if (!(RIFT_ENCHANT_STATS as readonly string[]).includes(stat)) {
    return emitResult(ctx, r.meta.entityId, {
      ok: false,
      action: 'enchant',
      itemId,
      reason: 'invalid_stat',
    });
  }
  const cost = 4;
  if (ctx.countItem(RIFT_ESSENCE_ITEM_ID, r.meta.entityId) < cost) {
    return emitResult(ctx, r.meta.entityId, {
      ok: false,
      action: 'enchant',
      itemId,
      reason: 'insufficient_essence',
    });
  }
  ctx.removeItem(RIFT_ESSENCE_ITEM_ID, cost, r.meta.entityId);
  slot.instance.rift.enchant = {
    stat,
    value: Math.max(1, Math.ceil(slot.instance.rift.power / 2)),
  };
  rebuildRolledStats(slot.instance);
  r.meta.wireRev++;
  return emitResult(ctx, r.meta.entityId, {
    ok: true,
    action: 'enchant',
    itemId,
    essenceSpent: cost,
  });
}

export function socketRiftGem(
  ctx: SimContext,
  itemId: string,
  gemId: string,
  pid?: number,
): RiftForgeResult {
  const r = ctx.resolve(pid);
  if (!r) return { ok: false, action: 'socket', itemId, reason: 'not_found' };
  const slot = riftInventorySlot(r.meta, itemId);
  if (!slot?.instance?.rift) {
    return emitResult(ctx, r.meta.entityId, {
      ok: false,
      action: 'socket',
      itemId,
      reason: 'not_rift_gear',
    });
  }
  if (
    !(RIFT_GEM_IDS as readonly string[]).includes(gemId) ||
    ctx.countItem(gemId, r.meta.entityId) < 1
  ) {
    return emitResult(ctx, r.meta.entityId, {
      ok: false,
      action: 'socket',
      itemId,
      reason: 'invalid_gem',
    });
  }
  if (slot.instance.rift.gems.length >= slot.instance.rift.gemSlots) {
    return emitResult(ctx, r.meta.entityId, {
      ok: false,
      action: 'socket',
      itemId,
      reason: 'sockets_full',
    });
  }
  ctx.removeItem(gemId, 1, r.meta.entityId);
  slot.instance.rift.gems.push(gemId as RiftGemId);
  rebuildRolledStats(slot.instance);
  r.meta.wireRev++;
  return emitResult(ctx, r.meta.entityId, { ok: true, action: 'socket', itemId });
}

export function riftSalvageYield(instance: ItemInstancePayload): number {
  const gear = instance.rift;
  return gear ? Math.max(2, Math.min(20, gear.power * 2 + gear.upgradeLevel * 2)) : 0;
}
