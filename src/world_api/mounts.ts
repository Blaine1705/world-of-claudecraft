import type { MountKey } from '../sim/content/mounts';

// Rideable ground mounts: the collection + selection surface behind the
// character sheet's mount picker and the mount keybind. The catalog itself is
// sim content (src/sim/content/mounts.ts); the live "riding X" state rides the
// entity mirror (Entity.mountKey, synced in identity fields like skin), so the
// reads here are the persisted pick and the owned subset. Both commands
// re-validate server-side (ownership, level gate, combat gate) in
// src/sim/mounts.ts.
export interface IWorldMounts {
  /** The persisted stable pick (always a valid key; the horse by default). */
  selectedMount(): MountKey;
  /** The owned subset of the catalog, in catalog order: the horse always,
   *  any other mount while its reins item sits in bags or bank. */
  ownedMounts(): readonly MountKey[];
  /** Pick an owned mount (level-gated; swaps in place while riding). */
  selectMount(key: MountKey): void;
  /** Mount the selected mount, or dismount while riding. */
  toggleMounted(): void;
  /** Start a riding-lesson attempt at Stablemaster Marla, gating
   *  reins_valorsteed's q_riding_lessons quest reward (charges the one-time 100g
   *  fee on first success). The lesson is the Mount/Dismount keybind tutorial:
   *  climbing onto the training Valorsteed with that key succeeds it and credits
   *  the quest objective. Server-authoritative; rules live in
   *  src/sim/mounts_training.ts, feedback rides the mountTrain* events. */
  mountTrainBegin(): void;
}
