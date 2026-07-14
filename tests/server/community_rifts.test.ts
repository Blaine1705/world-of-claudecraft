import { beforeEach, describe, expect, it, vi } from 'vitest';

const riftDb = vi.hoisted(() => ({
  load: vi.fn<() => Promise<unknown | null>>(),
  save: vi.fn<(state: unknown) => Promise<void>>(),
}));

vi.mock('../../server/db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) },
  closePlaySession: vi.fn(async () => {}),
  grantAccountMechChroma: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  grantAccountWeaponSkins: vi.fn(async () => ({
    completedQuestIds: [],
    mechChromaIds: [],
    weaponSkinIds: [],
    weaponSkinLoadout: {},
  })),
  heartbeatCharacterLeases: vi.fn(async () => {}),
  insertChatLogs: vi.fn(async () => {}),
  loadAccountFlair: vi.fn(async () => null),
  loadMailState: vi.fn(async () => null),
  loadMarketState: vi.fn(async () => null),
  loadRiftState: () => riftDb.load(),
  markAccountQuestComplete: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  openPlaySession: vi.fn(async () => 1),
  releaseCharacterLease: vi.fn(async () => {}),
  revokeAccountMechChroma: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  saveCharacterAndMarketState: vi.fn(async () => {}),
  saveCharacterState: vi.fn(async () => {}),
  saveMailState: vi.fn(async () => {}),
  saveMarketState: vi.fn(async () => {}),
  saveRiftState: (state: unknown) => riftDb.save(state),
  setAccountWeaponSkinLoadout: vi.fn(async () => ({
    completedQuestIds: [],
    mechChromaIds: [],
    weaponSkinIds: [],
    weaponSkinLoadout: {},
  })),
  touchCharacterLogin: vi.fn(async () => {}),
  walletForAccount: vi.fn(async () => null),
}));

import { GameServer } from '../../server/game';
import { riftInstanceOrigin, riftOriginAt } from '../../src/sim/data';
import { closeNaturalRiftPortal, updateRiftPortals } from '../../src/sim/rift/portals';
import { Sim } from '../../src/sim/sim';

type GameServerOptions = { communityTestRifts?: boolean };

function makeServer(communityTestRifts = false): GameServer {
  const Server = GameServer as unknown as new (options?: GameServerOptions) => GameServer;
  return new Server({ communityTestRifts });
}

function runPortalScheduler(sim: Sim): void {
  sim.tickCount += (10 - (sim.tickCount % 20) + 20) % 20;
  updateRiftPortals(sim.ctx);
}

describe('community Rift boot and persistence', () => {
  beforeEach(() => {
    riftDb.load.mockReset();
    riftDb.save.mockReset();
    riftDb.load.mockResolvedValue(null);
    riftDb.save.mockResolvedValue();
  });

  it('fills eight distinct eligible zones, uses six-hour lifetimes, and saves immediately', async () => {
    const server = makeServer(true);

    await server.loadRifts();

    expect(server.sim.naturalRiftPortals).toHaveLength(8);
    expect(new Set(server.sim.naturalRiftPortals.map((portal) => portal.zoneId))).toHaveLength(8);
    for (const portal of server.sim.naturalRiftPortals) {
      expect(portal.expiresAt - server.sim.time).toBe(6 * 60 * 60);
    }
    expect(server.sim.riftPortalSpawnCount).toBe(8);
    expect(riftDb.save).toHaveBeenCalledTimes(1);
    expect(riftDb.save.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        version: 1,
        spawnCount: 8,
        events: expect.arrayContaining([expect.objectContaining({ status: 'open' })]),
      }),
    );
  });

  it('waits sixty seconds after a close, then restores exactly one missing portal', async () => {
    const server = makeServer(true);
    await server.loadRifts();
    const closed = server.sim.naturalRiftPortals[0];
    expect(closed).toBeDefined();
    if (!closed) return;

    closeNaturalRiftPortal(server.sim.ctx, closed.id, 'sealed');
    expect(server.sim.naturalRiftPortals).toHaveLength(7);

    server.sim.time += 59;
    runPortalScheduler(server.sim);
    expect(server.sim.naturalRiftPortals).toHaveLength(7);

    server.sim.time += 1;
    runPortalScheduler(server.sim);
    expect(server.sim.naturalRiftPortals).toHaveLength(8);
    expect(new Set(server.sim.naturalRiftPortals.map((portal) => portal.zoneId))).toHaveLength(8);
    expect(server.sim.riftPortalSpawnCount).toBe(9);
  });

  it('does not consume the shared simulation RNG while filling the community population', async () => {
    const community = makeServer(true);
    const normal = makeServer(false);

    await community.loadRifts();

    expect(community.sim.rng.next()).toBe(normal.sim.rng.next());
  });

  it('fails community boot on a Rift load or immediate-save failure', async () => {
    const loadFailure = new Error('rift db unavailable');
    riftDb.load.mockRejectedValueOnce(loadFailure);
    await expect(makeServer(true).loadRifts()).rejects.toBe(loadFailure);
    expect(riftDb.save).not.toHaveBeenCalled();

    riftDb.load.mockResolvedValueOnce(null);
    const saveFailure = new Error('rift db write unavailable');
    riftDb.save.mockRejectedValueOnce(saveFailure);
    await expect(makeServer(true).loadRifts()).rejects.toBe(saveFailure);
  });

  it('keeps production failure handling and capacity unchanged when the flag is off', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const loadFailure = new Error('rift db unavailable');
    riftDb.load.mockRejectedValueOnce(loadFailure);
    const server = makeServer(false);

    await expect(server.loadRifts()).resolves.toBeUndefined();
    expect(server.sim.naturalRiftPortals).toHaveLength(0);
    expect(server.sim.riftInstances).toHaveLength(8);
    expect(riftDb.save).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith('failed to load shared Rift state:', loadFailure);
    error.mockRestore();
  });
});

describe('community Rift instance capacity', () => {
  it('allocates twenty-four slots and maps the final slot back to its own origin', () => {
    const sim = new Sim({
      seed: 99221,
      playerClass: 'warrior',
      noPlayer: true,
      riftPortals: true,
      communityRifts: true,
    } as ConstructorParameters<typeof Sim>[0]);

    expect(sim.riftInstances).toHaveLength(24);
    const finalOrigin = riftInstanceOrigin(23, 0);
    expect(riftOriginAt(finalOrigin.z)).toEqual(finalOrigin);
  });

  it('admits twenty-four solo groups and rejects the twenty-fifth cleanly', () => {
    const sim = new Sim({
      seed: 77441,
      playerClass: 'warrior',
      noPlayer: true,
      riftPortals: true,
      communityRifts: true,
    } as ConstructorParameters<typeof Sim>[0]);
    const pids = Array.from({ length: 25 }, (_, index) =>
      sim.addPlayer('warrior', `Rifter${String.fromCharCode(65 + index)}`),
    );

    for (const pid of pids.slice(0, 24)) sim.enterRift(424242, 20, pid);
    expect(sim.riftInstances.filter((instance) => instance.partyKey !== null)).toHaveLength(24);

    sim.drainEvents();
    sim.enterRift(424242, 20, pids[24]);
    expect(sim.riftInstances.some((instance) => instance.memberIds.has(pids[24]))).toBe(false);
    expect(sim.drainEvents()).toContainEqual(
      expect.objectContaining({
        type: 'error',
        pid: pids[24],
        text: 'All rifts are unstable right now. Try again soon.',
      }),
    );
  });
});
