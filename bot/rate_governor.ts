// Discord rate-limit governor: the one place every Discord REST call is paced.
//
// Pure and IO-free by construction. It opens no socket, reads no wall clock, and
// sleeps on nothing of its own: time arrives through the injected GovernorClock,
// the request itself is a callback the caller supplies, and log lines go to an
// injected sink. That is what makes Discord's whole rate-limit contract provable
// in a unit test against a synthetic clock instead of observable only in
// production.
//
// What it enforces (state.md D2, D3, D4):
//  - per-bucket serialized FIFO queues, keyed provisionally by method plus route
//    template plus major parameter, with the rate state remapped onto Discord's
//    own X-RateLimit-Bucket hash so two provisional keys that turn out to be one
//    real bucket never double count it;
//  - proactive gating: a bucket whose last response reported Remaining 0 waits
//    out its Reset-After before anything else in that bucket dispatches;
//  - a global send-rate cap well under Discord's ceiling;
//  - a process-wide pause on any global-scope 429 honoring the FULL retry_after
//    with no ceiling, and a much longer ban pause when a 429 body is not JSON at
//    all, which is how Cloudflare answers once it has started banning;
//  - an invalid-request circuit breaker over a rolling window, opening far below
//    Discord's own ban threshold;
//  - a permanent-failure cache, so a member that answers 401 or 403 is not
//    retried on every sweep.
//
// Every numeric limit here comes from a response header or from configuration.
// There are deliberately no per-route rate constants: Discord's per-route limits
// are runtime-discoverable only, so hard-coding one would be a guess that goes
// stale silently.

/** Injected time. `now` is milliseconds on an arbitrary but monotonic origin. */
export interface GovernorClock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export type RateLimitScope = 'user' | 'global' | 'shared' | 'unknown';

export type BreakerState = 'closed' | 'open' | 'half-open';

export type GovernorLogLevel = 'warn' | 'error';

/** Structured log sink. Values are already safe to print (never a credential). */
export type GovernorLog = (
  level: GovernorLogLevel,
  message: string,
  fields: Record<string, string | number>,
) => void;

/**
 * One Discord response, normalized by the IO shell. The shell reads the body at
 * most once and reports whether it parsed as JSON, because "the body was not
 * JSON" is itself the signal that distinguishes a Cloudflare ban page from a
 * normal Discord 429.
 */
export interface GovernorResponse {
  status: number;
  /** Header lookup by LOWERCASE name. */
  headers: Readonly<Record<string, string>>;
  /** Parsed body when `jsonParsed`; otherwise meaningless. */
  json?: unknown;
  jsonParsed: boolean;
}

export interface GovernorRequest {
  method: string;
  /** Request path below the API base, for example `/guilds/1/members/2`. */
  path: string;
  /**
   * Identity for the permanent-failure cache (D4), typically a guild plus member
   * pair. Omit for calls that are not about one member.
   */
  subjectKey?: string;
  /**
   * Essential traffic keeps flowing while the breaker is open. Sweeps and other
   * background writes must leave this false so they are what stops first.
   */
  essential?: boolean;
}

/** Performs the actual request. The governor never constructs one itself. */
export type GovernorSend = () => Promise<GovernorResponse>;

export interface RateGovernorOptions {
  clock: GovernorClock;
  /** Global send-rate ceiling in requests per second. */
  maxRps: number;
  /** Process-wide pause after a 429 whose body is not JSON. */
  banPauseMs: number;
  /** Counted invalid responses in one window that open the breaker. */
  breakerLimit: number;
  /** How long a 401 or 403 for a subject is remembered. */
  forbiddenTtlMs: number;
  log?: GovernorLog;
}

