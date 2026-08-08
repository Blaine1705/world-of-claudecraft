import { describe, expect, it } from 'vitest';
import { stackSizeOf } from '../src/sim/bags';
// Aliased: this file declares a small synthetic table for the ladder arms; the
// real merged catalog drives the whole-catalog and grade-family arms.
import { ITEMS as REAL_ITEMS } from '../src/sim/data';
import { layoutBagCells } from '../src/sim/inventory_order';
import {
  compareBagStacks,
  consolidateBagStacks,
  sortInventoryStacks,
} from '../src/sim/inventory_sort';
import { Sim } from '../src/sim/sim';
import type { InvSlot, ItemDef } from '../src/sim/types';

// Synthetic defs for the ladder arms; the material-grade family arms use REAL
// grade-table ids (elderwood_log / fine_elderwood_log / copper_ore /
// fine_copper_ore) because baseMaterialFor answers from the real
// MATERIAL_GRADES rows, while their defs here stay synthetic so no live
// balance value is load-bearing.
const ITEMS: Record<string, ItemDef> = {
  blade: { id: 'blade', name: 'Redbrook Blade', kind: 'weapon', slot: 'mainhand', quality: 'rare' },
  epic_blade: {
    id: 'epic_blade',
    name: 'Duskrender',
    kind: 'weapon',
    slot: 'mainhand',
    quality: 'epic',
  },
  helm: { id: 'helm', name: 'Iron Helm', kind: 'armor', slot: 'helmet', quality: 'uncommon' },
  chest: { id: 'chest', name: 'Iron Cuirass', kind: 'armor', slot: 'chest', quality: 'uncommon' },
  epic_boots: {
    id: 'epic_boots',
    name: 'Stormstriders',
    kind: 'armor',
    slot: 'feet',
    quality: 'epic',
  },
  band: { id: 'band', name: 'Copper Band', kind: 'armor', slot: 'ring', quality: 'uncommon' },
  tome: { id: 'tome', name: 'Warding Tome', kind: 'held_offhand', quality: 'rare' },
  pouch: { id: 'pouch', name: 'Linen Pouch', kind: 'bag', bagSlots: 6, quality: 'common' },
  potion: { id: 'potion', name: 'Minor Healing Potion', kind: 'potion', quality: 'common' },
  elixir: { id: 'elixir', name: 'Elixir of Vigor', kind: 'elixir', quality: 'common' },
  bread: { id: 'bread', name: 'Crusty Bread', kind: 'food', quality: 'common' },
  water: { id: 'water', name: 'Spring Water', kind: 'drink', quality: 'common' },
  pick: { id: 'pick', name: 'Miner Pick', kind: 'tool', quality: 'common' },
  reins: { id: 'reins', name: 'Reins of the Valorsteed', kind: 'mount', quality: 'rare' },
  elderwood_log: {
    id: 'elderwood_log',
    name: 'Elderwood Log',
    kind: 'junk',
    quality: 'common',
    stackSize: 20,
  },
  fine_elderwood_log: {
    id: 'fine_elderwood_log',
    name: 'Fine Elderwood Log',
    kind: 'junk',
    quality: 'common',
    stackSize: 20,
  },
  copper_ore: {
    id: 'copper_ore',
    name: 'Copper Ore',
    kind: 'junk',
    quality: 'common',
    stackSize: 20,
  },
  fine_copper_ore: {
    id: 'fine_copper_ore',
    name: 'Fine Copper Ore',
    kind: 'junk',
    quality: 'common',
    stackSize: 20,
  },
  specimen: {
    id: 'specimen',
    name: 'Pristine Specimen',
    kind: 'junk',
    quality: 'uncommon',
    stackSize: 20,
  },
  keystone: { id: 'keystone', name: 'Crypt Keystone', kind: 'quest', quality: 'common' },
  pelt: { id: 'pelt', name: 'Ragged Pelt', kind: 'junk', quality: 'poor', stackSize: 20 },
  broken_sword: {
    id: 'broken_sword',
    name: 'Broken Sword',
    kind: 'weapon',
    slot: 'mainhand',
    quality: 'poor',
  },
} as unknown as Record<string, ItemDef>;

const lookup = (id: string): ItemDef | undefined => ITEMS[id];
const cap = (def: ItemDef | undefined): number => stackSizeOf(def);

const slot = (itemId: string, count = 1, extra: Partial<InvSlot> = {}): InvSlot => ({
  itemId,
  count,
  ...extra,
});

/** Item ids in grid-cell order after a sort (what the player actually sees). */
function cellIds(inventory: InvSlot[], capacity = 32): (string | null)[] {
  return layoutBagCells(inventory, capacity).map((s) => (s ? s.itemId : null));
}

