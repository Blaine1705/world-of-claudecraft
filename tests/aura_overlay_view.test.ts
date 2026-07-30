import { describe, expect, it } from 'vitest';
import { activeWarriorProcIds, availableWarriorProcDefs } from '../src/ui/aura_overlay_view';

const known = (...ids: string[]) => ids.map((id) => ({ def: { id } }));

describe('availableWarriorProcDefs', () => {
  it('shows only procs relevant to the current Warrior loadout', () => {
    expect(availableWarriorProcDefs('warrior', known('revenge')).map((p) => p.id)).toEqual([
      'revenge_free',
    ]);
    expect(
      availableWarriorProcDefs(
        'warrior',
        known(
          'heroic_strike',
          'execute',
          'sudden_death',
          'victory_rush',
          'overpower',
          'mortal_strike',
        ),
      ).map((p) => p.id),
    ).toEqual(['battle_trance', 'overpower_charge', 'sudden_death', 'victory_rush']);
    expect(
      availableWarriorProcDefs(
        'warrior',
        known('bloodthirst', 'red_harvest', 'enrage_passive'),
      ).map((p) => p.id),
    ).toEqual(['enrage']);
    expect(
      availableWarriorProcDefs('warrior', known('overpower', 'execute', 'sudden_death')).map(
        (p) => p.id,
      ),
    ).not.toContain('overpower_charge');
    expect(
      availableWarriorProcDefs('warrior', known('mortal_strike', 'execute', 'sudden_death')).map(
        (p) => p.id,
      ),
    ).not.toContain('overpower_charge');
    expect(
      availableWarriorProcDefs('warrior', known('mortal_strike', 'sudden_death')).map((p) => p.id),
    ).not.toContain('sudden_death');
    expect(
      availableWarriorProcDefs('warrior', known('mortal_strike', 'execute')).map((p) => p.id),
    ).not.toContain('sudden_death');
    expect(
      availableWarriorProcDefs('warrior', known('red_harvest')).find((p) => p.id === 'enrage'),
    ).toMatchObject({ iconAbilityId: 'red_harvest' });
    expect(
      availableWarriorProcDefs('warrior', known('heroic_strike', 'mortal_strike')).find(
        (p) => p.id === 'battle_trance',
      ),
    ).toMatchObject({ iconAbilityId: 'mortal_strike' });
    expect(
      availableWarriorProcDefs('warrior', known('overpower', 'mortal_strike')).find(
        (p) => p.id === 'overpower_charge',
      ),
    ).toMatchObject({ iconAbilityId: 'overpower' });
    expect(
      availableWarriorProcDefs(
        'warrior',
        known('revenge', 'heroic_strike', 'raised_guard', 'iron_resolve'),
      ).map((p) => p.id),
    ).toEqual(['revenge_free', 'battle_trance', 'raised_guard', 'iron_resolve']);
    expect(
      availableWarriorProcDefs('warrior', known('bloodthirst')).find((p) => p.id === 'enrage'),
    ).toMatchObject({ iconAbilityId: 'bloodthirst' });
    expect(
      availableWarriorProcDefs('warrior', known('enrage_passive')).find((p) => p.id === 'enrage'),
    ).toMatchObject({ iconAbilityId: 'red_harvest' });
  });

  it('does not expose Warrior overlays to another class', () => {
    expect(availableWarriorProcDefs('mage', known('revenge'))).toEqual([]);
  });
});

describe('activeWarriorProcIds', () => {
  it('maps active aura ids and ignores unrelated buffs', () => {
    expect(
      activeWarriorProcIds([
        { kind: 'revenge_free' },
        { kind: 'buff_ap_pct' },
        { kind: 'victory_rush' },
        { kind: 'enrage' },
      ]),
    ).toEqual(new Set(['revenge_free', 'victory_rush', 'enrage']));
  });
});
