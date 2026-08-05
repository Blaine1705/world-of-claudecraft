// Who receives a combat event. The filter exists so a player is not spammed
// with every stranger's swing in a crowded zone; the bug it shipped with is that
// a PET is neither the viewer nor a party member, so an owner never received
// their own pet's damage. That made pet output vanish from the damage meter,
// the combat log and floating combat text for every pet class (hunter, warlock,
// mage) from v0.30.0, where this filter was introduced.

import { describe, expect, it } from 'vitest';
import { shouldDeliverCombatEventToViewer } from '../../server/event_delivery';
import type { SimEvent } from '../../src/sim/types';

// pids 1 and 2 are players; 3 is 1's pet, 8 is a stranger's pet, 50 is a mob.
const OWNERS = new Map<number, number>([
  [3, 1],
  [8, 7],
]);
const ownerOf = (id: number): number | null => OWNERS.get(id) ?? null;
const TAPPERS = new Map<number, number>([[50, 1]]);
const tapperOf = (id: number): number | null => TAPPERS.get(id) ?? null;
const lookups = { ownerOf, tapperOf };

const dmg = (sourceId: number, targetId: number): SimEvent =>
  ({
    type: 'damage',
    sourceId,
    targetId,
    amount: 200,
    crit: false,
    school: 'physical',
    ability: 'Claw',
    kind: 'hit',
  }) as unknown as SimEvent;

const heal = (sourceId: number, targetId: number): SimEvent =>
  ({ type: 'heal2', sourceId, targetId, amount: 50, ability: 'Mend' }) as unknown as SimEvent;

const party = { members: [1, 2] as readonly number[] };

describe('combat event delivery', () => {
  it('delivers a pet hit to its own owner', () => {
    // the regression: sourceId is the PET's entity id, never the owner's pid
    expect(shouldDeliverCombatEventToViewer(dmg(3, 50), 1, null, lookups)).toBe(true);
  });

  it('delivers a pet hit to the owner party mates', () => {
    expect(shouldDeliverCombatEventToViewer(dmg(3, 50), 2, party, lookups)).toBe(true);
  });

  it('delivers damage TAKEN by a pet to its owner', () => {
    // the mob swinging back at the pet is the owner's business too
    expect(shouldDeliverCombatEventToViewer(dmg(50, 3), 1, null, lookups)).toBe(true);
  });

  it('still hides a stranger pet from an uninvolved viewer', () => {
    // the whole point of the filter: no crowded-zone spam
    expect(shouldDeliverCombatEventToViewer(dmg(8, 50), 1, null, lookups)).toBe(false);
    expect(shouldDeliverCombatEventToViewer(dmg(8, 50), 1, party, lookups)).toBe(false);
  });

  it('treats a pet heal the same way', () => {
    expect(shouldDeliverCombatEventToViewer(heal(3, 1), 1, null, lookups)).toBe(true);
    expect(shouldDeliverCombatEventToViewer(heal(8, 7), 1, null, lookups)).toBe(false);
  });

  it('leaves ownerless combat exactly as it was', () => {
    expect(shouldDeliverCombatEventToViewer(dmg(1, 50), 1, null, lookups)).toBe(true);
    expect(shouldDeliverCombatEventToViewer(dmg(50, 1), 1, null, lookups)).toBe(true);
    expect(shouldDeliverCombatEventToViewer(dmg(2, 50), 1, party, lookups)).toBe(true);
    expect(shouldDeliverCombatEventToViewer(dmg(7, 50), 1, party, lookups)).toBe(false);
    expect(shouldDeliverCombatEventToViewer(dmg(7, 50), 1, null, lookups)).toBe(false);
  });

  it('delivers tapped mob aura and death events only to the tapper group', () => {
    const aura = { type: 'aura', targetId: 50, name: 'Venom Barb', gained: true } as SimEvent;
    const death = { type: 'death', entityId: 50, killerId: 3 } as SimEvent;

    expect(shouldDeliverCombatEventToViewer(aura, 1, null, lookups)).toBe(true);
    expect(shouldDeliverCombatEventToViewer(aura, 2, party, lookups)).toBe(true);
    expect(shouldDeliverCombatEventToViewer(aura, 7, null, lookups)).toBe(false);
    expect(shouldDeliverCombatEventToViewer(death, 1, null, lookups)).toBe(true);
    expect(shouldDeliverCombatEventToViewer(death, 2, party, lookups)).toBe(true);
    expect(shouldDeliverCombatEventToViewer(death, 7, null, lookups)).toBe(false);
  });

  it('passes every non-combat event through untouched', () => {
    const chat = { type: 'chat', fromPid: 9, text: 'hi' } as unknown as SimEvent;
    expect(shouldDeliverCombatEventToViewer(chat, 1, null, lookups)).toBe(true);
  });

  it('survives an owner lookup that knows nothing', () => {
    // a pet whose entity has already been dropped resolves to itself, i.e. the
    // pre-fix behaviour, rather than throwing on the broadcast path
    const blind = () => null;
    const blindLookups = { ownerOf: blind, tapperOf: blind };
    expect(shouldDeliverCombatEventToViewer(dmg(1, 50), 1, null, blindLookups)).toBe(true);
    expect(shouldDeliverCombatEventToViewer(dmg(3, 50), 1, null, blindLookups)).toBe(false);
  });
});
