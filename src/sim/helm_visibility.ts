// Helmet-visibility preference (the paperdoll eye toggle): a purely cosmetic
// per-entity flag the renderer reads to leave the composed kit's head piece off.
// Server-authoritative like `weaponStowed`: it rides the entity wire as a
// compact flag so every client renders (and portraits) a player the way that
// player chose to present. Unlike the sheathe it is a standing wardrobe
// preference, not an action: nothing in combat clears it and the dead can set
// it (a ghost's wardrobe should come back the way they left it). Pure leaf
// module (threat.ts pattern): no rng, no SimContext, importable directly by
// system modules and tests.

import type { Entity } from './types';

/** Apply the preference. Idempotent by design (the client re-asserts its
 *  stored choice on every world entry), so this is a setter, not a toggle. */
export function setHelmHidden(e: Entity, hidden: boolean): void {
  e.helmHidden = hidden;
}
