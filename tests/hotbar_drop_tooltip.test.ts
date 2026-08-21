// Regression for a reported bug (#1485): dragging a hotbar ability onto another
// slot left the tooltip stale. A drop that ends with the cursor already inside the
// target slot fires no mouseenter, so the tooltip kept its pre-drop text (the
// "empty slot" hint, or the previous ability's name after a swap). Every sibling
// slot mutation (clearSlot, the context-menu clear, char/bags window drops) already
// calls hideTooltip() on mutate; the two hotbar drop-completion paths did not.
// Guard that every live slot mutation clears the tooltip after the rearrange.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync(new URL('../src/ui/hud.ts', import.meta.url), 'utf8');
// Strip comments so the explanatory comment near the fix cannot satisfy the scan.
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('hotbar drag-drop clears the stale tooltip (#1485)', () => {
  it('desktop drop calls hideTooltip after saving the rearranged slot map', () => {
    // The action-bar desktop drop handler is the block that places an item onto a
    // hotbar slot; isolate it up to the following dragend handler.
    const start = code.indexOf('placeItemOnSlot(this.hotbarActions');
    expect(start).toBeGreaterThan(-1);
    const handler = code.slice(start, code.indexOf("addEventListener('dragend'", start));
    const saveIdx = handler.indexOf('this.saveSlotMap();');
    const hideIdx = handler.indexOf('this.hideTooltip();');
    expect(saveIdx).toBeGreaterThan(-1);
    expect(hideIdx).toBeGreaterThan(saveIdx);
  });

  // The touch arm of #1485 moved with the gesture that caused it. The mobile
  // long-press rearrange is retired (it reached only the four visible ring
  // centres and armed underneath the radial); the bar editor is the touch
  // binding path now, and BOTH of its mutations owe the same stale-tooltip
  // clear, so this pins the pair rather than the one finish handler.
  it('the bar editor swap clears the stale tooltip after saving', () => {
    const start = code.indexOf('swapSlots: (slotA, slotB) => {');
    expect(start).toBeGreaterThan(-1);
    const handler = code.slice(start, code.indexOf('},', start));
    const saveIdx = handler.indexOf('this.saveSlotMap();');
    const hideIdx = handler.indexOf('this.hideTooltip();');
    expect(saveIdx).toBeGreaterThan(-1);
    expect(hideIdx).toBeGreaterThan(saveIdx);
  });

  it('the bar editor place clears the stale tooltip after saving', () => {
    const start = code.indexOf('placeAbility: (abilityId, slot) => {');
    expect(start).toBeGreaterThan(-1);
    const handler = code.slice(start, code.indexOf('},', start));
    const saveIdx = handler.indexOf('this.saveSlotMap();');
    const hideIdx = handler.indexOf('this.hideTooltip();');
    expect(saveIdx).toBeGreaterThan(-1);
    expect(hideIdx).toBeGreaterThan(saveIdx);
  });

  it('leaves no long-press rearrange path behind to reintroduce the bug', () => {
    expect(code).not.toContain('mobileHotbarDrag');
    expect(code).not.toContain('resolveMobileHotbarDrop');
  });
});
