// The lifetime played-time leaf (src/sim/playtime.ts) and the Sim facade
// getter it backs (IWorldProgressionXp.playtimeSeconds). The /playtime chat
// readout over the same pair is pinned in tests/chat.test.ts; the wire emit in
// tests/snapshots.test.ts.

import { describe, expect, it } from 'vitest';
import { BUILTIN_WORLD } from '../src/sim/data';
import { livePlaytimeSeconds } from '../src/sim/playtime';
import { Sim } from '../src/sim/sim';
import type { WorldContent } from '../src/sim/types';

// The timelines below tick minutes of world time and never touch ambient
// content, so strip the constructor-spawned entities (the CHAT_TEST_WORLD
// doctrine in tests/chat.test.ts) to keep the loops cheap.
const PLAYTIME_TEST_WORLD: WorldContent = {
  ...BUILTIN_WORLD,
  camps: [],
  npcs: {},
  groundObjects: [],
};

function makeSim(): Sim {
  return new Sim({
    seed: 42,
    playerClass: 'warrior',
    noPlayer: true,
    world: PLAYTIME_TEST_WORLD,
  });
}

describe('livePlaytimeSeconds', () => {
  it('adds the elapsed session time to the persisted baseline, unfloored', () => {
    expect(livePlaytimeSeconds({ joinedAt: 0, totalPlayedSeconds: 0 }, 0)).toBe(0);
    expect(livePlaytimeSeconds({ joinedAt: 10, totalPlayedSeconds: 100.5 }, 25.25)).toBe(115.75);
  });

  it('never lets a clock behind joinedAt shrink the baseline', () => {
    expect(livePlaytimeSeconds({ joinedAt: 50, totalPlayedSeconds: 100 }, 10)).toBe(100);
  });
});

describe('Sim.playtimeSeconds (IWorldProgressionXp)', () => {
  it('starts at zero and advances with the sim clock', () => {
    const sim = makeSim();
    sim.addPlayer('warrior', 'Aleph');
    expect(sim.playtimeSeconds).toBe(0);
    for (let i = 0; i < 20 * 30; i++) sim.tick();
    expect(sim.playtimeSeconds).toBeCloseTo(30, 5);
  });

  it('equals what serializeCharacter folds at save (one formula, no drift)', () => {
    const sim = makeSim();
    const a = sim.addPlayer('warrior', 'Aleph');
    for (let i = 0; i < 20 * 7; i++) sim.tick();
    const state = sim.serializeCharacter(a);
    expect(state?.totalPlayedSeconds).toBeCloseTo(sim.playtimeSeconds, 10);
  });

  it('loads the saved baseline and keeps accruing on top (the relog path)', () => {
    const sim = makeSim();
    const a = sim.addPlayer('warrior', 'Aleph');
    for (let i = 0; i < 20 * 65; i++) sim.tick();
    const state = sim.serializeCharacter(a);
    expect(state?.totalPlayedSeconds).toBeCloseTo(65, 5);

    // Relog: a fresh Sim (a restart resets sim.time to 0) loading the save.
    const sim2 = makeSim();
    sim2.addPlayer('warrior', 'Aleph', { state: state ?? undefined });
    expect(sim2.playtimeSeconds).toBeCloseTo(65, 5);
    for (let i = 0; i < 20 * 10; i++) sim2.tick();
    expect(sim2.playtimeSeconds).toBeCloseTo(75, 5);
  });
});
