vi.mock('../../server/db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) },
  saveCharacterState: vi.fn(async () => {}),
  saveCharacterAndMarketState: vi.fn(async () => {}),
  openPlaySession: vi.fn(async () => 1),
  touchCharacterLogin: vi.fn(async () => {}),
  closePlaySession: vi.fn(async () => {}),
  insertChatLogs: vi.fn(async () => {}),
  walletForAccount: vi.fn(async () => null),
  loadAccountFlair: vi.fn(async () => ({ ai: false, streamer: false, links: {} })),
  markAccountQuestComplete: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  grantAccountMechChroma: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  revokeAccountMechChroma: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  grantAccountWeaponSkins: vi.fn(async () => ({
    completedQuestIds: [],
    mechChromaIds: [],
    weaponSkinIds: [],
    weaponSkinLoadout: {},
  })),
  setAccountWeaponSkinLoadout: vi.fn(async () => ({
    completedQuestIds: [],
    mechChromaIds: [],
    weaponSkinIds: [],
    weaponSkinLoadout: {},
  })),
  setCharacterHotbarLayout: vi.fn(async () => {}),
  loadMarketState: vi.fn(async () => null),
  loadMailState: vi.fn(async () => null),
  loadRiftState: vi.fn(async () => null),
  saveMarketState: vi.fn(async () => {}),
  saveMailState: vi.fn(async () => {}),
  saveRiftState: vi.fn(async () => {}),
  releaseCharacterLease: vi.fn(async () => {}),
  heartbeatCharacterLeases: vi.fn(async () => {}),
}));

// The `dgrun` self key end to end: the authoritative server encodes the sim's
// dungeon run (server/dungeon_run_wire.ts over src/sim/instances/dungeon_run.ts),
// the delta gate ships it only when it changes, and the online ClientWorld
// decodes it onto IWorld.dungeonRun (src/net/dungeon_run_wire.ts through
// QuestWorldWireState). What the HUD's dungeon objectives tracker shows online
// is exactly what survives this trip.
import { describe, expect, it, vi } from 'vitest';
import { dungeonRunWireJson } from '../../server/dungeon_run_wire';
import { GameServer } from '../../server/game';
import { decodeDungeonRun } from '../../src/net/dungeon_run_wire';
import { DUNGEONS } from '../../src/sim/data';
import { dungeonRunForPlayer } from '../../src/sim/instances/dungeon_run';
import { claimedInstanceAt, enterDungeon, leaveDungeon } from '../../src/sim/instances/dungeons';
import type { Entity } from '../../src/sim/types';
import { bareClient, broadcast, fakeWs, joinServer, lastSnap } from '../helpers/bare_client';

function rig(characterId = 301, name = 'Cryptwalker') {
  const server = new GameServer();
  const fc = fakeWs();
  const session = joinServer(server, fc, characterId, name, 'warrior');
  const sim = server.sim;
  sim.setPlayerLevel(20, session.pid);
  const client = bareClient(session.pid);
  // One server pass, applied to the client the way the socket would.
  const pass = () => {
    fc.sent.length = 0;
    broadcast(server);
    const snap = lastSnap(fc.sent);
    // biome-ignore lint/suspicious/noExplicitAny: applySnapshot is ClientWorld's private decode door
    (client as any).applySnapshot(snap);
    return snap;
  };
  const killPlaced = (mobId: string) => {
    const player = sim.entities.get(session.pid) as Entity;
    const inst = claimedInstanceAt(sim.ctx, player.pos);
    if (!inst) throw new Error('no claim');
    const index = DUNGEONS[inst.dungeonId].spawns.findIndex((s) => s.mobId === mobId);
    sim.ctx.handleDeath(sim.ctx.entities.get(inst.mobIds[index]) as Entity, player);
  };
  return { server, sim, session, fc, client, pass, killPlaced };
}

