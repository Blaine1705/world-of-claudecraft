// The Reliquary catalog: data-as-code shelves, pages, and relic slots.
// No engine logic lives here; runtime marks and pure completion math live in
// src/sim/reliquary.ts. Player-facing names are English content re-localized
// at the client boundary (the sim never emits Reliquary English text).
//
// Page table is append-only once product pages ship: append new pages at the
// END and never reorder or remove an id (ids may be referenced by firstFind
// diagnostics and content pin tests). Phase 2 authors Conquerors; Phase 7
// appends Professions (masterwork marks, rare field notes, key specimens);
// Phase 8 appends Horizons (mounts, weapon skins, titles).
//
// Curation rule (performance + product): every relic is hand-listed. Do not
// auto-scrape every loot row. Prefer rare+ chase uniques, signature dungeon
// brand pieces, HEROIC_BOSS_LOOT gear (not mount reins; those are Horizons),
// and epic set members. Heroic upgraded variants (heroic_<base>) are NOT
// catalogued: markItemDiscovered already credits the base id, so listing both
// would double-count completion.

/** Top-level shelf ids (Overview is virtual UI, not a catalog shelf row). */
export type ReliquaryShelfId = 'conquerors' | 'professions' | 'horizons';

/** How a page reads lifetime clear / kill counts from existing player state. */
export type ReliquaryClearSource =
  | { kind: 'dungeon'; dungeonId: string; difficulty?: 'normal' | 'heroic' | 'any' }
  | { kind: 'delve'; delveId: string }
  /** Existing DeedStats.counters key (e.g. thunzharrKills for the world boss). */
  | { kind: 'deed_stat'; stat: string }
  | { kind: 'none' };

/** One unique slot on a page. Item relics own via itemsDiscovered; other kinds
 *  use authored marks or existing ownership tables (mounts, skins, titles). */
export type ReliquaryRelicDef =
  | { kind: 'item'; itemId: string }
  | { kind: 'mark'; markId: string }
  | { kind: 'mount'; mountId: string }
  | { kind: 'weapon_skin'; skinId: string }
  | { kind: 'title'; deedId: string };

export interface ReliquaryPageDef {
  id: string;
  shelf: ReliquaryShelfId;
  /** English content name (client re-localizes). */
  name: string;
  /** Optional English blurb. */
  desc?: string;
  /** Clear-count source; omit or `none` when the page has no clear meter. */
  clearSource?: ReliquaryClearSource;
  /** Ordered relic slots for the page grid. */
  relics: readonly ReliquaryRelicDef[];
}

// ---------------------------------------------------------------------------
// Item-relic helpers (keep page tables readable; no engine behavior)
// ---------------------------------------------------------------------------

function items(...ids: readonly string[]): ReliquaryRelicDef[] {
  return ids.map((itemId) => ({ kind: 'item' as const, itemId }));
}

function marks(...ids: readonly string[]): ReliquaryRelicDef[] {
  return ids.map((markId) => ({ kind: 'mark' as const, markId }));
}

function mounts(...ids: readonly string[]): ReliquaryRelicDef[] {
  return ids.map((mountId) => ({ kind: 'mount' as const, mountId }));
}

function weaponSkins(...ids: readonly string[]): ReliquaryRelicDef[] {
  return ids.map((skinId) => ({ kind: 'weapon_skin' as const, skinId }));
}

function titles(...ids: readonly string[]): ReliquaryRelicDef[] {
  return ids.map((deedId) => ({ kind: 'title' as const, deedId }));
}

// Horizons curated lists (Phase 8). Pin tests lock these to live MOUNTS,
// WEAPON_SKINS, and deeds with title rewards. Ownership stays on existing
// seams (ownedMounts, accountCosmetics.weaponSkinIds, deedsEarned).
export const RELIQUARY_HORIZON_MOUNTS = [
  'valorsteed',
  'stormfeather_griffin',
  'shadowjump_toad',
  'grag_bear',
  'stalkglider_snail',
  'aether_hover_cycle',
  'thunderstrut_gobbler',
  'drakemaw_raptor',
  'terrorspark_groundshaker',
] as const;

