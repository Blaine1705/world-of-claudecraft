// The per-copy item addressing leaf (src/sim/item_copy_ref.ts).
//
// The behavior under test is "which copy of an item id does an action consume",
// which has been guessed three separate times in this tree (the phase 12 trade
// fix, the phase 18 discard/vendor widening, the #2398 buyback review). The
// assertions below are written around the two things those fixes kept getting
// wrong: an invalid selection must REFUSE rather than silently guess, and the
// id-only fallback must stay byte-identical to the historical walk.
//
// Pure leaf, so this drives it with plain arrays: no Sim, no SimContext.

import { describe, expect, it } from 'vitest';
import {
  consumeItemCopy,
  consumeNewestInventoryUnit,
  consumeSelectedInventorySlot,
  itemCopyPin,
  itemCopyStillPinned,
} from '../src/sim/item_copy_ref';
import type { InvSlot } from '../src/sim/types';

/** A plain (fungible) stack. */
const plain = (itemId: string, count = 1): InvSlot => ({ itemId, count });

/** An instanced copy: the enchanted / masterwork / signed case that makes two
 *  copies of one id non-interchangeable in the first place. */
const enchanted = (itemId: string, enchantId: string, count = 1): InvSlot => ({
  itemId,
  count,
  instance: { enchantId } as InvSlot['instance'],
});

describe('itemCopyPin', () => {
  it('separates two copies of the same id that differ only by payload', () => {
    // The whole premise: without this, "the girdle" names two different objects.
    expect(itemCopyPin(plain('girdle'))).not.toBe(itemCopyPin(enchanted('girdle', 'power')));
  });

  it('is stable across key order, so it survives a serialize round trip', () => {
    const a: InvSlot = { itemId: 'girdle', count: 1, instance: { a: 1, b: 2 } as never };
    const b: InvSlot = { itemId: 'girdle', count: 1, instance: { b: 2, a: 1 } as never };
    expect(itemCopyPin(a)).toBe(itemCopyPin(b));
  });

  it('ignores count and bag position, which are exactly what shift', () => {
    // A pin that moved when the stack size changed would false-refuse after any
    // partial consume, so this is a real property rather than an incidental one.
    expect(itemCopyPin(plain('girdle', 1))).toBe(itemCopyPin(plain('girdle', 5)));
  });

  it('distinguishes crafted provenance', () => {
    expect(itemCopyPin({ itemId: 'girdle', count: 1, craftedRecipeId: 'r1' })).not.toBe(
      itemCopyPin(plain('girdle')),
    );
  });

  it('pins nothing for no slot', () => {
    expect(itemCopyPin(undefined)).toBe('');
  });
});

describe('consumeSelectedInventorySlot: the tri-state', () => {
  it('takes exactly the named slot, not the newest match', () => {
    // The reported bug, inverted into an assertion. The enchanted copy sits at
    // index 0 and a plain copy was looted after it, so every legacy picker in
    // the tree would take index 1.
    const inv = [enchanted('girdle', 'power'), plain('girdle')];
    const unit = consumeSelectedInventorySlot(inv, 'girdle', 0);
    expect(unit).not.toBeNull();
    expect(unit?.instance).toEqual({ enchantId: 'power' });
    // and the plain copy is untouched
    expect(inv).toHaveLength(1);
    expect(inv[0].instance).toBeUndefined();
  });

  it('returns undefined (fall back) when no selection is given', () => {
    const inv = [plain('girdle')];
    expect(consumeSelectedInventorySlot(inv, 'girdle', undefined)).toBeUndefined();
    expect(inv, 'a no-selection call must not consume anything itself').toHaveLength(1);
  });

  it.each([
    ['out of range', 5],
    ['negative', -1],
    ['not an integer', 1.5],
  ])('returns null (refuse) for an index that is %s', (_label, index) => {
    const inv = [plain('girdle')];
    expect(consumeSelectedInventorySlot(inv, 'girdle', index as number)).toBeNull();
    expect(inv, 'a refused selection consumes nothing').toHaveLength(1);
  });

  it('refuses when the named slot holds a DIFFERENT item', () => {
    // The stale-frame case: the client named index 0, but the bag moved and
    // something else lives there now. Refusing is the point; guessing here is
    // how you destroy the wrong item.
    const inv = [plain('boots'), plain('girdle')];
    expect(consumeSelectedInventorySlot(inv, 'girdle', 0)).toBeNull();
    expect(inv).toHaveLength(2);
  });

  it('decrements a stack rather than removing it when more than one remains', () => {
    const inv = [plain('potion', 3)];
    const unit = consumeSelectedInventorySlot(inv, 'potion', 0);
    expect(unit).not.toBeNull();
    expect(inv[0].count).toBe(2);
  });

  it('clones the payload when the stack survives, so the consumed unit is not aliased', () => {
    // Aliasing here would let a later mutation of the bag stack reach through
    // into the already-consumed unit (the cloneItemInstancePayload contract).
    const inv = [enchanted('scroll', 'power', 2)];
    const unit = consumeSelectedInventorySlot(inv, 'scroll', 0);
    expect(unit?.instance).toEqual({ enchantId: 'power' });
    expect(unit?.instance).not.toBe(inv[0].instance);
  });
});

