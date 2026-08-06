// Max-stack tooltip line: the pure string-builder composed inside
// Hud.itemTooltip (the elixir_tooltip_view.test.ts idiom: English copy
// asserted directly). The number must come from the one stacking rule the
// bags actually enforce (sim/bags.ts stackSizeOf), so the potion pins below
// go through real shipped defs, and the unstackable-kind pins prove gear
// never grows a noise line. The line exists for the player who owns ONE
// copy: with no stack badge to learn from, the tooltip is how they find out
// the item stacks at all.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { stackSizeOf } from '../src/sim/bags';
import { ITEMS } from '../src/sim/data';
import type { ItemDef } from '../src/sim/types';
import { stackSizeTooltipLine } from '../src/ui/stack_size_tooltip_view';

describe('stackSizeTooltipLine', () => {
  it('a vendor potion states the default 20-per-slot cap', () => {
    expect(stackSizeTooltipLine(ITEMS.minor_healing_potion)).toBe(
      '<div class="tt-sub">Max stack: 20</div>',
    );
  });

  it('every crafted alchemy consumable (potion, elixir) states the same cap', () => {
    const consumables = Object.values(ITEMS).filter(
      (def) => def.kind === 'potion' || def.kind === 'elixir',
    );
    // Vendor ladder (3 healing + 3 mana) plus the crafted alchemy ladder
    // (6 draughts, 3 elixirs) and the bear combo elixir.
    expect(consumables.length).toBeGreaterThanOrEqual(13);
    for (const def of consumables) {
      expect(stackSizeTooltipLine(def), `${def.id} must state its stack cap`).toBe(
        '<div class="tt-sub">Max stack: 20</div>',
      );
    }
  });

  it('renders nothing for every 1-per-slot kind (weapon, armor, bag, tool)', () => {
    for (const id of ['worn_sword', 'recruit_tunic', 'silkspun_satchel', 'riding_training']) {
      const def = ITEMS[id];
      expect(def, `${id} must exist`).toBeDefined();
      expect(stackSizeOf(def), `${id} must be 1-per-slot`).toBe(1);
      expect(stackSizeTooltipLine(def), `${id} must render no line`).toBe('');
    }
  });

  it('an explicit def stackSize wins over the kind default, formatter grouped', () => {
    const probe: ItemDef = { ...ITEMS.minor_healing_potion, stackSize: 1000 };
    expect(stackSizeTooltipLine(probe)).toBe('<div class="tt-sub">Max stack: 1,000</div>');
  });

  it('an explicit stackSize of 1 on a stackable kind also renders nothing', () => {
    const probe: ItemDef = { ...ITEMS.minor_healing_potion, stackSize: 1 };
    expect(stackSizeTooltipLine(probe)).toBe('');
  });

  it('Hud.itemTooltip composes the max-stack line (method-scoped source pin)', () => {
    // Whole-line // comments are stripped before scanning so the pin is not
    // satisfied by prose (the comment-gameable trap; block comments are left
    // alone: a /* strip would misfire on string and regex literals). Scoped
    // to the itemTooltip method body so the call cannot drift into some
    // other surface and still pass.
    const hudSrc = readFileSync(path.join(__dirname, '../src/ui/hud.ts'), 'utf8').replace(
      /^\s*\/\/.*$/gm,
      '',
    );
    const start = hudSrc.indexOf('private itemTooltip(');
    const end = hudSrc.indexOf('private itemProcBlock(');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(hudSrc.slice(start, end)).toContain('html += stackSizeTooltipLine(item);');
  });
});
