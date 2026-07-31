// The ServerClient request envelope: what actually reaches the game server's
// secret-gated /internal/discord/* endpoints, and how the per-call abort
// deadline is armed and cleared. Everything runs through the injected fetch and
// timer seams, so there is no network IO and no real 8 second wait; the last
// block constructs the client the way bot/main.ts does (two arguments) to prove
// the production defaults are still the real globals.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SERVER_CALL_TIMEOUT_MS,
  ServerClient,
  type TimerHandle,
  type TimerSeam,
} from '../bot/server_client';

interface FetchCall {
  url: string;
  init: RequestInit;
}

/** A response carrying only the three fields `call()` touches. `reads` records
 *  every body read, so a test can prove a body was never parsed. */
function fakeResponse(opts: { status?: number; body?: unknown; reads?: string[] } = {}): Response {
  const status = opts.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      opts.reads?.push('json');
      return opts.body;
    },
  } as unknown as Response;
}

/** A fetch that logs every call and answers from the supplied responder. */
function recordingFetch(respond: (call: FetchCall) => Promise<Response> | Response): {
  calls: FetchCall[];
  impl: typeof fetch;
} {
  const calls: FetchCall[] = [];
  const impl: typeof fetch = async (input, init) => {
    const call: FetchCall = { url: String(input), init: init ?? {} };
    calls.push(call);
    return respond(call);
  };
  return { calls, impl };
}

/** A timer pair that arms nothing: the test fires the deadline by hand. */
function fakeTimers(): {
  armed: { fn: () => void; ms: number }[];
  cleared: TimerHandle[];
  seam: TimerSeam;
} {
  const armed: { fn: () => void; ms: number }[] = [];
  const cleared: TimerHandle[] = [];
  let nextHandle = 1;
  const seam: TimerSeam = {
    setTimeout: (fn, ms) => {
      armed.push({ fn, ms });
      return nextHandle++;
    },
    clearTimeout: (handle) => {
      cleared.push(handle);
    },
  };
  return { armed, cleared, seam };
}

/** A client whose every call succeeds with `data`, plus the recorded calls. */
function clientReturning(data: unknown): { calls: FetchCall[]; client: ServerClient } {
  const { calls, impl } = recordingFetch(() =>
    fakeResponse({ body: { success: true, data, error: null } }),
  );
  return { calls, client: new ServerClient('http://host', 'sekrit', impl, fakeTimers().seam) };
}

const ROLES_ENVELOPE = {
  success: true,
  data: { linked: true, statusTier: 3, points: 12, lifetimePoints: 40 },
  error: null,
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ServerClient request envelope', () => {
  it('sends the method, the RAW baseUrl + path concatenation, and the secret header', async () => {
    const timers = fakeTimers();
    const { calls, impl } = recordingFetch(() => fakeResponse({ body: ROLES_ENVELOPE }));
    // The trailing slash on the base is deliberate: nothing normalizes the URL.
    const client = new ServerClient('http://host:8787/', 'sekrit', impl, timers.seam);

    const roles = await client.roles('u 1');

    expect(calls.length).toBe(1);
    expect(calls[0].init.method).toBe('GET');
    // Both slashes survive, and the id is percent-encoded by the caller.
    expect(calls[0].url).toBe('http://host:8787//internal/discord/roles?discord_user_id=u%201');
    // Lowercase header name, the secret verbatim, no Bearer prefix, and the
    // JSON content type even though this GET carries no body.
    expect(calls[0].init.headers).toEqual({
      'x-woc-discord-secret': 'sekrit',
      'Content-Type': 'application/json',
    });
    expect(roles).toEqual({ linked: true, statusTier: 3, points: 12, lifetimePoints: 40 });
  });

  it('sends no body on a GET', async () => {
    // Note this does NOT pin the `body === undefined ? undefined :` ternary in
    // call(): JSON.stringify(undefined) is itself undefined, so the guard is
    // defensive rather than load-bearing and no assertion can distinguish it.
    // What this DOES pin is that a GET reaches fetch with no body at all.
    const timers = fakeTimers();
    const { calls, impl } = recordingFetch(() =>
      fakeResponse({ body: { success: true, data: { items: [] }, error: null } }),
    );
    const client = new ServerClient('http://host', 'sekrit', impl, timers.seam);

    await client.drainRelay();

    expect(calls[0].init.body).toBe(undefined);
    expect('body' in calls[0].init).toBe(true);
  });

  it('POSTs the body as JSON.stringify output, byte for byte', async () => {
    const timers = fakeTimers();
    const { calls, impl } = recordingFetch(() =>
      fakeResponse({ body: { success: true, data: null, error: null } }),
    );
    const client = new ServerClient('http://host', 'sekrit', impl, timers.seam);

    await client.markDailyRewardWinners('2026-07-30');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].url).toBe('http://host/internal/discord/daily-rewards-winners/mark');
    expect(calls[0].init.body).toBe('{"day":"2026-07-30"}');

    // An absent dedupe key is dropped by JSON.stringify, not sent as null: the
    // server treats a null key as a real value and would dedupe against it.
    await client.grant('u1', 'daily', 5);
    expect(calls[1].init.body).toBe('{"discord_user_id":"u1","reason":"daily","points":5}');

    await client.grant('u1', 'daily', 5, 'k1');
    expect(calls[2].init.body).toBe(
      '{"discord_user_id":"u1","reason":"daily","points":5,"dedupeKey":"k1"}',
    );
  });
});

