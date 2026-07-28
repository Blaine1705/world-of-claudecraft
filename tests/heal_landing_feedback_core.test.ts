import { describe, expect, it } from 'vitest';
import { ClientWorld } from '../src/net/online';
import type { SimEvent } from '../src/sim/types';
import {
  healLandingFloatTextKey,
  healLandingLogKey,
  shouldFloatHealLanding,
  shouldShowHealLanding,
} from '../src/ui/heal_landing_feedback_core';

type Heal2Event = Extract<SimEvent, { type: 'heal2' }>;

function heal2(overrides: Partial<Heal2Event>): Heal2Event {
  return {
    type: 'heal2',
    sourceId: 1,
    targetId: 2,
    amount: 25,
    crit: false,
    ability: 'Lesser Heal',
    ...overrides,
  };
}

function onlineDrain(events: SimEvent[]): SimEvent[] {
  const client = Object.create(ClientWorld.prototype) as {
    eventQueue: SimEvent[];
    drainEvents(): SimEvent[];
  };
  client.eventQueue = [...events];
  return client.drainEvents();
}

describe('heal landing feedback', () => {
  it('shows ordinary positive healing exactly as before', () => {
    expect(shouldShowHealLanding(heal2({ amount: 25 }))).toBe(true);
    expect(shouldFloatHealLanding(heal2({ amount: 25 }))).toBe(true);
    expect(healLandingLogKey(heal2({ amount: 25, crit: false }), true)).toBe('hud.combat.healSelf');
  });

  it('floats direct zero-effective healing as a non-numeric full-health cue', () => {
    const ev = heal2({ sourceId: 1, targetId: 1, amount: 0 });

    expect(shouldShowHealLanding(ev)).toBe(true);
    expect(shouldFloatHealLanding(ev)).toBe(true);
    expect(healLandingFloatTextKey(ev)).toBe('hud.combat.floatingHealFull');
    expect(healLandingLogKey(ev, true)).toBe('hud.combat.healSelfFull');
  });

  it('keeps cue-only HoT application events hidden from FCT and the combat log', () => {
    const ev = heal2({ amount: 0, cueOnly: true });

    expect(shouldShowHealLanding(ev)).toBe(false);
    expect(shouldFloatHealLanding(ev)).toBe(false);
    expect(healLandingFloatTextKey(ev)).toBe(null);
    expect(healLandingLogKey(ev, true)).toBe(null);
  });

  it('does not create zero-float spam for HoT ticks', () => {
    const ev = heal2({ amount: 0, hot: true });

    expect(shouldShowHealLanding(ev)).toBe(false);
    expect(shouldFloatHealLanding(ev)).toBe(false);
    expect(healLandingFloatTextKey(ev)).toBe(null);
    expect(healLandingLogKey(ev, true)).toBe(null);
  });

  it('keeps online-delivered zero-effective direct heals visible to the HUD feedback path', () => {
    const [ev] = onlineDrain([heal2({ sourceId: 7, targetId: 7, amount: 0 })]) as Heal2Event[];

    expect(ev).toMatchObject({ type: 'heal2', sourceId: 7, targetId: 7, amount: 0 });
    expect(shouldShowHealLanding(ev)).toBe(true);
    expect(shouldFloatHealLanding(ev)).toBe(true);
    expect(healLandingFloatTextKey(ev)).toBe('hud.combat.floatingHealFull');
    expect(healLandingLogKey(ev, true)).toBe('hud.combat.healSelfFull');
  });
});
