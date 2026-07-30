// The Gateway socket seam. Two directions matter and they need opposite setups,
// so `ws` is module-mocked for the whole file: the DEFAULT socket factory must
// construct the real `ws` client at the real gateway URL (the arm a broken
// default parameter would silently replace), and an INJECTED factory must be
// used instead of it. The mock stands in for the `ws` module so neither arm
// opens a socket; asserting the mocked constructor was called IS the proof that
// the default routes through `ws`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Every socket the code under test constructed, in order. */
const constructed: { url: string; socket: FakeSocket }[] = [];

class FakeSocket {
  static OPEN = 1;
  readyState: number = FakeSocket.OPEN;
  readonly listeners = new Map<string, (arg: unknown) => void>();
  readonly sent: string[] = [];
  terminated = 0;
  closed = 0;
  listenersRemoved = 0;

  constructor(url: string) {
    constructed.push({ url, socket: this });
  }

  on(event: string, cb: (arg: unknown) => void): this {
    this.listeners.set(event, cb);
    return this;
  }

  send(data: string): void {
    this.sent.push(data);
  }

  terminate(): void {
    this.terminated += 1;
  }

  close(): void {
    this.closed += 1;
  }

  // Gateway.reconnect() calls this FIRST; without it the real call throws into
  // its own `catch {}` and close() is never reached, which would make the
  // teardown half of a reconnect untestable (and silently so).
  removeAllListeners(): void {
    this.listenersRemoved += 1;
    this.listeners.clear();
  }

  emit(event: string, arg?: unknown): void {
    this.listeners.get(event)?.(arg);
  }
}

vi.mock('ws', () => ({ WebSocket: FakeSocket }));

// Imported AFTER the mock declaration; vi.mock is hoisted, so bot/gateway.ts
// binds to FakeSocket rather than the real client.
const { Gateway } = await import('../bot/gateway');

function noopHandlers() {
  return { onDispatch: () => {} };
}

/** Timers that record rather than run, so no test waits on a real delay. */
function fakeTimers() {
  const armed: { ms: number; fn: () => void }[] = [];
  const intervals: { ms: number; fn: () => void }[] = [];
  const cleared: unknown[] = [];
  let nextInterval = 1;
  return {
    armed,
    intervals,
    cleared,
    seam: {
      setTimeout: (fn: () => void, ms: number) => {
        armed.push({ fn, ms });
        return 0 as unknown as ReturnType<typeof setTimeout>;
      },
      setInterval: (fn: () => void, ms: number) => {
        intervals.push({ fn, ms });
        return nextInterval++ as unknown as ReturnType<typeof setInterval>;
      },
      clearInterval: (id: ReturnType<typeof setInterval>) => {
        cleared.push(id);
      },
    },
  };
}

/** A Gateway on an injected socket + injected timers, the rig most arms need. */
function rig(): {
  socket: FakeSocket;
  timers: ReturnType<typeof fakeTimers>;
  gateway: InstanceType<typeof Gateway>;
  factoryUrls: string[];
  sockets: FakeSocket[];
} {
  const timers = fakeTimers();
  const factoryUrls: string[] = [];
  const sockets: FakeSocket[] = [];
  const gateway = new Gateway(
    'tok',
    'wss://gateway.discord.gg',
    noopHandlers(),
    (url) => {
      factoryUrls.push(url);
      const s = new FakeSocket('injected');
      sockets.push(s);
      return s as unknown as never;
    },
    timers.seam,
  );
  gateway.connect(false);
  return { socket: sockets[0], timers, gateway, factoryUrls, sockets };
}

/** Deliver one gateway frame the way `ws` does, as a Buffer. */
function frame(socket: FakeSocket, payload: unknown): void {
  socket.emit('message', Buffer.from(JSON.stringify(payload)));
}

function lastSent(socket: FakeSocket): { op: number; d: Record<string, unknown> } {
  return JSON.parse(socket.sent[socket.sent.length - 1]) as {
    op: number;
    d: Record<string, unknown>;
  };
}

