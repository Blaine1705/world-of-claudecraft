// The consolidated outbox poll: the bot's ONE periodic pickup from the game
// server, and every decision it makes.
//
// It replaces three separate poll loops (relay, activity feed, daily-rewards
// winners), each with its own timer and its own request, plus the flex re-read
// the sweep used to do. Those four requests every three seconds were the bot's
// whole steady-state cost against a server that, in a quiet minute, had nothing
// to say in any of them; one request answers all four streams at once and
// carries the link-change feed that tells the sweep who actually moved.
//
// Written as a module rather than in main.ts for the reason every other
// extracted piece is (ledger L8): main.ts calls main() at module scope, so
// nothing inside it is reachable from a test. Everything here is decided over an
// injected IO seam, the member_writes.ts pattern, so the ordering rules below
// (announce before mark, per-item isolation, the breaker gate) are unit-tested
// with no network, no Discord token and no clock. main.ts binds the seam and
// registers the task; it decides nothing.

import {
  type ActivityItem,
  buildActivityMessage,
  buildDailyRewardWinnersMessage,
  buildRelayMessage,
  type DailyRewardWinnersDay,
  type RelayItem,
} from './logic';
import type { BreakerState } from './rate_governor';
import type { OutboxEnvelope, OutboxLinkChangeItem } from './server_client';

/**
 * Thrown by a post whose target channel id is not configured.
 *
 * It is an ERROR rather than a silent success because of what the winners stream
 * does with success: a day is marked announced on the server only when its post
 * landed, and "there was nowhere to post it" must never mark it. Reported once
 * per channel by the factory (onMissingChannel) and then deliberately NOT passed
 * to onError, so a deployment that never set a channel logs one line rather than
 * one every poll for the life of the process.
 */
export class OutboxChannelUnsetError extends Error {
  readonly channel: string;
  constructor(channel: string) {
    super(`[bot] outbox channel ${channel} is not configured`);
    this.name = 'OutboxChannelUnsetError';
    this.channel = channel;
  }
}

/** Everything one poll needs from the outside world. */
export interface OutboxIo {
  /** The rate governor's breaker, read fresh per run (see the gate in runOutboxPoll). */
  breakerState: () => BreakerState;
  /** One poll. Null is a FAILED poll: the server preserved every stream. */
  drain: () => Promise<OutboxEnvelope | null>;
  /** Rejects on a failed post, the way the Discord shell already behaves. */
  postRelay: (item: RelayItem) => Promise<unknown>;
  postActivity: (item: ActivityItem) => Promise<unknown>;
  postWinnersDay: (day: DailyRewardWinnersDay) => Promise<unknown>;
  /**
   * Mark a day announced. Answers nullish for a failed call rather than
   * rejecting, matching ServerClient, so the RETURN VALUE is the failure signal.
   */
  markWinnersDay: (day: string) => Promise<unknown>;
  /** Pure: the sweep's belief update. Cannot fail, so it is not wrapped. */
  applyLinkChanges: (items: readonly OutboxLinkChangeItem[]) => void;
  onError?: (error: unknown, where: string) => void;
}

/** Which channel id each stream posts to. */
export interface OutboxChannels {
  relay: string;
  activity: string;
  dailyRewards: string;
}

export interface OutboxIoOptions {
  createMessage: (channelId: string, payload: Record<string, unknown>) => Promise<unknown>;
  markDailyRewardWinners: (day: string) => Promise<unknown>;
  channels: OutboxChannels;
  /** Public game URL, for the relay embed's respond deep link. */
  gameUrl: string;
  breakerState: () => BreakerState;
  drain: () => Promise<OutboxEnvelope | null>;
  applyLinkChanges: (items: readonly OutboxLinkChangeItem[]) => void;
  onError?: (error: unknown, where: string) => void;
  /** Called AT MOST ONCE per unset channel, the first time it is needed. */
  onMissingChannel?: (channel: keyof OutboxChannels) => void;
}

/**
 * Bind the channel routing and the message builders.
 *
 * This lives here rather than in main.ts because the pairing is exactly the
 * thing a test has to be able to state: which builder shapes each stream, and
 * which channel id it is sent to. Wired inline at the registration, a swap
 * (relay items posted to the activity channel, or shaped by the activity
 * builder) would type-check, deploy, and be invisible to every assertion.
 */
export function outboxIoFor(options: OutboxIoOptions): OutboxIo {
  const reported = new Set<string>();
  const post = async (
    channel: keyof OutboxChannels,
    payload: Record<string, unknown>,
  ): Promise<void> => {
    const channelId = options.channels[channel];
    if (!channelId) {
      if (!reported.has(channel)) {
        reported.add(channel);
        options.onMissingChannel?.(channel);
      }
      throw new OutboxChannelUnsetError(channel);
    }
    await options.createMessage(channelId, payload);
  };
  return {
    breakerState: options.breakerState,
    drain: options.drain,
    postRelay: (item) => post('relay', buildRelayMessage(item, options.gameUrl)),
    postActivity: (item) => post('activity', buildActivityMessage(item)),
    postWinnersDay: (day) => post('dailyRewards', buildDailyRewardWinnersMessage(day)),
    markWinnersDay: (day) => options.markDailyRewardWinners(day),
    applyLinkChanges: options.applyLinkChanges,
    onError: options.onError,
  };
}

/**
 * The list a stream carries, tolerating a payload that omits it.
 *
 * The types say all four streams are present, and they describe what THIS
 * server sends. A poll answered by an older build, or by a proxy that trimmed
 * the body, would otherwise throw inside the loop, and by then the drain has
 * already consumed everything the server had.
 */