export interface GovernorCounters {
  /** Requests actually handed to the send callback, retries included. */
  requests: number;
  /** 429 responses observed. */
  rateLimited: number;
  rateLimitedByScope: Record<RateLimitScope, number>;
  /** Times a global-scope 429 started a process-wide pause. */
  globalPauses: number;
  /** Times a non-JSON 429 body started the longer ban pause. */
  banPauses: number;
  breakerState: BreakerState;
  /** Transitions into the open state, half-open probe failures included. */
  breakerOpens: number;
  /** Requests currently waiting in a bucket queue. */
  queueDepth: number;
  /** Buckets with live rate state. */
  trackedBuckets: number;
  /** Route templates with a learned bucket hash. */
  trackedRoutes: number;
  /** Route templates with a live queue. A drained queue is dropped. */
  activeQueues: number;
  /** Subjects currently in the permanent-failure cache. */
  forbiddenEntries: number;
  /** Requests refused outright because their subject was cached as forbidden. */
  forbiddenBlocks: number;
  /** Requests refused outright because the breaker was open. */
  breakerBlocks: number;
}

// Safe defaults for the four env knobs (D13). They live here, beside the logic
// they feed, and bot/config.ts imports them, so the default can never drift
// between the config fallback and the governor's own construction default.

/** Discord's own ceiling is 50 requests per second; 8 leaves a wide margin. */
export const DEFAULT_MAX_RPS = 8;
/** 10 minutes, long enough that a Cloudflare ban expires before the bot retries. */
export const DEFAULT_BAN_PAUSE_MS = 600_000;
/** Against Discord's 10000 invalid requests per 10 minutes per IP ban threshold. */
export const DEFAULT_BREAKER_LIMIT = 300;
/** 24 hours. */
export const DEFAULT_FORBIDDEN_TTL_MS = 86_400_000;

/**
 * The rolling window the breaker counts over. Discord's own ban counter is 10000
 * invalid requests per 10 minutes per IP; the window matches so the configured
 * limit reads against the same denominator.
 */
export const BREAKER_WINDOW_MS = 10 * 60_000;

/**
 * How many times one request is handed to the send callback before it gives up.
 * A 429 that has been waited out is retried; this bounds that, so a route that
 * answers 429 forever cannot hold a promise open indefinitely.
 */
export const MAX_ATTEMPTS = 3;

/**
 * The wait used when a 429 carries no retry_after in its body and no Retry-After
 * header. Matches the one second default of the client this replaced, so a
 * malformed 429 can never become a zero-delay retry loop.
 */
export const MISSING_RETRY_AFTER_MS = 1000;

/** Per-queue backlog cap. Beyond it a request is refused rather than queued. */
export const MAX_QUEUE_DEPTH = 256;

/** Live rate state is kept for at most this many buckets (LRU beyond it). */
export const MAX_TRACKED_BUCKETS = 512;

/** Subjects remembered by the permanent-failure cache before LRU eviction. */
export const MAX_FORBIDDEN_ENTRIES = 4096;

/** Path segments whose following id is a Discord major rate-limit parameter. */
const MAJOR_PARENTS = new Set(['guilds', 'channels', 'webhooks', 'interactions']);

/** Reason a request was refused without ever being sent. */
export type GovernorBlockReason = 'breaker-open' | 'forbidden-cached' | 'queue-full';

export class GovernorBlockedError extends Error {
  constructor(
    readonly reason: GovernorBlockReason,
    message: string,
  ) {
    super(message);
    this.name = 'GovernorBlockedError';
  }
}

/**
 * True for a path segment that varies per call. Snowflakes are all digits;
 * interaction and webhook tokens are long opaque strings. `@me` and `@original`
 * are literals despite sitting where an id would.
 */
function isVariableSegment(segment: string): boolean {
  if (segment.startsWith('@')) return false;
  if (/^\d+$/.test(segment)) return true;
  return segment.length >= 16;
}

/**
 * The provisional bucket key: method plus a route template that KEEPS major
 * parameter ids (they genuinely separate buckets) and replaces every other
 * variable segment. Interpolating a per-user id would mint one bucket per member
 * and defeat bucketing entirely, which is the whole point of the template.
 *
 * Credentials never survive into the key. An interaction or webhook token is
 * replaced by `:token`, because this string reaches log lines and counters.
 */
