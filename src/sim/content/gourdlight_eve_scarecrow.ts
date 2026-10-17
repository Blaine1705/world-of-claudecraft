// Gourdlight Eve's field boss (data only): Old Thatchgrin, the scarecrow that walks
// the pumpkin patch past Boar Meadow while the event runs, his crows and his
// strawlings, his telegraphed kit, and what he pays. The rules live in
// src/sim/seasonal/ (scarecrow.ts raises and clears him with the event,
// scarecrow_kit.ts runs his fight, scarecrow_field.ts finds his field).
//
// TUNING, sourced, never invented (the root CLAUDE.md rule):
//   - Melee, armour and the health ladder are THE WAKING WARDEN's (content/realm.ts):
//     the shipped level-20 named open-world elite built for "bring a friend, bring two",
//     run through the open-world curve (mob/open_world_tuning.ts) at spawn exactly as a
//     camp spawn of it is. That curved level-20 pool is his SOLO pool.
//   - The pool grows per extra participant by Balgath's world-boss step ratio
//     (world_boss.ts: 3 500 on a 24 000 base) and caps at Balgath's cap ratio, so a
//     crowd scales the fight the way it scales every world boss, without the bar
//     visibly refilling as people trickle in.
//   - The enrage is the Warden's (below 30%, x1.35 damage, x1.25 haste).
//   - Every telegraphed hit borrows the matching Balgath number (content/zone2.ts), with
//     Balgath's own level scale (x3 at level 20, mob/mechanic_level_scale.ts): the thrown
//     gourd is his Boulder Toss (windup, radius, range), the burning chaff is his Molten
//     Fen pool (seconds, interval, damage).
//   - The crows ride the Hollow Crypt's Carrion Crow ladder, the strawlings the Crow
//     Caller's (content/hollow_crypt_trash.ts), both at the boss's level band and
//     without the elite flag: they are encounter adds, which keep authored health.
//   - The cosmetic's drop chance is a design placeholder in the buddy-drop convention
//     (content/buddy_sources.ts: CALIBRATE), never power.
//
// Everything he pays is cosmetic or event currency: no stat, no gear, no power.
import type { ItemDef, MobTemplate } from '../types';
import { GOURDLIGHT_EVE_ID, GOURDLIGHT_POUCH_SWEETS } from './gourdlight_eve';

export const THATCHGRIN_ID = 'gourdlight_thatchgrin';
export const GOURDLIGHT_CROW_ID = 'gourdlight_crow';
export const STRAWLING_ID = 'gourdlight_strawling';

/** His daily spoils: a sack of sweets (opened like the rounds pouch). */
export const THATCHGRIN_SACK_ID = 'thatchgrin_sweet_sack';
/** The cosmetic: a charm that turns its user into a strawling for a short while. */
export const STRAWLING_CHARM_ID = 'strawling_charm';
/** The charm's look (a seasonal_cosmetic aura the client draws as a body swap). */
export const STRAWLING_GUISE_AURA_ID = 'gourdlight_trick_strawling';
export const STRAWLING_GUISE = Object.freeze({
  id: STRAWLING_GUISE_AURA_ID,
  name: 'Strawling Guise',
  duration: 30,
});

/** The sack holds two rounds pouches' worth: one kill pays a full day of rounds. */
export const THATCHGRIN_SACK_SWEETS = GOURDLIGHT_POUCH_SWEETS * 2;
/** CALIBRATE: the charm's per-contributor drop chance (a cosmetic, never power). */
export const STRAWLING_CHARM_CHANCE = 0.05;

/** Animation and render cue ids (the `ability` on every event his kit emits). */
export const THATCHGRIN_GOURD_ABILITY = 'mob_thatchgrin_gourd';
export const THATCHGRIN_CHAFF_ABILITY = 'mob_thatchgrin_chaff';
export const THATCHGRIN_SUMMON_ABILITY = 'mob_thatchgrin_summon';

/** His encounter kit (scarecrow_kit.ts). Numbers per the header's sources. */
export const THATCHGRIN_KIT = Object.freeze({
  /** Kindled Gourd: Balgath's Boulder Toss, re-aimed at anyone (not only the far). */
  gourd: {
    name: 'Kindled Gourd',
    every: 16,
    /** First throw this long into the pull, so the opener is a melee read. */
    first: 7,
    windup: 2.2,
    radius: 5,
    maxRange: 60,
    /** One gourd per this many living players in range, at least one, at most `maxCount`. */
    playersPerGourd: 2,
    maxCount: 3,
    min: 46,
    max: 64,
    school: 'fire' as const,
  },
  /** Smoldering Chaff: each gourd's landing burns on as Balgath's Molten Fen pool. */
  chaff: {
    name: 'Smoldering Chaff',
    seconds: 8,
    interval: 1,
    radius: 3.5,
    min: 12,
    max: 18,
    school: 'fire' as const,
  },
  /** The calls: crows first, then strawlings, at falling health (once per pull each). */
  calls: [
    { atHpPct: 0.8, mobId: GOURDLIGHT_CROW_ID, count: 3, name: 'Crowcall' },
    { atHpPct: 0.6, mobId: STRAWLING_ID, count: 2, name: 'Chaff Rising' },
    { atHpPct: 0.4, mobId: GOURDLIGHT_CROW_ID, count: 3, name: 'Crowcall' },
    { atHpPct: 0.2, mobId: STRAWLING_ID, count: 2, name: 'Chaff Rising' },
  ],
  /** The summon's raised-arms windup before the adds land (his cast, his bark). */
  callWindup: 1.4,
  /** Seconds of quiet each telegraph holds after it lands (no two wind-ups share the ground). */
  spacing: 2,
});

