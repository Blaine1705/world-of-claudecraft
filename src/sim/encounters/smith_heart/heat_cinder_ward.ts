// The Guardian of the Heat's Rolling Cinder is a WARD while it rolls
// (docs/design/raid/smith_heart.md section 7.4; the Nythraxis Bone Spike and
// the Sunken Bastion's cage idiom): a player's or a pet's hit lands exactly one
// point whatever it would have dealt, and the encounter reads that point lost
// as the hit that knocks it back (heat_cinders.ts). Frozen on the Quench's ice
// (Rimelocked) it is flesh again: hits land in full, and its vulnerability
// makes them land hard. Applied at the one damage funnel (combat/damage.ts
// dealDamage). Pure leaf: no rng, no host imports.

import type { Entity } from '../../types';
import { HEAT_AURAS, HEAT_MOBS } from './heat_ids';

/** Points a hit from `source` lands on a rolling cinder `target`, or null
 *  when the hit is not a ward hit (not a cinder, a dead or frozen one, or a
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
  if (target.auras.some((a) => a.id === HEAT_AURAS.rimelocked)) return null;
  return direct ? 1 : 0;
}