function sortedIds(inventory: InvSlot[]): string[] {
  const inv = inventory.map((s) => ({ ...s }));
  sortInventoryStacks(inv, lookup, cap);
  return cellIds(inv)
    .filter((id): id is string => id !== null)
    .slice(0, inv.length);
}

describe('compareBagStacks: the clean-up ladder', () => {
  it('orders the categories weapons first, quest late, gray trash dead last', () => {
    const order = sortedIds([
      slot('pelt', 5),
      slot('keystone'),
      slot('copper_ore', 8),
      slot('reins'),
      slot('pick'),
      slot('water', 2),
      slot('bread', 2),
      slot('elixir', 2),
      slot('potion', 3),
      slot('pouch'),
      slot('tome'),
      slot('helm'),
      slot('blade'),
    ]);
    expect(order).toEqual([
      'blade',
      'helm',
      'tome',
      'pouch',
      'potion',
      'elixir',
      'bread',
      'water',
      'pick',
      'reins',
      'copper_ore',
      'keystone',
      'pelt',
    ]);
  });

  it('hoists poor quality of ANY kind into the trash band after quest items', () => {
    expect(sortedIds([slot('broken_sword'), slot('keystone'), slot('blade')])).toEqual([
      'blade',
      'keystone',
      'broken_sword',
    ]);
  });

  it('orders armor by paperdoll slot, helmet before chest before feet before rings', () => {
    expect(sortedIds([slot('band'), slot('chest'), slot('helm'), slot('epic_boots')])).toEqual([
      'helm',
      'chest',
      'epic_boots',
      'band',
    ]);
  });

  it('orders better quality first within a category and slot', () => {
    expect(sortedIds([slot('blade'), slot('epic_blade')])).toEqual(['epic_blade', 'blade']);
  });

  it('ranks an unknown id after everything, including trash', () => {
    expect(sortedIds([slot('mystery_from_the_future'), slot('pelt', 3)])).toEqual([
      'pelt',
      'mystery_from_the_future',
    ]);
  });

  it('puts fuller stacks of the same item first', () => {
    const a = slot('copper_ore', 20);
    const b = slot('copper_ore', 7);
    expect(compareBagStacks(b, a, lookup)).toBeGreaterThan(0);
    expect(compareBagStacks(a, b, lookup)).toBeLessThan(0);
  });
});

describe('compareBagStacks: material grade families', () => {
  it('groups a fine grade beside its base material, fine first (the elder log case)', () => {
    // Scattered stacks of two grade families plus an unrelated uncommon
    // specimen: each family must come out contiguous, premium grade leading.
    const order = sortedIds([
      slot('elderwood_log', 20),
      slot('copper_ore', 12),
      slot('fine_elderwood_log', 4),
      slot('specimen', 2),
      slot('elderwood_log', 6),
      slot('fine_copper_ore', 3),
    ]);
    expect(order).toEqual([
      'specimen',
      'fine_copper_ore',
      'copper_ore',
      'fine_elderwood_log',
      'elderwood_log',
      'elderwood_log',
    ]);
  });
});

