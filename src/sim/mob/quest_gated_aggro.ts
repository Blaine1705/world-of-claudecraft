// Quest-gated aggro gate. Mirrors combat/quest_damage_gate.ts in the other direction:
// a mob whose template declares `requiresQuestId` (a Broodmother egg) must never
// autonomously pull a player (or that player's pet) who lacks the gating quest into
// combat. Without this, the egg's own aggroRadius: 0 stops it from proactively hunting,
// but the idle-scan detection radius floors at a few yards regardless of template
// aggroRadius, so a non-quester who merely walks past is close enough to trigger
// aggroMob: the egg then chases/swings at a player its own damage gate (the sibling
// file above) already refuses to let that player hurt back, holding them in combat
// with an opponent they can neither damage nor escape by fighting. The gate below
// keeps the two symmetric: an object a player cannot touch must also never touch them.
// Pure and host-agnostic (no ctx, no rng, no clock) so it unit-tests directly.
import { MOBS } from '../data';
import type { PlayerMeta } from '../sim';
import type { Entity } from '../types';

export function questGateBlocksAggro(
  players: Map<number, PlayerMeta>,
  mob: Entity,
  target: Entity,
): boolean {
  const gateQuest = MOBS[mob.templateId]?.requiresQuestId;
  if (!gateQuest) return false;
  // The pulled target is a player or that player's pet (rallyFleeingAllies and the
  // mob-driven enterCombat arm can hand aggroMob a pet as the target).
  const targetPid = target.kind === 'player' ? target.id : target.ownerId;
  const owner = targetPid !== null ? players.get(targetPid) : undefined;
  const qp = owner?.questLog.get(gateQuest);
  return !qp || (qp.state !== 'active' && qp.state !== 'ready');
}
