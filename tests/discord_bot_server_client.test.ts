// The ServerClient request envelope: what actually reaches the game server's
// secret-gated /internal/discord/* endpoints, and how the per-call abort
// deadline is armed and cleared. Everything runs through the injected fetch and
// timer seams, so there is no network IO and no real 8 second wait; the last
// case constructs the client the way bot/main.ts does (two arguments) to prove
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

  it('leaves the body key present but undefined when no body is passed', async () => {
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

  it('returns null when the fetch itself rejects, and still clears the deadline', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const timers = fakeTimers();
    const { impl } = recordingFetch(() => Promise.reject(new Error('socket hang up')));
    const client = new ServerClient('http://host', 'sekrit', impl, timers.seam);

    expect(await client.roles('u1')).toBe(null);
    expect(timers.cleared).toEqual([1]); // the finally runs on the throwing path too
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
});

describe('ServerClient production defaults', () => {
  it('uses the real global fetch and the real 8000 ms deadline when constructed with two arguments', async () => {
    const seen: string[] = [];
    const armedMs: number[] = [];
    const realSetTimeout = globalThis.setTimeout;
    vi.stubGlobal('fetch', async (input: unknown) => {
      seen.push(String(input));
      return fakeResponse({ body: { success: true, data: { items: [{ id: 7 }] }, error: null } });
    });
    // Delegates to the real timer so the deadline is a genuine handle the
    // client's finally can clear.
    vi.stubGlobal('setTimeout', (fn: () => void, ms?: number) => {
      armedMs.push(ms ?? -1);
      return realSetTimeout(fn, ms);
    });

    try {
      // Exactly the construction in bot/main.ts: no fetch, no timer seam.
      const client = new ServerClient('http://host:8787', 'sekrit');
      expect(await client.drainRelay()).toEqual([{ id: 7 }]);
    } finally {
      vi.unstubAllGlobals();
    }

    expect(seen).toEqual(['http://host:8787/internal/discord/relay']);
    // Exactly one arm, at the real deadline: the defaults read the globals and
    // pass the production timeout, not an injected one.
    expect(armedMs).toEqual([8000]);
  });
});
