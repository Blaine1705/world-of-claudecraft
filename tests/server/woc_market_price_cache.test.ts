// The $WOC price cache policy (server/woc_market_price_cache.ts): the three
// H11 defects it exists to close, each pinned decisively. The clock is
// injected, so no timers or sleeps anywhere; the refresh mirrors the proxy
// contract (it RESOLVES an unavailable value, never rejects).

import { describe, expect, it } from 'vitest';
import {
  createWocPriceCache,
  WOC_PRICE_CACHE_TTL_MS,
  WOC_PRICE_FAILURE_TTL_MS,
  WOC_PRICE_STALE_SERVE_MAX_MS,
} from '../../server/woc_market_price_cache';

interface Price {
  available: boolean;
  tag: string;
}

const ok = (tag: string): Price => ({ available: true, tag });
const FAIL: Price = { available: false, tag: 'unavailable' };

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function rig(answers: () => Promise<Price>) {
  let clock = 1_000_000;
  let calls = 0;
  const cache = createWocPriceCache<Price>(
    () => {
      calls++;
      return answers();
    },
    { isFailure: (v) => !v.available, now: () => clock },
  );
  return {
    cache,
    calls: () => calls,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe('woc price cache', () => {
  it('serves a success from cache inside the TTL with exactly one refresh', async () => {
    const r = rig(async () => ok('a'));
    expect((await r.cache.read()).tag).toBe('a');
    r.advance(WOC_PRICE_CACHE_TTL_MS - 1);
    expect((await r.cache.read()).tag).toBe('a');
    expect(r.calls()).toBe(1);
  });

  it('single-flights concurrent cold readers into one refresh', async () => {
    const gate = deferred<Price>();
    const r = rig(() => gate.promise);
    const reads = [r.cache.read(), r.cache.read(), r.cache.read()];
    // The decisive oracle: all three are in flight and only one refresh ran.
    expect(r.calls()).toBe(1);
    gate.resolve(ok('a'));
    const values = await Promise.all(reads);
    expect(values.map((v) => v.tag)).toEqual(['a', 'a', 'a']);
    expect(r.calls()).toBe(1);
  });

  it('stale-while-revalidate: an expired success serves immediately while the refresh lands behind it', async () => {
    const gate = deferred<Price>();
    let answer: () => Promise<Price> = async () => ok('old');
    const r = rig(() => answer());
    await r.cache.read();
    r.advance(WOC_PRICE_CACHE_TTL_MS + 1);
    answer = () => gate.promise;
    // Inside the stale-serve bound: the read resolves NOW with the old value
    // (it must not await the hung refresh), and a background flight starts.
    expect((await r.cache.read()).tag).toBe('old');
    expect(r.calls()).toBe(2);
    gate.resolve(ok('new'));
    await gate.promise;
    // Yield once so the background install lands before the next read.
    await Promise.resolve();
    expect((await r.cache.read()).tag).toBe('new');
    expect(r.calls()).toBe(2);
  });

  it('a failed refresh does not blank a success still inside the stale-serve bound', async () => {
    let answer = async () => ok('good');
    const r = rig(() => answer());
    await r.cache.read();
    r.advance(WOC_PRICE_CACHE_TTL_MS + 1);
    answer = async () => FAIL;
    expect((await r.cache.read()).tag).toBe('good');
    // The background failure landed; the success memo survives it.
    await Promise.resolve();
    expect(r.cache.peek().success?.value.tag).toBe('good');
    expect((await r.cache.read()).tag).toBe('good');
  });

  it('bounds the re-probe rate against a fast-failing service while stale-serving', async () => {
    let answer = async () => ok('good');
    const r = rig(() => answer());
    await r.cache.read();
    r.advance(WOC_PRICE_CACHE_TTL_MS + 1);
    answer = async () => FAIL;
    await r.cache.read();
    await Promise.resolve();
    const probesAfterFirst = r.calls();
    // Repeated reads inside the failure memo window must not add probes.
    await r.cache.read();
    await r.cache.read();
    expect(r.calls()).toBe(probesAfterFirst);
    // Past the failure memo, the next stale-serve read probes again.
    r.advance(WOC_PRICE_FAILURE_TTL_MS);
    await r.cache.read();
    expect(r.calls()).toBe(probesAfterFirst + 1);
  });

  it('converges to the failure answer once the success ages past the stale-serve bound', async () => {
    let answer = async () => ok('good');
    const r = rig(() => answer());
    await r.cache.read();
    answer = async () => FAIL;
    r.advance(WOC_PRICE_STALE_SERVE_MAX_MS + 1);
    // Beyond the bound there is no servable success: the read blocks on the
    // refresh and gets the truthful unavailable answer.
    expect((await r.cache.read()).available).toBe(false);
    expect(r.cache.peek().success).toBeNull();
  });

  it('caches a failure only briefly, never for the success TTL', async () => {
    let answer = async () => FAIL;
    const r = rig(() => answer());
    expect((await r.cache.read()).available).toBe(false);
    // Within the failure memo: answered from the memo, no new probe.
    r.advance(WOC_PRICE_FAILURE_TTL_MS - 1);
    expect((await r.cache.read()).available).toBe(false);
    expect(r.calls()).toBe(1);
    // One tick past the memo (still far inside the old 15s blanking window):
    // a recovered service is visible immediately.
    r.advance(2);
    answer = async () => ok('recovered');
    expect((await r.cache.read()).tag).toBe('recovered');
    expect(r.calls()).toBe(2);
  });

  it('a recovered success replaces the failure memo entirely', async () => {
    let answer = async () => FAIL;
    const r = rig(() => answer());
    await r.cache.read();
    r.advance(WOC_PRICE_FAILURE_TTL_MS + 1);
    answer = async () => ok('back');
    await r.cache.read();
    expect(r.cache.peek().failure).toBeNull();
    r.advance(WOC_PRICE_CACHE_TTL_MS - 1);
    expect((await r.cache.read()).tag).toBe('back');
    expect(r.calls()).toBe(2);
  });

  it('the exported bounds keep the documented ordering: ttl < stale-serve, failure memo well under both', () => {
    expect(WOC_PRICE_CACHE_TTL_MS).toBe(15_000);
    expect(WOC_PRICE_STALE_SERVE_MAX_MS).toBe(30_000);
    expect(WOC_PRICE_FAILURE_TTL_MS).toBe(3_000);
    expect(WOC_PRICE_STALE_SERVE_MAX_MS).toBeGreaterThan(WOC_PRICE_CACHE_TTL_MS);
    expect(WOC_PRICE_FAILURE_TTL_MS).toBeLessThan(WOC_PRICE_CACHE_TTL_MS);
  });
});
