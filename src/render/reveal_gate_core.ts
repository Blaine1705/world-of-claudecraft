// First-reveal compile gating: the pure state machine behind holding a
// world-content subtree through its FIRST hidden-to-visible flip until its
// shader programs are linked off-thread (hitch-hunt P3a). The post-entry
// compile-debt lane pays boot debt over tens of seconds, and a camera reveal
// that wins the race against it links programs synchronously inside a live
// frame (the measured 300 to 680 ms submit-stall class). A consulted cull
// keeps its subtree in the pre-reveal representation for the few frames a
// background compile needs, which for distant scenery is invisible.
//
// The hold is tracked twice, per KEY and per ROOT. The key answers `allow`
// and warms only once every root behind it is ready, so nothing about the
// whole-key contract moved. The per-root half exists because a key can cover
// dozens of independent subtrees (a town is every static batch plus every
// building group): holding all of them until the slowest link settles turns
// the settle frame into the very first-draw burst the gate exists to prevent.
// A consumer that can reveal its roots independently asks `rootReady` and
// shows each one as its own compile lands.
//
// Pure core contract: no three import, no DOM, no clocks, no randomness.
// Registered in RENDER_PURE_CORES (tests/architecture.test.ts); tested by
// tests/reveal_gate_core.test.ts. The promise/watchdog orchestration lives in
// the host adapter (reveal_gate.ts), which owns the compile requests.

export type RevealGateState = 'cold' | 'compiling' | 'warm';

/** Ready and total root counts for one key, filled into a caller-owned
 *  object so a per-frame or per-escape read allocates nothing. */
export interface RevealGateReadiness {
  ready: number;
  total: number;
}

export interface RevealGateCore {
  /**
   * Consult on a reveal edge. Warm keys reveal immediately. A cold key fires
   * ONE compile request and holds; further consultations hold without
   * re-requesting until the host settles the key.
   */
  allow(key: string): boolean;
  /** Mark a key revealable. Idempotent; an unknown key becomes warm (the
   *  fail-soft arm: a settle must always end the hold, whatever came first),
   *  and every root behind it counts as ready, so a late per-root settle
   *  cannot push the ready count past the total. */
  settle(key: string): void;
  state(key: string): RevealGateState;
  /** Host: declare the roots behind a key, once, right after its request
   *  fires. Duplicates collapse; a key with no roots is warm at once. */
  noteRoots(key: string, roots: readonly object[]): void;
  /** Host: one root's compile settled. A REJECTED link settles the root too:
   *  the hold ends on the driver's answer, not on its success. */
  settleRoot(key: string, root: object): void;
  /** Consumer: may this one root reveal now? True once its own compile
   *  settled, or once the whole key is warm. An unknown root waits for the
   *  key, which is the safe direction: it can only reveal late, never cold. */
  rootReady(key: string, root: object): boolean;
  /** Ready/total roots behind a key, for the host's telemetry. */
  readiness(key: string, out: RevealGateReadiness): RevealGateReadiness;
}

interface KeyEntry {
  state: RevealGateState;
  /** Root -> its compile has settled. */
  roots: Map<object, boolean>;
  ready: number;
  total: number;
}

export function createRevealGateCore(request: (key: string) => void): RevealGateCore {
  const keys = new Map<string, KeyEntry>();
  const entryFor = (key: string): KeyEntry => {
    let entry = keys.get(key);
    if (!entry) {
      entry = { state: 'cold', roots: new Map(), ready: 0, total: 0 };
      keys.set(key, entry);
    }
    return entry;
  };
  return {
    allow(key: string): boolean {
      const entry = entryFor(key);
      if (entry.state === 'warm') return true;
      if (entry.state === 'cold') {
        entry.state = 'compiling';
        request(key);
      }
      return false;
    },
    settle(key: string): void {
      const entry = entryFor(key);
      entry.state = 'warm';
      // Every root is marked ready, not just the count: a root left false here
      // would settle again later and carry `ready` past `total` into the
      // telemetry (a 41-root key reporting 71 of 41).
      for (const root of entry.roots.keys()) entry.roots.set(root, true);
      entry.ready = entry.total;
    },
    state(key: string): RevealGateState {
      return keys.get(key)?.state ?? 'cold';
    },
    noteRoots(key: string, roots: readonly object[]): void {
      const entry = entryFor(key);
      for (let i = 0; i < roots.length; i++) {
        const root = roots[i];
        if (entry.roots.has(root)) continue;
        entry.roots.set(root, false);
        entry.total++;
      }
      if (entry.total === 0) entry.state = 'warm';
    },
    settleRoot(key: string, root: object): void {
      const entry = keys.get(key);
      if (!entry) return;
      if (entry.roots.get(root) !== false) return;
      entry.roots.set(root, true);
      entry.ready++;
      if (entry.ready >= entry.total) entry.state = 'warm';
    },
    rootReady(key: string, root: object): boolean {
      const entry = keys.get(key);
      if (!entry) return false;
      if (entry.state === 'warm') return true;
      return entry.roots.get(root) === true;
    },
    readiness(key: string, out: RevealGateReadiness): RevealGateReadiness {
      const entry = keys.get(key);
      out.ready = entry ? entry.ready : 0;
      out.total = entry ? entry.total : 0;
      return out;
    },
  };
}
