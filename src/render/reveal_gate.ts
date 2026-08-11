// Host adapter over reveal_gate_core: wires a cull's first-reveal hold to the
// renderer's live compile gate. One gate instance per consumer (the props
// far-cell swap, each town's static cull), each with its own key namespace
// and roots provider. The compile itself rides the caller-supplied host
// (renderer.compileGate: bounded in-flight links, LIVE_VIEW priority, the
// tier-correct render target), so this module owns only the settle plumbing:
// every requested key MUST settle, whatever the compiles do, or scenery
// stays hidden forever. allSettled absorbs per-root failures and the
// watchdog covers a link that never resolves (compile-gate timeouts are
// diagnostic-only by design and cannot resolve early; see compile_gate.ts).

import { createRevealGateCore, type RevealGateCore } from './reveal_gate_core';

export const REVEAL_GATE_WATCHDOG_MS = 10_000;

export interface RevealCompileHost {
  /** Compile one root's programs; resolves (or rejects) when settled. */
  compile(root: object): Promise<unknown>;
  /** Injectable watchdog sleeper; defaults to a real timeout. */
  delay?: (ms: number) => Promise<void>;
}

export function createRevealGate(
  host: RevealCompileHost,
  rootsFor: (key: string) => readonly object[],
): RevealGateCore {
  const delay =
    host.delay ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const gate: RevealGateCore = createRevealGateCore((key) => {
    const work = Promise.allSettled(
      rootsFor(key).map((root) => Promise.resolve(host.compile(root))),
    );
    void Promise.race([work, delay(REVEAL_GATE_WATCHDOG_MS)]).then(() => gate.settle(key));
  });
  return gate;
}
