import { describe, expect, it, vi } from 'vitest';
import { dispatchQuestWire, dispatchWorldQuestWire } from '../server/quest_command_wire';
import type { Sim } from '../src/sim/sim';
import { COMMAND_FACETS } from '../src/world_api';
import { bareClient } from './helpers/bare_client';

describe('world quest start command transport', () => {
  it('sends the selected NPC and binds the start to the authenticated player', () => {
    const client = bareClient(7);
    const send = vi.fn();
    Object.assign(client, { cmd: send });
    client.startWorldQuest(2146900042);
    expect(send.mock.calls).toEqual([[{ cmd: 'world_quest_start', npcId: 2146900042 }]]);
    expect(COMMAND_FACETS.world_quest_start).toBe('IWorldQuests');
    const start = vi.fn();
    const sim = { startWorldQuest: start } as unknown as Sim;
    dispatchWorldQuestWire(sim, { ...send.mock.calls[0][0], pid: 999, quest: 'forged' }, 7);
    expect(start.mock.calls).toEqual([[2146900042, 7]]);
  });

  it.each([undefined, null, '2', 0, -1, 2.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, {}])(
    'rejects malformed NPC identity %s without invoking the simulation',
    (npcId) => {
      const start = vi.fn();
      dispatchWorldQuestWire(
        { startWorldQuest: start } as unknown as Sim,
        { cmd: 'world_quest_start', npcId },
        7,
      );
      expect(start).not.toHaveBeenCalled();
    },
  );
});

describe('ordinary quest command refresh routing', () => {
  it('preserves accept, abandon and linked quest arguments and rejects invalid messages', () => {
    const acceptQuest = vi.fn();
    const abandonQuest = vi.fn();
    const acceptLinkedQuest = vi.fn();
    const sim = { acceptQuest, abandonQuest, acceptLinkedQuest } as unknown as Sim;
    expect(dispatchQuestWire(sim, { cmd: 'accept', quest: 'quest', selection: 'choice' }, 7)).toBe(
      true,
    );
    expect(dispatchQuestWire(sim, { cmd: 'abandon', quest: 'quest' }, 7)).toBe(true);
    expect(dispatchQuestWire(sim, { cmd: 'qlinkaccept', quest: 'quest', from: 9 }, 7)).toBe(true);
    expect(acceptQuest.mock.calls).toEqual([['quest', 'choice', 7]]);
    expect(abandonQuest.mock.calls).toEqual([['quest', 7]]);
    expect(acceptLinkedQuest.mock.calls).toEqual([['quest', 9, 7]]);
    for (const cmd of ['accept', 'abandon', 'qlinkaccept', 'unknown']) {
      expect(dispatchQuestWire(sim, { cmd }, 7)).toBe(false);
    }
    expect(acceptQuest).toHaveBeenCalledTimes(1);
    expect(abandonQuest).toHaveBeenCalledTimes(1);
    expect(acceptLinkedQuest).toHaveBeenCalledTimes(1);
  });
});