describe('dgrun: the dungeon run on the wire', () => {
  it('a fresh session outside any dungeon gets an explicit null, then silence', () => {
    const { client, pass } = rig();
    const first = pass();
    expect(first.self).toHaveProperty('dgrun', null);
    expect(client.dungeonRun).toBeNull();
    expect(pass().self).not.toHaveProperty('dgrun');
  });

  it('round-trips entry, a boss kill, and leaving, shipping only on a change', () => {
    const { sim, session, client, pass, killPlaced } = rig();
    pass();
    sim.setDungeonDifficulty('heroic', session.pid);
    expect(enterDungeon(sim.ctx, 'sunken_bastion', session.pid, true)).toBe(true);

    const entered = pass();
    expect(entered.self.dgrun).toEqual({
      dungeonId: 'sunken_bastion',
      difficulty: 'heroic',
      bosses: [
        { mobId: 'knight_commander_olen', defeated: false },
        { mobId: 'gaol_turnkey', defeated: false },
        { mobId: 'gaoler_ossick', defeated: false },
        { mobId: 'vael_the_mistcaller', defeated: false },
      ],
    });
    // The client's read is the server's, value for value.
    expect(client.dungeonRun).toEqual(dungeonRunForPlayer(sim.ctx, session.pid));
    const mirrored = client.dungeonRun;

    // Nothing changed: the key is elided and the mirror is left alone, by reference.
    for (let i = 0; i < 5; i++) {
      sim.tick();
      expect(pass().self).not.toHaveProperty('dgrun');
    }
    expect(client.dungeonRun).toBe(mirrored);

    killPlaced('knight_commander_olen');
    const afterKill = pass();
    expect(afterKill.self.dgrun.bosses[0]).toEqual({
      mobId: 'knight_commander_olen',
      defeated: true,
    });
    expect(client.dungeonRun?.bosses.map((b) => b.defeated)).toEqual([true, false, false, false]);
    expect(client.dungeonRun).not.toBe(mirrored);
    expect(pass().self).not.toHaveProperty('dgrun');

    expect(leaveDungeon(sim.ctx, session.pid)).toBe(true);
    expect(pass().self).toHaveProperty('dgrun', null);
    expect(client.dungeonRun).toBeNull();
  });

  it('serializes one claim view once, however many members read it', () => {
    const { server, sim, session } = rig(302, 'Leader');
    const fc2 = fakeWs();
    const other = joinServer(server, fc2, 303, 'Second', 'mage');
    sim.setPlayerLevel(20, other.pid);
    sim.partyInvite(other.pid, session.pid);
    sim.partyAccept(other.pid);
    expect(enterDungeon(sim.ctx, 'hollow_crypt', session.pid, true)).toBe(true);
    expect(enterDungeon(sim.ctx, 'hollow_crypt', other.pid, true)).toBe(true);
    const spy = vi.spyOn(JSON, 'stringify');
    try {
      const a = dungeonRunWireJson(sim.ctx, session.pid);
      const b = dungeonRunWireJson(sim.ctx, other.pid);
      const again = dungeonRunWireJson(sim.ctx, session.pid);
      expect(a).toBe(b);
      expect(again).toBe(a);
      expect(a).toContain('"dungeonId":"hollow_crypt"');
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
    expect(dungeonRunWireJson(sim.ctx, 424242)).toBe('null');
  });

  it('a reconnect clears the stale mirror and the next snapshot restores it', () => {
    const { sim, session, client, pass } = rig(304, 'Relinker');
    expect(enterDungeon(sim.ctx, 'drowned_temple', session.pid, true)).toBe(true);
    pass();
    expect(client.dungeonRun?.dungeonId).toBe('drowned_temple');
    // The reconnect path resets every delta-omitted mirror before the fresh
    // session's first self record lands (ClientWorld's hello handler).
    client.resetQuestWorldWireState();
    expect(client.dungeonRun).toBeNull();
  });
});

describe('decodeDungeonRun', () => {
  const good = {
    dungeonId: 'hollow_crypt',
    difficulty: 'normal',
    bosses: [
      { mobId: 'sexton_marrow', defeated: true },
      { mobId: 'morthen', defeated: false },
    ],
  };

  it('decodes a well-formed frame into a frozen view', () => {
    const run = decodeDungeonRun(JSON.parse(JSON.stringify(good)));
    expect(run).toEqual(good);
    expect(Object.isFrozen(run)).toBe(true);
    expect(Object.isFrozen(run?.bosses)).toBe(true);
    expect(Object.isFrozen(run?.bosses[0])).toBe(true);
  });

  it('carries nothing but the three known fields', () => {
    const run = decodeDungeonRun({
      ...good,
      extra: 'x',
      bosses: [{ ...good.bosses[0], hp: 9 }],
    });
    expect(Object.keys(run ?? {})).toEqual(['dungeonId', 'difficulty', 'bosses']);
    expect(Object.keys(run?.bosses[0] ?? {})).toEqual(['mobId', 'defeated']);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'hollow_crypt'],
    ['an array', [good]],
    ['an unknown dungeon', { ...good, dungeonId: 'crypt_of_next_patch' }],
    ['a prototype key as the dungeon', { ...good, dungeonId: 'constructor' }],
    ['a non-string dungeon', { ...good, dungeonId: 7 }],
    ['an unknown difficulty', { ...good, difficulty: 'mythic' }],
    ['a missing difficulty', { dungeonId: good.dungeonId, bosses: good.bosses }],
    ['bosses not a list', { ...good, bosses: { 0: good.bosses[0] } }],
    ['an empty boss list', { ...good, bosses: [] }],
    [
      'an oversized boss list',
      { ...good, bosses: Array.from({ length: 17 }, () => good.bosses[0]) },
    ],
    ['a boss that is not a record', { ...good, bosses: ['sexton_marrow'] }],
    ['an unknown boss', { ...good, bosses: [{ mobId: 'boss_of_next_patch', defeated: false }] }],
    ['a prototype key as the boss', { ...good, bosses: [{ mobId: 'toString', defeated: false }] }],
    ['a non-boolean defeated flag', { ...good, bosses: [{ mobId: 'morthen', defeated: 1 }] }],
    ['a missing defeated flag', { ...good, bosses: [{ mobId: 'morthen' }] }],
  ])('drops the whole run for %s', (_label, frame) => {
    expect(decodeDungeonRun(frame)).toBeNull();
  });

  it('one unknown boss drops the run rather than rendering a short list', () => {
    const run = decodeDungeonRun({
      ...good,
      bosses: [...good.bosses, { mobId: 'boss_of_next_patch', defeated: false }],
    });
    expect(run).toBeNull();
  });
});