/** His participant health scale: the Waking Warden's curved level-20 pool solo, then
 *  Balgath's per-player step and cap as RATIOS of it (scarecrow.ts computes the pool). */
export const THATCHGRIN_HP_STEP_RATIO = 3_500 / 24_000;
export const THATCHGRIN_HP_CAP_RATIO = 600_000 / 24_000;

/** Seconds his lootable corpse lingers (the world-boss window is 15 minutes; his field
 *  rises again sooner, so a smaller crowd can take him twice in an evening). */
export const THATCHGRIN_CORPSE_SECONDS = 300;
/** Seconds after his corpse is gone before he stands up in his field again. */
export const THATCHGRIN_RESPAWN_SECONDS = 300;

export const GOURDLIGHT_SCARECROW_MOBS: Record<string, MobTemplate> = {
  [THATCHGRIN_ID]: {
    id: THATCHGRIN_ID,
    name: 'Old Thatchgrin',
    minLevel: 20,
    maxLevel: 20,
    family: 'elemental',
    // A world boss in the system's sense: personal loot for every contributor, the
    // daily loot lockout, participant health scaling. Raised by the seasonal module,
    // never by the world-boss scheduler (he is in no WORLD_BOSSES slot).
    worldBoss: true,
    seasonalEvent: GOURDLIGHT_EVE_ID,
    boss: true,
    elite: true,
    ccImmune: true,
    untameable: true,
    // He stands guard over his patch while idle instead of wandering out of it.
    idleStationary: true,
    // No kiting him into town: past this from his post he evades home.
    hardLeashRadius: 40,
    // The Waking Warden's ladder (header).
    hpBase: 420,
    hpPerLevel: 60,
    dmgBase: 18,
    dmgPerLevel: 4.0,
    attackSpeed: 2.1,
    armorPerLevel: 32,
    moveSpeed: 6,
    aggroRadius: 10,
    // He towers: about three players tall, so a player's melee reaches him from his
    // body's edge and his scythe from one yard past it (combat/player_attack_reach.ts).
    bodyRadius: 1.8,
    enrage: { belowHpPct: 0.3, dmgMult: 1.35, hasteMult: 1.25 },
    mechanicLevelScale: { fromLevel: 6, toLevel: 20, toMult: 3 },
    quietMechanics: true,
    yells: {
      engage: 'Off my field! The harvest is MINE!',
      summon: 'Up, up, little ones! Pick them clean!',
      enrage: 'Burn the stubble! Burn it ALL!',
    },
    // Personal loot (world_boss.ts rollWorldBossLoot): the sack always, the charm rarely.
    loot: [
      { itemId: THATCHGRIN_SACK_ID, chance: 1 },
      { itemId: STRAWLING_CHARM_ID, chance: STRAWLING_CHARM_CHANCE },
    ],
    // Falls apart into a heap of straw and lies in the stubble for his corpse window,
    // then settles into it rather than blinking out (mob/boss_corpse_sink.ts).
    corpseSink: { seconds: 4, depth: 2 },
    scale: 1,
    color: 0xc98a2e,
  },
  [GOURDLIGHT_CROW_ID]: {
    id: GOURDLIGHT_CROW_ID,
    name: 'Gourdlight Crow',
    minLevel: 18,
    maxLevel: 19,
    family: 'beast',
    // The Carrion Crow's ladder (header).
    hpBase: 18,
    hpPerLevel: 7,
    dmgBase: 3,
    dmgPerLevel: 1,
    attackSpeed: 2,
    armorPerLevel: 4,
    moveSpeed: 11,
    aggroRadius: 12,
    untameable: true,
    blind: { chance: 0.08, miss: 0.2, duration: 4, name: 'Gouging Beak', school: 'physical' },
    loot: [],
    scale: 1,
    color: 0x2b2830,
  },
  [STRAWLING_ID]: {
    id: STRAWLING_ID,
    name: 'Strawling',
    minLevel: 18,
    maxLevel: 19,
    family: 'elemental',
    // The Crow Caller's ladder without the elite flag (header).
    hpBase: 42,
    hpPerLevel: 17,
    dmgBase: 6,
    dmgPerLevel: 1.8,
    attackSpeed: 2.2,
    armorPerLevel: 12,
    moveSpeed: 7,
    aggroRadius: 12,
    untameable: true,
    loot: [],
    scale: 1,
    color: 0xd8b25a,
  },
};

export const GOURDLIGHT_SCARECROW_ITEMS: Record<string, ItemDef> = {
  [THATCHGRIN_SACK_ID]: {
    id: THATCHGRIN_SACK_ID,
    name: "Thatchgrin's Sweet Sack",
    kind: 'tool',
    quality: 'rare',
    use: { type: 'container', container: 'thatchgrin_sack' },
    stackSize: 10,
    sellValue: 0,
    soulbound: true,
    noVendorSell: true,
    noSalvage: true,
  },
  [STRAWLING_CHARM_ID]: {
    id: STRAWLING_CHARM_ID,
    name: 'Strawling Charm',
    kind: 'tool',
    quality: 'epic',
    use: { type: 'seasonal', action: 'strawlingCharm' },
    unique: true,
    sellValue: 0,
    soulbound: true,
    noVendorSell: true,
    noSalvage: true,
  },
};
