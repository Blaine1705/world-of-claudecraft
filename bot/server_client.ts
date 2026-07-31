// Client for the game server's secret-gated /internal/discord/* endpoints. The
// bot reads flex/role data and pushes presence + reward grants; it authenticates
// with the shared DISCORD_BOT_SECRET (x-woc-discord-secret), NOT a user bearer.
import type { ActivityItem, DailyRewardWinnersDay, FlexData, RelayItem } from './logic';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

export interface RolesData {
  linked: boolean;
  statusTier: number;
  points: number;
  lifetimePoints: number;
}

export interface VoiceMemberPush {
  id: string;
  name: string;
  speaking: boolean;
  selfMute: boolean;
}

/**
 * How long one server call may run before its AbortController fires. Named
 * rather than inline so the suite can pin the deadline against a literal.
 */
export const SERVER_CALL_TIMEOUT_MS = 8000;

/** What a TimerSeam hands back. Opaque: only ever passed back to clearTimeout. */
export type TimerHandle = ReturnType<typeof setTimeout> | number;

/** The timer pair backing the per-call deadline. */
export interface TimerSeam {
  setTimeout: (fn: () => void, ms: number) => TimerHandle;
  clearTimeout: (handle: TimerHandle) => void;
}

export class ServerClient {
  // `fetch` and the deadline timer pair are trailing constructor parameters with
  // their production defaults, so a test can drive the whole request/response
  // envelope with no network IO and fire the abort deadline without a real 8
  // second wait. Constructed with a base URL and a secret alone, as main.ts
  // does, this is exactly the production client.
  constructor(
    private baseUrl: string,
    private secret: string,
    private fetchImpl: typeof fetch = (...args) => fetch(...args),
    private timers: TimerSeam = {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (handle) => clearTimeout(handle),
    },
  ) {}

  private async call<T>(method: string, path: string, body?: unknown): Promise<T | null> {
    const controller = new AbortController();
    const timer = this.timers.setTimeout(() => controller.abort(), SERVER_CALL_TIMEOUT_MS);
    try {
      const resp = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'x-woc-discord-secret': this.secret,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      if (!resp.ok) {
        console.error(`[bot] server ${method} ${path} -> ${resp.status}`);
        return null;
      }
      const env = (await resp.json()) as Envelope<T>;
      return env.success ? env.data : null;
    } catch (err) {
      console.error(`[bot] server ${method} ${path} failed`, err);
      return null;
    } finally {
      this.timers.clearTimeout(timer);
    }
  }

  flex(discordUserId: string): Promise<(FlexData & { linked: boolean }) | null> {
    return this.call(
      'GET',
      `/internal/discord/flex?discord_user_id=${encodeURIComponent(discordUserId)}`,
    );
  }

  roles(discordUserId: string): Promise<RolesData | null> {
    return this.call(
      'GET',
      `/internal/discord/roles?discord_user_id=${encodeURIComponent(discordUserId)}`,
    );
  }

  pushPresence(snapshot: {
    onlineCount: number;
    memberTotal: number;
    voiceChannelName: string | null;
    voice: VoiceMemberPush[];
  }): Promise<unknown> {
    return this.call('POST', '/internal/discord/presence', snapshot);
  }

  grant(
    discordUserId: string,
    reason: string,
    points: number,
    dedupeKey?: string,
  ): Promise<unknown> {
    return this.call('POST', '/internal/discord/grant', {
      discord_user_id: discordUserId,
      reason,
      points,
      dedupeKey,
    });
  }

  setMember(discordUserId: string, guildMember: boolean): Promise<unknown> {
    return this.call('POST', '/internal/discord/member', {
      discord_user_id: discordUserId,
      guildMember,
    });
  }

  /** Drain queued in-game "!" community posts for delivery to Discord. */
  async drainRelay(): Promise<RelayItem[]> {
    const data = await this.call<{ items: RelayItem[] }>('GET', '/internal/discord/relay');
    return data?.items ?? [];
  }

  /** Drain the significant-activity feed (level-ups, rare drops, duels, arena). */
  async drainActivity(): Promise<ActivityItem[]> {
    const data = await this.call<{ items: ActivityItem[] }>('GET', '/internal/discord/activity');
    return data?.items ?? [];
  }

  async dailyRewardWinners(): Promise<DailyRewardWinnersDay[]> {
    const data = await this.call<{ days: DailyRewardWinnersDay[] }>(
      'GET',
      '/internal/discord/daily-rewards-winners?limit=2',
    );
    return data?.days ?? [];
  }

  markDailyRewardWinners(day: string): Promise<unknown> {
    return this.call('POST', '/internal/discord/daily-rewards-winners/mark', { day });
  }

  /** Push guild metadata (nickname + server join date + top special role). */
  async pushMembersMeta(
    members: {
      discord_user_id: string;
      name: string | null;
      joinedAtMs: number | null;
      role: string | null;
    }[],
  ): Promise<unknown> {
    const data = await this.call<{ updated: number }>('POST', '/internal/discord/members-meta', {
      members,
    });
    // The server coerces an over-cap request body to an EMPTY member list and
    // answers 200 { updated: 0 }, so a zero on a non-empty push is the one
    // silent-drop signature worth surfacing (the batch sizing in logic.ts is
    // built to make this unreachable).
    //
    // It is reported as a FAILURE (null), not just logged. Callers now diff
    // against the last successfully pushed record, so "the request did not
    // throw" is no longer a good enough success signal: returning the truthy
    // `{ updated: 0 }` here would let a caller mark a batch clean that the
    // server demonstrably dropped, and the diff would then suppress the retry
    // for the life of the process rather than for one sweep.
    if (data && members.length > 0 && data.updated === 0) {
      console.error(`[bot] members-meta push of ${members.length} processed 0 rows`);
      return null;
    }
    return data;
  }

  /**
   * The discord ids whose stored link still carries guild membership or a
   * special-role key, for the departed-member reconcile. Null when the server
   * is unreachable or the payload is malformed; the caller MUST treat null as
   * "change nothing" (an empty ARRAY is a real "nothing flagged" answer).
   */
  async flairedIds(): Promise<string[] | null> {
    const data = await this.call<{ ids: unknown }>('GET', '/internal/discord/flaired-ids');
    if (!data || !Array.isArray(data.ids)) return null;
    return data.ids.filter((x): x is string => typeof x === 'string');
  }
}
