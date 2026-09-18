// Treasure maps and vaults (src/sim/treasure_vault.ts) against a real Sim:
// reading a map marks a site and keeps the item, digging on the X spends it
// and opens a private vault portal, the vault scales to the head count, the
// boss pays every entrant the rarity's table, and a read map can be raised a
// rarity for faction currency.
import { describe, expect, it } from 'vitest';
import {
  TREASURE_MAP_ITEM_IDS,
  TREASURE_MAP_UPGRADE_COST,
  TREASURE_SITES_BY_ID,
  VAULT_PAYOUTS,
  vaultDamageFactor,
  vaultHealthFactor,
} from '../src/sim/content/treasure_maps';
import { awardFactionCurrency } from '../src/sim/factions';
import { RIFT_RANK_BASE_LEVEL, riftRankTuningFor } from '../src/sim/rift/ranks';
import { riftFloorCount } from '../src/sim/rift/rift_gen';
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
    expect(riftFloorCount(meta.treasureMap!.seed, RIFT_RANK_BASE_LEVEL.B)).toBe(3);
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
    expect(portal.templateId).toBe('rift_portal');
    expect(portal.vaultOwnerPid).toBe(sim.playerId);
    expect(portal.vaultRarity).toBe('epic');
    expect(portal.riftTier).toBe('A');
    expect(portal.riftSeed).toBe(map.seed);
    expect(portal.riftBaseLevel).toBe(RIFT_RANK_BASE_LEVEL.A);
    expect(portal.riftEventId).toBeUndefined();
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
    expect(inst.vault).toEqual({ rarity: 'common', ownerPid: sim.playerId, headCount: 1 });
    expect(inst.floorCount).toBe(3);
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
      inst.litPylons = new Set(inst.pylonIds);
      inst.puzzleSolved = true;
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
  });
});

describe('raising a map for faction currency', () => {
  it('swaps the item, charges the chosen faction and re-seeds the vault', () => {
    const sim = makeSim();
    const meta = metaOf(sim);
    sim.addItem(TREASURE_MAP_ITEM_IDS.common, 1);
    sim.useItem(TREASURE_MAP_ITEM_IDS.common);
    const siteId = meta.treasureMap!.siteId;
    awardFactionCurrency(meta, 'church_order', TREASURE_MAP_UPGRADE_COST.common + 5);
    sim.drainEvents();
    sim.upgradeTreasureMap('church_order');
    const evs = sim.drainEvents();
    expect(meta.treasureMap).toMatchObject({ rarity: 'rare', siteId });
    expect(sim.countItem(TREASURE_MAP_ITEM_IDS.common)).toBe(0);
    expect(sim.countItem(TREASURE_MAP_ITEM_IDS.rare)).toBe(1);
    expect(meta.factionCurrencies.church_order).toBe(5);
    expect(ofType(evs, 'treasureMapUpgraded')[0]).toMatchObject({
      rarity: 'rare',
      factionId: 'church_order',
      cost: TREASURE_MAP_UPGRADE_COST.common,
    });
  });

  it('refuses without a read map, without the currency, and at the top rarity', () => {
    const sim = makeSim();
    const meta = metaOf(sim);
    const errors = () => ofType(sim.drainEvents(), 'error').map((ev) => ev.text);
    sim.upgradeTreasureMap('rift_watch');
    expect(errors()).toEqual(['Read a treasure map first.']);
    sim.addItem(TREASURE_MAP_ITEM_IDS.legendary, 1);
    sim.useItem(TREASURE_MAP_ITEM_IDS.legendary);
    sim.drainEvents();
    sim.upgradeTreasureMap('rift_watch');
    expect(errors()).toEqual(['This map cannot be improved any further.']);
    meta.treasureMap = { ...meta.treasureMap!, rarity: 'rare' };
    sim.upgradeTreasureMap('rift_watch');
    expect(errors()).toEqual(['You do not have enough of that faction currency.']);
    expect(meta.treasureMap?.rarity).toBe('rare');
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
