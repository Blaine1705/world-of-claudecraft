# Movement reconciliation (Option 3): per-tick input frames + client replay

Status: in development on `feature/movement-rework`. This document is the design
authority for the movement rework; `docs/online-movement-latency.md` describes the
history and the option analysis that selected this model. The acceptance bar is
`MOVEMENT_FEEL_TARGETS` (legitimate play) plus `MOVEMENT_FEEL_TARGETS_CC` (cells
where the server legitimately overrides the client) in
`tests/helpers/movement_metrics.ts`, enforced by
`tests/movement_latency_baseline.test.ts` (strict mode).

## Goal and non-goals

Goal: the local player's drawn movement is instant and correction-free for
legitimate play at any RTT the link sustains (certified through 400 ms RTT with
jitter), while the server remains fully authoritative over position. Corrections
exist only when the server genuinely overrides the client (crowd control, forced
movement, speed changes), and those are signaled explicitly and smoothed.

Non-goals: client-authoritative position (rejected in
`docs/online-movement-latency.md`); raising the 20 Hz tick; changing `IWorld`
reads (targeting, click-to-move, quest triggers keep reading the authoritative
mirror in v1 of this rework).

## Why the old model could not be fixed in place

The pre-rework client sent level-triggered held booleans on a timer, the server
overwrote one live `MoveInput` struct per player on arrival, and the sim sampled
whatever was in that struct at its own 20 Hz phase. Client and server therefore
integrated DIFFERENT intent timelines whenever intent changed between server
ticks, and the display-only extrapolator had to be leashed and servo-corrected
against the interpolated mirror to hide the divergence. The baseline suite
measures the consequences (speed wobble at every run start even at RTT 0, path
deviation on every curved steer, snap-backs under stalls). No amount of tuning
removes a divergence whose cause is that the two hosts never agreed on the
input sequence.

## The model

One principle: **client and server run the identical movement kernel over the
identical per-tick input sequence.** The kernel (`src/sim/player_motion.ts`,
`stepPlayerMotion`) is already shared and pinned bit-exact across hosts by
`tests/player_motion.test.ts`; the rework makes the INPUT sequence identical
too, which makes prediction exact rather than approximate.

### Client input ticks

The client runs a fixed 20 Hz input tick (an accumulator on the render loop,
the same discipline `SelfMotionPredictor` already uses). Each client tick k:

- samples the resolved `MoveInput` and wire facing at that instant;
- records frame k in the local input history ring;
- advances the local prediction by stepping the kernel once with frame k;
- sends frame k on the wire immediately.

### Wire protocol (movement v2)

Client to server, per input tick: the existing `t:'input'` message extended
with `ct` (the client tick index, monotone from join). The `seq` field remains
for telemetry. Intent between frames is undefined; the server never
extrapolates intent beyond holding the last consumed frame during starvation.

Server to client, in the self record of the ordinary snapshot: `ackCt` (the
highest client tick CONSUMED by the sim tick this snapshot reflects, stamped at
consumption, not receipt) and an `override` epoch counter (below). Version
negotiation rides join metadata like `timerWireVersion`; the legacy v1 arm
stays accepted so mid-deploy sessions degrade instead of breaking.

### Server consumption: the input timeline

Per session, a jitter buffer keyed by `ct` replaces the overwrite-latest
struct. Each server tick consumes EXACTLY ONE frame, the next `ct` in sequence:

- Buffer depth targets a small fixed window at first (2 to 3 ticks); an
  adaptive target based on observed arrival jitter is a later refinement.
- Starvation (next frame missing): hold the last consumed intent for a bounded
  number of ticks (the stale-input rule already bounds runaway), count it, and
  resynchronize the sequence when frames resume (consume forward to the newest
  contiguous run rather than replaying a stale backlog).
- Overflow (client burst or clock skew): consume forward, dropping the oldest
  frames past the depth cap, and count it.
- The anti-cheat posture is unchanged: the server accepts only intent and
  facing, never position or velocity; displacement is still computed
  server-side through the kernel and swept collision.

### Client reconciliation

The client keeps a ring of `{ct, input, predictedPose}` for unacked ticks. On
each snapshot:

- Read `ackCt`. Compare the snapshot's authoritative self pose against the
  stored `predictedPose[ackCt]`.
- Match (within a tight epsilon): discard history through `ackCt`. No
  correction of any kind. This is the steady state for legitimate play: both
  hosts ran the same kernel over the same frames, so the comparison is exact.
- Mismatch: adopt the authoritative pose at `ackCt`, replay the stored inputs
  for every tick after `ackCt` through the kernel, and carry the residual
  (old drawn pose minus replayed pose) as a display offset decayed over a
  short window. Replay cost is bounded by RTT (about 7 ticks at 400 ms) and
  the kernel is cheap.

The drawn pose is the predicted pose plus the decaying residual. The leash,
the divergence servo, and the measure-window machinery in
`src/render/self_motion.ts` are deleted for the predicted path; the fallback
interpolation remains for states where prediction is off (spectate, delves,
climbing, CC, and the `?nopredict` kill switch).

### Server overrides (the only legitimate corrections)

Any server-side effect that changes the player's motion outside their own
intent increments the session's `override` epoch: crowd control (stun, root,
fear), charge, follow, forced teleports, knockbacks, and speed-multiplier
changes (mount, snare, sprint, ghost). The self record carries the epoch and
the active override class. The client:

- suspends prediction on seeing a new epoch, adopts the authoritative pose
  (smoothed by the existing fallback rules), and drops its input history;
- resumes prediction from the first snapshot whose epoch is stable and whose
  `ackCt` acknowledges a frame sent after resumption.

Speed-multiplier changes need no suspension once mirrored: the client's kernel
deps read the same multiplier the server applies, and the mirror carries it;
the epoch covers the one-echo window where they disagree.

## Rollout inside the rework PR

Phase 2 lands the protocol and the server timeline behind negotiation, with
the old display path untouched (feel unchanged, wire ready). Phase 3 lands the
client prediction ring, reconciliation, and the override epochs, and deletes
the servo/leash machinery. Phase 4 flips `STRICT_MOVEMENT_TARGETS` on in
`tests/movement_latency_baseline.test.ts`, re-pins the baseline table to the
new measured numbers, and updates `docs/online-movement-latency.md` and
`src/net/CLAUDE.md` (whose display-anticipation constraints this model
supersedes for the predicted path).

## How this is verified

- `tests/movement_latency_baseline.test.ts`: the deterministic harness
  (real `GameServer`, real `ClientWorld`, TCP-semantics latency link, virtual
  clock) with ground truth from the wire-intent timeline. Strict mode is the
  merge bar after Phase 4.
- `tests/player_motion.test.ts`: kernel parity stays bit-exact.
- Protocol units: the jitter buffer's consume/starve/overflow rules and the
  reconciliation ring get their own paired test files.
