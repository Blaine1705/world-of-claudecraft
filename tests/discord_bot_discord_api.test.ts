// The DiscordApi request envelope and its injected IO seams. Every method funnels
// through the one private `request()`, so driving a representative call covers the
// shared envelope, and a table drives the per-method method/path/body triples that
// only that method can get wrong. The production-defaults block constructs the
// client the way bot/main.ts does (token only) to prove the defaults are still the
// real global fetch and a real setTimeout-backed sleep, which is the arm a broken
// default parameter would otherwise silently replace.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiscordApi } from '../bot/discord_api';

const API = 'https://discord.com/api/v10';

interface FetchCall {
  url: string;
  init: RequestInit;
}

/** A response carrying only the fields `request()` touches. `reads` records every
 *  body read, so a test can prove a body was never parsed. */
function fakeResponse(
  opts: {
    status?: number;
    body?: unknown;
    text?: string;
    reads?: string[];
    jsonThrows?: boolean;
    textThrows?: boolean;
  } = {},
): Response {
  const status = opts.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      opts.reads?.push('json');
      if (opts.jsonThrows) throw new SyntaxError('Unexpected token < in JSON');
      return opts.body;
    },
    text: async () => {
      opts.reads?.push('text');
      if (opts.textThrows) throw new Error('body already consumed');
      return opts.text ?? '';
    },
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

  it('falls back to the public gateway URL for an EMPTY url, not just a missing one', async () => {
    // `||`, not `??`: Discord answering with an empty string would otherwise
    // hand the Gateway '' and every connect would target the bare query string.
    const { impl } = recordingFetch([fakeResponse({ body: { url: '' } })]);
    expect(await new DiscordApi('tok', impl).gatewayUrl()).toBe('wss://gateway.discord.gg');
  });

  it('returns null on a 204 WITHOUT reading the body', async () => {
    // The empty-body short circuit, pinned by the absent read rather than by the
    // return value alone: a 204 has no body, so falling through to resp.json()
    // relies entirely on its .catch to paper over the parse failure.
    const reads: string[] = [];
    const { impl } = recordingFetch([fakeResponse({ status: 204, reads })]);

    expect(await new DiscordApi('tok', impl).createGuildRole('g1', 'WoC Initiate')).toBe(null);
    expect(reads).toEqual([]);
  });

  it('returns null rather than throwing when a 200 body is not JSON', async () => {
    // Cloudflare and Discord both answer with HTML on some errors; the parse
    // guard is what stops that from throwing an unexpected shape at the caller.
    const { impl } = recordingFetch([fakeResponse({ jsonThrows: true })]);
    expect(await new DiscordApi('tok', impl).createGuildRole('g1', 'WoC Initiate')).toBe(null);
  });

  it('throws with the status and the response text TRUNCATED to 200 characters', async () => {
    const { impl } = recordingFetch([fakeResponse({ status: 403, text: 'x'.repeat(300) })]);
    const api = new DiscordApi('tok', impl);

    // An Error argument is message EQUALITY in vitest; a bare string would be a
    // substring match, which a 300-character slice would also satisfy, leaving
    // the truncation this test is named for completely unpinned.
    await expect(api.guildRoles('g1')).rejects.toThrow(
      new Error(`[bot] discord GET /guilds/g1/roles -> 403 ${'x'.repeat(200)}`),
    );
  });

  it('still throws with the status when the error body cannot be read', async () => {
    const { impl } = recordingFetch([fakeResponse({ status: 500, textThrows: true })]);
    await expect(new DiscordApi('tok', impl).guildRoles('g1')).rejects.toThrow(
      new Error('[bot] discord GET /guilds/g1/roles -> 500 '),
    );
  });

  it('normalizes a non-array roles payload to an empty array', async () => {
    // Discord answers this route with an error OBJECT on a permissions change;
    // without the guard the caller's role diff iterates a non-array and throws.
    const { impl } = recordingFetch([fakeResponse({ body: { message: 'Missing Access' } })]);
    expect(await new DiscordApi('tok', impl).guildRoles('g1')).toEqual([]);
  });
});