const ROUTE_ROWS: {
  name: string;
  methodName: string;
  drive: (c: ServerClient) => Promise<unknown>;
  method: string;
  path: string;
  body: string | undefined;
  data: unknown;
}[] = [
  {
    name: 'flex',
    methodName: 'flex',
    drive: (c) => c.flex('u 1'),
    method: 'GET',
    path: '/internal/discord/flex?discord_user_id=u%201',
    body: undefined,
    data: { linked: true },
  },
  {
    name: 'roles',
    methodName: 'roles',
    drive: (c) => c.roles('u 1'),
    method: 'GET',
    path: '/internal/discord/roles?discord_user_id=u%201',
    body: undefined,
    data: {},
  },
  {
    name: 'pushPresence',
    methodName: 'pushPresence',
    drive: (c) =>
      c.pushPresence({ onlineCount: 3, memberTotal: 9, voiceChannelName: null, voice: [] }),
    method: 'POST',
    path: '/internal/discord/presence',
    body: '{"onlineCount":3,"memberTotal":9,"voiceChannelName":null,"voice":[]}',
    data: {},
  },
  {
    name: 'setMember',
    methodName: 'setMember',
    drive: (c) => c.setMember('u1', true),
    method: 'POST',
    path: '/internal/discord/member',
    body: '{"discord_user_id":"u1","guildMember":true}',
    data: {},
  },
  {
    name: 'grant',
    methodName: 'grant',
    drive: (c) => c.grant('u1', 'daily', 5, 'k1'),
    method: 'POST',
    // The points-granting call: a path swap here silently stops every reward.
    path: '/internal/discord/grant',
    body: '{"discord_user_id":"u1","reason":"daily","points":5,"dedupeKey":"k1"}',
    data: {},
  },
  {
    name: 'markDailyRewardWinners',
    methodName: 'markDailyRewardWinners',
    drive: (c) => c.markDailyRewardWinners('2026-07-30'),
    method: 'POST',
    path: '/internal/discord/daily-rewards-winners/mark',
    body: '{"day":"2026-07-30"}',
    data: {},
  },
  {
    name: 'drainRelay',
    methodName: 'drainRelay',
    drive: (c) => c.drainRelay(),
    method: 'GET',
    path: '/internal/discord/relay',
    body: undefined,
    data: { items: [] },
  },
  {
    name: 'drainActivity',
    methodName: 'drainActivity',
    drive: (c) => c.drainActivity(),
    method: 'GET',
    path: '/internal/discord/activity',
    body: undefined,
    data: { items: [] },
  },
  {
    name: 'dailyRewardWinners',
    methodName: 'dailyRewardWinners',
    drive: (c) => c.dailyRewardWinners(),
    method: 'GET',
    // limit=2 decides how many days of winners can still be announced after a
    // missed run; shrinking it silently drops a day.
    path: '/internal/discord/daily-rewards-winners?limit=2',
    body: undefined,
    data: { days: [] },
  },
  {
    name: 'pushMembersMeta',
    methodName: 'pushMembersMeta',
    drive: (c) =>
      c.pushMembersMeta([{ discord_user_id: 'u1', name: 'A', joinedAtMs: 1, role: null }]),
    method: 'POST',
    path: '/internal/discord/members-meta',
    body: '{"members":[{"discord_user_id":"u1","name":"A","joinedAtMs":1,"role":null}]}',
    data: { updated: 1 },
  },
  {
    name: 'flairedIds',
    methodName: 'flairedIds',
    drive: (c) => c.flairedIds(),
    method: 'GET',
    path: '/internal/discord/flaired-ids',
    body: undefined,
    data: { ids: [] },
  },
];