export function routeTemplate(method: string, path: string): string {
  const queryAt = path.indexOf('?');
  const clean = queryAt === -1 ? path : path.slice(0, queryAt);
  const parts = clean.split('/');
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const segment = parts[i];
    if (segment === '' || !isVariableSegment(segment)) {
      out.push(segment);
      continue;
    }
    const parent = parts[i - 1];
    if (parent !== undefined && MAJOR_PARENTS.has(parent)) {
      out.push(segment);
      continue;
    }
    // The segment right after a major id on these routes is the paired secret.
    const grandparent = parts[i - 2];
    if (
      grandparent !== undefined &&
      (grandparent === 'webhooks' || grandparent === 'interactions')
    ) {
      out.push(':token');
      continue;
    }
    out.push(':id');
  }
  return `${method.toUpperCase()} ${out.join('/')}`;
}

/**
 * The path with only its CREDENTIAL segments replaced, ids left intact. Error
 * and log lines use this: an interaction token is a live bearer credential for
 * about 15 minutes, and the old client interpolated it verbatim into every throw
 * (ledger item L1), which a bare `console.error(e)` then wrote to the container
 * log. Ids are kept because losing them would cost the operator the one detail
 * that makes a failure diagnosable.
 */
export function redactPath(path: string): string {
  const queryAt = path.indexOf('?');
  const clean = queryAt === -1 ? path : path.slice(0, queryAt);
  const parts = clean.split('/');
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const segment = parts[i];
    const grandparent = parts[i - 2];
    const parentIsMajorId =
      grandparent === 'webhooks' || grandparent === 'interactions'
        ? parts[i - 1] !== undefined && isVariableSegment(parts[i - 1])
        : false;
    if (segment !== '' && parentIsMajorId && isVariableSegment(segment)) {
      out.push(':token');
      continue;
    }
    out.push(segment);
  }
  const suffix = queryAt === -1 ? '' : path.slice(queryAt);
  return out.join('/') + suffix;
}

/**
 * Interaction callbacks are exempt from Discord's GLOBAL rate limit by
 * documented contract, and they carry a hard 3 second deadline. Pacing them
 * behind a saturated sweep would miss that deadline, so the global send-rate cap
 * skips them. Everything else still applies: their own bucket gating, and every
 * pause, because a pause means Discord has told us to stop entirely.
 */
function skipsGlobalRate(template: string): boolean {
  // The /callback SUFFIX is part of the test, not just the prefix: the exemption
  // belongs to the interaction-response endpoint alone, and a future POST
  // somewhere else under /interactions/ must not inherit it silently.
  return template.startsWith('POST /interactions/') && template.endsWith('/callback');
}

