import type { SimEvent } from '../src/sim/types';

type CombatEventParty = {
  members: readonly number[];
};

function isViewerCombatParticipant(
  sourceId: number,
  targetId: number,
  viewerPid: number,
  viewerParty: CombatEventParty | null,
): boolean {
  if (sourceId === viewerPid || targetId === viewerPid) return true;
  return (
    viewerParty?.members.includes(sourceId) === true ||
    viewerParty?.members.includes(targetId) === true
  );
}

export function shouldDeliverCombatEventToViewer(
  ev: SimEvent,
  viewerPid: number,
  viewerParty: CombatEventParty | null,
  sourceOwnerId: number | null = ev.type === 'damage' ? (ev.sourceOwnerId ?? null) : null,
): boolean {
  if (ev.type === 'damage') {
    if (isViewerCombatParticipant(ev.sourceId, ev.targetId, viewerPid, viewerParty)) return true;
    return (
      sourceOwnerId !== null &&
      (sourceOwnerId === viewerPid || viewerParty?.members.includes(sourceOwnerId) === true)
    );
  }
  if (ev.type === 'heal2')
    return isViewerCombatParticipant(ev.sourceId, ev.targetId, viewerPid, viewerParty);
  return true;
}