describe('consolidateBagStacks', () => {
  it('tops up the earliest partial stack and splices emptied donors', () => {
    const inv = [slot('copper_ore', 15), slot('blade'), slot('copper_ore', 5)];
    consolidateBagStacks(inv, lookup, cap);
    expect(inv).toEqual([slot('copper_ore', 20), slot('blade')]);
  });

  it('leaves a remainder stack when the total exceeds one cap', () => {
    const inv = [slot('copper_ore', 15), slot('copper_ore', 10)];
    consolidateBagStacks(inv, lookup, cap);
    expect(inv.map((s) => s.count)).toEqual([20, 5]);
  });

  it('never merges a plain stack with an instanced copy, in either direction', () => {
    const inv = [
      slot('copper_ore', 5),
      slot('copper_ore', 5, { instance: { signer: 'Aldric' } }),
      slot('copper_ore', 5),
    ];
    consolidateBagStacks(inv, lookup, cap);
    expect(inv).toEqual([
      slot('copper_ore', 10),
      slot('copper_ore', 5, { instance: { signer: 'Aldric' } }),
    ]);
  });

  it('merges byte-equal instanced payloads and keeps distinct payloads apart', () => {
    const inv = [
      slot('copper_ore', 5, { instance: { signer: 'Aldric' } }),
      slot('copper_ore', 5, { instance: { signer: 'Brenna' } }),
      slot('copper_ore', 5, { instance: { signer: 'Aldric' } }),
    ];
    consolidateBagStacks(inv, lookup, cap);
    expect(inv).toEqual([
      slot('copper_ore', 10, { instance: { signer: 'Aldric' } }),
      slot('copper_ore', 5, { instance: { signer: 'Brenna' } }),
    ]);
  });

  it('never merges charge-bearing payloads, even byte-equal ones', () => {
    const charge = () => ({ instance: { charges: { spark: 3 } } });
    const inv = [slot('copper_ore', 1, charge()), slot('copper_ore', 1, charge())];
    consolidateBagStacks(inv, lookup, cap);
    expect(inv).toHaveLength(2);
  });

  it('keeps different craftedRecipeId markers in separate stacks', () => {
    const inv = [
      slot('copper_ore', 5, { craftedRecipeId: 'r1' }),
      slot('copper_ore', 5),
      slot('copper_ore', 5, { craftedRecipeId: 'r1' }),
    ];
    consolidateBagStacks(inv, lookup, cap);
    expect(inv).toEqual([slot('copper_ore', 10, { craftedRecipeId: 'r1' }), slot('copper_ore', 5)]);
  });

  it('lets a legacy overstacked entry donate without ever being split', () => {
    const inv = [slot('copper_ore', 10), slot('copper_ore', 50)];
    consolidateBagStacks(inv, lookup, cap);
    expect(inv.map((s) => s.count)).toEqual([20, 40]);
  });

  it('never lets a corrupt non-positive count donate (units are conserved)', () => {
    const inv = [slot('copper_ore', 10), slot('copper_ore', -3), slot('copper_ore', 4)];
    consolidateBagStacks(inv, lookup, cap);
    // The corrupt entry neither donates nor vanishes; the honest stacks merge.
    expect(inv).toEqual([slot('copper_ore', 14), slot('copper_ore', -3)]);
  });

  it('conserves every unit across an arbitrary consolidation', () => {
    const inv = [
      slot('copper_ore', 15),
      slot('elderwood_log', 19),
      slot('copper_ore', 15),
      slot('elderwood_log', 3),
      slot('copper_ore', 15),
    ];
    consolidateBagStacks(inv, lookup, cap);
    const total = (id: string) =>
      inv.filter((s) => s.itemId === id).reduce((sum, s) => sum + s.count, 0);
    expect(total('copper_ore')).toBe(45);
    expect(total('elderwood_log')).toBe(22);
  });
});

