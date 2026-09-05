// The world's personal ground guidance, relocated without changing race/island
// ordering or the entity-loop's NPC fizz admission. No sim writes.
import type * as THREE from 'three';
import type { IWorld } from '../world_api';
import { CannonEncounterVisual } from './cannon_encounter_visual';
import { IslandGuidance } from './island_guidance';
import { MountBeacon } from './mount_beacon';
import { RaceLine } from './race_line';
import { WorldQuestTraceVisual } from './world_quest_trace_visual';

export class WorldGuidance {
  readonly readyForEntry: Promise<void>;
  private readonly race: RaceLine;
  private readonly mount: MountBeacon;
  private readonly island: IslandGuidance;
  private readonly trace: WorldQuestTraceVisual;
  private readonly cannon: CannonEncounterVisual;

  constructor(
    scene: THREE.Object3D,
    groundAt: (x: number, z: number) => number,
    compileGate?: (target: THREE.Object3D, requiredForEntry?: boolean) => Promise<unknown>,
  ) {
    this.race = new RaceLine(scene, groundAt);
    this.mount = new MountBeacon(scene, groundAt);
    this.island = new IslandGuidance(scene, groundAt, compileGate);
    // Unlike an untimed coach ribbon, a hidden six-second preview has no
    // actionable stand-in. Run its gate before first paint and include it in
    // the required-landmark entry barrier on every graphics profile.
    this.trace = new WorldQuestTraceVisual(
      scene,
      groundAt,
      compileGate && ((root) => compileGate(root, true)),
    );
    this.cannon = new CannonEncounterVisual(
      scene,
      groundAt,
      compileGate && ((root) => compileGate(root, true)),
    );
    this.readyForEntry = Promise.all([this.trace.readyForEntry, this.cannon.readyForEntry]).then(
      () => {},
    );
  }

  npcFizz(...args: Parameters<IslandGuidance['npcFizz']>): void {
    this.island.npcFizz(...args);
  }

  update(world: IWorld, time: number, dt: number, reducedMotion = false): void {
    this.race.update(world.mountRaceView(), time, dt);
    this.island.update(world, time, dt);
    this.mount.update(
      world.questState('q_riding_lessons') === 'active' && !world.mountRaceView(),
      time,
    );
    this.trace.update(world);
    this.cannon.update(world.vehicleSession, dt, reducedMotion);
  }

  dispose(): void {
    this.trace.dispose();
    this.cannon.dispose();
  }
}
