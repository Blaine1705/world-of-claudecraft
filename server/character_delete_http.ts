import { CharacterStoragePurchaseOpen } from './character_delete_db';

/** Stable legacy-envelope refusal shared by both character DELETE dispatch arms. */
export const CHARACTER_STORAGE_PURCHASE_OPEN_BODY = {
  error: 'A storage purchase must finish or be resolved before this character can be deleted.',
  code: 'character.storage_purchase_open',
} as const;

export interface CharacterDeleteHttpRefusal {
  status: 409;
  body: typeof CHARACTER_STORAGE_PURCHASE_OPEN_BODY;
}

/** Translate only the known domain refusal, without exposing its character id or status. */
export function characterDeleteHttpRefusal(error: unknown): CharacterDeleteHttpRefusal | null {
  if (!(error instanceof CharacterStoragePurchaseOpen)) return null;
  return { status: 409, body: CHARACTER_STORAGE_PURCHASE_OPEN_BODY };
}
