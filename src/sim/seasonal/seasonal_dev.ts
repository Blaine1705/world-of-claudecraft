// /dev season: open or close a seasonal event by hand for a playtest or a
// screenshot (ALLOW_DEV_COMMANDS only: handleDevChat is reached through the
// ctx.devCommands gate like every /dev branch, so none of this exists in
// production). It moves only the dev override on the world's seasonal state; the
// host calendar keeps feeding underneath and `auto` hands control back to it.
//
//   /dev season                 what is running and why
//   /dev season on [event]      force an event open (default: Gourdlight Eve)
//   /dev season off             force every event closed
//   /dev season auto            follow the host calendar again
//   /dev season knocks          forget today's trick-or-treat knocks (and frights)
//   /dev season daily [pick]    the rotating daily: show today's, or pick one by its
//                               number (1-6) or id, `next` to step on, `auto` to follow
//                               the reset day again, `reset` to clear today's turn-ins
//                               (the rounds and the dailies) so they can be redone.
//                               The pick is world state: on a server it changes the
//                               day's errand for every player on the realm.
import { GOURDLIGHT_EVE_ID, GOURDLIGHT_ROUNDS_QUEST_ID } from '../content/gourdlight_eve';
import { GOURDLIGHT_DAILY_POOL } from '../content/gourdlight_eve_dailies';
import { weeklyQuestLockoutId } from '../quests/weekly_quest_lock';
import type { SimContext } from '../sim_context';
import { gourdlightDailyToday } from './gourdlight_dailies';
import { activeSeasonalEventOf } from './seasonal_state';
import { KNOWN_SEASONAL_EVENTS } from './seasonal_tick';

const USAGE =
  '[dev] Usage: /dev season [on [event]|off|auto|knocks|daily [1-6|id|next|auto|reset]].';

function handleDailyDev(ctx: SimContext, arg: string, pid: number): void {
  const log = (text: string) => ctx.emit({ type: 'log', text, pid });
  const state = ctx.seasonal;
  const pool = GOURDLIGHT_DAILY_POOL;
  const today = () => gourdlightDailyToday(ctx.resetDay, state.devDaily);
  if (arg === 'reset') {
    const meta = ctx.players.get(pid);
    if (meta) {
      for (const id of [GOURDLIGHT_ROUNDS_QUEST_ID, ...pool]) {
        meta.questsDone.delete(id);
        meta.raidLockouts.delete(weeklyQuestLockoutId(id));
      }
      meta.wireRev++;
    }
    log("[dev] Today's Gourdlight turn-ins cleared: the rounds and the dailies can be redone.");
    return;
  }
  if (arg === 'auto') state.devDaily = null;
  else if (arg === 'next') state.devDaily = pool[(pool.indexOf(today()) + 1) % pool.length];
  else if (/^[1-9]$/.test(arg) && Number(arg) <= pool.length)
    state.devDaily = pool[Number(arg) - 1];
  else if (pool.includes(arg)) state.devDaily = arg;
  else if (arg !== '') {
    ctx.error(
      pid,
      `[dev] Unknown daily. Pool: ${pool.map((id, i) => `${i + 1} ${id}`).join(', ')}.`,
    );
    return;
  }
  const source = state.devDaily !== null ? 'dev pick' : `reset day ${ctx.resetDay || 'none'}`;
  log(`[dev] Gourdlight daily today: ${today()} (${source}).`);
}

/** True when the line was a /dev season command (handled or refused). */
export function handleSeasonalDevChat(ctx: SimContext, raw: string, pid: number): boolean {
  const m = /^\/dev\s+season(?:\s+(\S+))?(?:\s+(\S+))?\s*$/i.exec(raw);
  if (!m) return false;
  const verb = (m[1] ?? '').toLowerCase();
  const log = (text: string) => ctx.emit({ type: 'log', text, pid });
  const state = ctx.seasonal;
  if (verb === '') {
    const active = activeSeasonalEventOf(state);
    const source = state.devOverride !== undefined ? 'the dev override' : 'the host calendar';
    log(
      `[dev] Seasonal event: ${active ?? 'none'} (from ${source}; host says ${state.hostEventId ?? 'none'}).`,
    );
    return true;
  }
  if (verb === 'on') {
    const eventId = (m[2] ?? GOURDLIGHT_EVE_ID).toLowerCase();
    if (!KNOWN_SEASONAL_EVENTS.includes(eventId)) {
      ctx.error(pid, `[dev] Unknown seasonal event. Known: ${KNOWN_SEASONAL_EVENTS.join(', ')}.`);
      return true;
    }
    state.devOverride = eventId;
    log(`[dev] Seasonal event forced open: ${eventId}. /dev season auto restores the calendar.`);
    return true;
  }
  if (verb === 'off') {
    state.devOverride = null;
    log('[dev] Every seasonal event forced closed. /dev season auto restores the calendar.');
    return true;
  }
  if (verb === 'auto') {
    state.devOverride = undefined;
    log(`[dev] Seasonal events follow the host calendar again (${state.hostEventId ?? 'none'}).`);
    return true;
  }
  if (verb === 'daily') {
    handleDailyDev(ctx, (m[2] ?? '').toLowerCase(), pid);
    return true;
  }
  if (verb === 'knocks') {
    const meta = ctx.players.get(pid);
    if (meta) {
      meta.seasonalKnocked.clear();
      meta.wireRev++;
    }
    log("[dev] Today's trick-or-treat knocks forgotten.");
    return true;
  }
  ctx.error(pid, USAGE);
  return true;
}
