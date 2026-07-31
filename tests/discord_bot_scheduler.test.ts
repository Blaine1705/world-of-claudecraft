// The bot's loop scheduler: the pure decision core (overlap, coalescing, idle
// backoff, jitter) and the driver that chains one timeout after another.
//
// Every timing case here drives the virtual clock from tests/helpers/synthetic_clock.ts
// and asserts the ABSOLUTE virtual time each run happened at. Orderings and lower
// bounds are deliberately absent: `>= 2000` also passes for a scheduler that waited
// ten minutes, so it pins nothing about the cadence this file exists to guarantee.
//
// Vitest fake timers are deliberately not used (see the synthetic clock's header): a
// clock captured at construction does not move under them, and a fractional delay is
// allowed to fire EARLY, so a jittered delay of 900.0 could land at 899 and the band
// assertions below would be unfalsifiable.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  beginRun,
  DEFAULT_IDLE_DECAY,
  DEFAULT_JITTER_RATIO,
  endRun,
  initialRunState,
  jitteredDelayMs,
  LoopScheduler,
  MIN_INTERVAL_MS,
  nextIntervalMs,
  requestKick,
  resolveCadence,
  type ScheduledTask,
  type SchedulerTimerHandle,
  type SchedulerTimers,
  type TaskCadence,
} from '../bot/scheduler';
import { type SyntheticClock, syntheticClock } from './helpers/synthetic_clock';

/**
 * A SchedulerTimers backed entirely by virtual time. Its sleep ADVANCES now(),
 * which the synthetic clock guarantees by construction: a hand-rolled rig whose
 * sleep leaves now() alone makes a gate loop starve the macrotask queue, so the
 * run HANGS rather than failing and no test timeout ever fires.
 */
function clockTimers(clock: SyntheticClock): SchedulerTimers {
  let nextId = 1;
  const cancelled = new Set<number>();
  return {
    setTimeout(cb: () => void, ms: number): SchedulerTimerHandle {
      const id = nextId++;
      void clock.sleep(ms).then(() => {
        if (!cancelled.has(id)) cb();
      });
      return id;
    },
    clearTimeout(handle: SchedulerTimerHandle): void {
      cancelled.add(handle as number);
    },
  };
}

/** A promise resolved by hand, so a run can be held open across clock advances. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let release = (): void => {};
  const promise = new Promise<void>((resolveIt) => {
    release = (): void => resolveIt();
  });
  return { promise, resolve: () => release() };
}

/** The D1 shape for the future outbox: 3 s active decaying to 15 s idle. */
const OUTBOX: TaskCadence = { activeMs: 3000, idleMs: 15_000 };

