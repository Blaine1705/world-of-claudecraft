import { describe, expect, it } from 'vitest';
import { CharacterStoragePurchaseOpen } from '../../server/character_delete_db';
import {
  CHARACTER_STORAGE_PURCHASE_OPEN_BODY,
  characterDeleteHttpRefusal,
} from '../../server/character_delete_http';

describe('characterDeleteHttpRefusal', () => {
  it.each(['pending', 'unresolved'] as const)(
    'maps an open %s storage purchase to the same non-sensitive 409 contract',
    (status) => {
      const refusal = characterDeleteHttpRefusal(new CharacterStoragePurchaseOpen(42, status));

      expect(refusal).toEqual({
        status: 409,
        body: {
          error:
            'A storage purchase must finish or be resolved before this character can be deleted.',
          code: 'character.storage_purchase_open',
        },
      });
      expect(refusal?.body).toBe(CHARACTER_STORAGE_PURCHASE_OPEN_BODY);
      expect(JSON.stringify(refusal)).not.toContain('42');
      expect(JSON.stringify(refusal)).not.toContain(status);
    },
  );

  it('leaves unrelated failures for the caller to surface', () => {
    expect(characterDeleteHttpRefusal(new Error('database unavailable'))).toBeNull();
    expect(characterDeleteHttpRefusal(null)).toBeNull();
  });
});
