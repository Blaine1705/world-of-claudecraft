import { describe, expect, it } from 'vitest';
import { shouldDeliverCombatEventToViewer } from '../server/event_delivery';
import type { SimEvent } from '../src/sim/types';

const guardianHit: SimEvent = {
  type: 'damage',
  sourceId: 90,
  sourceOwnerId: 10,
  targetId: 200,
  amount: 36,
  crit: false,
  school: 'fire',
  ability: 'Pyre Aura',
  kind: 'hit',
};

describe('combat event delivery', () => {
  it('delivers guardian damage to its owner and the owner party', () => {
    expect(shouldDeliverCombatEventToViewer(guardianHit, 10, null)).toBe(true);
    expect(shouldDeliverCombatEventToViewer(guardianHit, 11, { members: [10, 11] })).toBe(true);
  });

  it('does not expose guardian damage to unrelated viewers', () => {
    expect(shouldDeliverCombatEventToViewer(guardianHit, 12, { members: [12] })).toBe(false);
  });
});
