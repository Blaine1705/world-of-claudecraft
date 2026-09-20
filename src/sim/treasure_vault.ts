// Treasure maps and vaults (world quests, Stage 3). The engine behind
// src/sim/content/treasure_maps.ts:
//
//   - reading a map (the `treasureMap` item-use arm) marks a dig site and fixes
//     the vault's Rift seed; the map stays in the bags until the dig;
//   - using it again on the X spends it and opens a private vault portal, an
//     event-less Rift portal (src/sim/rift/) stamped with its owner, so only
//     the owner and their party may enter and the run pays no Rift ladder;
//   - the vault scales the Rift rank tuning to the head count its owner brought
//     and, when the boss falls, pays every entrant the rarity's table;
//   - a read map can be redrawn one rarity finer with Cartographer's Ink, which
//     the faction quartermasters sell for their currency.
//
// State lives on PlayerMeta (treasureMap, vaultGuestCycle, vaultGuestPayouts)
// behind the world-quest save. Every roll draws from ctx.rng in a fixed order.

import { treasureCasketCopper } from './clue_casket';
import { HEROIC_MARK_ITEM_ID } from './content/dungeon_difficulty';
import { rollHoardBossDrop } from './content/hoard_loot';
import {
  CARTOGRAPHERS_INK_ITEM_ID,
  isTreasureMapRarity,
  nextTreasureMapRarity,
  TREASURE_DIG_RADIUS,
  TREASURE_MAP_DROP_WEIGHTS,
  TREASURE_MAP_ITEM_IDS,
  TREASURE_MAP_RARITIES,
  TREASURE_MAP_RIFT_TIER,
  TREASURE_MAP_UPGRADE_INKS,
  TREASURE_SITES,
  TREASURE_SITES_BY_ID,
  type TreasureMapProgress,
  type TreasureMapRarity,
  VAULT_GUEST_GEAR_CHANCE,
  VAULT_GUEST_PAYOUTS_PER_CYCLE,
  VAULT_OWNER_COPPER_BONUS,
  VAULT_PAYOUTS,
  VAULT_PORTAL_LIFETIME,
  vaultDamageFactor,
  vaultHealthFactor,
} from './content/treasure_maps';
import { zoneAt } from './data';
import { createGroundObject } from './entity';
import { mountOwned } from './mounts';
import { RIFT_RANK_BASE_LEVEL, type RiftRankTuning } from './rift/ranks';
import { generateRiftPlan } from './rift/rift_gen';
import type { RiftInstance } from './rift/types';
import {
  HOARD_ENTRANCE_TEMPLATE_ID,
  isVaultZoneId,
  makeVaultSeed,
  OPEN_HOARD_RARITIES,
  type VaultSizeTier,
} from './rift/vault_seed';
import type { PlayerMeta } from './sim';
import type { SimContext } from './sim_context';
import { findHoardEntrancePosition } from './treasure_vault_placement';
import type { Entity } from './types';
import { waterLevelAt } from './world';

const CASKET_MATERIAL_POOL = ['thorium_ore', 'elderwood_log', 'sunpetal_herb'] as const;
const VAULT_MOUNT_REINS_ITEM_ID = 'reins_lanternback_troll';
const VAULT_MOUNT_KEY = 'lanternback_troll';
// ---------------------------------------------------------------------------
// Save boundary

export function sanitizeTreasureMap(raw: unknown): TreasureMapProgress | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (!isTreasureMapRarity(obj.rarity)) return null;
  if (typeof obj.siteId !== 'string' || !TREASURE_SITES_BY_ID[obj.siteId]) return null;
  const seed = typeof obj.seed === 'number' && Number.isFinite(obj.seed) ? obj.seed >>> 0 : 0;
  return { rarity: obj.rarity, siteId: obj.siteId, seed };
}

export function sanitizeVaultGuestPayouts(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
}

// ---------------------------------------------------------------------------
// The daily board's map

/** One rarity by TREASURE_MAP_DROP_WEIGHTS (a single rng draw). */
export function rollTreasureMapRarity(ctx: SimContext): TreasureMapRarity {
  const total = TREASURE_MAP_RARITIES.reduce((sum, r) => sum + TREASURE_MAP_DROP_WEIGHTS[r], 0);
  let roll = ctx.rng.range(0, total);
  for (const rarity of TREASURE_MAP_RARITIES) {
    roll -= TREASURE_MAP_DROP_WEIGHTS[rarity];
    if (roll < 0) return rarity;
  }
  return 'common';
}

