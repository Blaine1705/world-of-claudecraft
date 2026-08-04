// Profession affinity: every honest material maps to the crafts that consume
// it, fine grades inherit base consumers, and presentation order follows the
// craft ring. A pure sim leaf; no DOM.

import { describe, expect, it } from 'vitest';
import { CRAFT_RING } from '../src/sim/content/professions';
import { ALL_RECIPES } from '../src/sim/data';
import { craftIdsForMaterialItem } from '../src/sim/material_profession_affinity';
import { MATERIAL_ITEM_IDS } from '../src/sim/material_taxonomy';
import { baseMaterialFor, MATERIAL_GRADES } from '../src/sim/professions/material_grades';

describe('craftIdsForMaterialItem', () => {
  it('names the crafts that consume Rough Hide (the player-facing exemplar)', () => {
    // Leatherworking is the home craft; armorcrafting and weaponcrafting also
    // list hide on shipped recipes. Order is CRAFT_RING, not first-seen.
    // CRAFT_RING order: leatherworking sits before weaponcrafting/armorcrafting.
    expect(craftIdsForMaterialItem('rough_hide')).toEqual([
      'leatherworking',
      'weaponcrafting',
      'armorcrafting',
    ]);
  });

  it('maps single-craft reagents to one craft', () => {
    expect(craftIdsForMaterialItem('game_meat')).toEqual(['cooking']);
    expect(craftIdsForMaterialItem('venom_gland')).toEqual(['alchemy']);
    expect(craftIdsForMaterialItem('arcane_dust')).toEqual(['enchanting']);
  });

  it('a fine grade inherits its base consumers and keeps fine-only crafts', () => {
    // fine_iron_ore is a tool-recipe reagent (engineering) and stands in for
    // iron_ore (weaponcrafting + armorcrafting).
    const fine = craftIdsForMaterialItem('fine_iron_ore');
    const base = craftIdsForMaterialItem('iron_ore');
    expect(base).toEqual(['weaponcrafting', 'armorcrafting']);
    expect(fine).toEqual(['engineering', 'weaponcrafting', 'armorcrafting']);
    for (const craftId of base) {
      expect(fine, `fine inherits ${craftId}`).toContain(craftId);
    }
  });

  it('every fine grade resolves through baseMaterialFor without inventing crafts', () => {
    for (const [baseItemId, row] of Object.entries(MATERIAL_GRADES)) {
      expect(baseMaterialFor(row.fineItemId)).toBe(baseItemId);
      const fineCrafts = craftIdsForMaterialItem(row.fineItemId);
      const baseCrafts = craftIdsForMaterialItem(baseItemId);
      for (const craftId of baseCrafts) {
        expect(fineCrafts, `${row.fineItemId} inherits ${craftId}`).toContain(craftId);
      }
    }
  });

  it('orders multi-craft lines by CRAFT_RING, never first-seen recipe order', () => {
    const ring = CRAFT_RING.map((c) => c.id);
    for (const itemId of MATERIAL_ITEM_IDS) {
      const crafts = craftIdsForMaterialItem(itemId);
      const positions = crafts.map((id) => ring.indexOf(id));
      expect(
        positions.every((p) => p >= 0),
        `${itemId} only names ring crafts`,
      ).toBe(true);
      for (let i = 1; i < positions.length; i++) {
        expect(positions[i], `${itemId} ring order`).toBeGreaterThan(positions[i - 1]);
      }
    }
  });

  it('every honest material has at least one craft consumer (no orphan reagents)', () => {
    // The material taxonomy only admits junk-kind members of the source-or-
    // reagent union; if a material has zero craft consumers the Used-by line
    // cannot fire and the bag stack is unexplained. Pin completeness here.
    for (const itemId of MATERIAL_ITEM_IDS) {
      expect(
        craftIdsForMaterialItem(itemId).length,
        `${itemId} must have a craft consumer`,
      ).toBeGreaterThan(0);
    }
  });

  it('every recipe professionId is a craft the affinity can name', () => {
    const ring = new Set(CRAFT_RING.map((c) => c.id));
    for (const recipe of ALL_RECIPES) {
      expect(ring.has(recipe.professionId), recipe.professionId).toBe(true);
    }
  });

  it('non-materials and unknown ids return empty', () => {
    expect(craftIdsForMaterialItem('rusty_sword')).toEqual([]);
    expect(craftIdsForMaterialItem('not_a_real_item')).toEqual([]);
    expect(craftIdsForMaterialItem('simple_fishing_pole')).toEqual([]);
  });
});