describe('ServerClient per-endpoint routes', () => {
  // Each row is the ONE wire contract only that method can get wrong. A typo in
  // any path 404s, call() returns null, and the drain methods answer with an
  // empty array, so the feed stops with no error surface at all.

  for (const row of ROUTE_ROWS) {
    it(`${row.name} sends ${row.method} ${row.path}`, async () => {
      const { calls, client } = clientReturning(row.data);

      await row.drive(client);

      expect(calls.length).toBe(1);
      expect(calls[0].init.method).toBe(row.method);
      expect(calls[0].url).toBe(`http://host${row.path}`);
      expect(calls[0].init.body).toBe(row.body);
    });
  }
});

describe('ServerClient envelope handling', () => {
  it('returns null for a { success: false } envelope on an HTTP 200', async () => {
    const timers = fakeTimers();
    const { impl } = recordingFetch(() =>
      // Data IS present: only the success flag decides, so a server-side
      // failure never reaches the caller as a half-filled record.
      fakeResponse({ body: { success: false, data: { linked: true }, error: 'nope' } }),
    );
    const client = new ServerClient('http://host', 'sekrit', impl, timers.seam);

    expect(await client.roles('u1')).toBe(null);
    expect(timers.cleared).toEqual([1]);
  });

  it('returns null on a non-ok status and never reads the body', async () => {
    const errors: unknown[][] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args);
    });
    const reads: string[] = [];
    const timers = fakeTimers();
    const { impl } = recordingFetch(() =>
      fakeResponse({ status: 500, body: { success: true, data: { items: [1] } }, reads }),
    );
    const client = new ServerClient('http://host', 'sekrit', impl, timers.seam);

    expect(await client.drainRelay()).toEqual([]);
    expect(reads).toEqual([]);
    expect(errors).toEqual([['[bot] server GET /internal/discord/relay -> 500']]);
  });

  it('treats a 3xx as not-ok, not just a 5xx', async () => {
    // 200 and 500 agree under every plausible rewrite of `!resp.ok`, including
    // `resp.status >= 400`. A redirect is where they part: the game server
    // answering 301 (a proxy misconfiguration, the realistic case) must not be
    // read as success and parsed as an envelope.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reads: string[] = [];
    const timers = fakeTimers();
    const { impl } = recordingFetch(() =>
      fakeResponse({ status: 301, body: { success: true, data: { items: [1] } }, reads }),
    );
    const client = new ServerClient('http://host', 'sekrit', impl, timers.seam);

    expect(await client.drainRelay()).toEqual([]);
    expect(reads).toEqual([]);
  });

  it('returns null when the fetch itself rejects, and still clears the deadline', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const timers = fakeTimers();
    const { impl } = recordingFetch(() => Promise.reject(new Error('socket hang up')));
    const client = new ServerClient('http://host', 'sekrit', impl, timers.seam);

    expect(await client.roles('u1')).toBe(null);
    expect(timers.cleared).toEqual([1]); // the finally runs on the throwing path too
  });
});

