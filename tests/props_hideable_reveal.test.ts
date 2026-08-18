// The hideable arm of the prop first-reveal policy (prop_cull_core.ts): the
// individual buildings, tents and campfires props.ts registers with
// registerHideable used to flip visible with a bare write on their first
// fog reveal, and their unique kit materials linked cold at first draw (the
// Eastbrook Grand Armoury's five programs, 536 + 198 + 182 + 283 + 290 ms on
// the iGPU ride in). They ride the band gate now: first sight held while the
// gate is cold, revealed once its compile settles, never asked again, culled
// again beyond the fog reach, instant inside the reach floor, imminent inside
// the near line. Nothing here answers to a clock.

import { describe, expect, it } from 'vitest';
import {
  latchPropCullReveal,
  PROP_CULL_REVEAL_NEAR_FRACTION,
  PROP_CULL_REVEAL_REACH,
  type PropCullRevealState,
  propHideableConsultImminent,
  propHideableInFog,
  propHideableKey,
  propHideableReveal,
  propHideableSurfaceDistSq,
} from '../src/render/prop_cull_core';
import { createRevealGateCore } from '../src/render/reveal_gate_core';

function hideable(index = 0): PropCullRevealState {
  return { key: propHideableKey(index), revealed: false, held: false };
}

/** props.ts update: consult, latch, and the group's visibility follows. */
function frame(
  h: PropCullRevealState & { visible?: boolean },
  centerDistSq: number,
  cull: number,
  fogFar: number,
  gate: { allow(key: string, imminent?: boolean): boolean } | null,
): 'hidden' | 'held' | 'revealed' {
  const reveal = propHideableReveal(centerDistSq, cull, fogFar, h, gate);
  latchPropCullReveal(h, reveal);
  h.visible = reveal === 'revealed';
  return reveal;
}

const sq = (d: number): number => d * d;

describe('hideable fog reach and surface distance', () => {
  it('keeps the historical cull: drawn while the centre is within fogFar + cull', () => {
    expect(propHideableInFog(sq(129), 10, 120)).toBe(true);
    // The exact reach is excluded, as the props loop always did (>= drops).
    expect(propHideableInFog(sq(130), 10, 120)).toBe(false);
    expect(propHideableInFog(0, 10, 120)).toBe(true);
  });

  it('measures the reach floor and near line from the cull sphere surface, 0 inside', () => {
    expect(propHideableSurfaceDistSq(sq(50), 10)).toBe(sq(40));
    expect(propHideableSurfaceDistSq(sq(10), 10)).toBe(0);
    expect(propHideableSurfaceDistSq(sq(3), 10)).toBe(0);
  });
});

describe('hideable first-sight policy', () => {
  it('holds the first sight while the gate is cold, reveals once warm, and never asks again', () => {
    const requested: { key: string; imminent: boolean }[] = [];
    const gate = createRevealGateCore((key, imminent) => requested.push({ key, imminent }));
    const h = hideable(3);
    // Centre 100 away, cull 10: surface 90, inside fogFar 120, beyond the
    // near line (60): a walking approach.
    expect(frame(h, sq(100), 10, 120, gate)).toBe('held');
    expect(requested).toEqual([{ key: 'hideable:3', imminent: false }]);
    expect(h.held).toBe(true);
    expect(h.revealed).toBe(false);
    // However many frames go by, the hold waits for its own compile.
    for (let n = 0; n < 500; n++) expect(frame(h, sq(100), 10, 120, gate)).toBe('held');
    expect(requested).toHaveLength(1);
    gate.settle('hideable:3');
    expect(frame(h, sq(100), 10, 120, gate)).toBe('revealed');
    expect(h.revealed).toBe(true);
    // Once revealed: culled again beyond the reach, back without a consult.
    const cold = createRevealGateCore((key) =>
      requested.push({ key: `again:${key}`, imminent: false }),
    );
    expect(frame(h, sq(200), 10, 120, cold)).toBe('hidden');
    expect(frame(h, sq(100), 10, 120, cold)).toBe('revealed');
    expect(requested).toHaveLength(1);
  });

  it('never consults the gate for a hideable past the fog reach', () => {
    let consulted = 0;
    const gate = { allow: () => (consulted++, true) };
    const h = hideable();
    expect(frame(h, sq(131), 10, 120, gate)).toBe('hidden');
    expect(consulted).toBe(0);
    expect(h.held).toBe(false);
    expect(h.revealed).toBe(false);
  });

  it('reveals instantly inside the reach floor, gate or not, held or not', () => {
    const requested: string[] = [];
    const gate = createRevealGateCore((key) => requested.push(key));
    const h = hideable(1);
    expect(frame(h, sq(100), 10, 120, gate)).toBe('held');
    // Surface 41: still held. Surface 40: the reach floor, no settle needed.
    expect(frame(h, sq(PROP_CULL_REVEAL_REACH + 11), 10, 120, gate)).toBe('held');
    expect(frame(h, sq(PROP_CULL_REVEAL_REACH + 10), 10, 120, gate)).toBe('revealed');
    expect(h.revealed).toBe(true);
    expect(requested).toEqual(['hideable:1']);
    // A first sight already at arm's length never asks at all.
    const close = hideable(2);
    expect(frame(close, sq(20), 10, 120, gate)).toBe('revealed');
    expect(requested).toEqual(['hideable:1']);
  });

  it('marks a first sight inside the near line IMMINENT, and holds it all the same', () => {
    const requested: { key: string; imminent: boolean }[] = [];
    const gate = createRevealGateCore((key, imminent) => requested.push({ key, imminent }));
    const near = 120 * PROP_CULL_REVEAL_NEAR_FRACTION;
    // Surface exactly on the near line (centre near + cull): imminent.
    const h = hideable(4);
    expect(propHideableConsultImminent(sq(near + 10), 10, 120, h, gate)).toBe(true);
    expect(requested).toEqual([]);
    expect(frame(h, sq(near + 10), 10, 120, gate)).toBe('held');
    expect(requested).toEqual([{ key: 'hideable:4', imminent: true }]);
    // Held now: the imminent window is over, a plain hold from here on.
    expect(propHideableConsultImminent(sq(near + 10), 10, 120, h, gate)).toBe(false);
    // One unit past the near line: an ordinary submission.
    const walking = hideable(5);
    expect(propHideableConsultImminent(sq(near + 11), 10, 120, walking, gate)).toBe(false);
    expect(frame(walking, sq(near + 11), 10, 120, gate)).toBe('held');
    expect(requested[1]).toEqual({ key: 'hideable:5', imminent: false });
    // Beyond the fog, inside the reach floor, revealed, or with no gate:
    // never imminent.
    expect(propHideableConsultImminent(sq(131), 10, 120, hideable(6), gate)).toBe(false);
    expect(propHideableConsultImminent(sq(30), 10, 120, hideable(7), gate)).toBe(false);
    expect(
      propHideableConsultImminent(sq(near + 10), 10, 120, { ...hideable(8), revealed: true }, gate),
    ).toBe(false);
    expect(propHideableConsultImminent(sq(near + 10), 10, 120, hideable(9), null)).toBe(false);
  });

  it('keeps the historical immediate flip without a gate and latches it as revealed', () => {
    const h = hideable();
    expect(frame(h, sq(100), 10, 120, null)).toBe('revealed');
    expect(h.revealed).toBe(true);
    // Armed later (world entry), the latch means it is never consulted.
    let consulted = 0;
    const gate = { allow: () => (consulted++, false) };
    expect(frame(h, sq(100), 10, 120, gate)).toBe('revealed');
    expect(consulted).toBe(0);
  });
});
