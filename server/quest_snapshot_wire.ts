import { livePlaytimeSeconds } from '../src/sim/playtime';
import type { PlayerMeta, Sim } from '../src/sim/sim';
import {
  activePublicWorldQuestTracePids,
  nearbyWorldQuestTraces,
  PUBLIC_WORLD_QUEST_TRACE_RADIUS,
  type PublicTraceCandidate,
  type PublicTraceWorld,
} from '../src/sim/world_quest_trace_public';
import { worldQuestProgressForWire } from '../src/sim/world_quest_trace_wire';

type EmitSelfKey = (key: string, value: unknown) => void;

export type { PublicTraceCandidate };

/** Small activity/progression mirrors must reconcile outside the heavy gate.
 * Session events missed while linkdead are not replayed on resume. Emit explicit
 * null/false clears, and preserve the host's byte-diff and ordering contract. */
export function emitActivitySelfKeys(
  emit: EmitSelfKey,
  sim: Sim,
  meta: PlayerMeta,
  pid: number,
): void {
  // Riding is durable; the activity sessions themselves are not.
  emit('mntRtd', meta.ridingTrained === true ? true : null);
  emit('mntLesson', sim.mountLessonActiveFor(pid));
  emit('mntRace', sim.mountRaceViewFor(pid));
  emit('vehicle', sim.vehicleSessionFor(pid));
  // Deed rewards can arrive without marking this session's heavy mirrors dirty.
  emit('renown', meta.renown);
  emit('atitle', meta.activeTitle);
  emit('aborder', meta.activeBorder);
  // The sheet displays whole minutes, so unchanged ticks need no larger payload.
  emit('ptime', Math.floor(livePlaytimeSeconds(meta, sim.time) / 60) * 60);
}
/** Per-viewer, unconditional snapshot suffix: absence is an explicit clear. */
export { activePublicWorldQuestTracePids, PUBLIC_WORLD_QUEST_TRACE_RADIUS };

export function nearbyQuestTraceWireJson(
  world: PublicTraceWorld,
  viewerId: number,
  sharedCandidates?: readonly PublicTraceCandidate[],
): string {
  return `,"qtraces":${JSON.stringify(nearbyWorldQuestTraces(world, viewerId, sharedCandidates))}`;
}

/** Emit the heavy owner-only quest snapshot family through the host's delta gate. */
export function emitQuestSelfKeys(emit: EmitSelfKey, sim: Sim, meta: PlayerMeta): void {
  emit('qlog', [...meta.questLog.values()]);
  emit('qdone', [...meta.questsDone]);
  emit('wqday', meta.worldQuestCycle);
  emit('wqexp', sim.worldQuestExpiresAtMs);
  emit('wqlog', [...meta.worldQuestLog.values()].map(worldQuestProgressForWire));
}