describe('sortInventoryStacks', () => {
  it('stamps compact unique cell hints 0..n-1 without touching array order', () => {
    const inv = [slot('pelt', 3), slot('blade'), slot('keystone')];
    sortInventoryStacks(inv, lookup, cap);
    expect(inv.map((s) => s.itemId)).toEqual(['pelt', 'blade', 'keystone']);
    expect([...inv.map((s) => s.slot)].sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([0, 1, 2]);
    expect(inv.find((s) => s.itemId === 'blade')?.slot).toBe(0);
    expect(inv.find((s) => s.itemId === 'keystone')?.slot).toBe(1);
    expect(inv.find((s) => s.itemId === 'pelt')?.slot).toBe(2);
  });

  it('closes the holes a manual arrangement left behind', () => {
    const inv = [slot('blade', 1, { slot: 9 }), slot('potion', 2, { slot: 4 })];
    sortInventoryStacks(inv, lookup, cap);
    expect(cellIds(inv, 12).slice(0, 3)).toEqual(['blade', 'potion', null]);
  });

  it('is idempotent: a second sort changes nothing', () => {
    const inv = [
      slot('copper_ore', 15),
      slot('blade'),
      slot('copper_ore', 10),
      slot('keystone'),
      slot('pelt', 4),
    ];
    sortInventoryStacks(inv, lookup, cap);
    const once = inv.map((s) => ({ ...s }));
    sortInventoryStacks(inv, lookup, cap);
    expect(inv).toEqual(once);
  });

  it('is deterministic: equal inventories land in identical cells', () => {
    const build = () => [
      slot('elderwood_log', 7),
      slot('epic_blade'),
      slot('fine_elderwood_log', 2),
      slot('bread', 5),
      slot('elderwood_log', 20),
    ];
    const a = build();
    const b = build();
    sortInventoryStacks(a, lookup, cap);
    sortInventoryStacks(b, lookup, cap);
    expect(a).toEqual(b);
  });

  it('consolidates and arranges the whole messy-bag scenario end to end', () => {
    // The reported case: elder log stacks scattered across the bag, a fine
    // grade in the middle, gear and trash mixed in. After one sort the grid
    // must read gear, consumables, the elder family contiguous (fine first,
    // partials merged), quest, trash.
    const inv = [
      slot('elderwood_log', 12),
      slot('pelt', 2),
      slot('bread', 3),
      slot('elderwood_log', 15),
      slot('keystone'),
      slot('fine_elderwood_log', 5),
      slot('epic_blade'),
      slot('elderwood_log', 4),
    ];
    sortInventoryStacks(inv, lookup, cap);
    expect(cellIds(inv).slice(0, 7)).toEqual([
      'epic_blade',
      'bread',
      'fine_elderwood_log',
      'elderwood_log',
      'elderwood_log',
      'keystone',
      'pelt',
    ]);
    const logCounts = inv.filter((s) => s.itemId === 'elderwood_log').map((s) => s.count);
    expect(logCounts.reduce((a, b) => a + b, 0)).toBe(31);
    expect(logCounts).toEqual([20, 11]);
  });
});

describe('sortInventoryStacks against the REAL catalog', () => {
  const realLookup = (id: string): ItemDef | undefined => REAL_ITEMS[id];

  it('groups the real elderwood grade family, fine first, across an intervening name', () => {
    // Real display names need not share a prefix (the grade word aside), so a
    // plain name sort could interleave another material between the grades;
    // the family key must keep them adjacent regardless, premium grade first.
    const inv = [
      slot('elderwood_log', 20),
      slot('goldleaf_herb', 5),
      slot('fine_elderwood_log', 3),
    ];
    sortInventoryStacks(inv, realLookup, cap);
    const cells = cellIds(inv).filter((id): id is string => id !== null);
    const fineAt = cells.indexOf('fine_elderwood_log');
    expect(fineAt).toBeGreaterThanOrEqual(0);
    expect(cells[fineAt + 1]).toBe('elderwood_log');
  });

  it('totally orders the whole catalog: a permutation, idempotent', () => {
    const everything = Object.keys(REAL_ITEMS).map((id) => slot(id, 1));
    sortInventoryStacks(everything, realLookup, cap);
    const hints = everything.map((s) => s.slot).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(hints).toEqual(everything.map((_, i) => i));
    const once = everything.map((s) => ({ ...s }));
    sortInventoryStacks(everything, realLookup, cap);
    expect(everything).toEqual(once);
  });
});

describe('Sim.sortInventory (the command against the real sim)', () => {
  const makeSim = (): { sim: Sim & Record<string, any>; pid: number } => {
    const sim = new Sim({ seed: 9, playerClass: 'warrior', noPlayer: true }) as Sim &
      Record<string, any>;
    const pid = sim.addPlayer('warrior', 'Sorter');
    return { sim, pid };
  };
  const invOf = (sim: Sim & Record<string, any>, pid: number): InvSlot[] => {
    const meta = sim.players.get(pid);
    if (!meta) throw new Error('no player');
    return meta.inventory;
  };

  it('merges partial stacks, stamps hints, and the arrangement persists', () => {
    const { sim, pid } = makeSim();
    const inv = invOf(sim, pid);
    inv.length = 0; // drop the starter provisions so the counts below are exact
    // Two partial stacks of the same real item plus a weapon, built directly
    // so the add path's own top-up cannot pre-merge them.
    inv.push({ itemId: 'baked_bread', count: 2 });
    sim.addItem('worn_sword', 1, pid);
    inv.push({ itemId: 'baked_bread', count: 3 });
    sim.sortInventory(pid);
    const bread = inv.filter((s) => s.itemId === 'baked_bread');
    expect(bread).toHaveLength(1);
    expect(bread[0]?.count).toBe(5);
    // The weapon leads the clean-up ladder; hints are compact from cell 0.
    expect(inv.find((s) => s.itemId === 'worn_sword')?.slot).toBe(0);
    expect(bread[0]?.slot).toBe(1);
    const saved = sim.serializeCharacter(pid);
    if (!saved) throw new Error('character did not serialize');
    const savedSword = saved.inventory.find((s: InvSlot) => s.itemId === 'worn_sword');
    expect(savedSword?.slot).toBe(0);
  });

  it('is a safe no-op on an empty inventory and an unknown pid', () => {
    const { sim, pid } = makeSim();
    invOf(sim, pid).length = 0; // drop the starter provisions
    sim.sortInventory(pid);
    expect(invOf(sim, pid)).toEqual([]);
    sim.sortInventory(987654); // no such player: resolve() refuses
  });

  it('draws zero rng (the module header claim, pinned)', () => {
    const { sim, pid } = makeSim();
    sim.addItem('worn_sword', 1, pid);
    invOf(sim, pid).push({ itemId: 'baked_bread', count: 2 });
    let draws = 0;
    sim.rng.setObserver(() => {
      draws += 1;
    });
    sim.sortInventory(pid);
    sim.rng.setObserver(null);
    expect(draws).toBe(0);
  });
});

// Kept bespoke on purpose (issue #2088): a dynamic import plus a hand-picked
// field subset (`cmd` only), mirroring the inv_move wire pin beside it.
describe('ClientWorld.sortInventory (wire)', () => {
  it('sends the bare inv_sort command', async () => {
    const { ClientWorld } = await import('../src/net/online');
    const world = Object.create(ClientWorld.prototype) as any;
    const sent: unknown[] = [];
    world.cmd = (payload: unknown) => sent.push(payload);
    ClientWorld.prototype.sortInventory.call(world);
    expect(sent).toEqual([{ cmd: 'inv_sort' }]);
  });
});
