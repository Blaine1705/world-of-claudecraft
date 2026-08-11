import { describe, expect, it } from 'vitest';
import { createRevealGate, REVEAL_GATE_WATCHDOG_MS } from '../src/render/reveal_gate';

const flushMicrotasks = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

interface Deferred {
  promise: Promise<unknown>;
  resolve: () => void;
  reject: (error: unknown) => void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<unknown>((res, rej) => {
    resolve = () => res(undefined);
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('reveal gate driver', () => {
  it('compiles every root behind the key and settles once all resolve', async () => {
    const rootA = { name: 'a' };
    const rootB = { name: 'b' };
    const pending = new Map<object, Deferred>();
    const gate = createRevealGate(
      {
        compile: (root) => {
          const d = deferred();
          pending.set(root, d);
          return d.promise;
        },
        delay: () => new Promise(() => undefined),
      },
      () => [rootA, rootB],
    );
    expect(gate.allow('cell')).toBe(false);
    expect([...pending.keys()]).toEqual([rootA, rootB]);
    pending.get(rootA)?.resolve();
    await flushMicrotasks();
    expect(gate.allow('cell')).toBe(false);
    pending.get(rootB)?.resolve();
    await flushMicrotasks();
    expect(gate.allow('cell')).toBe(true);
  });

  it('a rejected compile still settles the key (allSettled, fail-soft)', async () => {
    const gate = createRevealGate(
      {
        compile: () => Promise.reject(new Error('link failed')),
        delay: () => new Promise(() => undefined),
      },
      () => [{}],
    );
    expect(gate.allow('cell')).toBe(false);
    await flushMicrotasks();
    expect(gate.allow('cell')).toBe(true);
  });

  it('the watchdog settles a key whose compile never resolves', async () => {
    let watchdogMs = 0;
    const gate = createRevealGate(
      {
        compile: () => new Promise(() => undefined),
        delay: (ms) => {
          watchdogMs = ms;
          return Promise.resolve();
        },
      },
      () => [{}],
    );
    expect(gate.allow('cell')).toBe(false);
    await flushMicrotasks();
    expect(gate.allow('cell')).toBe(true);
    expect(watchdogMs).toBe(REVEAL_GATE_WATCHDOG_MS);
  });

  it('a key with no roots settles immediately', async () => {
    const gate = createRevealGate(
      { compile: () => Promise.resolve(), delay: () => new Promise(() => undefined) },
      () => [],
    );
    expect(gate.allow('empty')).toBe(false);
    await flushMicrotasks();
    expect(gate.allow('empty')).toBe(true);
  });

  it('requests each key once and resolves roots per key', async () => {
    const asked: string[] = [];
    let compiles = 0;
    const gate = createRevealGate(
      {
        compile: () => {
          compiles++;
          return Promise.resolve();
        },
        delay: () => new Promise(() => undefined),
      },
      (key) => {
        asked.push(key);
        return [{}, {}];
      },
    );
    gate.allow('a');
    gate.allow('a');
    gate.allow('b');
    await flushMicrotasks();
    expect(asked).toEqual(['a', 'b']);
    expect(compiles).toBe(4);
    expect(gate.allow('a')).toBe(true);
    expect(gate.allow('b')).toBe(true);
  });
});