function listOf<T>(list: readonly T[] | undefined): readonly T[] {
  return Array.isArray(list) ? list : [];
}

/**
 * Whether a server call failed. ServerClient answers null rather than throwing,
 * and a success envelope carrying no data comes back as `undefined`, so both
 * nullish shapes count (the reasoning `pushRejected` in member_writes.ts spells
 * out for the members-meta push).
 */
function callFailed(result: unknown): boolean {
  return result === null || result === undefined;
}

/**
 * One poll: drain, fan the four streams out, and report whether there was work.
 *
 * The return value is the scheduler's didWork signal, so it decides the cadence:
 * true holds the fast active interval while a backlog exists, false lets each
 * empty run decay the delay toward idle. The signal is split by stream class:
 *
 * - The three DRAINED streams (relay, activity, link changes) count by
 *   CARRIAGE, not post outcome: the drain consumed them, so fifty relay items
 *   with every post refused still means a backlog existed, and backing off
 *   then would be exactly backwards.
 * - The winners stream counts by PROGRESS (a day successfully announced). It is
 *   a re-served READ, not a drained queue: the server answers the same
 *   unannounced day on every poll until a mark lands, so counting it by
 *   carriage would let a day that can never be posted (an unset channel, a
 *   durable 403) hold the fast cadence forever, for every stream at once now
 *   that this is the one loop. Found by the Phase 6 QA gate.
 */
export async function runOutboxPoll(io: OutboxIo): Promise<boolean> {
  // THE BREAKER GATE, and it is the reason this returns before the drain rather
  // than after it. Relay posts, activity cards and winner announcements are all
  // non-essential createMessage calls, which the governor REFUSES while the
  // breaker is open or half-open. Draining then would pull items out of the
  // server's queues (a 200 is the only acknowledgement the outbox has) and feed
  // them straight into refusals: ledger item L9's loss window. Skipping the
  // drain leaves them server-side, where the contract preserves them.
  //
  // It cannot deadlock recovery. The half-open probe is supplied by the sweep's
  // own cheap refused attempts, which keep running on their own task, so the
  // breaker still closes with this loop asleep.
  if (io.breakerState() !== 'closed') return false;

  const envelope = await io.drain();
  // A failed poll: the server preserved every stream, so this costs one cycle of
  // latency and nothing else. Counted as no work, so a server that is refusing
  // sees the cadence decay instead of a retry every three seconds.
  if (envelope === null) return false;

  const streams = envelope as Partial<OutboxEnvelope>;
  const relayItems = listOf(streams.relay?.items);
  const activityItems = listOf(streams.activity?.items);
  const winnerDays = listOf(streams.winners?.days);
  const linkChanges = listOf(streams.linkChanges?.items);
  const consumedWork = relayItems.length > 0 || activityItems.length > 0 || linkChanges.length > 0;

  const report = (error: unknown, where: string): void => {
    // The unset-channel case has already been reported once by the factory;
    // passing it on would log it again every poll forever.
    if (error instanceof OutboxChannelUnsetError) return;
    io.onError?.(error, where);
  };

  // Sequential, and each post in its own catch. Sequential because the governor
  // paces these anyway and a burst of parallel posts would only queue deeper;
  // per item because one refusal (an open breaker mid-run, a 403 on one channel)
  // must cost that item and not the rest of the drain, which is already consumed
  // and cannot be handed back.
  for (const item of relayItems) {
    try {
      await io.postRelay(item);
    } catch (error) {
      report(error, 'relay');
    }
  }
  for (const item of activityItems) {
    try {
      await io.postActivity(item);
    } catch (error) {
      report(error, 'activity');
    }
  }
  // ANNOUNCE THEN MARK, in that order and never the other way. The day stays
  // unannounced server-side until the mark lands, which is what makes the stream
  // at-least-once: a failed post leaves it to be re-served next poll. Marking
  // first would make it at-most-once, and the day nobody saw would be gone.
  let winnersProgress = false;
  for (const day of winnerDays) {
    let announced = false;
    try {
      await io.postWinnersDay(day);
      announced = true;
      // Progress is the ANNOUNCE, whatever the mark below does: a posted day is
      // real work even if it will be re-served, while a day that cannot post at
      // all must not hold the cadence (see the didWork split above).
      winnersProgress = true;
    } catch (error) {
      report(error, 'winners');
    }
    if (!announced) continue;
    // A failed MARK is not retried in this run: the request that would retry it
    // is the same request that just failed, and the day is re-served next poll
    // anyway. The cost is a duplicate announcement, which the at-least-once
    // contract already accepts; the cost of retrying here is a tight loop
    // against a server that has already refused.
    //
    // Caught as well as result-checked, even though the client this is wired to
    // answers nullish rather than rejecting. An escaping throw would skip the
    // link-change apply below, and that stream is the one thing here the server
    // does NOT re-serve: it is drained, so the beliefs it carries would be lost.
    try {
      if (callFailed(await io.markWinnersDay(day.day))) {
        report(new Error(`day ${day.day} was posted but not marked`), 'winners-mark');
      }
    } catch (error) {
      report(error, 'winners-mark');
    }
  }
  // Last, and outside any catch: it is a pure in-memory belief update over the
  // sweep, so it cannot fail, and it runs whatever the posts above did.
  io.applyLinkChanges(linkChanges);
  return consumedWork || winnersProgress;
}
