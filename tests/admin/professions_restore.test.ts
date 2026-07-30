import { describe, expect, it } from 'vitest';
import { restoreItem, restoreSlot } from '../../src/admin/professions_restore';

// Pure validation + endpoint/body shaping for the R35 GM restores, the
// moderation_actions.test.ts pattern: Node env, no DOM, pins the exact
// request each builder sends and every client-side refusal.

describe('professions_restore builders', () => {
  it('requires a note for both restores', () => {
    expect(restoreItem(7, 'Merlin', 'copper_mining_pick', 1, '')).toEqual({
      errorKey: 'alert.noteRequired',
    });
    expect(restoreSlot(7, 'Merlin', 'mining', 'gatherers_cache', '')).toEqual({
      errorKey: 'alert.noteRequired',
    });
  });

  it('refuses an empty item id and an out-of-range count', () => {
    expect(restoreItem(7, 'Merlin', '   ', 1, 'lost')).toEqual({
      errorKey: 'alert.itemIdRequired',
    });
    expect(restoreItem(7, 'Merlin', 'copper_mining_pick', 0, 'lost')).toEqual({
      errorKey: 'alert.restoreCountRange',
    });
    expect(restoreItem(7, 'Merlin', 'copper_mining_pick', 21, 'lost')).toEqual({
      errorKey: 'alert.restoreCountRange',
    });
    expect(restoreItem(7, 'Merlin', 'copper_mining_pick', 1.5, 'lost')).toEqual({
      errorKey: 'alert.restoreCountRange',
    });
  });

  it('refuses a missing profession or effect selection', () => {
    expect(restoreSlot(7, 'Merlin', '', 'gatherers_cache', 'lost')).toEqual({
      errorKey: 'alert.restoreSlotSelection',
    });
    expect(restoreSlot(7, 'Merlin', 'mining', '', 'lost')).toEqual({
      errorKey: 'alert.restoreSlotSelection',
    });
  });

  it('builds the restore-item request with a trimmed id and the exact endpoint', () => {
    const built = restoreItem(7, 'Merlin', '  copper_mining_pick ', 3, 'lost to issue 2514');
    if (!('pending' in built)) throw new Error('expected pending');
    expect(built.pending.endpoint).toBe('/admin/api/moderation/characters/7/restore-item');
    expect(built.pending.body).toEqual({
      itemId: 'copper_mining_pick',
      count: 3,
      reason: 'lost to issue 2514',
    });
  });

  it('builds the restore-slot request with the exact endpoint and body', () => {
    const built = restoreSlot(7, 'Merlin', 'mining', 'gatherers_cache', 'row vanished');
    if (!('pending' in built)) throw new Error('expected pending');
    expect(built.pending.endpoint).toBe('/admin/api/moderation/characters/7/restore-slot');
    expect(built.pending.body).toEqual({
      professionId: 'mining',
      effectId: 'gatherers_cache',
      reason: 'row vanished',
    });
  });
});
