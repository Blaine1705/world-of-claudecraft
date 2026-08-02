// Unit coverage for the Discord-bot /metrics series (server/http/discord_bot_metrics.ts).
//
// Each test builds its OWN prom-client Registry (never the global default one) and
// drives time through the synthetic clock the register function takes, so the
// staleness boundary and the push age are exact and timer-free. The counters cache
// is module-global, so every test starts from a cold process.

import { Registry } from 'prom-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DISCORD_BOT_COUNTERS_STALE_MS,
  type DiscordBotCountersSnapshot,
  resetDiscordBotCountersForTests,
  setDiscordBotCounters,
} from '../../../server/discord_bot_counters';
import {
  registerDiscordBotMetrics,
  WOC_DISCORD_BOT_ACTIVE_QUEUES,
  WOC_DISCORD_BOT_BAN_PAUSES_TOTAL,
  WOC_DISCORD_BOT_BREAKER_BLOCKS_TOTAL,
  WOC_DISCORD_BOT_BREAKER_OPENS_TOTAL,
  WOC_DISCORD_BOT_BREAKER_STATE,
  WOC_DISCORD_BOT_FORBIDDEN_BLOCKS_TOTAL,
  WOC_DISCORD_BOT_FORBIDDEN_ENTRIES,
  WOC_DISCORD_BOT_GLOBAL_PAUSES_TOTAL,
  WOC_DISCORD_BOT_PUSH_AGE_SECONDS,
  WOC_DISCORD_BOT_QUEUE_DEPTH,
  WOC_DISCORD_BOT_RATE_LIMITED_TOTAL,
  WOC_DISCORD_BOT_REQUESTS_TOTAL,
  WOC_DISCORD_BOT_TRACKED_BUCKETS,
  WOC_DISCORD_BOT_TRACKED_ROUTES,
} from '../../../server/http/discord_bot_metrics';
import { syntheticClock } from '../../helpers/synthetic_clock';

/** A wall-clock-shaped origin, so no case leans on a zero timestamp. */
const T0 = 1_700_000_000_000;

function push(overrides: Partial<DiscordBotCountersSnapshot> = {}): DiscordBotCountersSnapshot {
  return {
    requests: 1000,
    rateLimited: 30,
    rateLimitedByScope: { user: 11, global: 7, shared: 9, unknown: 3 },
    globalPauses: 4,
    banPauses: 2,
    breakerState: 'half-open',
    breakerOpens: 5,
    queueDepth: 12,
    trackedBuckets: 40,
    trackedRoutes: 60,
    activeQueues: 6,
    forbiddenEntries: 8,
    forbiddenBlocks: 21,
    breakerBlocks: 13,
    ...overrides,
  };
}

/** The rendered value of one series, by metric name and optional label set. */
function sample(text: string, metric: string, labels?: string): string | undefined {
  const selector = labels === undefined ? '' : `\\{${labels}\\}`;
  return text.match(new RegExp(`^${metric}${selector} ([^\\n]+)$`, 'm'))?.[1];
}

beforeEach(() => {
  resetDiscordBotCountersForTests();
});

afterEach(() => {
  resetDiscordBotCountersForTests();
});

