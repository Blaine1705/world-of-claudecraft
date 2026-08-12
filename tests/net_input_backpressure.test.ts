import { describe, expect, it } from 'vitest';
import { ClientWorld } from '../src/net/online';
import { INPUT_SEND_BACKPRESSURE_LIMIT_BYTES } from '../src/net/send_backpressure';

function makeClient(bufferedAmount: number) {
  const sent: string[] = [];
  const client = Object.create(ClientWorld.prototype) as ClientWorld;
  const ws = {
    readyState: 1,
    bufferedAmount,
    send: (payload: string) => sent.push(payload),
  };
  Object.assign(client as unknown as Record<string, unknown>, {
    moveInput: {
      forward: true,
      back: false,
      turnLeft: false,
      turnRight: false,
      strafeLeft: false,
      strafeRight: false,
      jump: false,
    },
    mouselookFacing: null,
    connected: true,
    spectating: null,
    ws,
    lastInputSentAt: 0,
    lastInputSig: '',
    inputSeq: 0,
    pendingInputSeqSentAt: new Map<number, number>(),
  });
  return { client, ws, sent };
}

describe('ClientWorld input send backpressure gate', () => {
  const previousWebSocket = globalThis.WebSocket;
  const withWebSocketStub = <T>(fn: () => T): T => {
    Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: { OPEN: 1 } });
    try {
      return fn();
    } finally {
      Object.defineProperty(globalThis, 'WebSocket', {
        configurable: true,
        value: previousWebSocket,
      });
    }
  };

  it('sends normally while the local socket is draining', () => {
    const { client, sent } = makeClient(0);
    withWebSocketStub(() => {
      expect(client.flushInput(1_000)).toBe(true);
    });
    expect(sent).toHaveLength(1);
  });

  it('sheds the send once the local unflushed buffer is backed up past the limit', () => {
    const { client, sent } = makeClient(INPUT_SEND_BACKPRESSURE_LIMIT_BYTES + 1);
    withWebSocketStub(() => {
      expect(client.flushInput(1_000)).toBe(false);
    });
    expect(sent).toHaveLength(0);
  });

  it('resumes sending as soon as the buffer drains back under the limit', () => {
    const { client, ws, sent } = makeClient(INPUT_SEND_BACKPRESSURE_LIMIT_BYTES + 1);
    withWebSocketStub(() => {
      expect(client.flushInput(1_000)).toBe(false);
      ws.bufferedAmount = 0;
      expect(client.flushInput(2_000)).toBe(true);
    });
    expect(sent).toHaveLength(1);
  });

  it('does not gate cmd frames on backpressure: only the idempotent-latest input path is shed', () => {
    const { client, ws, sent } = makeClient(INPUT_SEND_BACKPRESSURE_LIMIT_BYTES + 1);
    withWebSocketStub(() => {
      expect(client.flushInput(1_000)).toBe(false);
      // rawCmd's own gate is only connected + readyState; it never reads
      // ws.bufferedAmount, so a saturated socket still lets a command through.
      (client as unknown as { rawCmd: (payload: Record<string, unknown>) => void }).rawCmd({
        cmd: 'chat',
      });
    });
    expect(ws.bufferedAmount).toBe(INPUT_SEND_BACKPRESSURE_LIMIT_BYTES + 1);
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0])).toEqual({ t: 'cmd', cmd: 'chat' });
  });
});