beforeEach(() => {
  constructed.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Gateway production defaults', () => {
  it('constructs the real ws client at the v10 JSON gateway URL with three arguments', () => {
    // Exactly the construction in bot/main.ts: token, gateway URL, handlers.
    // No socket factory, no timers.
    const gateway = new Gateway('tok', 'wss://gateway.discord.gg', noopHandlers());

    gateway.connect(false);

    expect(constructed.length).toBe(1);
    // The query string is what selects protocol v10 and JSON (not ETF) encoding;
    // dropping either silently changes the wire format the parser expects.
    expect(constructed[0].url).toBe('wss://gateway.discord.gg/?v=10&encoding=json');
    expect(constructed[0].socket).toBeInstanceOf(FakeSocket);
  });

  it('registers the message, close, and error listeners on the default socket', () => {
    const gateway = new Gateway('tok', 'wss://gateway.discord.gg', noopHandlers());
    gateway.connect(false);

    expect([...constructed[0].socket.listeners.keys()].sort()).toEqual([
      'close',
      'error',
      'message',
    ]);
  });

  it('runs the reconnect delay and the heartbeat on the REAL global timers', async () => {
    // The socket factory has a default-path test above; the timers seam did not,
    // so replacing all three members with no-ops used to keep the suite green
    // while the production bot would never heartbeat and never reconnect.
    vi.useFakeTimers();
    const gateway = new Gateway('tok', 'wss://gateway.discord.gg', noopHandlers());
    gateway.connect(false);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // A HELLO on the default timers must arm a real interval.
    frame(constructed[0].socket, { op: 10, d: { heartbeat_interval: 30_000 } });
    expect(constructed[0].socket.sent.length).toBe(1); // IDENTIFY
    await vi.advanceTimersByTimeAsync(30_000);
    expect(lastSent(constructed[0].socket).op).toBe(1); // the heartbeat fired

    // And an abnormal close must arm a real 2000 ms reconnect.
    constructed[0].socket.emit('close', 1006);
    expect(constructed.length).toBe(1);
    await vi.advanceTimersByTimeAsync(1999);
    expect(constructed.length).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(constructed.length).toBe(2);
  });
});

describe('Gateway injected socket factory', () => {
  it('uses the injected factory INSTEAD of the default, with the same URL', () => {
    const seen: string[] = [];
    const injected = new FakeSocket('unused');
    const gateway = new Gateway(
      'tok',
      'wss://gateway.discord.gg',
      noopHandlers(),
      (url) => {
        seen.push(url);
        return injected as unknown as never;
      },
      fakeTimers().seam,
    );

    // The factory pushed 'unused' at its own construction, so reset the log the
    // Gateway sees to prove the DEFAULT path did not also run.
    constructed.length = 0;
    gateway.connect(false);

    expect(seen).toEqual(['wss://gateway.discord.gg/?v=10&encoding=json']);
    expect(constructed).toEqual([]); // the default never constructed a socket
  });

  it('IDENTIFYs over the injected socket on HELLO and starts the heartbeat', () => {
    const { socket, timers } = rig();

    // 30000 deliberately, NOT 41250: 41250 is heartbeatIntervalMs's own default,
    // so a gateway that ignored the HELLO payload entirely would still produce
    // it and the assertion could not fail.
    frame(socket, { op: 10, d: { heartbeat_interval: 30_000 } });

    expect(timers.intervals.map((i) => i.ms)).toEqual([30_000]);
    const identify = lastSent(socket);
    expect(identify.op).toBe(2); // IDENTIFY
    expect(identify.d.token).toBe('tok');
  });
});

describe('Gateway heartbeat', () => {
  it('beats with the last seq it saw, and clears acked before each beat', () => {
    const { socket, timers } = rig();
    frame(socket, { op: 10, d: { heartbeat_interval: 30_000 } });
    // A DISPATCH carrying s=7 is what advances the sequence the heartbeat sends;
    // without seq tracking Discord cannot tell what the RESUME already delivered.
    frame(socket, { op: 0, s: 7, t: 'GUILD_CREATE', d: {} });

    timers.intervals[0].fn();

    expect(lastSent(socket)).toEqual({ op: 1, d: 7 });
  });

  it('terminates a zombie socket when a beat goes unacked, and resumes after an ACK', () => {
    const { socket, timers } = rig();
    frame(socket, { op: 10, d: { heartbeat_interval: 30_000 } });
    const beat = timers.intervals[0].fn;

    beat(); // acked starts true: this one sends
    expect(socket.terminated).toBe(0);
    beat(); // no ACK arrived: the connection is a zombie
    expect(socket.terminated).toBe(1);
    // A terminate must not also send: that is the whole point of the early return.
    expect(socket.sent.filter((s) => JSON.parse(s).op === 1).length).toBe(1);

    // op 11 is HEARTBEAT_ACK; once it lands the next beat sends again.
    frame(socket, { op: 11 });
    beat();
    expect(socket.terminated).toBe(1);
    expect(socket.sent.filter((s) => JSON.parse(s).op === 1).length).toBe(2);
  });

  it('answers a server-requested heartbeat (op 1) immediately', () => {
    const { socket } = rig();
    frame(socket, { op: 10, d: { heartbeat_interval: 30_000 } });
    frame(socket, { op: 0, s: 3, t: 'READY', d: {} });

    frame(socket, { op: 1 });

    expect(lastSent(socket)).toEqual({ op: 1, d: 3 });
  });

  it('stops the heartbeat on close, so a reconnect does not stack a second one', () => {
    const { socket, timers } = rig();
    frame(socket, { op: 10, d: { heartbeat_interval: 30_000 } });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    socket.emit('close', 1006);

    // The interval handle armed by startHeartbeat is the one cleared.
    expect(timers.cleared).toEqual([1]);
  });
});

