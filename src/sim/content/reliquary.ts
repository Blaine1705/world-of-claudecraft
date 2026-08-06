// The Reliquary catalog: data-as-code shelves, pages, and relic slots, plus
// pure read-only projections of the table (isCataloguedRelic*, the source
// resolver). No engine logic lives here; runtime marks and pure completion
// math live in src/sim/reliquary.ts. Player-facing names are English content
// re-localized at the client boundary (the sim never emits Reliquary English
// text).
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

/** Which live id space a source hint's `sourceId` is drawn from. */
export type ReliquarySourceKind = 'boss' | 'zone' | 'profession' | 'deed' | 'vendor';

/**
 * Authored answer to "where do I get this?" for one relic. Structured ids
 * only, never prose: the client re-localizes from the id, the same way every
 * other Reliquary name crosses the boundary.
 *
 * A hint is authored ONLY where content proves a single source. A relic whose
 * acquisition genuinely has two comparable routes (or a route this vocabulary
 * cannot name, like a delve chest) carries NO hint and is listed in
 * SOURCE_PENDING_RULING in tests/reliquary_content.test.ts, so the gap is a
 * visible maintainer decision rather than an invented answer.
 */
export interface ReliquarySourceHint {
  readonly sourceKind: ReliquarySourceKind;
  readonly sourceId: string;
}

/** One unique slot on a page. Item relics own via itemsDiscovered; other kinds
 *  use authored marks or existing ownership tables (mounts, skins, titles). */
export type ReliquaryRelicDef =
  | { kind: 'item'; itemId: string; source?: ReliquarySourceHint }
  | { kind: 'mark'; markId: string; source?: ReliquarySourceHint }
  | { kind: 'mount'; mountId: string; source?: ReliquarySourceHint }
  | { kind: 'weapon_skin'; skinId: string; source?: ReliquarySourceHint }
  | { kind: 'title'; deedId: string; source?: ReliquarySourceHint };

export interface ReliquaryPageDef {
  id: string;
  shelf: ReliquaryShelfId;
  /** English content name (client re-localizes). */
  name: string;
  /** Optional English blurb. */
  desc?: string;
  /** Clear-count source; omit or `none` when the page has no clear meter. */
  clearSource?: ReliquaryClearSource;
  /** Source every un-hinted relic on this page inherits. Authored only where
   *  EVERY relic on the page really shares one source. */
  sourceDefault?: ReliquarySourceHint;
  /** Ordered relic slots for the page grid. */
  relics: readonly ReliquaryRelicDef[];
}

// ---------------------------------------------------------------------------
// Item-relic helpers (keep page tables readable; no engine behavior)
// ---------------------------------------------------------------------------

/** A page-table entry: a bare id, or an id paired with its own source hint. */
type RelicEntry = string | readonly [string, ReliquarySourceHint];

function entryId(entry: RelicEntry): string {
  return typeof entry === 'string' ? entry : entry[0];
}

/** Omits the key entirely when un-hinted, so an un-authored relic never
 *  carries a `source: undefined` the resolver would have to special-case. */
function withSource(def: ReliquaryRelicDef, entry: RelicEntry): ReliquaryRelicDef {
  return typeof entry === 'string' ? def : { ...def, source: entry[1] };
}

const fromBoss = (mobId: string): ReliquarySourceHint => ({ sourceKind: 'boss', sourceId: mobId });
const fromVendor = (npcId: string): ReliquarySourceHint => ({
  sourceKind: 'vendor',
  sourceId: npcId,
});
const fromProfession = (professionId: string): ReliquarySourceHint => ({
  sourceKind: 'profession',
  sourceId: professionId,
});

function items(...entries: readonly RelicEntry[]): ReliquaryRelicDef[] {
  return entries.map((e) => withSource({ kind: 'item', itemId: entryId(e) }, e));
}

function marks(...entries: readonly RelicEntry[]): ReliquaryRelicDef[] {
  return entries.map((e) => withSource({ kind: 'mark', markId: entryId(e) }, e));
}

function mounts(...entries: readonly RelicEntry[]): ReliquaryRelicDef[] {
  return entries.map((e) => withSource({ kind: 'mount', mountId: entryId(e) }, e));
}

