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
// The Highwatch Stables (zone 3): the fenced paddock, the marked riding course,
// and the ambient stable horses. These consts are the SINGLE SOURCE OF TRUTH for
// the stable-yard geometry: zone3 content (content/zone3.ts) places its fences,
// course-flag props, and horse spawns from them, and the riding-lesson minigame
// (src/sim/mounts_training.ts) reads the course. Keep this file the one place
// the numbers live so the props, the horses, and the lesson can never drift.
// ---------------------------------------------------------------------------

/** Axis-aligned paddock rectangle (world x/z). The fence perimeter, the ambient
 *  horse wander bound, and the riding-course containment check all read this. */
export const STABLE_PADDOCK = {
  xMin: 82,
  xMax: 118,
  zMin: 672,
  zMax: 698,
  /** The 4-unit gap in the north fence run (the paddock opening) the rider and
   *  the horses pass through; Marla stands just outside it. */
  openingXMin: 88,
  openingXMax: 92,
} as const;

export interface RidingCourseDef {
  /** Paddock centre; the lesson recentres a strayed rider on this. */
  center: { x: number; z: number };
  /** How near a rider must pass a gate to clear it (world units). */
  gateRadius: number;
  /** Distance from `center` beyond which an in-progress lesson counts as
   *  abandoned (the follow-up riding minigame consumes this). */
  boundsRadius: number;
  /** The gates in riding order: one counterclockwise loop starting nearest the
   *  paddock opening. content/zone3 plants a course-flag prop at each. */
  gates: readonly { x: number; z: number }[];
}

/** The marked riding course inside the paddock (see STABLE_PADDOCK). Consumed by
 *  content/zone3 (a flag prop per gate) and src/sim/mounts_training.ts (the lesson
 *  route) as the single source of truth; do not duplicate these coordinates. */
export const RIDING_COURSE: RidingCourseDef = {
  center: { x: 100, z: 685 },
  gateRadius: 4,
  boundsRadius: 40,
  gates: [
    { x: 91, z: 691 },
    { x: 87, z: 685 },
    { x: 91, z: 679 },
    { x: 100, z: 677 },
    { x: 109, z: 679 },
    { x: 113, z: 685 },
    { x: 109, z: 691 },
    { x: 100, z: 693 },
  ],
};

/** Template id of the ambient Highwatch stable horse (content/zone3 mob def). The
 *  locomotion dispatcher's ambient arm (src/sim/mob/ambient.ts) routes on it. */
export const STABLE_HORSE_TEMPLATE_ID = 'stable_horse';
