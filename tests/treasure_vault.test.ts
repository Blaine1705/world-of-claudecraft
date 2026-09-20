// Treasure maps and vaults (src/sim/treasure_vault.ts) against a real Sim:
// reading a map marks a site and keeps the item, digging on the X spends it
// and opens a private vault portal, the vault scales to the head count, the
// boss pays every entrant the rarity's table, and a read map can be raised a
// rarity for faction currency.
import { describe, expect, it } from 'vitest';
import { FACTION_VENDOR_GATES } from '../src/sim/content/faction_vendors';
import {
  CARTOGRAPHERS_INK_CURRENCY_COST,
  CARTOGRAPHERS_INK_ITEM_ID,
  TREASURE_MAP_ITEM_IDS,
  TREASURE_MAP_UPGRADE_INKS,
  TREASURE_SITES_BY_ID,
  VAULT_PAYOUTS,
  vaultDamageFactor,
  vaultHealthFactor,
} from '../src/sim/content/treasure_maps';
import { isRiftPos } from '../src/sim/data';
import { openHoardRewardChest } from '../src/sim/rift/hoard_reward_chest';
import { RIFT_RANK_BASE_LEVEL, riftRankTuningFor } from '../src/sim/rift/ranks';
import { riftFloorCount } from '../src/sim/rift/rift_gen';
import { vaultSeedOpen, vaultSeedTier, vaultSeedZone } from '../src/sim/rift/vault_seed';
import { Sim } from '../src/sim/sim';
import { vaultScaledTuning } from '../src/sim/treasure_vault';
import type { SimEvent } from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';

function makeSim(seed = 4242): Sim {
  const sim = new Sim({ seed, playerClass: 'warrior', autoEquip: false, devCommands: true });
  sim.chat('/dev level 20', sim.player.id);
  sim.drainEvents();
  return sim;
}

const metaOf = (sim: Sim) => sim.players.get(sim.playerId)!;

function ofType<T extends SimEvent['type']>(evs: readonly SimEvent[], type: T) {
  return evs.filter((ev): ev is Extract<SimEvent, { type: T }> => ev.type === type);
}

function placeAt(sim: Sim, x: number, z: number): void {
  sim.player.pos = { x, y: terrainHeight(x, z, sim.cfg.seed), z };
}

function readAndDig(sim: Sim, rarity: 'common' | 'rare' | 'epic' | 'legendary') {
  const itemId = TREASURE_MAP_ITEM_IDS[rarity];
  sim.addItem(itemId, 1);
  sim.useItem(itemId);
  const map = metaOf(sim).treasureMap!;
  const site = TREASURE_SITES_BY_ID[map.siteId];
  placeAt(sim, site.x + 2, site.z - 2);
  sim.drainEvents();
  sim.useItem(itemId);
  return { map, site, evs: sim.drainEvents() };
}

describe('reading a treasure map', () => {
  it('marks a site, fixes a short vault seed, keeps the item and tells the client', () => {
    const sim = makeSim();
    const meta = metaOf(sim);
    sim.addItem(TREASURE_MAP_ITEM_IDS.rare, 1);
    sim.drainEvents();
    const rev = meta.wireRev;
    sim.useItem(TREASURE_MAP_ITEM_IDS.rare);
    const evs = sim.drainEvents();
    expect(meta.treasureMap?.rarity).toBe('rare');
    expect(TREASURE_SITES_BY_ID[meta.treasureMap!.siteId]).toBeDefined();
    // One room with the boss at the end, sized by the rarity (tier 1 = rare).
    expect(riftFloorCount(meta.treasureMap!.seed, RIFT_RANK_BASE_LEVEL.B)).toBe(1);
    expect(vaultSeedTier(meta.treasureMap!.seed)).toBe(1);
    expect(vaultSeedOpen(meta.treasureMap!.seed)).toBe(false);
    expect(vaultSeedZone(meta.treasureMap!.seed)).toBe(
      TREASURE_SITES_BY_ID[meta.treasureMap!.siteId].zoneId,
    );
    expect(sim.countItem(TREASURE_MAP_ITEM_IDS.rare)).toBe(1);
    expect(meta.wireRev).toBeGreaterThan(rev);
    expect(sim.treasureMap).toEqual(meta.treasureMap);
    expect(ofType(evs, 'treasureMapRead')[0]).toMatchObject({ rarity: 'rare', fresh: true });
  });

  it('off the X a second use re-shows the map; another rarity is refused', () => {
    const sim = makeSim();
    sim.addItem(TREASURE_MAP_ITEM_IDS.common, 1);
    sim.addItem(TREASURE_MAP_ITEM_IDS.epic, 1);
    sim.useItem(TREASURE_MAP_ITEM_IDS.common);
    sim.drainEvents();
    sim.useItem(TREASURE_MAP_ITEM_IDS.common);
    let evs = sim.drainEvents();
    expect(ofType(evs, 'treasureMapRead')[0]).toMatchObject({ rarity: 'common', fresh: false });
    expect(sim.countItem(TREASURE_MAP_ITEM_IDS.common)).toBe(1);
    sim.useItem(TREASURE_MAP_ITEM_IDS.epic);
    evs = sim.drainEvents();
    expect(ofType(evs, 'error').map((ev) => ev.text)).toEqual([
      'You are already following another treasure map.',
    ]);
    expect(metaOf(sim).treasureMap?.rarity).toBe('common');
  });
});

