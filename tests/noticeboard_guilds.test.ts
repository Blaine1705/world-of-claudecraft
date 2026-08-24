import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  fillEmptyNoticeboardEvents,
  guildBoardListings,
  NOTICEBOARD_GUILD_LISTINGS_MAX,
} from '../server/noticeboard_guilds';
import type { SimEvent } from '../src/sim/types';
import type { GuildLeaderboardEntry } from '../src/world_api/progression_xp';

function entry(overrides: Partial<GuildLeaderboardEntry> = {}): GuildLeaderboardEntry {
  return {
    rank: 1,
    name: 'Stormcallers',
    memberCount: 12,
    totalLifetimeXp: 2_500_000,
    topLevel: 20,
    pledgesOpen: true,
    ...overrides,
  };
}

describe('guildBoardListings', () => {
  it('maps a guild-board row onto the listing wire shape', () => {
    // Arrange
    const rows = [entry({ pledgeNote: 'chill, invites open', pledgeMinLevel: 10 })];

    // Act
    const listings = guildBoardListings(rows);

    // Assert
    expect(listings).toEqual([
      {
        guild: 'Stormcallers',
        note: 'chill, invites open',
        lifetimeXp: 2_500_000,
        members: 12,
        pledgesOpen: true,
        pledgeMinLevel: 10,
      },
    ]);
  });

  it('keeps the board order and caps the card at the listings max', () => {
    // Arrange
    const rows = Array.from({ length: NOTICEBOARD_GUILD_LISTINGS_MAX + 3 }, (_, i) =>
      entry({ rank: i + 1, name: `Guild ${i + 1}`, totalLifetimeXp: 1_000_000 - i }),
    );

    // Act
    const listings = guildBoardListings(rows);

    // Assert
    expect(listings).toHaveLength(NOTICEBOARD_GUILD_LISTINGS_MAX);
    expect(listings[0].guild).toBe('Guild 1');
    expect(listings[NOTICEBOARD_GUILD_LISTINGS_MAX - 1].guild).toBe(
      `Guild ${NOTICEBOARD_GUILD_LISTINGS_MAX}`,
    );
  });

  it('elides the level floor when pledging is closed or the floor is 1', () => {
    // Arrange
    const rows = [
      entry({ name: 'Closed', pledgesOpen: false, pledgeMinLevel: 10 }),
      entry({ name: 'NoFloor', pledgesOpen: true, pledgeMinLevel: 1 }),
    ];

    // Act
    const listings = guildBoardListings(rows);

    // Assert
    expect(listings[0]).not.toHaveProperty('pledgeMinLevel');
    expect(listings[1]).not.toHaveProperty('pledgeMinLevel');
  });

  it('carries no pledge facts at all from a row that predates the pledge board', () => {
    // Arrange
    const rows = [entry({ pledgesOpen: undefined })];

    // Act
    const listings = guildBoardListings(rows);

    // Assert
    expect(listings[0]).not.toHaveProperty('pledgesOpen');
    expect(listings[0].note).toBe('');
  });
});

describe('fillEmptyNoticeboardEvents', () => {
  const emptyEvent = (pid: number): SimEvent => ({
    type: 'noticeboard',
    noticeboardId: 'ground_eastbrook_noticeboard',
    state: 'empty',
    pid,
  });

  it('replaces the empty arm with guild listings, keeping the board id and reader pid', () => {
    // Arrange
    const events: SimEvent[] = [emptyEvent(7)];

    // Act
    fillEmptyNoticeboardEvents(events, () => [entry()]);

    // Assert
    expect(events[0]).toMatchObject({
      type: 'noticeboard',
      noticeboardId: 'ground_eastbrook_noticeboard',
      state: 'listings',
      pid: 7,
    });
    const filled = events[0] as Extract<SimEvent, { type: 'noticeboard'; state: 'listings' }>;
    expect(filled.listings[0].guild).toBe('Stormcallers');
  });

  it('leaves authored listings and unrelated events untouched', () => {
    // Arrange
    const authored: SimEvent = {
      type: 'noticeboard',
      noticeboardId: 'ground_eastbrook_noticeboard',
      state: 'listings',
      listings: [{ guild: 'Authored', note: 'hand-written' }],
      pid: 3,
    };
    const unrelated: SimEvent = { type: 'mailbox', pid: 3 };
    const events: SimEvent[] = [authored, unrelated];

    // Act
    fillEmptyNoticeboardEvents(events, () => [entry()]);

    // Assert
    expect(events[0]).toBe(authored);
    expect(events[1]).toBe(unrelated);
  });

  it('keeps the empty arm when the provider has no window or no guilds', () => {
    // Arrange
    const nullEvents: SimEvent[] = [emptyEvent(1)];
    const bareEvents: SimEvent[] = [emptyEvent(1)];

    // Act
    fillEmptyNoticeboardEvents(nullEvents, () => null);
    fillEmptyNoticeboardEvents(bareEvents, () => []);

    // Assert
    expect(nullEvents[0]).toMatchObject({ state: 'empty' });
    expect(bareEvents[0]).toMatchObject({ state: 'empty' });
  });

  it('resolves the provider lazily and at most once per batch', () => {
    // Arrange
    const provider = vi.fn(() => [entry()]);
    const quiet: SimEvent[] = [{ type: 'mailbox', pid: 1 }];
    const busy: SimEvent[] = [emptyEvent(1), emptyEvent(2)];

    // Act
    fillEmptyNoticeboardEvents(quiet, provider);
    expect(provider).not.toHaveBeenCalled();
    fillEmptyNoticeboardEvents(busy, provider);

    // Assert
    expect(provider).toHaveBeenCalledTimes(1);
    expect(busy[0]).toMatchObject({ state: 'listings', pid: 1 });
    expect(busy[1]).toMatchObject({ state: 'listings', pid: 2 });
  });
});

describe('routeEvents ordering (source pin)', () => {
  it('runs the fill before the batch is serialized, inside routeEvents', () => {
    // Arrange: the serialize-once invariant (server/game.ts routeEvents) means
    // a replaced event only reaches the wire if the replacement precedes
    // serializeEventFragments. Pin the source order so a future move of the
    // fill below the serialization reds here instead of shipping a desync.
    const src = readFileSync(new URL('../server/game.ts', import.meta.url), 'utf8');
    const route = src.slice(src.indexOf('private routeEvents('));

    // Act
    const fillAt = route.indexOf('fillEmptyNoticeboardEvents(events');
    const serializeAt = route.indexOf('serializeEventFragments(events)');

    // Assert
    expect(fillAt).toBeGreaterThan(-1);
    expect(serializeAt).toBeGreaterThan(-1);
    expect(fillAt).toBeLessThan(serializeAt);
  });
});
