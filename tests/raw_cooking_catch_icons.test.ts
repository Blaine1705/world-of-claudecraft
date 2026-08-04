// Procedural icon recipes for raw cooking catches: after leaving kind food they
// must still resolve a fish-like recipe, never the generic junk trinket
// fallback. Static WebP art remains the preferred runtime path; this pins the
// compositor recipe unit-testably without a canvas.

import { describe, expect, it } from 'vitest';
import { RAW_COOKING_CATCH_IDS } from '../src/sim/content/items';
import { ITEMS } from '../src/sim/data';
import { itemIconRecipe } from '../src/ui/icons';

const FISH_LIKE = new Set(['fish', 'droplet', 'fang']);

describe('raw cooking catch icon recipes', () => {
  it('every catch is kind junk and still maps to a fish-like primitive', () => {
    expect(RAW_COOKING_CATCH_IDS.size).toBe(7);
    for (const id of RAW_COOKING_CATCH_IDS) {
      expect(ITEMS[id].kind, id).toBe('junk');
      const recipe = itemIconRecipe(id);
      const prims = recipe.prims.map((p) => p.p);
      const fishLike = prims.some((p) => FISH_LIKE.has(p));
      expect(fishLike, `${id} prims=${prims.join(',')}`).toBe(true);
      // Not the unknown / empty fallback.
      expect(prims.length, id).toBeGreaterThan(0);
    }
  });

  it('name-token fish fallthrough does not use junk trinket scroll for catches', () => {
    // raw_river_perch has no hand-authored ITEM_RECIPES row; it must hit the
    // fish fallback, not trinketPrimitive.
    const recipe = itemIconRecipe('raw_river_perch');
    expect(recipe.prims.some((p) => p.p === 'fish')).toBe(true);
    expect(recipe.bg).toBe('drink');
    expect(recipe.pal).toBe('sky');
  });
});
