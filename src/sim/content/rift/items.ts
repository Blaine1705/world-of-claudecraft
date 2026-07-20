import type { ItemDef } from '../../types';

export const RIFT_ESSENCE_ITEM_ID = 'rift_essence';
export const RIFT_GEM_IDS = ['rift_gem_crimson', 'rift_gem_azure', 'rift_gem_verdant'] as const;
export type RiftGemId = (typeof RIFT_GEM_IDS)[number];

export const RIFT_GEAR_ITEM_IDS = [
  'riftbound_band_of_might',
  'riftbound_band_of_insight',
  'riftbound_band_of_guile',
] as const;

/** The clear-time gear ladder above the rares: epics that only a B+ final-boss
 * kill can shed (guaranteed on A, doubled-chance on S) and the one legendary
 * chase item S-rank clears roll for. Granted by rift/progression.ts
 * addRiftClearGearLoot at the moment the clear completes, NEVER from static
 * loot tables, so a C-rank farm can never mint epics and the payout cadence is
 * bound by the ranked portal spawns (the economy stays sane). */
export const RIFT_EPIC_ITEM_IDS = [
  'emberforged_bulwark',
  'stormsunder_hood',
  'voidweave_mantle',
  'abysswrought_band',
] as const;
export const RIFT_LEGENDARY_ITEM_ID = 'heart_of_the_rift';

/** The world-drop rares each rift environment can shed: one signature piece per
 * procedural theme plus the two Infernal Citadel pieces. Trash carries a slim
 * chance and the environment's boss a fat one (loot tables in ./mobs.ts), so a
 * rift run always has real itemisation on the line, ranked runs and dev runs
 * alike. */
export const RIFT_RARE_ITEM_IDS = [
  'hoarfrost_edge',
  'emberforge_gauntlets',
  'broodmother_carapace',
  'bonelord_mantle',
  'graskbreaker_girdle',
  'voidscar_handwraps',
  'stormscale_treads',
  'abyssal_loop',
  'pactbound_vestments',
  'pitlords_cleaver',
] as const;

const HEAVY = ['warrior', 'paladin', 'shaman'] as ItemDef['requiredClass']; // plate/mail
const AGILE = ['rogue', 'hunter'] as ItemDef['requiredClass'];
const AGILE_WILD = ['rogue', 'hunter', 'druid'] as ItemDef['requiredClass'];
const CASTER = ['mage', 'priest', 'warlock', 'druid'] as ItemDef['requiredClass'];

/** Static shells. The non-fungible payload carries each drop's source, power,
 * upgrades, enchantment, sockets, gems, and rolled bonus stats. */
