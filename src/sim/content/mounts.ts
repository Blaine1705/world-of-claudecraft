// ---------------------------------------------------------------------------
// Rideable ground mounts: the declarative catalog, shared host-agnostic data.
//
// Used by the authoritative Sim (level gates, the speed/block/crit hooks), the
// renderer (key -> mount GLB visual), and the HUD Mounts window (rows render
// their names/descriptions through the UI's own t() keys, keyed by MountKey).
// It lives in sim/ so it carries no DOM/render imports and runs unchanged on
// the server, offline, and headless.
//
// Every mount is a GROUND mount by design (no flying): the bonus only ever
// scales normal ground/swim locomotion in player_motion.moveSpeedMult.
// ---------------------------------------------------------------------------

export type MountKey =
  | 'grag_bear'
  | 'stalkglider_snail'
  | 'valorsteed'
  | 'aether_hover_cycle'
  | 'shadowjump_toad'
  | 'stormfeather_griffin';

export type MountRarity = 'common' | 'rare' | 'epic';

export interface MountDef {
  key: MountKey;
  /** Canonical English display name (the HUD localizes via hudChrome.mounts.*). */
  name: string;
  rarity: MountRarity;
  /** Required player level to select or ride (the card's "Mount Level"). */
  level: number;
  /** Additive move-speed fraction while mounted (0.6 = +60% extra mobility). */
  moveSpeedPct: number;
  /** Fraction of incoming melee swing damage blocked while mounted (0.05 = 5%). */
  meleeBlockPct: number;
  /** Additive critical strike chance while mounted (0.05 = +5%). */
  critPct: number;
}

// Speed/stat tiers (design directive): the purchasable horse is the 60% base;
// the loot-only specials tier above it (70% commons, 75% rares with a little
// crit, the 80% epic griffin with the most block and crit). The horse's level
// gate (20) matches the stablemaster's buy gate; the loot commons ride earlier
// (10), the rares at 15, the epic at 20.
export const MOUNTS: Record<MountKey, MountDef> = {
  // The base mount: first in the catalog, the natural default pick, sold by the
  // stablemaster (the only purchasable mount). Level 20 to match the buy gate.
  valorsteed: {
    key: 'valorsteed',
    name: 'Valorsteed',
    rarity: 'common',
    level: 20,
    moveSpeedPct: 0.6,
    meleeBlockPct: 0,
    critPct: 0,
  },
  grag_bear: {
    key: 'grag_bear',
    name: 'Goliath Grag-Bear',
    rarity: 'common',
    level: 10,
    moveSpeedPct: 0.7,
    meleeBlockPct: 0.05,
    critPct: 0,
  },
  stalkglider_snail: {
    key: 'stalkglider_snail',
    name: 'Moss-Shell Stalk-Glider',
    rarity: 'common',
    level: 10,
    moveSpeedPct: 0.7,
    meleeBlockPct: 0.05,
    critPct: 0,
  },
  aether_hover_cycle: {
    key: 'aether_hover_cycle',
    name: 'Aether-Jouster Hover-Cycle',
    rarity: 'rare',
    level: 15,
    moveSpeedPct: 0.75,
    meleeBlockPct: 0.05,
    critPct: 0.03,
  },
  shadowjump_toad: {
    key: 'shadowjump_toad',
    name: 'Kama-Kage the Shadow-Jump Toad',
    rarity: 'rare',
    level: 15,
    moveSpeedPct: 0.75,
    meleeBlockPct: 0.05,
    critPct: 0.03,
  },
  stormfeather_griffin: {
    key: 'stormfeather_griffin',
    name: 'Sky-Reach Stormfeather',
    rarity: 'epic',
    level: 20,
    moveSpeedPct: 0.8,
    meleeBlockPct: 0.08,
    critPct: 0.05,
  },
};

/** Catalog order for the mount picker: level tier, then declaration order. */
export const MOUNT_KEYS = Object.keys(MOUNTS) as readonly MountKey[];

/** The horse: the default stable pick and the fallback for every unknown/legacy
 *  persisted value. It is no longer free (a fresh player owns nothing): owning
 *  it means holding its reins item (reins_valorsteed), sold by the stablemaster.
 *  A persisted pick may name a mount the player does not own, which is harmless:
 *  toggleMount falls back to the first owned mount. */
export const DEFAULT_MOUNT: MountKey = 'valorsteed';

/** The steed the riding-lesson minigame lends the player for the course. It is the
 *  same catalog mount reins_valorsteed eventually grants, ridden UNOWNED during the
 *  lesson (the one sanctioned unowned mount; see src/sim/mounts.ts). Shared by
 *  src/sim/mounts.ts (the summon special-case) and src/sim/mounts_training.ts. */
export const TRAINING_MOUNT_KEY: MountKey = 'valorsteed';

export function mountDef(key: string): MountDef | null {
  return (MOUNTS as Record<string, MountDef | undefined>)[key] ?? null;
}

/** Coerce a persisted/wire string back to a valid catalog key ('' when unknown,
 *  so a save from a build that removed a mount loads cleanly unmounted). */
export function normalizeMountKey(key: string | undefined | null): MountKey | '' {
  return key && mountDef(key) ? (key as MountKey) : '';
}

/** Coerce a persisted/wire SELECTION to a valid catalog key. Unlike the live
 *  riding state (normalizeMountKey, where '' means dismounted), the stable pick
 *  always names a mount: absent/unknown values fall back to the horse. */
