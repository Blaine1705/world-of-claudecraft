// Skin-driven attack-clip substitution: the clip set and time scale a
// DISPLAYED weapon skin swaps in for a visual's authored attack.
//
// The hunter's authored attack is 2H_Ranged_Shoot, a crossbow shoulder-aim
// (the class ranged visual is a crossbow). With a BOW skin displayed the shot
// plays the purpose-built Bow_Draw_Shot clip instead. The clip is assembled
// from KayKit donor poses and shipped to the hunter via the bow_anims.glb
// animUrls entry (scripts/build_bow_anims.mjs). Crossbow skins keep the
// authored shoulder-aim.
//
// Pure over the skin catalog: no DOM, no three, Node-tested directly
// (tests/weapon_skins.test.ts). CharacterVisual is the one consumer.

import { WEAPON_SKINS, type WeaponSkinDef } from '../../sim/content/weapon_skins';

export interface SkinAttackClips {
  clips: readonly string[];
  /** Omitted to keep the visual's own `attackTimeScale`. A substitution that
   *  names the clip a rig ALREADY authors (the ranged shot on the hunter) must
   *  not also re-time it, or applying a skin would change the shot's speed. */
  timeScale?: number;
}

/** Typed renderer-event correlation for player ranged attacks. The launch cue
 * starts whichever attack clip the live CharacterVisual selects (bow override
 * or authored crossbow/default); the matching impact marker prevents replay. */
export function playerRangedAttackStartsAtLaunch(
  sourceKind: string | undefined,
  attackAnimation: string | undefined,
): boolean {
  return sourceKind === 'player' && attackAnimation === 'ranged-shot';
}

export function playerRangedAttackAlreadyStarted(
  sourceKind: string | undefined,
  attackAnimationStarted: boolean | undefined,
): boolean {
  return sourceKind === 'player' && attackAnimationStarted === true;
}

const BOW_ATTACK: SkinAttackClips = {
  clips: ['Bow_Draw_Shot'],
  timeScale: 1.0,
};

// Crossbow handling (real crossbows and the bow-slot guns that aim like them)
// asks for the KayKit shoulder-aim by NAME rather than leaning on the rig's
// authored attack. On the hunter that IS the authored attack, so this resolves
// to the same clip at the same speed (timeScale omitted above). It matters on
// every OTHER body that can display a ranged skin: the Combat Mech authors a
// melee chop, and both rigs ship 2H_Ranged_Shoot in their GLB, so naming it
// here is what makes the mech shoulder the weapon instead of clubbing with it.
const RANGED_ATTACK: SkinAttackClips = {
  clips: ['2H_Ranged_Shoot'],
};

// Every clip a displayed weapon skin can substitute for the authored attack.
// CharacterVisual binds these alongside the def's own clip names, which is what
// reaches a clip the rig's ClipMap never names (2H_Ranged_Shoot on the mech).
// A rig that ships neither simply binds no action, and pickSkinAttackClips
// hands the caller back its authored attack.
export const SKIN_ATTACK_CLIP_NAMES: readonly string[] = ['Bow_Draw_Shot', '2H_Ranged_Shoot'];

/** How a ranged skin is held and fired: its weapon type, unless the def
 *  carries a `handling` override (a bow-slot gun aims like a crossbow). */
export function weaponSkinHandling(skin: WeaponSkinDef): string {
  return skin.handling ?? skin.weaponType;
}

/** The attack-clip override for a displayed weapon skin, or null to keep the
 *  visual's authored attack. Keyed off the skin's HANDLING, not its store
 *  slot: a bow-slot skin with crossbow handling keeps the shoulder-aim. Melee
 *  skins never substitute, so a sword skin swings whatever the rig authors. */
export function weaponSkinAttackClips(weaponSkinId: string | null): SkinAttackClips | null {
  const skin = weaponSkinId ? WEAPON_SKINS[weaponSkinId] : null;
  if (!skin) return null;
  const handling = weaponSkinHandling(skin);
  if (handling === 'bow') return BOW_ATTACK;
  return handling === 'crossbow' ? RANGED_ATTACK : null;
}

/** The substitution above, resolved against the clips a RIG actually bound.
 *  `has` answers whether a clip name resolved to a live action on this visual.
 *
 *  Only the hunter ships bow_anims.glb (the one animUrls entry in the
 *  manifest), so on any other rig displaying a bow skin, Bow_Draw_Shot is
 *  never bound. Substituting it there is worse than not substituting at all:
 *  the clip list REPLACES the authored attack, and playOneShot no-ops on a
 *  missing action, so the body plays nothing at all when it swings. The
 *  Combat Mech is the live case, being the one body that shows a hunter's
 *  equipped weapon. Returning null hands the caller back its authored attack.
 *
 *  All-or-nothing per skin: a partially-bound list would play a subset of an
 *  authored sequence, which is a different animation, not a degraded one. */
export function pickSkinAttackClips(
  weaponSkinId: string | null,
  has: (clip: string) => boolean,
): SkinAttackClips | null {
  const spec = weaponSkinAttackClips(weaponSkinId);
  if (!spec) return null;
  return spec.clips.every(has) ? spec : null;
}

export type SkinOrientPinMode = 'aimDuringShot' | 'carryOutsideShot';

/** The orientation pin a displayed skin takes (CharacterVisual
 *  applySkinOrientation): bows pin to the upright aim WHILE the shot one-shot
 *  plays (the string hand would roll them sideways mid-draw); bow-slot guns
 *  (crossbow handling) pin to a forward carry OUTSIDE the shot (the hanging
 *  idle arm points them at the ground) and follow the hand-tuned grip during
 *  the shouldered aim. True crossbow-slot skins take no pin. */
export function weaponSkinOrientPin(weaponSkinId: string | null): SkinOrientPinMode | null {
  const skin = weaponSkinId ? WEAPON_SKINS[weaponSkinId] : null;
  if (!skin) return null;
  const handling = weaponSkinHandling(skin);
  if (handling === 'bow') return 'aimDuringShot';
  if (skin.weaponType === 'bow' && handling === 'crossbow') return 'carryOutsideShot';
  return null;
}

/** The handslot a ranged skin occupies, by HANDLING. Bows sit in the LEFT
 *  hand: in the ranged animation set the left arm is the FRONT arm (it
 *  extends toward the target) and the right hand stays back at the shoulder
 *  as the string hand, so a bow glued to the right hand reads backwards.
 *  Crossbow handling (real crossbows, and guns that aim like them) keeps the
 *  class's authored right-hand attach (stock in the trigger hand). */
export function weaponSkinAttachBone(handling: string, baseBone: string): string {
  return handling === 'bow' ? baseBone.replace(/\.r$/, '.l') : baseBone;
}