describe('DiscordApi per-method call envelopes', () => {
  // Every row is a method whose ONLY wire contract is its verb, path, and body.
  // A copy-paste slip between the add/remove role pair, or a lost EPHEMERAL
  // flag, is invisible to the shared-envelope tests above.
  const ROWS: {
    name: string;
    drive: (api: DiscordApi) => Promise<unknown>;
    method: string;
    path: string;
    body: string | undefined;
    response?: Response;
  }[] = [
    {
      name: 'registerGuildCommands',
      drive: (api) => api.registerGuildCommands('c1', 'g1', [{ name: 'whoami' }]),
      method: 'PUT',
      path: '/applications/c1/guilds/g1/commands',
      body: '[{"name":"whoami"}]',
    },
    {
      name: 'respondInteraction',
      drive: (api) => api.respondInteraction('i1', 'tkn', { content: 'hi' }),
      method: 'POST',
      path: '/interactions/i1/tkn/callback',
      // type 4 is CHANNEL_MESSAGE_WITH_SOURCE: the immediate visible reply.
      body: '{"type":4,"data":{"content":"hi"}}',
    },
    {
      name: 'deferInteraction (ephemeral)',
      drive: (api) => api.deferInteraction('i1', 'tkn', true),
      method: 'POST',
      path: '/interactions/i1/tkn/callback',
      // 64 is the EPHEMERAL flag; losing it posts a private reply publicly.
      body: '{"type":5,"data":{"flags":64}}',
    },
    {
      name: 'deferInteraction (public)',
      drive: (api) => api.deferInteraction('i1', 'tkn', false),
      method: 'POST',
      path: '/interactions/i1/tkn/callback',
      body: '{"type":5,"data":{}}',
    },
    {
      name: 'editOriginalResponse',
      drive: (api) => api.editOriginalResponse('app1', 'tkn', { content: 'done' }),
      method: 'PATCH',
      path: '/webhooks/app1/tkn/messages/@original',
      body: '{"content":"done"}',
    },
    {
      name: 'guildRoles',
      drive: (api) => api.guildRoles('g1'),
      method: 'GET',
      path: '/guilds/g1/roles',
      body: undefined,
      response: fakeResponse({ body: [] }),
    },
    {
      name: 'createGuildRole (default color)',
      drive: (api) => api.createGuildRole('g1', 'WoC Initiate'),
      method: 'POST',
      path: '/guilds/g1/roles',
      // color 0 means "no color"; hoist/mentionable false keep the tier roles
      // out of the member sidebar and out of @-mention range.
      body: '{"name":"WoC Initiate","color":0,"mentionable":false,"hoist":false}',
    },
    {
      name: 'createGuildRole (explicit color)',
      drive: (api) => api.createGuildRole('g1', 'WoC Champion', 0xff8800),
      method: 'POST',
      path: '/guilds/g1/roles',
      body: '{"name":"WoC Champion","color":16746496,"mentionable":false,"hoist":false}',
    },
    {
      name: 'addMemberRole',
      drive: (api) => api.addMemberRole('g1', 'u1', 'r1'),
      method: 'PUT',
      path: '/guilds/g1/members/u1/roles/r1',
      body: undefined,
    },
    {
      name: 'removeMemberRole',
      drive: (api) => api.removeMemberRole('g1', 'u1', 'r1'),
      method: 'DELETE',
      path: '/guilds/g1/members/u1/roles/r1',
      body: undefined,
    },
    {
      name: 'setNickname',
      drive: (api) => api.setNickname('g1', 'u1', 'Aran (12)'),
      method: 'PATCH',
      path: '/guilds/g1/members/u1',
      body: '{"nick":"Aran (12)"}',
    },
    {
      name: 'createMessage',
      drive: (api) => api.createMessage('ch1', { content: 'hello' }),
      method: 'POST',
      path: '/channels/ch1/messages',
      body: '{"content":"hello"}',
    },
  ];

  for (const row of ROWS) {
    it(`${row.name} sends ${row.method} ${row.path}`, async () => {
      const { calls, impl } = recordingFetch([row.response ?? fakeResponse({ body: {} })]);

      await row.drive(new DiscordApi('tok', impl));

      expect(calls.length).toBe(1);
      expect(calls[0].init.method).toBe(row.method);
      expect(calls[0].url).toBe(`${API}${row.path}`);
      expect(calls[0].init.body).toBe(row.body);
    });
  }
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
    // Both sides pinned to a literal, not just to each other: a relation-only
    // assertion holds even if BOTH requests go somewhere wrong.
    expect(calls[1].url).toBe(`${API}/guilds/g1/roles`);
    expect(calls[1].init.method).toBe('GET');
  });

  it('replays the BODY too, not just the method and path', async () => {
    // Every other retry arm drives a bodyless GET, so dropping `body` from the
    // recursive call was invisible. The likeliest 429 in this bot is a relay
    // post, which would then be replayed as an empty message.
    const { calls, impl } = recordingFetch([
      fakeResponse({ status: 429, body: { retry_after: 1 } }),
      fakeResponse({ body: {} }),
    ]);
    const api = new DiscordApi('tok', impl, async () => {});

    await api.createMessage('ch1', { content: 'hello' });

    expect(calls.length).toBe(2);
    expect(calls[1].init.body).toBe('{"content":"hello"}');
    expect(calls[1].url).toBe(`${API}/channels/ch1/messages`);
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

  it('falls back to the 1 second default when the 429 body is not JSON at all', async () => {
    // An edge 429 comes from Cloudflare ahead of Discord's own limiter and
    // carries HTML; without the parse guard the whole call throws instead of
    // backing off.
    const slept: number[] = [];
    const { impl } = recordingFetch([
      fakeResponse({ status: 429, jsonThrows: true }),
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
  it('reads the global fetch at CALL time, not at construction', async () => {
    // Construction happens BEFORE the stub deliberately. A capture-form default
    // (`= fetch`) would bind the pre-stub global here and never see the swap,
    // which is exactly the regression bot/CLAUDE.md's forward-to-the-global
    // invariant exists to prevent, and which a stub-then-construct ordering
    // cannot detect.
    const api = new DiscordApi('tok');

    const seen: { url: string; init: RequestInit | undefined }[] = [];
    // The stub takes BOTH parameters. A one-parameter stub cannot tell
    // `(...args) => fetch(...args)` from `(input) => fetch(input)`, and the
    // latter type-checks fine (TypeScript allows an arity-reduced function
    // where a wider one is expected), so every Discord call would go out with
    // no method, no Authorization, no User-Agent, and no body while the suite
    // stayed green.
    vi.stubGlobal('fetch', async (input: unknown, init?: RequestInit) => {
      seen.push({ url: String(input), init });
      return fakeResponse({ status: 204 });
    });

    try {
      await api.setNickname('g1', 'u1', 'Aran (12)');
    } finally {
      vi.unstubAllGlobals();
    }

    expect(seen.length).toBe(1);
    expect(seen[0].url).toBe('https://discord.com/api/v10/guilds/g1/members/u1');
    expect(seen[0].init?.method).toBe('PATCH');
    expect(seen[0].init?.headers).toEqual({
      Authorization: 'Bot tok',
      'Content-Type': 'application/json',
      'User-Agent': 'WorldOfClaudeCraftBot (https://worldofclaudecraft.com, 1.0)',
    });
    expect(seen[0].init?.body).toBe('{"nick":"Aran (12)"}');
  });

  it('backs the default retry sleep with the real global setTimeout', async () => {
    // Fake timers prove the default sleep is a genuine timer rather than an
    // accidental no-op: nothing resolves until the clock is advanced.
    // Constructed BEFORE the fake clock, per R16: the default is evaluated at
    // construction, so a form that captured setTimeout would bind the REAL one
    // here and never resolve under the fake clock. Installing the fake first
    // passes for both forms.
    const api = new DiscordApi('tok');
    vi.useFakeTimers();
    let settled = false;
    vi.stubGlobal('fetch', async () => fakeResponse({ status: 429, body: { retry_after: 5 } }));

    try {
      const pending = api
        .guildRoles('g1')
        .then(() => {
          settled = true;
        })
        .catch(() => {
          settled = true;
        });

      await vi.advanceTimersByTimeAsync(4999);
      expect(settled).toBe(false); // still inside the 5000 ms clamped wait

      // Assert BEFORE awaiting `pending`. Awaiting first would wait out a REAL
      // timer too, so a default that captured setTimeout at construction (and
      // therefore scheduled on the real clock, ignoring the fake) would still
      // settle eventually and pass. Advancing the FAKE clock has to be what
      // resolves it.
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toBe(true);
      await pending;
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});
