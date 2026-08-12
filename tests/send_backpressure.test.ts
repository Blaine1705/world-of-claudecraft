import { describe, expect, it } from 'vitest';
import { WS_BACKPRESSURE_LIMIT_BYTES } from '../server/ws_backpressure';
import {
  INPUT_SEND_BACKPRESSURE_LIMIT_BYTES,
  isInputSendBackpressured,
} from '../src/net/send_backpressure';

describe('isInputSendBackpressured', () => {
  it('passes a healthy, draining socket', () => {
    expect(isInputSendBackpressured(0)).toBe(false);
    expect(isInputSendBackpressured(200)).toBe(false);
    expect(isInputSendBackpressured(INPUT_SEND_BACKPRESSURE_LIMIT_BYTES)).toBe(false);
  });

  it('trips once the local unflushed buffer climbs past the limit', () => {
    expect(isInputSendBackpressured(INPUT_SEND_BACKPRESSURE_LIMIT_BYTES + 1)).toBe(true);
  });

  it('honors a caller-supplied limit', () => {
    expect(isInputSendBackpressured(100, 64)).toBe(true);
    expect(isInputSendBackpressured(64, 64)).toBe(false);
  });

  it('sits far above one legitimate input frame (under 200 bytes serialized)', () => {
    expect(INPUT_SEND_BACKPRESSURE_LIMIT_BYTES).toBeGreaterThan(200 * 100);
  });

  it('sits well below the server hard-kill limit, so the client sheds long before the server would terminate the session', () => {
    expect(INPUT_SEND_BACKPRESSURE_LIMIT_BYTES).toBeLessThan(WS_BACKPRESSURE_LIMIT_BYTES);
  });
});
