// Stalk survives a fall (Wildfang feral pass).
//
// Taking or dealing real damage breaks stealth (combat/damage.ts). Environmental
// fall damage used to take a cat out of Stalk the moment it landed, which made
// dropping off a ledge onto prey impossible. A fall is not an attack: nobody
// struck the druid and nobody saw it, so a null-source 'Falling' hit no longer
// breaks the Stalk aura. Every other stealth (Duskveil, Smokestep, Vanish) and
// every other damage source keep the old rule.
//
// Pure predicate, no rng and no mutation, so damage.ts stays the one funnel
// that decides whether breakStealth runs.
import type { Entity } from '../types';

/** The environmental damage label the movement kernel stamps on a fall
 *  (player_motion.ts). */
export const FALLING_DAMAGE_LABEL = 'Falling';
/** Stalk's aura id: the bare ability id selfBuffAuraId gives its stealth buff. */
export const STALK_AURA_ID = 'prowl';

/** Does this hit leave the target's stealth in place? True only for fall
 *  damage (no source, the 'Falling' label) on a target hidden by Stalk. */
export function fallDamageKeepsStalk(
  source: Entity | null,
  target: Entity,
  ability: string | null,
): boolean {
  if (source !== null || ability !== FALLING_DAMAGE_LABEL) return false;
  return target.auras.some((aura) => aura.kind === 'stealth' && aura.id === STALK_AURA_ID);
}