describe('digging on the X', () => {
  it('spends the map and opens a private vault portal at the rarity rank', () => {
    const sim = makeSim();
    const { map, evs } = readAndDig(sim, 'epic');
    expect(sim.countItem(TREASURE_MAP_ITEM_IDS.epic)).toBe(0);
    expect(metaOf(sim).treasureMap).toBeNull();
    expect(ofType(evs, 'treasureVaultOpened')[0]).toMatchObject({ rarity: 'epic' });
    const portal = [...sim.entities.values()].find((e) => e.vaultOwnerPid !== undefined)!;
    // Its own template: a dug-open way down, never a rift tear.
    expect(portal.templateId).toBe('hoard_entrance');
    expect(portal.vaultOwnerPid).toBe(sim.playerId);
    expect(portal.vaultRarity).toBe('epic');
    expect(portal.riftTier).toBe('A');
    expect(portal.riftSeed).toBe(map.seed);
    expect(portal.riftBaseLevel).toBe(RIFT_RANK_BASE_LEVEL.A);
    expect(portal.riftEventId).toBeUndefined();
    expect(ofType(evs, 'spellfxAt')).toContainEqual({
      type: 'spellfxAt',
      x: portal.pos.x,
      z: portal.pos.z,
      school: 'physical',
      fx: 'hoardDig',
      sfxKey: 'hoard_entrance_open',
    });
  });

  it('an unentered portal closes after its lifetime', () => {
    const sim = makeSim();
    readAndDig(sim, 'common');
    const portal = [...sim.entities.values()].find((e) => e.vaultOwnerPid !== undefined)!;
    portal.vaultExpiresAt = sim.time + 1;
    // Step clear of the walk-in trigger so nobody enters.
    placeAt(sim, sim.player.pos.x + 60, sim.player.pos.z);
    for (let i = 0; i < 80; i++) sim.tick();
    expect(sim.entities.has(portal.id)).toBe(false);
  });
});

