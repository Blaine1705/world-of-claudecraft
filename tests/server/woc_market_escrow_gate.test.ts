// The realm-global escrow in-flight bound (the escrow write-path rider):
// a counted cap with an immediate refusal, no queue. The custody suite
// proves the wiring (refusal kind, slot lifecycle against the real FIFO);
// this suite pins the gate's own arithmetic in isolation.
import { describe, expect, it } from 'vitest';
import {
  createWocEscrowGate,
  WOC_ESCROW_GATE_MAX_IN_FLIGHT,
} from '../../server/woc_market_escrow_gate';

describe('woc escrow gate', () => {
  it('admits up to the cap and refuses past it, counting refusals', () => {
    const gate = createWocEscrowGate(2);
    expect(gate.tryAcquire()).toBe(true);
    expect(gate.tryAcquire()).toBe(true);
    // At cap: refused, and the refusal is COUNTED (the readout's lifetime
    // twin of the realm_refused counter kind).
    expect(gate.tryAcquire()).toBe(false);
    expect(gate.tryAcquire()).toBe(false);
    expect(gate.stats()).toEqual({ inFlight: 2, max: 2, refused: 2 });
  });

  it('release frees exactly one slot', () => {
    const gate = createWocEscrowGate(1);
    expect(gate.tryAcquire()).toBe(true);
    expect(gate.tryAcquire()).toBe(false);
    gate.release();
    expect(gate.stats().inFlight).toBe(0);
    expect(gate.tryAcquire()).toBe(true);
    expect(gate.stats()).toEqual({ inFlight: 1, max: 1, refused: 1 });
  });

  it('a double release floors at zero and never mints capacity', () => {
    const gate = createWocEscrowGate(2);
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
    const gate = createWocEscrowGate(3);
    gate.tryAcquire();
    const first = gate.stats();
    first.inFlight = 99;
    first.refused = 99;
    expect(gate.stats()).toEqual({ inFlight: 1, max: 3, refused: 0 });
  });

  it('defaults to the exported realm cap', () => {
    const gate = createWocEscrowGate();
    for (let i = 0; i < WOC_ESCROW_GATE_MAX_IN_FLIGHT; i++) {
      expect(gate.tryAcquire()).toBe(true);
    }
    expect(gate.tryAcquire()).toBe(false);
    expect(gate.stats().max).toBe(WOC_ESCROW_GATE_MAX_IN_FLIGHT);
  });
});
