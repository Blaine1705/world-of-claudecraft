// Direct hoard playtests, behind the same dev gate as /dev map: a themed boss
// room at any map rarity, without reading and digging a map for it.
import {
  isTreasureMapRarity,
  TREASURE_MAP_RARITIES,
  TREASURE_SITES,
  type TreasureMapRarity,
} from '../content/treasure_maps';
import { createGroundObject } from '../entity';
import { RIFT_RANK_BASE_LEVEL } from '../rift/ranks';
import { generateRiftPlan } from '../rift/rift_gen';
import {
  HOARD_ENTRANCE_TEMPLATE_ID,
  makeVaultSeed,
  type VaultSizeTier,
  type VaultZoneId,
} from '../rift/vault_seed';
import type { SimContext } from '../sim_context';
import type { RiftTier } from '../types';

export const DEV_HOARD_DESTINATIONS = [
  { boss: 'frost', alias: 'warden', zone: 'frostveil', theme: 'frost' },
  { boss: 'ember', alias: 'tyrant', zone: 'drakelands', theme: 'ember' },
  { boss: 'spider', alias: 'venom', zone: 'willowfen', theme: 'venom' },
  { boss: 'skeleton', alias: 'necro', zone: 'wraithwood', theme: 'bone' },
  { boss: 'grask', alias: 'brute', zone: 'amberfall', theme: 'brute' },
  { boss: 'nyxaris', alias: 'arcane', zone: 'nightbloom', theme: 'void' },
  { boss: 'vharok', alias: 'storm', zone: 'galecrest', theme: 'storm' },
  { boss: 'maw', alias: 'tide', zone: 'palmreach', theme: 'tide' },
] as const satisfies readonly { boss: string; alias: string; zone: VaultZoneId; theme: string }[];

/** The rank (and with it the room size) each map rarity opens, the same table
 *  treasure_maps.ts uses for a real map. */
const RARITY_TIER: Readonly<Record<TreasureMapRarity, RiftTier>> = {
  common: 'C',
  rare: 'B',
  epic: 'A',
  legendary: 'S',
};

/** Bounded seed search uses the production generator, without touching the live
 *  RNG. The seed's size tier and the plan's rank both follow the rarity, so the
 *  room is the one that rarity of map would dig up. */
export function devHoardDestination(query: string, rarity: TreasureMapRarity = 'legendary') {
  const key = query.trim().toLowerCase();
  const destination = DEV_HOARD_DESTINATIONS.find(
    (d, i) => key === d.boss || key === d.alias || key === d.zone || key === String(i + 1),
  );
  if (!destination) return null;
  const tier = RARITY_TIER[rarity];
  const size = TREASURE_MAP_RARITIES.indexOf(rarity) as VaultSizeTier;
  for (let random = 0; random < 4096; random++) {
    const seed = makeVaultSeed(size, random, { open: true, zoneId: destination.zone });
    if (generateRiftPlan(seed, RIFT_RANK_BASE_LEVEL[tier]).themeId === destination.theme) {
      return { ...destination, seed, rarity, tier };
    }
  }
  return null;
}

export function handleDevHoardTravel(
  ctx: SimContext,
  pid: number,
  query: string,
  rarityArg = '',
): void {
  if (!ctx.devCommands) return;
  const player = ctx.entities.get(pid);
  if (!player || !ctx.players.has(pid)) return;
  const rarity = rarityArg.trim().toLowerCase();
  if (rarity && !isTreasureMapRarity(rarity)) {
    ctx.emit({
      type: 'log',
      pid,
      text: '[dev] /dev hoard <boss|zone|1-8> [common|rare|epic|legendary].',
    });
    return;
  }
  const destination = devHoardDestination(
    query,
    isTreasureMapRarity(rarity) ? rarity : 'legendary',
  );
  if (!destination) {
    ctx.emit({
      type: 'log',
      pid,
      text: '[dev] /dev hoard <boss|zone|1-8> [common|rare|epic|legendary]. Destinations:',
    });
    for (const [index, d] of DEV_HOARD_DESTINATIONS.entries()) {
      ctx.emit({ type: 'log', pid, text: `[dev] ${index + 1}: ${d.boss} (${d.alias}), ${d.zone}` });
    }
    return;
  }
  if (player.dead) {
    ctx.emit({ type: 'log', pid, text: '[dev] Use /dev revive before travelling.' });
    return;
  }
  const site = TREASURE_SITES.find((s) => s.zoneId === destination.zone);
  if (!site) return;
  ctx.leaveRift(pid);
  if (player.level < 20) ctx.setPlayerLevel(20, pid);
  // A descriptor-only entrance selects real vault scaling and ownership. It is
  // not attached to the world, so repeated testing never leaves orphan hatches.
  const portal = createGroundObject(-1, '', '', ctx.groundPos(site.x, site.z));
  portal.templateId = HOARD_ENTRANCE_TEMPLATE_ID;
  portal.vaultOwnerPid = pid;
  portal.vaultRarity = destination.rarity;
  ctx.enterRift(destination.seed, RIFT_RANK_BASE_LEVEL[destination.tier], pid, site, portal);
}
