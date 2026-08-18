// The arrival curtain flag plus the registry the reveal gates join
// (src/render/arrival_cover.ts): who reads the flag is tested where they read
// it (gpu_prep_admission), so these cases pin the flag's own contract, the
// aggregate held-key view, and the bounded wait.
import { afterEach, describe, expect, it } from 'vitest';
import {
  ARRIVAL_REVEAL_POLL_MS,
  type ArrivalRevealGate,
  arrivalCoverActive,
  arrivalHeldImminentKeys,
  awaitArrivalReveals,
  registerRevealGateForArrival,
  resetArrivalCoverForTest,
  setArrivalCover,
} from '../src/render/arrival_cover';

/** A gate whose held count the test drives. */
function fakeGate(held: number): ArrivalRevealGate & { held: number } {
  return {
    held,
    heldImminentKeys(): number {
      return this.held;
    },
  };
}

/** A timer fake: every scheduled poll runs on `flush`, so a wait resolves
 *  without real time passing. */
function fakeTimer() {
  const pending: (() => void)[] = [];
  const armedMs: number[] = [];
  return {
    armedMs,
    schedule: (poll: () => void, ms: number): void => {
      armedMs.push(ms);
      pending.push(poll);
    },
    flush: (): void => {
      const due = pending.splice(0, pending.length);
      for (const poll of due) poll();
    },
    pending: (): number => pending.length,
  };
}

afterEach(() => {
  resetArrivalCoverForTest();
});

describe('arrival cover flag', () => {
  it('is down by default and follows the curtain', () => {
    expect(arrivalCoverActive()).toBe(false);
    setArrivalCover(true);
    expect(arrivalCoverActive()).toBe(true);
    setArrivalCover(false);
    expect(arrivalCoverActive()).toBe(false);
  });

  it('is idempotent, so a redundant raise or drop changes nothing', () => {
    // The warmup's finally always runs, including on a path that never raised
    // the curtain.
    setArrivalCover(false);
    expect(arrivalCoverActive()).toBe(false);
    setArrivalCover(true);
    setArrivalCover(true);
    expect(arrivalCoverActive()).toBe(true);
    setArrivalCover(false);
    expect(arrivalCoverActive()).toBe(false);
  });

  it('sums the held imminent keys across every gate', () => {
    const props = fakeGate(3);
    const town = fakeGate(1);
    registerRevealGateForArrival(props);
    registerRevealGateForArrival(town);
    expect(arrivalHeldImminentKeys()).toBe(4);
    props.held = 0;
    town.held = 0;
    expect(arrivalHeldImminentKeys()).toBe(0);
  });
});

describe('awaitArrivalReveals', () => {
  it('resolves at once when nothing is held', async () => {
    const timer = fakeTimer();
    registerRevealGateForArrival(fakeGate(0));
    await awaitArrivalReveals(3_000, { now: () => 0, schedule: timer.schedule });
    expect(timer.pending()).toBe(0);
  });

  it('polls until the last held key settles', async () => {
    const gate = fakeGate(2);
    registerRevealGateForArrival(gate);
    const timer = fakeTimer();
    let settled = false;
    const wait = awaitArrivalReveals(3_000, { now: () => 0, schedule: timer.schedule }).then(() => {
      settled = true;
    });

    timer.flush();
    await Promise.resolve();
    expect(settled).toBe(false);
    gate.held = 0;
    timer.flush();
    await wait;
    expect(settled).toBe(true);
    expect(timer.armedMs).toEqual([ARRIVAL_REVEAL_POLL_MS, ARRIVAL_REVEAL_POLL_MS]);
  });

  it('gives up at maxMs so a stuck link cannot hold the screen open', async () => {
    registerRevealGateForArrival(fakeGate(1));
    const timer = fakeTimer();
    let now = 0;
    let settled = false;
    const wait = awaitArrivalReveals(3_000, { now: () => now, schedule: timer.schedule }).then(
      () => {
        settled = true;
      },
    );

    now = 2_999;
    timer.flush();
    await Promise.resolve();
    expect(settled).toBe(false);
    now = 3_000;
    timer.flush();
    await wait;
    expect(settled).toBe(true);
  });

  it('resolves at once on a non-positive budget', async () => {
    registerRevealGateForArrival(fakeGate(5));
    const timer = fakeTimer();
    await awaitArrivalReveals(0, { now: () => 0, schedule: timer.schedule });
    expect(timer.pending()).toBe(0);
  });
});
