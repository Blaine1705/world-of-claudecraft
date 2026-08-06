// Battle-elixir tooltip line: the pure string-builder composed inside
// Hud.itemTooltip. English copy asserted directly (the
// gather_tool_tooltip.test.ts idiom); the numbers must mirror each def's own
// elixir record, never re-invented copy. Also guards the data side: an item
// of kind 'elixir' without an elixir record would quaff as a silent no-op
// (sim/items.ts useItem returns early) AND render no use line, which is
// exactly the invisible-tooltip bug this module fixed.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ITEMS } from '../src/sim/data';
import type { ItemDef } from '../src/sim/types';
import { elixirTooltipLines } from '../src/ui/elixir_tooltip_view';

describe('elixirTooltipLines', () => {
  it('elixir of the boar states its stamina buff, duration, and combat use', () => {
    expect(elixirTooltipLines(ITEMS.elixir_of_the_boar)).toBe(
      '<div class="tt-desc">Use: Increases your Stamina by 6 for 10 min. Usable in combat.</div>',
    );
  });

  it('every elixir in the game data renders a use line carrying its own numbers', () => {
    const elixirs = Object.values(ITEMS).filter((def) => def.kind === 'elixir');
    // bear (vendor), boar, venomfire, serpent (crafted alchemy ladder)
    expect(elixirs.length).toBeGreaterThanOrEqual(4);
    for (const def of elixirs) {
      expect(def.elixir, `${def.id} must carry an elixir effect record`).toBeDefined();
      const html = elixirTooltipLines(def);
      expect(html, `${def.id} must render a use line`).toContain('Use:');
      expect(html).toContain(`by ${def.elixir!.value} `);
      expect(html).toContain(`for ${def.elixir!.duration / 60} min`);
    }
  });

  it('renders nothing for items without an elixir record', () => {
    expect(elixirTooltipLines(ITEMS.healing_potion)).toBe('');
    expect(elixirTooltipLines(ITEMS.roasted_boar)).toBe('');
  });

  it('an unmapped buff kind falls back to naming the granted aura, localized', () => {
    const def: ItemDef = {
      ...ITEMS.elixir_of_the_boar,
      elixir: { aura: 'Might of the Boar', kind: 'buff_spellpower', value: 5, duration: 300 },
    };
    expect(elixirTooltipLines(def)).toBe(
      '<div class="tt-desc">Use: Grants Might of the Boar for 5 min. Usable in combat.</div>',
    );
  });

  it('Hud.itemTooltip composes the elixir line (source pin, comments stripped)', () => {
    const hudSource = readFileSync(
      path.join(__dirname, '..', 'src', 'ui', 'hud.ts'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/[^\n]*/gm, (m, pre) =>
      m.startsWith('/*') ? '' : (pre ?? ''),
    );
    expect(hudSource).toContain('html += elixirTooltipLines(item);');
  });
});