describe('consumeNewestInventoryUnit: the legacy fallback, unchanged', () => {
  it('takes the HIGHEST index match, which is the historical behavior', () => {
    // Pinned deliberately, not aspirationally. Callers no UI can fix reach this
    // (server/pbe_boost.ts auto-gears by bare id) and the parity goldens drive
    // equip / discard / sell / use through it, so "improving" it forks the world.
    const inv = [enchanted('girdle', 'power'), plain('girdle')];
    const unit = consumeNewestInventoryUnit(inv, 'girdle');
    expect(unit.instance, 'the newest copy is the plain one here').toBeUndefined();
    expect(inv).toHaveLength(1);
    expect(inv[0].instance).toEqual({ enchantId: 'power' });
  });

  it('returns an empty unit when nothing matches, rather than throwing', () => {
    const inv = [plain('boots')];
    expect(consumeNewestInventoryUnit(inv, 'girdle')).toEqual({
      instance: undefined,
      craftedRecipeId: undefined,
    });
    expect(inv).toHaveLength(1);
  });
});

describe('itemCopyStillPinned: surviving a bag that shifts mid-cast', () => {
  it('holds while the pinned copy stays put', () => {
    const inv = [enchanted('girdle', 'power'), plain('boots')];
    expect(itemCopyStillPinned(inv, 0, itemCopyPin(inv[0]))).toBe(true);
  });

  it('fails when a different copy slides into the pinned index', () => {
    // The mid-cast hazard, and the reason a bare index is not enough: the player
    // aimed at their enchanted girdle, then a loot re-ordered the bag. Hitting
    // whatever now occupies index 0 is worse than the old guess, because the
    // player believes they chose.
    const inv = [enchanted('girdle', 'power'), plain('boots')];
    const pin = itemCopyPin(inv[0]);
    inv[0] = plain('girdle');
    expect(itemCopyStillPinned(inv, 0, pin)).toBe(false);
  });

  it('fails when the bag shrank past the pinned index', () => {
    const inv = [enchanted('girdle', 'power')];
    const pin = itemCopyPin(inv[0]);
    inv.pop();
    expect(itemCopyStillPinned(inv, 0, pin)).toBe(false);
  });

  it('passes for an id-only action, which pinned nothing', () => {
    expect(itemCopyStillPinned([plain('girdle')], undefined, '')).toBe(true);
  });

  it('survives a partial consume of the pinned stack, which changes only count', () => {
    // A pin that moved on count would false-refuse after any partial consume.
    const inv = [enchanted('scroll', 'power', 3)];
    const pin = itemCopyPin(inv[0]);
    inv[0].count -= 1;
    expect(itemCopyStillPinned(inv, 0, pin)).toBe(true);
  });
});

describe('consumeItemCopy: the composed rule every converted surface calls', () => {
  it('honors a valid selection and reports that it was honored', () => {
    const inv = [enchanted('girdle', 'power'), plain('girdle')];
    const out = consumeItemCopy(inv, 'girdle', 0);
    expect(out.kind).toBe('selected');
    expect(out.kind === 'selected' && out.unit.instance).toEqual({ enchantId: 'power' });
  });

  it('refuses an invalid selection instead of falling back to a guess', () => {
    // The single most important case in this file. Collapsing refuse into
    // fall-back is precisely the defect: a stale index would destroy or equip
    // whatever the legacy walk happened to land on.
    const inv = [plain('girdle')];
    const out = consumeItemCopy(inv, 'girdle', 9);
    expect(out.kind).toBe('refused');
    expect(inv, 'a refusal consumes nothing').toHaveLength(1);
  });

  it('falls back to the legacy walk for an id-only call, and says so', () => {
    const inv = [enchanted('girdle', 'power'), plain('girdle')];
    const out = consumeItemCopy(inv, 'girdle', undefined);
    expect(out.kind).toBe('fellBack');
    expect(out.kind === 'fellBack' && out.unit.instance).toBeUndefined();
  });

  it('selected and fellBack disagree on the same bag, so the modes are distinguishable', () => {
    // Guards the guard: if both paths picked the same copy this whole file could
    // pass while the feature did nothing. The fixture is built so they differ.
    const bag = () => [enchanted('girdle', 'power'), plain('girdle')];
    const picked = consumeItemCopy(bag(), 'girdle', 0);
    const guessed = consumeItemCopy(bag(), 'girdle', undefined);
    const pickedInstance = picked.kind === 'selected' ? picked.unit.instance : null;
    const guessedInstance = guessed.kind === 'fellBack' ? guessed.unit.instance : null;
    expect(pickedInstance).toEqual({ enchantId: 'power' });
    expect(guessedInstance).toBeUndefined();
  });
});
