// The governor's invalid-request circuit breaker (D3): the rolling window that
// counts 401, 403 and non-shared 429 responses, the open state that stops
// background traffic while letting essential traffic through, and the single
// half-open probe that decides whether to close again.
//
// Time is the synthetic clock throughout and never vitest fake timers. The
// governor CAPTURES its clock at construction, so a fake-timer test would not move
// it at all, and the breaker edge is a strict `<` against a 10 minute window,
// which a real timer is allowed to fire a hair early on. The virtual clock has
// neither problem: nothing moves except when a test moves it.
import { describe, expect, it } from 'vitest';
import {
  BREAKER_WINDOW_MS,
  GovernorBlockedError,
  type GovernorRequest,
  type GovernorResponse,
  RateGovernor,
  type RateGovernorOptions,
} from '../bot/rate_governor';
import { type SyntheticClock, syntheticClock } from './helpers/synthetic_clock';

// Every fixture number below is deliberately NOT the module's own DEFAULT_* value
// (300 limit, 8 rps, 600000 ban pause, 86400000 TTL). A constructor that dropped an
// option on the floor and fell back to its default would otherwise be indistinguishable
// from one that read it.

/** Small on purpose, so both breaker edges are one response apart. */
const BREAKER_LIMIT = 3;
/** 50 rps, so the global pacer spaces sends exactly ceil(1000 / 50) = 20 ms apart. */
const MAX_RPS = 50;
const SPACING_MS = 20;

/** A distinctive fractional retry_after: 0 is absorb429's own fallback. */
const RETRY_AFTER_S = 0.25;

const SWEEP: GovernorRequest = { method: 'PATCH', path: '/guilds/1/members/2' };
/** The template SWEEP resolves to, and therefore the one a refusal names. */
const SWEEP_TEMPLATE = 'PATCH /guilds/1/members/:id';
const BREAKER_OPEN_MESSAGE = `[bot] governor refused ${SWEEP_TEMPLATE}: invalid-request breaker is open`;

/** A slash-command reply: essential, so the breaker must never stop it. */
const REPLY: GovernorRequest = { method: 'POST', path: '/channels/9/messages', essential: true };

const OK: GovernorResponse = { status: 200, headers: {}, json: {}, jsonParsed: true };

function statusOnly(status: number): GovernorResponse {
  return { status, headers: {}, json: {}, jsonParsed: true };
}

/** A well-formed Discord 429. `scope` omitted models a response with no scope header. */
function rateLimited(scope?: string): GovernorResponse {
  return {
    status: 429,
    headers: scope === undefined ? {} : { 'x-ratelimit-scope': scope },
    json: { retry_after: RETRY_AFTER_S },
    jsonParsed: true,
  };
}

interface LogLine {
  level: string;
  message: string;
  fields: Record<string, string | number>;
}

interface Rig {
  clock: SyntheticClock;
  governor: RateGovernor;
  logs: LogLine[];
  /** One entry per call actually handed to a send callback. */
  sent: string[];
}

function makeRig(overrides: Partial<RateGovernorOptions> = {}): Rig {
  const clock = syntheticClock();
  const logs: LogLine[] = [];
  const governor = new RateGovernor({
    clock,
    maxRps: MAX_RPS,
    banPauseMs: 90_000,
    breakerLimit: BREAKER_LIMIT,
    forbiddenTtlMs: 60_000,
    log: (level, message, fields) => logs.push({ level, message, fields }),
    ...overrides,
  });
  return { clock, governor, logs, sent: [] };
}

/**
 * Run one request to completion, letting virtual time cover the global-rate slot
 * and any retry wait. `runAll` only advances to waits that already exist, so a
 * request refused before it is ever queued settles without moving the clock.
 */
async function call(
  rig: Rig,
  request: GovernorRequest,
  ...responses: GovernorResponse[]
): Promise<GovernorResponse> {
  const queue = [...responses];
  const promise = rig.governor.run(request, async () => {
    rig.sent.push(`${request.method} ${request.path}`);
    const next = queue.shift();
    if (next === undefined) throw new Error('scripted send ran out of responses');
    return next;
  });
  // Settled first, so a rejection always has a handler attached before the clock
  // starts running: an unhandled rejection would fail the run for the wrong reason.
  const settled = promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  await rig.clock.runAll();
  const result = await settled;
  if (result.ok) return result.value;
  throw result.error;
}

