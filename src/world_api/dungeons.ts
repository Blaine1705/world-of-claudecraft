// One raid's lockout as projected to the HUD: the dungeon id plus the time left
// until it unlocks. The seam only ever surfaces still-locked raids.
export interface RaidLockout {
  id: string;
  msRemaining: number;
}

// The local player's active procedural Rift floor, or null when not in a rift.
// The renderer regenerates the floor's geometry + visual style from the descriptor
// (seed + baseLevel + floorIndex) via the same pure generator the server ran, so
// no geometry travels over the wire. The origin is derived render-side from the
// player position (riftOriginAt); this view is purely the descriptor + labels.
export interface RiftFloorView {
  seed: number;
  baseLevel: number;
  floorIndex: number;
  floorCount: number;
  name: string;
  themeName: string;
}

export interface IWorldDungeons {
  enterDungeon(dungeonId: string): void;
  leaveDungeon(): void;
  // Still-locked raids for the local player (unlock countdown in ms), driving the
  // minimap raid-lockout badge + panel. Empty when nothing is locked.
  raidLockouts(): RaidLockout[];
  // The active procedural Rift floor for the local player (null outside a rift).
  riftFloor: RiftFloorView | null;
}
