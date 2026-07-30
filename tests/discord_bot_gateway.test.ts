// The Gateway socket seam. Two directions matter and they need opposite setups,
// so `ws` is module-mocked for the whole file: the DEFAULT socket factory must
// construct the real `ws` client at the real gateway URL (the arm a broken
// default parameter would silently replace), and an INJECTED factory must be
// used instead of it. The mock stands in for the `ws` module so neither arm
// opens a socket; asserting the mocked constructor was called IS the proof that
// the default routes through `ws`.
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Every socket the code under test constructed, in order. */
const constructed: { url: string; socket: FakeSocket }[] = [];

class FakeSocket {
  static OPEN = 1;
  readyState = FakeSocket.OPEN;
  readonly listeners = new Map<string, (arg: unknown) => void>();
  readonly sent: string[] = [];
  terminated = 0;

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

  close(): void {}

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
        return 0 as unknown as ReturnType<typeof setInterval>;
      },
      clearInterval: (id: ReturnType<typeof setInterval>) => {
        cleared.push(id);
      },
    },
  };
}

beforeEach(() => {
  constructed.length = 0;
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
    const timers = fakeTimers();
    const socket = new FakeSocket('injected');
    const gateway = new Gateway(
      'tok',
      'wss://gateway.discord.gg',
      noopHandlers(),
      () => socket as unknown as never,
      timers.seam,
    );
    gateway.connect(false);

    socket.emit(
      'message',
      Buffer.from(JSON.stringify({ op: 10, d: { heartbeat_interval: 41250 } })),
    );

    // The heartbeat runs on the interval Discord handed back in HELLO.
    expect(timers.intervals.map((i) => i.ms)).toEqual([41250]);
    const identify = JSON.parse(socket.sent[socket.sent.length - 1]) as {
      op: number;
      d: { token: string };
    };
    expect(identify.op).toBe(2); // IDENTIFY
    expect(identify.d.token).toBe('tok');
  });

  it('does NOT reconnect after a fatal close code, but does after a normal one', () => {
    for (const [code, expectedReconnects] of [
      [4014, 0], // disallowed privileged intents: reconnecting would loop forever
      [1006, 1], // abnormal close: reconnect after the 2000 ms delay
    ] as const) {
      const timers = fakeTimers();
      const socket = new FakeSocket('injected');
      const gateway = new Gateway(
        'tok',
        'wss://gateway.discord.gg',
        noopHandlers(),
        () => socket as unknown as never,
        timers.seam,
      );
      gateway.connect(false);
      vi.spyOn(console, 'error').mockImplementation(() => {});

      socket.emit('close', code);

      expect(timers.armed.length).toBe(expectedReconnects);
      if (expectedReconnects > 0) expect(timers.armed[0].ms).toBe(2000);
      vi.restoreAllMocks();
    }
  });
});
