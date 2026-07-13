import type { MountKey } from '../sim/content/mounts';

// Rideable ground mounts: the selection surface behind the Mounts window and
// the mount keybind. The catalog itself is sim content (src/sim/content/
// mounts.ts); the live "riding X" state rides the entity mirror
// (Entity.mountKey, synced in identity fields like skin), so the only reads
// here are the persisted pick. Both commands re-validate server-side (level
// gate, combat gate) in src/sim/mounts.ts.
export interface IWorldMounts {
  /** The persisted stable pick ('' = none chosen yet). */
  selectedMount(): MountKey | '';
  /** Pick a mount (level-gated; swaps in place while riding). */
  selectMount(key: MountKey): void;
  /** Mount the selected mount, or dismount while riding. */
  toggleMounted(): void;
}
