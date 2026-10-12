import { VARKHUL_BOSS_ID } from './ignivar_raid_ids';
import { EMBERWAKE_MOUTH_FORWARD_PER_SCALE, MELEE_RANGE } from './types';

export type MobCombatProfile = {
  meleeRange: number;
  desiredRange: number;
  chaseSpeedMult: number;
  canLeash: boolean;
  swingWhilePursuing: boolean;
  immediateSwingOnEnterRange: boolean;
  movingRangeBonus: number;
};

// Every melee mob fights hit-and-run: it swings from effective reach while
// continuing to close to desiredRange (80% of reach), so it tracks a moving
// target fluidly instead of stopping at max reach to trade blows. The chase
// speed stays 1 (pursuit is about swinging mid-step, not a speed buff) and the
// stationary walk-past fix is preserved via movingRangeBonus.
export const DEFAULT_MOB_COMBAT_PROFILE: MobCombatProfile = {
  meleeRange: MELEE_RANGE,
  desiredRange: MELEE_RANGE * 0.8,
  chaseSpeedMult: 1,
  canLeash: true,
  swingWhilePursuing: true,
  immediateSwingOnEnterRange: true,
  movingRangeBonus: 1,
};

export const NYTHRAXIS_BOSS_COMBAT_PROFILE: MobCombatProfile = {
  meleeRange: 8,
  desiredRange: 5,
  chaseSpeedMult: 1.5,
  canLeash: false,
  swingWhilePursuing: true,
  immediateSwingOnEnterRange: true,
  movingRangeBonus: 0,
};

export const NYTHRAXIS_ADD_COMBAT_PROFILE: MobCombatProfile = {
  meleeRange: 6,
  desiredRange: 4.5,
  chaseSpeedMult: 1.45,
  canLeash: false,
  swingWhilePursuing: true,
  immediateSwingOnEnterRange: true,
  movingRangeBonus: 0,
};

export function scaledDefaultMobMeleeRange(scale: number): number {
  return MELEE_RANGE + Math.max(0, scale - 1) * 3;
}

// ---------------------------------------------------------------------------
// Player-side reach against oversized bodies (the "hitbox" of a colossal mob).
//
// Every player melee check measures CENTRE TO CENTRE against a flat MELEE_RANGE
// (5yd). That is correct for a mob the size of a person, and nonsense for a body
// the size of a building: a dragon parks with his HEAD over you, which leaves
// his origin, the point every range check measures to, some 30yd back inside
// his ribs, and every swing answers "Out of range."
//
// The fix is a per-template BODY BOX: a rough ellipse laid along the mob's own
// facing (`along` runs nose-to-tail, `across` is the flank half-width), and the
// player's reach is MELEE_RANGE plus however far that box extends in the player's
// direction. It is direction-aware on purpose, standing at his jaw or his tail
// is melee, standing the same distance off his flank is not, which keeps a
// 40yd-long body from turning into a 40yd-radius circle of free hits.
//
// Deliberately a small explicit table, not a scale formula: visual size and
// combat reach are decoupled everywhere else in this file (Thunzharr, the
// Dunefather), and a blanket scale rule would silently widen every large mob in
// the game. Add a body here only when its model genuinely swallows melee.
type MeleeHitbox = { along: number; across: number };
const MELEE_HITBOX: Record<string, MeleeHitbox> = {
  // Vaelgrath: his jaw leads his origin by ~31yd (EMBERWAKE_MOUTH_FORWARD_PER_SCALE
  // x scale 6) and the tail trails behind it, so nose-to-tail he is the better part
  // of 70yd of dragon. `along` covers the jaw (the contact point his combat profile
  // below parks on the player) with a couple of yards to spare; `across` is a torso
  // half-width, so the flank is still a place you have to walk to.
  emberwake_vaelgrath: { along: 34, across: 12 },
};

/** Extra yards of reach a player gets when swinging at this mob's body, in the
 *  direction they are standing. `from` is the attacker's position; without it
 *  (no spatial context) the box's full length is granted, which is the same
 *  permissive answer the flat bonus used to give. */
export function meleeHitboxBonus(
  target: {
    kind?: string;
    templateId?: string;
    facing?: number;
    pos?: { x: number; z: number };
  } | null,
  from?: { x: number; z: number },
): number {
  if (!target || target.kind !== 'mob') return 0;
  const box = MELEE_HITBOX[target.templateId ?? ''];
  if (!box) return 0;
  if (!from || !target.pos || target.facing === undefined) return box.along;
  const dx = from.x - target.pos.x;
  const dz = from.z - target.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-3) return box.along;
  // Component of the attacker's bearing along the body axis vs across it. The
  // radius of the ellipse in that direction is the reach the body itself adds.
  const fwd = (dx * Math.sin(target.facing) + dz * Math.cos(target.facing)) / d;
  const side = Math.sqrt(Math.max(0, 1 - fwd * fwd));
  return Math.hypot(box.along * fwd, box.across * side);
}

