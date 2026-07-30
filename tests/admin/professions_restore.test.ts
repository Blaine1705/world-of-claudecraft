import { describe, expect, it } from 'vitest';
import {
  restoreItemBodyError,
  restoreSlotBodyError,
  RESTORE_ITEM_MAX_COUNT as SERVER_RESTORE_ITEM_MAX_COUNT,
} from '../../server/character_professions';
import { ADMIN_ERROR_KEYS } from '../../src/admin/i18n';
import { en } from '../../src/admin/i18n.en';
import {
  RESTORE_ITEM_MAX_COUNT,
  restoreItem,
  restoreSlot,
} from '../../src/admin/professions_restore';

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

  it('refuses a whitespace-only note locally, matching the server cleanText refusal', () => {
    expect(restoreItem(7, 'Merlin', 'copper_mining_pick', 1, '   ')).toEqual({
      errorKey: 'alert.noteRequired',
    });
    expect(restoreSlot(7, 'Merlin', 'mining', 'gatherers_cache', '\t ')).toEqual({
      errorKey: 'alert.noteRequired',
    });
  });
});

describe('server prose coupling (the count clamp and the error reverse map)', () => {
  it('mirrors the server count clamp exactly', () => {
    // Three copies of the clamp exist (server validator, client mirror, the
    // matcher key below); this pin makes a move in one drag the others.
    expect(RESTORE_ITEM_MAX_COUNT).toBe(SERVER_RESTORE_ITEM_MAX_COUNT);
  });

  it('reverse-maps every R35 server error prose to a real catalog key', () => {
    // The REAL server-built strings where they are dynamic, so a clamp change
    // or a reword breaks THIS test instead of silently unmatching operators
    // (many en values equal the prose verbatim, so the MAP is the oracle,
    // not localizeAdminError's output).
    const proses = [
      restoreItemBodyError({ itemId: 'copper_mining_pick', count: 0 }),
      restoreSlotBodyError({ professionId: 'mining', effectId: 'nope' }),
      restoreItemBodyError({ itemId: 'not_a_real_item', count: 1 }),
      restoreSlotBodyError({ professionId: 'cooking', effectId: 'gatherers_cache' }),
      'character is not online on this realm',
      'the character owns no tool for that profession',
      'that profession already has a slotted effect',
      'that effect cannot be slotted on that profession',
      'character went offline before the restore landed',
      'item restore failed',
      'slot restore failed',
      'character not found',
    ];
    for (const prose of proses) {
      expect(prose, 'validator fixture must produce an error').not.toBeNull();
      const key = ADMIN_ERROR_KEYS[(prose as string).toLowerCase()];
      expect(key, `unmatched admin error prose: ${prose}`).toBeTruthy();
      expect(
        (en as Record<string, string>)[key],
        `reverse-map key missing from the catalog: ${key}`,
      ).toBeTruthy();
    }
  });
});