export const RELIQUARY_HORIZON_WEAPON_SKINS = [
  'guildmark_arming_sword',
  'brasscap_axe',
  'tempered_flanged_mace',
  'guildmark_dirk',
  'brasscrown_staff',
  'lacquered_wand',
  'fletcher_s_guild_bow',
  'cinderbrand_sword',
  'emberbite_axe',
  'smoulderfall_mace',
  'ashspark_dagger',
  'forgeheart_staff',
  'emberwrought_wand',
  'cinderlatch_crossbow',
  'ice_fang_sword',
  'glaciersplit_axe',
  'rimecrusher_mace',
  'frostbite_dagger',
  'hoarfrost_vigil_staff',
  'everwinter_wand',
  'winterbite',
  'solheim_sword',
  'skyrender_axe',
  'starfall_mace',
  'astravyr_dagger',
  'cosmarch_staff',
  'emberwish_wand',
  'encore_bow',
  'meteorlatch_crossbow',
] as const;

// Hidden deeds NEVER enter the Reliquary, not even as a masked or locked slot:
// a hidden deed's existence is itself the secret, so a placeholder row would
// spoil it just as loudly as the name. The Book of Deeds is their only home,
// where they stay invisible until earned. Keep this list to non-hidden title
// rewards; tests/reliquary_content.test.ts pins both directions.
/** Deeds that grant a title reward (real DEEDS ids only; no invented titles). */
export const RELIQUARY_HORIZON_TITLES = [
  'prog_veteran',
  'prog_champion',
  'prog_paragon',
  'prog_mythic',
  'prog_eternal',
  'dgn_korzul_flawless',
  'dgn_nythraxis_deathless',
  'cmb_thunzharr_unbroken',
  'dlv_nhalia_bells',
  'chr_vale_chapter_iii',
  'chr_marsh_chapter_iii',
  'chr_peaks_chapter_iii',
  'col_discovery_150',
  'col_seven_regalia',
  'pvp_arena_1v1_1900',
  'pvp_vcup_wins_25',
  'soc_market_magnate',
  'exp_world_traveler',
  'prog_guildsworn',
  'prog_masterwright',
  'prog_master_angler',
  'prog_grandmaster_engineering',
  'prog_grandmaster_alchemy',
  'prog_grandmaster_cooking',
  'prog_grandmaster_leatherworking',
  'prog_grandmaster_tailoring',
  'prog_grandmaster_enchanting',
  'prog_grandmaster_weaponcrafting',
  'prog_grandmaster_armorcrafting',
  'pvp_bg_wins_25',
  'col_reliquary_rank_2',
  'col_reliquary_rank_3',
  'col_reliquary_rank_4',
] as const;

// Profession lifetime mark ids (Phase 7). Prefer existing visited namespaces
// for rare field notes (`gather_event:*`). Masterwork marks pair with
// `masterwork:*` visited entries written at proc time. The visit is NOT crash
// insurance (both ledgers persist in one character blob on one save cadence,
// so a crash before autosave loses both together): it is the durable copy for
// a blob whose reliquary marks were filtered away, because the restore paths
// differ (restoreDeedStats keeps any registered namespace while
// restoreReliquaryState keeps only currently catalogued ids), so a mark
// dropped from the catalog and later re-added refills from the surviving
// visit at join. A pre-Reliquary binary is NOT covered: it predates the
// namespace registration and drops the visits too (state.md rollback note).
// History is never invented (the visit exists only if the proc really
// happened).
export const RELIQUARY_PROFESSION_MARKS = {
  /** First lifetime masterwork proc (any craft). */
  masterworkFirst: 'masterwork:first',
  /** First masterwork per gear-capable craft on the ring. */
  masterworkByCraft: [
    'masterwork:weaponcrafting',
    'masterwork:armorcrafting',
    'masterwork:tailoring',
    'masterwork:leatherworking',
    'masterwork:engineering',
  ],
  /** Rare gather / corpse specimen visit marks already written by professions. */
  fieldNotes: [
    'gather_event:pristine_vein',
    'gather_event:ancient_heartwood',
    'gather_event:moonlit_bloom',
    'gather_event:perfect_specimen',
  ],
} as const;

