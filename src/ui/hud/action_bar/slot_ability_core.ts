// Which ability an action-bar slot actually paints and casts. A saved binding
// keeps its BASE ability id, while the live button follows the player's aura and
// talent state, so the slot must be resolved every read rather than trusted as
// stored. This is the same pure resolution the sim's cast path runs, kept here as
// a DOM-free core the HUD (and any other bar family) consumes.

import { resolveActionReplacement } from '../../../sim/combat/action_replacement';
import { resolveColdsightAbilityForSpec } from '../../../sim/combat/hunter_coldsight';
import { resolveHunterSharedAbilityForTalents } from '../../../sim/combat/hunter_shared';
import type { TalentAllocation } from '../../../sim/content/talents';
import type { ResolvedAbility } from '../../../sim/sim';
import type { Entity, PlayerClass } from '../../../sim/types';

/**
 * Resolve a slot's known ability to the one the player would actually cast right
 * now: the generic action-replacement pass every class shares (the rogue engine
 * transforms), then the two hunter-specific resolvers. A slot holding nothing
 * learned resolves to null.
 */
export function resolveSlotAbility(
  known: ResolvedAbility | null,
  player: Entity,
  talents: TalentAllocation,
  playerClass: PlayerClass,
): ResolvedAbility | null {
  if (!known) return null;
  const resolved = resolveActionReplacement(known, player);
  if (playerClass !== 'hunter') return resolved;
  const coldsight = resolveColdsightAbilityForSpec(resolved, player, talents.spec);
  return resolveHunterSharedAbilityForTalents(coldsight, player, talents);
}