describe('ServerClient response unwrapping', () => {
  it('returns the payload each accessor is named for, not the envelope', async () => {
    // The route table above asserts what goes OUT; this asserts what comes back.
    // Each of these reaches into a differently-named field of `data`, so a
    // copy-paste slip (activity reading `days`, winners reading `items`) yields
    // undefined, and the `?? []` fallback then hides it as an empty feed.
    expect(await clientReturning({ linked: true, level: 12 }).client.flex('u1')).toEqual({
      linked: true,
      level: 12,
    });
    expect(await clientReturning({ items: [{ id: 'a' }] }).client.drainActivity()).toEqual([
      { id: 'a' },
    ]);
    expect(
      await clientReturning({ days: [{ day: '2026-07-30' }] }).client.dailyRewardWinners(),
    ).toEqual([{ day: '2026-07-30' }]);
    expect(await clientReturning({ ids: ['a'] }).client.flairedIds()).toEqual(['a']);
  });

  it('covers every public method of the class in the route table', () => {
    // Ties the table to the SURFACE: a method added to ServerClient without a
    // row here would otherwise ship with no path assertion at all, which is the
    // state seven of the twelve were in before this suite grew.
    const publicMethods = Object.getOwnPropertyNames(ServerClient.prototype)
      // `call` is the private shared helper; TS `private` is erased at runtime.
      .filter((n) => n !== 'constructor' && n !== 'call')
      .sort();
    const covered = [...new Set(ROUTE_ROWS.map((r) => r.methodName))].sort();
    expect(covered).toEqual(publicMethods);
  });
});

describe('ServerClient drain fallbacks', () => {
  it('answers with an empty list when the call fails, for every drain', async () => {
    // Each drain ends in `?? []`. Without it a failed call hands the caller
    // undefined and the poll loop throws on the next `.length`, killing the
    // loop rather than skipping one cycle. drainRelay is covered above; these
    // are the two that were not.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const timers = fakeTimers();
    const failing = () =>
      new ServerClient(
        'http://host',
        'sekrit',
        recordingFetch(() => fakeResponse({ status: 500 })).impl,
        timers.seam,
      );

    expect(await failing().drainActivity()).toEqual([]);
    expect(await failing().dailyRewardWinners()).toEqual([]);
    // And a 200 whose envelope carries no list at all.
    expect(await clientReturning({}).client.drainActivity()).toEqual([]);
    expect(await clientReturning({}).client.dailyRewardWinners()).toEqual([]);
  });
});

describe('ServerClient flairedIds null-versus-empty contract', () => {
  it('returns the ids, keeping only the strings', async () => {
    // The reconcile treats every id it gets back as "still flaired"; a stray
    // number would stringify into an id that matches nobody and silently drop
    // that member's flair.
    const { client } = clientReturning({ ids: ['a', 1, null, 'b', { id: 'c' }] });
    expect(await client.flairedIds()).toEqual(['a', 'b']);
  });

  it('returns an EMPTY ARRAY for a real "nothing flagged" answer', async () => {
    const { client } = clientReturning({ ids: [] });
    expect(await client.flairedIds()).toEqual([]);
  });

  it('returns NULL when the server is unreachable or the payload is malformed', async () => {
    // Null means "change nothing" per the method's own doc comment. Collapsing
    // it to an empty array would tell the departed-member reconcile that every
    // linked member lost their flair, and strip the lot.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const timers = fakeTimers();

    const unreachable = new ServerClient(
      'http://host',
      'sekrit',
      recordingFetch(() => fakeResponse({ status: 503 })).impl,
      timers.seam,
    );
    expect(await unreachable.flairedIds()).toBe(null);

    for (const ids of [undefined, null, 'a,b', { 0: 'a' }, 7]) {
      const { client } = clientReturning({ ids });
      expect(await client.flairedIds()).toBe(null);
    }
  });
});