/**
 * Apex fine-grade materials (key signed-field trophies via itemsDiscovered).
 * The corpse block mirrors HARVEST_COMPONENT_SPECIMENS values (pinned
 * bidirectionally in tests/reliquary_content.test.ts so a new harvest family
 * cannot land without its Reliquary slot); the fine_* trio are the gathering
 * jackpots.
 */
export const RELIQUARY_PROFESSION_SPECIMEN_ITEMS = [
  'pristine_hide',
  'pristine_silk',
  'pristine_venom_gland',
  'prime_cut',
  'pristine_claw',
  'fine_thorium_ore',
  'fine_elderwood_log',
  'fine_sunpetal_herb',
] as const;

// Epic set members, pinned to the same id lists as col_set_* deeds in
// content/deeds.ts so collection pages and Reliquary set pages stay aligned.
// Leveling haste kits (vale / boundstone / greyjaw) stay out of Conquerors;
// they are world-drop kits, not instance spoils.
export const RELIQUARY_SET_MEMBERS = {
  deathlord: [
    'deathlord_warplate',
    'deathlord_legguards',
    'deathlord_sabatons',
    'deathlords_dread_visage',
  ],
  wyrmshadow: [
    'wyrmshadow_harness',
    'wyrmshadow_treads',
    'wyrmshadow_legguards',
    'wyrmshadow_talongrips',
  ],
  necromancers: [
    'necromancers_starshroud',
    'necromancers_soulsteps',
    'necromancers_legwraps',
    'necromancers_soulspire_mantle',
  ],
  crownforged: [
    'crownforged_gauntlets',
    'crownforged_girdle',
    'crownforged_dreadhelm',
    'crownforged_warspaulders',
  ],
  nighttalon: [
    'nighttalon_grips',
    'nighttalon_waistband',
    'nighttalon_crown',
    'nighttalon_shoulderguards',
  ],
  soulflame: ['soulflame_gloves', 'soulflame_cord', 'soulflame_cowl', 'soulflame_mantle'],
  stormcallers: [
    'stormcallers_handguards',
    'stormcallers_waistguard',
    'stormcallers_crown',
    'stormcallers_spaulders',
  ],
} as const;

// HEROIC_BOSS_LOOT gear only (mount reins excluded; Horizons owns mounts).
// Tests pin these lists against the live table so a new heroic gear row fails
// until it is deliberately added here.
export const RELIQUARY_HEROIC_GEAR = {
  morthen: [
    'morthens_cryptforged_hauberk',
    'shadowpulse_handwraps',
    'bonechill_striders',
    'lunarward_cinch',
    'cryptplate_helm',
    'shadowpulse_slippers',
    'bonechill_cord',
  ],
  vael_the_mistcaller: [
    'mistcallers_fang',
    'tidebound_spaulders',
    'sash_of_the_sunken_court',
    'mistforged_pauldrons',
    'tideguard_faceguard',
    'sunken_court_mantle',
    'dreamroot_boots',
  ],
  ysolei: [
    'lunar_tide_greatstaff',
    'tidewoven_trousers',
    'choirmothers_casque',
    'stormbark_mantle',
    'lunar_choir_leggings',
    'choir_blessed_spaulders',
    'tideworn_warboots',
  ],
  korzul_the_gravewyrm: [
    'gravewyrm_cleaver',
    'shroud_of_the_gravewyrm',
    'sanctum_prowlers_grips',
    'gravewyrm_claws',
    'gravescale_girdle',
    'wyrmchoir_handwraps',
    'wildsoul_maul',
  ],
  wildheart_high_priest: [
    'basin_stalkers_tunic',
    'verdant_heart_vestment',
    'sunbone_ritual_hauberk',
    'greatfang_of_the_basin',
    'sunbone_oracles_crown',
    'bloodmane_war_legguards',
  ],
  nythraxis_scourge_of_thornpeak: [
    'deathless_greatblade',
    'scepter_of_the_deathless_court',
    'stormcallers_focus',
  ],
} as const;

