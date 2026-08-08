// The gear-set planner behind saved loadouts (src/sim/loadout_gear.ts).
//
// The feature exists so a player can keep a PvP set and a PvE set on two talent
// loadouts. The assertions below are built around the one way it could be worse
// than useless: re-equipping the WRONG copy. Equipment is stored as bare item ids
// with per-copy payloads in a parallel map, so a plain and an enchanted Furyforged
// Girdle are the same id, and a set that silently re-equipped the plain one every
// swap would quietly strip the enchant a player paid for.
//
// Pure leaf, so this drives the whole decision with plain arrays: no Sim, no
// SimContext, no equip command.

import { describe, expect, it } from 'vitest';
import { itemCopyPin } from '../src/sim/item_copy_ref';
import {
  buildGearSet,
  gearSwapBagDelta,
  planGearSwap,
  type SavedGearSet,
} from '../src/sim/loadout_gear';
import type { EquipSlot, InvSlot, ItemInstancePayload } from '../src/sim/types';

const GIRDLE = 'warfare_girdle';
const BOOTS = 'warfare_boots';

const enchant = (id: string): ItemInstancePayload => ({ enchantId: id }) as ItemInstancePayload;

const plain = (itemId: string, count = 1): InvSlot => ({ itemId, count });
const withPayload = (itemId: string, instance: ItemInstancePayload, count = 1): InvSlot => ({
  itemId,
  count,
  instance,
});

/** The pin a bag slot carries, via the shared function the planner uses. */
const pinOf = (slot: InvSlot): string => (slot.instance ? itemCopyPin(slot) : '');

describe('buildGearSet: capturing what is worn', () => {
  it('records the id and the payload pin for an instanced piece', () => {
    const power = enchant('power');
    const set = buildGearSet({ waist: GIRDLE }, { waist: power });
    expect(set.waist?.itemId).toBe(GIRDLE);
    expect(set.waist?.pin).toBe(itemCopyPin({ itemId: GIRDLE, count: 1, instance: power }));
  });

  it('records an empty pin for a plain piece, which is the common case', () => {
    const set = buildGearSet({ waist: GIRDLE }, undefined);
    expect(set.waist).toEqual({ itemId: GIRDLE, pin: '' });
  });

  it('captures only slots that hold something', () => {
    const set = buildGearSet({ waist: GIRDLE, feet: undefined }, undefined);
    expect(Object.keys(set)).toEqual(['waist']);
  });

  it('pins the same value the bag side computes, so worn and bagged copies compare equal', () => {
    // The whole scheme rests on this: a set saved off the body has to match the
    // same copy once it is sitting in the bags. If these two ever diverge, every
    // swap reports the copy missing.
    const power = enchant('power');
    const set = buildGearSet({ waist: GIRDLE }, { waist: power });
    expect(set.waist?.pin).toBe(pinOf(withPayload(GIRDLE, power)));
  });
});

