import { describe, expect, it } from 'vitest';
import { createRevealGateCore } from '../src/render/reveal_gate_core';

describe('reveal gate core', () => {
  it('holds a cold key and fires exactly one compile request', () => {
    const requested: string[] = [];
    const gate = createRevealGateCore((key) => requested.push(key));
    expect(gate.state('village:0:0')).toBe('cold');
    expect(gate.allow('village:0:0')).toBe(false);
    expect(gate.state('village:0:0')).toBe('compiling');
    // Further consultations while compiling hold WITHOUT re-requesting: the
    // cull asks every frame and a request per frame would flood the queue.
    expect(gate.allow('village:0:0')).toBe(false);
    expect(gate.allow('village:0:0')).toBe(false);
    expect(requested).toEqual(['village:0:0']);
  });

  it('reveals after settle and never requests again', () => {
    const requested: string[] = [];
    const gate = createRevealGateCore((key) => requested.push(key));
    gate.allow('town');
    gate.settle('town');
    expect(gate.state('town')).toBe('warm');
    expect(gate.allow('town')).toBe(true);
    expect(gate.allow('town')).toBe(true);
    expect(requested).toEqual(['town']);
  });

  it('treats a settle for an unknown key as warm (fail-soft)', () => {
    const gate = createRevealGateCore(() => undefined);
    gate.settle('never-requested');
    expect(gate.state('never-requested')).toBe('warm');
    expect(gate.allow('never-requested')).toBe(true);
  });

  it('tracks keys independently', () => {
    const requested: string[] = [];
    const gate = createRevealGateCore((key) => requested.push(key));
    expect(gate.allow('a')).toBe(false);
    expect(gate.allow('b')).toBe(false);
    gate.settle('a');
    expect(gate.allow('a')).toBe(true);
    expect(gate.allow('b')).toBe(false);
    expect(requested).toEqual(['a', 'b']);
  });

  it('settle is idempotent', () => {
    const gate = createRevealGateCore(() => undefined);
    gate.allow('key');
    gate.settle('key');
    gate.settle('key');
    expect(gate.allow('key')).toBe(true);
  });
});

describe('reveal gate core per-root readiness', () => {
  it('tracks each root of a key and warms the key only once all are ready', () => {
    const gate = createRevealGateCore(() => undefined);
    const batch = { name: 'batch' };
    const houseA = { name: 'houseA' };
    const houseB = { name: 'houseB' };
    gate.allow('town');
    gate.noteRoots('town', [batch, houseA, houseB]);
    expect(gate.state('town')).toBe('compiling');
    expect(gate.rootReady('town', batch)).toBe(false);

    gate.settleRoot('town', houseB);
    // The key is NOT warm yet, but the one linked root may already reveal:
    // that is the whole point of the piecewise policy.
    expect(gate.state('town')).toBe('compiling');
    expect(gate.rootReady('town', houseB)).toBe(true);
    expect(gate.rootReady('town', houseA)).toBe(false);
    expect(gate.allow('town')).toBe(false);

    gate.settleRoot('town', batch);
    expect(gate.state('town')).toBe('compiling');
    gate.settleRoot('town', houseA);
    expect(gate.state('town')).toBe('warm');
    expect(gate.allow('town')).toBe(true);
  });

  it('counts a root that rejected as settled for the key', () => {
    // The host absorbs a rejected link and reports the root settled either
    // way: a driver that refuses one program must never leave the key held
    // until the watchdog.
    const gate = createRevealGateCore(() => undefined);
    const ok = { name: 'ok' };
    const failed = { name: 'failed' };
    gate.allow('cell');
    gate.noteRoots('cell', [ok, failed]);
    gate.settleRoot('cell', ok);
    gate.settleRoot('cell', failed);
    expect(gate.state('cell')).toBe('warm');
    expect(gate.rootReady('cell', failed)).toBe(true);
  });

  it('reports readiness counts into a caller-owned object', () => {
    const gate = createRevealGateCore(() => undefined);
    const out = { ready: 0, total: 0 };
    const a = {};
    const b = {};
    gate.allow('town');
    gate.noteRoots('town', [a, b]);
    expect(gate.readiness('town', out)).toEqual({ ready: 0, total: 2 });
    gate.settleRoot('town', a);
    expect(gate.readiness('town', out)).toEqual({ ready: 1, total: 2 });
    // The same object comes back refilled, never a fresh allocation.
    const again = gate.readiness('town', out);
    expect(again).toBe(out);
  });

  it('an unknown root is never ready while the key compiles, and ready once it is warm', () => {
    const gate = createRevealGateCore(() => undefined);
    const known = {};
    const stranger = {};
    gate.allow('town');
    gate.noteRoots('town', [known]);
    expect(gate.rootReady('town', stranger)).toBe(false);
    // A settle for an unknown root cannot warm the key by inflating the count.
    gate.settleRoot('town', stranger);
    expect(gate.state('town')).toBe('compiling');
    expect(gate.readiness('town', { ready: 0, total: 0 })).toEqual({ ready: 0, total: 1 });
    gate.settleRoot('town', known);
    expect(gate.state('town')).toBe('warm');
    // Warm means every root reveals, including one the gate never saw.
    expect(gate.rootReady('town', stranger)).toBe(true);
  });

  it('a key nobody requested has no ready roots', () => {
    const gate = createRevealGateCore(() => undefined);
    expect(gate.rootReady('never-asked', {})).toBe(false);
    expect(gate.readiness('never-asked', { ready: 0, total: 0 })).toEqual({ ready: 0, total: 0 });
  });

  it('a key with no roots is warm at once (nothing to wait for)', () => {
    const gate = createRevealGateCore(() => undefined);
    gate.allow('empty');
    gate.noteRoots('empty', []);
    expect(gate.state('empty')).toBe('warm');
  });

  it('settle warms every root, whatever the compiles did', () => {
    // The watchdog arm: the absolute end of the hold reveals the whole key.
    const gate = createRevealGateCore(() => undefined);
    const a = {};
    const b = {};
    gate.allow('town');
    gate.noteRoots('town', [a, b]);
    gate.settle('town');
    expect(gate.rootReady('town', a)).toBe(true);
    expect(gate.rootReady('town', b)).toBe(true);
  });

  it('a per-root settle after a whole-key settle cannot push ready past total', () => {
    // settle() ends the hold for every root, so a link that lands afterwards
    // has nothing left to report: counting it again put a 41-root key in the
    // telemetry as 71 of 41.
    const gate = createRevealGateCore(() => undefined);
    const a = {};
    const b = {};
    gate.allow('town');
    gate.noteRoots('town', [a, b]);
    gate.settleRoot('town', a);
    gate.settle('town');
    gate.settleRoot('town', a);
    gate.settleRoot('town', b);
    expect(gate.readiness('town', { ready: 0, total: 0 })).toEqual({ ready: 2, total: 2 });
    expect(gate.state('town')).toBe('warm');
  });

  it('a duplicated root is counted once and settles once', () => {
    const gate = createRevealGateCore(() => undefined);
    const shared = {};
    gate.allow('town');
    gate.noteRoots('town', [shared, shared]);
    expect(gate.readiness('town', { ready: 0, total: 0 })).toEqual({ ready: 0, total: 1 });
    gate.settleRoot('town', shared);
    gate.settleRoot('town', shared);
    expect(gate.readiness('town', { ready: 0, total: 0 })).toEqual({ ready: 1, total: 1 });
    expect(gate.state('town')).toBe('warm');
  });
});