describe('ServerClient pushMembersMeta silent-drop warning', () => {
  it('warns when a NON-EMPTY push processed zero rows', async () => {
    // The server coerces an over-cap body to an empty member list and still
    // answers 200 { updated: 0 }, so this is the one silent-drop signature.
    const errors: unknown[][] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args);
    });
    const { client } = clientReturning({ updated: 0 });

    await client.pushMembersMeta([
      { discord_user_id: 'u1', name: 'A', joinedAtMs: null, role: null },
      { discord_user_id: 'u2', name: 'B', joinedAtMs: null, role: null },
    ]);

    expect(errors).toEqual([['[bot] members-meta push of 2 processed 0 rows']]);
  });

  it('REPORTS the silent drop as a failure, not just as a log line', async () => {
    // Load bearing since the caller started diffing. The caller marks a batch as
    // successfully pushed from this return value, so answering the truthy
    // `{ updated: 0 }` here would let it record a batch the server demonstrably
    // dropped, and the diff would then suppress the retry for the life of the
    // process instead of for one sweep. Before diffing existed the roster was
    // re-pushed wholesale every sweep, so the drop healed itself and only a
    // warning was needed.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client } = clientReturning({ updated: 0 });
    const result = await client.pushMembersMeta([
      { discord_user_id: 'u1', name: 'A', joinedAtMs: null, role: null },
    ]);
    expect(result).toBeNull();
  });

  it('still returns the payload when rows WERE processed', async () => {
    // The complement: a real success must not be reported as a failure, or every
    // push would be retried forever and the diff would never settle.
    const { client } = clientReturning({ updated: 2 });
    const result = await client.pushMembersMeta([
      { discord_user_id: 'u1', name: 'A', joinedAtMs: null, role: null },
      { discord_user_id: 'u2', name: 'B', joinedAtMs: null, role: null },
    ]);
    expect(result).toEqual({ updated: 2 });
  });

  it('stays quiet when rows were processed, when the push was empty, and on failure', async () => {
    const errors: unknown[][] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args);
    });
    const member = { discord_user_id: 'u1', name: 'A', joinedAtMs: null, role: null };

    // Rows processed: nothing to report.
    await clientReturning({ updated: 1 }).client.pushMembersMeta([member]);
    // An empty push legitimately updates nothing, so the guard is on the
    // REQUEST being non-empty, not on the response alone.
    await clientReturning({ updated: 0 }).client.pushMembersMeta([]);

    expect(errors).toEqual([]);

    // A failed call returns null, which must not be read as a zero-row success.
    const timers = fakeTimers();
    const failed = new ServerClient(
      'http://host',
      'sekrit',
      recordingFetch(() => fakeResponse({ status: 500 })).impl,
      timers.seam,
    );
    await failed.pushMembersMeta([member]);
    expect(errors).toEqual([['[bot] server POST /internal/discord/members-meta -> 500']]);
  });
});

describe('ServerClient call deadline', () => {
  it('pins the per-call deadline at 8000 ms', () => {
    expect(SERVER_CALL_TIMEOUT_MS).toBe(8000);
  });

  it('arms the deadline at 8000 ms and aborts the in-flight request when it fires', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const timers = fakeTimers();
    const signals: AbortSignal[] = [];
    // A fetch that never settles on its own: only the abort ends it.
    const impl: typeof fetch = (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          signals.push(signal);
          signal.addEventListener('abort', () => reject(new Error('The operation was aborted')));
        }
      });
    const client = new ServerClient('http://host', 'sekrit', impl, timers.seam);

    const pending = client.roles('u1');
    expect(timers.armed.length).toBe(1);
    expect(timers.armed[0].ms).toBe(8000);
    expect(signals[0].aborted).toBe(false);

    timers.armed[0].fn(); // fire the deadline

    expect(signals[0].aborted).toBe(true);
    expect(await pending).toBe(null);
    expect(timers.cleared).toEqual([1]);
  });

  it('arms and clears one deadline PER call, each with its own signal', async () => {
    const timers = fakeTimers();
    const { calls, impl } = recordingFetch(() => fakeResponse({ body: ROLES_ENVELOPE }));
    const client = new ServerClient('http://host', 'sekrit', impl, timers.seam);

    await client.roles('u1');
    await client.roles('u2');

    expect(timers.armed.map((t) => t.ms)).toEqual([8000, 8000]);
    // Cleared on the success path too: without the finally, every call would
    // leak an 8 second handle.
    expect(timers.cleared).toEqual([1, 2]);
    expect(calls[0].init.signal).not.toBe(calls[1].init.signal);
  });

  it('keeps each in-flight call on its OWN handle and signal when they overlap', async () => {
    // The sequential test above cannot see a shared handle: call 2 arms after
    // call 1 has already cleared. The bot's poll loops genuinely overlap (six
    // of them, two on a 3 second tick), so a shared controller would let one
    // call's deadline abort another's request.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const timers = fakeTimers();
    const settle: ((r: Response) => void)[] = [];
    const signals: (AbortSignal | null | undefined)[] = [];
    const impl: typeof fetch = (_input, init) => {
      signals.push(init?.signal);
      return new Promise<Response>((resolve, reject) => {
        settle.push(resolve);
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    };
    const client = new ServerClient('http://host', 'sekrit', impl, timers.seam);

    const first = client.roles('u1');
    const second = client.roles('u2');
    expect(timers.armed.length).toBe(2);
    expect(signals[0]).not.toBe(signals[1]);

    // Firing only the FIRST deadline must abort only the first request.
    timers.armed[0].fn();
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);

    expect(await first).toBe(null);
    settle[1](fakeResponse({ body: ROLES_ENVELOPE }));
    expect(await second).toEqual({ linked: true, statusTier: 3, points: 12, lifetimePoints: 40 });
    expect([...timers.cleared].sort((a, b) => Number(a) - Number(b))).toEqual([1, 2]);
  });
});

