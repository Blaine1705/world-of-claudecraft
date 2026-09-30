// The Drowned Temple bosses' ids, tuning and pure geometry, as a dependency-
// light leaf: the encounter modules, the dev helpers, the renderer's boss
// visuals and the tests all key on these. No SimContext, no rng.

import {
  CHOIR_COURT,
  HYDRA_POOL,
  MOON_ALTAR,
  PRISM_TERRACE,
} from '../../content/drowned_temple_layout';

export const SELTHE_ID = 'choirmother_selthe';
export const COLOSSUS_ID = 'tideglass_colossus';
export const REFLECTION_ID = 'tideglass_reflection';
export const YSOLEI_ID = 'ysolei';
export const MOONSPAWN_ID = 'moonspawn';
export const HYDRA_LEFT_ID = 'mere_hydra_head_left';
export const HYDRA_CENTER_ID = 'mere_hydra_head_center';
export const HYDRA_RIGHT_ID = 'mere_hydra_head_right';
export const HYDRA_HEAD_TEMPLATES: readonly string[] = [
  HYDRA_LEFT_ID,
  HYDRA_CENTER_ID,
  HYDRA_RIGHT_ID,
];

// ---- cast ids (real cast bars on the bosses) -------------------------------------
export const SELTHE_SEA_SONG = 'temple_sea_song';
export const SELTHE_TIDAL_SLAP = 'temple_tidal_slap';
export const HYDRA_TIDE_BREATH = 'temple_tide_breath';
export const HYDRA_BRINE_SPIT = 'temple_brine_spit';
export const COLOSSUS_PRISM_FLARE = 'temple_prism_flare';
export const COLOSSUS_MOONLIGHT_LANCE = 'temple_moonlight_lance';
export const COLOSSUS_RESONANT_SLAM = 'temple_resonant_slam';
export const YSOLEI_LUNAR_TIDE = 'temple_lunar_tide';
export const YSOLEI_UNDERTOW = 'temple_undertow';

// ---- aura ids ---------------------------------------------------------------------
export const SELTHE_CHORUS_MARK = 'temple_chorus_mark';
export const SELTHE_SOLO_MARK = 'temple_solo_mark';
export const HYDRA_ENRAGED = 'temple_enraged_hydra';
export const COLOSSUS_PRISM_WARD = 'temple_prism_ward';
export const REFLECTION_TETHER = 'temple_reflection_tether';
export const YSOLEI_FLOODED = 'temple_flooded';
export const YSOLEI_RIPTIDE_AURA = 'temple_riptide';

// ---- spellfx ability ids (presentation cues, never casts) ------------------------
export const SELTHE_CHORUS_BURST = 'temple_chorus_burst';
export const SELTHE_SOLO_BURST = 'temple_solo_burst';
export const SELTHE_ECHO_BURST = 'temple_echo_burst';
export const REFLECTION_SHATTER = 'temple_reflection_shatter';
export const YSOLEI_TIDAL_CRASH = 'temple_tidal_crash';

// ---- encounter object templates (the state rides the template id) ----------------
export const BRINE_SPIT_TEMPLATE = 'temple_brine_spit_pool';
export const CHORUS_ECHO_TEMPLATE = 'temple_chorus_echo';
export const SOLO_ECHO_TEMPLATE = 'temple_solo_echo';
export const RIPTIDE_TEMPLATE = 'temple_riptide_pool';
export const TIDE_TEMPLATES = {
  dry: 'temple_tide_dry',
  warn: 'temple_tide_warn',
  flood: 'temple_tide_flood',
} as const;
export type TideState = keyof typeof TIDE_TEMPLATES;

/** Every Temple encounter object template (the renderer draws them itself). */
export const TEMPLE_OBJECT_TEMPLATES: ReadonlySet<string> = new Set([
  BRINE_SPIT_TEMPLATE,
  CHORUS_ECHO_TEMPLATE,
  SOLO_ECHO_TEMPLATE,
  RIPTIDE_TEMPLATE,
  ...Object.values(TIDE_TEMPLATES),
]);

export function tideStateOf(templateId: string): TideState | null {
  if (templateId === TIDE_TEMPLATES.dry) return 'dry';
  if (templateId === TIDE_TEMPLATES.warn) return 'warn';
  if (templateId === TIDE_TEMPLATES.flood) return 'flood';
  return null;
}

// ---- Choirmother Selthe: stack for Chorus, spread for Solo ----------------------------

export const SELTHE_TUNING = {
  chorusFirst: 10,
  chorusEvery: 25,
  /** Solo lands 12 s after each Chorus (heroic Duet: with it). */
  soloOffset: 12,
  markSeconds: 5,
  chorusRadius: 6,
  chorusTotal: 400,
  soloRadius: 8,
  soloDamage: 150,
  songFirst: 6,
  songEvery: 10,
  songCast: 1.5,
  songMin: 35,
  songMax: 45,
  slapFirst: 8,
  slapEvery: 15,
  slapCast: 1,
  slapMin: 50,
  slapMax: 60,
  slapKnockback: 8,
  // Heroic Echo: each mark resolves again at the same spot 4 s later.
  echoAfter: 4,
  chorusEchoDamage: 120,
} as const;

