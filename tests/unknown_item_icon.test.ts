// The shared unknown-item icon fallback (src/ui/unknown_item_icon.ts): the one
// <img> every server-truth surface renders for an id this bundle cannot
// resolve (stale-client guard, R34). iconDataUrl is canvas-backed at runtime,
// so it is mocked here; its own unknown-id tolerance (the UNKNOWN_RECIPE fall
// through) is icons.ts behavior, not this module's.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/ui/icons', () => ({
  iconDataUrl: (kind: string, id: string) => {
    if (id === 'canvasless_id') throw new Error('2D canvas context is unavailable');
    return `stub:${kind}:${id}`;
  },
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

  it('escapes a hostile quality string out of the class attribute', () => {
    // Defense in depth per the unconditional esc() rule: today's wire quality
    // is a sim union member, but the parameter is deliberately a plain string
    // and this helper is where a wider future caller would land.
    const html = unknownItemIconHtml('future_item_id', 'x" onerror="alert(1)');
    expect(html).not.toContain('" onerror');
    expect(html).toContain('&quot;');
  });

  it('keeps the never-a-throw contract on a canvas-less host (blank pixel src)', () => {
    // The procedural fallback icon is canvas-composited, so a host with no
    // working 2d context would throw INSIDE the fallback that exists to
    // prevent throws; the helper swallows it and ships a transparent pixel
    // (the quality frame and count badge still render).
    let html = '';
    expect(() => {
      html = unknownItemIconHtml('canvasless_id');
    }).not.toThrow();
    expect(html).toContain('src="data:image/gif;base64,');
    expect(html).toContain('class="item-icon q-common"');
  });

  it('asks the icon pipeline for the ITEM kind under the raw id', () => {
    // The procedural pipeline resolves any unknown item id to its fallback
    // recipe, keyed by the id so distinct unknowns stay distinct.
    expect(unknownItemIconHtml('a')).toContain('src="stub:item:a"');
    expect(unknownItemIconHtml('b')).toContain('src="stub:item:b"');
  });
});