export function normalizeSelectedMount(key: string | undefined | null): MountKey {
  const normalized = normalizeMountKey(key);
  return normalized === '' ? DEFAULT_MOUNT : normalized;
}

/** Additive crit fraction the active mount grants ('' or non-carrier: 0). */
export function mountCritPct(mountKey: string): number {
  return mountKey ? (mountDef(mountKey)?.critPct ?? 0) : 0;
}

/** Fraction of an incoming melee swing the active mount blocks ('' : 0). */
export function mountMeleeBlockPct(mountKey: string): number {
  return mountKey ? (mountDef(mountKey)?.meleeBlockPct ?? 0) : 0;
}

/** Additive move-speed fraction of the active mount ('' : 0). */
export function mountMoveSpeedPct(mountKey: string): number {
  return mountKey ? (mountDef(mountKey)?.moveSpeedPct ?? 0) : 0;
}

// ---------------------------------------------------------------------------
// The Highwatch Stables (zone 3): the fenced paddock, split by an interior divider
// rail into a NORTH horse pasture and a SOUTH course arena, the timed show-jumping
// course, and the ambient stable horses. This is the SINGLE SOURCE OF TRUTH for the
// stable-yard geometry: zone3 content (content/zone3.ts) places its fences, jump
// props, and horse spawns from it, ambient.ts clamps the horse wander to it, and the
// riding-lesson minigame (src/sim/mounts_training.ts) reads the course. Keep the
// numbers here so the fences, props, horses, and lesson can never drift.
// ---------------------------------------------------------------------------

export interface RidingCourseDef {
  /** The full fenced paddock rectangle (world x/z). Its NORTH fence (z2) carries
   *  the opening the rider and horses pass through from Marla's yard. */
  paddock: {
    x1: number;
    x2: number;
    z1: number;
    z2: number;
    opening: { x1: number; x2: number };
  };
  /** The interior divider rail (a real collider) at z=`z`, splitting the paddock
   *  into the north pasture and the south course arena, with a gap the rider passes
   *  through. content/zone3 fences it as two runs around `opening`. */
  divider: { z: number; opening: { x1: number; x2: number } };
  /** The south course arena rectangle. A mounted player crossing from outside to
   *  inside this starts the timer; the ambient horses never enter it. */
  courseSection: { x1: number; x2: number; z1: number; z2: number };
  /** Course centre; the abandon check and the jump crossbar rotations read it. */
  center: { x: number; z: number };
  /** How near a rider must pass a jump WHILE AIRBORNE to clear it (world units). */
  jumpRadius: number;
  /** Distance from `center` beyond which an in-progress lesson counts as abandoned. */
  boundsRadius: number;
  /** Seconds allowed to clear the whole course once the timer arms. */
  timeLimitSeconds: number;
  /** The jumps in riding order (a clockwise oval from the divider opening). `rot` is
   *  the crossbar's long-axis angle (atan2(dx,dz) from `center`): it points radially
   *  out from the centre, perpendicular to the line of travel, so the rider jumps the
   *  bar face-on. content/zone3 plants a jump obstacle at each. */
  jumps: readonly { x: number; z: number; rot: number }[];
}

const RIDING_COURSE_CENTER = { x: 102, z: 678 } as const;
// The 6 jump points, a clockwise oval starting nearest the divider opening.
const RIDING_COURSE_JUMP_POINTS: readonly { x: number; z: number }[] = [
  { x: 110, z: 683 },
  { x: 118, z: 678 },
  { x: 110, z: 673 },
  { x: 94, z: 673 },
  { x: 86, z: 678 },
  { x: 94, z: 683 },
];

/** The stable course + paddock (see the header). Consumed by content/zone3 (fences +
 *  a jump prop per point), src/sim/mob/ambient.ts (horse wander bound), and
 *  src/sim/mounts_training.ts (the lesson) as the single source of truth; do not
 *  duplicate these coordinates. */
export const RIDING_COURSE: RidingCourseDef = {
  paddock: { x1: 78, x2: 126, z1: 668, z2: 706, opening: { x1: 88, x2: 94 } },
  divider: { z: 688, opening: { x1: 98, x2: 106 } },
  courseSection: { x1: 78, x2: 126, z1: 668, z2: 688 },
  center: RIDING_COURSE_CENTER,
  jumpRadius: 4,
  boundsRadius: 50,
  timeLimitSeconds: 45,
  jumps: RIDING_COURSE_JUMP_POINTS.map((j) => ({
    x: j.x,
    z: j.z,
    rot: Math.atan2(j.x - RIDING_COURSE_CENTER.x, j.z - RIDING_COURSE_CENTER.z),
  })),
};

// The ambient horses' wander bound: the paddock inset by a body-clearance margin and
// restricted to NORTH of the divider, so a horse can never cross into the course
// arena. Derived from RIDING_COURSE so nothing carries a stale copy of the rectangle.
const PASTURE_MARGIN = 2;
export const STABLE_PASTURE = {
  xMin: RIDING_COURSE.paddock.x1 + PASTURE_MARGIN,
  xMax: RIDING_COURSE.paddock.x2 - PASTURE_MARGIN,
  zMin: RIDING_COURSE.divider.z + PASTURE_MARGIN,
  zMax: RIDING_COURSE.paddock.z2 - PASTURE_MARGIN,
} as const;

/** Template id of the ambient Highwatch stable horse (content/zone3 mob def). The
 *  locomotion dispatcher's ambient arm (src/sim/mob/ambient.ts) routes on it. */
export const STABLE_HORSE_TEMPLATE_ID = 'stable_horse';
