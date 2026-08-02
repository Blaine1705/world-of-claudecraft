// Server-side counterpart to the client's momentary-jump latch
// (src/game/input.ts, KEY_JUMP_LATCH_MS): a fast jump tap already survives
// the CLIENT's own sampling by holding `jump: true` in the outgoing input
// stream for a short wall-clock window instead of just one frame. But
// `dispatchMessage`'s `input` arm in game.ts applies each arriving frame with
// `Object.assign(meta.moveInput, frame.moveInput)`, last-message-wins.
//
// Real network conditions add JITTER on top of flat latency (queuing on a
// congested link, wifi/mobile radio variance), and delivery over the ordered
// WebSocket stream can bunch up: the jump-press frame and the jump-release
// frame that follows it can both arrive, back to back, before the next Sim
// tick ever runs. The release then overwrites the press and the tick never
// observes `jump: true` at all, even though the player held the key for the
// client's whole latch window. This is worst at high, jittery ping (the
// spacing between frames only compresses when transit time varies), and
// worst for jump specifically because it is the one momentary
// (edge-triggered) field in MoveInput: a dropped continuous direction just
// re-expresses on the next unconditional resend, but a dropped jump edge is
// gone, and the player visibly leaps locally (self_motion.ts) while the
// server never leaves the ground.
//
// The fix mirrors the client: latch `jump: true` server-side for the same
// window, keyed off sim.time. Two pure entry points, called from two
// different places in game.ts:
//  - noteJumpInput, from dispatchMessage's `input` arm, on every arriving
//    frame: records the raw wire flag and, on a fresh press, extends the
//    latch deadline. It never decides what the Sim sees.
//  - resolveJumpInput, from the per-tick pass (applyJumpLatches in game.ts)
//    that runs immediately before every Sim.tick(): the ONLY place that
//    writes into PlayerMeta.moveInput.jump for this state, recomputed fresh
//    every tick from the untouched raw flag. Deriving it fresh (never
//    accumulating a forced value back into the raw state) is what keeps the
//    bit from getting stuck true once the window elapses with no further
//    messages: a single write-and-forget would have nothing to revert it to
//    the real held state.
//
// Pure and host-agnostic so both are unit-testable without a GameServer.

/**
 * Mirrors src/game/input.ts KEY_JUMP_LATCH_MS. The two constants are
 * independent (server/ never imports src/game/, see server/CLAUDE.md), so
 * changing one is a deliberate call to update the other in the same commit.
 */
export const SERVER_JUMP_LATCH_S = 0.15;

export interface JumpLatchState {
  /** The raw (sanitized) jump flag as of the most recent input frame. */
  rawJump: boolean;
  /** sim.time deadline through which resolveJumpInput must still read true. */
  latchUntil: number;
}

export function initialJumpLatchState(): JumpLatchState {
  return { rawJump: false, latchUntil: 0 };
}

/** Record one incoming input frame's raw jump flag. Call from dispatchMessage's
 *  `input` arm for every frame, before the ordinary moveInput assignment. */
export function noteJumpInput(state: JumpLatchState, wantsJump: boolean, nowS: number): void {
  state.rawJump = wantsJump;
  if (wantsJump) state.latchUntil = nowS + SERVER_JUMP_LATCH_S;
}

/** The jump bit a Sim tick should actually see right now. Call once per
 *  session, immediately before every Sim.tick(). */
export function resolveJumpInput(state: JumpLatchState, nowS: number): boolean {
  return state.rawJump || nowS < state.latchUntil;
}
