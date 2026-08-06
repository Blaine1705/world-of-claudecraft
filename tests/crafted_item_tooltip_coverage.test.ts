// Every craftable recipe output must state what it does in its item tooltip.
// The report behind the elixir fix asked for exactly this property (the four
// elixirs were the only silent outputs of the 79 craftables when audited);
// this sweep keeps it true. Each source below names one branch of
// Hud.itemTooltip that renders effect or purpose text, or the pure sibling
// builder that branch composes. A new craftable item whose only effect rides
// a NEW def field must extend itemTooltip AND this list in the same change,
// or this test reds instead of the item shipping a tooltip that says nothing,
// which is the bug class this file exists to block.
import { describe, expect, it } from 'vitest';
import { ALL_RECIPES } from '../src/sim/content/recipes';
import { ITEMS } from '../src/sim/data';
import type { ItemDef } from '../src/sim/types';
import { cookingCatchHintKey } from '../src/ui/cooking_catch_hint_view';
import { elixirTooltipLines } from '../src/ui/elixir_tooltip_view';
import { gatherToolTooltipLines } from '../src/ui/gather_tool_tooltip';
import { materialHintLine } from '../src/ui/material_hint_view';
import { materialProfessionHintText } from '../src/ui/material_profession_hint_view';
import { toolEffectTooltipLines } from '../src/ui/tool_effect_tooltip';

const EFFECT_SOURCES: Array<[string, (def: ItemDef) => boolean]> = [
  ['weapon damage', (def) => def.weapon !== undefined],
  ['stat lines', (def) => Object.values(def.stats ?? {}).some((v) => v !== undefined)],
  [
    'combat ratings',
    (def) =>
      (def.hitRating ?? 0) > 0 ||
      (def.critRating ?? 0) > 0 ||
      (def.hasteRating ?? 0) > 0 ||
      Math.min(def.pvpOffenseRating ?? 0, def.pvpDefenseRating ?? 0) > 0,
  ],
  ['food use line', (def) => (def.foodHp ?? 0) > 0],
  ['drink use line', (def) => (def.drinkMana ?? 0) > 0],
  ['potion use line', (def) => (def.potionHp ?? 0) > 0 || (def.potionMana ?? 0) > 0],
  ['elixir use line', (def) => elixirTooltipLines(def) !== ''],
  ['gathering tool lines', (def) => gatherToolTooltipLines(def) !== ''],
  ['tool effect charm lines', (def) => toolEffectTooltipLines(def) !== ''],
  ['enchanting material hint', (def) => materialHintLine(def.id) !== ''],
  ['raw cooking catch hint', (def) => cookingCatchHintKey(def.id) !== undefined],
  ['used-by profession hint', (def) => materialProfessionHintText(def.id) !== ''],
  ['bag slot count', (def) => def.kind === 'bag' && (def.bagSlots ?? 0) > 0],
  ['mount description', (def) => def.kind === 'mount'],
  ['quest story block', (def) => def.kind === 'quest'],
];

describe('crafted item tooltip coverage', () => {
  it('covers the whole recipe catalog (floor, grows with content)', () => {
    expect(ALL_RECIPES.length).toBeGreaterThanOrEqual(79);
  });

  it('every recipe output resolves to an ItemDef and renders effect or purpose text', () => {
    for (const recipe of ALL_RECIPES) {
      const def = ITEMS[recipe.resultItemId];
      expect(def, `${recipe.id}: output ${recipe.resultItemId} has no ItemDef`).toBeDefined();
      const source = EFFECT_SOURCES.find(([, fires]) => fires(def));
      expect(
        source,
        `${recipe.resultItemId} (crafted by ${recipe.id}) renders no effect or purpose ` +
          'text in its tooltip: give the def an effect field itemTooltip reads, or wire ' +
          'the new effect into Hud.itemTooltip and add it to EFFECT_SOURCES here',
      ).toBeDefined();
    }
  });
});
