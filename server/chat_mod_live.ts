// mutedUntil is ISO-or-null, the same shape server/db.ts's AccountChatMuteStatus/
// AccountModerationStatus already read: resolve() never compares mutedUntil
// values (it orders on generation alone), so there is no reason to convert it
// to an epoch and risk reformatting the string a resume that needed no live
// override would otherwise pass straight through untouched.
export interface ChatModerationState {
  mutedUntil: string | null;
  reason: string;
  strikes: number;
}

export interface ChatModerationHydration {
  resolve(hydrated: ChatModerationState): ChatModerationState;
  release(): void;
}

// A session-shaped source for pushChatModerationChange: whatever currently
// holds the three live fields (ClientSession satisfies this structurally).
export interface ChatModerationSource {
  accountId: number;
  chatMutedUntil: number | null;
  chatMuteReason: string;
  chatStrikes: number;
}

/**
 * Records a session's current mute/reason/strikes as its account's latest
 * live chat-moderation push, so a reconnect hydration in flight right now
 * (GameServer.beginChatModerationHydration) resolves to this write instead
 * of the stale DB snapshot it started reading before this landed.
 */
export function pushChatModerationChange(
  liveState: ChatModerationLiveState,
  session: ChatModerationSource,
): void {
  liveState.changed(session.accountId, {
    mutedUntil:
      session.chatMutedUntil !== null ? new Date(session.chatMutedUntil).toISOString() : null,
    reason: session.chatMuteReason,
    strikes: session.chatStrikes,
  });
}

interface LiveModerationVersion {
  generation: number;
  state: ChatModerationState;
}

// Bounded like the sibling cache below; an in-progress hydration stays pinned
// past this bound so a resolve() mid-scan never loses the push it exists to
// catch.
const CHAT_MODERATION_CACHE_MAX_ACCOUNTS = 4_096;

/**
 * Orders the reconnect handshake's account chat-moderation DB read (mute,
 * reason, strikes) with a live push landing during that SAME handshake,
 * without a second database read. Mirrors GeneralChatRateLimitLiveState
 * (server/general_chat_quota.ts), the pattern that already solves this exact
 * TOCTOU shape for the sibling per-account chat control: without it, a
 * snapshot read at handshake start can lose a mute, unmute, or strike change
 * (an admin action, or the chat filter's own optimistic set) that lands on
 * the SAME still-linkdead session before that snapshot resolves, silently
 * un-enforcing (or under-escalating) a live sanction on resume.
 *
 * A handshake that captures no concurrent push trusts its own DB read
 * completely: that is what keeps a mute/unmute/reset issued through a
 * DIFFERENT realm process self-healing on the next resume (accounts.chat_
 * muted_until and chat_strikes are account-wide, but a live push here only
 * ever reaches THIS process's sessions, so there is nothing live to prefer
 * over a fresh read from a handshake this process never pushed to).
 */
export class ChatModerationLiveState {
  readonly #latest = new Map<number, LiveModerationVersion>();
  readonly #pins = new Map<number, number>();
  #generation = 0;

  beginHydration(accountId: number): ChatModerationHydration {
    const capturedGeneration = this.#latest.get(accountId)?.generation ?? 0;
    this.#pins.set(accountId, (this.#pins.get(accountId) ?? 0) + 1);
    let released = false;
    return {
      resolve: (hydrated) => {
        const latest = this.#latest.get(accountId);
        return latest && latest.generation !== capturedGeneration ? latest.state : hydrated;
      },
      release: () => {
        if (released) return;
        released = true;
        const left = (this.#pins.get(accountId) ?? 1) - 1;
        if (left > 0) this.#pins.set(accountId, left);
        else this.#pins.delete(accountId);
        this.#trim();
      },
    };
  }

  changed(accountId: number, state: ChatModerationState): void {
    this.#generation++;
    this.#latest.delete(accountId);
    this.#latest.set(accountId, { generation: this.#generation, state });
    this.#trim();
  }

  get cachedAccounts(): number {
    return this.#latest.size;
  }

  #trim(): void {
    if (this.#latest.size <= CHAT_MODERATION_CACHE_MAX_ACCOUNTS) return;
    for (const accountId of this.#latest.keys()) {
      if (this.#latest.size <= CHAT_MODERATION_CACHE_MAX_ACCOUNTS) return;
      if (!this.#pins.has(accountId)) this.#latest.delete(accountId);
    }
  }
}
