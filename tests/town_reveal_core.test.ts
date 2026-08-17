import { describe, expect, it } from 'vitest';
import {
  newTownPiecewiseReveal,
  TOWN_PIECEWISE_REVEALS_PER_FRAME,
  townPiecewiseRevealInto,
  townRootVisible,
  townStaticReveal,
} from '../src/render/town_reveal_core';

const CULL_RADIUS = 60;

describe('town static first-reveal policy (hitch-hunt P3a)', () => {
  it('fog-hidden wins regardless of the latch, without consulting the gate', () => {
    let consulted = 0;
    const gate = {
      allow: () => {
        consulted++;
        return true;
      },
    };
    expect(townStaticReveal(false, false, 1e6, CULL_RADIUS, gate, 'town')).toBe('hidden');
    expect(townStaticReveal(false, true, 1e6, CULL_RADIUS, gate, 'town')).toBe('hidden');
    expect(consulted).toBe(0);
  });

  it('an already-revealed town never consults the gate again', () => {
    let consulted = 0;
    const gate = {
      allow: () => {
        consulted++;
        return false;
      },
    };
    expect(townStaticReveal(true, true, 1e6, CULL_RADIUS, gate, 'town')).toBe('revealed');
    expect(consulted).toBe(0);
  });

  it('a camera already inside the town reveals immediately, gate unconsulted', () => {
    // Login, hearth, or teleport lands the player among the buildings: a hold
    // would leave the sim colliders blocking movement against invisible
    // walls, so the inside case must never wait.
    let consulted = 0;
    const gate = {
      allow: () => {
        consulted++;
        return false;
      },
    };
    const inside = CULL_RADIUS * CULL_RADIUS;
    expect(townStaticReveal(true, false, inside, CULL_RADIUS, gate, 'town')).toBe('revealed');
    expect(consulted).toBe(0);
  });

  it('a walking approach holds while the gate denies and reveals once it allows', () => {
    const outside = (CULL_RADIUS + 1) * (CULL_RADIUS + 1);
    let warm = false;
    const consulted: string[] = [];
    const gate = {
      allow: (key: string) => {
        consulted.push(key);
        return warm;
      },
    };
    expect(townStaticReveal(true, false, outside, CULL_RADIUS, gate, 'town')).toBe('held');
    warm = true;
    expect(townStaticReveal(true, false, outside, CULL_RADIUS, gate, 'town')).toBe('revealed');
    expect(consulted).toEqual(['town', 'town']);
  });

  it('no gate keeps the historical immediate reveal', () => {
    const outside = (CULL_RADIUS + 1) * (CULL_RADIUS + 1);
    expect(townStaticReveal(true, false, outside, CULL_RADIUS, null, 'town')).toBe('revealed');
  });
});

