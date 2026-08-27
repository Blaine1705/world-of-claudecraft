import { describe, expect, it } from 'vitest';
import {
  CharacterDeleteQueueSaturated,
  CharacterStoragePurchaseOpen,
} from '../../server/character_delete_db';
import {
  CHARACTER_DELETE_BUSY_BODY,
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

  it('maps gate saturation to a retryable non-sensitive 503', () => {
    const refusal = characterDeleteHttpRefusal(new CharacterDeleteQueueSaturated(42));

    expect(refusal).toEqual({
      status: 503,
      body: {
        error: 'The realm is busy. Try deleting this character again in a moment.',
        code: 'character.delete_busy',
      },
    });
    expect(refusal?.body).toBe(CHARACTER_DELETE_BUSY_BODY);
    expect(JSON.stringify(refusal)).not.toContain('42');
  });

  it('leaves unrelated failures for the caller to surface', () => {
    expect(characterDeleteHttpRefusal(new Error('database unavailable'))).toBeNull();
    expect(characterDeleteHttpRefusal(null)).toBeNull();
  });
});