/** A vault seed for this rarity (src/sim/rift/vault_seed.ts): the rarity is the
 *  room's size tier, so every host regenerates the same one-room vault from the
 *  seed alone. One rng draw. */
function pickVaultSeed(ctx: SimContext, rarity: TreasureMapRarity, zoneId: string): number {
  const tier = TREASURE_MAP_RARITIES.indexOf(rarity) as VaultSizeTier;
  if (!isVaultZoneId(zoneId))
    throw new Error(`Treasure site uses an unknown vault zone: ${zoneId}`);
  return makeVaultSeed(tier, ctx.rng.int(0, 0x007fffff), {
    open: (OPEN_HOARD_RARITIES as readonly string[]).includes(rarity),
    zoneId,
  });
}

// ---------------------------------------------------------------------------
// Reading and digging (the `treasureMap` item-use arm)

function atTreasureSite(player: Entity, map: TreasureMapProgress): boolean {
  const site = TREASURE_SITES_BY_ID[map.siteId];
  if (!site || zoneAt(player.pos.x, player.pos.z).id !== site.zoneId) return false;
  const dx = player.pos.x - site.x;
  const dz = player.pos.z - site.z;
  return dx * dx + dz * dz <= TREASURE_DIG_RADIUS * TREASURE_DIG_RADIUS;
}

/**
 * Using a treasure map. With no map read yet, reads this one: marks a site,
 * fixes the vault seed, keeps the item. With this rarity already read, off the
 * X it re-shows the map; on the X it spends the item and opens the vault.
 */
export function useTreasureMap(
  ctx: SimContext,
  meta: PlayerMeta,
  player: Entity,
  rarity: TreasureMapRarity,
  consumeOneUnit: () => void,
): void {
  const pid = meta.entityId;
  const active = meta.treasureMap;
  if (!active) {
    const site = TREASURE_SITES[ctx.rng.int(0, TREASURE_SITES.length - 1)];
    meta.treasureMap = { rarity, siteId: site.id, seed: pickVaultSeed(ctx, rarity, site.zoneId) };
    meta.wireRev++;
    ctx.emit({ type: 'treasureMapRead', rarity, siteId: site.id, fresh: true, pid });
    return;
  }
  if (active.rarity !== rarity) {
    ctx.error(pid, 'You are already following another treasure map.');
    return;
  }
  if (!atTreasureSite(player, active)) {
    ctx.emit({ type: 'treasureMapRead', rarity, siteId: active.siteId, fresh: false, pid });
    return;
  }
  if (!spawnVaultPortal(ctx, player, pid, active)) {
    ctx.emit({ type: 'treasureMapRead', rarity, siteId: active.siteId, fresh: false, pid });
    return;
  }
  consumeOneUnit();
  meta.treasureMap = null;
  meta.wireRev++;
  ctx.emit({ type: 'treasureVaultOpened', rarity, pid });
}

function spawnVaultPortal(
  ctx: SimContext,
  player: Entity,
  ownerPid: number,
  map: TreasureMapProgress,
): boolean {
  const position = findHoardEntrancePosition(player.pos, player.facing, ctx.groundPos, (x, z) =>
    waterLevelAt(x, z, ctx.cfg.seed),
  );
  if (!position) return false;
  const tier = TREASURE_MAP_RIFT_TIER[map.rarity];
  const baseLevel = RIFT_RANK_BASE_LEVEL[tier];
  const plan = generateRiftPlan(map.seed, baseLevel);
  const portal = createGroundObject(ctx.nextId++, '', plan.name, position);
  portal.templateId = HOARD_ENTRANCE_TEMPLATE_ID;
  portal.objectItemId = null;
  portal.lootable = true;
  portal.riftSeed = map.seed;
  portal.riftBaseLevel = baseLevel;
  portal.riftTier = tier;
  portal.vaultOwnerPid = ownerPid;
  portal.vaultRarity = map.rarity;
  portal.vaultExpiresAt = ctx.time + VAULT_PORTAL_LIFETIME;
  portal.facing = Math.atan2(player.pos.x - position.x, player.pos.z - position.z);
  ctx.addEntity(portal);
  ctx.emit({
    type: 'spellfxAt',
    x: portal.pos.x,
    z: portal.pos.z,
    school: 'physical',
    fx: 'hoardDig',
    sfxKey: 'hoard_entrance_open',
  });
  return true;
}