describe('registerDiscordBotMetrics', () => {
  it('renders every series at its zero state before the bot has pushed anything', async () => {
    const registry = new Registry();
    const clock = syntheticClock(T0);
    registerDiscordBotMetrics(registry, clock.now);

    const text = await registry.metrics();
    for (const metric of [
      WOC_DISCORD_BOT_REQUESTS_TOTAL,
      WOC_DISCORD_BOT_GLOBAL_PAUSES_TOTAL,
      WOC_DISCORD_BOT_BAN_PAUSES_TOTAL,
      WOC_DISCORD_BOT_BREAKER_OPENS_TOTAL,
      WOC_DISCORD_BOT_FORBIDDEN_BLOCKS_TOTAL,
      WOC_DISCORD_BOT_BREAKER_BLOCKS_TOTAL,
      WOC_DISCORD_BOT_QUEUE_DEPTH,
      WOC_DISCORD_BOT_TRACKED_BUCKETS,
      WOC_DISCORD_BOT_TRACKED_ROUTES,
      WOC_DISCORD_BOT_ACTIVE_QUEUES,
      WOC_DISCORD_BOT_FORBIDDEN_ENTRIES,
      WOC_DISCORD_BOT_PUSH_AGE_SECONDS,
    ]) {
      expect(text).toContain(`${metric} 0\n`);
    }
    // All four fixed scopes and all three fixed breaker states render from
    // registration, so a dashboard never waits for a first occurrence.
    for (const scope of ['user', 'global', 'shared', 'unknown']) {
      expect(text).toContain(`${WOC_DISCORD_BOT_RATE_LIMITED_TOTAL}{scope="${scope}"} 0\n`);
    }
    for (const state of ['closed', 'open', 'half-open']) {
      expect(text).toContain(`${WOC_DISCORD_BOT_BREAKER_STATE}{state="${state}"} 0\n`);
    }
  });

  it('renders the pushed values, one-hot breaker state, and the push age', async () => {
    const registry = new Registry();
    const clock = syntheticClock(T0);
    registerDiscordBotMetrics(registry, clock.now);

    setDiscordBotCounters(push(), clock.now());
    await clock.advanceBy(30_000);

    const text = await registry.metrics();
    expect(sample(text, WOC_DISCORD_BOT_REQUESTS_TOTAL)).toBe('1000');
    expect(sample(text, WOC_DISCORD_BOT_GLOBAL_PAUSES_TOTAL)).toBe('4');
    expect(sample(text, WOC_DISCORD_BOT_BAN_PAUSES_TOTAL)).toBe('2');
    expect(sample(text, WOC_DISCORD_BOT_BREAKER_OPENS_TOTAL)).toBe('5');
    expect(sample(text, WOC_DISCORD_BOT_FORBIDDEN_BLOCKS_TOTAL)).toBe('21');
    expect(sample(text, WOC_DISCORD_BOT_BREAKER_BLOCKS_TOTAL)).toBe('13');
    expect(sample(text, WOC_DISCORD_BOT_RATE_LIMITED_TOTAL, 'scope="user"')).toBe('11');
    expect(sample(text, WOC_DISCORD_BOT_RATE_LIMITED_TOTAL, 'scope="global"')).toBe('7');
    expect(sample(text, WOC_DISCORD_BOT_RATE_LIMITED_TOTAL, 'scope="shared"')).toBe('9');
    expect(sample(text, WOC_DISCORD_BOT_RATE_LIMITED_TOTAL, 'scope="unknown"')).toBe('3');
    expect(sample(text, WOC_DISCORD_BOT_QUEUE_DEPTH)).toBe('12');
    expect(sample(text, WOC_DISCORD_BOT_TRACKED_BUCKETS)).toBe('40');
    expect(sample(text, WOC_DISCORD_BOT_TRACKED_ROUTES)).toBe('60');
    expect(sample(text, WOC_DISCORD_BOT_ACTIVE_QUEUES)).toBe('6');
    expect(sample(text, WOC_DISCORD_BOT_FORBIDDEN_ENTRIES)).toBe('8');
    expect(sample(text, WOC_DISCORD_BOT_PUSH_AGE_SECONDS)).toBe('30');
    // Exactly the pushed state carries the 1.
    expect(sample(text, WOC_DISCORD_BOT_BREAKER_STATE, 'state="half-open"')).toBe('1');
    expect(sample(text, WOC_DISCORD_BOT_BREAKER_STATE, 'state="closed"')).toBe('0');
    expect(sample(text, WOC_DISCORD_BOT_BREAKER_STATE, 'state="open"')).toBe('0');

    // The plain rateLimited field is cached but deliberately not its own series:
    // the four scope series already sum to it.
    expect(sample(text, WOC_DISCORD_BOT_RATE_LIMITED_TOTAL)).toBeUndefined();
  });

  it('accumulates cumulative counters by delta across pushes', async () => {
    const registry = new Registry();
    const clock = syntheticClock(T0);
    registerDiscordBotMetrics(registry, clock.now);

    setDiscordBotCounters(push(), clock.now());
    await clock.advanceBy(60_000);
    setDiscordBotCounters(
      push({
        requests: 1750,
        rateLimitedByScope: { user: 20, global: 7, shared: 9, unknown: 3 },
        breakerOpens: 6,
        breakerState: 'open',
      }),
      clock.now(),
    );

    const text = await registry.metrics();
    // 1000 then +750: the counter tracks the bot's total, not the last push.
    expect(sample(text, WOC_DISCORD_BOT_REQUESTS_TOTAL)).toBe('1750');
    expect(sample(text, WOC_DISCORD_BOT_RATE_LIMITED_TOTAL, 'scope="user"')).toBe('20');
    // A scope that did not move stays where it was rather than double-counting.
    expect(sample(text, WOC_DISCORD_BOT_RATE_LIMITED_TOTAL, 'scope="global"')).toBe('7');
    expect(sample(text, WOC_DISCORD_BOT_BREAKER_OPENS_TOTAL)).toBe('6');
    expect(sample(text, WOC_DISCORD_BOT_BREAKER_STATE, 'state="open"')).toBe('1');
    expect(sample(text, WOC_DISCORD_BOT_BREAKER_STATE, 'state="half-open"')).toBe('0');
    expect(sample(text, WOC_DISCORD_BOT_PUSH_AGE_SECONDS)).toBe('0');
  });

  it('adds the whole total of a restarted bot instead of rendering a decrease', async () => {
    const registry = new Registry();
    const clock = syntheticClock(T0);
    registerDiscordBotMetrics(registry, clock.now);

    setDiscordBotCounters(push(), clock.now());
    await clock.advanceBy(60_000);
    setDiscordBotCounters(
      push({ requests: 1750, rateLimitedByScope: { user: 20, global: 7, shared: 9, unknown: 3 } }),
      clock.now(),
    );
    await clock.advanceBy(60_000);
    // The bot restarted: its cumulative totals start over from a fresh process.
    setDiscordBotCounters(
      push({
        requests: 40,
        rateLimitedByScope: { user: 2, global: 0, shared: 0, unknown: 0 },
        globalPauses: 0,
        banPauses: 0,
        breakerOpens: 0,
        forbiddenBlocks: 0,
        breakerBlocks: 0,
      }),
      clock.now(),
    );

    const text = await registry.metrics();
    // 1750 carried forward plus the new process's own 40, never 1750 - 40.
    expect(sample(text, WOC_DISCORD_BOT_REQUESTS_TOTAL)).toBe('1790');
    expect(sample(text, WOC_DISCORD_BOT_RATE_LIMITED_TOTAL, 'scope="user"')).toBe('22');
    // A scope that restarted at 0 adds nothing rather than subtracting.
    expect(sample(text, WOC_DISCORD_BOT_RATE_LIMITED_TOTAL, 'scope="global"')).toBe('7');
    expect(sample(text, WOC_DISCORD_BOT_GLOBAL_PAUSES_TOTAL)).toBe('4');
    expect(sample(text, WOC_DISCORD_BOT_BAN_PAUSES_TOTAL)).toBe('2');
    expect(sample(text, WOC_DISCORD_BOT_BREAKER_OPENS_TOTAL)).toBe('5');
    expect(sample(text, WOC_DISCORD_BOT_FORBIDDEN_BLOCKS_TOTAL)).toBe('21');
    expect(sample(text, WOC_DISCORD_BOT_BREAKER_BLOCKS_TOTAL)).toBe('13');
  });

  it('zeroes the live gauges and the breaker state once the push goes stale, keeping the totals', async () => {
    const registry = new Registry();
    const clock = syntheticClock(T0);
    registerDiscordBotMetrics(registry, clock.now);

    setDiscordBotCounters(push(), clock.now());
    await clock.advanceBy(DISCORD_BOT_COUNTERS_STALE_MS);
    const atBoundary = await registry.metrics();
    expect(sample(atBoundary, WOC_DISCORD_BOT_QUEUE_DEPTH)).toBe('12');
    expect(sample(atBoundary, WOC_DISCORD_BOT_BREAKER_STATE, 'state="half-open"')).toBe('1');

    await clock.advanceBy(1);
    const text = await registry.metrics();
    for (const metric of [
      WOC_DISCORD_BOT_QUEUE_DEPTH,
      WOC_DISCORD_BOT_TRACKED_BUCKETS,
      WOC_DISCORD_BOT_TRACKED_ROUTES,
      WOC_DISCORD_BOT_ACTIVE_QUEUES,
      WOC_DISCORD_BOT_FORBIDDEN_ENTRIES,
    ]) {
      expect(sample(text, metric)).toBe('0');
    }
    for (const state of ['closed', 'open', 'half-open']) {
      expect(sample(text, WOC_DISCORD_BOT_BREAKER_STATE, `state="${state}"`)).toBe('0');
    }
    // The cumulative totals are untouched by staleness, and the age keeps growing
    // (it is measured from the push, not from the cache's zeroed updatedAt).
    expect(sample(text, WOC_DISCORD_BOT_REQUESTS_TOTAL)).toBe('1000');
    expect(sample(text, WOC_DISCORD_BOT_RATE_LIMITED_TOTAL, 'scope="user"')).toBe('11');
    expect(sample(text, WOC_DISCORD_BOT_PUSH_AGE_SECONDS)).toBe('300.001');
  });

  it('never turns a pushed scope key into a label: only the fixed four render', async () => {
    const registry = new Registry();
    const clock = syntheticClock(T0);
    registerDiscordBotMetrics(registry, clock.now);

    // A scope key the fixed list does not carry, forced past the type to prove the
    // exporter iterates ITS OWN list rather than the pushed object's keys.
    setDiscordBotCounters(
      push({
        rateLimitedByScope: {
          user: 11,
          global: 7,
          shared: 9,
          unknown: 3,
          evil: 5,
        } as unknown as DiscordBotCountersSnapshot['rateLimitedByScope'],
      }),
      clock.now(),
    );

    const text = await registry.metrics();
    expect(text).not.toContain('scope="evil"');
    expect(text).not.toContain('evil');
    expect(sample(text, WOC_DISCORD_BOT_RATE_LIMITED_TOTAL, 'scope="user"')).toBe('11');
  });

  it('works on the DEFAULT clock, the one production actually runs on', async () => {
    // main.ts calls registerDiscordBotMetrics(registry) with no clock, so the
    // default `now = Date.now` is the production path; every other case here
    // injects the synthetic clock, and a broken default (say `() => 0`) would
    // make staleness unreachable and the push age nonsense in production while
    // the injected-clock suite stayed green.
    const registry = new Registry();
    registerDiscordBotMetrics(registry);

    setDiscordBotCounters(push(), Date.now());

    const text = await registry.metrics();
    expect(sample(text, WOC_DISCORD_BOT_QUEUE_DEPTH)).toBe('12');
    const age = Number(sample(text, WOC_DISCORD_BOT_PUSH_AGE_SECONDS));
    expect(age).toBeGreaterThanOrEqual(0);
    expect(age).toBeLessThan(1);
  });
});
