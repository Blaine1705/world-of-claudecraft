import type { SimContext } from '../../sim_context';
import { stripOtherSeraphicVigils } from './benison';
import { stripDoctrineLinks } from './doctrine';
import { cleanupVespers } from './vespers';

/** Clears only source-owned Priest transient state. Safe to call repeatedly. */
export function cleanupPriestState(ctx: SimContext, priestId: number): void {
  if (ctx.players.get(priestId)?.cls !== 'priest') return;
  stripDoctrineLinks(ctx, priestId);
  stripOtherSeraphicVigils(ctx, priestId, -1);
  cleanupVespers(ctx, priestId);
}