describe('scheduler cadence math', () => {
  it('pins the exported defaults against literals', () => {
    // Against LITERALS, never against themselves: driving a case BY a constant and
    // asserting AGAINST it is a self-comparison that passes for any value.
    expect(DEFAULT_IDLE_DECAY).toBe(2);
    expect(DEFAULT_JITTER_RATIO).toBe(0.1);
  });

  it('fills the cadence defaults and starts a task at its active interval', () => {
    expect(resolveCadence({ activeMs: 3000 })).toEqual({
      activeMs: 3000,
      idleMs: 3000,
      decay: 2,
    });
    // A decay override that is NOT the fallback, so the case can actually fail.
    expect(resolveCadence({ activeMs: 3000, idleMs: 15_000, decay: 3 })).toEqual({
      activeMs: 3000,
      idleMs: 15_000,
      decay: 3,
    });
    // Below 1 would SHRINK the interval on an empty run, so it falls back.
    expect(resolveCadence({ activeMs: 3000, decay: 0.5 }).decay).toBe(2);
    expect(initialRunState(OUTBOX)).toEqual({
      running: false,
      kickPending: false,
      intervalMs: 3000,
    });
  });

  it('falls back to MIN_INTERVAL_MS rather than 0 for an unusable active interval', () => {
    // The worst failure this module can have: an interval of 0 arms a zero-delay
    // timeout whose callback arms another, which is a hot spin that starves the
    // macrotask queue and WEDGES the process instead of failing. Every unusable
    // shape has to land on the floor, not on zero.
    expect(MIN_INTERVAL_MS).toBe(1000);
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, undefined]) {
      expect(resolveCadence({ activeMs: bad as unknown as number }).activeMs).toBe(MIN_INTERVAL_MS);
      expect(resolveCadence({ activeMs: bad as unknown as number }).activeMs).not.toBe(0);
    }
    // A valid value is passed through UNTOUCHED, however small: the floor is a
    // fallback, not a clamp, so a D13 operator override is never silently changed.
    expect(resolveCadence({ activeMs: 250 }).activeMs).toBe(250);
  });

  it('snaps back to the active interval whenever a run did work', () => {
    expect(nextIntervalMs(15_000, OUTBOX, true)).toBe(3000);
    expect(nextIntervalMs(6000, OUTBOX, true)).toBe(3000);
  });

  it('decays an idle interval by the decay factor and CLAMPS at the idle ceiling', () => {
    // Driven until the clamp is actually REACHED: a bound test that stops short of
    // its bound is constant-true and would pass with the clamp deleted.
    expect(nextIntervalMs(3000, OUTBOX, false)).toBe(6000);
    expect(nextIntervalMs(6000, OUTBOX, false)).toBe(12_000);
    expect(nextIntervalMs(12_000, OUTBOX, false)).toBe(15_000);
    // And it STAYS there rather than creeping past on the next empty run.
    expect(nextIntervalMs(15_000, OUTBOX, false)).toBe(15_000);
  });

  it('honors a decay override different from the default', () => {
    const cadence: TaskCadence = { activeMs: 3000, idleMs: 15_000, decay: 3 };
    expect(nextIntervalMs(3000, cadence, false)).toBe(9000);
    expect(nextIntervalMs(9000, cadence, false)).toBe(15_000);
  });

  it('does not decay at all when the idle interval is not above the active one', () => {
    expect(nextIntervalMs(5000, { activeMs: 5000 }, false)).toBe(5000);
    expect(nextIntervalMs(5000, { activeMs: 5000, idleMs: 2000 }, false)).toBe(5000);
  });
});

describe('scheduler jitter band', () => {
  it('maps the unit draw onto the exact edges and center of the band', () => {
    expect(jitteredDelayMs(1000, 0.1, 0)).toBe(900);
    expect(jitteredDelayMs(1000, 0.1, 0.5)).toBe(1000);
    expect(jitteredDelayMs(1000, 0.1, 1)).toBe(1100);
    expect(jitteredDelayMs(1000, 0.1, 0.999)).toBeCloseTo(1099.8, 6);
  });

  it('returns the base exactly when the ratio is zero', () => {
    expect(jitteredDelayMs(1000, 0, 0)).toBe(1000);
    expect(jitteredDelayMs(1000, 0, 1)).toBe(1000);
  });

  it('never returns a negative or non-finite delay', () => {
    // A ratio above 1 would put the bottom of the band below zero.
    expect(jitteredDelayMs(1000, 5, 0)).toBe(0);
    expect(jitteredDelayMs(-5, 0.1, 0)).toBe(0);
    expect(jitteredDelayMs(Number.POSITIVE_INFINITY, 0.1, 0)).toBe(0);
    expect(jitteredDelayMs(Number.NaN, 0.1, 0)).toBe(0);
    // A broken random source degrades to the CENTER, never to a zero delay.
    expect(jitteredDelayMs(1000, 0.1, Number.NaN)).toBe(1000);
  });
});

