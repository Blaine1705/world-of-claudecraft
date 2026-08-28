// The battleground corpse hold: keep an owned demon corpse from unravelling
// while a dead fighter inside an ACTIVE match is still owed exactly this pet
// back on the next respawn wave.
//
// Why: waves run every BG_WAVE_PERIOD (10s) but an owned demon corpse decays
// 3s after death (the demon arm of updateMob in mob/locomotion.ts), so almost
// every wave found the corpse already gone and restorePetReturn took the
// REBUILD arm: a brand-new entity id per wave, per warlock. Each rebuild made
// every nearby client drop its old character view and mint a fresh one (entity,
// rig, nameplate, wire spawn) for what is visually the same demon, a steady
// main-thread hitch source on event evenings. Holding the corpse makes the
// revive-in-place arm apply instead: same entity, same client view, no churn,
// and identical player-visible behavior to a death that lands within 3s of the
// wave today. The consult sits in the shared owned demon/undead unravel branch,
// so a temporary necromancy undead is held on exactly the same terms as a
// demon: deliberate, the wave owes it back the same way.
//
// The hold is deliberately NARROW, mirroring the pet_return keying doctrine
// (only what the world took is owed back):
// - only while the owner is DEAD: the moment they are raised the restore has
//   already consumed the snapshot, and any corpse still standing resumes decay;
// - only while the owner's deathPet snapshot names THIS corpse: a pet that was
//   already dead when its owner fell, or one the owner dropped themselves, was
//   never owed and is never held;
// - only inside a match in the 'active' state: desertion, the end-of-match
//   result hold, and the open world all decay exactly as before.
// Within those bounds the hold has no clock of its own: an unreleased corpse
// holds its demon until the owner is raised or the match leaves 'active'. That
// is deliberate, not an oversight: the wave is not the only way up (a teammate
// resurrection consumes the same snapshot and takes the same in-place arm), and
// the demon corpse lying beside its owner's own corpse is coherent for exactly
// as long as that owner stays down.
//
// The caller FREEZES corpseTimer rather than gating only the unravel: the wire
// mirrors corpse decay as a flag keyed on corpseTimer (server/game.ts `cd`,
// consumed by entityViewIsAdmitted), so a decayed read would make every client
// drop the corpse's view mid-hold and rebuild it at the wave, which is the
// exact churn the hold exists to remove.
//
// `src/sim`-pure and rng-free: no DOM/Three/render/ui/game/net imports, no
// Math.random/Date.now, and no draw sites (a read-only predicate).

import type { SimContext } from '../sim_context';
import type { Entity } from '../types';

/**
 * True while `pet`'s corpse must be held for a battleground respawn wave to
 * revive in place: it is a CORPSE whose owner is a dead fighter in an ACTIVE
 * match and whose owner-death snapshot still names this exact pet. A living
 * pet is never held (guarded here, not only at the call site, because this is
 * an exported predicate and a second caller must get the same answer).
 */
export function holdPetCorpseForBgWave(ctx: SimContext, pet: Entity): boolean {
  if (!pet.dead || pet.ownerId === null) return false;
  const owner = ctx.entities.get(pet.ownerId);
  if (owner?.kind !== 'player' || !owner.dead) return false;
  const snap = ctx.players.get(owner.id)?.deathPet;
  if (!snap || snap.petId !== pet.id || snap.unravelled) return false;
  // Allocation-free on purpose: this runs per tick for every held corpse AND
  // for the whole 3s decay window of an open-world warlock death, so the
  // general bgActiveMatchForFighter helper is out (it spreads both teams into
  // a fresh array per call and walks every match on its miss path). The
  // per-pid index is authoritative for a seated fighter and these reads
  // allocate nothing; a stale index entry simply fails the hold and the
  // corpse decays exactly as before the hold existed.
  const match = ctx.bgMatches.get(owner.id);
  if (match?.state !== 'active') return false;
  return match.teams[0].includes(owner.id) || match.teams[1].includes(owner.id);
}
