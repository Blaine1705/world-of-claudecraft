// The object views a template swap leaves standing (render/gate_objects.ts
// isStableObjectTransition): the renderer rebuilds an object's view when its
// template changes, except across these pairs.

import { describe, expect, it } from 'vitest';
import { gateObjectPlan, isStableObjectTransition } from '../src/render/gate_objects';
import {
  FOUNDRY_OBJECT_TEMPLATES,
  FOUNDRY_SHELL_MARK,
  FOUNDRY_SHELL_PENDING,
  FOUNDRY_SHRAPNEL,
} from '../src/sim/encounters/stormbrass_foundry/ids';

describe('stable object template transitions', () => {
  it('a Rangewarden shell arming keeps its view; nothing else about a shell does', () => {
    expect(isStableObjectTransition(FOUNDRY_SHELL_PENDING, FOUNDRY_SHELL_MARK)).toBe(true);
    expect(isStableObjectTransition(FOUNDRY_SHELL_MARK, FOUNDRY_SHELL_PENDING)).toBe(false);
    expect(isStableObjectTransition(FOUNDRY_SHELL_PENDING, FOUNDRY_SHRAPNEL)).toBe(false);
    expect(isStableObjectTransition(FOUNDRY_SHELL_PENDING, 'mailbox')).toBe(false);
    expect(isStableObjectTransition('mailbox', FOUNDRY_SHELL_MARK)).toBe(false);
  });

  it('both ends of the stable pair are the same empty encounter anchor', () => {
    // The premise of skipping the rebuild: were one to leave the set, the kept
    // view would be the wrong one.
    expect(FOUNDRY_OBJECT_TEMPLATES.has(FOUNDRY_SHELL_PENDING)).toBe(true);
    expect(FOUNDRY_OBJECT_TEMPLATES.has(FOUNDRY_SHELL_MARK)).toBe(true);
    const at = { dungeonId: null, pos: { x: 0, z: 0 } };
    const pending = gateObjectPlan({ ...at, templateId: FOUNDRY_SHELL_PENDING });
    const armed = gateObjectPlan({ ...at, templateId: FOUNDRY_SHELL_MARK });
    expect(pending).toEqual({ encounterAnchor: true, height: 2 });
    expect(armed).toEqual(pending);
  });

  it('still answers for the Ignivar conduit pairs', () => {
    expect(
      isStableObjectTransition('ignivar_water_conduit_ready', 'ignivar_water_conduit_active'),
    ).toBe(true);
    expect(isStableObjectTransition('ignivar_water_conduit_ready', 'mailbox')).toBe(false);
  });
});