/** Once a second: an unentered vault portal past its lifetime closes. A portal
 *  a run is bound to is left to the Rift's own cleanup. Reads the Rift portal
 *  registry (entity_roster keeps it), so vaults add no list of their own. */
export function updateVaultPortals(ctx: SimContext): void {
  if (ctx.tickCount % 20 !== 5 || !ctx.riftPortalIds) return;
  for (const id of [...ctx.riftPortalIds]) {
    const portal = ctx.entities.get(id);
    if (!portal || portal.vaultExpiresAt === undefined || ctx.time < portal.vaultExpiresAt)
      continue;
    if (ctx.riftInstances.some((inst) => inst.partyKey !== null && inst.portalId === id)) continue;
    ctx.dropEntity(id);
  }
}

// ---------------------------------------------------------------------------
// The Rift hooks (src/sim/rift/runs.ts)

/** Whether `pid` may walk through `portal`: always for an ordinary rift; for a
 *  vault, the map's owner and whoever shares the owner's party. */
export function mayEnterVaultPortal(ctx: SimContext, portal: Entity, pid: number): boolean {
  const owner = portal.vaultOwnerPid;
  if (owner === undefined || owner === pid) return true;
  const party = ctx.partyOf(owner);
  return party?.members.includes(pid) ?? false;
}

/** The vault record for a fresh run entered through `portal` (null for an
 *  ordinary rift). The head count is the owner's party size at that moment. */
export function vaultForPortal(ctx: SimContext, portal: Entity | null): RiftInstance['vault'] {
  if (portal?.vaultOwnerPid === undefined || !portal.vaultRarity) return null;
  const party = ctx.partyOf(portal.vaultOwnerPid);
  return {
    rarity: portal.vaultRarity,
    ownerPid: portal.vaultOwnerPid,
    headCount: Math.max(1, Math.min(5, party?.members.length ?? 1)),
    level: ctx.entities.get(portal.vaultOwnerPid)?.level ?? RIFT_RANK_BASE_LEVEL.C,
  };
}

/** The rank tuning scaled to a vault's head count; unchanged for a rift. */
export function vaultScaledTuning(
  tuning: RiftRankTuning,
  vault: RiftInstance['vault'],
): RiftRankTuning {
  if (!vault) return tuning;
  const health = vaultHealthFactor(vault.headCount);
  const damage = vaultDamageFactor(vault.headCount);
  return {
    ...tuning,
    healthMultiplier: tuning.healthMultiplier * health,
    bossHealthMultiplier: tuning.bossHealthMultiplier * health,
    damageMultiplier: tuning.damageMultiplier * damage,
    bossDamageMultiplier: tuning.bossDamageMultiplier * damage,
    addDamageMultiplier: tuning.addDamageMultiplier * damage,
  };
}

/** The boss fell: pay every entrant the rarity's table, the gear off the fallen
 *  boss's own loot (`bossTemplateId`, content/hoard_loot.ts). A guest past the
 *  per-cycle cap is told so and paid nothing; the owner is never capped. */
export function payTreasureVault(
  ctx: SimContext,
  vault: NonNullable<RiftInstance['vault']>,
  participants: readonly number[],
  bossTemplateId: string | undefined,
): void {
  for (const pid of participants) {
    const meta = ctx.players.get(pid);
    const player = ctx.entities.get(pid);
    if (!meta || !player || meta.leaving) continue;
    const owner = pid === vault.ownerPid;
    if (!owner) {
      if (meta.vaultGuestCycle !== meta.worldQuestCycle) {
        meta.vaultGuestCycle = meta.worldQuestCycle;
        meta.vaultGuestPayouts = 0;
      }
      if ((meta.vaultGuestPayouts ?? 0) >= VAULT_GUEST_PAYOUTS_PER_CYCLE) {
        ctx.emit({ type: 'treasureVaultLooted', rarity: vault.rarity, capped: true, pid });
        continue;
      }
      meta.vaultGuestPayouts = (meta.vaultGuestPayouts ?? 0) + 1;
    }
    payOne(ctx, meta, player, vault.rarity, owner, bossTemplateId);
  }
}