describe('scheduler run state', () => {
  it('refuses a second concurrent claim on the same task', () => {
    const first = beginRun(initialRunState(OUTBOX));
    expect(first.started).toBe(true);
    expect(first.state.running).toBe(true);
    const second = beginRun(first.state);
    expect(second.started).toBe(false);
    expect(second.state).toBe(first.state);
  });

  it('runs a kick immediately when idle and defers it while a run is in flight', () => {
    const idle = initialRunState(OUTBOX);
    const immediate = requestKick(idle);
    expect(immediate.runNow).toBe(true);
    expect(immediate.state.kickPending).toBe(false);

    const running = beginRun(idle).state;
    const deferredKick = requestKick(running);
    expect(deferredKick.runNow).toBe(false);
    expect(deferredKick.state.kickPending).toBe(true);
  });

  it('collapses N kicks during one run into exactly one follow-up', () => {
    let state = beginRun(initialRunState(OUTBOX)).state;
    for (let i = 0; i < 5; i++) state = requestKick(state).state;
    expect(state.kickPending).toBe(true);

    const first = endRun(state, OUTBOX, true);
    expect(first.followUpNow).toBe(true);
    // Cleared in the returned state, so the follow-up cannot fire a second time.
    expect(first.state.kickPending).toBe(false);
    expect(first.state.running).toBe(false);

    const second = endRun(first.state, OUTBOX, true);
    expect(second.followUpNow).toBe(false);
  });

  it('carries the decayed interval out of an empty run and the active one out of work', () => {
    const started = beginRun(initialRunState(OUTBOX)).state;
    expect(endRun(started, OUTBOX, false).state.intervalMs).toBe(6000);
    expect(endRun(started, OUTBOX, true).state.intervalMs).toBe(3000);
  });
});

