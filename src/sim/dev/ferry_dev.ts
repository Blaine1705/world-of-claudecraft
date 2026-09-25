// /dev ferry: skip the ferry timetable's waits for a playtest or a screenshot
// (ALLOW_DEV_COMMANDS only: handleDevChat is reached through the
// ctx.devCommands gate like every /dev branch). It moves only the dev-only
// schedule offset (ctx.transportClockOffset), never sim time, so the ship,
// its passengers and the deck gates all follow the same jumped clock.
//
//   /dev ferry            where the ferry is and what comes next
//   /dev ferry depart     3 seconds before the next departure
//   /dev ferry skip       1 second before the next phase change
//   /dev ferry at <s>     the cycle position <s> seconds after the Eastbrook
//                         boarding window opens (0 .. one cycle)
//   /dev ferry board      onto the ship's waist deck, wherever it is (a
//                         voyage in progress included)
//
// A jump carries whoever stands aboard to the same deck spot at the ship's
// new pose (transport_ferry.ts carryPassengersAcrossClockJump), so skipping
// ahead mid-voyage keeps its passengers on deck.

import { TRANSPORT_ROUTES } from '../content/transport_ships';
import type { SimContext } from '../sim_context';
import { settleTeleportArrival } from '../teleport_arrival';
import {
  carryPassengersAcrossClockJump,
  ferryBoardingSpot,
  transportClock,
} from '../transport_ferry';
import { transportCycleSeconds, transportPhaseAt } from '../transport_schedule';
import { displacePlayerForDev } from './dev_displace';

/** Seconds from `clock` to the start of the next phase of the given kind
 *  (any kind when `phase` is omitted), scanning at most two cycles. */
function secondsToNextPhase(clock: number, phase?: string): number | null {
  const route = TRANSPORT_ROUTES[0];
  if (!route) return null;
  let t = clock;
  let cur = transportPhaseAt(route, t);
  const limit = clock + 2 * transportCycleSeconds(route);
  while (t < limit) {
    t += cur.remaining + 1e-6;
    const next = transportPhaseAt(route, t);
    if (next.phase !== cur.phase && (phase === undefined || next.phase === phase)) {
      return t - clock;
    }
    cur = next;
  }
  return null;
}

function status(ctx: SimContext): string {
  const route = TRANSPORT_ROUTES[0];
  const s = transportPhaseAt(route, transportClock(ctx));
  const berth = route.berths[s.berth].id;
  return `[dev] Ferry: ${s.phase} (${berth}), ${s.remaining.toFixed(1)}s left in this phase.`;
}

/** Put a player on the ship's waist deck wherever it is (dev only). */
function boardForDev(ctx: SimContext, pid: number): void {
  const spot = ferryBoardingSpot(ctx);
  const p = ctx.entities.get(pid);
  if (!spot || !p) return;
  displacePlayerForDev(ctx, p, spot.x, spot.z);
  p.pos.y = spot.y;
  p.prevPos = { ...p.pos };
  settleTeleportArrival(p);
}

/** Handle a /dev ferry line; true when it was one (the caller returns). */
export function handleFerryDevChat(ctx: SimContext, raw: string, pid: number): boolean {
  const m =
    /^\/(?:dev\s+ferry|devferry)(?:\s+(depart|skip|at|board)(?:\s+(-?\d+(?:\.\d+)?))?)?\s*$/i.exec(
      raw,
    );
  if (!m) return false;
  const route = TRANSPORT_ROUTES[0];
  if (!route) return true;
  const verb = m[1]?.toLowerCase();
  const clock = transportClock(ctx);
  if (verb === 'depart' || verb === 'skip') {
    const until = secondsToNextPhase(clock, verb === 'depart' ? 'sailing' : undefined);
    if (until !== null) ctx.transportClockOffset += until - (verb === 'depart' ? 3 : 1);
  } else if (verb === 'at') {
    const cycle = transportCycleSeconds(route);
    const want = Math.min(cycle, Math.max(0, Number(m[2] ?? 0)));
    ctx.transportClockOffset = want - ctx.time;
  } else if (verb === 'board') {
    boardForDev(ctx, pid);
  }
  if (transportClock(ctx) !== clock) carryPassengersAcrossClockJump(ctx, clock);
  ctx.emit({ type: 'log', text: status(ctx), pid });
  return true;
}