/**
 * Drive a request that must be refused outright. A response IS queued for it, so
 * the unchanged `sent` length is a positive statement that the send callback was
 * never invoked rather than an artifact of an empty queue.
 */
async function refused(rig: Rig, request: GovernorRequest): Promise<GovernorBlockedError> {
  const before = rig.sent.length;
  const error = await call(rig, request, OK).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(GovernorBlockedError);
  expect(rig.sent.length).toBe(before);
  return error as GovernorBlockedError;
}

/** Open the breaker with exactly `BREAKER_LIMIT` counted 401s, back to back. */
async function openBreaker(rig: Rig): Promise<void> {
  for (let i = 0; i < BREAKER_LIMIT; i++) await call(rig, SWEEP, statusOnly(401));
  expect(rig.governor.snapshot().breakerState).toBe('open');
}

describe('governor breaker window edges (D3)', () => {
  it('does NOT open one counted response short of the limit', async () => {
    // The lower edge. `>=` against the limit is what makes the count the trip
    // point; a guard that opened at limit minus one would stop sweeps early and
    // for no reason, and nothing else in the suite would say so.
    const rig = makeRig();

    for (let i = 0; i < BREAKER_LIMIT - 1; i++) await call(rig, SWEEP, statusOnly(401));

    const snap = rig.governor.snapshot();
    expect(snap.breakerState).toBe('closed');
    expect(snap.breakerOpens).toBe(0);
    expect(snap.breakerBlocks).toBe(0);
    // Still closed means ordinary background traffic is still dispatched.
    expect((await call(rig, SWEEP, OK)).status).toBe(200);
    expect(rig.sent.length).toBe(3);
    expect(rig.logs).toEqual([]);
  });

  it('opens on the breakerLimit-th counted response', async () => {
    const rig = makeRig();

    for (let i = 0; i < BREAKER_LIMIT; i++) await call(rig, SWEEP, statusOnly(401));

    const snap = rig.governor.snapshot();
    expect(snap.breakerState).toBe('open');
    expect(snap.breakerOpens).toBe(1);
    expect(rig.sent.length).toBe(3);
    // Both fields pinned to literals, not to each other: the window count and the
    // CONFIGURED limit meeting at 3 is what proves the constructor read the option
    // rather than falling back to DEFAULT_BREAKER_LIMIT (300), which would never trip.
    expect(rig.logs).toEqual([
      {
        level: 'error',
        message: '[bot] invalid-request breaker opened',
        fields: { window: 3, limit: 3 },
      },
    ]);
  });
});

describe('governor breaker counted responses (D3)', () => {
  // What counts toward Discord's invalid-request ban threshold, one row per class.
  // A shared-scope 429 is another app's fault on a shared resource, so it is waited
  // out and retried but must NOT push us toward a ban we did not cause; the rest do.
  const ROWS: {
    name: string;
    responses: GovernorResponse[];
    counted: boolean;
    scopeCounter?: 'user' | 'shared' | 'unknown';
  }[] = [
    { name: '401 unauthorized', responses: [statusOnly(401)], counted: true },
    { name: '403 forbidden', responses: [statusOnly(403)], counted: true },
    {
      name: '429 scoped user',
      responses: [rateLimited('user'), OK],
      counted: true,
      scopeCounter: 'user',
    },
    {
      name: '429 with no scope header',
      responses: [rateLimited(), OK],
      counted: true,
      scopeCounter: 'unknown',
    },
    {
      name: '429 scoped shared',
      responses: [rateLimited('shared'), OK],
      counted: false,
      scopeCounter: 'shared',
    },
  ];

  for (const row of ROWS) {
    it(`${row.name} ${row.counted ? 'counts' : 'does NOT count'} toward the breaker`, async () => {
      // breakerLimit 1, so ONE counted response is the whole difference between
      // the two outcomes and no arithmetic stands between the row and its verdict.
      const rig = makeRig({ breakerLimit: 1 });

      await call(rig, SWEEP, ...row.responses);

      const snap = rig.governor.snapshot();
      expect(snap.breakerState).toBe(row.counted ? 'open' : 'closed');
      expect(snap.breakerOpens).toBe(row.counted ? 1 : 0);
      // Every response in the row was consumed, so the shared-scope arm cannot
      // pass merely because its 429 never reached the governor at all.
      expect(rig.sent.length).toBe(row.responses.length);
      if (row.scopeCounter !== undefined) {
        expect(snap.rateLimited).toBe(1);
        expect(snap.rateLimitedByScope[row.scopeCounter]).toBe(1);
      }
    });
  }
});