describe('scheduler driver', () => {
  it('never starts a second run while one is still in flight', async () => {
    const clock = syntheticClock();
    const gate = deferred();
    let runs = 0;
    let concurrent = 0;
    let peakConcurrent = 0;
    const scheduler = new LoopScheduler(clockTimers(clock), () => 0.5);
    const task = scheduler.add({
      name: 'slow-sweep',
      cadence: { activeMs: 1000 },
      run: async () => {
        runs++;
        concurrent++;
        peakConcurrent = Math.max(peakConcurrent, concurrent);
        await gate.promise;
        concurrent--;
        return true;
      },
    });
    expect(scheduler.size).toBe(1);

    task.start();
    await clock.advanceTo(1000);
    expect(runs).toBe(1);

    // Ten whole intervals pass with the run still open. A repeating interval timer
    // would have stacked ten more sweeps by here.
    await clock.advanceTo(11_000);
    expect(runs).toBe(1);
    // A kick mid-run cannot open a second door into the run either.
    task.kick();
    expect(runs).toBe(1);
    expect(peakConcurrent).toBe(1);

    gate.resolve();
    await clock.advanceTo(11_000);
    // The pending kick is the follow-up, and it runs at once rather than waiting.
    expect(runs).toBe(2);
    task.stop();
  });

  it('collapses several kicks during one run into exactly one extra run', async () => {
    const clock = syntheticClock();
    const gate = deferred();
    const runAt: number[] = [];
    const scheduler = new LoopScheduler(clockTimers(clock), () => 0.5);
    const task = scheduler.add({
      name: 'guild-create-storm',
      cadence: { activeMs: 1000 },
      run: async () => {
        runAt.push(clock.now());
        if (runAt.length === 1) await gate.promise;
        return true;
      },
    });

    task.start();
    await clock.advanceTo(1000);
    expect(runAt).toEqual([1000]);

    // The GUILD_CREATE trap: Discord re-sends it on every re-IDENTIFY, so a
    // reconnect storm delivers a burst of kicks against one in-flight sweep.
    task.kick();
    task.kick();
    task.kick();
    gate.resolve();
    await clock.advanceTo(1000);
    // Exactly two, not "at least two": four kicks against one run are one follow-up.
    expect(runAt).toEqual([1000, 1000]);
    task.stop();
  });

  it('chains the next run only after the previous one settles', async () => {
    const clock = syntheticClock();
    const runAt: number[] = [];
    // 0.5 is the band's center, so every delay is exactly the base interval and the
    // times below are the cadence itself rather than a jittered sample of it.
    const scheduler = new LoopScheduler(clockTimers(clock), () => 0.5);
    const task = scheduler.add({
      name: 'relay',
      cadence: { activeMs: 1000 },
      run: async () => {
        runAt.push(clock.now());
        return true;
      },
    });

    scheduler.startAll();
    // The first delay is armed at start, and each later one only after the previous
    // run settles: three runs exactly one interval apart, not a fixed 0/1000/2000
    // rhythm laid down in advance.
    await clock.advanceTo(3000);
    expect(runAt).toEqual([1000, 2000, 3000]);
    // Work every time, so the interval never left the active cadence.
    expect(task.intervalMs()).toBe(1000);
    scheduler.stopAll();
  });

  it('catches a throwing run, counts it as no work, and keeps the chain alive', async () => {
    const clock = syntheticClock();
    const runAt: number[] = [];
    const errors: Array<{ message: string; name: string }> = [];
    const scheduler = new LoopScheduler(clockTimers(clock), () => 0.5);
    const task = scheduler.add({
      name: 'role-sync',
      cadence: { activeMs: 1000, idleMs: 8000 },
      run: async () => {
        runAt.push(clock.now());
        throw new Error('discord said no');
      },
      onError: (error, name) => {
        errors.push({ message: (error as Error).message, name });
      },
    });

    task.start();
    await clock.advanceTo(1000);
    expect(runAt).toEqual([1000]);
    expect(errors).toEqual([{ message: 'discord said no', name: 'role-sync' }]);
    // No work, so the interval decays rather than hammering a failing endpoint.
    expect(task.intervalMs()).toBe(2000);

    // And the chain continues: the next run lands one DECAYED interval later.
    await clock.advanceTo(3000);
    expect(runAt).toEqual([1000, 3000]);
    expect(task.intervalMs()).toBe(4000);
    task.stop();
  });

  it('stops cleanly before a run and while a run is in flight', async () => {
    const clock = syntheticClock();
    const runAt: number[] = [];
    const scheduler = new LoopScheduler(clockTimers(clock), () => 0.5);
    const idle = scheduler.add({
      name: 'never-runs',
      cadence: { activeMs: 1000 },
      run: async () => {
        runAt.push(clock.now());
        return true;
      },
    });
    idle.start();
    idle.stop();
    await clock.advanceTo(10_000);
    expect(runAt).toEqual([]);

    const gate = deferred();
    const inFlightAt: number[] = [];
    const scheduler2 = new LoopScheduler(clockTimers(clock), () => 0.5);
    const busy = scheduler2.add({
      name: 'stops-mid-run',
      cadence: { activeMs: 1000 },
      run: async () => {
        inFlightAt.push(clock.now());
        await gate.promise;
        return true;
      },
    });
    busy.start();
    await clock.advanceTo(11_000);
    expect(inFlightAt).toEqual([11_000]);

    // The kick lands FIRST, while the task is still live, so a follow-up really is
    // pending when stop() arrives. Stopping with nothing pending would be settled by
    // schedule()'s own inactive guard, and the case would pass with the in-flight
    // generation check deleted.
    busy.kick();
    busy.stop();
    // And a kick after stop is ignored outright.
    busy.kick();
    gate.resolve();
    await clock.advanceTo(40_000);
    expect(inFlightAt).toEqual([11_000]);
  });

  it('spreads two loops on the same interval across the exact jitter band', async () => {
    const clock = syntheticClock();
    const draws = [0, 1];
    let drawn = 0;
    const runAt = new Map<string, number[]>();
    const scheduler = new LoopScheduler(clockTimers(clock), () => draws[drawn++] ?? 0.5);
    for (const name of ['alpha', 'beta']) {
      runAt.set(name, []);
      scheduler.add({
        name,
        cadence: { activeMs: 1000 },
        run: async () => {
          (runAt.get(name) as number[]).push(clock.now());
          return true;
        },
      });
    }
    expect(scheduler.size).toBe(2);

    scheduler.startAll();
    // The band's edges for base 1000 at the default ratio: 900 and 1100. Two loops
    // armed in the same boot would otherwise stay phase-locked forever.
    await clock.advanceTo(1100);
    expect(runAt.get('alpha')).toEqual([900]);
    expect(runAt.get('beta')).toEqual([1100]);
    scheduler.stopAll();
    await clock.advanceTo(20_000);
    expect(runAt.get('alpha')).toEqual([900]);
    expect(runAt.get('beta')).toEqual([1100]);
  });

  it('refuses a duplicate task name rather than leaking the replaced timer', () => {
    const scheduler = new LoopScheduler(clockTimers(syntheticClock()), () => 0.5);
    const options = { name: 'relay', cadence: { activeMs: 1000 }, run: async () => true };
    scheduler.add(options);
    // An Error instance, not a string: rejects/toThrow against a string is a
    // SUBSTRING match, which passes for a message that merely contains it.
    expect(() => scheduler.add(options)).toThrow(
      new Error('[bot] scheduler already has a task named relay'),
    );
    expect(scheduler.size).toBe(1);
  });

  it('refuses a task whose active interval is not positive, loudly at wiring time', () => {
    // The complement of the MIN_INTERVAL_MS fallback. The fallback keeps the pure
    // helpers safe; this makes a wiring bug (a lost config value reaching add as
    // undefined or 0) fail at boot rather than run at a cadence nobody chose.
    const scheduler = new LoopScheduler(clockTimers(syntheticClock()), () => 0.5);
    for (const bad of [0, -5, Number.NaN, undefined]) {
      expect(() =>
        scheduler.add({
          name: `bad-${String(bad)}`,
          cadence: { activeMs: bad as unknown as number },
          run: async () => true,
        }),
      ).toThrow(new Error(`[bot] scheduler task bad-${String(bad)} needs a positive activeMs`));
    }
    // Nothing was registered, so a refused task cannot leave a half-built entry
    // behind that a later startAll would arm.
    expect(scheduler.size).toBe(0);
  });

  it('forwards to the ambient timers, and unrefs, when no timers are injected', () => {
    // Constructed BEFORE the globals are stubbed: stub-then-construct would also
    // pass for a default that CAPTURED the global, so it would not guard the rule.
    const scheduler = new LoopScheduler();
    const task = scheduler.add({
      name: 'default-path',
      cadence: { activeMs: 1000 },
      jitterRatio: 0,
      run: async () => true,
    });

    const armed: Array<{ ms: number; callable: boolean }> = [];
    const cleared: unknown[] = [];
    let unrefs = 0;
    const handle = {
      unref: (): void => {
        unrefs++;
      },
    };
    const realSetTimeout = globalThis.setTimeout;
    const realClearTimeout = globalThis.clearTimeout;
    globalThis.setTimeout = ((cb: () => void, ms: number) => {
      armed.push({ ms, callable: typeof cb === 'function' });
      return handle;
    }) as unknown as typeof globalThis.setTimeout;
    globalThis.clearTimeout = ((h: unknown) => {
      cleared.push(h);
    }) as unknown as typeof globalThis.clearTimeout;
    try {
      task.start();
      task.stop();
    } finally {
      globalThis.setTimeout = realSetTimeout;
      globalThis.clearTimeout = realClearTimeout;
    }

    // BOTH arguments, not just the first: a one-parameter stub type-checks against
    // an arity-reduced forward and would hide a dropped delay.
    expect(armed).toEqual([{ ms: 1000, callable: true }]);
    expect(cleared).toEqual([handle]);
    expect(unrefs).toBe(1);
  });
});

