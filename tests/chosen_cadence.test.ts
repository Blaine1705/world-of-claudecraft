import { beforeEach, describe, expect, it } from 'vitest';
import {
  cadencePlayerInCombat,
  chosenCadenceHoldsQuality,
  chosenCadenceIntervalMs,
  chosenCadenceMissShare,
  frameLoadMs,
  governorIsAtBaseline,
  governorIsShedding,
  noteCadenceProbeContext,
  noteGovernorShedding,
  resetChosenCadenceForRenderer,
  setChosenCadence,
} from '../src/render/chosen_cadence';
import { NO_CHOSEN_CADENCE } from '../src/render/chosen_cadence_pressure_core';

describe('chosen cadence signal', () => {
  beforeEach(() => {
    setChosenCadence(0, 0, false);
    noteGovernorShedding(false);
  });

  it('publishes no cadence for a zero interval, whatever share came with it', () => {
    setChosenCadence(33.3, 0.2, true);
    setChosenCadence(0, 0.4, false);
    expect(chosenCadenceIntervalMs()).toBe(0);
    expect(chosenCadenceMissShare()).toBe(NO_CHOSEN_CADENCE);
    expect(NO_CHOSEN_CADENCE).toBe(-1);
    expect(chosenCadenceHoldsQuality()).toBe(false);
    setChosenCadence(-5, 0.4, false);
    expect(chosenCadenceIntervalMs()).toBe(0);
    expect(chosenCadenceMissShare()).toBe(NO_CHOSEN_CADENCE);
  });

  it('publishes the interval, the miss share and the quality hold of a chosen cadence', () => {
    setChosenCadence(33.3, 0.2, true);
    expect(chosenCadenceIntervalMs()).toBe(33.3);
    expect(chosenCadenceMissShare()).toBe(0.2);
    expect(chosenCadenceHoldsQuality()).toBe(true);
    setChosenCadence(33.3, 0.2, false);
    expect(chosenCadenceHoldsQuality()).toBe(false);
  });

  it('carries the governor shedding flag until a new renderer clears it', () => {
    expect(governorIsShedding()).toBe(false);
    noteGovernorShedding(true);
    expect(governorIsShedding()).toBe(true);
    // The cadence publish never touches it: only the renderer writes this flag.
    setChosenCadence(0, 0, false);
    expect(governorIsShedding()).toBe(true);
    resetChosenCadenceForRenderer();
    expect(governorIsShedding()).toBe(false);
  });

  it('carries the probe context until a new renderer clears it', () => {
    expect(governorIsAtBaseline()).toBe(false);
    expect(cadencePlayerInCombat()).toBe(false);
    noteCadenceProbeContext(true, true);
    expect(governorIsAtBaseline()).toBe(true);
    expect(cadencePlayerInCombat()).toBe(true);
    noteCadenceProbeContext(true, false);
    expect(cadencePlayerInCombat()).toBe(false);
    // A value left by the previous renderer must never read as headroom.
    resetChosenCadenceForRenderer();
    expect(governorIsAtBaseline()).toBe(false);
  });

  it('reads a frame interval as load: nominal plus the lateness under a cadence, raw without', () => {
    expect(frameLoadMs(50)).toBe(50);
    setChosenCadence(33.3, 0, false);
    expect(frameLoadMs(50)).toBeCloseTo(1000 / 60 + 16.7, 6);
    expect(frameLoadMs(33.3)).toBeCloseTo(1000 / 60, 6);
    expect(frameLoadMs(20)).toBeCloseTo(1000 / 60, 6);
    setChosenCadence(0, 0, false);
    expect(frameLoadMs(50)).toBe(50);
  });
});
