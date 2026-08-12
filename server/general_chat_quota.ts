import { GENERAL_CHAT_QUOTA_MAX_IN_FLIGHT } from './general_chat_quota_config';
import type { GeneralChatQuotaConsumeResult, GeneralChatRateLimit } from './general_chat_quota_db';

export { GENERAL_CHAT_QUOTA_MAX_IN_FLIGHT } from './general_chat_quota_config';

// The active call is the one account slot. Later sends are refused locally,
// never queued as promises or Postgres waiters.
export const GENERAL_CHAT_QUOTA_MAX_PENDING_PER_ACCOUNT = 1;
export const GENERAL_CHAT_QUOTA_CACHE_MAX_ACCOUNTS = 4_096;
const GENERAL_CHAT_QUOTA_NOTICE_THROTTLE_MS = 5_000;
const GENERAL_CHAT_QUOTA_BUSY_CACHE_MS = 1_000;

export interface OnlineGeneralChat {
  canonicalText: string;
}

/**
 * Classify only the online server's General spellings. In particular, `/g` is
 * guild online even though the offline sim retains it as a General alias.
 */
export function classifyOnlineGeneralChat(
  rawText: string,
  rememberedChannel: string,
): OnlineGeneralChat | null {
  const text = rawText.trim();
  if (!text) return null;
  const explicit = /^\/(?:general|1)\s+([\s\S]+)$/i.exec(text);
  if (explicit) {
    const body = explicit[1].trim();
    return body ? { canonicalText: `/general ${body}` } : null;
  }
  if (text.startsWith('/') || text.startsWith('!') || rememberedChannel !== 'general') return null;
  return { canonicalText: `/general ${text}` };
}

export type GeneralChatQuotaAdmission =
  | { status: 'allowed'; notify: false }
  | { status: 'denied'; retryAfterSeconds: number; notify: boolean }
  | { status: 'busy' | 'error'; notify: boolean };

export interface GeneralChatRateLimitHydration {
  resolve(hydrated: GeneralChatRateLimit | null): GeneralChatRateLimit | null;
  release(): void;
}

interface LivePolicyVersion {
  generation: number;
  policy: GeneralChatRateLimit | null;
}

/**
 * Orders auth-query hydration with cross-process policy notifications without
 * another database read. Entries are LRU-bounded, except that an account with
 * an in-progress auth read is pinned until that read releases its token.
 */
export class GeneralChatRateLimitLiveState {
  readonly #latest = new Map<number, LivePolicyVersion>();
  readonly #pins = new Map<number, number>();
  #generation = 0;