export const COURT = CHOIR_COURT;

/** How a Chorus of `total` splits among the `n` players caught in it. */
export function chorusShare(total: number, n: number): number {
  return n <= 0 ? 0 : total / n;
}

// ---- The Mere Hydra: breaths, spit and the enraged necks -------------------------------

export const HYDRA_TUNING = {
  breathFirst: 6,
  breathEvery: 10,
  breathCast: 2,
  breathRange: 18,
  breathArcDeg: 60,
  breathMin: 110,
  breathMax: 130,
  spitFirst: 4,
  spitEvery: 8,
  spitCount: 3,
  spitWarn: 1.5,
  spitRadius: 4,
  spitMin: 70,
  spitMax: 90,
  /** Enraged Hydra: damage done per fallen head. */
  enragePerHead: 0.15,
  /** The deed: all three heads within this many seconds. */
  deedWindow: 10,
} as const;

export const POOL = HYDRA_POOL;

// ---- The Tideglass Colossus: your own reflection fights you ----------------------------

export const COLOSSUS_TUNING = {
  flareAt: [0.75, 0.5, 0.25],
  flareCast: 2,
  /** A Reflection's health, as a share of the Colossus's maximum health. */
  reflectionShare: 0.08,
  /** Damage the Colossus shrugs off per living Reflection. */
  wardPerReflection: 0.1,
  wardCap: 0.5,
  lanceFirst: 8,
  lanceEvery: 12,
  lanceCast: 2,
  lanceLength: 30,
  lanceHalfWidth: 2,
  lanceMin: 90,
  lanceMax: 110,
  slamFirst: 12,
  slamEvery: 14,
  slamCast: 1.5,
  slamRadius: 12,
  slamMin: 70,
  slamMax: 90,
  slamKnockback: 8,
  // Heroic: Shattering Glass (a dying Reflection bursts) and Swapped Images.
  shatterRadius: 4,
  shatterDamage: 80,
  swapEvery: 8,
  /** The deed: every Reflection broken within this many seconds of appearing. */
  deedWindow: 15,
} as const;

export const TERRACE = PRISM_TERRACE;

// ---- Ysolei: run out of the undertow toward the dry half -------------------------------

export const YSOLEI_TUNING = {
  lunarFirst: 5,
  lunarEvery: 10,
  lunarCast: 1.5,
  lunarRadius: 13,
  lunarMin: 60,
  lunarMax: 80,
  undertowFirst: 15,
  undertowEvery: 25,
  undertowSeconds: 3,
  /** Yards per second every player is dragged toward her. */
  undertowPull: 3.5,
  /** The pull reaches everyone on the island and a little beyond. */
  undertowReach: 45,
  crashRadius: 12,
  crashMin: 250,
  crashMax: 300,
  /** The Rising Tide starts under this share of her health. */
  tideBelow: 0.66,
  /** Seconds a half stays flooded before the tide switches halves. */
  tideEvery: 30,
  /** The shimmer on the half about to flood, before it floods. */
  tideWarn: 10,
  floodPerSecond: 45,
  floodSlow: 0.5,
  // Heroic: Riptide puddles and the Drowned Moon.
  riptideSeconds: 10,
  riptideRadius: 3.5,
  riptidePerSecond: 40,
  drownedMoonEvery: 20,
} as const;

export const ALTAR = MOON_ALTAR;

export type TideHalf = 'north' | 'south';

/** Which half of the Moon Altar island a spot (instance-local) stands in. */
export function tideHalfAt(x: number, z: number): TideHalf {
  void x;
  return z >= MOON_ALTAR.z ? 'north' : 'south';
}

/** Is a spot on the island (or its rim) and inside the given half? */
export function inTideHalf(half: TideHalf, x: number, z: number): boolean {
  if (Math.hypot(x - MOON_ALTAR.x, z - MOON_ALTAR.z) > MOON_ALTAR.r + 1) return false;
  return tideHalfAt(x, z) === half;
}

/** The centre of each half (where its tide object stands). */
export const TIDE_HALF_SPOTS: Readonly<Record<TideHalf, { x: number; z: number }>> = {
  north: { x: MOON_ALTAR.x, z: MOON_ALTAR.z + MOON_ALTAR.r * 0.5 },
  south: { x: MOON_ALTAR.x, z: MOON_ALTAR.z - MOON_ALTAR.r * 0.5 },
};

export function otherHalf(h: TideHalf): TideHalf {
  return h === 'north' ? 'south' : 'north';
}
