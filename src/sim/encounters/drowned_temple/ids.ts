// The Drowned Temple bosses' ids, tuning and pure geometry, as a dependency-
// light leaf: the encounter modules, the dev helpers, the renderer's boss
// visuals and the tests all key on these. No SimContext, no rng.

import {
  CHOIR_COURT,
  HYDRA_POOL,
  HYDRA_POOL_COLUMN_R,
  HYDRA_POOL_COLUMNS,
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
/** Retired: Selthe's old backhand. She is a caster now and never casts it; the
 *  id stays so the shipped cast-name rows (and an old replay) still resolve. */
export const SELTHE_TIDAL_SLAP = 'temple_tidal_slap';
/** Selthe's filler: a bolt of moonwater at her foe (a bar, kickable). */
export const SELTHE_MOONWATER_BOLT = 'temple_moonwater_bolt';
/** Selthe's sung beam of water on one player (a channel, kickable; line of
 *  sight breaks it, a body in the way catches it). */
export const SELTHE_DROWNING_ARIA = 'temple_drowning_aria';
/** Selthe heaves her pool: a wave crashes through a wedge of the court. */
export const SELTHE_MERE_SURGE = 'temple_mere_surge';
/** The ice head's frost cone (the cast id kept from the first pass; its bar
 *  reads Freezing Breath). */
export const HYDRA_TIDE_BREATH = 'temple_tide_breath';
/** The venom head's spit (the id kept from the first pass; it reads Venom Spit). */
export const HYDRA_BRINE_SPIT = 'temple_brine_spit';
/** The water head's torrent down a lane, with a shove. */
export const HYDRA_CRUSHING_TORRENT = 'temple_crushing_torrent';
/** The whole Hydra sinks and a wave rolls over one half of the pool. */
export const HYDRA_TSUNAMI = 'temple_hydra_tsunami';
export const COLOSSUS_PRISM_FLARE = 'temple_prism_flare';
export const COLOSSUS_MOONLIGHT_LANCE = 'temple_moonlight_lance';
export const COLOSSUS_RESONANT_SLAM = 'temple_resonant_slam';
/** The terrace floor splits into prism slices that detonate in three rounds
 *  (one long planted channel). */
export const COLOSSUS_TIDEGLASS_FRACTURE = 'temple_tideglass_fracture';
export const YSOLEI_LUNAR_TIDE = 'temple_lunar_tide';
export const YSOLEI_UNDERTOW = 'temple_undertow';
/** Ysolei's roar as her Moonspawn rise (a bar, never kicked). */
export const YSOLEI_CALL = 'temple_ysolei_call';
/** Ysolei's roar as she enrages (a bar, never kicked). */
export const YSOLEI_WRATH = 'temple_ysolei_wrath';

// ---- aura ids ---------------------------------------------------------------------
export const SELTHE_CHORUS_MARK = 'temple_chorus_mark';
export const SELTHE_SOLO_MARK = 'temple_solo_mark';
export const HYDRA_ENRAGED = 'temple_enraged_hydra';
/** A head under the water for the Tsunami: it takes far less damage. */
export const HYDRA_SUBMERGED = 'temple_hydra_submerged';
/** The Freezing Breath's chill on whoever it caught. */
export const HYDRA_FROSTBITE = 'temple_hydra_frostbite';
export const COLOSSUS_PRISM_WARD = 'temple_prism_ward';
export const REFLECTION_TETHER = 'temple_reflection_tether';
export const YSOLEI_FLOODED = 'temple_flooded';
export const YSOLEI_RIPTIDE_AURA = 'temple_riptide';

// ---- spellfx ability ids (presentation cues, never casts) ------------------------
export const SELTHE_CHORUS_BURST = 'temple_chorus_burst';
export const SELTHE_SOLO_BURST = 'temple_solo_burst';
export const SELTHE_ECHO_BURST = 'temple_echo_burst';
/** A Drowning Aria pulse lands on the player it struck (targetId). */
export const SELTHE_ARIA_PULSE = 'temple_aria_pulse';
/** A Drowning Aria broke (sight lost, kicked, its target fell or fled). */
export const SELTHE_ARIA_BROKEN = 'temple_aria_broken';
/** One red Tideglass Fracture slice detonates (targetId: its slice object). */
export const FRACTURE_BURST = 'temple_fracture_burst';
export const REFLECTION_SHATTER = 'temple_reflection_shatter';
/** A fallen Hydra head grows back (its regrowth burst). */
export const HYDRA_REGROWTH = 'temple_hydra_regrowth';
export const YSOLEI_TIDAL_CRASH = 'temple_tidal_crash';

/** The boss bars a player interrupt can cut (Kick, Pummel, Counterspell),
 *  by the school the lockout lands in: Selthe's bolt and her aria. Spread into
 *  mob/healer_channel.ts SCRIPTED_INTERRUPTIBLE_CHANNELS. Every other Temple
 *  boss bar is a mechanic to dodge, never kicked. */
export const TEMPLE_BOSS_CAST_SCHOOLS: Readonly<Record<string, { school: 'frost' }>> = {
  [SELTHE_MOONWATER_BOLT]: { school: 'frost' },
  [SELTHE_DROWNING_ARIA]: { school: 'frost' },
};

// ---- encounter object templates (the state rides the template id) ----------------
export const BRINE_SPIT_TEMPLATE = 'temple_brine_spit_pool';
/** The venom a Venom Spit leaves where it burst (a standing hazard). */
export const VENOM_POOL_TEMPLATE = 'temple_venom_pool';
/** The Tsunami's wave: warned, then rolling (its facing is the roll's heading,
 *  its scale the pool's radius). */
export const TSUNAMI_TEMPLATES = {
  warn: 'temple_tsunami_warn',
  surge: 'temple_tsunami_surge',
} as const;
/** One slice of the Tideglass Fracture (its facing is the slice's middle
 *  heading round the terrace centre, its scale the slice's reach): cracking
 *  while the bar opens, then red (it detonates) or safe (clear glass). */
export const FRACTURE_TEMPLATES = {
  crack: 'temple_fracture_crack',
  red: 'temple_fracture_red',
  safe: 'temple_fracture_safe',
} as const;
export type FractureState = keyof typeof FRACTURE_TEMPLATES;
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
  VENOM_POOL_TEMPLATE,
  ...Object.values(TSUNAMI_TEMPLATES),
  CHORUS_ECHO_TEMPLATE,
  SOLO_ECHO_TEMPLATE,
  RIPTIDE_TEMPLATE,
  ...Object.values(TIDE_TEMPLATES),
  ...Object.values(FRACTURE_TEMPLATES),
]);

