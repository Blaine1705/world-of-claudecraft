// mouseover_cast_core.ts: the Clique-style redirect rule shared by party /
// raid rows, focus frames and the target-of-target frame. Every gate gets a
// negative case, because the rule is as much about what it refuses to redirect:
// an offensive press must never be stolen off the current target by a cursor
// resting on a friendly frame.
import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../src/sim/data';
import {
  type MouseoverCastAbility,
  mouseoverCastTarget,
  mouseoverCastTargetPid,
} from '../src/ui/mouseover_cast_core';

const HEAL: MouseoverCastAbility = { requiresTarget: true, targetType: 'friendly' };
const alive = (id: number) => id === 7;

describe('mouseoverCastTarget', () => {
  it('redirects a friendly targeted ability onto the hovered unit', () => {
    expect(mouseoverCastTarget(7, { enabled: true, ability: HEAL, exists: alive })).toBe(7);
  });

  it('does not redirect when nothing is hovered', () => {
    expect(mouseoverCastTarget(null, { enabled: true, ability: HEAL, exists: alive })).toBeNull();
  });

  it('does not redirect while the mouseoverCast option is off', () => {
    expect(mouseoverCastTarget(7, { enabled: false, ability: HEAL, exists: alive })).toBeNull();
  });

  it('does not redirect an offensive ability, so a hovered frame never steals a nuke', () => {
    const nuke: MouseoverCastAbility = { requiresTarget: true, targetType: 'enemy' };
    expect(mouseoverCastTarget(7, { enabled: true, ability: nuke, exists: alive })).toBeNull();
  });

  it("does not redirect an 'any' ability, whose friendly reading is ambiguous", () => {
    const either: MouseoverCastAbility = { requiresTarget: true, targetType: 'any' };
    expect(mouseoverCastTarget(7, { enabled: true, ability: either, exists: alive })).toBeNull();
  });

  it('does not redirect an ability with no targetType at all', () => {
    const untyped: MouseoverCastAbility = { requiresTarget: true };
    expect(mouseoverCastTarget(7, { enabled: true, ability: untyped, exists: alive })).toBeNull();
  });

  it('does not redirect a targetless ability', () => {
    const aoe: MouseoverCastAbility = { requiresTarget: false, targetType: 'friendly' };
    expect(mouseoverCastTarget(7, { enabled: true, ability: aoe, exists: alive })).toBeNull();
  });

  it('falls back to the normal cast when a non-party hovered unit went stale', () => {
    expect(mouseoverCastTarget(99, { enabled: true, ability: HEAL, exists: alive })).toBeNull();
  });

  it('redirects a combat resurrection to a party member outside interest scope', () => {
    // The ClientWorld-shaped host can lose the released ghost's entity at the
    // graveyard, but the party wire still vouches for the member.
    expect(
      mouseoverCastTarget(7, {
        enabled: true,
        ability: ABILITIES.temporal_reversal,
        exists: () => false,
        partyMemberPids: () => [1, 7],
      }),
    ).toBe(7);
  });

  it('reads the roster only when the entity is out of scope', () => {
    let rosterReads = 0;
    const roster = () => {
      rosterReads++;
      return [1, 7];
    };
    expect(
      mouseoverCastTarget(7, {
        enabled: true,
        ability: HEAL,
        exists: alive,
        partyMemberPids: roster,
      }),
    ).toBe(7);
    expect(rosterReads).toBe(0);
  });

  it('keeps combat resurrections on the friendly-targeted path the redirect covers', () => {
    for (const id of ['temporal_reversal', 'recall_the_fallen'] as const) {
      const ability = ABILITIES[id];
      expect(ability.targetsDead).toBe(true);
      expect(ability.requiresTarget).toBe(true);
      expect(ability.targetType).toBe('friendly');
      expect(
        mouseoverCastTarget(7, {
          enabled: true,
          ability,
          exists: () => false,
          partyMemberPids: () => [1, 7],
        }),
      ).toBe(7);
    }
  });
});

describe('mouseoverCastTargetPid', () => {
  it('keeps the existing focus-target controller wrapper behavior', () => {
    expect(
      mouseoverCastTargetPid(7, HEAL, {
        enabled: true,
        hasEntity: alive,
        partyMemberPids: () => null,
      }),
    ).toBe(7);
  });
});
