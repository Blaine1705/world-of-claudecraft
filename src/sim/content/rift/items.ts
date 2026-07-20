import type { ItemDef } from '../../types';

export const RIFT_ESSENCE_ITEM_ID = 'rift_essence';
export const RIFT_GEM_IDS = ['rift_gem_crimson', 'rift_gem_azure', 'rift_gem_verdant'] as const;
export type RiftGemId = (typeof RIFT_GEM_IDS)[number];

export const RIFT_GEAR_ITEM_IDS = [
  'riftbound_band_of_might',
  'riftbound_band_of_insight',
  'riftbound_band_of_guile',
] as const;

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
    hitRating: 30,
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
    critRating: 30,
    sellValue: 8500,
    requiredClass: HEAVY,
  },
};
