// Korgath (docs/design/dungeon-rework/gravewyrm_sanctum.md section 6): phase B
// core. Placeholder until the core lands: the boss keeps its shipped kit.

import type { InstanceSlot } from '../../sim';
import type { SimContext } from '../../sim_context';
import type { Entity } from '../../types';

/** One tick of Korgath's fight (after the mob AI). */
export function tickKorgath(
  _ctx: SimContext,
  _inst: InstanceSlot,
  _boss: Entity,
  _engaged: boolean,
): void {}

/** `/dev sanctum trigger <mechanic>` for an engaged Korgath: the reply line, or
 *  null when `what` is not one of his mechanics. */
export function korgathDevTrigger(
  _ctx: SimContext,
  _inst: InstanceSlot,
  _boss: Entity,
  _what: string,
): string | null {
  return null;
}
