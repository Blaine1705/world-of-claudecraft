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
  /** The owned subset of the catalog, in catalog order: any mount whose
   *  reins item sits in bags or bank (soulbound). A fresh player owns nothing. */
  ownedMounts(): readonly MountKey[];
  /** Whether the player has purchased the riding skill from Marla (80g).
   *  Required before selecting or summoning any mount. */
  ridingTrained(): boolean;
  /** Pick an owned mount (level-gated; swaps in place while riding). */
  selectMount(key: MountKey): void;
  /** Mount the selected mount, or dismount while riding. */
  toggleMounted(): void;
  /** Purchase the riding skill from Marla the stables trainer for 80 gold (800000
   *  copper). One-time: once ridingTrained is true it never reverts. Requires the
   *  player to be level 20, alive, and standing near Marla. Emits an error toast on
   *  failure (not enough money, wrong NPC, wrong level). */
  learnRiding(npcId: number): void;
  /** Legacy start for a riding-lesson attempt at Stablemaster Marla, gating
   *  reins_valorsteed's q_riding_lessons quest reward. Current lesson completion
   *  comes from finishing the show-jumping race on the lent training Valorsteed.
   *  Server-authoritative; rules live in src/sim/mounts_training.ts, feedback
   *  rides the mountTrain* events. Current clients start the lesson directly from
   *  the race platform instead. */
  mountTrainBegin(): void;
  /** Begin a show-jumping race from the glowing square behind the arch. An active
   *  riding quest may start dismounted (the server lends its training horse);
   *  repeat racers must already be mounted. Enters the movement-locked 3..2..1
   *  countdown, then the timed lap. The HUD's Start Race button calls this.
   *  Server-authoritative; rules live in src/sim/mount_race.ts. */
  mountRaceStart(): void;
  /** Exit the player's current countdown or timed lap. Server-authoritative;
   *  emits the normal abandoned race end and leaves a riding lesson retryable. */
  mountRaceCancel(): void;
  /** Whether the player has a live riding lesson in progress. Retained for
   *  compatibility; events update it immediately and the authoritative self
   *  snapshot reconciles it after reconnects. */
  mountLessonActive(): boolean;
  /** The player's OWN active show-jumping race in the stables paddock, or null
   *  when not racing. The HUD strip, the countdown, and the ground racing line
   *  all key off this read. Server-authoritative; rules live in
   *  src/sim/mount_race.ts. Events update it immediately and the authoritative
   *  self snapshot reconciles it after reconnects. */
  mountRaceView(): MountRaceView | null;
}

// Render-safe projection of the player's own active race. `phase` is 'countdown'
// (pre-GO, showing 3..2..1) or 'racing' (the timed lap); `clearedMask` is the
// bitset of cleared jumps and `cleared` its popcount; `jumpsTotal` the whole
// course. `goTicksLeft` is the countdown remaining in sim ticks (phase
// 'countdown'); `ticksLeft`/`timeLimitTicks` are the lap timer + full budget
// (phase 'racing', for the strip bar). Jumps clear in any order.
export interface MountRaceView {
  raceId: string;
  phase: 'countdown' | 'racing';
  clearedMask: number;
  cleared: number;
  jumpsTotal: number;
  goTicksLeft: number;
  ticksLeft: number;
  timeLimitTicks: number;
}