describe('governor breaker open state (D3)', () => {
  it('refuses a non-essential request and never calls its send', async () => {
    const rig = makeRig();
    await openBreaker(rig);

    const error = await refused(rig, SWEEP);

    expect(error.reason).toBe('breaker-open');
    expect(error.name).toBe('GovernorBlockedError');
    // Message equality, not `rejects.toThrow('...')`: a bare string there is a
    // SUBSTRING match, which the forbidden-cache message would also satisfy.
    expect(error.message).toBe(BREAKER_OPEN_MESSAGE);
    expect(rig.sent.length).toBe(BREAKER_LIMIT);
    expect(rig.governor.snapshot().breakerBlocks).toBe(1);
  });

  it('still sends an ESSENTIAL request while the breaker is open', async () => {
    // The breaker exists to stop sweeps and background writes, not slash-command
    // replies: a refused interaction reply is a visible failure to a player, and
    // Discord's 3 second callback deadline leaves no room to wait one out.
    const rig = makeRig();
    await openBreaker(rig);

    expect((await call(rig, REPLY, OK)).status).toBe(200);

    expect(rig.sent).toContain('POST /channels/9/messages');
    const snap = rig.governor.snapshot();
    expect(snap.breakerBlocks).toBe(0);
    // Essential traffic is not a probe: succeeding must not close the breaker on
    // the sweeps' behalf, or one interaction reply would reopen the floodgates.
    expect(snap.breakerState).toBe('open');
    expect(snap.breakerOpens).toBe(1);
  });

  it('ages entries out of the rolling window so a slow drip never opens it', async () => {
    // Four counted responses, one more than the limit, but spread a full window
    // apart. Without the aged-prefix prune in recordInvalid the third would open
    // the breaker, and a bot that fails once every ten minutes would stop sweeping.
    const rig = makeRig();

    await call(rig, SWEEP, statusOnly(401));
    for (let i = 0; i < 3; i++) {
      await rig.clock.advanceBy(BREAKER_WINDOW_MS);
      await call(rig, SWEEP, statusOnly(401));
    }

    expect(rig.sent.length).toBe(4);
    expect(rig.clock.now()).toBe(3 * BREAKER_WINDOW_MS);
    let snap = rig.governor.snapshot();
    expect(snap.breakerState).toBe('closed');
    expect(snap.breakerOpens).toBe(0);

    // The contrast arm, in the same test: two MORE 401s with no advance at all,
    // which lands three inside one window and opens it. Aging is therefore the one
    // thing that kept the drip closed, rather than counting having quietly stopped.
    await call(rig, SWEEP, statusOnly(401));
    snap = rig.governor.snapshot();
    expect(snap.breakerState).toBe('closed');
    await call(rig, SWEEP, statusOnly(401));
    snap = rig.governor.snapshot();
    expect(snap.breakerState).toBe('open');
    expect(snap.breakerOpens).toBe(1);
  });
});