// ---------------------------------------------------------------------------
// Conquerors shelf (Phase 2)
// ---------------------------------------------------------------------------
// Order: append-only. Phase 1 stub id `conquerors_hollow_crypt` is kept and
// expanded with real Hollow Crypt uniques (boundstone_helm moved to Sanctum).

export const RELIQUARY_PAGES: readonly ReliquaryPageDef[] = [
  // ---- Five-man dungeons: normal chase uniques ----
  {
    id: 'conquerors_hollow_crypt',
    shelf: 'conquerors',
    name: 'The Hollow Crypt',
    desc: 'Signature spoils claimed from Morthen and the Hollow Crypt.',
    clearSource: { kind: 'dungeon', dungeonId: 'hollow_crypt', difficulty: 'normal' },
    relics: items(
      'cryptbone_greaves',
      'cryptbone_helm',
      'cryptbone_pauldrons',
      'greyjaw_hide_boots',
      'gravewoven_bag',
    ),
  },
  {
    id: 'conquerors_hollow_crypt_heroic',
    shelf: 'conquerors',
    name: 'Heroic Hollow Crypt',
    desc: 'Heroic-only epics from Morthen the Gravecaller.',
    clearSource: { kind: 'dungeon', dungeonId: 'hollow_crypt', difficulty: 'heroic' },
    relics: items(...RELIQUARY_HEROIC_GEAR.morthen),
  },
  {
    id: 'conquerors_sunken_bastion',
    shelf: 'conquerors',
    name: 'The Sunken Bastion',
    desc: 'Rare and epic spoils from Olen and Vael the Fogbinder.',
    clearSource: { kind: 'dungeon', dungeonId: 'sunken_bastion', difficulty: 'normal' },
    relics: items(
      'tideguard_greaves',
      'tideguard_sabatons',
      'eelscale_leggings',
      'tidescale_vest',
      'drowned_prayer_leggings',
      'drowned_prayer_sandals',
      'eelscale_treads',
      'mistcallers_duffel',
    ),
  },
  {
    id: 'conquerors_sunken_bastion_heroic',
    shelf: 'conquerors',
    name: 'Heroic Sunken Bastion',
    desc: 'Heroic-only epics from Vael the Fogbinder.',
    clearSource: { kind: 'dungeon', dungeonId: 'sunken_bastion', difficulty: 'heroic' },
    relics: items(...RELIQUARY_HEROIC_GEAR.vael_the_mistcaller),
  },
  {
    id: 'conquerors_drowned_temple',
    shelf: 'conquerors',
    name: 'The Drowned Temple',
    desc: 'Rare spoils from Choirmother Selthe and Ysolei, Avatar of the Drowned Moon.',
    clearSource: { kind: 'dungeon', dungeonId: 'drowned_temple', difficulty: 'normal' },
    relics: items(
      'ysols_pearl_greaves',
      'moonshroud_breastplate',
      'moonshroud_robe',
      'moonshroud_tunic',
      'selthes_seastriders',
    ),
  },
  {
    id: 'conquerors_drowned_temple_heroic',
    shelf: 'conquerors',
    name: 'Heroic Drowned Temple',
    desc: 'Heroic-only epics from Ysolei.',
    clearSource: { kind: 'dungeon', dungeonId: 'drowned_temple', difficulty: 'heroic' },
    relics: items(...RELIQUARY_HEROIC_GEAR.ysolei),
  },
  {
    id: 'conquerors_gravewyrm_sanctum',
    shelf: 'conquerors',
    name: 'Gravewyrm Sanctum',
    desc: 'Rare and epic spoils from the Sanctum bosses and Korzul the Gravewyrm.',
    clearSource: { kind: 'dungeon', dungeonId: 'gravewyrm_sanctum', difficulty: 'normal' },
    relics: items(
      // Mid-boss and trash chase (rare+)
      'boundstone_helm',
      'boundstone_girdle',
      'gravewyrm_mantle',
      'gravewyrm_gauntlets',
      'gravewyrm_thornmaul',
      'korgaths_chainwraps',
      'staff_of_velkhar',
      'shadowmeld_tunic',
      'wyrmcult_grand_robe',
      'gravewyrm_sabatons',
      'wyrmcult_soulsteps',
      'wyrmshadow_treads',
      'boneguard_breastplate',
      'gravewyrm_stalkers_treads',
      'deathlord_legguards',
      'necromancers_soulsteps',
      'wyrmshadow_legguards',
      // Korzul final
      'wyrmfang_greatblade',
      'staff_of_the_gravewyrm',
      'fang_of_korzul',
      'deathlord_warplate',
      'necromancers_starshroud',
      'wyrmshadow_harness',
      'deathlords_dread_visage',
      'necromancers_soulspire_mantle',
      'wyrmshadow_talongrips',
      'nightfangs_greatstaff',
      'wildgrowth_leggings',
      'grovewardens_grips',
      'verdant_walkers',
      'gravewyrm_bone_quiver',
    ),
  },
  {
    id: 'conquerors_gravewyrm_sanctum_heroic',
    shelf: 'conquerors',
    name: 'Heroic Gravewyrm Sanctum',
    desc: 'Heroic-only epics from Korzul the Gravewyrm.',
    clearSource: { kind: 'dungeon', dungeonId: 'gravewyrm_sanctum', difficulty: 'heroic' },
    relics: items(...RELIQUARY_HEROIC_GEAR.korzul_the_gravewyrm),
  },
  {
    id: 'conquerors_wildheart_basin',
    shelf: 'conquerors',
    name: 'The Wildheart Basin',
    desc: 'Signature weapons from Zulgar and the Fanglord.',
    clearSource: { kind: 'dungeon', dungeonId: 'wildheart_basin', difficulty: 'normal' },
    relics: items(
      'fanglords_beastspear',
      'wildheart_tuskblade',
      'wildheart_hexwood_staff',
      'wildheart_fangknife',
    ),
  },
  {
    id: 'conquerors_wildheart_basin_heroic',
    shelf: 'conquerors',
    name: 'Heroic Wildheart Basin',
    desc: 'Heroic-only epics from Zulgar, Voice of the Basin.',
    clearSource: { kind: 'dungeon', dungeonId: 'wildheart_basin', difficulty: 'heroic' },
    relics: items(...RELIQUARY_HEROIC_GEAR.wildheart_high_priest),
  },
  // ---- Raid ----
  {
    id: 'conquerors_nythraxis',
    shelf: 'conquerors',
    name: 'Nythraxis Raid',
    desc: 'Epic and legendary spoils from Nythraxis, Scourge of Thornpeak.',
    clearSource: { kind: 'dungeon', dungeonId: 'nythraxis_boss_arena', difficulty: 'normal' },
    relics: items(
      'deathless_heartwood',
      'kingsbane_last_oath',
      'bonewrought_greatsword',
      'bonewrought_bulwark',
      'direfang_greatblade',
      'wraithfire_orb',
      'maul_of_the_scourged_wilds',
      'crownforged_dreadhelm',
      'crownforged_warspaulders',
      'nighttalon_crown',
      'nighttalon_shoulderguards',
      'soulflame_cowl',
      'soulflame_mantle',
      'stormcallers_crown',
      'stormcallers_spaulders',
      'direfang_quiver',
    ),
  },
  {
    id: 'conquerors_nythraxis_heroic',
    shelf: 'conquerors',
    name: 'Heroic Nythraxis Raid',
    desc: 'Heroic-only raid weapons from Nythraxis.',
    clearSource: { kind: 'dungeon', dungeonId: 'nythraxis_boss_arena', difficulty: 'heroic' },
    relics: items(...RELIQUARY_HEROIC_GEAR.nythraxis_scourge_of_thornpeak),
  },
  // ---- World boss ----
  {
    id: 'conquerors_thunzharr',
    shelf: 'conquerors',
    name: 'Thunzharr, the Waking Peak',
    desc: 'Personal epic spoils from the Waking Peak world boss.',
    clearSource: { kind: 'deed_stat', stat: 'thunzharrKills' },
    relics: items(
      'crownforged_gauntlets',
      'nighttalon_grips',
      'soulflame_gloves',
      'stormcallers_handguards',
      'crownforged_girdle',
      'nighttalon_waistband',
      'soulflame_cord',
      'stormcallers_waistguard',
      'vestments_of_the_waking_grove',
    ),
  },
  // ---- Delves (rare+ uniques; mark-shop signature pieces included) ----
  {
    id: 'conquerors_collapsed_reliquary',
    shelf: 'conquerors',
    name: 'The Collapsed Reliquary',
    desc: 'Signature rares from the Collapsed Reliquary lockpick chest.',
    clearSource: { kind: 'delve', delveId: 'collapsed_reliquary' },
    relics: items('deacon_reliquary_helm', 'varric_shadow_cowl'),
  },
  {
    id: 'conquerors_drowned_litany',
    shelf: 'conquerors',
    name: 'The Drowned Litany',
    desc: 'Rare and epic spoils from the Drowned Litany.',
    clearSource: { kind: 'delve', delveId: 'drowned_litany' },
    relics: items(
      'nhalias_bell_maul',
      'widow_silk_hood',
      'nhalias_litany_rod',
      'blackwater_vanguard_chest',
      'siltstep_leggings',
      'sunken_reliquary_hood',
      'sister_nhalia_choir_plate',
      'drowned_choir_fang',
    ),
  },
  // ---- Epic set pages (members shared with dungeon/world-boss pages) ----
  {
    id: 'conquerors_set_deathlord',
    shelf: 'conquerors',
    name: 'Barrowlord Battlegear',
    desc: 'The full Deathlord plate family.',
    clearSource: { kind: 'none' },
    relics: items(...RELIQUARY_SET_MEMBERS.deathlord),
  },
  {
    id: 'conquerors_set_wyrmshadow',
    shelf: 'conquerors',
    name: 'Nightfang Vestments',
    desc: 'The full Wyrmshadow leather family.',
    clearSource: { kind: 'none' },
    relics: items(...RELIQUARY_SET_MEMBERS.wyrmshadow),
  },
  {
    id: 'conquerors_set_necromancers',
    shelf: 'conquerors',
    name: 'Mournweave Raiment',
    desc: 'The full Necromancers cloth family.',
    clearSource: { kind: 'none' },
    relics: items(...RELIQUARY_SET_MEMBERS.necromancers),
  },
  {
    id: 'conquerors_set_crownforged',
    shelf: 'conquerors',
    name: 'Bonewrought Regalia',
    desc: 'The full Crownforged plate family.',
    clearSource: { kind: 'none' },
    relics: items(...RELIQUARY_SET_MEMBERS.crownforged),
  },
  {
    id: 'conquerors_set_nighttalon',
    shelf: 'conquerors',
    name: 'Direfang Pelt',
    desc: 'The full Nighttalon leather family.',
    clearSource: { kind: 'none' },
    relics: items(...RELIQUARY_SET_MEMBERS.nighttalon),
  },
  {
    id: 'conquerors_set_soulflame',
    shelf: 'conquerors',
    name: 'Wraithfire Regalia',
    desc: 'The full Soulflame cloth family.',
    clearSource: { kind: 'none' },
    relics: items(...RELIQUARY_SET_MEMBERS.soulflame),
  },
  {
    id: 'conquerors_set_stormcallers',
    shelf: 'conquerors',
    name: 'Galecall Vestments',
    desc: 'The full Stormcallers cloth family.',
    clearSource: { kind: 'none' },
    relics: items(...RELIQUARY_SET_MEMBERS.stormcallers),
  },

  // ---- Professions shelf (Phase 7): lifetime prestige, not every craft ----
  {
    id: 'professions_masterwork',
    shelf: 'professions',
    name: 'Masterwork Gallery',
    desc: 'Lifetime trophies for first masterworks. Empty until the next proc if a veteran predates the gallery (no invented craft history).',
    clearSource: { kind: 'none' },
    relics: marks(
      RELIQUARY_PROFESSION_MARKS.masterworkFirst,
      ...RELIQUARY_PROFESSION_MARKS.masterworkByCraft,
    ),
  },
  {
    id: 'professions_field_notes',
    shelf: 'professions',
    name: 'Rare Field Notes',
    desc: 'Signature rare finds from the wild: veins, heartwood, moonlit blooms, and perfect specimens.',
    clearSource: { kind: 'none' },
    relics: marks(...RELIQUARY_PROFESSION_MARKS.fieldNotes),
  },
  {
    id: 'professions_specimens',
    shelf: 'professions',
    name: 'Key Specimens',
    desc: 'Pristine corpse specimens and apex fine-grade field materials that stock a crafter museum.',
    clearSource: { kind: 'none' },
    relics: items(...RELIQUARY_PROFESSION_SPECIMEN_ITEMS),
  },

  // ---- Horizons shelf (Phase 8): mounts, account weapon skins, deed titles ----
  {
    id: 'horizons_mounts',
    shelf: 'horizons',
    name: 'Mounts',
    desc: 'Rideable mounts from the stable, heroic reins, Rift epics, and rarer saddles. Ownership follows the live reins seam (bags and bank).',
    clearSource: { kind: 'none' },
    relics: mounts(...RELIQUARY_HORIZON_MOUNTS),
  },
  {
    id: 'horizons_weapon_skins',
    shelf: 'horizons',
    name: 'Weapon Skins',
    desc: 'Account-wide Armory weapon skins. Empty offline or without account cosmetics; never character loot.',
    clearSource: { kind: 'none' },
    relics: weaponSkins(...RELIQUARY_HORIZON_WEAPON_SKINS),
  },
  {
    id: 'horizons_titles',
    shelf: 'horizons',
    name: 'Titles',
    desc: 'Titles earned from the Book of Deeds. Cosmetic only: never power, drop rate, or pity.',
    clearSource: { kind: 'none' },
    relics: titles(...RELIQUARY_HORIZON_TITLES),
  },
];

