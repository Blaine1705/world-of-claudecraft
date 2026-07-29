// The shared unknown-item icon fallback (src/ui/unknown_item_icon.ts): the one
// <img> every server-truth surface renders for an id this bundle cannot
// resolve (stale-client guard, R34). iconDataUrl is canvas-backed at runtime,
// so it is mocked here; its own unknown-id tolerance (the UNKNOWN_RECIPE fall
// through) is icons.ts behavior, not this module's.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/ui/icons', () => ({
  iconDataUrl: (kind: string, id: string) => `stub:${kind}:${id}`,
}));

const { unknownItemIconHtml } = await import('../src/ui/unknown_item_icon');

describe('unknownItemIconHtml', () => {
  it('renders the item-icon img at common quality by default', () => {
    expect(unknownItemIconHtml('future_item_id')).toBe(
      '<img class="item-icon q-common" src="stub:item:future_item_id" alt="" draggable="false">',
    );
  });

  it('carries a caller-supplied quality class (the loot-roll wire quality)', () => {
    // A loot-roll event names its quality server-side, so a stale bundle can
    // color the fallback correctly, even for a rung it has never heard of
    // (an unranked class simply takes the default styling).
    expect(unknownItemIconHtml('future_item_id', 'epic')).toContain('class="item-icon q-epic"');
    expect(unknownItemIconHtml('future_item_id', 'mythic')).toContain('class="item-icon q-mythic"');
  });

  it('asks the icon pipeline for the ITEM kind under the raw id', () => {
    // The procedural pipeline resolves any unknown item id to its fallback
    // recipe, keyed by the id so distinct unknowns stay distinct.
    expect(unknownItemIconHtml('a')).toContain('src="stub:item:a"');
    expect(unknownItemIconHtml('b')).toContain('src="stub:item:b"');
  });
});
