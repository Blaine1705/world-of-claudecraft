import { describe, expect, it, vi } from 'vitest';
import {
  dispatchVarkhulForgeHammerAttack,
  varkhulForgeHammerAttackPlan,
} from '../src/render/varkhul_forge_hammer';
import { VARKHUL_FORGE_HAMMER_ABILITY_ID } from '../src/sim/encounters/varkhul';

describe('Varkhul forge hammer render plan', () => {
  it('starts the authored swing only for the positional hammer impact', () => {
    expect(
      varkhulForgeHammerAttackPlan({
        ability: VARKHUL_FORGE_HAMMER_ABILITY_ID,
        sourceId: 42,
        fx: 'burst',
      }),
    ).toEqual({ entityId: 42, abilityId: "Forgefather's Hammer" });
    expect(
      varkhulForgeHammerAttackPlan({ ability: 'Forge Meltdown', sourceId: 42, fx: 'burst' }),
    ).toBeNull();
    expect(
      varkhulForgeHammerAttackPlan({
        ability: VARKHUL_FORGE_HAMMER_ABILITY_ID,
        sourceId: undefined,
        fx: 'burst',
      }),
    ).toBeNull();

    const triggerAttack = vi.fn();
    expect(
      dispatchVarkhulForgeHammerAttack(
        { ability: VARKHUL_FORGE_HAMMER_ABILITY_ID, sourceId: 42, fx: 'burst' },
        triggerAttack,
      ),
    ).toBe(true);
    expect(triggerAttack).toHaveBeenCalledOnce();
    expect(triggerAttack).toHaveBeenCalledWith(42, "Forgefather's Hammer");
    expect(
      dispatchVarkhulForgeHammerAttack(
        { ability: 'Forge Meltdown', sourceId: 42, fx: 'burst' },
        triggerAttack,
      ),
    ).toBe(false);
    expect(triggerAttack).toHaveBeenCalledOnce();
  });

  it("routes the Anvil's Decree strike, gated on fx kind, and nothing else", () => {
    // decree strike: the forge 'nova'; its meteors share the ability id but
    // emit 'meteorImpact' and must NOT retrigger the swing
    expect(
      varkhulForgeHammerAttackPlan({ ability: "Anvil's Decree", sourceId: 7, fx: 'nova' }),
    ).toEqual({ entityId: 7, abilityId: "Anvil's Decree" });
    expect(
      varkhulForgeHammerAttackPlan({ ability: "Anvil's Decree", sourceId: 7, fx: 'meteorImpact' }),
    ).toBeNull();
    // the Sweep release is deliberately unrouted: its whole windup is a Slam
    // cast clip (castByAbility), so a release one-shot would double-swing
    expect(
      varkhulForgeHammerAttackPlan({ ability: "Forgefather's Sweep", sourceId: 7, fx: 'burst' }),
    ).toBeNull();
    // hammer impact under the wrong fx kind stays silent
    expect(
      varkhulForgeHammerAttackPlan({
        ability: VARKHUL_FORGE_HAMMER_ABILITY_ID,
        sourceId: 7,
        fx: 'nova',
      }),
    ).toBeNull();
  });
});