/** Append-only page order (table order). */
export const RELIQUARY_PAGE_ORDER: readonly string[] = RELIQUARY_PAGES.map((p) => p.id);

/** Stable id -> page def. */
export const RELIQUARY_PAGES_BY_ID: Readonly<Record<string, ReliquaryPageDef>> = Object.fromEntries(
  RELIQUARY_PAGES.map((p) => [p.id, p]),
);

/** Item id -> page ids that list it (multi-page fill is intentional). */
export const RELIQUARY_ITEM_TO_PAGES: ReadonlyMap<string, readonly string[]> = (() => {
  const map = new Map<string, string[]>();
  for (const page of RELIQUARY_PAGES) {
    for (const relic of page.relics) {
      if (relic.kind !== 'item') continue;
      const list = map.get(relic.itemId);
      if (list) list.push(page.id);
      else map.set(relic.itemId, [page.id]);
    }
  }
  return map;
})();

/** Authored mark ids that are Reliquary trophies (profession marks, etc.). */
export const RELIQUARY_MARK_IDS: ReadonlySet<string> = (() => {
  const set = new Set<string>();
  for (const page of RELIQUARY_PAGES) {
    for (const relic of page.relics) {
      if (relic.kind === 'mark') set.add(relic.markId);
    }
  }
  return set;
})();

/** Mark id -> page ids that list it (multi-page fill is intentional). */
export const RELIQUARY_MARK_TO_PAGES: ReadonlyMap<string, readonly string[]> = (() => {
  const map = new Map<string, string[]>();
  for (const page of RELIQUARY_PAGES) {
    for (const relic of page.relics) {
      if (relic.kind !== 'mark') continue;
      const list = map.get(relic.markId);
      if (list) list.push(page.id);
      else map.set(relic.markId, [page.id]);
    }
  }
  return map;
})();

export function isCataloguedRelicItem(itemId: string): boolean {
  return RELIQUARY_ITEM_TO_PAGES.has(itemId);
}

/** True when markId is an authored Reliquary trophy mark. */
export function isCataloguedRelicMark(markId: string): boolean {
  return RELIQUARY_MARK_IDS.has(markId);
}