/** A player's melee reach against a specific body (flat range + its hitbox). */
export function playerMeleeRangeTo(
  target: {
    kind?: string;
    templateId?: string;
    facing?: number;
    pos?: { x: number; z: number };
  } | null,
  from?: { x: number; z: number },
): number {
  return MELEE_RANGE + meleeHitboxBonus(target, from);
}

/** An ability's effective range against a specific body. Only MELEE-ranged
 *  abilities (range <= MELEE_RANGE, including the range-0 "melee" default) grow
 *  with the target's hitbox; a 30yd bolt is already measured from far outside
 *  the silhouette and must not creep further. */
export function abilityRangeTo(
  baseRange: number,
  target: {
    kind?: string;
    templateId?: string;
    facing?: number;
    pos?: { x: number; z: number };
  } | null,
  from?: { x: number; z: number },
): number {
  return baseRange <= MELEE_RANGE ? baseRange + meleeHitboxBonus(target, from) : baseRange;
}

// Thunzharr is rendered oversized (scale 8 in zone3.ts) so he reads as a world boss, but
// his melee reach must NOT follow that visual scale (a scale-8 body would swing far past
// its model and reach kiters, trivializing the Howling Gale anti-kite snare). Pin his
// reach to a scale-5 body (~17yd): visual size and combat reach are decoupled.
const THUNZHARR_REACH_SCALE = 5;
// The Dunefather reads even larger on screen (a worm is mostly LENGTH), but his
// bite is pinned to a scale-4 body: the eruption/sweep/slam AoEs are the real
// reach, a giant melee swing on top would make the surface windows unplayable.
const SANDWORM_REACH_SCALE = 4;
// Vaelgrath is the one body whose reach is measured to his HEAD instead of to a
// ring around his origin. His mesh origin is the body CENTRE and the jaw leads
// it by EMBERWAKE_MOUTH_FORWARD_PER_SCALE per point of scale (~31yd at scale 6),
// so a reach sized to the origin made him close until the players were standing
// under his ribcage, staring up into wings, with the head and its telegraphs a
// hundred feet past them. Sizing his reach to the mouth offset instead parks him
// with the JAW over his target: the fight happens in front of a face, the breath
// wind-up is visible, and the whole animal is on screen. `desiredRange`, what
// locomotion actually closes to, is the mouth offset itself; the swing reach
// adds the jaw's own bite. Visual size and combat reach stay decoupled, exactly
// as they are for Thunzharr and the Dunefather; this is just decoupled to a
// different point on the model.
const EMBERWAKE_JAW_BITE = 8;

// Mob AI reads the profile several times per engaged mob per tick (the threat
// scan in updateMobTarget, the lookup that opens updateMobCombatProfile, and
// each melee-range probe in the pursuit/caster loops), and every non-hardcoded
// branch below built a fresh object literal on every read. A profile is a pure
// function of (templateId, scale), so cache it: bounded by the small number of
// distinct template/scale pairs actually spawned. Safe because no caller
// mutates the returned object, only reads its fields.
//
// scale is not always a small fixed set: rift.ts jitters it with
// `rng.range(0.92, 1.12)` per spawn, so an unbounded map would grow by one
// entry per rift mob for the life of the process. Cap the cache and evict the
// oldest entry (Map iterates in insertion order) past the cap so a long
// session of rift churn can't leak memory; a bounded miss just rebuilds the
// same value, it never changes behavior.
export const MAX_COMBAT_PROFILE_CACHE_ENTRIES = 2048;
const combatProfileCache = new Map<string, MobCombatProfile>();

export function combatProfileForMob(templateId: string, scale: number): MobCombatProfile {
  const key = `${templateId}:${scale}`;
  const cached = combatProfileCache.get(key);
  if (cached) return cached;
  const profile = buildCombatProfileForMob(templateId, scale);
  if (combatProfileCache.size >= MAX_COMBAT_PROFILE_CACHE_ENTRIES) {
    const oldestKey = combatProfileCache.keys().next().value;
    if (oldestKey !== undefined) combatProfileCache.delete(oldestKey);
  }
  combatProfileCache.set(key, profile);
  return profile;
}

/** Test-only: the live entry count, so a bound regression fails a test instead of a live process. */
export function combatProfileCacheSizeForTest(): number {
  return combatProfileCache.size;
}