  beginHydration(accountId: number): GeneralChatRateLimitHydration {
    const capturedGeneration = this.#latest.get(accountId)?.generation ?? 0;
    this.#pins.set(accountId, (this.#pins.get(accountId) ?? 0) + 1);
    let released = false;
    return {
      resolve: (hydrated) => {
        const latest = this.#latest.get(accountId);
        return latest && latest.generation !== capturedGeneration ? latest.policy : hydrated;
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

  policyChanged(accountId: number, policy: GeneralChatRateLimit | null): void {
    this.#generation++;
    this.#latest.delete(accountId);
    this.#latest.set(accountId, { generation: this.#generation, policy });
    this.#trim();
  }

  get cachedAccounts(): number {
    return this.#latest.size;
  }

  #trim(): void {
    if (this.#latest.size <= GENERAL_CHAT_QUOTA_CACHE_MAX_ACCOUNTS) return;
    for (const accountId of this.#latest.keys()) {
      if (this.#latest.size <= GENERAL_CHAT_QUOTA_CACHE_MAX_ACCOUNTS) return;
      if (!this.#pins.has(accountId)) this.#latest.delete(accountId);
    }
  }
}

interface LocalRefusal {
  kind: 'denied' | 'unavailable';
  untilMs: number;
}

export interface GeneralChatQuotaCoordinatorDeps {
  consume(accountId: number): Promise<GeneralChatQuotaConsumeResult>;
  now?: () => number;
  maxInFlight?: number;
  observeDbCall?: (
    outcome:
      | GeneralChatQuotaConsumeResult['status']
      | 'acquire_timeout'
      | 'query_timeout'
      | 'error',
    durationSeconds: number,
  ) => void;
}

/**
 * Bounded, account-serialized coordination around the atomic PostgreSQL
 * consume. A second same-account send is refused while the first is pending,
 * so it cannot overtake or create a PostgreSQL waiter; known-unlimited accounts
 * never call `consume`.
 */
export class GeneralChatQuotaCoordinator {
  readonly #consume: GeneralChatQuotaCoordinatorDeps['consume'];
  readonly #now: () => number;
  readonly #observeDbCall: NonNullable<GeneralChatQuotaCoordinatorDeps['observeDbCall']>;
  readonly #maxInFlight: number;
  readonly #pendingByAccount = new Map<number, number>();
  // Only accounts with an active consume can enter this set, so it is bounded by
  // the process-wide in-flight cap rather than by policy edit cardinality.
  readonly #invalidatedPendingAccounts = new Set<number>();
  readonly #localRefusals = new Map<number, LocalRefusal>();
  readonly #lastNoticeAt = new Map<number, number>();
  #inFlight = 0;

  constructor(deps: GeneralChatQuotaCoordinatorDeps) {
    this.#consume = deps.consume;
    this.#now = deps.now ?? Date.now;
    this.#observeDbCall = deps.observeDbCall ?? (() => {});
    this.#maxInFlight = Math.max(
      0,
      Math.min(GENERAL_CHAT_QUOTA_MAX_IN_FLIGHT, Math.floor(deps.maxInFlight ?? 2)),
    );
  }

  get inFlight(): number {
    return this.#inFlight;
  }

  policyChanged(accountId: number): void {
    this.forgetAccount(accountId);
  }

  /** Evict only after the account's last realm session leaves. */
  forgetAccount(accountId: number): void {
    this.#localRefusals.delete(accountId);
    this.#lastNoticeAt.delete(accountId);
    if (this.#pendingByAccount.has(accountId)) this.#invalidatedPendingAccounts.add(accountId);
    else this.#invalidatedPendingAccounts.delete(accountId);
  }

  get cachedAccounts(): number {
    return Math.max(this.#localRefusals.size, this.#lastNoticeAt.size);
  }

  admit(
    accountId: number,
    policy: GeneralChatRateLimit | null,
  ): Promise<GeneralChatQuotaAdmission> {
    if (policy === null) return Promise.resolve({ status: 'allowed', notify: false });

    const cached = this.#cachedRefusal(accountId);
    if (cached) return Promise.resolve(cached);

    const accountPending = this.#pendingByAccount.get(accountId) ?? 0;
    if (
      accountPending >= GENERAL_CHAT_QUOTA_MAX_PENDING_PER_ACCOUNT ||
      this.#inFlight >= this.#maxInFlight
    ) {
      if (this.#invalidatedPendingAccounts.has(accountId)) {
        return Promise.resolve({ status: 'busy', notify: true });
      }
      return Promise.resolve(this.#unavailable(accountId, 'busy'));
    }

    this.#pendingByAccount.set(accountId, accountPending + 1);
    return (async () => {
      this.#inFlight++;
      const startedAt = this.#now();
      try {
        const consumed = await this.#consume(accountId);
        this.#observeDbCall(consumed.status, Math.max(0, this.#now() - startedAt) / 1_000);
        if (consumed.status === 'denied') {
          const retryAfterSeconds = Math.max(1, Math.ceil(consumed.retryAfterSeconds));
          const invalidated = this.#invalidatedPendingAccounts.has(accountId);
          if (!invalidated) {
            this.#rememberRefusal(accountId, {
              kind: 'denied',
              untilMs: this.#now() + retryAfterSeconds * 1_000,
            });
          }
          return {
            status: 'denied',
            retryAfterSeconds,
            notify: invalidated ? true : this.#shouldNotify(accountId),
          } as const;
        }
        return { status: 'allowed', notify: false } as const;
      } catch (error) {
        const phase =
          typeof error === 'object' && error !== null && 'phase' in error
            ? String(error.phase)
            : 'error';
        const outcome = phase === 'acquire_timeout' || phase === 'query_timeout' ? phase : 'error';
        this.#observeDbCall(outcome, Math.max(0, this.#now() - startedAt) / 1_000);
        if (this.#invalidatedPendingAccounts.has(accountId)) {
          return { status: 'error', notify: true } as const;
        }
        return this.#unavailable(accountId, 'error');
      } finally {
        this.#inFlight--;
        const left = (this.#pendingByAccount.get(accountId) ?? 1) - 1;
        if (left > 0) this.#pendingByAccount.set(accountId, left);
        else {
          this.#pendingByAccount.delete(accountId);
          this.#invalidatedPendingAccounts.delete(accountId);
        }
      }
    })();
  }

  #cachedRefusal(accountId: number): GeneralChatQuotaAdmission | null {
    const cached = this.#localRefusals.get(accountId);
    if (!cached) return null;
    const remainingMs = cached.untilMs - this.#now();
    if (remainingMs <= 0) {
      this.#localRefusals.delete(accountId);
      return null;
    }
    if (cached.kind === 'denied') {
      return {
        status: 'denied',
        retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1_000)),
        notify: this.#shouldNotify(accountId),
      };
    }
    return { status: 'busy', notify: this.#shouldNotify(accountId) };
  }

  #unavailable(accountId: number, status: 'busy' | 'error'): GeneralChatQuotaAdmission {
    this.#rememberRefusal(accountId, {
      kind: 'unavailable',
      untilMs: this.#now() + GENERAL_CHAT_QUOTA_BUSY_CACHE_MS,
    });
    return { status, notify: this.#shouldNotify(accountId) };
  }

  #shouldNotify(accountId: number): boolean {
    const now = this.#now();
    const last = this.#lastNoticeAt.get(accountId);
    if (last !== undefined && now - last < GENERAL_CHAT_QUOTA_NOTICE_THROTTLE_MS) return false;
    this.#lastNoticeAt.delete(accountId);
    this.#lastNoticeAt.set(accountId, now);
    this.#trim(this.#lastNoticeAt);
    return true;
  }

  #rememberRefusal(accountId: number, refusal: LocalRefusal): void {
    this.#localRefusals.delete(accountId);
    this.#localRefusals.set(accountId, refusal);
    this.#trim(this.#localRefusals);
  }

  #trim<T>(map: Map<number, T>): void {
    while (map.size > GENERAL_CHAT_QUOTA_CACHE_MAX_ACCOUNTS) {
      const oldest = map.keys().next().value;
      if (oldest === undefined) return;
      map.delete(oldest);
    }
  }
}
