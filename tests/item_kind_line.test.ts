// @vitest-environment jsdom
//
// The fine-grade kind-line split (the UX pass): a fine-grade material's
// tooltip kind line reads "Fine Material" while its def KIND stays 'junk'
// (the downward substitution and the Sell Junk sweep both key off it).
// Driven over the real Hud.prototype.itemTooltip (the deeds_window
// Object.create idiom), base and fine side by side so a broken pairing
// cannot pass by rewording both.

import { describe, expect, it } from 'vitest';
import { ITEMS } from '../src/sim/data';
import { baseMaterialFor } from '../src/sim/professions/material_grades';
import { Hud } from '../src/ui/hud';

function tooltipHtml(itemId: string): string {
  const h = Object.create(Hud.prototype) as unknown as {
    itemTooltip(item: unknown, compare?: boolean): string;
  };
  const item = ITEMS[itemId];
  if (!item) throw new Error(`missing item ${itemId}`);
  return h.itemTooltip(item, false);
}

describe('the tooltip kind line for material grades', () => {
  it('a fine grade reads Fine Material, never Junk; its base still reads Junk', () => {
    // Fixture sanity: the pairing and the internal kind are what the split
    // depends on.
    expect(ITEMS.fine_iron_ore.kind).toBe('junk');
    expect(baseMaterialFor('fine_iron_ore')).toBe('iron_ore');
    const fine = tooltipHtml('fine_iron_ore');
    expect(fine).toContain('Fine Material');
    expect(fine).not.toContain('>Junk<');
    const base = tooltipHtml('iron_ore');
    expect(base).toContain('Junk');
    expect(base).not.toContain('Fine Material');
  });

  it('ordinary junk-kind items keep the Junk line (the split is fine-grades only)', () => {
    const junkId = Object.keys(ITEMS).find(
      (id) => ITEMS[id].kind === 'junk' && baseMaterialFor(id) === undefined,
    );
    if (!junkId) throw new Error('no plain junk-kind item in content');
    expect(tooltipHtml(junkId)).toContain('Junk');
  });
});
