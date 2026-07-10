// Unit coverage for the PBE account boost (PBE_BOOST_ACCOUNTS=1): the env
// gate, the random name generator, the non-heroic best-in-slot kit selection,
// the boosted level-20 character state builder, and the per-account
// orchestrator driven through injected fakes. The register-handler wire-in is
// a two-line gate on pbeBoostEnabled(); the gate itself is pinned here.

// server/db.ts constructs a pg Pool at module load and throws if DATABASE_URL
// is unset; pbe_boost.ts imports it for the real deps, so set a dummy URL.
// The pool never connects: every db-touching path in this file is faked.
process.env.DATABASE_URL ??= 'postgres://unused:unused@localhost:9/unused';

import { describe, expect, it } from 'vitest';
import { normalizeCharName, offensiveName } from '../../server/auth';
import {
  BOOST_BAG_SOCKETS,
  BOOST_CLASSES,
  BOOST_COPPER,
  BOOST_LEVEL,
  type BoostCreateResult,
  type BoostDeps,
  bestBoostBag,
  bisKitForRole,
  boostAccountCharacters,
  buildBoostedCharacterState,
  CLASS_ROLES,
  classItemScore,
  nonHeroicBisKit,
  pbeBoostEnabled,
  randomBoostName,
} from '../../server/pbe_boost';
import { HEROIC_ITEMS } from '../../src/sim/content/heroic_loot';
import { HEROIC_VENDOR_STOCK } from '../../src/sim/content/heroic_vendor';
import { ITEMS } from '../../src/sim/data';
import { canEquipItem, canEquipItemInSlot } from '../../src/sim/equipment_rules';
import { meetsLevelRequirement } from '../../src/sim/item_level_req';
import type { CharacterState } from '../../src/sim/sim';
import { Sim } from '../../src/sim/sim';
import { type EquipSlot, type PlayerClass, xpToReachLevel } from '../../src/sim/types';

// Deterministic stand-in for crypto.randomInt so name/skin tests are stable.
// Uses the HIGH bits of the LCG state: the low bits have tiny periods and
// would collapse the name variety this suite asserts on.
function lcg(seed: number): (maxExclusive: number) => number {
  let s = seed >>> 0;
  return (maxExclusive: number) => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return Math.floor((s / 2 ** 32) * maxExclusive);
  };
}

const HEROIC_VENDOR_IDS = new Set(HEROIC_VENDOR_STOCK.map((o) => o.itemId));
// The classic warrior shares the warrior's authored gear locks (see
// equipment_rules.ts gearCls); the test mirrors resolve the same way.
const gearClsOf = (cls: PlayerClass): PlayerClass => (cls === 'warrior_classic' ? 'warrior' : cls);

const ARMOR_SLOTS: EquipSlot[] = [
  'mainhand',
  'helmet',
  'shoulder',
  'chest',
  'waist',
  'legs',
  'gloves',
  'feet',
];

