// Claim plumbing for the Wildheart Basin encounters: the live Basin claims.
// The claim-generic reads (its players, bosses, mechanic damage, the deed
// grant, "is the boss in its fight", the boss bar) are the Sunken Bastion's,
// written claim-generic and shared here rather than copied. Zero rng.

import type { InstanceSlot } from '../../sim';
import type { SimContext } from '../../sim_context';
import { WILDHEART_DUNGEON } from './ids';

export {
  bossEngaged,
  claimBoss,
  claimPlayers,
  clearCastIf,
  grantClaimDeed,
  localOf,
  mechanicDamage,
  startBar,
} from '../sunken_bastion/claim';

/** Every live Wildheart Basin claim. */
export function wildheartClaims(ctx: SimContext): InstanceSlot[] {
  return ctx.instances.filter((i) => i.partyKey !== null && i.dungeonId === WILDHEART_DUNGEON);
}
