// The spawn greeting (tutorial island): one-shot semantics, the silent latch
// for established characters, save/load durability (zero-default omission),
// the firstCharacter account fact, and the startTutorial ferry's gates.

import { describe, expect, it } from 'vitest';
import { PROVING_SHORE_ARRIVAL } from '../src/sim/content/proving_shore';
import { Sim } from '../src/sim/sim';
import type { SimContext } from '../src/sim/sim_context';
import {
  maybeEmitTutorialGreeting,
  updateTutorialGreeting,
} from '../src/sim/tutorial/greeting';
import type { SimEvent } from '../src/sim/types';

function makeSim(seed = 4120): Sim {
  return new Sim({ seed, playerClass: 'warrior', autoEquip: true });
}

function greetCtx(sim: Sim) {
  const emitted: SimEvent[] = [];
  const raw = {
    tickCount: 0,
    players: sim.players,
    emit: (e: SimEvent) => emitted.push(e),
  };
  return { ctx: raw as unknown as SimContext, emitted, raw };
}

describe('tutorial greeting one-shot', () => {
  it('emits exactly once for a fresh character, carrying firstCharacter', () => {
    const sim = makeSim();
    const meta = sim.players.get(sim.playerId)!;
    const first = greetCtx(sim);
    expect(maybeEmitTutorialGreeting(meta, first.ctx)).toBe(true);
    expect(first.emitted).toEqual([
      { type: 'tutorialGreeting', pid: sim.playerId, firstCharacter: true },
    ]);
    expect(meta.tutorialGreetingSent).toBe(true);

    const second = greetCtx(sim);
    expect(maybeEmitTutorialGreeting(meta, second.ctx)).toBe(false);
    expect(second.emitted).toEqual([]);
  });

  it('latches SILENTLY for an established character (a pre-tutorial save)', () => {
    const sim = makeSim();
    const meta = sim.players.get(sim.playerId)!;
    meta.lifetimeXp = 500; // any progress at all marks the character established
    const { ctx, emitted } = greetCtx(sim);
    expect(maybeEmitTutorialGreeting(meta, ctx)).toBe(false);
    expect(emitted).toEqual([]);
    // The flag still latched, so the greeting can never fire later either.
    expect(meta.tutorialGreetingSent).toBe(true);
  });

  it('a character with quest history is established even at zero XP', () => {
    const sim = makeSim();
    const meta = sim.players.get(sim.playerId)!;
    meta.questsDone.add('q_wolves');
    const { ctx, emitted } = greetCtx(sim);
    expect(maybeEmitTutorialGreeting(meta, ctx)).toBe(false);
    expect(emitted).toEqual([]);
  });

  it('the sweep runs on the 1 Hz cadence only', () => {
    const sim = makeSim();
    const { ctx, emitted, raw } = greetCtx(sim);
    raw.tickCount = 19;
    updateTutorialGreeting(ctx);
    expect(emitted).toEqual([]);
    raw.tickCount = 20;
    updateTutorialGreeting(ctx);
    expect(emitted).toHaveLength(1);
  });

  it('does not re-fire across save/load, and omits the flag while unset', () => {
    const sim = makeSim();
    const meta = sim.players.get(sim.playerId)!;
    const bare = sim.serializeCharacter(sim.playerId);
    expect(bare && 'tutorialGreetingSent' in bare).toBe(false);

    maybeEmitTutorialGreeting(meta, greetCtx(sim).ctx);
    const saved = sim.serializeCharacter(sim.playerId);
    expect(saved?.tutorialGreetingSent).toBe(true);

    const reloaded = makeSim(4121);
    const pid = reloaded.addPlayer('warrior', 'Reloaded', { state: saved ?? undefined });
    const reloadedMeta = reloaded.players.get(pid)!;
    expect(reloadedMeta.tutorialGreetingSent).toBe(true);
    const afterLoad = greetCtx(reloaded);
    expect(maybeEmitTutorialGreeting(reloadedMeta, afterLoad.ctx)).toBe(false);
    expect(afterLoad.emitted).toEqual([]);
  });

  it('carries firstCharacter: false when the server stamps a later character', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('mage', 'Secondling', { firstCharacter: false });
    const meta = sim.players.get(pid)!;
    const { ctx, emitted } = greetCtx(sim);
    expect(maybeEmitTutorialGreeting(meta, ctx)).toBe(true);
    expect(emitted).toEqual([{ type: 'tutorialGreeting', pid, firstCharacter: false }]);
  });
});

describe('startTutorial (the ferry)', () => {
  it('teleports a level-1 character to the Proving Shore arrival', () => {
    const sim = makeSim();
    sim.startTutorial();
    const e = sim.entities.get(sim.playerId)!;
    expect(Math.hypot(e.pos.x - PROVING_SHORE_ARRIVAL.x, e.pos.z - PROVING_SHORE_ARRIVAL.z))
      .toBeLessThan(1);
    expect(e.facing).toBe(PROVING_SHORE_ARRIVAL.facing);
  });

  it('refuses a character above level 1 and leaves them in place', () => {
    const sim = makeSim();
    sim.setPlayerLevel(2, sim.playerId);
    const e = sim.entities.get(sim.playerId)!;
    const before = { ...e.pos };
    sim.startTutorial();
    expect(e.pos.x).toBe(before.x);
    expect(e.pos.z).toBe(before.z);
  });
});