describe('governor breaker half-open probe (D3)', () => {
  it('probes only after a FULL quiet window, not a millisecond before', async () => {
    const rig = makeRig();
    await openBreaker(rig);
    // Three sends at 20 ms spacing start at 0, 20 and 40, and the last one is what
    // set lastInvalidAt, so the quiet window is measured from exactly here.
    const openedAt = rig.clock.now();
    expect(openedAt).toBe(2 * SPACING_MS);

    await rig.clock.advanceTo(openedAt + BREAKER_WINDOW_MS - 1);
    const error = await refused(rig, SWEEP);
    expect(error.reason).toBe('breaker-open');
    expect(rig.governor.snapshot().breakerState).toBe('open');

    // One millisecond later the window has fully elapsed and the probe goes out.
    await rig.clock.advanceBy(1);
    expect(rig.clock.now()).toBe(openedAt + BREAKER_WINDOW_MS);
    expect((await call(rig, SWEEP, OK)).status).toBe(200);

    expect(rig.sent.length).toBe(BREAKER_LIMIT + 1);
    expect(rig.governor.snapshot().breakerState).toBe('closed');
  });

  it('allows exactly ONE probe: a second request is refused while one is in flight', async () => {
    // Without the probeInFlight latch every queued sweep would be released at once
    // the moment the quiet window elapsed, which is the stampede that got the bot
    // rate limited in the first place.
    const rig = makeRig();
    await openBreaker(rig);
    await rig.clock.advanceBy(BREAKER_WINDOW_MS);

    let release: (() => void) | null = null;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const probe = rig.governor.run(SWEEP, async () => {
      rig.sent.push('probe');
      await held;
      return OK;
    });
    // Let the probe reach its send without moving virtual time.
    await rig.clock.advanceBy(0);
    expect(rig.sent.length).toBe(BREAKER_LIMIT + 1);
    expect(rig.sent[BREAKER_LIMIT]).toBe('probe');
    expect(rig.governor.snapshot().breakerState).toBe('half-open');

    const error = await refused(rig, SWEEP);
    expect(error.reason).toBe('breaker-open');
    expect(error.message).toBe(BREAKER_OPEN_MESSAGE);

    (release as unknown as () => void)();
    expect((await probe).status).toBe(200);
    expect(rig.governor.snapshot().breakerState).toBe('closed');
  });

  it('closes on a successful probe and resumes ordinary traffic', async () => {
    const rig = makeRig();
    await openBreaker(rig);
    await rig.clock.advanceBy(BREAKER_WINDOW_MS);

    expect((await call(rig, SWEEP, OK)).status).toBe(200);
    expect(rig.governor.snapshot().breakerState).toBe('closed');

    // Closed means no claim at all, not one grudging request: a second and third
    // non-essential call go out with no probe latch left holding them back.
    expect((await call(rig, SWEEP, OK)).status).toBe(200);
    expect((await call(rig, SWEEP, OK)).status).toBe(200);

    const snap = rig.governor.snapshot();
    expect(rig.sent.length).toBe(BREAKER_LIMIT + 3);
    expect(snap.breakerBlocks).toBe(0);
    expect(snap.breakerOpens).toBe(1);
  });

  it('re-opens on a failed probe and counts a second breakerOpens', async () => {
    const rig = makeRig();
    await openBreaker(rig);
    await rig.clock.advanceBy(BREAKER_WINDOW_MS);

    // The aged window holds one entry after the probe's own 401, well under the
    // limit, so re-opening here is settleProbe's doing and not the counter's.
    expect((await call(rig, SWEEP, statusOnly(401))).status).toBe(401);

    const snap = rig.governor.snapshot();
    expect(snap.breakerState).toBe('open');
    expect(snap.breakerOpens).toBe(2);
    // Exactly two opens logged, never three: recordInvalid and settleProbe both
    // reach openBreaker on this path, and double counting here would be silent.
    expect(
      rig.logs.filter((l) => l.message === '[bot] invalid-request breaker opened').length,
    ).toBe(2);

    // A failed probe restarts the quiet window rather than handing out another
    // probe immediately.
    const error = await refused(rig, SWEEP);
    expect(error.reason).toBe('breaker-open');
    expect(rig.governor.snapshot().breakerBlocks).toBe(1);
  });

  it('re-opens when the probe answers an ordinary 429, not only a 401', async () => {
    // REGRESSION. absorb429 settled the probe on its non-JSON ban branch only, so
    // a probe that came back with a perfectly ordinary JSON 429 returned a retry
    // delay and never settled. The breaker was then parked in half-open forever:
    // probeInFlight cleared on completion, so EVERY later sweep request claimed a
    // fresh probe and the open state stopped meaning anything at all.
    const rig = makeRig();
    for (let i = 0; i < BREAKER_LIMIT; i++) {
      expect((await call(rig, SWEEP, statusOnly(403))).status).toBe(403);
    }
    expect(rig.governor.snapshot().breakerState).toBe('open');

    await rig.clock.advanceBy(BREAKER_WINDOW_MS);

    // The probe is rate limited and then succeeds on its retry. The retry's
    // success must NOT paper over the failed probe.
    expect((await call(rig, SWEEP, rateLimited('user'), OK)).status).toBe(200);

    const snap = rig.governor.snapshot();
    expect(snap.breakerState).toBe('open');
    expect(snap.breakerOpens).toBe(2);
    // And the reopened breaker really is refusing again, not merely labelled open.
    expect((await refused(rig, SWEEP)).reason).toBe('breaker-open');
  });

  it('does NOT fail the probe on a SHARED-scope 429, matching the counter rule', async () => {
    // The other arm of the same decision. D3 excludes scope `shared` from the
    // invalid-request window because it is another app's traffic against a shared
    // resource; it would be incoherent to leave it out of the counter and still
    // let it re-open the breaker. A probe that is shared-limited and then
    // succeeds has answered yes.
    const rig = makeRig();
    for (let i = 0; i < BREAKER_LIMIT; i++) {
      expect((await call(rig, SWEEP, statusOnly(403))).status).toBe(403);
    }
    await rig.clock.advanceBy(BREAKER_WINDOW_MS);

    expect((await call(rig, SWEEP, rateLimited('shared'), OK)).status).toBe(200);

    const snap = rig.governor.snapshot();
    expect(snap.breakerState).toBe('closed');
    expect(snap.breakerOpens).toBe(1);
    // Closed for real: ordinary sweep traffic flows again with no refusal.
    expect((await call(rig, SWEEP, OK)).status).toBe(200);
  });
});