function payOne(
  ctx: SimContext,
  meta: PlayerMeta,
  player: Entity,
  rarity: TreasureMapRarity,
  owner: boolean,
  bossTemplateId: string | undefined,
): void {
  const pid = meta.entityId;
  const def = VAULT_PAYOUTS[rarity];
  const itemIds: string[] = [];
  const material = CASKET_MATERIAL_POOL[ctx.rng.int(0, CASKET_MATERIAL_POOL.length - 1)];
  ctx.addItem(material, def.materials, pid);
  itemIds.push(material);
  if (ctx.rng.chance(owner ? def.gearChance : VAULT_GUEST_GEAR_CHANCE[rarity])) {
    const itemId = rollHoardBossDrop(ctx.rng, bossTemplateId, rarity, meta.cls);
    ctx.addItem(itemId, 1, pid);
    itemIds.push(itemId);
  }
  if (ctx.rng.chance(def.markChance)) {
    ctx.addItem(HEROIC_MARK_ITEM_ID, def.marks, pid);
    itemIds.push(HEROIC_MARK_ITEM_ID);
  }
  // Always drawn, so the rng sequence never depends on the collection.
  if (ctx.rng.chance(def.mountChance) && !mountOwned(meta, VAULT_MOUNT_KEY)) {
    ctx.addItem(VAULT_MOUNT_REINS_ITEM_ID, 1, pid);
    itemIds.push(VAULT_MOUNT_REINS_ITEM_ID);
  }
  const next = nextTreasureMapRarity(rarity);
  if (ctx.rng.chance(def.nextMapChance) && next) {
    ctx.addItem(TREASURE_MAP_ITEM_IDS[next], 1, pid);
    itemIds.push(TREASURE_MAP_ITEM_IDS[next]);
  }
  const base = treasureCasketCopper(player.level) * def.copperMult;
  const copper = Math.round(owner ? base * (1 + VAULT_OWNER_COPPER_BONUS) : base);
  meta.copper += copper;
  meta.clueCasketsOpened = (meta.clueCasketsOpened ?? 0) + 1;
  ctx.markDeedsDirty(pid);
  ctx.emit({ type: 'treasureVaultLooted', rarity, capped: false, itemIds, copper, pid });
}

// ---------------------------------------------------------------------------
// Cartographer's Ink (the `cartographersInk` item-use arm): redraws the read
// map one rarity finer. The ink is bought from a faction quartermaster.

export function useCartographersInk(ctx: SimContext, meta: PlayerMeta): void {
  const pid = meta.entityId;
  const map = meta.treasureMap;
  if (!map) {
    ctx.error(pid, 'Read the treasure map you want to redraw first.');
    return;
  }
  const next = nextTreasureMapRarity(map.rarity);
  if (!next) {
    ctx.error(pid, 'This map cannot be improved any further.');
    return;
  }
  const inks = TREASURE_MAP_UPGRADE_INKS[map.rarity];
  if (ctx.countItem(CARTOGRAPHERS_INK_ITEM_ID, pid) < inks) {
    ctx.error(pid, `Redrawing this map takes ${inks} Cartographer's Ink.`);
    return;
  }
  if (ctx.countItem(TREASURE_MAP_ITEM_IDS[map.rarity], pid) < 1) {
    ctx.error(pid, 'You no longer hold that treasure map.');
    return;
  }
  ctx.removeItem(CARTOGRAPHERS_INK_ITEM_ID, inks, pid);
  ctx.removeItem(TREASURE_MAP_ITEM_IDS[map.rarity], 1, pid);
  ctx.addItem(TREASURE_MAP_ITEM_IDS[next], 1, pid);
  const site = TREASURE_SITES_BY_ID[map.siteId];
  meta.treasureMap = {
    rarity: next,
    siteId: map.siteId,
    seed: pickVaultSeed(ctx, next, site.zoneId),
  };
  meta.wireRev++;
  ctx.emit({ type: 'treasureMapUpgraded', rarity: next, inks, pid });
}
