// Pet return across an arena-shaped match (ranked arena, Fiesta, Protect Yumi).
//
// The bout is a parenthesis, not a rest stop (issue #1600): startArenaMatch
// snapshots what each fighter carried in and returnFromArena hands it back, so a
// match can never be farmed as a free full restore. The fighter's PET was the one
// thing that seam never covered: the arena clean slate stands the FIGHTER back up
// on the way out (returnFromArena sets `dead = false`), but a beast killed on the
// sands, or one dragged down with its owner by the handleDeath owner arm, stayed a
// corpse. A hunter who queued with a living pet went home without one and owed a
// Revive Pet cast for a death the normalized bout inflicted.
//
// This slice owns the two halves of that round trip and nothing else:
//   - snapshotMatchPet: taken at match formation, records the pet ENTITY ID plus
//     the hp it walked in at, and only for a LIVING pet (a fighter who queued with
//     a corpse is owed nothing, so the arena can never be a free pet revive).
//   - restoreMatchPet: called at the END of the return path, after the fighter is
//     already standing at their queue spot, so the beast is placed beside its owner
//     in the world instead of back on the sands.
//
// The id match is what keeps the restore honest: a pet deliberately parted with
// mid-bout (abandon, dismiss, a warlock re-summon) is a DIFFERENT entity or no
// entity at all, so it never matches the snapshot and is never handed back. A slain
// demon unravels within seconds (handleDeath gives an owned demon corpseTimer 3), so
// once its entity is gone it stays gone: a dead demon is a re-summon everywhere else
// in the game, and the arena does not invent a second rule.
//
// `src/sim`-pure and rng-free: no DOM/Three/render/ui/game/net imports, no
// Math.random/Date.now, and no draw sites (the revive is straight-line state).

import type { SimContext } from '../sim_context';
import { clearThreat } from '../threat';
import type { Entity } from '../types';
import { petOf } from './pet_commands';

/** The pet a fighter walked into a match with: identity plus the hp it carried. */
export interface MatchPetSnapshot {
  /** Entity id of the pet at match formation; a different pet never matches. */
  petId: number;
  /** Hp at match formation, restored if the bout killed it. */
  hp: number;
}

/**
 * Record the LIVING pet a fighter is queueing with, or null when they have none.
 * A pet that is already a corpse is deliberately not recorded: the match owes back
 * only what it took.
 */
export function snapshotMatchPet(ctx: SimContext, ownerPid: number): MatchPetSnapshot | null {
  const pet = petOf(ctx, ownerPid);
  if (!pet || pet.dead) return null;
  return { petId: pet.id, hp: pet.hp };
}

/**
 * Stand a fighter's pet back up on the way out of a match, at the hp it walked in
 * with, beside its owner. A no-op unless the very same pet is still a corpse: an
 * alive pet (it survived, or was healed, or is a fresh summon) is left exactly as
 * the bout left it, and an entity that is gone is never rebuilt.
 *
 * Call this AFTER the owner has been placed back at their queue spot, so the pet
 * lands in the world rather than on the sands.
 */
export function restoreMatchPet(
  ctx: SimContext,
  owner: Entity,
  snap: MatchPetSnapshot | null | undefined,
): void {
  if (!snap) return;
  const pet = ctx.entities.get(snap.petId);
  if (!pet || pet.kind !== 'mob' || pet.ownerId !== owner.id || !pet.dead) return;
  // Auras are deliberately untouched, exactly like the Revive Pet command: the
  // death already unwound every stat aura's hp contribution and filtered the list
  // to what survives a death by design (aurasSurvivingDeath), so a second pass here
  // would double-unwind maxHp and shed penalties the death was meant to keep.
  pet.dead = false;
  pet.hostile = false;
  pet.aiState = 'idle';
  pet.aggroTargetId = null;
  pet.inCombat = false;
  pet.corpseTimer = 0;
  pet.respawnTimer = 0;
  pet.loot = null;
  pet.lootable = false;
  pet.tappedById = null;
  pet.petManualTauntPending = false;
  pet.petPath = [];
  pet.petPathCooldown = 0;
  clearThreat(pet);
  pet.pos = ctx.groundPos(owner.pos.x + 2, owner.pos.z + 1);
  pet.prevPos = { ...pet.pos };
  ctx.rebucket(pet);
  pet.hp = Math.max(1, Math.min(pet.maxHp, Math.round(snap.hp) || pet.maxHp));
  ctx.emit({
    type: 'log',
    text: `${pet.name} returns to your side.`,
    color: '#8f8',
    pid: owner.id,
  });
}
