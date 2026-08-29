// The two legendary drops from the Ignivar raid (Varkhul the Forgefather):
// handover wiring so both exist in game and equip correctly. Neither sits in
// any loot table yet; they are obtainable via /dev give only, and the final
// stat pass (procs, set hooks, drop wiring, Reliquary page) lands with the
// raid loot work. The placeholder numbers below sit exactly on the item-budget
// curves at the kingsbane_last_oath legendary tier (item level 33):
// - forgebreaker: primary stats round(44 * TWOHAND_STAT_MULT 1.3) = 57; the
//   authored 55-82 at speed 3.6 is 19.03 dps, within rounding of the
//   weaponDpsBudget(33) * TWOHAND_DPS_MULT 1.15 target (19.09).
// - emberward: primary stats round(33 * 1.9 * SLOT_STAT_MULT.offhand 0.75 *
//   STAT_PER_ILVL 0.7) = 33; blockValue/armor extrapolate the shield ladder
//   (buckler 6 / wallshield 14 / bonewrought 30 at epic ilvl 29) one tier up.
// Until the drop wiring lands, itemLevel() resolves undefined for both (no
// loot source), so the budget sweeps skip these records; the loot PR must
// re-derive every number above against the realized item level from Varkhul's
// own boss level and add the Reliquary page in the same change.
import type { ItemDef } from '../types';

/** The handover placeholders above, as a set: gear pickers that argmax over
 *  the whole ITEMS table (the PBE boost BiS kit) must skip anything a player
 *  cannot actually obtain yet, and table membership is the reliable test for
 *  that (the source index misses vendor/quest paths, so "no derivable source"
 *  is not). Delete entries here when the raid loot wiring makes them real. */
export const IGNIVAR_DROP_PLACEHOLDER_IDS: ReadonlySet<string> = new Set([
  'varkhul_forgebreaker',
  'varkhul_emberward',
]);

export const IGNIVAR_DROP_ITEMS: Record<string, ItemDef> = {
  varkhul_forgebreaker: {
    id: 'varkhul_forgebreaker',
    name: 'Forgebreaker, Engine of Varkhul',
    kind: 'weapon',
    slot: 'mainhand',
    hand: 'twohand',
    quality: 'legendary',
    weapon: { min: 55, max: 82, speed: 3.6 },
    stats: { str: 26, sta: 19, agi: 12 },
    sellValue: 26000,
    // Every class that swings a two-handed mace in the era rules: warrior,
    // paladin, shaman, and the feral druid ladder; rogue stays excluded from
    // every two-hander (tests/twohand_itemization_v026.test.ts).
    requiredClass: ['warrior', 'paladin', 'shaman', 'druid'],
  },
  varkhul_emberward: {
    id: 'varkhul_emberward',
    name: 'Emberward, Bulwark of Varkhul',
    kind: 'armor',
    armorType: 'mail',
    slot: 'offhand',
    shield: true,
    quality: 'legendary',
    blockValue: 42,
    stats: { armor: 950, sta: 19, str: 14 },
    sellValue: 20000,
    requiredClass: ['warrior', 'paladin', 'shaman'],
  },
};
