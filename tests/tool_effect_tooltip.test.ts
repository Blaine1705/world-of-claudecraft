// Tool-effect charm tooltip lines: the pure string-builder composed inside
// Hud.itemTooltip and the Professions window hover cards. English copy asserted
// directly (the gather_tool_tooltip.test.ts idiom); charge numbers must mirror
// TOOL_EFFECTS.startingDurability and RARITY_DURABILITY_BONUS, never re-invented.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOOL_EFFECTS } from '../src/sim/content/professions';
import { ITEMS } from '../src/sim/data';
import { RARITY_DURABILITY_BONUS } from '../src/sim/professions/tools';
import {
  isToolEffectItem,
  toolEffectStandaloneTooltip,
  toolEffectTooltipLines,
} from '../src/ui/tool_effect_tooltip';

describe('toolEffectTooltipLines: live charms', () => {
  it("Gatherer's Cache names the kind, quantity bonus, how to slot, and charges", () => {
    const html = toolEffectTooltipLines(ITEMS.gatherers_cache);
    expect(html).toContain('<div class="tt-sub">Tool charm</div>');
    expect(html).toContain('<div class="tt-green">+1 yield per harvest while charged.</div>');
    expect(html).toContain(
      '<div class="tt-desc">Slot onto a mining, logging, or herbalism tool from the Professions window. Consumed when slotted.</div>',
    );
    expect(html).toContain(
      `<div class="tt-desc">Starts with ${TOOL_EFFECTS.gatherers_cache.startingDurability} charges on a common tool (+${RARITY_DURABILITY_BONUS} per rarity rung).</div>`,
    );
    expect(html).toContain('<div class="tt-sub">Does not slot on fishing rods.</div>');
    expect(html).toContain(
      '<div class="tt-sub">Open Professions to slot this onto a gathering tool.</div>',
    );
  });

  it("Artisan's Eye states the grade bonus instead of the quantity bonus", () => {
    const html = toolEffectTooltipLines(ITEMS.artisans_eye);
    expect(html).toContain('<div class="tt-sub">Tool charm</div>');
    expect(html).toContain(
      '<div class="tt-green">Raises the harvest grade by 1 tool tier while charged.</div>',
    );
    expect(html).not.toContain('+1 yield per harvest');
  });

  it('isToolEffectItem is true only for charm items', () => {
    expect(isToolEffectItem(ITEMS.gatherers_cache)).toBe(true);
    expect(isToolEffectItem(ITEMS.artisans_eye)).toBe(true);
    expect(isToolEffectItem(ITEMS.copper_mining_pick)).toBe(false);
    expect(isToolEffectItem(ITEMS.copper_ore)).toBe(false);
    expect(isToolEffectItem(ITEMS.lesser_healing_potion)).toBe(false);
  });
});

describe('toolEffectTooltipLines: everything else', () => {
  it('non-charm items render nothing', () => {
    expect(toolEffectTooltipLines(ITEMS.copper_ore)).toBe('');
    expect(toolEffectTooltipLines(ITEMS.copper_mining_pick)).toBe('');
    expect(toolEffectTooltipLines(ITEMS.arcane_dust)).toBe('');
  });

  it('Hud.itemTooltip composes the module (one line, never inline logic)', () => {
    const hudSrc = readFileSync(path.join(__dirname, '../src/ui/hud.ts'), 'utf8');
    expect(hudSrc).toContain("from './tool_effect_tooltip'");
    expect(hudSrc).toContain('toolEffectTooltipLines(item)');
  });
});

describe('toolEffectStandaloneTooltip: professions window card', () => {
  it('renders a titled card for a live effect id', () => {
    const html = toolEffectStandaloneTooltip('gatherers_cache');
    // esc() HTML-encodes the apostrophe (Gatherer&#39;s Cache).
    expect(html).toContain('Gatherer&#39;s Cache');
    expect(html).toContain('Tool charm');
    expect(html).toContain('+1 yield per harvest while charged.');
    // Standalone is for the Professions window itself: no "open Professions"
    // cue (the player is already there).
    expect(html).not.toContain('Open Professions to slot this');
  });

  it('renders nothing for an unknown effect id', () => {
    expect(toolEffectStandaloneTooltip('not_a_real_effect')).toBe('');
  });

  it('covers every live TOOL_EFFECTS catalog entry', () => {
    for (const id of Object.keys(TOOL_EFFECTS)) {
      const html = toolEffectStandaloneTooltip(id);
      expect(html.length, id).toBeGreaterThan(0);
      expect(html).toContain('Tool charm');
    }
  });
});