describe('half-open probe ownership', () => {
  /** Trip the breaker, then let a full quiet window pass so a probe is available. */
  async function openThenQuiet(rig: Rig): Promise<void> {
    for (let i = 0; i < BREAKER_LIMIT; i++) {
      expect((await call(rig, SWEEP, statusOnly(403))).status).toBe(403);
    }
    expect(rig.governor.snapshot().breakerState).toBe('open');
    await rig.clock.advanceBy(BREAKER_WINDOW_MS);
  }

  it('does NOT let an ESSENTIAL success close the breaker on the sweeps behalf', async () => {
    // REGRESSION. `attempt` used to call settleProbe(true) on ANY successful
    // response, with no idea whether the request was the probe. Essential traffic
    // is never blocked, so a single slash-command reply arriving while the
    // breaker was half-open closed it for everyone, and the sweep that caused the
    // damage resumed on the strength of an unrelated request succeeding.
    const rig = makeRig();
    await openThenQuiet(rig);

    // While the breaker is HALF-OPEN and a probe is genuinely in flight, an
    // essential success must still not close it. This is the arm that makes the
    // `isProbe` half of the settle guard decisive: with the breaker merely OPEN,
    // settleProbe early-returns anyway, so dropping `isProbe` is invisible.
    // The probe is held open by a deferred the test resolves by hand, rather
    // than by a timed wait: the shared `call` helper drains the whole clock, so
    // anything clock-based would already have finished before the essential
    // request below could overlap it.
    let releaseProbe: (r: GovernorResponse) => void = () => {};
    const probeHeld = new Promise<GovernorResponse>((resolve) => {
      releaseProbe = resolve;
    });
    const probe = rig.governor.run(SWEEP, () => {
      rig.sent.push('probe');
      return probeHeld;
    });
    const probeSettled = probe.then(
      () => 'resolved',
      () => 'rejected',
    );
    // Let the probe be claimed and reach its send.
    await rig.clock.runAll();
    expect(rig.governor.snapshot().breakerState).toBe('half-open');

    // The essential reply lands DURING the probe and succeeds. Under the mutant
    // that settles on ANY success, this closes the breaker.
    expect((await call(rig, REPLY, OK)).status).toBe(200);
    expect(rig.governor.snapshot().breakerState).toBe('half-open');

    // Now let the probe itself finish, badly, and the breaker re-opens.
    releaseProbe(statusOnly(403));
    await rig.clock.runAll();
    await probeSettled;

    // The probe was the only request entitled to decide, and it failed, so the
    // breaker is open again on its own account.
    const afterProbe = rig.governor.snapshot();
    expect(afterProbe.breakerState).toBe('open');
    expect(afterProbe.breakerOpens).toBe(2);

    // More essential replies still succeed and still move nothing, and the
    // freshly restarted quiet window means the sweep is genuinely refused.
    expect((await call(rig, REPLY, OK)).status).toBe(200);
    expect((await call(rig, REPLY, OK)).status).toBe(200);
    const snap = rig.governor.snapshot();
    expect(snap.breakerState).toBe('open');
    expect(snap.breakerOpens).toBe(2);
    expect((await refused(rig, SWEEP)).reason).toBe('breaker-open');
  });

  it('settles a probe that never gets an answer instead of latching half-open', async () => {
    // REGRESSION. Every `return` in attempt settled the probe, but the
    // MAX_ATTEMPTS exhaustion path did not, and neither did a send callback that
    // threw. The breaker then sat in half-open with no probe in flight, so every
    // later request claimed a fresh probe and the open state stopped refusing
    // anything at all.
    const rig = makeRig();
    await openThenQuiet(rig);

    // The probe's send throws rather than answering.
    const boom = new Error('socket hang up');
    const thrown = await rig.governor
      .run(SWEEP, () => Promise.reject(boom))
      .catch((e: unknown) => e);
    expect(thrown).toBe(boom);

    // Unanswered is treated as failure: back to open, not stuck half-open.
    const snap = rig.governor.snapshot();
    expect(snap.breakerState).toBe('open');
    expect(snap.breakerOpens).toBe(2);
    expect((await refused(rig, SWEEP)).reason).toBe('breaker-open');
  });

  it('settles a probe whose retries are exhausted by a route that always 429s', async () => {
    const rig = makeRig();
    await openThenQuiet(rig);

    // Three attempts, all rate limited, so the loop falls out of the bottom.
    const last = await call(
      rig,
      SWEEP,
      rateLimited('user'),
      rateLimited('user'),
      rateLimited('user'),
    );
    expect(last.status).toBe(429);

    expect(rig.governor.snapshot().breakerState).toBe('open');
    expect((await refused(rig, SWEEP)).reason).toBe('breaker-open');
  });
});

