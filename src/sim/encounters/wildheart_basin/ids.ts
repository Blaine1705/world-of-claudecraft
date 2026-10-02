// The Wildheart Basin's encounter ids and tuning, as a dependency-free leaf:
// the content (wildheart.ts), the encounter modules, the trash kit's death
// clouds (mob/trash_kit/wildheart_kit.ts), the dev helpers, the renderer's
// telegraphs and the tests all key on these.
//
// docs/design/dungeon-rework/wildheart_basin.md sections 4 and 5.

export const WILDHEART_DUNGEON = 'wildheart_basin';

/** The three bosses, in route order (their cores are phase B). The Fanglord
 *  Beastmaster fights beside his Great Jaguar (one pack). */
export const BEASTMASTER_ID = 'wildheart_beastmaster';
export const FANGLORD_JAGUAR_ID = 'fanglord_jaguar';
export const GORGEBLOOM_ID = 'the_gorgebloom';
export const ZULGAR_ID = 'wildheart_high_priest';
/** The showpiece patrol of the River Ford, and the rider its howdah drops. */
export const GREAT_SAURIAN_ID = 'great_saurian';
export const HOWDAH_HEXCALLER_ID = 'howdah_hexcaller';
/** The trash. */
export const STALKER_ID = 'wildheart_stalker';
export const RAVAGER_ID = 'wildheart_ravager';
export const HEXCALLER_ID = 'wildheart_hexcaller';
export const TOTEM_BINDER_ID = 'sunbone_totem_binder';
export const SUNBONE_TOTEM_ID = 'sunbone_totem';
export const BASIN_RAPTOR_ID = 'basin_raptor';
export const SPORE_TOAD_ID = 'spore_toad';
export const VINE_LASHER_ID = 'vine_lasher';

// ---- the Great Saurian (section 4.3) -------------------------------------------

/** Tail Swipe: a sweep of its tail through a rear cone, with a knockback. */
export const SAURIAN_TAIL_SWIPE = 'wildheart_saurian_tail_swipe';
/** Earthshaking Stomp: a telegraphed stomp round it that knocks everyone down. */
export const SAURIAN_STOMP = 'wildheart_saurian_stomp';
/** The knockdown an Earthshaking Stomp leaves (a short stun). */
export const SAURIAN_KNOCKDOWN = 'wildheart_saurian_knockdown';
/** Howdah Rider: the moment the howdah breaks and its rider jumps down (a
 *  `nova` spellfx on the Saurian; the renderer drops the howdah from the
 *  model while the Saurian stays under half health or fights on). */
export const SAURIAN_HOWDAH_BREAK = 'wildheart_saurian_howdah_break';
/** The Saurian's Enrage under a fifth of its health (a damage-done aura). */
export const SAURIAN_ENRAGE = 'wildheart_saurian_enrage';

/**
 * The Saurian's numbers (normal; heroic scales the damage through the claim's
 * mechanicDamageMult). Damage is stated LANDED on a level-20 cloth wearer of
 * about 950 health (README section 7): Tail Swipe about 21 percent, the Stomp
 * about 19 percent, both avoidable.
 */
export const SAURIAN_TUNING = {
  /** Tail Swipe: every 12 s a 1 s bar, then a rear 120 degree cone 12 yd deep. */
  tailEvery: 12,
  tailFirst: 5,
  tailCast: 1,
  tailRange: 12,
  tailArcDeg: 120,
  tailMin: 180,
  tailMax: 220,
  /** Yards the Tail Swipe throws a player. */
  tailKnockback: 8,
  /** Earthshaking Stomp: every 16 s a 2 s bar, then 12 yd round it. */
  stompEvery: 16,
  stompFirst: 9,
  stompCast: 2,
  stompRadius: 12,
  stompMin: 160,
  stompMax: 200,
  /** The knockdown (a stun) on everyone the Stomp lands on. */
  knockdown: 1,
  /** Howdah Rider: the howdah breaks at half health. */
  howdahAtHpPct: 0.5,
  /** Enrage under a fifth of its health: 30 percent more damage. */
  enrageAtHpPct: 0.2,
  enrageDamage: 0.3,
} as const;

/** The Saurian's chat line when the howdah breaks (re-localized by src/ui/sim_i18n.ts). */
export const SAURIAN_HOWDAH_LOG =
  'The howdah splinters! A Howdah Hexcaller leaps down to tend the Great Saurian.';

// ---- encounter objects: their template id carries their look -----------------

/** A Spore Burst cloud on the floor where a Spore Toad died (scale = radius). */
export const WILDHEART_SPORE_CLOUD = 'wildheart_spore_cloud';
