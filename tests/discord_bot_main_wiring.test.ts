// A source guard over bot/main.ts, which no behavior test can reach.
//
// `main.ts` calls `main()` at module scope, so importing it would boot the whole
// bot: real env, real Discord REST, a real WebSocket. Ledger item L8 records that,
// and Phase 3 acted on it by extracting everything testable into `logic.ts`,
// `member_writes.ts` and `scheduler.ts`. What is LEFT in main.ts is wiring, and
// wiring is exactly what a unit test cannot see: which cache, which config field
// and which task name each call site actually passes.
//
// So this file guards the two claims that are otherwise enforced by nothing but a
// sentence in bot/CLAUDE.md:
//   1. there is no bare `setInterval` in main.ts, which is the whole point of the
//      phase (a repeating timer fires whether or not the previous run finished, so
//      sweeps stack into a storm);
//   2. every loop is registered on the scheduler and reads its cadence from the
//      D13 config field, not from a hard-coded constant. Wiring that passed
//      ROLE_SYNC_INTERVAL_MS instead of cfg.roleSyncIntervalMs would leave the
//      operator's incident lever silently inert, and every other test green.
//
// It is a SOURCE pin, which this repo is otherwise wary of, and the wariness is
// about pinning VALUES that a real assertion could reach instead (see R6, and L8's
// "do not add a source-text pin" about the cadence constants, which are pinned
// through bot/cadence.ts as real values elsewhere). This pins STRUCTURE that has no
// other reader. Comments are stripped first, so a mention of setInterval in prose
// cannot red it, and every count carries a vacuity floor so a file that stopped
// matching for an unrelated reason fails rather than passing over nothing.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PRESENCE_DEBOUNCE_MS, RELAY_POLL_MS, ROLE_SYNC_INTERVAL_MS } from '../bot/cadence';