export function fractureStateOf(templateId: string): FractureState | null {
  if (templateId === FRACTURE_TEMPLATES.crack) return 'crack';
  if (templateId === FRACTURE_TEMPLATES.red) return 'red';
  if (templateId === FRACTURE_TEMPLATES.safe) return 'safe';
  return null;
}

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
  // ---- the caster pass: she never swings her hands and never leaves her pool.
  // Moonwater Bolt replaces her melee as the tank's pressure. Her swing was
  // her weapon roll (63 to 98 on normal, the elite template at 16) every
  // 2.2 s: 35.8 raw DPS, about 23 after a level-16 tank's 36 percent armor
  // reduction (armor / (armor + 400 + 85 x 16) at about 1,000 armor). A bolt
  // is one weapon roll x boltWeaponShare of frost (armor never touches it)
  // every boltCast + boltGap = 2.5 s: 0.8 x 80.7 / 2.5 = about 26 DPS while
  // she bolts, and she bolts only between her other bars, so the tank takes a
  // little less than before. Reading her live weapon keeps the heroic row's
  // melee factor on it (the tank-swing floor), where her mechanics ride the
  // row's mechanic factor.
  boltCast: 2,
  boltGap: 0.5,
  boltWeaponShare: 0.8,
  boltRange: 45,
  /** After a kick (any of her kickable bars cut short) she casts neither
   *  bolt nor aria for this long, lockout or not (a boss shrugs the school
   *  lockout's duration off by diminishing returns). */
  kickQuiet: 3,
  // Drowning Aria: a sung beam on one player who is not the tank, a pulse a
  // second for 5 s, each pulse on the same body 10 harder than the last:
  // 30 + 40 + 50 + 60 + 70 = 250 frost if nobody answers it (between one and
  // two Solos, under a lone Chorus's 400). Kick it, break her sight of the
  // target (a lamp pillar), or step into the beam: the first body between her
  // and the target catches the pulse instead, and the climb starts over on
  // whoever is struck anew, so the group can pass it round.
  ariaFirst: 16,
  ariaEvery: 22,
  ariaChannel: 5,
  ariaPulse: 1,
  ariaBase: 30,
  ariaStep: 10,
  ariaRange: 45,
  /** A body this close to the beam's line catches it. */
  ariaCatchWidth: 1.5,
  // Mere Surge (replaces the Tidal Slap): a 3 s bar facing one player, then a
  // wave crashes through a 60 degree wedge out to 30 yd: 110 to 130 frost and
  // a shove of 8 yd (the Slap's 50 to 60 plus its 8 yd throw, priced up to
  // the Hydra's avoidable Crushing Torrent, 90 to 110, since it can catch
  // several players). Heroic widens the wedge to 90 degrees.
  surgeFirst: 12,
  surgeEvery: 18,
  surgeCast: 3,
  surgeRange: 30,
  surgeArcDeg: 60,
  surgeArcDegHeroic: 90,
  surgeMin: 110,
  surgeMax: 130,
  surgeKnockback: 8,
  // Heroic Echo: each mark resolves again at the same spot 4 s later.
  echoAfter: 4,
  chorusEchoDamage: 120,
} as const;

