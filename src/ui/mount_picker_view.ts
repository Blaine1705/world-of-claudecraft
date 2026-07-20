// Pure view core for the character sheet's mount picker: ONLY the mounts the
// player owns, in catalog order, each row carrying its level lock, the current
// pick, and the live "riding now" flag. No mount is free any more (the horse is
// earned at level 20 from the Highwatch stablemaster, the rest drop soulbound
// reins from bosses), so ownership comes solely from the owned list argument and
// an empty collection yields zero rows (the painter shows an empty state).
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
  /** Owned but the player level is below the gate: shown locked, not pickable. */
  locked: boolean;
  /** The stable pick. */
  selected: boolean;
  /** Ridden right now. */
  active: boolean;
  /** Pickable right now (unlocked and not already the pick). */
  pickable: boolean;
  /** Display percent integer (e.g. 60 for +60% extra mobility). */
  speedPct: number;
}

export interface MountPickerView {
  /** Owned mounts only, in catalog order; empty when the player owns none. */
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
  const ownedSet = new Set<string>(owned);
  const rows = MOUNT_KEYS.filter((key) => ownedSet.has(key)).map((key): MountPickerRow => {
    const def = MOUNTS[key];
    const locked = playerLevel < def.level;
    return {
      key,
      rarity: def.rarity,
      level: def.level,
      locked,
      selected: key === selected,
      active: key === activeKey,
      pickable: !locked && key !== selected,
      speedPct: Math.round(def.moveSpeedPct * 100),
    };
  });
  return { rows, selectedKey: selected, mounted: activeKey !== '' };
}
