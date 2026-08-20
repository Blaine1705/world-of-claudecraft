// The realm-global escrow in-flight bound (the escrow write-path rider):
// a counted cap with an immediate refusal, no queue, plus the review round's
// leak ceiling (a slot held past the hold ceiling is reclaimed, counted and
// loud, so a wedged save FIFO cannot convert into a permanent realm-wide
// listing outage). The custody suite proves the wiring (refusal kind, slot
// lifecycle against the real FIFO); this suite pins the gate's own
// arithmetic in isolation under an injected clock.
import { describe, expect, it, vi } from 'vitest';
import {
  createWocEscrowGate,
  WOC_ESCROW_GATE_HOLD_CEILING_MS,
  WOC_ESCROW_GATE_MAX_IN_FLIGHT,
} from '../../server/woc_market_escrow_gate';

describe('woc escrow gate', () => {
  it('admits up to the cap and refuses past it, counting refusals', () => {
    let nowMs = 1_000;
    const gate = createWocEscrowGate(2, { now: () => nowMs });
    expect(gate.tryAcquire()).toBe(true);
    expect(gate.tryAcquire()).toBe(true);
    // At cap: refused, and the refusal is COUNTED (the readout's lifetime
    // twin of the realm_refused counter kind).
    expect(gate.tryAcquire()).toBe(false);
    expect(gate.tryAcquire()).toBe(false);
    nowMs = 1_500;
    expect(gate.stats()).toEqual({
      inFlight: 2,
      max: 2,
      refused: 2,
      reclaimed: 0,
      // The oldest standing hold's age, off the injected clock.
      oldestHoldMs: 500,
    });
  });

  it('release frees exactly one slot', () => {
    const gate = createWocEscrowGate(1, { now: () => 0 });
    expect(gate.tryAcquire()).toBe(true);
    expect(gate.tryAcquire()).toBe(false);
    gate.release();
    expect(gate.stats().inFlight).toBe(0);
    expect(gate.stats().oldestHoldMs).toBe(0);
    expect(gate.tryAcquire()).toBe(true);
    expect(gate.stats()).toMatchObject({ inFlight: 1, max: 1, refused: 1, reclaimed: 0 });
  });

  it('a double release floors at zero and never mints capacity', () => {
    const gate = createWocEscrowGate(2, { now: () => 0 });
    expect(gate.tryAcquire()).toBe(true);
    gate.release();
    // The defensive extra release must not push inFlight negative: after it,
    // the gate still admits exactly TWO acquisitions, not three.
    gate.release();
    expect(gate.stats().inFlight).toBe(0);
    expect(gate.tryAcquire()).toBe(true);
    expect(gate.tryAcquire()).toBe(true);
    expect(gate.tryAcquire()).toBe(false);
  });

  it('stats hands out a fresh snapshot a consumer cannot corrupt', () => {
    const gate = createWocEscrowGate(3, { now: () => 0 });
    gate.tryAcquire();
    const first = gate.stats();
    first.inFlight = 99;
    first.refused = 99;
    expect(gate.stats()).toEqual({
      inFlight: 1,
      max: 3,
      refused: 0,
      reclaimed: 0,
      oldestHoldMs: 0,
    });
  });

  it('reclaims a slot held past the ceiling, counted and loud, at the next acquire', () => {
    // The leak arm: a sequence that never settles must not close the realm's
    // listing path for the process lifetime. One BELOW the ceiling still
    // holds; AT the ceiling it is reclaimed and the freed slot admits.
    let nowMs = 0;
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const gate = createWocEscrowGate(1, { now: () => nowMs, holdCeilingMs: 10_000 });
      expect(gate.tryAcquire()).toBe(true);
      nowMs = 9_999;
      expect(gate.tryAcquire()).toBe(false);
      expect(gate.stats().reclaimed).toBe(0);
      nowMs = 10_000;
      expect(gate.tryAcquire()).toBe(true);
      const s = gate.stats();
      expect(s.reclaimed).toBe(1);
      expect(s.inFlight).toBe(1);
      expect(errors).toHaveBeenCalledTimes(1);
      expect(String(errors.mock.calls[0]?.[0])).toContain('escrow gate reclaimed a slot');
    } finally {
      errors.mockRestore();
    }
  });

  it('releases retire the OLDEST stamp, so a wedge over-reports rather than hides', () => {
    // Two holds; the NEWER sequence settles first. FIFO retirement means the
    // old stamp survives, so oldestHoldMs keeps aging (the pessimistic side:
    // an alarm can fire early, never miss a wedge).
    let nowMs = 0;
    const gate = createWocEscrowGate(2, { now: () => nowMs });
    gate.tryAcquire();
    nowMs = 5_000;
    gate.tryAcquire();
    nowMs = 6_000;
    gate.release();
    expect(gate.stats().inFlight).toBe(1);
    expect(gate.stats().oldestHoldMs).toBe(1_000);
  });

  it('defaults to the exported realm cap and hold ceiling', () => {
    const gate = createWocEscrowGate();
    for (let i = 0; i < WOC_ESCROW_GATE_MAX_IN_FLIGHT; i++) {
      expect(gate.tryAcquire()).toBe(true);
    }
    expect(gate.tryAcquire()).toBe(false);
    expect(gate.stats().max).toBe(WOC_ESCROW_GATE_MAX_IN_FLIGHT);
    // The ceiling constant itself: the tunables ladder pins its relation to
    // the honest sequence ceiling; here only the literal.
    expect(WOC_ESCROW_GATE_HOLD_CEILING_MS).toBe(300_000);
  });
});
