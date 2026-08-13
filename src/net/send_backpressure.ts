// Client-side send backpressure gate for the periodic movement-intent stream
// (issue #2943). `ws.send()` never blocks: when the local uplink cannot drain
// as fast as the client writes, bytes queue in the browser's own outbound
// buffer, surfaced as `ws.bufferedAmount`. Two players sharing one saturated
// residential connection hit exactly this: each client keeps calling
// `sendInput`'s unconditional 50 ms timer at full rate regardless of whether
// the previous frame drained, so intent frames pile up instead of being
// shed. WebSocket rides one ordered TCP stream, so the server's keepalive
// pong (`WS_KEEPALIVE_PING_MS`, server/game.ts) queues behind that same
// backlog; once a session misses one whole keepalive interval the server
// terminates it into linkdead, and the client's reconnect_policy.ts auto-retry
// reads back as a "quick reconnecting" loop.
//
// The fix: skip an input send while the local buffer is already backed up
// past a limit set far above one legitimate frame (an input frame serializes
// under 200 bytes) but far below the server's own hard-kill limit
// (WS_BACKPRESSURE_LIMIT_BYTES, server/ws_backpressure.ts), so a healthy,
// draining socket never trips it and a genuinely congested one sheds input
// long before the server would notice anything wrong. Movement intent is
// idempotent-latest: the unconditional timer resends current state on the
// next beat (src/net/input_send_cadence.ts), so shedding an intermediate
// frame loses nothing. This is deliberately NOT the client-side send
// coalescing that docs/design/player-performance/packet-3-input-cadence.md
// (R13, Decision 3) rules out of scope: that ruling is about reducing the
// SEND CADENCE under normal conditions, which the facing-feel cluster
// depends on; this gate is a no-op whenever the socket is draining (the
// normal case) and only ever activates on a genuine congestion signal.
// `cmd` frames are NOT idempotent and must never be gated this way.
export const INPUT_SEND_BACKPRESSURE_LIMIT_BYTES = 64 * 1024;

// True when the socket's own unflushed outbound buffer has grown past the
// limit, i.e. the local uplink is not draining and an input send should be
// shed rather than queued behind the backlog that is already not moving.
export function isInputSendBackpressured(
  bufferedAmount: number,
  limit = INPUT_SEND_BACKPRESSURE_LIMIT_BYTES,
): boolean {
  return bufferedAmount > limit;
}
