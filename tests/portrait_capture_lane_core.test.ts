import { describe, expect, it } from 'vitest';
import { createPortraitCaptureLane } from '../src/render/characters/portrait_capture_lane_core';

/** A capture whose settlement the test drives. */
function deferred() {
  let settle!: (err?: unknown) => void;
  const promise = new Promise<void>((resolve, reject) => {
    settle = (err) => (err ? reject(err) : resolve());
  });
  return { promise, settle };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('portrait capture lane', () => {
  it('runs one capture per key and drops the asks that arrive while it is in flight', async () => {
    const lane = createPortraitCaptureLane();
    const first = deferred();
    let starts = 0;
    const start = () => {
      starts++;
      return first.promise;
    };

    lane.request('player_mage:0:headshot', start);
    lane.request('player_mage:0:headshot', start);
    await flush();
    lane.request('player_mage:0:headshot', start);
    await flush();

    expect(starts).toBe(1);
    expect(lane.pending('player_mage:0:headshot')).toBe(true);
  });

  it('keys the dedupe, so a different skin or framing still captures', async () => {
    const lane = createPortraitCaptureLane();
    const keys: string[] = [];
    for (const key of [
      'player_mage:0:headshot',
      'player_mage:1:headshot',
      'player_mage:0:body',
      'player_mage:0:headshot',
    ]) {
      lane.request(key, async () => {
        keys.push(key);
        await new Promise<void>(() => {});
      });
    }
    await flush();

    expect(keys).toEqual([
      'player_mage:0:headshot',
      'player_mage:1:headshot',
      'player_mage:0:body',
    ]);
  });

  it('retires the key once the capture lands, so a later miss captures again', async () => {
    const lane = createPortraitCaptureLane();
    const first = deferred();
    let starts = 0;

    lane.request('k', () => {
      starts++;
      return first.promise;
    });
    await flush();
    first.settle();
    await flush();

    expect(lane.pending('k')).toBe(false);
    lane.request('k', () => {
      starts++;
      return Promise.resolve();
    });
    await flush();
    expect(starts).toBe(2);
  });

  it('clears the key on a REJECTED capture without throwing into the caller', async () => {
    const lane = createPortraitCaptureLane();
    const failing = deferred();
    const unhandled: unknown[] = [];
    const record = (err: unknown) => unhandled.push(err);
    process.on('unhandledRejection', record);

    expect(() =>
      lane.request('k', () => {
        throw new Error('context lost');
      }),
    ).not.toThrow();
    lane.request('k2', () => failing.promise);
    await flush();
    failing.settle(new Error('encode failed'));
    await flush();

    expect(lane.pending('k')).toBe(false);
    expect(lane.pending('k2')).toBe(false);
    expect(unhandled).toEqual([]);

    let retried = false;
    lane.request('k2', async () => {
      retried = true;
    });
    await flush();
    expect(retried).toBe(true);
    // Only OUR listener: removeAllListeners would strip the runner's own.
    process.off('unhandledRejection', record);
  });

  it('lets a fresh ask start after clear(), and the superseded capture retires nothing', async () => {
    const lane = createPortraitCaptureLane();
    const stale = deferred();
    lane.request('k', () => stale.promise);
    await flush();

    lane.clear();
    expect(lane.pending('k')).toBe(false);
    const fresh = deferred();
    lane.request('k', () => fresh.promise);
    await flush();
    expect(lane.pending('k')).toBe(true);

    // The pre-clear capture settling must not free the key the new one holds.
    stale.settle();
    await flush();
    expect(lane.pending('k')).toBe(true);
    fresh.settle();
    await flush();
    expect(lane.pending('k')).toBe(false);
  });
});
