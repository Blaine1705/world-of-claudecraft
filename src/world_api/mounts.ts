import type { MountKey } from '../sim/content/mounts';
import type { TrainingLean } from '../sim/types';

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
  /** The riding-lesson (mount-training) minigame gating reins_valorsteed's
   *  q_riding_lessons quest reward: mount a training Valorsteed at the stablemaster
   *  (the Mount/Dismount keybind tutorial), then ride one lap through the flagged
   *  gates in order. Server-authoritative; rules live in src/sim/mounts_training.ts.
   *  Rebuilt client-side from the mountTrain* events (no snapshot field), the
   *  lockpickState precedent. */
  mountTrainingView(): MountTrainingView | null;
  /** Start a lesson attempt (charges the one-time 100g fee on first success). */
  mountTrainBegin(): void;
  /** @deprecated No-op. The lesson is a ridden course now, not a lean-cue
   *  reaction; this member is retained only because removing it would break the
   *  pinned IWorld member list. The wire command 'mount_train_answer' stays
   *  registered (append-only) but does nothing. */
  mountTrainAnswer(lean: TrainingLean): void;
  /** Abandon the active attempt (the fee, once paid, stays paid). */
  mountTrainAbort(): void;
}

// Render-safe projection of an active riding-lesson attempt. phase 'mount' means the
// player has yet to summon the training steed (nextGate null); phase 'ride' exposes
// the gated course: `gate` gates cleared so far (0-based next-gate index),
// `gatesTotal` the full lap, and `nextGate` the world position of the gate to ride to
// (null once the last gate is cleared).
export interface MountTrainingView {
  sessionId: string;
  phase: 'mount' | 'ride';
  gate: number;
  gatesTotal: number;
  nextGate: { x: number; z: number } | null;
}