function headerNumber(headers: Readonly<Record<string, string>>, name: string): number | null {
  const raw = headers[name];
  if (raw === undefined || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function scopeOf(headers: Readonly<Record<string, string>>): RateLimitScope {
  const raw = headers['x-ratelimit-scope'];
  if (raw === 'user' || raw === 'global' || raw === 'shared') return raw;
  return 'unknown';
}

/**
 * Seconds to whole milliseconds, ALWAYS rounding up. A fractional delay is
 * allowed to fire early, so rounding down or leaving the fraction in place would
 * let a wait expire a hair before Discord's window actually reopens.
 */
function secondsToMs(seconds: number): number {
  return Math.ceil(seconds * 1000);
}

interface QueueState {
  tail: Promise<void>;
  waiting: number;
}

interface LimitState {
  remaining: number | null;
  /** Absolute time this bucket's window reopens. */
  resetAt: number | null;
  lastUsedAt: number;
}

/** What one 429 means for this request: how long to wait, and whether it fails a probe. */
interface Absorb429Outcome {
  /** Milliseconds to wait before retrying, or null when it must not retry. */
  retryMs: number | null;
  /** Whether this counts as an invalid request, and so fails a half-open probe. */
  countsAsFailure: boolean;
}

interface ForbiddenEntry {
  expiresAt: number;
}

export class RateGovernor {
  private readonly clock: GovernorClock;
  private readonly maxRps: number;
  private readonly banPauseMs: number;
  private readonly breakerLimit: number;
  private readonly forbiddenTtlMs: number;
  private readonly log: GovernorLog;

  /** FIFO chains, keyed by the PROVISIONAL template. */
  private readonly queues = new Map<string, QueueState>();
  /** Rate state, keyed by the RESOLVED bucket (hash once Discord has named it). */
  private readonly limits = new Map<string, LimitState>();
  /** Provisional template to Discord bucket hash, once learned. */
  private readonly resolved = new Map<string, string>();
  private readonly forbidden = new Map<string, ForbiddenEntry>();

  /** Earliest time the next globally paced request may be sent. */
  private nextSlotAt = 0;
  /** Process-wide pause: nothing dispatches before this. */
  private pausedUntil = 0;

  private breaker: BreakerState = 'closed';
  private invalidAt: number[] = [];
  private lastInvalidAt = 0;
  private probeInFlight = false;

  private counters: GovernorCounters = {
    requests: 0,
    rateLimited: 0,
    rateLimitedByScope: { user: 0, global: 0, shared: 0, unknown: 0 },
    globalPauses: 0,
    banPauses: 0,
    breakerState: 'closed',
    breakerOpens: 0,
    queueDepth: 0,
    trackedBuckets: 0,
    trackedRoutes: 0,
    activeQueues: 0,
    forbiddenEntries: 0,
    forbiddenBlocks: 0,
    breakerBlocks: 0,
  };

  constructor(options: RateGovernorOptions) {
    this.clock = options.clock;
    this.maxRps = options.maxRps;
    this.banPauseMs = options.banPauseMs;
    this.breakerLimit = options.breakerLimit;
    this.forbiddenTtlMs = options.forbiddenTtlMs;
    this.log = options.log ?? (() => {});
  }

  /**
   * Counters for Phase 8. A plain snapshot: no IO, no formatting, and no live
   * references into the governor's own state.
   */
  snapshot(): GovernorCounters {
    this.pruneForbidden(this.clock.now());
    return {
      ...this.counters,
      rateLimitedByScope: { ...this.counters.rateLimitedByScope },
      breakerState: this.breaker,
      trackedBuckets: this.limits.size,
      trackedRoutes: this.resolved.size,
      activeQueues: this.queues.size,
      forbiddenEntries: this.forbidden.size,
    };
  }

  /**
   * Drop permanent-failure entries. The bot's own role position moving is what
   * makes a past 403 meaningless, so that is the caller for the no-argument
   * form. Nothing calls it until a later phase; the hook exists so the cache can
   * never become the reason a fixed permission stays broken for 24 hours.
   */
  invalidateForbidden(subjectKey?: string): void {
    if (subjectKey === undefined) this.forbidden.clear();
    else this.forbidden.delete(subjectKey);
  }

  /** True when this subject is cached as permanently failing. */
  isForbidden(subjectKey: string): boolean {
    const entry = this.forbidden.get(subjectKey);
    if (entry === undefined) return false;
    if (entry.expiresAt <= this.clock.now()) {
      this.forbidden.delete(subjectKey);
      return false;
    }
    return true;
  }

  /**
   * Pace one request and return its final response. Throws GovernorBlockedError
   * when the request is refused without being sent; anything the send callback
   * itself throws propagates untouched.
   */
  async run<R extends GovernorResponse>(
    request: GovernorRequest,
    send: () => Promise<R>,
  ): Promise<R> {
    const template = routeTemplate(request.method, request.path);
    const essential = request.essential === true;

    if (request.subjectKey !== undefined && this.isForbidden(request.subjectKey)) {
      this.counters.forbiddenBlocks++;
      throw new GovernorBlockedError(
        'forbidden-cached',
        `[bot] governor skipped ${template}: subject previously answered 401 or 403`,
      );
    }

    const probe = this.claimProbe(essential);
    if (!probe.allowed) {
      this.counters.breakerBlocks++;
      throw new GovernorBlockedError(
        'breaker-open',
        `[bot] governor refused ${template}: invalid-request breaker is open`,
      );
    }

    const queue = this.queueFor(template);
    if (queue.waiting >= MAX_QUEUE_DEPTH) {
      if (probe.isProbe) this.probeInFlight = false;
      throw new GovernorBlockedError(
        'queue-full',
        `[bot] governor refused ${template}: bucket queue is full`,
      );
    }

    queue.waiting++;
    this.counters.queueDepth++;
    const job = async (): Promise<R> => {
      try {
        return await this.attempt(template, request, send, probe.isProbe);
      } finally {
        queue.waiting--;
        this.counters.queueDepth--;
        if (probe.isProbe) this.probeInFlight = false;
        // Drop a drained queue. Interaction callbacks are bucketed per
        // interaction id, so without this the map would gain an entry per slash
        // command for the life of the process. Safe at zero: nothing else holds
        // this chain, so a later request simply mints a fresh one.
        if (queue.waiting === 0 && this.queues.get(template) === queue) {
          this.queues.delete(template);
        }
      }
    };
    const run = queue.tail.then(job, job);
    queue.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /** The send-and-classify loop for one request, already at the head of its queue. */
  private async attempt<R extends GovernorResponse>(
    template: string,
    request: GovernorRequest,
    send: () => Promise<R>,
    isProbe: boolean,
  ): Promise<R> {
    // Only THE probe may settle the breaker, and it must settle exactly once.
    // Tying this to the request rather than to any success is load bearing: with
    // `settleProbe(true)` on every good response, one essential slash-command
    // reply landing while the breaker was half-open would close it on the
    // sweeps' behalf and reopen the floodgates the breaker just shut.
    let settled = false;
    const settle = (ok: boolean): void => {
      if (!isProbe || settled) return;
      settled = true;
      this.settleProbe(ok);
    };

    try {
      let lastResponse: R | null = null;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        await this.waitForPause();
        await this.waitForBucket(template);
        await this.waitForGlobalSlot(template);
        // Re-check the pause LAST. The bucket gate and the rate slot can each
        // block for a long time, and a global 429 or a ban pause raised by
        // another queue during that wait was declared after this request last
        // looked. Without this second check it would send straight into a pause
        // the governor had already announced, which is the exact traffic a pause
        // exists to stop.
        await this.waitForPause();

        this.counters.requests++;
        const response = await send();
        lastResponse = response;
        this.absorbHeaders(template, response);

        if (response.status === 429) {
          const outcome = this.absorb429(template, response);
          // A rate limit answers the probe's question with a no, EXCEPT at
          // shared scope: that is another app's traffic against a shared
          // resource, and D3 leaves it out of the ban counter, so it must not
          // fail our probe either.
          if (outcome.countsAsFailure) settle(false);
          if (outcome.retryMs === null) return response;
          // Nothing to wait FOR on the last pass: the bucket and pause state are
          // already recorded for whoever comes next, so sleeping here would only
          // hold this promise open before giving up anyway.
          if (attempt === MAX_ATTEMPTS - 1) return response;
          // The wait is honored in FULL. The clamp this replaced is exactly what
          // turned a long Discord penalty into a retry storm.
          if (outcome.retryMs > 0) await this.clock.sleep(outcome.retryMs);
          continue;
        }

        if (response.status === 401 || response.status === 403) {
          this.recordInvalid();
          if (request.subjectKey !== undefined) this.rememberForbidden(request.subjectKey);
          settle(false);
          return response;
        }

        settle(true);
        return response;
      }
      // Out of attempts. The response is returned rather than thrown so the IO
      // shell keeps ownership of what a non-ok status means to its callers.
      return lastResponse as R;
    } finally {
      // A probe that fell out without an answer, because the attempts ran out or
      // the send callback threw, must not leave the breaker latched in half-open
      // forever. Unanswered counts as failure: the conservative reading is that
      // it is still not safe to resume.
      settle(false);
    }
  }

  /**
   * Record what a response says about its bucket. Learning the hash remaps the
   * provisional key onto it, and the two keys share ONE LimitState from then on,
   * so a bucket is never counted twice.
   */
  private absorbHeaders(template: string, response: GovernorResponse): void {
    const now = this.clock.now();
    const hash = response.headers['x-ratelimit-bucket'];
    if (hash !== undefined && hash !== '') {
      const previous = this.resolved.get(template);
      this.rememberResolved(template, hash);
      if (previous !== hash) {
        // Retire the state held under the old key so it cannot answer for this
        // bucket any more; the hash entry below is the single live one.
        const stale = this.limits.get(previous ?? template);
        this.limits.delete(previous ?? template);
        if (stale !== undefined && !this.limits.has(hash)) this.limits.set(hash, stale);
      }
    }

    const remaining = headerNumber(response.headers, 'x-ratelimit-remaining');
    const resetAfter = headerNumber(response.headers, 'x-ratelimit-reset-after');
    if (remaining === null && resetAfter === null) return;

    const key = this.resolved.get(template) ?? template;
    const state = this.limits.get(key) ?? { remaining: null, resetAt: null, lastUsedAt: now };
    if (remaining !== null) state.remaining = remaining;
    if (resetAfter !== null) state.resetAt = now + secondsToMs(resetAfter);
    state.lastUsedAt = now;
    this.limits.set(key, state);
    this.evictBuckets(now);
  }

  /**
   * Classify a 429 and return how long this request should wait before retrying,
   * or null when it must not retry at all.
   */
  private absorb429(template: string, response: GovernorResponse): Absorb429Outcome {
    const now = this.clock.now();
    const scope = scopeOf(response.headers);
    this.counters.rateLimited++;
    this.counters.rateLimitedByScope[scope]++;

    // A 429 body that is not JSON is Cloudflare, not Discord: the edge has
    // started refusing us outright. Treat it as a ban and stop process-wide for
    // far longer than any retry_after would suggest.
    if (!response.jsonParsed) {
      this.pausedUntil = Math.max(this.pausedUntil, now + this.banPauseMs);
      this.counters.banPauses++;
      this.recordInvalid();
      this.log('error', '[bot] discord returned a non-JSON 429, pausing as banned', {
        route: template,
        scope,
        pauseMs: this.banPauseMs,
      });
      return { retryMs: null, countsAsFailure: true };
    }

    const body = (response.json ?? {}) as { retry_after?: unknown; global?: unknown };
    const bodyRetry = typeof body.retry_after === 'number' ? body.retry_after : null;
    const headerRetry = headerNumber(response.headers, 'retry-after');
    // A 429 that names no wait at all is malformed. Falling back to 0 would
    // retry with NO delay, and on an interaction route, which is exempt from the
    // global rate cap, that means MAX_ATTEMPTS back-to-back sends into an active
    // rate limit. The client this replaced defaulted a missing retry_after to
    // one second; that floor is kept deliberately.
    const retryAfterSeconds = bodyRetry ?? headerRetry;
    const retryMs =
      retryAfterSeconds === null
        ? MISSING_RETRY_AFTER_MS
        : secondsToMs(Math.max(0, retryAfterSeconds));
    const isGlobal = scope === 'global' || body.global === true;

    // A shared-scope 429 is another app's traffic against a shared resource, so
    // it is waited out and retried but must NOT count toward the ban counter,
    // and for the same reason must not fail a half-open probe.
    const countsAsFailure = scope !== 'shared';
    if (countsAsFailure) this.recordInvalid();

    this.log('warn', '[bot] discord rate limited', {
      route: template,
      scope,
      retryAfterMs: retryMs,
      global: isGlobal ? 1 : 0,
    });

    if (isGlobal) {
      this.pausedUntil = Math.max(this.pausedUntil, now + retryMs);
      this.counters.globalPauses++;
      // The pause itself is the wait; returning 0 lets the loop re-enter and
      // block on it rather than sleeping the same interval twice.
      return { retryMs: 0, countsAsFailure };
    }

    const key = this.resolved.get(template) ?? template;
    const state = this.limits.get(key) ?? { remaining: null, resetAt: null, lastUsedAt: now };
    state.remaining = 0;
    state.resetAt = Math.max(state.resetAt ?? 0, now + retryMs);
    state.lastUsedAt = now;
    this.limits.set(key, state);
    // Enforced HERE too, not only from absorbHeaders. A 429 carrying no
    // x-ratelimit-* headers makes absorbHeaders return early, so this insert was
    // the one path into `limits` that skipped the cap entirely, and interaction
    // callbacks mint a unique template per interaction id.
    this.evictBuckets(now);
    return { retryMs, countsAsFailure };
  }

  private async waitForPause(): Promise<void> {
    // A loop, not a single sleep: another request can extend the pause while
    // this one is already waiting on it.
    for (;;) {
      const delay = this.pausedUntil - this.clock.now();
      if (delay <= 0) return;
      await this.clock.sleep(delay);
    }
  }

  /** Proactive gating: never dispatch from a bucket that reported Remaining 0. */
  private async waitForBucket(template: string): Promise<void> {
    for (;;) {
      const key = this.resolved.get(template) ?? template;
      const state = this.limits.get(key);
      if (state === undefined || state.remaining === null || state.remaining > 0) return;
      const resetAt = state.resetAt;
      if (resetAt === null) return;
      const delay = resetAt - this.clock.now();
      if (delay <= 0) {
        // The window has reopened. Clear the exhausted marker so the next
        // response's headers are what re-establish it.
        state.remaining = null;
        state.resetAt = null;
        return;
      }
      await this.clock.sleep(delay);
    }
  }

  private async waitForGlobalSlot(template: string): Promise<void> {
    if (skipsGlobalRate(template)) return;
    const spacing = this.maxRps > 0 ? Math.ceil(1000 / this.maxRps) : 0;
    const now = this.clock.now();
    // Reserved synchronously, before any await, so concurrent callers cannot be
    // handed the same slot.
    const at = Math.max(now, this.nextSlotAt);
    this.nextSlotAt = at + spacing;
    const delay = at - now;
    if (delay > 0) await this.clock.sleep(delay);
  }

  /**
   * Record a template's bucket hash, most recently used last, and keep the map
   * bounded. Interaction callbacks are bucketed per interaction id, so this map
   * gains an entry per slash command; without a cap it would grow for the life
   * of the process exactly as the limit map would. Re-inserting on every sighting
   * makes the eviction order least-recently-used, so a hot route (the member
   * PATCH template a sweep hammers) is never the one thrown out. Losing an entry
   * is safe either way: the next response's header re-establishes it.
   */
  private rememberResolved(template: string, hash: string): void {
    this.resolved.delete(template);
    this.resolved.set(template, hash);
    while (this.resolved.size > MAX_TRACKED_BUCKETS) {
      const oldest = this.resolved.keys().next();
      if (oldest.done) break;
      this.resolved.delete(oldest.value);
    }
  }

  private queueFor(template: string): QueueState {
    const existing = this.queues.get(template);
    if (existing !== undefined) return existing;
    const created: QueueState = { tail: Promise.resolve(), waiting: 0 };
    this.queues.set(template, created);
    return created;
  }

  private rememberForbidden(subjectKey: string): void {
    const now = this.clock.now();
    this.pruneForbidden(now);
    if (this.forbidden.size >= MAX_FORBIDDEN_ENTRIES) {
      const oldest = this.forbidden.keys().next();
      if (!oldest.done) this.forbidden.delete(oldest.value);
    }
    this.forbidden.set(subjectKey, { expiresAt: now + this.forbiddenTtlMs });
  }

  private pruneForbidden(now: number): void {
    for (const [key, entry] of this.forbidden) {
      if (entry.expiresAt <= now) this.forbidden.delete(key);
    }
  }

  /**
   * Keep live rate state bounded. Per-interaction buckets are single use, so
   * without this the map would grow for the process's whole life.
   */
  private evictBuckets(now: number): void {
    // Drains until the map is AT the cap, not one entry per call. Evicting a
    // single entry cannot catch up with a burst, so the map would sit over its
    // documented bound indefinitely.
    while (this.limits.size > MAX_TRACKED_BUCKETS) {
      let idleKey: string | null = null;
      let idleAt = Number.POSITIVE_INFINITY;
      let anyKey: string | null = null;
      let anyAt = Number.POSITIVE_INFINITY;
      for (const [key, state] of this.limits) {
        if (state.lastUsedAt < anyAt) {
          anyAt = state.lastUsedAt;
          anyKey = key;
        }
        const idle = state.resetAt === null || state.resetAt <= now;
        if (idle && state.lastUsedAt < idleAt) {
          idleAt = state.lastUsedAt;
          idleKey = key;
        }
      }
      // Prefer an idle bucket, whose state is worthless anyway. But fall back to
      // the least recently used LIVE one rather than giving up: with every
      // tracked bucket holding a future reset there was no idle candidate at
      // all, so the loop evicted nothing and MAX_TRACKED_BUCKETS stopped being a
      // bound. Dropping a live entry only costs one round trip of proactive
      // gating, which the next response re-establishes; an unbounded map does
      // not recover.
      const victim = idleKey ?? anyKey;
      if (victim === null) return;
      this.limits.delete(victim);
    }
  }

  /** Count one response toward the invalid-request window and open if it is full. */
  private recordInvalid(): void {
    const now = this.clock.now();
    this.lastInvalidAt = now;
    this.invalidAt.push(now);
    const cutoff = now - BREAKER_WINDOW_MS;
    // Timestamps are appended in order, so dropping the aged prefix is enough.
    let drop = 0;
    while (drop < this.invalidAt.length && this.invalidAt[drop] <= cutoff) drop++;
    if (drop > 0) this.invalidAt = this.invalidAt.slice(drop);
    if (this.breaker !== 'open' && this.invalidAt.length >= this.breakerLimit) this.openBreaker();
  }

  private openBreaker(): void {
    this.breaker = 'open';
    this.counters.breakerOpens++;
    // Opening RESTARTS the quiet window, whichever path got here. A probe that
    // failed without a counted response (its send threw, or its retries ran out)
    // would otherwise leave `lastInvalidAt` old enough that the very next
    // request qualified as a fresh probe, so "one probe after a full quiet
    // window" would silently become "every request is a probe".
    this.lastInvalidAt = this.clock.now();
    this.log('error', '[bot] invalid-request breaker opened', {
      window: this.invalidAt.length,
      limit: this.breakerLimit,
    });
  }

  /**
   * Decide whether this request may proceed, and whether it is THE half-open
   * probe. Essential traffic is never blocked: the breaker exists to stop sweeps
   * and background writes, not slash-command replies.
   */
  private claimProbe(essential: boolean): { allowed: boolean; isProbe: boolean } {
    if (this.breaker === 'closed') return { allowed: true, isProbe: false };
    if (essential) return { allowed: true, isProbe: false };
    if (this.breaker === 'open') {
      // One probe, and only after a FULL quiet window with no counted failures.
      if (this.clock.now() - this.lastInvalidAt < BREAKER_WINDOW_MS) {
        return { allowed: false, isProbe: false };
      }
      this.breaker = 'half-open';
      this.probeInFlight = true;
      return { allowed: true, isProbe: true };
    }
    // Already half-open: whoever holds the probe is the only one moving.
    if (this.probeInFlight) return { allowed: false, isProbe: false };
    this.probeInFlight = true;
    return { allowed: true, isProbe: true };
  }

  /** Close the breaker on a good probe, re-open it on a bad one. */
  private settleProbe(ok: boolean): void {
    if (this.breaker !== 'half-open') return;
    if (ok) {
      this.breaker = 'closed';
      this.invalidAt = [];
      return;
    }
    this.openBreaker();
  }
}
