import { afterEach, describe, expect, it, vi } from 'vitest';
import { RiftUpgradeCoordinator, riftUpgraderConfigFromEnv } from '../../server/rift_upgrader';
import { BUILTIN_WORLD } from '../../src/sim/data';
import { spawnNaturalRiftPortal } from '../../src/sim/rift/portals';
import { Sim } from '../../src/sim/sim';

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeSim(): Sim {
  return new Sim({
    seed: 551,
    playerClass: 'warrior',
    noPlayer: true,
    riftPortals: true,
    world: { ...BUILTIN_WORLD, camps: [], npcs: {}, groundObjects: [] },
  });
}

describe('server Rift AI upgrader', () => {
  it('is disabled unless a complete provider configuration is present', () => {
    expect(riftUpgraderConfigFromEnv({})).toBeNull();
    expect(riftUpgraderConfigFromEnv({ OPENAI_API_KEY: 'secret' })).toBeNull();
    expect(
      riftUpgraderConfigFromEnv({
        OPENAI_API_KEY: 'secret',
        RIFT_UPGRADER_MODEL: 'configured-model',
      }),
    ).toEqual(expect.objectContaining({ provider: 'openai', model: 'configured-model' }));
  });

  it('applies a dedicated-service result only when drained at a tick boundary', async () => {
    const sim = makeSim();
    spawnNaturalRiftPortal(sim.ctx, 0);
    const event = sim.riftEvents[0];
    const upgraded = structuredClone(event.upgrade!);
    upgraded.title = `${upgraded.title} Reforged`;
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(upgraded), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const coordinator = new RiftUpgradeCoordinator({
      provider: 'dedicated',
      url: 'https://upgrader.invalid/rifts',
      apiKey: 'not-logged',
      timeoutMs: 5_000,
      maxRequestsPerHour: 4,
    });

    coordinator.observe(sim.ctx);
    expect(event.upgradeStatus).toBe('pending');
    expect(event.riftName).not.toContain('Reforged');
    await vi.waitFor(() => {
      coordinator.drain(sim.ctx);
      expect(event.upgradeStatus).toBe('ready');
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(event.riftName).toContain('Reforged');
    expect(event.contentLocked).toBe(false);
  });

  it('caps the intake queue at 32 and refuses the NEWEST arrivals without marking them', () => {
    const sim = makeSim();
    for (let ordinal = 0; sim.riftEvents.length < 40 && ordinal < 200; ordinal++) {
      spawnNaturalRiftPortal(sim.ctx, ordinal);
    }
    expect(sim.riftEvents.length).toBeGreaterThanOrEqual(40);
    // Never resolves: exactly one request goes in flight and stays there, so
    // observe() cannot drain the queue between assertions.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    const coordinator = new RiftUpgradeCoordinator({
      provider: 'dedicated',
      url: 'https://upgrader.invalid/rifts',
      apiKey: 'not-logged',
      timeoutMs: 5_000,
      maxRequestsPerHour: 4,
    });
    // Only status TRANSITIONS count: a spawn can leave an event in a
    // non-heuristic state the intake never touches, so absolute totals lie.
    const eligible = sim.riftEvents.filter(
      (e) =>
        e.status === 'open' &&
        !e.contentLocked &&
        (e.upgradeStatus === 'heuristic' || e.upgradeStatus === 'fallback'),
    );
    expect(eligible.length).toBeGreaterThan(32);
    coordinator.observe(sim.ctx);
    const marked = eligible.filter((e) => e.upgradeStatus === 'pending');
    // Exactly the cap got marked; every refused arrival keeps its prior
    // status (an unmarked event retries on a later pass; a marked-then-dropped
    // one would strand as 'pending' forever, the shift() bug shape).
    expect(marked.length).toBe(32);
    // Drop-NEWEST: the first 32 eligible events are the marked ones.
    expect(eligible.slice(0, 32).every((e) => e.upgradeStatus === 'pending')).toBe(true);
    expect(eligible.slice(32).every((e) => e.upgradeStatus !== 'pending')).toBe(true);
    // startNext() dispatched one event in flight, freeing exactly one queue
    // slot, so a second pass admits exactly ONE refused arrival (refused ids
    // were never dedup-marked, so they stay retryable): still bounded, never
    // a wholesale re-admit.
    coordinator.observe(sim.ctx);
    expect(eligible.filter((e) => e.upgradeStatus === 'pending').length).toBe(33);
    expect(eligible.slice(33).every((e) => e.upgradeStatus !== 'pending')).toBe(true);
  });
});
