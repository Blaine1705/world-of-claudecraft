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
      }),
    ).toEqual({ entityId: 42, abilityId: "Forgefather's Hammer" });
    expect(varkhulForgeHammerAttackPlan({ ability: 'Forge Meltdown', sourceId: 42 })).toBeNull();
    expect(
      varkhulForgeHammerAttackPlan({
        ability: VARKHUL_FORGE_HAMMER_ABILITY_ID,
        sourceId: undefined,
      }),
    ).toBeNull();

    const triggerAttack = vi.fn();
    expect(
      dispatchVarkhulForgeHammerAttack(
        { ability: VARKHUL_FORGE_HAMMER_ABILITY_ID, sourceId: 42 },
        triggerAttack,
      ),
    ).toBe(true);
    expect(triggerAttack).toHaveBeenCalledOnce();
    expect(triggerAttack).toHaveBeenCalledWith(42, "Forgefather's Hammer");
    expect(
      dispatchVarkhulForgeHammerAttack({ ability: 'Forge Meltdown', sourceId: 42 }, triggerAttack),
    ).toBe(false);
    expect(triggerAttack).toHaveBeenCalledOnce();
  });
});
