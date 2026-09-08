// The world's personal ground guidance, relocated without changing race/island
// ordering or the entity-loop's NPC fizz admission. No sim writes.
import type * as THREE from 'three';
import type { IWorld } from '../world_api';
import { CannonEncounterVisual } from './cannon_encounter_visual';
import { GliderCourseVisual } from './glider_course_visual';
import { HordeBarricadeVisual } from './horde_barricade_visual';
import { IslandGuidance } from './island_guidance';
import { MountBeacon } from './mount_beacon';
import { RaceLine } from './race_line';
import { ShadowInfiltrationVisual } from './shadow_infiltration_visual';
import { WorldQuestTraceVisual } from './world_quest_trace_visual';

export class WorldGuidance {
  readonly readyForEntry: Promise<void>;
  private readonly race: RaceLine;
  private readonly mount: MountBeacon;
  private readonly island: IslandGuidance;
  private readonly trace: WorldQuestTraceVisual;
  private readonly cannon: CannonEncounterVisual;
  private readonly horde: HordeBarricadeVisual;
  private readonly glider: GliderCourseVisual;
  private readonly shadow: ShadowInfiltrationVisual;

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
    this.horde = new HordeBarricadeVisual(
      scene,
      groundAt,
      compileGate && ((root) => compileGate(root, true)),
    );
    this.glider = new GliderCourseVisual(
      scene,
      groundAt,
      compileGate && ((root) => compileGate(root, true)),
    );
    this.shadow = new ShadowInfiltrationVisual(
      scene,
      groundAt,
      compileGate && ((root) => compileGate(root, true)),
    );
    this.readyForEntry = Promise.all([
      this.shadow.readyForEntry,
      this.trace.readyForEntry,
      this.cannon.readyForEntry,
      this.horde.readyForEntry,
      this.glider.readyForEntry,
    ]).then(() => {});
  }

  npcFizz(...args: Parameters<IslandGuidance['npcFizz']>): void {
    this.island.npcFizz(...args);
  }

  update(
    world: IWorld,
    time: number,
    dt: number,
    reducedMotion = false,
    renderedSelf?: Pick<THREE.Object3D, 'position' | 'rotation'>,
  ): void {
    this.race.update(world.mountRaceView(), time, dt);
    this.island.update(world, time, dt);
    this.mount.update(
      world.questState('q_riding_lessons') === 'active' && !world.mountRaceView(),
      time,
    );
    this.trace.update(world);
    this.cannon.update(world.vehicleSession, dt, reducedMotion);
    this.horde.update(world, reducedMotion);
    this.glider.update(world, renderedSelf);
    this.shadow.update(world);
  }

  dispose(): void {
    this.trace.dispose();
    this.cannon.dispose();
    this.horde.dispose();
    this.glider.dispose();
    this.shadow.dispose();
  }
}