describe('ServerClient production defaults', () => {
  it('reads the global fetch and timers at CALL time, and clears the handle it armed', async () => {
    // Exactly the construction in bot/main.ts: no fetch, no timer seam. It
    // happens BEFORE the stubs deliberately, because a capture-form default
    // (`= fetch`, `= { setTimeout, clearTimeout }`) would bind the pre-stub
    // globals and never see the swap. That is the regression bot/CLAUDE.md's
    // forward-to-the-global invariant exists to prevent, and a
    // stub-then-construct ordering cannot detect it.
    const client = new ServerClient('http://host:8787', 'sekrit');

    const seen: { url: string; init: RequestInit | undefined }[] = [];
    const armed: { ms: number; handle: unknown }[] = [];
    const cleared: unknown[] = [];
    const realSetTimeout = globalThis.setTimeout;
    const realClearTimeout = globalThis.clearTimeout;
    // Both parameters, deliberately. A one-parameter stub cannot tell
    // `(...args) => fetch(...args)` from `(input) => fetch(input)`, and the
    // arity-reduced form type-checks, so every internal call would lose its
    // secret header, its method, its body, and its abort signal unnoticed.
    vi.stubGlobal('fetch', async (input: unknown, init?: RequestInit) => {
      seen.push({ url: String(input), init });
      return fakeResponse({ body: { success: true, data: { items: [{ id: 7 }] }, error: null } });
    });
    // Delegates to the real timer so the deadline is a genuine handle the
    // client's finally can clear.
    vi.stubGlobal('setTimeout', (fn: () => void, ms?: number) => {
      const handle = realSetTimeout(fn, ms);
      armed.push({ ms: ms ?? -1, handle });
      return handle;
    });
    vi.stubGlobal('clearTimeout', (handle: unknown) => {
      cleared.push(handle);
      realClearTimeout(handle as Parameters<typeof clearTimeout>[0]);
    });

    try {
      expect(await client.drainRelay()).toEqual([{ id: 7 }]);
    } finally {
      vi.unstubAllGlobals();
    }

    expect(seen.length).toBe(1);
    expect(seen[0].url).toBe('http://host:8787/internal/discord/relay');
    expect(seen[0].init?.method).toBe('GET');
    // The shared secret is the whole authentication story for /internal/*: a
    // forwarder that drops `init` would strip it and every call would 401.
    expect(seen[0].init?.headers).toEqual({
      'x-woc-discord-secret': 'sekrit',
      'Content-Type': 'application/json',
    });
    expect(seen[0].init?.signal).toBeInstanceOf(AbortSignal);
    // Exactly one arm, at the real deadline: the defaults read the globals and
    // pass the production timeout, not an injected one.
    expect(armed.map((a) => a.ms)).toEqual([8000]);
    // And the default clearTimeout really cancels THAT handle. Without this the
    // member could be a no-op and every call would leak a live 8 second timer;
    // the relay poller runs every 3 seconds, so the backlog is permanent.
    expect(cleared).toEqual([armed[0].handle]);
  });
});