describe('planGearSwap: which copy comes back', () => {
  it('equips the SAVED copy, not merely the id', () => {
    // The headline case. Both copies are in the bags; the saved one is enchanted
    // and sits at index 0, and a plain duplicate was looted after it. Every legacy
    // picker in the tree takes the newest, which is the wrong one here.
    const power = enchant('power');
    const inventory = [withPayload(GIRDLE, power), plain(GIRDLE)];
    const set: SavedGearSet = { waist: { itemId: GIRDLE, pin: pinOf(inventory[0]) } };

    const plan = planGearSwap(set, inventory, {}, undefined);
    expect(plan.equips).toEqual([{ slot: 'waist', itemId: GIRDLE, bagIndex: 0 }]);
    expect(plan.unavailable).toEqual([]);
  });

  it('reports a saved enchanted copy as gone rather than settling for a plain one', () => {
    // The refusal that makes the feature honest. A plain copy of the id IS in the
    // bags, but it is not the piece that was saved, and equipping it would put a
    // stat-less shell in the slot while looking correct on the paperdoll.
    const inventory = [plain(GIRDLE)];
    const set: SavedGearSet = {
      waist: { itemId: GIRDLE, pin: itemCopyPin(withPayload(GIRDLE, enchant('power'))) },
    };

    const plan = planGearSwap(set, inventory, {}, undefined);
    expect(plan.equips).toEqual([]);
    expect(plan.unavailable).toEqual([{ slot: 'waist', itemId: GIRDLE, reason: 'copyGone' }]);
  });

  it('treats plain copies as interchangeable, because they are', () => {
    const inventory = [plain(GIRDLE), plain(GIRDLE)];
    const set: SavedGearSet = { waist: { itemId: GIRDLE, pin: '' } };
    const plan = planGearSwap(set, inventory, {}, undefined);
    expect(plan.equips).toHaveLength(1);
    expect(plan.unavailable).toEqual([]);
  });

  it('distinguishes "none held" from "that copy is gone"', () => {
    // Two different player stories: sold the item entirely, versus still owning one
    // but not the enchanted copy. The reasons let a caller word the refusal.
    const plan = planGearSwap(
      { waist: { itemId: GIRDLE, pin: '' } },
      [plain(BOOTS)],
      {},
      undefined,
    );
    expect(plan.unavailable).toEqual([{ slot: 'waist', itemId: GIRDLE, reason: 'notHeld' }]);
  });

  it('skips a slot already wearing the exact saved copy', () => {
    const power = enchant('power');
    const set = buildGearSet({ waist: GIRDLE }, { waist: power });
    const plan = planGearSwap(set, [], { waist: GIRDLE }, { waist: power });
    expect(plan.alreadyWorn).toEqual(['waist']);
    expect(plan.equips).toEqual([]);
  });

  it('does NOT skip when the same id is worn but a different copy', () => {
    // Wearing the plain girdle while the set wants the enchanted one is precisely
    // the state a swap must correct, and an id-only comparison would call it done.
    const power = enchant('power');
    const set = buildGearSet({ waist: GIRDLE }, { waist: power });
    const inventory = [withPayload(GIRDLE, power)];
    const plan = planGearSwap(set, inventory, { waist: GIRDLE }, undefined);
    expect(plan.alreadyWorn).toEqual([]);
    expect(plan.equips).toEqual([{ slot: 'waist', itemId: GIRDLE, bagIndex: 0 }]);
  });

  it('never resolves two slots onto the same bag stack', () => {
    // Two rings, one held copy. Without the claim set both slots would plan the
    // same index and the second equip would find nothing there.
    const set: SavedGearSet = {
      ring1: { itemId: GIRDLE, pin: '' },
      ring2: { itemId: GIRDLE, pin: '' },
    };
    const plan = planGearSwap(set, [plain(GIRDLE)], {}, undefined);
    expect(plan.equips).toHaveLength(1);
    expect(plan.unavailable).toHaveLength(1);
    // Reported as taken by the other slot, NOT as gone: the player holds the ring,
    // they just hold one. Telling them the copy is gone would be misinformation.
    expect(plan.unavailable[0].reason).toBe('takenByOtherSlot');
  });

  it('is deterministic regardless of key insertion order', () => {
    // The sim runs on three hosts; the same inputs must produce the same plan.
    const a: SavedGearSet = {
      waist: { itemId: GIRDLE, pin: '' },
      feet: { itemId: BOOTS, pin: '' },
    };
    const b: SavedGearSet = {
      feet: { itemId: BOOTS, pin: '' },
      waist: { itemId: GIRDLE, pin: '' },
    };
    const inv = [plain(GIRDLE), plain(BOOTS)];
    expect(planGearSwap(a, inv, {}, undefined)).toEqual(planGearSwap(b, inv, {}, undefined));
  });

  it('ignores a zero-count stack', () => {
    const plan = planGearSwap(
      { waist: { itemId: GIRDLE, pin: '' } },
      [{ itemId: GIRDLE, count: 0 }],
      {},
      undefined,
    );
    expect(plan.equips).toEqual([]);
    expect(plan.unavailable[0].reason, 'a zero stack is not held').toBe('notHeld');
  });
});

describe('gearSwapBagDelta: whether a swap can fit', () => {
  it('is neutral for a one-for-one swap', () => {
    // The incoming piece leaves the bags and the displaced one returns.
    const plan = planGearSwap(
      { waist: { itemId: GIRDLE, pin: '' } },
      [plain(GIRDLE)],
      { waist: BOOTS },
      undefined,
    );
    expect(plan.equips).toHaveLength(1);
    expect(gearSwapBagDelta(plan, { waist: BOOTS })).toBe(0);
  });

  it('FREES a slot when the target slot was empty', () => {
    // Nothing comes back off the body, so the swap cannot fail for capacity.
    const plan = planGearSwap(
      { waist: { itemId: GIRDLE, pin: '' } },
      [plain(GIRDLE)],
      {},
      undefined,
    );
    expect(gearSwapBagDelta(plan, {})).toBe(-1);
  });

  it('never asks for more slots than it frees, across a full set', () => {
    // The property that matters: a gear swap can never need free bag space, so a
    // caller has no capacity refusal to write. Asserted rather than assumed,
    // because the opposite would be a half-applied swap.
    const slots: EquipSlot[] = ['waist', 'feet'];
    const set: SavedGearSet = {};
    const inventory: InvSlot[] = [];
    const worn: Partial<Record<EquipSlot, string>> = {};
    for (const slot of slots) {
      set[slot] = { itemId: GIRDLE, pin: '' };
      inventory.push(plain(GIRDLE));
      worn[slot] = BOOTS;
    }
    const plan = planGearSwap(set, inventory, worn, undefined);
    expect(plan.equips).toHaveLength(2);
    expect(gearSwapBagDelta(plan, worn)).toBeLessThanOrEqual(0);
  });
});
