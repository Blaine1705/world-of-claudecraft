// Which interior keys are open fields with their own ground height, and
// where that height comes from. The ONE lookup world.ts groundHeight and the
// interior collider seam consult, so a new authored field is a single row
// here plus its content record.
//
// Wildheart's bespoke height function rides the same lookup (its collision
// stays on its own static set in interior_collider_sets.ts), so its ground is
// byte-identical to before this seam existed.

import { HOLLOW_CRYPT_FIELD } from '../../content/hollow_crypt_layout';
import { wildheartFieldHeight } from '../../wildheart_field';
import { authoredFieldHeight } from './height';
import type { AuthoredFieldDef } from './types';

const AUTHORED_FIELDS: Readonly<Record<string, AuthoredFieldDef>> = {
  hollow_crypt: HOLLOW_CRYPT_FIELD,
};

const hollowCryptHeight = (x: number, z: number): number =>
  authoredFieldHeight(HOLLOW_CRYPT_FIELD, x, z);

const FIELD_HEIGHTS: Readonly<Record<string, (lx: number, lz: number) => number>> = {
  wildheart: wildheartFieldHeight,
  hollow_crypt: hollowCryptHeight,
};

/** The authored field record for an interior key, or null. */
export function authoredFieldFor(interior: string): AuthoredFieldDef | null {
  return AUTHORED_FIELDS[interior] ?? null;
}

/** Instance-local ground height function of an open-field interior, or null
 *  for a flat or room-plan interior. */
export function instancedFieldHeight(
  interior: string,
): ((lx: number, lz: number) => number) | null {
  return FIELD_HEIGHTS[interior] ?? null;
}