describe('governor registry bounds', () => {
  it('bounds the learned route-to-bucket map, keeping the HOT route resolved', async () => {
    // REGRESSION. `limits` was LRU bounded and drained queues are dropped, but the
    // provisional-template to bucket-hash map had no cap at all. Interaction
    // callbacks are bucketed per interaction id (each id is a major parameter, so
    // each is its own template), which means one entry per slash command for the
    // life of the process.
    //
    // Re-insertion on every sighting is what makes the eviction least-recently-
    // used rather than first-in: the hot sweep template must survive a flood of
    // single-use interaction routes, or every sweep would lose its proactive
    // gating and have to relearn the bucket from the next response.
    const rig = makeRig();
    const hashed = (hash: string): GovernorResponse => ({
      status: 200,
      headers: { 'x-ratelimit-bucket': hash },
      json: {},
      jsonParsed: true,
    });

    await call(rig, SWEEP, hashed('sweep-bucket'));

    for (let i = 0; i < 600; i++) {
      // Keep touching the hot route so it stays the most recently used entry.
      if (i % 5 === 0) await call(rig, SWEEP, hashed('sweep-bucket'));
      // Built by string concatenation, NOT by adding to a numeric literal:
      // 1000000000000000000 is past Number.MAX_SAFE_INTEGER, so `literal + i`
      // silently collapses hundreds of iterations onto the same few ids, the
      // map never grows, and this test passes with the bound deleted.
      const interactionId = `1000000000000000${String(i).padStart(3, '0')}`;
      await call(
        rig,
        { method: 'POST', path: `/interactions/${interactionId}/tok/callback` },
        hashed(`interaction-${i}`),
      );
    }

    const snap = rig.governor.snapshot();
    // Bounded rather than 600-and-climbing.
    expect(snap.trackedRoutes).toBeLessThanOrEqual(512);
    expect(snap.trackedBuckets).toBeLessThanOrEqual(512);
    // Every queue drained, so none are retained.
    expect(snap.activeQueues).toBe(0);
    expect(snap.queueDepth).toBe(0);

    // The hot route is still resolved: it gates proactively on its NEXT call
    // without needing to relearn. Remaining 0 with a reset in the future must
    // hold the following request rather than letting it straight through.
    await call(rig, SWEEP, {
      status: 200,
      headers: {
        'x-ratelimit-bucket': 'sweep-bucket',
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset-after': '2',
      },
      json: {},
      jsonParsed: true,
    });
    const before = rig.clock.now();
    await call(rig, SWEEP, OK);
    expect(rig.clock.now() - before).toBeGreaterThanOrEqual(2000);
  });
});