describe('town piecewise per-root reveal', () => {
  const roots = [{ id: 'batch' }, { id: 'near' }, { id: 'mid' }, { id: 'far' }];
  const xs = [0, 10, 30, 90];
  const zs = [0, 0, 0, 0];
  const newState = () => newTownPiecewiseReveal('town', roots, xs, zs);

  /** A gate whose readiness set the test drives directly. */
  function readyGate(ready: Set<object>) {
    const noted: string[] = [];
    return {
      noted,
      gate: {
        allow: () => false,
        rootReady: (_key: string, root: object) => ready.has(root),
        noteRootRevealed: (key: string) => noted.push(key),
      },
    };
  }

  it('reveals a ready root while the key is still held', () => {
    const ready = new Set<object>([roots[2]]);
    const { gate } = readyGate(ready);
    const state = newState();
    expect(townPiecewiseRevealInto(state, 'held', 0, 0, gate)).toBe(1);
    expect(townRootVisible('held', state, 2)).toBe(true);
    // Everything else keeps waiting for its own compile.
    expect(townRootVisible('held', state, 0)).toBe(false);
    expect(townRootVisible('held', state, 3)).toBe(false);
  });

  it('takes the NEAREST ready roots first when several land in the same frame', () => {
    // The reveal order decides which first draws the player is looking at
    // while the rest still link: the near ones must not queue behind a
    // distant batch that happened to link first.
    const ready = new Set<object>(roots);
    const { gate } = readyGate(ready);
    const state = newState();
    // Camera at x=95: 'far' (90) is nearest, then 'mid' (30).
    expect(townPiecewiseRevealInto(state, 'held', 95, 0, gate)).toBe(2);
    expect(townRootVisible('held', state, 3)).toBe(true);
    expect(townRootVisible('held', state, 2)).toBe(true);
    expect(townRootVisible('held', state, 1)).toBe(false);
    expect(townRootVisible('held', state, 0)).toBe(false);
    // Next frame continues down the same order, still nearest first.
    expect(townPiecewiseRevealInto(state, 'held', 95, 0, gate)).toBe(2);
    expect(townRootVisible('held', state, 1)).toBe(true);
    expect(townRootVisible('held', state, 0)).toBe(true);
    expect(townPiecewiseRevealInto(state, 'held', 95, 0, gate)).toBe(0);
  });

  it('never flips more than the per-frame budget, so a whole town cannot land in one frame', () => {
    const ready = new Set<object>(roots);
    const { gate } = readyGate(ready);
    const state = newState();
    expect(townPiecewiseRevealInto(state, 'held', 0, 0, gate)).toBe(
      TOWN_PIECEWISE_REVEALS_PER_FRAME,
    );
  });

  it('a root once shown is never hidden again by the policy', () => {
    // Hiding a revealed object between frames moves the counted light set
    // (numPointLights is in three's program cache key), which is a fresh
    // program link on the re-show: the exact cost the gate exists to avoid.
    const ready = new Set<object>([roots[1]]);
    const { gate } = readyGate(ready);
    const state = newState();
    townPiecewiseRevealInto(state, 'held', 0, 0, gate);
    ready.clear();
    townPiecewiseRevealInto(state, 'held', 0, 0, gate);
    expect(townRootVisible('held', state, 1)).toBe(true);
  });

  it('reports every piecewise reveal to the gate, once per root', () => {
    const ready = new Set<object>([roots[1]]);
    const { gate, noted } = readyGate(ready);
    const state = newState();
    townPiecewiseRevealInto(state, 'held', 0, 0, gate);
    townPiecewiseRevealInto(state, 'held', 0, 0, gate);
    expect(noted).toEqual(['town']);
  });

  it('does nothing outside the held state', () => {
    const ready = new Set<object>(roots);
    const { gate } = readyGate(ready);
    const state = newState();
    expect(townPiecewiseRevealInto(state, 'revealed', 0, 0, gate)).toBe(0);
    expect(townPiecewiseRevealInto(state, 'hidden', 0, 0, gate)).toBe(0);
  });

  it('a fog-hidden town hides every root, revealed or not', () => {
    const ready = new Set<object>([roots[1]]);
    const { gate } = readyGate(ready);
    const state = newState();
    townPiecewiseRevealInto(state, 'held', 0, 0, gate);
    expect(townRootVisible('hidden', state, 1)).toBe(false);
  });

  it('a warm town shows every root, whatever the piecewise latch says', () => {
    const state = newState();
    for (let index = 0; index < roots.length; index++) {
      expect(townRootVisible('revealed', state, index)).toBe(true);
    }
  });

  it('a gate without per-root readiness keeps the all-or-nothing hold', () => {
    // The historical shape: an older gate, or none at all, must never leave a
    // root revealed by an undefined readiness answer.
    const state = newState();
    expect(townPiecewiseRevealInto(state, 'held', 0, 0, { allow: () => false })).toBe(0);
    expect(townPiecewiseRevealInto(state, 'held', 0, 0, null)).toBe(0);
    expect(townRootVisible('held', state, 0)).toBe(false);
  });

  it('a root with no position falls back to the town centre distance', () => {
    // The static batches span the whole town: their honest anchor is the
    // centre, and a short position list must not read past its end.
    const state = newTownPiecewiseReveal('town', roots, [0, 10], [0, 0]);
    const ready = new Set<object>([roots[3]]);
    const { gate } = readyGate(ready);
    expect(townPiecewiseRevealInto(state, 'held', 0, 0, gate)).toBe(1);
    expect(townRootVisible('held', state, 3)).toBe(true);
  });
});