describe('scheduler purity', () => {
  it('reads no clock and arms no repeating timer of its own', () => {
    const source = readFileSync(new URL('../bot/scheduler.ts', import.meta.url), 'utf8');
    // Comments are stripped first (block, then line) so prose ABOUT a banned call
    // cannot red this, and so a banned call cannot hide behind a trailing comment.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toContain('setInterval');
    expect(code).not.toContain('Date.now');
    expect(code).not.toContain('performance.now');
    expect(code).not.toContain('require(');
    // Zero imports at all: the decision core has nothing to import, and the driver
    // takes its two IO seams as parameters.
    expect(code).not.toMatch(/^\s*import\s/m);
    // A vacuity floor: the stripper must not have eaten the file it is scanning.
    expect(code).toContain('export class LoopScheduler');
  });
});

describe('scheduler debounce mode (the presence push)', () => {
  /**
   * The presence-push shape: no chain of its own, one run per open window. The
   * random source sits at an EDGE of the jitter band rather than its center, so
   * if a debounce delay were ever jittered every exact time below would move and
   * these cases would fail rather than quietly accept a jittered window.
   */
  function debounceRig(): {
    clock: SyntheticClock;
    runAt: number[];
    task: ScheduledTask;
    gate: ReturnType<typeof deferred>;
  } {
    const clock = syntheticClock();
    const runAt: number[] = [];
    const gate = deferred();
    const scheduler = new LoopScheduler(clockTimers(clock), () => 0);
    const task = scheduler.add({
      name: 'presence-push',
      mode: 'debounce',
      cadence: { activeMs: 4000 },
      run: async () => {
        runAt.push(clock.now());
        if (runAt.length === 1) await gate.promise;
      },
    });
    task.start();
    return { clock, runAt, task, gate };
  }

  it('arms nothing on start, so an unkicked debounce never runs', async () => {
    // The whole difference from a poll loop: start() gives a debounce task no
    // chain at all. A repeating task here would have run a thousand times.
    const { clock, runAt } = debounceRig();
    await clock.advanceTo(1_000_000);
    expect(runAt).toEqual([]);
  });

  it('runs exactly one full window after the first kick, unjittered', async () => {
    const { clock, runAt, task, gate } = debounceRig();
    gate.resolve();
    task.kick();
    // Not one tick earlier: the window is the debounce, so 3999 must be empty.
    await clock.advanceTo(3999);
    expect(runAt).toEqual([]);
    await clock.advanceTo(4000);
    expect(runAt).toEqual([4000]);
    // And nothing repeats afterwards, because a debounce has no chain.
    await clock.advanceTo(100_000);
    expect(runAt).toEqual([4000]);
  });

  it('folds a burst of kicks into ONE run and never defers the deadline', async () => {
    // The voice/presence burst this exists for. Every event in the window costs
    // one run, and a kick at 3999 must not push the deadline out to 7999: a
    // steady burst would otherwise defer the push forever.
    const { clock, runAt, task, gate } = debounceRig();
    gate.resolve();
    task.kick();
    await clock.advanceTo(1000);
    task.kick();
    await clock.advanceTo(3999);
    task.kick();
    expect(runAt).toEqual([]);
    await clock.advanceTo(4000);
    expect(runAt).toEqual([4000]);
  });

  it('sends a kick that lands mid-run through a fresh window, exactly once', async () => {
    // The debounce this replaces cleared its guard BEFORE starting the push, so
    // an event arriving during the push armed a new full window. Three kicks
    // against one in-flight run are still one follow-up, one window later.
    const { clock, runAt, task, gate } = debounceRig();
    task.kick();
    await clock.advanceTo(4000);
    expect(runAt).toEqual([4000]);

    task.kick();
    task.kick();
    task.kick();
    gate.resolve();
    await clock.advanceTo(7999);
    expect(runAt).toEqual([4000]);
    await clock.advanceTo(8000);
    expect(runAt).toEqual([4000, 8000]);
  });

  it('cancels an armed window on stop, and ignores kicks afterwards', async () => {
    const { clock, runAt, task, gate } = debounceRig();
    gate.resolve();
    task.kick();
    await clock.advanceTo(2000);
    task.stop();
    await clock.advanceTo(100_000);
    expect(runAt).toEqual([]);
    task.kick();
    await clock.advanceTo(200_000);
    expect(runAt).toEqual([]);
  });
});
