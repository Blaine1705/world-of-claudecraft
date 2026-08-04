// @vitest-environment happy-dom
//
// Profession-affinity tooltip line: honest materials name their crafts, Junk
// stays for true grey trash, superseding purpose hints avoid double lines, and
// the Hud.prototype.itemTooltip integration arm stays honest.

import { describe, expect, it } from 'vitest';
import { RAW_COOKING_CATCH_IDS } from '../src/sim/content/items';
import { ITEMS } from '../src/sim/data';
import { craftIdsForMaterialItem } from '../src/sim/material_profession_affinity';
import { MATERIAL_ITEM_IDS } from '../src/sim/material_taxonomy';
import { baseMaterialFor } from '../src/sim/professions/material_grades';
import { Hud } from '../src/ui/hud';
import { itemKindLabel } from '../src/ui/item_kind_label';
import {
  materialProfessionHintLine,
  materialProfessionHintText,
} from '../src/ui/material_profession_hint_view';

function tooltipHtml(itemId: string): string {
  const h = Object.create(Hud.prototype) as unknown as {
    itemTooltip(item: unknown, compare?: boolean): string;
  };
  const item = ITEMS[itemId];
  if (!item) throw new Error(`missing item ${itemId}`);
  return h.itemTooltip(item, false);
}

describe('materialProfessionHintText', () => {
  it('Rough Hide reads Used by its crafts, never Junk on the kind line', () => {
    expect(itemKindLabel('junk', 'rough_hide')).toBe('Material');
    const text = materialProfessionHintText('rough_hide');
    expect(text).toMatch(/^Used by /);
    expect(text).toContain('Leatherworking');
    expect(text).toContain('Armorcrafting');
    expect(text).toContain('Weaponcrafting');
    expect(text).toMatch(/\.$/);
    // Conjunction list for three names (en: "A, B, and C").
    expect(text).toContain('and');
  });

  it('single-craft materials use a simple Used by line', () => {
    expect(materialProfessionHintText('game_meat')).toBe('Used by Cooking.');
    expect(materialProfessionHintText('venom_gland')).toBe('Used by Alchemy.');
  });

  it('skips pure cooking catches when the cooking purpose line already covers them', () => {
    // Sole-cooking catches share cookingCatchHint; the Used-by line would only
    // repeat "Cooking". Multi-craft catches still get Used-by.
    for (const id of RAW_COOKING_CATCH_IDS) {
      const crafts = craftIdsForMaterialItem(id);
      if (crafts.length === 1 && crafts[0] === 'cooking') {
        expect(materialProfessionHintText(id), id).toBe('');
      } else {
        expect(materialProfessionHintText(id), id).toMatch(/^Used by /);
      }
    }
  });

  it('skips enchanting-only materials that already say Enchanting reagent', () => {
    expect(materialProfessionHintText('arcane_dust')).toBe('');
    expect(materialProfessionHintText('resonant_hide')).toBe('');
  });

  it('fine grades still name their crafts beside the Fine grade purpose line', () => {
    const text = materialProfessionHintText('fine_iron_ore');
    expect(text).toMatch(/^Used by /);
    expect(text).toContain('Engineering');
    expect(text).toContain('Weaponcrafting');
    expect(text).toContain('Armorcrafting');
  });

  it('plain grey junk and non-materials get no line', () => {
    const junkId = Object.keys(ITEMS).find(
      (id) =>
        ITEMS[id].kind === 'junk' &&
        baseMaterialFor(id) === undefined &&
        !MATERIAL_ITEM_IDS.has(id),
    );
    if (!junkId) throw new Error('no plain junk-kind item in content');
    expect(materialProfessionHintText(junkId)).toBe('');
    expect(materialProfessionHintText('eastbrook_arming_sword')).toBe('');
  });

  it('renders as a muted tt-desc line with the material-use class', () => {
    const line = materialProfessionHintLine('rough_hide');
    expect(line).toContain('class="tt-desc tt-material-use"');
    expect(line).toContain('Used by');
    expect(line).toContain('Leatherworking');
    expect(materialProfessionHintLine('arcane_dust')).toBe('');
  });
});

describe('itemTooltip integration for profession material tags', () => {
  it('Rough Hide tooltip is Common Material with Used by, never Junk', () => {
    const html = tooltipHtml('rough_hide');
    expect(html).toContain('Material');
    expect(html).not.toMatch(/\bJunk\b/);
    expect(html).toContain('Used by');
    expect(html).toContain('Leatherworking');
    expect(html).toContain('tt-material-use');
  });

  it('game meat tooltip names Cooking', () => {
    const html = tooltipHtml('game_meat');
    expect(html).toContain('Material');
    expect(html).toContain('Used by Cooking.');
    expect(html).not.toMatch(/\bJunk\b/);
  });

  it('a sole cooking catch keeps the cooking purpose line without a second Used by Cooking', () => {
    const html = tooltipHtml('raw_river_perch');
    expect(html).toContain('Cooking ingredient');
    expect(html).not.toContain('Used by Cooking.');
  });

  it('an enchanting material keeps its source line without Used by Enchanting', () => {
    const html = tooltipHtml('arcane_dust');
    expect(html).toContain('Enchanting reagent');
    expect(html).not.toContain('Used by Enchanting');
  });

  it('true grey junk still says Junk', () => {
    const junkId = Object.keys(ITEMS).find(
      (id) =>
        ITEMS[id].kind === 'junk' &&
        baseMaterialFor(id) === undefined &&
        !MATERIAL_ITEM_IDS.has(id),
    );
    if (!junkId) throw new Error('no plain junk-kind item in content');
    expect(tooltipHtml(junkId)).toContain('Junk');
    expect(tooltipHtml(junkId)).not.toContain('Used by');
  });
});