describe('the vault run', () => {
  function enterVault(sim: Sim) {
    const portal = [...sim.entities.values()].find((e) => e.vaultOwnerPid !== undefined)!;
    sim.enterRift(
      portal.riftSeed!,
      portal.riftBaseLevel!,
      sim.playerId,
      undefined,
      portal as never,
    );
    return sim.riftInstances.find((i) => i.partyKey !== null)!;
  }

  it('flags the run, scales the mobs for a solo reader and pays the table on the boss kill', () => {
    const sim = makeSim();
    readAndDig(sim, 'common');
    const inst = enterVault(sim);
    expect(inst.vault).toEqual({
      rarity: 'common',
      ownerPid: sim.playerId,
      headCount: 1,
      level: sim.player.level,
    });
    expect(inst.floorCount).toBe(1);
    // A straight fight: no puzzle pieces, gate or bonus cache on the floor.
    expect(inst.pylonIds).toEqual([]);
    expect(inst.boulderIds).toEqual([]);
    expect(inst.gateOpen).toBe(true);
    expect(inst.beaconId).not.toBeNull();
    if (inst.beaconId === null) throw new Error('missing Hoard return entrance id');
    const beaconId = inst.beaconId;
    expect(sim.entities.get(beaconId)?.templateId).toBe('hoard_entrance');
    expect(sim.entities.get(beaconId)?.vaultRarity).toBe('common');
    expect(inst.objectIds.some((id) => sim.entities.get(id)?.templateId === 'rift_beacon')).toBe(
      false,
    );
    expect(inst.objectIds.some((id) => sim.entities.get(id)?.templateId === 'rift_treasure')).toBe(
      false,
    );
    const base = riftRankTuningFor(inst.baseLevel);
    const scaled = vaultScaledTuning(base, inst.vault);
    expect(scaled.healthMultiplier).toBeCloseTo(base.healthMultiplier * vaultHealthFactor(1));
    expect(scaled.bossDamageMultiplier).toBeCloseTo(
      base.bossDamageMultiplier * vaultDamageFactor(1),
    );
    expect(vaultHealthFactor(5)).toBeCloseTo(1);
    expect(vaultDamageFactor(5)).toBeCloseTo(1);
    expect(vaultScaledTuning(base, null)).toBe(base);

    // Walk the floors down to the boss, then drop it.
    for (let guard = 0; guard < 10 && inst.floorIndex < inst.floorCount - 1; guard++) {
      for (const id of inst.mobIds) {
        if (id === inst.bossId) continue;
        const e = sim.entities.get(id);
        if (e) {
          e.hp = 0;
          e.dead = true;
        }
      }
      // No puzzle is forced here: a vault floor opens on the kills alone.
      for (let i = 0; i < 21; i++) {
        sim.player.hp = sim.player.maxHp;
        sim.tick();
      }
      if (inst.descentId === null) break;
      sim.player.pos = { ...sim.entities.get(inst.descentId)!.pos };
      sim.player.hp = sim.player.maxHp;
      sim.tick();
    }
    const meta = metaOf(sim);
    const copperBefore = meta.copper;
    sim.drainEvents();
    for (const id of inst.mobIds) {
      const e = sim.entities.get(id);
      if (e) {
        e.hp = 0;
        e.dead = true;
      }
    }
    const evs: SimEvent[] = [];
    for (let i = 0; i < 45; i++) {
      sim.player.hp = sim.player.maxHp;
      evs.push(...sim.tick());
    }
    // The kill no longer pays by itself: it leaves a chest, and opening it pays.
    expect(ofType(evs, 'treasureVaultLooted')).toHaveLength(0);
    const chestId = inst.vault?.chest?.entityId;
    const chest = chestId === undefined ? undefined : sim.entities.get(chestId);
    if (!chest) throw new Error('missing hoard reward chest');
    sim.player.pos = { ...chest.pos, x: chest.pos.x + 1.5 };
    openHoardRewardChest(sim.ctx, chest.id, sim.player.id);
    evs.push(...sim.drainEvents());
    const looted = ofType(evs, 'treasureVaultLooted');
    expect(looted).toHaveLength(1);
    expect(looted[0].capped).toBe(false);
    expect(looted[0].rarity).toBe('common');
    expect(meta.copper).toBeGreaterThan(copperBefore);
    expect(sim.countItem(looted[0].itemIds![0])).toBeGreaterThanOrEqual(
      VAULT_PAYOUTS.common.materials,
    );
    expect(meta.clueCasketsOpened).toBe(1);
    expect(inst.rewarded).toBe(true);
    expect(inst.exitId).toBe(inst.beaconId);
    if (inst.exitId === null) throw new Error('missing completed Hoard exit id');
    expect(sim.entities.get(inst.exitId)?.templateId).toBe('hoard_entrance');
    expect([...sim.entities.values()].some((entity) => entity.templateId === 'rift_exit')).toBe(
      false,
    );
    expect(ofType(evs, 'log')).toContainEqual(
      expect.objectContaining({
        text: 'The hoard is yours. Return to the entrance to climb out.',
      }),
    );
    const entrance = sim.entities.get(beaconId);
    if (!entrance) throw new Error('missing Hoard return entrance');
    sim.player.pos = { ...entrance.pos };
    sim.player.prevPos = { ...entrance.pos };
    const exitEvents = sim.tick();
    expect(isRiftPos(sim.player.pos.x)).toBe(false);
    expect(ofType(exitEvents, 'log')).toContainEqual(
      expect.objectContaining({ text: 'You climb back out through the hoard entrance.' }),
    );
  });
});

