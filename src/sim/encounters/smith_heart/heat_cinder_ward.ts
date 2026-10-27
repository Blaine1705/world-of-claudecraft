// The Guardian of the Heat's Rolling Cinder is a WARD (docs/design/raid/
// smith_heart.md section 7.4; the Nythraxis Bone Spike and the Sunken
// Bastion's cage idiom): a player's or a pet's hit lands exactly one point
// whatever it would have dealt (it cannot be killed, only struck back), and
// the encounter reads that point lost as the hit that knocks it back
// (heat_cinders.ts). Applied at the one damage funnel (combat/damage.ts
// dealDamage). Pure leaf: no rng, no host imports.

import type { Entity } from '../../types';
import { HEAT_MOBS } from './heat_ids';

/** Points a hit from `source` lands on a rolling cinder `target`, or null
 *  when the hit is not a ward hit (not a cinder, a dead one, or a
 *  wild mob's hit). Only a `direct` hit lands its point: a damage-over-time
 *  tick or a reflect lands nothing, so only a real strike knocks it back. */
export function heatCinderHitPoints(
  source: Entity | null | undefined,
  target: Entity,
  direct: boolean,
): number | null {
  if (!source || target.kind !== 'mob' || target.dead) return null;
  if (target.templateId !== HEAT_MOBS.cinder) return null;
  const helper = source.kind === 'player' || (source.kind === 'mob' && source.ownerId !== null);
  if (!helper) return null;
  return direct ? 1 : 0;
}
