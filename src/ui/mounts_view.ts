// Pure view core for the Mounts window (the stable): the catalog rows with
// their level locks, the current pick, and which single footer action the
// window offers. DOM-free and i18n-free (the painter, mounts_window.ts,
// resolves hudChrome.mounts.* keys); Node-tested by tests/mounts_view.test.ts
// and registered in the architecture guard's UI_PURE_CORES.

import { MOUNT_KEYS, MOUNTS, type MountKey, type MountRarity } from '../sim/content/mounts';

export interface MountRowView {
  key: MountKey;
  rarity: MountRarity;
  /** Required player level (the card's "Mount Level"). */
  level: number;
  /** Player level below the gate: the row shows the lock line, Select disabled. */
  locked: boolean;
  /** The stable pick. */
  selected: boolean;
  /** Ridden right now. */
  active: boolean;
  /** Display percents (integers: 40 / 50 / 65, 0 / 5). */
  speedPct: number;
  blockPct: number;
  critPct: number;
}

export interface MountsView {
  rows: MountRowView[];
  selectedKey: MountKey | '';
  mounted: boolean;
  /** The one footer action: mount the pick, dismount, or nothing pickable yet. */
  action: 'mount' | 'dismount' | null;
}

export function buildMountsView(
  playerLevel: number,
  selectedKey: string,
  activeKey: string,
): MountsView {
  const selected = selectedKey in MOUNTS ? (selectedKey as MountKey) : '';
  const mounted = activeKey !== '';
  const rows = MOUNT_KEYS.map((key): MountRowView => {
    const def = MOUNTS[key];
    return {
      key,
      rarity: def.rarity,
      level: def.level,
      locked: playerLevel < def.level,
      selected: key === selected,
      active: key === activeKey,
      speedPct: Math.round(def.moveSpeedPct * 100),
      blockPct: Math.round(def.meleeBlockPct * 100),
      critPct: Math.round(def.critPct * 100),
    };
  });
  const action = mounted ? 'dismount' : selected ? 'mount' : null;
  return { rows, selectedKey: selected, mounted, action };
}
