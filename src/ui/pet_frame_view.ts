// Pure derivation for the PET unit frame: resolve the player's own pet out of the
// entity roster and map it onto a UnitFrameDescriptor the shared unit_frame family
// paints. DOM-free, i18n-free (the localized "Dead" string arrives as a parameter,
// the same way party_frames.ts takes its `format` callback), deterministic.
//
// The pet frame is a further INSTANCE of the unit_frame family, not a new one: this
// core only decides WHICH entity is the pet and what its descriptor looks like, and
// unit_frame.ts / unit_frame_painter.ts do the rest unchanged.
//
// Why the roster scan lives here rather than in hud.ts: the same resolution is
// needed by the HUD (frame + pet action bar) and by the target-pet keybind in
// main.ts, and a pet is not addressable any other way. A pet is an ordinary mob
// entity whose ownerId is its owner's entity id (src/sim/pet/pet_commands.ts,
// petOf), so ownership is re-derived from the roster on both hosts identically.

import type { UnitFrameDescriptor } from './unit_frame';

/** The entity fields the pet frame reads. Structural on purpose: the offline Sim
 *  and the online ClientWorld both hold full `Entity` records, and a test can pass
 *  a plain object. */
export interface PetFrameUnit {
  id: number;
  kind: string;
  ownerId: number | null;
  templateId: string;
  name: string;
  hp: number;
  maxHp: number;
  dead: boolean;
}

/**
 * The player's own pet, or null when they have none.
 *
 * DEAD pets are returned deliberately: a hunter's pet survives its owner's death as
 * a revivable corpse, and both the pet action bar (Revive) and this frame must keep
 * showing it. Delve companions are NOT excluded here, matching the roster scan this
 * replaces; the sim-side petOf excludes them, but the HUD never has.
 */
export function findOwnPet<T extends PetFrameUnit>(
  entities: Iterable<T>,
  playerId: number,
): T | null {
  for (const e of entities) {
    if (e.kind === 'mob' && e.ownerId === playerId) return e;
  }
  return null;
}

/**
 * Fill a caller-owned descriptor for the pet frame. Allocation-light: the caller
 * keeps one long-lived descriptor and this rewrites its fields in place.
 *
 * Pets carry no power resource at all (createMob never sets resourceType), so the
 * resource group is always `none` and the frame paints hp only, exactly like the
 * target-of-target mini-frame.
 */
export function petFrameDescriptorInto(
  d: UnitFrameDescriptor,
  pet: PetFrameUnit | null,
  deadText: string,
): UnitFrameDescriptor {
  if (!pet) {
    d.present = false;
    return d;
  }
  d.present = true;
  d.hpFrac = pet.hp / Math.max(1, pet.maxHp);
  d.hpText = pet.dead ? deadText : `${pet.hp} / ${pet.maxHp}`;
  d.showAbsorbText = false;
  d.resourceKind = 'none';
  d.resFrac = 0;
  d.resText = '';
  // The pet's level always tracks its owner's (syncPetLevel), so a level chip would
  // only ever restate the player frame's. The chip element exists for the family's
  // element set; null keeps it blank.
  d.levelText = null;
  d.name = pet.name;
  d.titlePre = '';
  d.titlePost = '';
  d.portraitKey = String(pet.id);
  d.absorb = null;
  d.dead = pet.dead;
  d.outOfRange = false;
  return d;
}
