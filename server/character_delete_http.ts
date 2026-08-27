import {
  CharacterDeleteQueueSaturated,
  CharacterStoragePurchaseOpen,
} from './character_delete_db';

/** Stable legacy-envelope refusal shared by both character DELETE dispatch arms. */
export const CHARACTER_STORAGE_PURCHASE_OPEN_BODY = {
  error: 'A storage purchase must finish or be resolved before this character can be deleted.',
  code: 'character.storage_purchase_open',
} as const;

/** Retryable gate-saturation refusal: the delete never took a pool client. */
export const CHARACTER_DELETE_BUSY_BODY = {
  error: 'The realm is busy. Try deleting this character again in a moment.',
  code: 'character.delete_busy',
} as const;

export interface CharacterDeleteHttpRefusal {
  status: 409 | 503;
  body: typeof CHARACTER_STORAGE_PURCHASE_OPEN_BODY | typeof CHARACTER_DELETE_BUSY_BODY;
}

/** Translate only the known domain refusals, without exposing character id or status. */
export function characterDeleteHttpRefusal(error: unknown): CharacterDeleteHttpRefusal | null {
  if (error instanceof CharacterStoragePurchaseOpen) {
    return { status: 409, body: CHARACTER_STORAGE_PURCHASE_OPEN_BODY };
  }
  if (error instanceof CharacterDeleteQueueSaturated) {
    return { status: 503, body: CHARACTER_DELETE_BUSY_BODY };
  }
  return null;
}