export const COURT = CHOIR_COURT;

/** How a Chorus of `total` splits among the `n` players caught in it. */
export function chorusShare(total: number, n: number): number {
  return n <= 0 ? 0 : total / n;
}

// ---- The Mere Hydra: three elements, one moon pool ------------------------------------

export const HYDRA_TUNING = {
  // Freezing Breath (the ice head): a frost cone that chills.
  breathFirst: 6,
  breathEvery: 12,
  breathCast: 2,
  breathRange: 18,
  breathArcDeg: 60,
  breathMin: 110,
  breathMax: 130,
  chillSlow: 0.3,
  chillSeconds: 4,
  // Venom Spit (the venom head): pools that burst, then linger as venom.
  spitFirst: 4,
  spitEvery: 10,
  spitCount: 3,
  spitWarn: 1.5,
  spitRadius: 4,
  spitMin: 60,
  spitMax: 75,
  venomSeconds: 6,
  venomRadius: 3.5,
  venomPerSecond: 20,
  // Crushing Torrent (the water head): a lane of water that hurls you back.
  torrentFirst: 9,
  torrentEvery: 12,
  torrentCast: 2,
  torrentLength: 26,
  torrentHalfWidth: 2.5,
  torrentMin: 90,
  torrentMax: 110,
  torrentKnockback: 8,
  // Tsunami: the Hydra sinks and a wave rolls over one half of the pool.
  tsunamiFirst: 24,
  tsunamiEvery: 40,
  tsunamiCast: 4.5,
  /** The wave starts rolling this long before the bar ends (render cue). */
  tsunamiRoll: 1.2,
  tsunamiMin: 160,
  tsunamiMax: 190,
  tsunamiKnockback: 10,
  /** The damage a submerged head shrugs off. */
  submergedReduction: 0.75,
  /** Heroic backwash: the wave rolls back over the other half this long after. */
  backwashAfter: 3.5,
  /** A column shelters a body this far behind it, this wide. */
  leeDepth: 5,
  leeHalfWidth: 2,
  // Regrowth: a fallen head grows back while another head lives.
  regrowAfter: 20,
  regrowShare: 0.5,
  /** Enraged Hydra: damage done per fallen head. */
  enragePerHead: 0.15,
  /** The deed: all three heads within this many seconds. */
  deedWindow: 10,
} as const;

export const POOL = HYDRA_POOL;

/** The three heads' elements, left to right: ice, venom, water. */
export type HydraElement = 'frost' | 'venom' | 'tide';
export const HYDRA_ELEMENTS: readonly HydraElement[] = ['frost', 'venom', 'tide'];

/**
 * Which head (0 left, 1 centre, 2 right) wields each element (in HYDRA_ELEMENTS
 * order), given which heads are dead: its own head while that lives, else the
 * next living head round (left, centre, right, left), so the survivors inherit
 * a fallen head's attack. Null when every head is dead. Pure: the renderer
 * reads the same answer off the heads' dead flags.
 */
export function hydraElementOwners(dead: readonly boolean[]): (number | null)[] {
  return HYDRA_ELEMENTS.map((_, i) => {
    for (let k = 0; k < 3; k++) {
      const h = (i + k) % 3;
      if (!dead[h]) return h;
    }
    return null;
  });
}

export type TsunamiSide = 'east' | 'west';

/** The side the n-th Tsunami (0 based) rises on: east, then west, alternating. */
export function tsunamiSide(n: number): TsunamiSide {
  return n % 2 === 0 ? 'east' : 'west';
}

/** The heading (sim yaw, 0 toward +z) a wave rolls on: away from its side. */
export function tsunamiHeading(side: TsunamiSide): number {
  return side === 'east' ? -Math.PI / 2 : Math.PI / 2;
}

/** Is a spot (instance-local) on the half of the pool a wave from `side` rolls
 *  over? The half's rim and the pool's middle line are inside. */
export function inTsunamiPath(side: TsunamiSide, x: number, z: number): boolean {
  if (Math.hypot(x - HYDRA_POOL.x, z - HYDRA_POOL.z) > HYDRA_POOL.r + 3) return false;
  return side === 'east' ? x >= HYDRA_POOL.x - 1 : x <= HYDRA_POOL.x + 1;
}