describe("redrawing a map with Cartographer's Ink", () => {
  it('spends the inks, swaps the item and re-seeds the vault', () => {
    const sim = makeSim();
    const meta = metaOf(sim);
    sim.addItem(TREASURE_MAP_ITEM_IDS.rare, 1);
    sim.useItem(TREASURE_MAP_ITEM_IDS.rare);
    const siteId = meta.treasureMap!.siteId;
    sim.addItem(CARTOGRAPHERS_INK_ITEM_ID, TREASURE_MAP_UPGRADE_INKS.rare + 1);
    sim.drainEvents();
    sim.useItem(CARTOGRAPHERS_INK_ITEM_ID);
    const evs = sim.drainEvents();
    expect(meta.treasureMap).toMatchObject({ rarity: 'epic', siteId });
    expect(vaultSeedOpen(meta.treasureMap!.seed)).toBe(true);
    expect(vaultSeedZone(meta.treasureMap!.seed)).toBe(TREASURE_SITES_BY_ID[siteId].zoneId);
    expect(sim.countItem(TREASURE_MAP_ITEM_IDS.rare)).toBe(0);
    expect(sim.countItem(TREASURE_MAP_ITEM_IDS.epic)).toBe(1);
    expect(sim.countItem(CARTOGRAPHERS_INK_ITEM_ID)).toBe(1);
    expect(ofType(evs, 'treasureMapUpgraded')[0]).toMatchObject({
      rarity: 'epic',
      inks: TREASURE_MAP_UPGRADE_INKS.rare,
    });
  });

  it('refuses without a read map, without enough ink, and at the top rarity', () => {
    const sim = makeSim();
    const meta = metaOf(sim);
    const errors = () => ofType(sim.drainEvents(), 'error').map((ev) => ev.text);
    sim.addItem(CARTOGRAPHERS_INK_ITEM_ID, 2);
    sim.drainEvents();
    sim.useItem(CARTOGRAPHERS_INK_ITEM_ID);
    expect(errors()).toEqual(['Read the treasure map you want to redraw first.']);
    sim.addItem(TREASURE_MAP_ITEM_IDS.legendary, 1);
    sim.useItem(TREASURE_MAP_ITEM_IDS.legendary);
    sim.drainEvents();
    sim.useItem(CARTOGRAPHERS_INK_ITEM_ID);
    expect(errors()).toEqual(['This map cannot be improved any further.']);
    meta.treasureMap = { ...meta.treasureMap!, rarity: 'rare' };
    sim.useItem(CARTOGRAPHERS_INK_ITEM_ID);
    expect(errors()).toEqual(["Redrawing this map takes 3 Cartographer's Ink."]);
    expect(meta.treasureMap?.rarity).toBe('rare');
    expect(sim.countItem(CARTOGRAPHERS_INK_ITEM_ID)).toBe(2);
  });

  it('every faction quartermaster stocks the ink for their own currency', () => {
    expect(FACTION_VENDOR_GATES.cartographers_ink).toMatchObject({
      standingTier: 'recognized',
      currencyCost: CARTOGRAPHERS_INK_CURRENCY_COST,
    });
    expect(FACTION_VENDOR_GATES.cartographers_ink.factionId).toBeUndefined();
  });
});

describe('the character save', () => {
  it('round-trips a read map and drops junk', () => {
    const sim = makeSim();
    sim.addItem(TREASURE_MAP_ITEM_IDS.rare, 1);
    sim.useItem(TREASURE_MAP_ITEM_IDS.rare);
    const state = sim.serializeCharacter(sim.playerId);
    if (!state) throw new Error('Missing serialized character');
    expect(state.worldQuests?.treasureMap).toEqual(metaOf(sim).treasureMap);

    const restored = new Sim({ seed: 9, playerClass: 'warrior', noPlayer: true });
    const pid = restored.addPlayer('warrior', 'Digger', { state });
    expect(restored.meta(pid)?.treasureMap).toEqual(metaOf(sim).treasureMap);

    const hostile = new Sim({ seed: 9, playerClass: 'warrior', noPlayer: true });
    const junk = {
      ...state,
      worldQuests: {
        ...state.worldQuests,
        treasureMap: { rarity: 'mythic', siteId: 'nowhere', seed: 1 },
      },
    };
    const hostilePid = hostile.addPlayer('warrior', 'Junk', { state: junk as never });
    expect(hostile.meta(hostilePid)?.treasureMap).toBeNull();
  });
});

describe('the level 16 bracket', () => {
  it('a level 16 owner enters, and the hoard mobs never outlevel them', () => {
    const sim = new Sim({
      seed: 4242,
      playerClass: 'warrior',
      autoEquip: false,
      devCommands: true,
    });
    sim.chat('/dev level 16', sim.player.id);
    sim.drainEvents();
    readAndDig(sim, 'legendary');
    const portal = [...sim.entities.values()].find((e) => e.vaultOwnerPid !== undefined)!;
    sim.player.pos = { ...portal.pos };
    for (let i = 0; i < 3; i++) sim.tick();
    const inst = sim.riftInstances.find((i) => i.partyKey !== null)!;
    expect(inst).toBeDefined();
    expect(inst.vault?.level).toBe(16);
    const mobs = inst.mobIds.map((id) => sim.entities.get(id)!).filter(Boolean);
    expect(mobs.length).toBeGreaterThan(10);
    for (const mob of mobs) expect(mob.level).toBeLessThanOrEqual(16);
  });
});
