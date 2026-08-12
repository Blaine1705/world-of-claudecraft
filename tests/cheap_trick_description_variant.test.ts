// Cheap Trick (rogue row 11) retires Gut Punch's stealth requirement, and the
// tooltip's requirement LINE is already talent-aware (PR #3325). The description
// prose must follow: a talented tooltip should not still read "Must be stealthed."
//
// The fix is a UI-layer description variant (entities.abilities.cheap_shot
// .descriptionNoStealth), selected by the tooltip when the resolved ability has
// dropped the requirement. It lives ONLY in the UI i18n catalog, so the sim
// ability def, and the mob-portrait renderer fingerprint it feeds through
// src/sim/data.ts, stay untouched (no portrait re-bless), and a normal rogue's
// description is unchanged.

import { beforeAll, describe, expect, it } from 'vitest';
import { ABILITIES } from '../src/sim/data';
import { tEntity, tEntityOptional } from '../src/ui/entity_i18n';
import { ensureLocaleLoaded, setLanguage } from '../src/ui/i18n';

beforeAll(async () => {
  await ensureLocaleLoaded('en');
  setLanguage('en');
});

describe('Gut Punch stealth-free description variant', () => {
  it('the base description still states the stealth gate for a normal rogue', () => {
    expect(tEntity({ kind: 'ability', id: 'cheap_shot', field: 'description' })).toMatch(
      /stealth/i,
    );
  });

  it('the variant drops the stealth clause but keeps the rest of the prose', () => {
    const variant = tEntityOptional({
      kind: 'ability',
      id: 'cheap_shot',
      field: 'descriptionNoStealth',
    });
    expect(variant).not.toBeNull();
    expect(variant).not.toMatch(/stealth/i);
    // Same prose otherwise: the stun and the combo-point award both survive.
    expect(variant).toMatch(/4 sec/);
    expect(variant).toContain('2 combo points');
  });

  it('leaves the sim content description intact, so the portrait fingerprint never moves', () => {
    // The clause is trimmed only at the UI layer. The sim ability def keeps "Must
    // be stealthed.", and that string is what src/sim/data.ts bundles into the mob
    // portrait renderer fingerprint, so this fix requires no portrait re-bless.
    expect(ABILITIES.cheap_shot.description).toMatch(/stealth/i);
  });
});
