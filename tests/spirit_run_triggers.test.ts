// src/sim/spirit_run_triggers.ts: the trigger set a released spirit walks
// through on its corpse run. Pins the load-bearing claim in the module
// header: door, rift, then the overworld passage, the same order as the
// living arm of the player tick, so a ghost on overlapping triggers resolves
// the way a live player would. The end-to-end crossing (a ghost that rose in
// the Hollow comes back through the Duskfall passage) is in portals.test.ts.

import { describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
vi.mock('../src/sim/instances/dungeons', () => ({
  updateDoorTriggers: () => calls.push('door'),
}));
vi.mock('../src/sim/rift/runs', () => ({
  updateRiftTriggers: () => calls.push('rift'),
}));
vi.mock('../src/sim/portals', () => ({
  updatePortalTriggers: () => calls.push('portal'),
}));

const { updateSpiritRunTriggers } = await import('../src/sim/spirit_run_triggers');

describe('updateSpiritRunTriggers', () => {
  it('runs door, rift, then passage triggers, in the living arm order', () => {
    calls.length = 0;
    const ctx = {} as never;
    const ghost = { kind: 'player', dead: true, ghost: true } as never;
    updateSpiritRunTriggers(ctx, ghost);
    expect(calls).toEqual(['door', 'rift', 'portal']);
  });
});
