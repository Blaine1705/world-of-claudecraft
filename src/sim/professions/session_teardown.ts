// Shared displacement teardown for the two profession sessions (a running
// gather cast or a fishing session), behind the SimContext seam. Every
// teleport (dungeon and delve entry/exit, the delve eject and module
// advance, revive, the server-side jail/spectate/dev moves) and a /follow
// tow across a zone line calls this ONE helper instead of growing its own
// copy of the cancel: a live session must never be carried somewhere its
// start-time gates (fishable water, the zone rod tier, node range) never
// saw. Gated on isNonSpellCast so SPELL casts gain no new cancel path here
// (teleports that should break a spell keep their own rules), and delegated
// to the one cancelCast on the seam, which already clears the queued-spell
// slot and every hidden session field. Draw-free on every path.

import type { SimContext } from '../sim_context';
import { type Entity, isNonSpellCast } from '../types';

export function cancelProfessionSessionOnDisplacement(ctx: SimContext, e: Entity): void {
  if (e.kind !== 'player') return;
  if (!isNonSpellCast(e.castingAbility)) return;
  ctx.cancelCast(e);
}