describe('Gateway resume', () => {
  it('captures the session from READY and RESUMEs to the resume URL after a drop', () => {
    const { socket, timers, factoryUrls, sockets } = rig();
    frame(socket, { op: 10, d: { heartbeat_interval: 30_000 } });
    frame(socket, {
      op: 0,
      s: 12,
      t: 'READY',
      d: { session_id: 'sess-1', resume_gateway_url: 'wss://resume.discord.gg' },
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    socket.emit('close', 1006);
    timers.armed[0].fn(); // fire the 2000 ms reconnect

    // The old socket is torn down before the new one opens.
    expect(socket.listenersRemoved).toBe(1);
    expect(socket.closed).toBe(1);
    // The RESUME goes to the resume_gateway_url Discord handed back, not the
    // original gateway URL: reconnecting to the base URL loses the session.
    expect(factoryUrls[1]).toBe('wss://resume.discord.gg/?v=10&encoding=json');

    frame(sockets[1], { op: 10, d: { heartbeat_interval: 30_000 } });
    const resume = lastSent(sockets[1]);
    expect(resume.op).toBe(6); // RESUME, not IDENTIFY
    expect(resume.d).toEqual({ token: 'tok', session_id: 'sess-1', seq: 12 });
  });

  it('IDENTIFYs instead of RESUMEing when READY never gave a session', () => {
    const { socket, timers, factoryUrls, sockets } = rig();
    frame(socket, { op: 10, d: { heartbeat_interval: 30_000 } });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    socket.emit('close', 1006);
    timers.armed[0].fn();

    // No session id, so no resume URL either: back to the configured gateway.
    expect(factoryUrls[1]).toBe('wss://gateway.discord.gg/?v=10&encoding=json');
    frame(sockets[1], { op: 10, d: { heartbeat_interval: 30_000 } });
    expect(lastSent(sockets[1]).op).toBe(2); // IDENTIFY
  });

  it('re-identifies after a non-resumable INVALID_SESSION, and resumes after a resumable one', () => {
    for (const [resumable, expectedOp] of [
      [false, 2], // d=false: the session is gone, start a fresh IDENTIFY
      [true, 6], // d=true: Discord says the session survives, RESUME it
    ] as const) {
      constructed.length = 0;
      const { socket, timers, sockets } = rig();
      frame(socket, { op: 10, d: { heartbeat_interval: 30_000 } });
      frame(socket, {
        op: 0,
        s: 5,
        t: 'READY',
        d: { session_id: 'sess-1', resume_gateway_url: 'wss://resume.discord.gg' },
      });

      frame(socket, { op: 9, d: resumable });

      // op 9 reconnects on its own short delay, not the 2000 ms close delay.
      expect(timers.armed.map((t) => t.ms)).toEqual([1500]);
      timers.armed[0].fn();
      frame(sockets[1], { op: 10, d: { heartbeat_interval: 30_000 } });
      expect(lastSent(sockets[1]).op).toBe(expectedOp);
    }
  });

  it('does not aim at the resume URL when READY gave one but no session id', () => {
    // A malformed READY is the only state where connect()'s own
    // `this.sessionId !== null` check does work its two consumers do not already
    // do: without it the bot would reconnect to the resume endpoint carrying no
    // session, which Discord answers with INVALID_SESSION rather than a resume.
    const { socket, timers, factoryUrls, sockets } = rig();
    frame(socket, { op: 10, d: { heartbeat_interval: 30_000 } });
    frame(socket, {
      op: 0,
      s: 4,
      t: 'READY',
      d: { resume_gateway_url: 'wss://resume.discord.gg' },
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    socket.emit('close', 1006);
    timers.armed[0].fn();

    expect(factoryUrls[1]).toBe('wss://gateway.discord.gg/?v=10&encoding=json');
    frame(sockets[1], { op: 10, d: { heartbeat_interval: 30_000 } });
    expect(lastSent(sockets[1]).op).toBe(2); // IDENTIFY, not RESUME
  });

  it('reconnects immediately on op 7 RECONNECT, with no delay at all', () => {
    const { socket, timers, sockets } = rig();
    frame(socket, { op: 10, d: { heartbeat_interval: 30_000 } });
    frame(socket, { op: 0, s: 1, t: 'READY', d: { session_id: 'sess-1' } });

    frame(socket, { op: 7 });

    expect(timers.armed).toEqual([]); // op 7 means "now", not "in a moment"
    expect(sockets.length).toBe(2);
  });
});

describe('Gateway close handling', () => {
  it('does NOT reconnect after ANY fatal close code', () => {
    // The whole set matters, not just 4014: 4004 is a bad/rotated token, and
    // reconnecting on it hammers Discord with a doomed handshake forever.
    for (const code of [4004, 4010, 4011, 4012, 4013, 4014]) {
      const { socket, timers, sockets } = rig();
      const errors: unknown[][] = [];
      vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
        errors.push(args);
      });

      socket.emit('close', code);

      expect(timers.armed).toEqual([]);
      expect(sockets.length).toBe(1);
      // The log line is the only operator-visible signal that the bot stopped.
      expect(errors).toEqual([[`[bot] gateway closed with fatal code ${code}; not reconnecting`]]);
      vi.restoreAllMocks();
    }
  });

  it('DOES reconnect after a non-fatal close, and actually opens the new socket', () => {
    for (const code of [1000, 1001, 1006, 4000, 4009]) {
      const { socket, timers, sockets, factoryUrls } = rig();
      vi.spyOn(console, 'error').mockImplementation(() => {});

      socket.emit('close', code);

      expect(timers.armed.map((t) => t.ms)).toEqual([2000]);
      expect(sockets.length).toBe(1); // nothing until the delay elapses
      timers.armed[0].fn();
      // Firing the timer must genuinely reconnect: an empty callback used to
      // pass here, which would leave the bot silently offline after a drop.
      expect(sockets.length).toBe(2);
      expect(factoryUrls[1]).toBe('wss://gateway.discord.gg/?v=10&encoding=json');
      vi.restoreAllMocks();
    }
  });
});

describe('Gateway send guard and dispatch', () => {
  it('sends nothing while the socket is not OPEN', () => {
    const { socket } = rig();
    socket.readyState = 0; // CONNECTING

    frame(socket, { op: 10, d: { heartbeat_interval: 30_000 } });

    // The IDENTIFY is dropped rather than thrown: sending on a CONNECTING ws
    // raises, and the reconnect path re-IDENTIFYs anyway.
    expect(socket.sent).toEqual([]);
  });

  it('requests the full member list with op 8', () => {
    const { socket, gateway } = rig();

    gateway.requestGuildMembers('g1');

    // query '' + limit 0 is what asks for EVERY member, online and offline; the
    // op 8 backfill is the only way large guilds learn about offline staff.
    expect(JSON.parse(socket.sent[socket.sent.length - 1])).toEqual({
      op: 8,
      d: { guild_id: 'g1', query: '', limit: 0, presences: true },
    });
  });

  it('forwards each DISPATCH to the handler and survives a throwing handler', () => {
    const seen: [string, Record<string, unknown>][] = [];
    const timers = fakeTimers();
    const socket = new FakeSocket('injected');
    const gateway = new Gateway(
      'tok',
      'wss://gateway.discord.gg',
      {
        onDispatch: (type, data) => {
          seen.push([type, data]);
          if (type === 'BOOM') throw new Error('handler exploded');
        },
      },
      () => socket as unknown as never,
      timers.seam,
    );
    gateway.connect(false);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    frame(socket, { op: 0, s: 1, t: 'GUILD_CREATE', d: { id: 'g1' } });
    frame(socket, { op: 0, s: 2, t: 'BOOM', d: {} });
    // A later frame must still be delivered: one bad handler call cannot kill
    // the socket's message pump.
    frame(socket, { op: 0, s: 3, t: 'GUILD_MEMBER_ADD', d: { user: { id: 'u1' } } });

    expect(seen.map(([t]) => t)).toEqual(['GUILD_CREATE', 'BOOM', 'GUILD_MEMBER_ADD']);
    expect(seen[0][1]).toEqual({ id: 'g1' });
  });

  it('survives an unparseable frame', () => {
    const { socket } = rig();
    const errors: unknown[][] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args);
    });

    socket.emit('message', Buffer.from('{not json'));
    frame(socket, { op: 10, d: { heartbeat_interval: 30_000 } });

    expect(errors[0][0]).toBe('[bot] gateway parse error');
    expect(lastSent(socket).op).toBe(2); // the pump still works
  });
});