/** Does a rim column shelter a spot from a wave from `side` (the spot stands in
 *  its lee: behind it along the wave's heading, within the column's shadow)? */
export function inTsunamiLee(side: TsunamiSide, x: number, z: number): boolean {
  const T = HYDRA_TUNING;
  const dir = side === 'east' ? -1 : 1;
  for (const c of HYDRA_POOL_COLUMNS) {
    const along = (x - c.x) * dir;
    if (along < HYDRA_POOL_COLUMN_R * 0.5 || along > T.leeDepth + HYDRA_POOL_COLUMN_R) continue;
    if (Math.abs(z - c.z) <= T.leeHalfWidth) return true;
  }
  return false;
}

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
  // Tideglass Fracture: the terrace floor splits into eight prism slices
  // round its centre. A 1.5 s bar (the floor cracks), then three rounds: some
  // slices glow red, the rest run clear, and fractureWarn later the red ones
  // detonate (120 to 130 arcane to everyone standing on one, and on the hub
  // under the plinth). Each round's safe slices were red the round before, so
  // every round the group must move one slice over. He stands planted for the
  // whole channel (1.5 + 3 x 2.5 = 9 s), no Lance or Slam inside it. Priced
  // just above the Moonlight Lance (90 to 110): a round is readable for 2.5 s
  // and a move of one slice (about 8 yd at 10 yd out) takes about 1.1 s at
  // run speed. Standing still through all three costs about 375, the price of
  // a fumbled core (the Lance and the Slam together are about 190).
  fractureFirst: 20,
  fractureEvery: 32,
  fractureCast: 1.5,
  fractureWarn: 2.5,
  /** Heroic: the red slices detonate sooner. */
  fractureWarnHeroic: 2,
  fractureMin: 120,
  fractureMax: 130,
} as const;

export const TERRACE = PRISM_TERRACE;

/** The Tideglass Fracture's slices round the terrace centre (slice 0 is
 *  centred due +z; the index grows with the sim yaw, toward +x first). */
export const FRACTURE_SLICES = 8;
/** The hub under the plinth: part of no slice, it detonates every round. */
export const FRACTURE_HUB = 3;
/** How far out the fracture runs (the terrace and the step below its rim). */
export const FRACTURE_REACH = PRISM_TERRACE.r + 8;
/** Each round's SAFE slices before the cast's rotation. A round's safe
 *  slices are all red in the round before it: everyone moves. */
export const FRACTURE_SAFE_PATTERNS: readonly (readonly number[])[] = [
  [1, 3, 5, 7],
  [0, 2, 4, 6],
  [3, 7],
];
export const FRACTURE_ROUNDS = FRACTURE_SAFE_PATTERNS.length;

/** The middle heading (sim yaw, 0 toward +z) of slice `i`. */
export function fractureSliceYaw(i: number): number {
  return (i * Math.PI * 2) / FRACTURE_SLICES;
}

/**
 * The slice a spot (instance-local) stands on, or 'hub' under the plinth, or
 * null off the fracture entirely (beyond its reach). Slice i spans its middle
 * heading +-22.5 degrees; a spot exactly on a seam belongs to the lower index.
 */
export function fractureSliceAt(x: number, z: number): number | 'hub' | null {
  const dx = x - PRISM_TERRACE.x;
  const dz = z - PRISM_TERRACE.z;
  const d = Math.hypot(dx, dz);
  if (d > FRACTURE_REACH) return null;
  if (d < FRACTURE_HUB) return 'hub';
  const step = (Math.PI * 2) / FRACTURE_SLICES;
  let a = Math.atan2(dx, dz) + step / 2;
  a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return Math.min(FRACTURE_SLICES - 1, Math.floor(a / step));
}

/** The safe slices of round `round` (0 based) for a cast rotated `rot`. */
export function fractureSafeSlices(round: number, rot: number): number[] {
  const base = FRACTURE_SAFE_PATTERNS[round] ?? [];
  return base.map((i) => (((i + rot) % FRACTURE_SLICES) + FRACTURE_SLICES) % FRACTURE_SLICES);
}

/** Does a spot detonate in this round (a red slice, or the hub)? */
export function fractureHits(round: number, rot: number, x: number, z: number): boolean {
  const at = fractureSliceAt(x, z);
  if (at === null) return false;
  if (at === 'hub') return true;
  return !fractureSafeSlices(round, rot).includes(at);
}

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
  /** The roars that open her Moonspawn and her enrage. */
  callCast: 2.2,
  wrathCast: 2.5,
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
