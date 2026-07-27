import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../src/sim/types';
import { shouldShowHealLanding } from '../src/ui/heal_landing_feedback_core';

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

describe('heal landing feedback', () => {
  it('shows ordinary positive healing exactly as before', () => {
    expect(shouldShowHealLanding(heal2({ amount: 25 }))).toBe(true);
  });

  it('shows direct zero-effective healing so full-health friendly casts visibly land', () => {
    expect(shouldShowHealLanding(heal2({ amount: 0 }))).toBe(true);
  });

  it('keeps cue-only HoT application events hidden from FCT and the combat log', () => {
    expect(shouldShowHealLanding(heal2({ amount: 0, cueOnly: true }))).toBe(false);
  });

  it('does not create zero-float spam for HoT ticks', () => {
    expect(shouldShowHealLanding(heal2({ amount: 0, hot: true }))).toBe(false);
  });
});
