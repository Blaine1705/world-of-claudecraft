// Pure view core for the character sheet's mount picker: the whole catalog in
// order, each row carrying its collection state (owned / not collected), the
// level lock, the current pick, and the live "riding now" flag. Replaces the
// retired Mounts window's mounts_view core: the picker lives in the character
// sheet now, and Z mounts the pick directly instead of opening a window.
// DOM-free and i18n-free (the painter, mount_picker.ts, resolves the
// hudChrome.mounts.* keys); Node-tested by tests/mount_picker_view.test.ts and
// registered in the architecture guard's UI_PURE_CORES.

import {
  DEFAULT_MOUNT,
  MOUNT_KEYS,
  MOUNTS,
  type MountKey,
  type MountRarity,
} from '../sim/content/mounts';

export interface MountPickerRow {
  key: MountKey;
  rarity: MountRarity;
  /** Required player level to select or ride. */
  level: number;
  /** In the collection: the horse always, others while their reins item is held. */
  owned: boolean;
  /** Owned but the player level is below the gate: shown locked, not pickable. */
  locked: boolean;
  /** The stable pick. */
  selected: boolean;
  /** Ridden right now. */
  active: boolean;
  /** Pickable right now (owned, unlocked, and not already the pick). */
  pickable: boolean;
  /** Bought from the stablemaster (only the horse) rather than looted, so the
   *  painter shows the stable hint instead of the boss-drop hint when unowned. */
  purchasable: boolean;
  /** Display percents (integers: 40 / 50 / 65, 0 / 5). */
  speedPct: number;
  blockPct: number;
  critPct: number;
}

export interface MountPickerView {
  rows: MountPickerRow[];
  selectedKey: MountKey;
  mounted: boolean;
}

export function buildMountPickerView(
  playerLevel: number,
  selectedKey: string,
  activeKey: string,
  owned: readonly string[],
): MountPickerView {
  const selected = selectedKey in MOUNTS ? (selectedKey as MountKey) : DEFAULT_MOUNT;
  const ownedSet = new Set<string>([DEFAULT_MOUNT, ...owned]);
  const rows = MOUNT_KEYS.map((key): MountPickerRow => {
    const def = MOUNTS[key];
    const isOwned = ownedSet.has(key);
    const locked = isOwned && playerLevel < def.level;
    return {
      key,
      rarity: def.rarity,
      level: def.level,
      owned: isOwned,
      locked,
      selected: key === selected,
      active: key === activeKey,
      pickable: isOwned && !locked && key !== selected,
      purchasable: key === DEFAULT_MOUNT,
      speedPct: Math.round(def.moveSpeedPct * 100),
      blockPct: Math.round(def.meleeBlockPct * 100),
      critPct: Math.round(def.critPct * 100),
    };
  });
  return { rows, selectedKey: selected, mounted: activeKey !== '' };
}