/** main.ts with block and line comments removed. */
function mainSource(): string {
  return readFileSync(new URL('../bot/main.ts', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * Every scheduler task main.ts registers, the config field it must read, and the
 * sweep it must actually run.
 *
 * The `run` column is not decoration. Without it the per-task pattern stops at
 * the cadence, so swapping the BODIES of two registrations that share an interval
 * (relay and activity both read relayPollMs) leaves every assertion in this file
 * green while the relay channel quietly receives the activity feed.
 */
const TASKS = [
  { name: 'presence-push', field: 'presenceDebounceMs', run: 'pushPresence' },
  { name: 'role-sync', field: 'roleSyncIntervalMs', run: 'syncAllOnlineRoles' },
  { name: 'tier-roles', field: 'roleSyncIntervalMs', run: 'refreshTierRoles' },
  { name: 'relay', field: 'relayPollMs', run: 'pollRelay' },
  { name: 'activity', field: 'relayPollMs', run: 'pollActivity' },
  { name: 'daily-rewards-winners', field: 'relayPollMs', run: 'pollDailyRewardWinners' },
  { name: 'special-roles-and-meta', field: 'roleSyncIntervalMs', run: 'refreshSpecialRoles' },
] as const;

/**
 * Every event-driven kick, and exactly how many times it appears.
 *
 * These are the coalescing rule's ONLY production triggers: the whole reason the
 * scheduler collapses a reconnect burst into one follow-up is that GUILD_CREATE
 * arrives once per re-IDENTIFY. Reverting any of them to the fire-and-forget
 * sweep call it replaced restores the storm and moves no other assertion.
 */
const KICKS = [
  { call: 'presenceTask.kick()', times: 1 },
  { call: 'roleSyncTask.kick()', times: 1 },
  { call: 'memberMetaTask.kick()', times: 2 },
] as const;

describe('bot/main.ts loop wiring', () => {
  it('contains no bare repeating timer', () => {
    const source = mainSource();
    // The vacuity floor: if this file ever stopped resembling main.ts (a rename, a
    // failed read, a comment stripper that ate everything) the assertion below
    // would pass over an empty string and say nothing at all.
    expect(source.length).toBeGreaterThan(5000);
    expect(source).toContain('scheduler.add(');

    expect(source).not.toContain('setInterval');
    // setTimeout too: a hand-rolled chain would re-introduce the debounce and the
    // poll loops beside the scheduler, which is the state this phase removed.
    expect(source).not.toContain('setTimeout');
  });

  it('registers every loop on the scheduler, reading its D13 config field', () => {
    const source = mainSource();
    // Exactly the seven, not "at least": an eighth registration is a loop nobody
    // has reviewed, and a missing one is a loop that silently stopped running.
    expect((source.match(/scheduler\.add\(/g) ?? []).length).toBe(TASKS.length);
    expect(TASKS.length).toBe(7);

    for (const task of TASKS) {
      // The name, its cadence AND its sweep must appear in ONE registration, so a
      // task reading another task's interval, or running another task's sweep,
      // cannot pass by having the strings somewhere in the file.
      const pattern = new RegExp(
        `name: '${task.name}'[\\s\\S]{0,240}?cadence: \\{ activeMs: cfg\\.${task.field}` +
          `[\\s\\S]{0,900}?${task.run}\\(`,
      );
      expect(source).toMatch(pattern);
    }
  });

  it('kicks every task the events are supposed to kick, exactly as often', () => {
    // Found by the Phase 3 QA audit: nothing anywhere pinned the kicks. Deleting
    // the two GUILD_CREATE kicks, or the one on the final member-backfill chunk,
    // left the entire suite green while the reconnect path stopped re-syncing
    // altogether. main() runs at module scope, so a source pin is the only thing
    // available, and it is the same idiom the registrations above use.
    const source = mainSource();
    expect(source.length).toBeGreaterThan(5000);
    for (const kick of KICKS) {
      const found = (source.match(new RegExp(kick.call.replace(/[.()]/g, '\\$&'), 'g')) ?? [])
        .length;
      expect({ call: kick.call, found }).toEqual({ call: kick.call, found: kick.times });
    }
    // And they sit on the events that matter, not merely somewhere in the file.
    expect(source).toMatch(
      /case 'GUILD_CREATE'[\s\S]{0,4000}?roleSyncTask\.kick\(\)[\s\S]{0,80}?memberMetaTask\.kick\(\)/,
    );
    expect(source).toMatch(/chunk_index[\s\S]{0,600}?memberMetaTask\.kick\(\)/);
  });

  it('publishes a successful rename immediately, and re-syncs the diff cache', () => {
    // Two behaviors with no reachable test, both load bearing.
    //
    // The rename push compensates for echo suppression: without it the in-world
    // nameplate keeps the old level for up to a whole role-sync interval, because
    // the GUILD_MEMBER_UPDATE that used to carry it within seconds is now dropped
    // as the bot's own echo.
    //
    // The resync bounds how long the members-meta diff cache may keep believing
    // the server still holds what the bot last pushed. Deleting it re-opens the
    // permanent divergence that dueForFullResync's header enumerates.
    const source = mainSource();
    expect(source).toMatch(/outcome === 'written'[\s\S]{0,80}?pushMemberMeta\(/);
    expect(source).toMatch(/dueForFullResync\([\s\S]{0,200}?lastPushedMeta\.clear\(\)/);
  });

  it('does not let a failed special-roles refresh swallow the meta push', () => {
    // The event paths (GUILD_CREATE, the member backfill) called pushAllMemberMeta
    // DIRECTLY before this phase, with no Discord REST call in front of it.
    // Routing them through the paired task gave them the guild-roles GET as a
    // precondition, and a reconnect storm is exactly when that GET fails. The
    // catch keeps the ordering when the refresh works and publishes the previous
    // index when it does not.
    expect(mainSource()).toMatch(
      /try \{\s*await refreshSpecialRoles\(\);\s*\} catch[\s\S]{0,400}?await pushAllMemberMeta\(\)/,
    );
  });

  it('reads every cadence from cfg, never from the bot/cadence.ts constants', () => {
    // The D13 lever, end to end. bot/config.ts is proven to FILL these fields by
    // tests/discord_bot_config.test.ts; this is the other half, that main.ts
    // actually reads them. Importing the constant here and hard-coding it into a
    // task would type-check and would silently ignore the env override.
    const source = mainSource();
    for (const name of ['ROLE_SYNC_INTERVAL_MS', 'PRESENCE_DEBOUNCE_MS', 'RELAY_POLL_MS']) {
      expect(source).not.toContain(name);
    }
    // And the constants still hold the values the config falls back to, so this
    // file's claim about "the same cadences as before" is anchored to numbers.
    expect(ROLE_SYNC_INTERVAL_MS).toBe(300000);
    expect(PRESENCE_DEBOUNCE_MS).toBe(4000);
    expect(RELAY_POLL_MS).toBe(3000);
  });

  it('starts the tasks BEFORE the gateway connects', () => {
    // A kick on a task that has not started is dropped by design, and the first
    // GUILD_CREATE arrives through a dispatch handler that kicks two of them.
    const source = mainSource();
    const startAll = source.indexOf('scheduler.startAll()');
    const connect = source.indexOf('gateway.connect(');
    expect(startAll).toBeGreaterThan(-1);
    expect(connect).toBeGreaterThan(-1);
    expect(startAll).toBeLessThan(connect);
  });

  it('forgets a member on BOTH paths that clear their stored flair', () => {
    // Found by mutation, round four: deleting either call site survived the whole
    // suite. forgetMember itself is well covered, and what nothing could say was
    // that main.ts still calls it, because main.ts runs main() at module scope
    // and no test can reach inside.
    //
    // A source-text pin is the fallback the loop wiring above already uses for
    // exactly that reason. It is weaker than a behavioral assertion and it is
    // the strongest thing available here: leaving a departed member's last-pushed
    // record behind means a REJOIN is diffed against their pre-departure state,
    // so the push that would restore their flair is suppressed and the game shows
    // them as cleared until the bot restarts. That is invisible in production.
    const source = mainSource();
    expect(source.length).toBeGreaterThan(5000);

    // GUILD_MEMBER_REMOVE: the member left the guild.
    expect(source).toMatch(
      /case 'GUILD_MEMBER_REMOVE'[\s\S]{0,1200}?forgetMember\(nickCaches, lastPushedMeta, userId\)/,
    );
    // The flaired-ids reconcile: the member left while the bot was offline, so
    // their stored flair is cleared by the roster sweep instead.
    expect(source).toMatch(
      /reconcileDepartedMembers[\s\S]{0,1200}?forgetMember\(nickCaches, lastPushedMeta, record\.discord_user_id\)/,
    );
    // Exactly two, so a third clearing path added without forgetting the member
    // (or one of these two quietly dropped) fails here rather than in production.
    expect((source.match(/forgetMember\(/g) ?? []).length).toBe(2);
  });

  it('keeps the presence push on the debounce mode, not a poll loop', () => {
    // The distinction is behavioral: a repeating task would push presence every
    // 4 seconds forever, where a debounce pushes only after an actual event.
    expect(mainSource()).toMatch(
      /name: 'presence-push',[\s\S]{0,120}?mode: 'debounce'[\s\S]{0,120}?cfg\.presenceDebounceMs/,
    );
  });
});