export const RIFT_ITEMS: Record<string, ItemDef> = {
  rift_essence: {
    id: 'rift_essence',
    name: 'Rift Essence',
    kind: 'tool',
    quality: 'rare',
    stackSize: 20,
    sellValue: 0,
    noMarketList: true,
  },
  rift_gem_crimson: {
    id: 'rift_gem_crimson',
    name: 'Crimson Rift Gem',
    kind: 'tool',
    quality: 'epic',
    stackSize: 20,
    sellValue: 0,
    noMarketList: true,
  },
  rift_gem_azure: {
    id: 'rift_gem_azure',
    name: 'Azure Rift Gem',
    kind: 'tool',
    quality: 'epic',
    stackSize: 20,
    sellValue: 0,
    noMarketList: true,
  },
  rift_gem_verdant: {
    id: 'rift_gem_verdant',
    name: 'Verdant Rift Gem',
    kind: 'tool',
    quality: 'epic',
    stackSize: 20,
    sellValue: 0,
    noMarketList: true,
  },
  riftbound_band_of_might: {
    id: 'riftbound_band_of_might',
    name: 'Riftbound Band of Might',
    kind: 'armor',
    slot: 'ring',
    quality: 'epic',
    requiredLevel: 20,
    stats: { str: 6, sta: 5 },
    sellValue: 5000,
    noMarketList: true,
  },
  riftbound_band_of_insight: {
    id: 'riftbound_band_of_insight',
    name: 'Riftbound Band of Insight',
    kind: 'armor',
    slot: 'ring',
    quality: 'epic',
    requiredLevel: 20,
    stats: { int: 6, spi: 5 },
    sellValue: 5000,
    noMarketList: true,
  },
  riftbound_band_of_guile: {
    id: 'riftbound_band_of_guile',
    name: 'Riftbound Band of Guile',
    kind: 'armor',
    slot: 'ring',
    quality: 'epic',
    requiredLevel: 20,
    stats: { agi: 6, sta: 5 },
    sellValue: 5000,
    noMarketList: true,
  },
  // ---- Themed world-drop rares (one per rift environment) ----
  // Stat lines sit a notch under the heroic five-man epics (heroic_loot.ts) and
  // inside the rare-quality budget for their level-20-25 sources (item_budget.ts).
  hoarfrost_edge: {
    id: 'hoarfrost_edge',
    name: 'Hoarfrost Edge',
    kind: 'weapon',
    slot: 'mainhand',
    quality: 'rare',
    requiredLevel: 20,
    weapon: { min: 27, max: 40, speed: 2.4 },
    stats: { str: 8, sta: 5 },
    sellValue: 7500,
    requiredClass: HEAVY,
  },
  emberforge_gauntlets: {
    id: 'emberforge_gauntlets',
    name: 'Emberforge Gauntlets',
    kind: 'armor',
    armorType: 'mail',
    slot: 'gloves',
    quality: 'rare',
    requiredLevel: 20,
    stats: { armor: 165, str: 7, sta: 4 },
    sellValue: 5000,
    requiredClass: HEAVY,
  },
  broodmother_carapace: {
    id: 'broodmother_carapace',
    name: 'Broodmother Carapace',
    kind: 'armor',
    armorType: 'leather',
    slot: 'chest',
    quality: 'rare',
    requiredLevel: 20,
    stats: { armor: 165, agi: 8, sta: 6 },
    sellValue: 6000,
    requiredClass: AGILE_WILD,
  },
  bonelord_mantle: {
    id: 'bonelord_mantle',
    name: 'Bonelord Mantle',
    kind: 'armor',
    armorType: 'cloth',
    slot: 'shoulder',
    quality: 'rare',
    requiredLevel: 20,
    stats: { armor: 38, int: 7, spi: 4 },
    sellValue: 5000,
    requiredClass: CASTER,
  },
  graskbreaker_girdle: {
    id: 'graskbreaker_girdle',
    name: 'Graskbreaker Girdle',
    kind: 'armor',
    armorType: 'mail',
    slot: 'waist',
    quality: 'rare',
    requiredLevel: 20,
    stats: { armor: 140, str: 7, sta: 4 },
    sellValue: 5000,
    requiredClass: HEAVY,
  },
  voidscar_handwraps: {
    id: 'voidscar_handwraps',
    name: 'Voidscar Handwraps',
    kind: 'armor',
    armorType: 'cloth',
    slot: 'gloves',
    quality: 'rare',
    requiredLevel: 20,
    stats: { armor: 42, int: 7, spi: 4 },
    sellValue: 5000,
    requiredClass: CASTER,
  },
  stormscale_treads: {
    id: 'stormscale_treads',
    name: 'Stormscale Treads',
    kind: 'armor',
    armorType: 'leather',
    slot: 'feet',
    quality: 'rare',
    requiredLevel: 20,
    stats: { armor: 85, agi: 7, sta: 3 },
    sellValue: 5000,
    requiredClass: AGILE,
  },
  abyssal_loop: {
    id: 'abyssal_loop',
    name: 'Abyssal Loop',
    kind: 'armor',
    slot: 'ring',
    quality: 'rare',
    requiredLevel: 20,
    stats: { sta: 5, spi: 4 },
    sellValue: 5000,
  },
  // ---- The Infernal Citadel set-piece drops ----
  pactbound_vestments: {
    id: 'pactbound_vestments',
    name: 'Pactbound Vestments',
    kind: 'armor',
    armorType: 'cloth',
    slot: 'chest',
    quality: 'rare',
    requiredLevel: 20,
    stats: { armor: 55, int: 8, spi: 6 },
    sellValue: 6500,
    requiredClass: CASTER,
  },
  pitlords_cleaver: {
    id: 'pitlords_cleaver',
    name: "Pit Lord's Cleaver",
    kind: 'weapon',
    slot: 'mainhand',
    quality: 'rare',
    requiredLevel: 20,
    weapon: { min: 34, max: 50, speed: 2.9 },
    stats: { str: 9, sta: 6 },
    sellValue: 8500,
    requiredClass: HEAVY,
  },
  // ---- Clear-time epics (B+ final-boss kills only; see addRiftClearGearLoot) ----
  // Stat lines sit in the ilvl-31 band between the heroic five-man epics (26-28)
  // and the raid variants (33/37), matching the A/S heroic-plus difficulty that
  // gates them. No combat ratings: the rating ladder is a heroic/raid-set
  // signature (combat_rating tests pin the per-ilvl ladder).
  emberforged_bulwark: {
    id: 'emberforged_bulwark',
    name: 'Emberforged Bulwark',
    kind: 'armor',
    armorType: 'mail',
    slot: 'chest',
    quality: 'epic',
    requiredLevel: 20,
    stats: { armor: 360, str: 13, sta: 9 },
    sellValue: 16000,
    requiredClass: HEAVY,
  },
  stormsunder_hood: {
    id: 'stormsunder_hood',
    name: 'Stormsunder Hood',
    kind: 'armor',
    armorType: 'leather',
    slot: 'helmet',
    quality: 'epic',
    requiredLevel: 20,
    stats: { armor: 118, agi: 11, sta: 7 },
    sellValue: 13000,
    requiredClass: AGILE_WILD,
  },
  voidweave_mantle: {
    id: 'voidweave_mantle',
    name: 'Voidweave Mantle',
    kind: 'armor',
    armorType: 'cloth',
    slot: 'shoulder',
    quality: 'epic',
    requiredLevel: 20,
    stats: { armor: 48, int: 10, spi: 6 },
    sellValue: 13000,
    requiredClass: CASTER,
  },
  abysswrought_band: {
    id: 'abysswrought_band',
    name: 'Abysswrought Band',
    kind: 'armor',
    slot: 'ring',
    quality: 'epic',
    requiredLevel: 20,
    stats: { sta: 7, spi: 5 },
    sellValue: 12000,
  },
  // The one legendary chase item: an S-rank clear rolls a slim chance at it.
  // Class-neutral jewelry so it is a chase for every archetype without
  // touching any class's weapon dps ladder.
  heart_of_the_rift: {
    id: 'heart_of_the_rift',
    name: 'Heart of the Rift',
    kind: 'armor',
    slot: 'neck',
    quality: 'legendary',
    requiredLevel: 20,
    stats: { sta: 12, str: 6, agi: 6, int: 6 },
    sellValue: 50000,
  },
};