function weaponSkins(...entries: readonly RelicEntry[]): ReliquaryRelicDef[] {
  return entries.map((e) => withSource({ kind: 'weapon_skin', skinId: entryId(e) }, e));
}

/** A title relic's deed IS its source: the deed that grants the title is the
 *  only way to earn it, so the hint is attached here rather than hand-repeated
 *  on all 33 rows, where it could only ever drift out of agreement. */
function titles(...ids: readonly string[]): ReliquaryRelicDef[] {
  return ids.map((deedId) => ({
    kind: 'title' as const,
    deedId,
    source: { sourceKind: 'deed' as const, sourceId: deedId },
  }));
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

/** Field-note flavor to the gathering profession that works its node type
 *  (gatherRareEventFlavor plus NODE_HARVEST_TABLE, src/sim/professions/).
 *  gather_event:perfect_specimen is absent on purpose: it fires on corpse
 *  harvest, which belongs to no gathering profession. */
const FIELD_NOTE_PROFESSIONS: Readonly<Record<string, string>> = {
  'gather_event:pristine_vein': 'mining',
  'gather_event:ancient_heartwood': 'logging',
  'gather_event:moonlit_bloom': 'herbalism',
};

/** Specimen jackpot to its gathering profession. The five corpse-harvest
 *  pristine specimens are absent for the same reason as perfect_specimen. */
const SPECIMEN_PROFESSIONS: Readonly<Record<string, string>> = {
  fine_thorium_ore: 'mining',
  fine_elderwood_log: 'logging',
  fine_sunpetal_herb: 'herbalism',
};

/** Ids carrying a profession hint where the map has one, and left bare (so the
 *  resolver answers null) where it deliberately does not. Keeps the curated id
 *  lists above the single authority on membership and order. */
function withProfessions(
  ids: readonly string[],
  professionById: Readonly<Record<string, string>>,
): RelicEntry[] {
  return ids.map((id) => {
    // Own-property read, same reasoning as setMembers below.
    const professionId = Object.hasOwn(professionById, id) ? professionById[id] : undefined;
    return professionId ? ([id, fromProfession(professionId)] as const) : id;
  });
}

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

// Per-member source for the set pages. A set page cannot take a page default:
// its members are gathered from across the world (raid, world boss, Sanctum
// mid-bosses, open-world rares), which is the point of the page.
//
// 26 of the 28 members below ALSO appear on their own dungeon or world-boss
// page, authored there independently, and the cross-page agreement pin in
// tests/reliquary_content.test.ts holds those two authorings equal so this
// table cannot drift away from the source page.
//
// deathlord_sabatons and necromancers_legwraps are the exceptions in both
// senses. They are set-page-only, so the cross-page pin does not constrain
// them at all; their guards are the id-existence check and the loot-truth pin
// (the item must really sit on the named mob's table). They are also the only
// relics credited to a rare rather than a boss: each drops from its named
// rare's dedicated chase roll group at 0.25, versus a 0.001 trickle off common
// zone trash, so the rare is the source a player actually farms, not a coin
// flip between two routes.
const SET_MEMBER_SOURCES: Readonly<Record<string, ReliquarySourceHint>> = {
  deathlord_warplate: fromBoss('korzul_the_gravewyrm'),
  deathlord_legguards: fromBoss('grand_necromancer_velkhar'),
  deathlord_sabatons: fromBoss('ironvein_foreman'),
  deathlords_dread_visage: fromBoss('korzul_the_gravewyrm'),
  wyrmshadow_harness: fromBoss('korzul_the_gravewyrm'),
  wyrmshadow_treads: fromBoss('korgath_the_bound'),
  wyrmshadow_legguards: fromBoss('grand_necromancer_velkhar'),
  wyrmshadow_talongrips: fromBoss('korzul_the_gravewyrm'),
  necromancers_starshroud: fromBoss('korzul_the_gravewyrm'),
  necromancers_soulsteps: fromBoss('grand_necromancer_velkhar'),
  necromancers_legwraps: fromBoss('marrowlord_varkas'),
  necromancers_soulspire_mantle: fromBoss('korzul_the_gravewyrm'),
  crownforged_gauntlets: fromBoss('thunzharr_waking_peak'),
  crownforged_girdle: fromBoss('thunzharr_waking_peak'),
  crownforged_dreadhelm: fromBoss('nythraxis_scourge_of_thornpeak'),
  crownforged_warspaulders: fromBoss('nythraxis_scourge_of_thornpeak'),
  nighttalon_grips: fromBoss('thunzharr_waking_peak'),
  nighttalon_waistband: fromBoss('thunzharr_waking_peak'),
  nighttalon_crown: fromBoss('nythraxis_scourge_of_thornpeak'),
  nighttalon_shoulderguards: fromBoss('nythraxis_scourge_of_thornpeak'),
  soulflame_gloves: fromBoss('thunzharr_waking_peak'),
  soulflame_cord: fromBoss('thunzharr_waking_peak'),
  soulflame_cowl: fromBoss('nythraxis_scourge_of_thornpeak'),
  soulflame_mantle: fromBoss('nythraxis_scourge_of_thornpeak'),
  stormcallers_handguards: fromBoss('thunzharr_waking_peak'),
  stormcallers_waistguard: fromBoss('thunzharr_waking_peak'),
  stormcallers_crown: fromBoss('nythraxis_scourge_of_thornpeak'),
  stormcallers_spaulders: fromBoss('nythraxis_scourge_of_thornpeak'),
};

/** Set-page members carrying their SET_MEMBER_SOURCES hint. A member with no
 *  row falls through un-hinted rather than inventing one; the coverage test
 *  reds on it. */
function setMembers(ids: readonly string[]): RelicEntry[] {
  return ids.map((id) => {
    // Own-property read: an id like 'constructor' or 'toString' would otherwise
    // walk the prototype and hand back a function as if it were a hint.
    const source = Object.hasOwn(SET_MEMBER_SOURCES, id) ? SET_MEMBER_SOURCES[id] : undefined;
    return source ? ([id, source] as const) : id;
  });
}

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
    // Morthen is the only Crypt mob that drops any of these five.
    sourceDefault: fromBoss('morthen'),
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
    sourceDefault: fromBoss('morthen'),
    relics: items(...RELIQUARY_HEROIC_GEAR.morthen),
  },
  {
    id: 'conquerors_sunken_bastion',
    shelf: 'conquerors',
    name: 'The Sunken Bastion',
    desc: 'Rare and epic spoils from Olen and Vael the Fogbinder.',
    clearSource: { kind: 'dungeon', dungeonId: 'sunken_bastion', difficulty: 'normal' },
    // Two bosses, and every relic drops from exactly one of them, so the page
    // takes no default: each row names its own.
    relics: items(
      ['tideguard_greaves', fromBoss('knight_commander_olen')],
      ['tideguard_sabatons', fromBoss('knight_commander_olen')],
      ['eelscale_leggings', fromBoss('knight_commander_olen')],
      ['tidescale_vest', fromBoss('vael_the_mistcaller')],
      ['drowned_prayer_leggings', fromBoss('vael_the_mistcaller')],
      ['drowned_prayer_sandals', fromBoss('vael_the_mistcaller')],
      ['eelscale_treads', fromBoss('vael_the_mistcaller')],
      ['mistcallers_duffel', fromBoss('vael_the_mistcaller')],
    ),
  },
  {
    id: 'conquerors_sunken_bastion_heroic',
    shelf: 'conquerors',
    name: 'Heroic Sunken Bastion',
    desc: 'Heroic-only epics from Vael the Fogbinder.',
    clearSource: { kind: 'dungeon', dungeonId: 'sunken_bastion', difficulty: 'heroic' },
    // Every heroic page defaults to the boss its RELIQUARY_HEROIC_GEAR list is
    // keyed by: that key IS the HEROIC_BOSS_LOOT mob id awarding the gear.
    sourceDefault: fromBoss('vael_the_mistcaller'),
    relics: items(...RELIQUARY_HEROIC_GEAR.vael_the_mistcaller),
  },
  {
    id: 'conquerors_drowned_temple',
    shelf: 'conquerors',
    name: 'The Drowned Temple',
    desc: 'Rare spoils from Choirmother Selthe and Ysolei, Avatar of the Drowned Moon.',
    clearSource: { kind: 'dungeon', dungeonId: 'drowned_temple', difficulty: 'normal' },
    relics: items(
      ['ysols_pearl_greaves', fromBoss('ysolei')],
      ['moonshroud_breastplate', fromBoss('ysolei')],
      ['moonshroud_robe', fromBoss('ysolei')],
      ['moonshroud_tunic', fromBoss('ysolei')],
      ['selthes_seastriders', fromBoss('choirmother_selthe')],
    ),
  },
  {
    id: 'conquerors_drowned_temple_heroic',
    shelf: 'conquerors',
    name: 'Heroic Drowned Temple',
    desc: 'Heroic-only epics from Ysolei.',
    clearSource: { kind: 'dungeon', dungeonId: 'drowned_temple', difficulty: 'heroic' },
    sourceDefault: fromBoss('ysolei'),
    relics: items(...RELIQUARY_HEROIC_GEAR.ysolei),
  },
  {
    id: 'conquerors_gravewyrm_sanctum',
    shelf: 'conquerors',
    name: 'Gravewyrm Sanctum',
    desc: 'Rare and epic spoils from the Sanctum bosses and Korzul the Gravewyrm.',
    clearSource: { kind: 'dungeon', dungeonId: 'gravewyrm_sanctum', difficulty: 'normal' },
    // FIVE live LOOT TABLES drop this page's relics (sanctum_boneguard and
    // sanctum_drakonid trash plus the three bosses), of which FOUR are authored
    // as hints here; recipes and quests add further non-loot routes below.
    // sanctum_boneguard is absent on purpose: the only two relic ids it
    // drops, boundstone_helm and boundstone_girdle, are among the seven rows
    // left un-hinted below, so it never wins a slot outright.
    //
    // Six of those seven sit on TWO OR MORE comparable live routes with no
    // primary: a trash family and a boss or two mid-bosses for all six, plus a
    // crafting recipe for boundstone_helm (recipe_ironbound_warplate_helm) and
    // gravewyrm_gauntlets (recipe_forgeguard_bulwark_gauntlets), and a
    // guaranteed quest reward (q_velkhar) for staff_of_velkhar and
    // shadowmeld_tunic. The seventh, wyrmcult_grand_robe, has two routes that
    // name two DIFFERENT mobs: the guaranteed mage reward of q_gravewyrm
    // (objective: korzul_the_gravewyrm) and a korgath_bonus loot row at 0.1.
    // All seven are pinned in SOURCE_PENDING_RULING in
    // tests/reliquary_content.test.ts awaiting a maintainer ruling rather than
    // being assigned by guess.
    relics: items(
      // Mid-boss and trash chase (rare+)
      'boundstone_helm',
      'boundstone_girdle',
      'gravewyrm_mantle',
      'gravewyrm_gauntlets',
      ['gravewyrm_thornmaul', fromBoss('sanctum_drakonid')],
      ['korgaths_chainwraps', fromBoss('korgath_the_bound')],
      'staff_of_velkhar',
      'shadowmeld_tunic',
      'wyrmcult_grand_robe',
      ['gravewyrm_sabatons', fromBoss('korgath_the_bound')],
      ['wyrmcult_soulsteps', fromBoss('korgath_the_bound')],
      ['wyrmshadow_treads', fromBoss('korgath_the_bound')],
      ['boneguard_breastplate', fromBoss('grand_necromancer_velkhar')],
      ['gravewyrm_stalkers_treads', fromBoss('grand_necromancer_velkhar')],
      ['deathlord_legguards', fromBoss('grand_necromancer_velkhar')],
      ['necromancers_soulsteps', fromBoss('grand_necromancer_velkhar')],
      ['wyrmshadow_legguards', fromBoss('grand_necromancer_velkhar')],
      // Korzul final
      ['wyrmfang_greatblade', fromBoss('korzul_the_gravewyrm')],
      ['staff_of_the_gravewyrm', fromBoss('korzul_the_gravewyrm')],
      ['fang_of_korzul', fromBoss('korzul_the_gravewyrm')],
      ['deathlord_warplate', fromBoss('korzul_the_gravewyrm')],
      ['necromancers_starshroud', fromBoss('korzul_the_gravewyrm')],
      ['wyrmshadow_harness', fromBoss('korzul_the_gravewyrm')],
      ['deathlords_dread_visage', fromBoss('korzul_the_gravewyrm')],
      ['necromancers_soulspire_mantle', fromBoss('korzul_the_gravewyrm')],
      ['wyrmshadow_talongrips', fromBoss('korzul_the_gravewyrm')],
      ['nightfangs_greatstaff', fromBoss('korzul_the_gravewyrm')],
      ['wildgrowth_leggings', fromBoss('korzul_the_gravewyrm')],
      ['grovewardens_grips', fromBoss('korzul_the_gravewyrm')],
      ['verdant_walkers', fromBoss('korzul_the_gravewyrm')],
      ['gravewyrm_bone_quiver', fromBoss('korzul_the_gravewyrm')],
    ),
  },
  {
    id: 'conquerors_gravewyrm_sanctum_heroic',
    shelf: 'conquerors',
    name: 'Heroic Gravewyrm Sanctum',
    desc: 'Heroic-only epics from Korzul the Gravewyrm.',
    clearSource: { kind: 'dungeon', dungeonId: 'gravewyrm_sanctum', difficulty: 'heroic' },
    sourceDefault: fromBoss('korzul_the_gravewyrm'),
    relics: items(...RELIQUARY_HEROIC_GEAR.korzul_the_gravewyrm),
  },
  {
    id: 'conquerors_wildheart_basin',
    shelf: 'conquerors',
    name: 'The Wildheart Basin',
    desc: 'Signature weapons from Zulgar and the Fanglord.',
    clearSource: { kind: 'dungeon', dungeonId: 'wildheart_basin', difficulty: 'normal' },
    relics: items(
      ['fanglords_beastspear', fromBoss('wildheart_beastmaster')],
      ['wildheart_tuskblade', fromBoss('wildheart_high_priest')],
      ['wildheart_hexwood_staff', fromBoss('wildheart_high_priest')],
      ['wildheart_fangknife', fromBoss('wildheart_high_priest')],
    ),
  },
  {
    id: 'conquerors_wildheart_basin_heroic',
    shelf: 'conquerors',
    name: 'Heroic Wildheart Basin',
    desc: 'Heroic-only epics from Zulgar, Voice of the Basin.',
    clearSource: { kind: 'dungeon', dungeonId: 'wildheart_basin', difficulty: 'heroic' },
    sourceDefault: fromBoss('wildheart_high_priest'),
    relics: items(...RELIQUARY_HEROIC_GEAR.wildheart_high_priest),
  },
  // ---- Raid ----
  {
    id: 'conquerors_nythraxis',
    shelf: 'conquerors',
    name: 'Nythraxis Raid',
    desc: 'Epic and legendary spoils from Nythraxis, Scourge of Thornpeak.',
    clearSource: { kind: 'dungeon', dungeonId: 'nythraxis_boss_arena', difficulty: 'normal' },
    // The raid's one boss drops every relic on the page.
    sourceDefault: fromBoss('nythraxis_scourge_of_thornpeak'),
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
    sourceDefault: fromBoss('nythraxis_scourge_of_thornpeak'),
    relics: items(...RELIQUARY_HEROIC_GEAR.nythraxis_scourge_of_thornpeak),
  },
  // ---- World boss ----
  {
    id: 'conquerors_thunzharr',
    shelf: 'conquerors',
    name: 'Thunzharr, the Waking Peak',
    desc: 'Personal epic spoils from the Waking Peak world boss.',
    clearSource: { kind: 'deed_stat', stat: 'thunzharrKills' },
    // The world boss drops every relic on the page.
    sourceDefault: fromBoss('thunzharr_waking_peak'),
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
    // Both rares have TWO live routes at once: the lockpick chest function and
    // Brother Halven's heroicClear Marks stock. Neither is the answer on its
    // own, and the chest is not a boss, a vendor, or a zone, so the page is
    // left un-hinted pending a maintainer ruling (SOURCE_PENDING_RULING).
    relics: items('deacon_reliquary_helm', 'varric_shadow_cowl'),
  },
  {
    id: 'conquerors_drowned_litany',
    shelf: 'conquerors',
    name: 'The Drowned Litany',
    desc: 'Rare and epic spoils from the Drowned Litany.',
    clearSource: { kind: 'delve', delveId: 'drowned_litany' },
    // The first six come only from the Rite reliquary chest, which the loot
    // vocabulary cannot name (it is opened by the Rite puzzle, not a boss
    // kill), so they stay un-hinted in SOURCE_PENDING_RULING. The last two are
    // Marks-stock only, with no chest route at all, so their vendor is certain.
    relics: items(
      'nhalias_bell_maul',
      'widow_silk_hood',
      'nhalias_litany_rod',
      'blackwater_vanguard_chest',
      'siltstep_leggings',
      'sunken_reliquary_hood',
      ['sister_nhalia_choir_plate', fromVendor('brother_halven_marsh')],
      ['drowned_choir_fang', fromVendor('brother_halven_marsh')],
    ),
  },
  // ---- Epic set pages (members shared with dungeon/world-boss pages) ----
  {
    id: 'conquerors_set_deathlord',
    shelf: 'conquerors',
    name: 'Barrowlord Battlegear',
    desc: 'The full Deathlord plate family.',
    clearSource: { kind: 'none' },
    relics: items(...setMembers(RELIQUARY_SET_MEMBERS.deathlord)),
  },
  {
    id: 'conquerors_set_wyrmshadow',
    shelf: 'conquerors',
    name: 'Nightfang Vestments',
    desc: 'The full Wyrmshadow leather family.',
    clearSource: { kind: 'none' },
    relics: items(...setMembers(RELIQUARY_SET_MEMBERS.wyrmshadow)),
  },
  {
    id: 'conquerors_set_necromancers',
    shelf: 'conquerors',
    name: 'Mournweave Raiment',
    desc: 'The full Necromancers cloth family.',
    clearSource: { kind: 'none' },
    relics: items(...setMembers(RELIQUARY_SET_MEMBERS.necromancers)),
  },
  {
    id: 'conquerors_set_crownforged',
    shelf: 'conquerors',
    name: 'Bonewrought Regalia',
    desc: 'The full Crownforged plate family.',
    clearSource: { kind: 'none' },
    relics: items(...setMembers(RELIQUARY_SET_MEMBERS.crownforged)),
  },
  {
    id: 'conquerors_set_nighttalon',
    shelf: 'conquerors',
    name: 'Direfang Pelt',
    desc: 'The full Nighttalon leather family.',
    clearSource: { kind: 'none' },
    relics: items(...setMembers(RELIQUARY_SET_MEMBERS.nighttalon)),
  },
  {
    id: 'conquerors_set_soulflame',
    shelf: 'conquerors',
    name: 'Wraithfire Regalia',
    desc: 'The full Soulflame cloth family.',
    clearSource: { kind: 'none' },
    relics: items(...setMembers(RELIQUARY_SET_MEMBERS.soulflame)),
  },
  {
    id: 'conquerors_set_stormcallers',
    shelf: 'conquerors',
    name: 'Galecall Vestments',
    desc: 'The full Stormcallers cloth family.',
    clearSource: { kind: 'none' },
    relics: items(...setMembers(RELIQUARY_SET_MEMBERS.stormcallers)),
  },

  // ---- Professions shelf (Phase 7): lifetime prestige, not every craft ----
  {
    id: 'professions_masterwork',
    shelf: 'professions',
    name: 'Masterwork Gallery',
    desc: 'Lifetime trophies for first masterworks. Empty until the next proc if a veteran predates the gallery (no invented craft history).',
    clearSource: { kind: 'none' },
    // Each per-craft mark names its craft. masterworkFirst is deliberately
    // un-hinted: it fires on the first masterwork from ANY of the five gear
    // crafts, so no single profession id is its source (SOURCE_PENDING_RULING).
    relics: marks(
      RELIQUARY_PROFESSION_MARKS.masterworkFirst,
      ...RELIQUARY_PROFESSION_MARKS.masterworkByCraft.map(
        (markId) => [markId, fromProfession(markId.slice('masterwork:'.length))] as const,
      ),
    ),
  },
  {
    id: 'professions_field_notes',
    shelf: 'professions',
    name: 'Rare Field Notes',
    desc: 'Signature rare finds from the wild: veins, heartwood, moonlit blooms, and perfect specimens.',
    clearSource: { kind: 'none' },
    // gatherRareEventFlavor (src/sim/professions/gather_events.ts) maps the
    // node type to the flavor, and NODE_HARVEST_TABLE maps that node type to
    // the profession that works it: ore to mining, wood to logging, herb to
    // herbalism. perfect_specimen is the corpse-harvest flavor instead, and
    // corpse harvest belongs to no gathering profession, so it stays un-hinted
    // (SOURCE_PENDING_RULING).
    relics: marks(
      ...withProfessions(RELIQUARY_PROFESSION_MARKS.fieldNotes, FIELD_NOTE_PROFESSIONS),
    ),
  },
  {
    id: 'professions_specimens',
    shelf: 'professions',
    name: 'Key Specimens',
    desc: 'Pristine corpse specimens and apex fine-grade field materials that stock a crafter museum.',
    clearSource: { kind: 'none' },
    // The fine_* trio are gathering-node jackpots, so each names the profession
    // that works its node family (MATERIAL_GRADES in
    // src/sim/professions/material_grades.ts pairs the base material with its
    // fine id). The five pristine specimens come from corpse harvest, which no
    // gathering profession owns, so they stay un-hinted
    // (SOURCE_PENDING_RULING), same ruling as gather_event:perfect_specimen.
    relics: items(...withProfessions(RELIQUARY_PROFESSION_SPECIMEN_ITEMS, SPECIMEN_PROFESSIONS)),
  },

  // ---- Horizons shelf (Phase 8): mounts, account weapon skins, deed titles ----
  {
    id: 'horizons_mounts',
    shelf: 'horizons',
    name: 'Mounts',
    desc: 'Rideable mounts from the stable, heroic reins, Rift epics, and rarer saddles. Ownership follows the live reins seam (bags and bank).',
    clearSource: { kind: 'none' },
    // No mount carries a hint, and that is a finding rather than an omission:
    // every one has either several live routes at once or none at all. The
    // four heroic reins each drop from two or three different HEROIC_BOSS_LOOT
    // bosses AND from Rift progression (RIFT_GREEN/BLUE/EPIC_MOUNT_REINS,
    // src/sim/rift/progression.ts); valorsteed is both Stablemaster Marla's
    // vendor stock and the q_riding_lessons reward; drakemaw_raptor has NO
    // acquisition path today (see the def comment in content/drakelands.ts)
    // and terrorspark_groundshaker is dev-grant only. The whole page is pinned
    // in SOURCE_PENDING_RULING until a maintainer rules.
    relics: mounts(...RELIQUARY_HORIZON_MOUNTS),
  },
  {
    id: 'horizons_weapon_skins',
    shelf: 'horizons',
    name: 'Weapon Skins',
    desc: 'Account-wide Armory weapon skins. Empty offline or without account cosmetics; never character loot.',
    clearSource: { kind: 'none' },
    // Armory skins are granted only by Claudium store purchases
    // (grantWeaponSkinsToAccount, server/game.ts, driven by server/claudium.ts).
    // That is an account-level storefront, not a boss, zone, profession, deed,
    // or in-world vendor NPC, so this vocabulary cannot name it and no skin
    // carries a hint (SOURCE_PENDING_RULING).
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

/**
 * The source hint a relic answers with on a given page: its own hint, else the
 * page default, else null. Null is a real answer ("content does not name one
 * source"), not a missing value the caller should paper over with prose.
 *
 * THE one implementation of that precedence: every production caller, the
 * client view included, goes through here rather than re-spelling
 * `?? sourceDefault` (tests may re-spell it deliberately as an independent
 * oracle).
 *
 * Takes the page DEF, not a page id. The same relic sits on two pages (a set
 * member on both its boss page and its set page), so the page has to come from
 * the caller either way, and a def closes the hole an id lookup would open: a
 * synthetic page reusing a live id would otherwise silently inherit the live
 * catalog row's default instead of its own.
 */
export function reliquaryRelicSource(
  page: ReliquaryPageDef | undefined,
  relic: ReliquaryRelicDef,
): ReliquarySourceHint | null {
  return relic.source ?? page?.sourceDefault ?? null;
}