describe('pbeBoostEnabled (env gate)', () => {
  it('is on only for the literal "1"', () => {
    expect(pbeBoostEnabled({ PBE_BOOST_ACCOUNTS: '1' } as NodeJS.ProcessEnv)).toBe(true);
    expect(pbeBoostEnabled({ PBE_BOOST_ACCOUNTS: '0' } as NodeJS.ProcessEnv)).toBe(false);
    expect(pbeBoostEnabled({ PBE_BOOST_ACCOUNTS: '' } as NodeJS.ProcessEnv)).toBe(false);
    expect(pbeBoostEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(pbeBoostEnabled({ PBE_BOOST_ACCOUNTS: 'true' } as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe('randomBoostName', () => {
  it('always produces a valid, inoffensive character name', () => {
    const rand = lcg(7);
    for (let i = 0; i < 300; i++) {
      const name = randomBoostName(rand);
      expect(normalizeCharName(name), name).toBe(name);
      expect(offensiveName(name), name).toBe(false);
      expect(name.length).toBeGreaterThanOrEqual(2);
      expect(name.length).toBeLessThanOrEqual(16);
      expect(name[0]).toMatch(/[A-Z]/);
    }
  });

  it('draws different names across calls (retry after a collision works)', () => {
    const rand = lcg(11);
    const names = new Set(Array.from({ length: 50 }, () => randomBoostName(rand)));
    expect(names.size).toBeGreaterThan(40);
  });
});

describe('nonHeroicBisKit', () => {
  it('covers every armor and weapon slot for every class with eligible non-heroic items', () => {
    for (const cls of BOOST_CLASSES) {
      const kit = nonHeroicBisKit(cls);
      for (const slot of ARMOR_SLOTS) {
        expect(kit[slot], `${cls} ${slot}`).toBeTruthy();
      }
      for (const [slot, itemId] of Object.entries(kit) as [EquipSlot, string][]) {
        const item = ITEMS[itemId];
        expect(item, `${cls} ${slot} ${itemId}`).toBeDefined();
        expect(item.heroic ?? false, `${cls} ${slot} ${itemId} heroic`).toBe(false);
        expect(item.heroicOf, `${cls} ${slot} ${itemId} heroicOf`).toBeUndefined();
        expect(itemId in HEROIC_ITEMS, `${cls} ${slot} ${itemId} bespoke heroic`).toBe(false);
        expect(HEROIC_VENDOR_IDS.has(itemId), `${cls} ${slot} ${itemId} vendor`).toBe(false);
        expect(canEquipItem(cls, item), `${cls} ${slot} ${itemId} canEquip`).toBe(true);
        if (item.requiredClass)
          expect(item.requiredClass, `${cls} ${slot}`).toContain(gearClsOf(cls));
        expect(meetsLevelRequirement(BOOST_LEVEL, item), `${cls} ${slot} level`).toBe(true);
      }
    }
  });

  it('fills jewelry slots whenever a non-heroic candidate exists at all', () => {
    const anyJewelry = Object.values(ITEMS).some(
      (i) =>
        (i.slot === 'neck' || i.slot === 'ring') &&
        !i.heroic &&
        !i.heroicOf &&
        !(i.id in HEROIC_ITEMS) &&
        !HEROIC_VENDOR_IDS.has(i.id),
    );
    const kit = nonHeroicBisKit('warrior');
    if (anyJewelry) {
      expect(kit.neck || kit.ring1, 'expected some jewelry pick').toBeTruthy();
    }
    if (kit.ring1 && kit.ring2) expect(kit.ring1).not.toBe(kit.ring2);
  });

  it('picks the argmax of classItemScore per slot (chest, every class)', () => {
    for (const cls of BOOST_CLASSES) {
      const kit = nonHeroicBisKit(cls);
      const candidates = Object.values(ITEMS).filter(
        (i) =>
          i.slot === 'chest' &&
          i.kind === 'armor' &&
          !i.heroic &&
          !i.heroicOf &&
          !(i.id in HEROIC_ITEMS) &&
          !HEROIC_VENDOR_IDS.has(i.id) &&
          canEquipItem(cls, i) &&
          (!i.requiredClass || i.requiredClass.includes(gearClsOf(cls))) &&
          meetsLevelRequirement(BOOST_LEVEL, i),
      );
      const best = Math.max(...candidates.map((i) => classItemScore(cls, i)));
      expect(classItemScore(cls, ITEMS[kit.chest as string]), `${cls} chest`).toBe(best);
    }
  });

  it('equips a real weapon in the mainhand for every class', () => {
    for (const cls of BOOST_CLASSES) {
      const kit = nonHeroicBisKit(cls);
      const weapon = ITEMS[kit.mainhand as string];
      expect(weapon?.kind, `${cls} mainhand`).toBe('weapon');
      expect(weapon?.weapon, `${cls} mainhand dps`).toBeDefined();
    }
  });

  it('fills the offhand legally: never beside a two-hander, always slot-equippable', () => {
    for (const cls of BOOST_CLASSES) {
      const kit = nonHeroicBisKit(cls);
      if (!kit.offhand) continue;
      const main = ITEMS[kit.mainhand as string];
      expect(main.kind === 'weapon' && main.hand === 'twohand', `${cls} 2H+offhand`).toBe(false);
      const off = ITEMS[kit.offhand];
      expect(canEquipItemInSlot(cls, off, 'offhand', null), `${cls} offhand ${off.id}`).toBe(true);
      expect(kit.offhand).not.toBe(kit.mainhand);
    }
    // Concrete pins for today's content: the shield classes raise the
    // Wallshield (including the elemental shaman), the rogue dual-wields a
    // second real weapon, and cloth casters (no shield, no held offhand
    // content yet, no dual wield) keep both hands on the staff.
    expect(nonHeroicBisKit('warrior').offhand).toBe('highwatch_wallshield');
    expect(nonHeroicBisKit('paladin').offhand).toBe('highwatch_wallshield');
    expect(nonHeroicBisKit('shaman').offhand).toBe('highwatch_wallshield');
    const rogue = nonHeroicBisKit('rogue');
    expect(ITEMS[rogue.offhand as string]?.kind).toBe('weapon');
  });
});

describe('buildBoostedCharacterState', () => {
  it('builds an internally consistent level-20 character wearing the kit', () => {
    const kit = nonHeroicBisKit('warrior');
    const state = buildBoostedCharacterState('warrior', 'Pbetestwar', 3);
    expect(state.level).toBe(BOOST_LEVEL);
    expect(state.lifetimeXp).toBeGreaterThanOrEqual(xpToReachLevel(BOOST_LEVEL));
    expect(state.skin).toBe(3);
    for (const [slot, itemId] of Object.entries(kit)) {
      expect(state.equipment[slot as EquipSlot], `equipped ${slot}`).toBe(itemId);
    }
  });

  it('round-trips through a fresh Sim load (the server login path shape)', () => {
    const state = buildBoostedCharacterState('mage', 'Pbetestmage', 1);
    const revived = JSON.parse(JSON.stringify(state)) as CharacterState;
    const sim = new Sim({ seed: 99, playerClass: 'mage', playerName: 'unused', noPlayer: true });
    const pid = sim.addPlayer('mage', 'Pbetestmage', { state: revived });
    const reloaded = sim.serializeCharacter(pid);
    expect(reloaded?.level).toBe(BOOST_LEVEL);
    expect(reloaded?.equipment).toEqual(state.equipment);
  });
});

describe('bags, gold, and alternate role kits', () => {
  it('equips the best non-heroic bag in every bag socket', () => {
    const bagId = bestBoostBag();
    expect(bagId).toBe('mistcallers_duffel');
    const bags = Object.values(ITEMS).filter(
      (i) =>
        i.kind === 'bag' &&
        !i.heroic &&
        !i.heroicOf &&
        !(i.id in HEROIC_ITEMS) &&
        !HEROIC_VENDOR_IDS.has(i.id),
    );
    const maxSlots = Math.max(...bags.map((b) => b.bagSlots ?? 0));
    expect(ITEMS[bagId].bagSlots).toBe(maxSlots);
    const state = buildBoostedCharacterState('warrior', 'Pbetestbags', 0);
    expect(state.bags).toEqual(Array(BOOST_BAG_SOCKETS).fill(bagId));
  });

  it('grants exactly 10 gold of pocket money (fresh characters start at zero)', () => {
    expect(BOOST_COPPER).toBe(100000);
    const state = buildBoostedCharacterState('rogue', 'Pbetestgold', 0);
    expect(state.copper).toBe(BOOST_COPPER);
  });

  it('exactly the hybrid classes define an alternate role', () => {
    const hybrids = BOOST_CLASSES.filter((c) => CLASS_ROLES[c].length > 1);
    expect([...hybrids].sort()).toEqual(['druid', 'paladin', 'shaman']);
    for (const cls of BOOST_CLASSES) {
      expect(CLASS_ROLES[cls].length, cls).toBeGreaterThanOrEqual(1);
      expect(CLASS_ROLES[cls].length, cls).toBeLessThanOrEqual(2);
    }
  });

  it('hybrid classes carry their full alternate-role kit in the bags, without duplicates', () => {
    for (const cls of BOOST_CLASSES.filter((c) => CLASS_ROLES[c].length > 1)) {
      const state = buildBoostedCharacterState(cls, 'Pbetesthyb', 0);
      const equipped = new Set(Object.values(state.equipment));
      const carried = state.inventory.map((s) => s.itemId);
      const carriedSet = new Set(carried);
      let distinctAltPieces = 0;
      for (const role of CLASS_ROLES[cls].slice(1)) {
        const altKit = bisKitForRole(cls, role);
        for (const itemId of Object.values(altKit)) {
          if (!itemId) continue;
          expect(canEquipItem(cls, ITEMS[itemId]), `${cls} ${role.id} ${itemId} canEquip`).toBe(
            true,
          );
          if (equipped.has(itemId)) continue;
          distinctAltPieces++;
          expect(carriedSet.has(itemId), `${cls} ${role.id} ${itemId}`).toBe(true);
        }
      }
      // The alternate role must actually add SOMETHING (at minimum its weapon);
      // otherwise a regression that stops bagging alt kits passes silently.
      expect(distinctAltPieces, `${cls} distinct alt pieces`).toBeGreaterThanOrEqual(1);
      // Dedupe: nothing the character wears rides in the bags as a copy, and
      // no alt piece was added twice.
      for (const id of equipped) {
        if (id) expect(carriedSet.has(id), `${cls} equipped ${id} duplicated in bags`).toBe(false);
      }
      expect(carried.length, `${cls} inventory has stack-level duplicates`).toBe(carriedSet.size);
    }
  });

  it('the shaman spawns in caster gear and carries a distinct melee weapon', () => {
    const state = buildBoostedCharacterState('shaman', 'Pbetestsham', 0);
    const equippedMain = ITEMS[state.equipment.mainhand as string];
    expect(equippedMain.stats?.int ?? 0, 'equipped weapon is caster gear').toBeGreaterThan(0);
    const enhancement = CLASS_ROLES.shaman[1];
    expect(enhancement.id).toBe('enhancement');
    const altMain = bisKitForRole('shaman', enhancement).mainhand as string;
    expect(altMain).not.toBe(equippedMain.id);
    const altDef = ITEMS[altMain];
    expect((altDef.stats?.agi ?? 0) + (altDef.stats?.str ?? 0), 'melee stats').toBeGreaterThan(0);
    expect(state.inventory.some((s) => s.itemId === altMain)).toBe(true);
  });
});

describe('boostAccountCharacters', () => {
  function fakes() {
    const created: { name: string; cls: PlayerClass; state: CharacterState }[] = [];
    const saved: { id: number; level: number }[] = [];
    let nextId = 100;
    const deps: BoostDeps = {
      createCharacter: async (
        _accountId: number,
        name: string,
        cls: PlayerClass,
        state: CharacterState,
      ): Promise<BoostCreateResult> => {
        created.push({ name, cls, state });
        return { id: nextId++ };
      },
      saveState: async (id: number, level: number) => {
        saved.push({ id, level });
      },
      rand: lcg(23),
    };
    return { created, saved, deps };
  }

  it('creates one level-20 character per class with distinct valid names', async () => {
    const { created, saved, deps } = fakes();
    const count = await boostAccountCharacters(42, deps);
    expect(count).toBe(BOOST_CLASSES.length);
    expect(created.map((c) => c.cls).sort()).toEqual([...BOOST_CLASSES].sort());
    const names = new Set(created.map((c) => c.name));
    expect(names.size).toBe(BOOST_CLASSES.length);
    for (const c of created) {
      expect(normalizeCharName(c.name)).toBe(c.name);
      expect(c.state.level).toBe(BOOST_LEVEL);
    }
    expect(saved).toHaveLength(BOOST_CLASSES.length);
    for (const s of saved) expect(s.level).toBe(BOOST_LEVEL);
  });

  it('retries with a different name when the first is taken', async () => {
    const { created, deps } = fakes();
    const tried: string[] = [];
    const inner = deps.createCharacter;
    let rejectedOnce = false;
    deps.createCharacter = async (accountId, name, cls, state) => {
      tried.push(name);
      if (!rejectedOnce) {
        rejectedOnce = true;
        return 'name_taken';
      }
      return inner(accountId, name, cls, state);
    };
    const count = await boostAccountCharacters(42, deps);
    expect(count).toBe(BOOST_CLASSES.length);
    expect(tried.length).toBe(BOOST_CLASSES.length + 1);
    expect(tried[0]).not.toBe(tried[1]);
    expect(created).toHaveLength(BOOST_CLASSES.length);
  });

  it('a failure on one class never blocks the rest', async () => {
    const { created, deps } = fakes();
    const inner = deps.createCharacter;
    deps.createCharacter = async (accountId, name, cls, state) => {
      if (cls === 'priest') throw new Error('boom');
      return inner(accountId, name, cls, state);
    };
    const count = await boostAccountCharacters(42, deps);
    expect(count).toBe(BOOST_CLASSES.length - 1);
    expect(created.some((c) => c.cls === 'priest')).toBe(false);
    expect(created).toHaveLength(BOOST_CLASSES.length - 1);
  });

  it('stops burning names after the retry budget (account at cap)', async () => {
    const { deps } = fakes();
    deps.createCharacter = async () => 'name_taken';
    const count = await boostAccountCharacters(42, deps);
    expect(count).toBe(0);
  });
});
