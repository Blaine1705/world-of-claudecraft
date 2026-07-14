import { describe, expect, it, vi } from 'vitest';

vi.mock('../server/db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) },
  saveCharacterState: vi.fn(async () => {}),
  openPlaySession: vi.fn(async () => 1),
  touchCharacterLogin: vi.fn(async () => {}),
  closePlaySession: vi.fn(async () => {}),
  insertChatLogs: vi.fn(async () => {}),
  markAccountQuestComplete: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  grantAccountMechChroma: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
}));

import { GameServer } from '../server/game';

function fakeWs(): Parameters<GameServer['join']>[0] {
  return {
    readyState: 1,
    send: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    close: vi.fn(),
  } as unknown as Parameters<GameServer['join']>[0];
}

describe('Collective Reversal authoritative online path', () => {
  it('accepts the standard cast command and revives the dead group on the server sim', () => {
    const server = new GameServer();
    const mageSession = server.join(fakeWs(), 1, 1, 'Chrona', 'mage', null);
    const allySession = server.join(fakeWs(), 2, 2, 'Fallen', 'priest', null);
    if ('error' in mageSession || 'error' in allySession) throw new Error('join failed');

    server.sim.setPlayerLevel(20, mageSession.pid);
    expect(server.sim.setSpec('arcane', mageSession.pid)).toBe(true);
    server.sim.tick();
    const mage = server.sim.entities.get(mageSession.pid);
    const ally = server.sim.entities.get(allySession.pid);
    if (!mage || !ally) throw new Error('players missing');
    mage.resource = mage.maxResource;
    server.sim.partyInvite(ally.id, mage.id);
    server.sim.partyAccept(ally.id);
    ally.dead = true;
    ally.hp = 0;
    ally.resource = 0;
    ally.corpsePos = { ...ally.pos };

    server.handleMessage(
      mageSession,
      JSON.stringify({ t: 'cmd', cmd: 'cast', ability: 'collective_reversal' }),
    );
    expect(mage.castingAbility).toBe('collective_reversal');

    for (let tick = 0; tick < 140; tick++) server.sim.tick();

    expect(ally.dead).toBe(false);
    expect(ally.hp).toBe(ally.maxHp);
    expect(ally.resource).toBe(ally.maxResource);
  });
});
