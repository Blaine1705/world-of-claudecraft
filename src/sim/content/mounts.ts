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
  | 'stormfeather_griffin'
  | 'lunar_cheshire';

export type MountRarity = 'common' | 'rare' | 'epic';

export interface MountDef {
  key: MountKey;
  /** Canonical English display name (the HUD localizes via hudChrome.mounts.*). */
  name: string;
  rarity: MountRarity;
  /** Required player level to select or ride (the card's "Mount Level"). */
  level: number;
  /** Additive move-speed fraction while mounted (0.4 = +40% extra mobility). */
  moveSpeedPct: number;
  /** Fraction of incoming melee swing damage blocked while mounted (0.05 = 5%). */
  meleeBlockPct: number;
  /** Additive critical strike chance while mounted (0.05 = +5%). */
  critPct: number;
}

export const MOUNTS: Record<MountKey, MountDef> = {
  // The base mount: first in the catalog, the natural default pick.
  valorsteed: {
    key: 'valorsteed',
    name: 'Valorsteed',
    rarity: 'common',
    level: 10,
    moveSpeedPct: 0.4,
    meleeBlockPct: 0,
    critPct: 0,
  },
  grag_bear: {
    key: 'grag_bear',
    name: 'Goliath Grag-Bear',
    rarity: 'common',
    level: 10,
    moveSpeedPct: 0.4,
    meleeBlockPct: 0,
    critPct: 0,
  },
  stalkglider_snail: {
    key: 'stalkglider_snail',
    name: 'Moss-Shell Stalk-Glider',
    rarity: 'common',
    level: 10,
    moveSpeedPct: 0.4,
    meleeBlockPct: 0,
    critPct: 0,
  },
  aether_hover_cycle: {
    key: 'aether_hover_cycle',
    name: 'Aether-Jouster Hover-Cycle',
    rarity: 'rare',
    level: 15,
    moveSpeedPct: 0.5,
    meleeBlockPct: 0.05,
    critPct: 0,
  },
  shadowjump_toad: {
    key: 'shadowjump_toad',
    name: 'Kama-Kage the Shadow-Jump Toad',
    rarity: 'rare',
    level: 15,
    moveSpeedPct: 0.5,
    meleeBlockPct: 0.05,
    critPct: 0,
  },
  stormfeather_griffin: {
    key: 'stormfeather_griffin',
    name: 'Sky-Reach Stormfeather',
    rarity: 'epic',
    level: 20,
    moveSpeedPct: 0.65,
    meleeBlockPct: 0.05,
    critPct: 0.05,
  },
  lunar_cheshire: {
    key: 'lunar_cheshire',
    name: 'Lunar Cheshire',
    rarity: 'epic',
    level: 20,
    moveSpeedPct: 0.65,
    meleeBlockPct: 0.05,
    critPct: 0.05,
  },
};

/** Catalog order for the Mounts window: level tier, then declaration order. */
export const MOUNT_KEYS = Object.keys(MOUNTS) as readonly MountKey[];

export function mountDef(key: string): MountDef | null {
  return (MOUNTS as Record<string, MountDef | undefined>)[key] ?? null;
}

/** Coerce a persisted/wire string back to a valid catalog key ('' when unknown,
 *  so a save from a build that removed a mount loads cleanly unmounted). */
export function normalizeMountKey(key: string | undefined | null): MountKey | '' {
  return key && mountDef(key) ? (key as MountKey) : '';
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
