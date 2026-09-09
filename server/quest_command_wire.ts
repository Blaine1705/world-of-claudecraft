import type { Sim } from '../src/sim/sim';

type QuestWireMessage = Record<string, unknown>;

/** Accepted ordinary quest intents need an immediate quest readout refresh. */
export function dispatchQuestWire(sim: Sim, msg: QuestWireMessage, pid: number): boolean {
  switch (msg.cmd) {
    case 'accept':
      return acceptQuestWire(sim, msg, pid);
    case 'abandon':
      return abandonQuestWire(sim, msg, pid);
    case 'qlinkaccept':
      return acceptLinkedQuestWire(sim, msg, pid);
    default:
      return false;
  }
}

export function acceptQuestWire(sim: Sim, msg: QuestWireMessage, pid: number): boolean {
  if (typeof msg.quest !== 'string') return false;
  sim.acceptQuest(msg.quest, typeof msg.selection === 'string' ? msg.selection : undefined, pid);
  return true;
}

export function abandonQuestWire(sim: Sim, msg: QuestWireMessage, pid: number): boolean {
  if (typeof msg.quest !== 'string') return false;
  sim.abandonQuest(msg.quest, pid);
  return true;
}

export function acceptLinkedQuestWire(sim: Sim, msg: QuestWireMessage, pid: number): boolean {
  if (typeof msg.quest !== 'string' || typeof msg.from !== 'number') return false;
  sim.acceptLinkedQuest(msg.quest, msg.from, pid);
  return true;
}

export function rotateWorldQuestPuzzleWire(sim: Sim, msg: QuestWireMessage, pid: number): void {
  if (typeof msg.quest === 'string' && Number.isSafeInteger(msg.tileIndex)) {
    sim.rotateWorldQuestPuzzleTile(msg.quest, Number(msg.tileIndex), pid);
  }
}

export function swapWorldQuestMatch3Wire(sim: Sim, msg: QuestWireMessage, pid: number): void {
  if (
    typeof msg.quest === 'string' &&
    Number.isSafeInteger(msg.fromIndex) &&
    Number.isSafeInteger(msg.toIndex)
  ) {
    sim.swapWorldQuestMatch3Tiles(msg.quest, Number(msg.fromIndex), Number(msg.toIndex), pid);
  }
}

export function resetWorldQuestMatch3Wire(sim: Sim, msg: QuestWireMessage, pid: number): void {
  if (typeof msg.quest === 'string') sim.resetWorldQuestMatch3(msg.quest, pid);
}

export function accuseWorldQuestSuspectWire(sim: Sim, msg: QuestWireMessage, pid: number): void {
  if (typeof msg.npcId === 'number' && Number.isSafeInteger(msg.npcId) && msg.npcId > 0)
    sim.accuseWorldQuestSuspect(msg.npcId, pid);
}

export function startWorldQuestWire(sim: Sim, msg: QuestWireMessage, pid: number): void {
  if (typeof msg.npcId === 'number' && Number.isSafeInteger(msg.npcId) && msg.npcId > 0)
    sim.startWorldQuest(msg.npcId, pid);
}

export function shadowWorldQuestWire(sim: Sim, msg: QuestWireMessage, pid: number): void {
  if (msg.action !== 'pickpocket' && msg.action !== 'leave') return;
  if (
    msg.targetId !== undefined &&
    (typeof msg.targetId !== 'number' || !Number.isSafeInteger(msg.targetId) || msg.targetId <= 0)
  )
    return;
  if (msg.action === 'pickpocket' && msg.targetId === undefined) return;
  sim.shadowWorldQuestAction(msg.action, msg.targetId as number | undefined, pid);
}

/** Route the world-quest-only command family outside the server monolith. */
export function dispatchWorldQuestWire(sim: Sim, msg: QuestWireMessage, pid: number): void {
  switch (msg.cmd) {
    case 'world_quest_start':
      startWorldQuestWire(sim, msg, pid);
      break;
    case 'world_quest_puzzle_rotate':
      rotateWorldQuestPuzzleWire(sim, msg, pid);
      break;
    case 'world_quest_match3_swap':
      swapWorldQuestMatch3Wire(sim, msg, pid);
      break;
    case 'world_quest_match3_reset':
      resetWorldQuestMatch3Wire(sim, msg, pid);
      break;
    case 'world_quest_shadow':
      shadowWorldQuestWire(sim, msg, pid);
      break;
    case 'world_quest_accuse':
      accuseWorldQuestSuspectWire(sim, msg, pid);
  }
}
