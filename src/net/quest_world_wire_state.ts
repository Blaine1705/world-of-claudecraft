import type {
  CannonActionId,
  CannonPoint,
  QuestProgress,
  VehicleSession,
  WorldQuestProgress,
} from '../sim/types';
import type { NearbyWorldQuestTrace } from '../sim/world_quest_trace_public';
import { decodeActiveWorldBossIds } from './world_boss_snapshot_wire';
import { decodeNearbyWorldQuestTraces } from './world_quest_trace_public_wire';

export type QuestWorldCommand =
  | { cmd: 'vehicle_enter'; station: string }
  | { cmd: 'vehicle_action'; action: CannonActionId; x: number; z: number }
  | { cmd: 'vehicle_leave' }
  | { cmd: 'world_quest_puzzle_rotate'; quest: string; tileIndex: number }
  | { cmd: 'world_quest_match3_swap'; quest: string; fromIndex: number; toIndex: number }
  | { cmd: 'world_quest_match3_reset'; quest: string };

/** Cold owner mirrors shared by quest snapshots and world-boss map state. */
export class QuestWorldWireState {
  vehicleSession: VehicleSession | null = null;
  questLog = new Map<string, QuestProgress>();
  questsDone = new Set<string>();
  worldQuestCycle = '';
  worldQuestExpiresAtMs = 0;
  worldQuestLog: ReadonlyMap<string, WorldQuestProgress> = new Map();
  nearbyWorldQuestTraces: readonly NearbyWorldQuestTrace[] = [];
  private activeWorldBossIds = new Set<string>();

  protected sendQuestWorldCommand(_command: QuestWorldCommand): void {
    throw new Error('Quest world command transport is not configured');
  }

  enterVehicle(stationId: string): void {
    this.sendQuestWorldCommand({ cmd: 'vehicle_enter', station: stationId });
  }

  useVehicleAction(action: CannonActionId, point: CannonPoint): void {
    this.sendQuestWorldCommand({ cmd: 'vehicle_action', action, x: point.x, z: point.z });
  }

  leaveVehicle(): void {
    this.sendQuestWorldCommand({ cmd: 'vehicle_leave' });
  }

  rotateWorldQuestPuzzleTile(questId: string, tileIndex: number): void {
    this.sendQuestWorldCommand({ cmd: 'world_quest_puzzle_rotate', quest: questId, tileIndex });
  }

  swapWorldQuestMatch3Tiles(questId: string, fromIndex: number, toIndex: number): void {
    this.sendQuestWorldCommand({
      cmd: 'world_quest_match3_swap',
      quest: questId,
      fromIndex,
      toIndex,
    });
  }

  resetWorldQuestMatch3(questId: string): void {
    this.sendQuestWorldCommand({ cmd: 'world_quest_match3_reset', quest: questId });
  }

  worldBossActive(bossId: string): boolean {
    return this.activeWorldBossIds.has(bossId);
  }

  applyWorldBossWire(value: unknown): void {
    this.activeWorldBossIds = decodeActiveWorldBossIds(value);
  }

  resetQuestWorldWireState(): void {
    this.vehicleSession = null;
    this.worldQuestCycle = '';
    this.worldQuestExpiresAtMs = 0;
    this.worldQuestLog = new Map();
    this.nearbyWorldQuestTraces = [];
    this.activeWorldBossIds = new Set();
  }

  /** Unlike owner deltas, public trails clear on every missing or malformed snapshot. */
  applyNearbyWorldQuestTraceSnapshot<
    T extends { self?: unknown; qtraces?: unknown; time?: unknown },
  >(snap: T): T['self'] {
    const self = snap.self as { id?: unknown } | undefined;
    this.nearbyWorldQuestTraces = decodeNearbyWorldQuestTraces(snap.qtraces, self?.id, snap.time);
    return snap.self;
  }
}