function buildCombatProfileForMob(templateId: string, scale: number): MobCombatProfile {
  if (templateId === 'nythraxis_scourge_of_thornpeak') return NYTHRAXIS_BOSS_COMBAT_PROFILE;
  if (templateId === 'nythraxis_skeleton_warrior') return NYTHRAXIS_ADD_COMBAT_PROFILE;
  if (templateId === VARKHUL_BOSS_ID)
    return {
      ...DEFAULT_MOB_COMBAT_PROFILE,
      // Varkhul's scale-3.2 body needs long swing reach, but the active tank
      // must still be able to hit him while holding a crucible-beam lane.
      meleeRange: scaledDefaultMobMeleeRange(scale),
      desiredRange: 4.5,
    };
  if (templateId === 'wildheart_ravager')
    return {
      ...DEFAULT_MOB_COMBAT_PROFILE,
      // The scale-2 default settles at desiredRange 6.4 and swings out to 9,
      // so real landed hits read as whiffs into the ether. Keep the scaled
      // reach but close to visual contact before trading, the Nythraxis
      // meleeRange 8 / desiredRange 5 pattern.
      meleeRange: scaledDefaultMobMeleeRange(2),
      desiredRange: 5,
    };
  // The grown dragonkin (the broodlords at scale 2.25, Cindraleth at 2.85):
  // reach follows the body per the wildheart lesson (a big model on stock
  // reach swings through thin air), while desiredRange stays close so the
  // trade reads as contact, not ranged pawing.
  if (templateId === 'drakemaw_broodlord')
    return {
      ...DEFAULT_MOB_COMBAT_PROFILE,
      meleeRange: scaledDefaultMobMeleeRange(2.25),
      desiredRange: 5,
    };
  if (templateId === 'cindraleth_maw_matriarch')
    return {
      ...DEFAULT_MOB_COMBAT_PROFILE,
      meleeRange: scaledDefaultMobMeleeRange(2.85),
      desiredRange: 5.5,
    };
  // Grubjaw the Glutton at scale 2.275: same treatment as the grown
  // dragonkin, so the big body's swings land at visual contact instead of
  // pawing from stock humanoid reach.
  if (templateId === 'grubjaw')
    return {
      ...DEFAULT_MOB_COMBAT_PROFILE,
      meleeRange: scaledDefaultMobMeleeRange(2.275),
      desiredRange: 5,
    };
  if (templateId === 'wildheart_beastmaster')
    return {
      ...DEFAULT_MOB_COMBAT_PROFILE,
      // Same whiff geometry as the ravager, one size up (scale 2.35 settles
      // at 7.24): the pack-leader bruiser also closes to contact. Zulgar is
      // deliberately left on the scale default, the boss fight is built on
      // knockback/pulse spacing and his reach reads as boss presence.
      meleeRange: scaledDefaultMobMeleeRange(2.35),
      desiredRange: 5.5,
    };
  if (templateId === 'thunzharr_waking_peak')
    return {
      ...DEFAULT_MOB_COMBAT_PROFILE,
      meleeRange: scaledDefaultMobMeleeRange(THUNZHARR_REACH_SCALE),
      desiredRange: scaledDefaultMobMeleeRange(THUNZHARR_REACH_SCALE) * 0.8,
    };
  if (templateId === 'emberwake_vaelgrath') {
    const jaw = scale * EMBERWAKE_MOUTH_FORWARD_PER_SCALE;
    return {
      ...DEFAULT_MOB_COMBAT_PROFILE,
      meleeRange: jaw + EMBERWAKE_JAW_BITE,
      // Stop with the head ON them, not a jaw-length short of them.
      desiredRange: jaw,
    };
  }
  if (templateId === 'sandworm_dunefather')
    return {
      ...DEFAULT_MOB_COMBAT_PROFILE,
      meleeRange: scaledDefaultMobMeleeRange(SANDWORM_REACH_SCALE),
      desiredRange: scaledDefaultMobMeleeRange(SANDWORM_REACH_SCALE) * 0.8,
    };
  return {
    ...DEFAULT_MOB_COMBAT_PROFILE,
    meleeRange: scaledDefaultMobMeleeRange(scale),
    desiredRange: scaledDefaultMobMeleeRange(scale) * 0.8,
  };
}

// Closing-distance grace. A 20 Hz tick samples positions discretely, so a mob that
// is genuinely closing on its target can perpetually fall a fraction of a yard short
// of a strict range check. To bridge that, a mob that *moved this tick* (i.e. is
// pursuing) gets a small reach bonus. A stationary mob gets none: it is not closing,
// so a player merely walking past must only be struck from the mob's true melee
// range, never the inflated reach the old target-movement gate produced. This is the
// fix for "excessive melee range" - hits landing while the player seems out of reach
// when walking past packed camps.
export function effectiveMobMeleeRange(profile: MobCombatProfile, mobMoved: boolean): number {
  if (!mobMoved) return profile.meleeRange;
  return profile.meleeRange + profile.movingRangeBonus;
}
