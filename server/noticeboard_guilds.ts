// The guild-signpost fill: online, a noticeboard with no authored listings
// shows the realm's guild board instead of "nothing posted", so every town
// signpost is the pledge board's world-facing discovery surface
// (docs/prd/guild-pledge-board.md). The sim keeps emitting the 'empty' arm
// (guilds are online-only; offline boards stay empty by design), and the
// server swaps that arm for a 'listings' one built from the SAME cached
// realm guild-board window the leaderboard REST handler serves, before the
// batch is serialized (server/game.ts routeEvents).

import type { NoticeboardListing, SimEvent } from '../src/sim/types';
import type { GuildLeaderboardEntry } from '../src/world_api/progression_xp';

/** Rows shown per signpost: the realm's top guilds by summed lifetime XP.
 *  The popup is a transient card, not a window, so the list stays short. */
export const NOTICEBOARD_GUILD_LISTINGS_MAX = 8;

/** The realm guild-board rows as noticeboard listings, capped and mapped.
 *  Rank order (the window is already lifetime-XP descending) is preserved;
 *  the client derives the colour tier from lifetimeXp itself
 *  (guildTierForLifetimeXp) and owns every localized label. */
export function guildBoardListings(
  entries: readonly GuildLeaderboardEntry[],
  max = NOTICEBOARD_GUILD_LISTINGS_MAX,
): NoticeboardListing[] {
  return entries.slice(0, Math.max(0, max)).map((entry) => ({
    guild: entry.name,
    note: entry.pledgeNote ?? '',
    lifetimeXp: entry.totalLifetimeXp,
    members: entry.memberCount,
    ...(entry.pledgesOpen !== undefined ? { pledgesOpen: entry.pledgesOpen } : {}),
    ...(entry.pledgesOpen && (entry.pledgeMinLevel ?? 1) > 1
      ? { pledgeMinLevel: entry.pledgeMinLevel }
      : {}),
  }));
}

/** Replace each 'empty' noticeboard event in the batch with the guild-board
 *  listings arm. Element REPLACEMENT that must run BEFORE the batch is
 *  serialized (serializeEventFragments), never a mutation of an already
 *  serialized event; a board with authored listings passes through untouched.
 *  The provider resolves lazily, once per batch, so ticks without a
 *  noticeboard read never touch it; a null or empty window leaves the
 *  'empty' arm in place (a realm with no guilds honestly has nothing
 *  posted). INVARIANT: the one listings array is shared BY REFERENCE across
 *  every replaced event in the batch, so nothing downstream may mutate a
 *  listing per recipient (serialization only reads). */
export function fillEmptyNoticeboardEvents(
  events: SimEvent[],
  provider: () => readonly GuildLeaderboardEntry[] | null,
): void {
  let listings: NoticeboardListing[] | null = null;
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (ev.type !== 'noticeboard' || ev.state !== 'empty') continue;
    listings ??= guildBoardListings(provider() ?? []);
    if (listings.length === 0) return;
    events[i] = {
      type: 'noticeboard',
      noticeboardId: ev.noticeboardId,
      state: 'listings',
      listings,
      pid: ev.pid,
    };
  }
}
