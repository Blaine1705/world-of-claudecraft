// The DiscordApi request envelope and its injected IO seams. Every method funnels
// through the one private `request()`, so driving `gatewayUrl()` and a couple of
// the writes covers the whole class. The last block constructs the client the way
// bot/main.ts does (token only) to prove the production defaults are still the
// real global fetch and a real setTimeout-backed sleep, which is the arm a broken
// default parameter would otherwise silently replace.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiscordApi } from '../bot/discord_api';

const API = 'https://discord.com/api/v10';

interface FetchCall {
  url: string;
  init: RequestInit;
}

/** A response carrying only the fields `request()` touches. */
function fakeResponse(opts: { status?: number; body?: unknown; text?: string } = {}): Response {
  const status = opts.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => opts.body,
    text: async () => opts.text ?? '',
  } as unknown as Response;
}

function recordingFetch(responses: Response[]): { calls: FetchCall[]; impl: typeof fetch } {
  const calls: FetchCall[] = [];
  const queue = [...responses];
  const impl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    const next = queue.shift();
    if (!next) throw new Error('recordingFetch ran out of queued responses');
    return next;
  };
  return { calls, impl };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('DiscordApi request envelope', () => {
  it('sends the bot token, the JSON content type, and the pinned User-Agent to /api/v10', async () => {
    const { calls, impl } = recordingFetch([fakeResponse({ body: { url: 'wss://gw.test' } })]);
    const api = new DiscordApi('tok', impl);

    expect(await api.gatewayUrl()).toBe('wss://gw.test');

    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe('https://discord.com/api/v10/gateway/bot');
    expect(calls[0].init.method).toBe('GET');
    expect(calls[0].init.headers).toEqual({
      // `Bot ` prefix, not `Bearer`: a bot token is rejected as a bearer token.
      Authorization: 'Bot tok',
      'Content-Type': 'application/json',
      'User-Agent': 'WorldOfClaudeCraftBot (https://worldofclaudecraft.com, 1.0)',
    });
    // No body key value on a GET.
    expect(calls[0].init.body).toBe(undefined);
  });

  it('falls back to the public gateway URL when the payload has none', async () => {
    const { impl } = recordingFetch([fakeResponse({ body: {} })]);
    expect(await new DiscordApi('tok', impl).gatewayUrl()).toBe('wss://gateway.discord.gg');
  });

  it('JSON-encodes a write body and returns null on 204', async () => {
    const { calls, impl } = recordingFetch([fakeResponse({ status: 204 })]);
    const api = new DiscordApi('tok', impl);

    await api.setNickname('g1', 'u1', 'Aran (12)');

    expect(calls[0].init.method).toBe('PATCH');
    expect(calls[0].url).toBe(`${API}/guilds/g1/members/u1`);
    expect(calls[0].init.body).toBe('{"nick":"Aran (12)"}');
  });

  it('throws with the status and the truncated response text on a non-ok status', async () => {
    const { impl } = recordingFetch([fakeResponse({ status: 403, text: 'x'.repeat(300) })]);
    const api = new DiscordApi('tok', impl);

    await expect(api.guildRoles('g1')).rejects.toThrow(
      `[bot] discord GET /guilds/g1/roles -> 403 ${'x'.repeat(200)}`,
    );
  });
});

describe('DiscordApi 429 retry', () => {
  it('waits the clamped retry_after ONCE and replays the same request', async () => {
    const slept: number[] = [];
    const { calls, impl } = recordingFetch([
      fakeResponse({ status: 429, body: { retry_after: 2 } }),
      fakeResponse({ body: [{ id: 'r1', name: 'WoC Initiate' }] }),
    ]);
    const api = new DiscordApi('tok', impl, async (ms) => {
      slept.push(ms);
    });

    expect(await api.guildRoles('g1')).toEqual([{ id: 'r1', name: 'WoC Initiate' }]);

    // retry_after is SECONDS, so 2 becomes 2000 ms, inside the 500..10000 clamp.
    expect(slept).toEqual([2000]);
    expect(calls.length).toBe(2);
    expect(calls[0].url).toBe(calls[1].url);
    expect(calls[0].init.method).toBe(calls[1].init.method);
  });

  it('clamps the wait to the 500 ms floor and the 10000 ms ceiling', async () => {
    for (const [retryAfter, expected] of [
      [0.01, 500],
      [30, 10_000],
    ] as const) {
      const slept: number[] = [];
      const { impl } = recordingFetch([
        fakeResponse({ status: 429, body: { retry_after: retryAfter } }),
        fakeResponse({ body: [] }),
      ]);
      await new DiscordApi('tok', impl, async (ms) => {
        slept.push(ms);
      }).guildRoles('g1');
      expect(slept).toEqual([expected]);
    }
  });

  it('defaults a missing retry_after to 1 second', async () => {
    const slept: number[] = [];
    const { impl } = recordingFetch([
      fakeResponse({ status: 429, body: {} }),
      fakeResponse({ body: [] }),
    ]);
    await new DiscordApi('tok', impl, async (ms) => {
      slept.push(ms);
    }).guildRoles('g1');
    expect(slept).toEqual([1000]);
  });

  it('retries at most once: a second 429 is thrown, not slept on again', async () => {
    const slept: number[] = [];
    const { calls, impl } = recordingFetch([
      fakeResponse({ status: 429, body: { retry_after: 1 } }),
      fakeResponse({ status: 429, body: { retry_after: 1 }, text: 'rate limited' }),
    ]);
    const api = new DiscordApi('tok', impl, async (ms) => {
      slept.push(ms);
    });

    // The retry flag is false on the replay, so the second 429 falls through to
    // the non-ok throw instead of looping. This is the unbounded-retry guard.
    await expect(api.guildRoles('g1')).rejects.toThrow('-> 429 rate limited');
    expect(slept).toEqual([1000]);
    expect(calls.length).toBe(2);
  });
});

describe('DiscordApi production defaults', () => {
  it('uses the real global fetch when constructed with the token alone', async () => {
    const seen: string[] = [];
    vi.stubGlobal('fetch', async (input: unknown) => {
      seen.push(String(input));
      return fakeResponse({ body: { url: 'wss://real.test' } });
    });

    try {
      // Exactly the construction in bot/main.ts: no fetch, no sleep.
      const api = new DiscordApi('tok');
      expect(await api.gatewayUrl()).toBe('wss://real.test');
    } finally {
      vi.unstubAllGlobals();
    }

    expect(seen).toEqual(['https://discord.com/api/v10/gateway/bot']);
  });

  it('backs the default retry sleep with the real global setTimeout', async () => {
    // Fake timers prove the default sleep is a genuine timer rather than an
    // accidental no-op: nothing resolves until the clock is advanced.
    vi.useFakeTimers();
    let settled = false;
    vi.stubGlobal('fetch', async () => fakeResponse({ status: 429, body: { retry_after: 5 } }));

    try {
      const pending = new DiscordApi('tok')
        .guildRoles('g1')
        .then(() => {
          settled = true;
        })
        .catch(() => {
          settled = true;
        });

      await vi.advanceTimersByTimeAsync(4999);
      expect(settled).toBe(false); // still inside the 5000 ms clamped wait

      await vi.advanceTimersByTimeAsync(1);
      await pending;
      expect(settled).toBe(true);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});
