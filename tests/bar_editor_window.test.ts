// @vitest-environment jsdom

// The touch bar editor window: the DOM half of the overlay that replaced the
// mobile long-press rearrange. Drives the real window against a fake bar and
// asserts what a player actually gets: 20 cells and the page tabs, a tap that
// places an armed spell, a tap pair that swaps, a second tap on the picked cell
// that cancels, a page switch that keeps a pending pick, and a locked bar that
// is read-only. Plus the cold-window contracts a source scan owns.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isInteractiveHudElement } from '../src/game/touch_router';
import { ACTION_BAR_ABILITY_SLOTS } from '../src/ui/hud/action_bar/action_bar_layout_core';
import { BarEditorWindow } from '../src/ui/hud/action_bar/bar_editor/bar_editor_window';
import type { HotbarAction } from '../src/ui/hud/action_bar/hotbar';

// jsdom ships no 2D canvas, so the procedural icon compositor cannot run here;
// the window only ever uses the returned string as a CSS background-image.
vi.mock('../src/ui/icons', () => ({ iconDataUrl: () => 'data:,' }));

// A jsdom `import.meta.url` is not a file: URL, so the source scans below read
// through the vitest root instead.
const SOURCE = readFileSync(
  join(process.cwd(), 'src/ui/hud/action_bar/bar_editor/bar_editor_window.ts'),
  'utf8',
);

interface Harness {
  window: BarEditorWindow;
  root: HTMLElement;
  bar: HotbarAction[];
  placed: Array<{ abilityId: string; slot: number }>;
  swapped: Array<{ a: number; b: number }>;
  cleared: number[];
  locked: { value: boolean };
  cells(): HTMLButtonElement[];
  tabs(): HTMLButtonElement[];
  clearBtn(): HTMLButtonElement;
}

function harness(): Harness {
  document.body.innerHTML = '<div id="bar-editor" class="window panel"></div>';
  const root = document.getElementById('bar-editor') as HTMLElement;
  const bar: HotbarAction[] = Array.from({ length: ACTION_BAR_ABILITY_SLOTS }, () => null);
  // Two real warrior abilities so name resolution and the icon branch are live.
  bar[0] = { type: 'ability', id: 'heroic_strike' };
  bar[1] = { type: 'ability', id: 'battle_shout' };
  const placed: Array<{ abilityId: string; slot: number }> = [];
  const swapped: Array<{ a: number; b: number }> = [];
  const cleared: number[] = [];
  const locked = { value: false };
  const window = new BarEditorWindow({
    root: () => root,
    closeOthers: () => {},
    captureFocus: () => null,
    restoreFocus: () => {},
    onVisibilityChange: () => {},
    hideTooltip: () => {},
    barActions: () => bar,
    sourceSlotCount: () => ACTION_BAR_ABILITY_SLOTS,
    editAllowed: () => !locked.value,
    placeAbility: (abilityId, slot) => {
      placed.push({ abilityId, slot });
      bar[slot - 1] = { type: 'ability', id: abilityId };
    },
    swapSlots: (a, b) => {
      swapped.push({ a, b });
      [bar[a - 1], bar[b - 1]] = [bar[b - 1], bar[a - 1]];
    },
    clearSlot: (slot) => {
      cleared.push(slot);
      bar[slot - 1] = null;
    },
  });
  return {
    window,
    root,
    bar,
    placed,
    swapped,
    cleared,
    locked,
    cells: () => [...root.querySelectorAll<HTMLButtonElement>('.bar-editor-cell')],
    tabs: () => [...root.querySelectorAll<HTMLButtonElement>('.bar-editor-tab')],
    clearBtn: () => root.querySelector<HTMLButtonElement>('.bar-editor-clear') as HTMLButtonElement,
  };
}

let h: Harness;
beforeEach(() => {
  h = harness();
});

describe('bar editor window: what a player sees', () => {
  it('opens with 20 cells and one tab per ring page', () => {
    h.window.open();
    expect(h.window.isOpen).toBe(true);
    expect(h.cells()).toHaveLength(20);
    expect(h.tabs()).toHaveLength(2);
    expect(h.tabs()[0].getAttribute('aria-selected')).toBe('true');
    expect(h.tabs()[1].getAttribute('aria-selected')).toBe('false');
  });

  it('marks the window as a dialog root with exactly one accessible name', () => {
    h.window.open();
    expect(h.root.getAttribute('role')).toBe('dialog');
    // aria-modal false, matching every sibling window: these roots trap focus but
    // do not inert the page (see markDialogRoot).
    expect(h.root.getAttribute('aria-modal')).toBe('false');
    expect(h.root.getAttribute('aria-label')).toBeTruthy();
    // aria-labelledby SHADOWS aria-label, so exactly one may be present.
    expect(h.root.hasAttribute('aria-labelledby')).toBe(false);
  });

  it('renders every cell as a real focusable button, never a div', () => {
    h.window.open();
    for (const cell of h.cells()) {
      expect(cell.tagName).toBe('BUTTON');
      expect(cell.type).toBe('button');
    }
  });

  it('names each cell by its button and direction, and shows what it holds', () => {
    h.window.open();
    const first = h.cells()[0];
    expect(first.getAttribute('aria-label')).toContain('Button');
    expect(first.getAttribute('aria-label')).toContain('Centre');
    expect(first.querySelector('.bar-editor-cell-name')?.textContent).toBeTruthy();
    // Row 2 is the 'Up' direction (direction-major), so its aria says so.
    expect(h.cells()[4].getAttribute('aria-label')).toContain('Up');
  });

  it('disables the last page tail rather than dropping the grid geometry', () => {
    h.window.open();
    h.tabs()[1].click();
    const cells = h.cells();
    expect(cells).toHaveLength(20);
    const dead = cells.filter((c) => c.classList.contains('out-of-range'));
    expect(dead.length).toBeGreaterThan(0);
    for (const cell of dead) expect(cell.disabled).toBe(true);
  });

  it('is covered by the touch router, so a tap never leaks to a camera drag', () => {
    h.window.open();
    // The overlay is `.window panel`, which INTERACTIVE_HUD_SELECTORS already
    // names; assert through the real router rather than trusting the class list.
    expect(
      isInteractiveHudElement(
        h.cells()[0] as unknown as Parameters<typeof isInteractiveHudElement>[0],
      ),
    ).toBe(true);
    expect(
      isInteractiveHudElement(h.root as unknown as Parameters<typeof isInteractiveHudElement>[0]),
    ).toBe(true);
  });
});

describe('bar editor window: tap to place', () => {
  it('places an armed spell in the tapped cell and disarms', () => {
    h.window.open('charge');
    // Cell index 6 is the second row ('Up'), third button: page 0, up, button 2,
    // which is bar slot 7 under the direction-major mapping.
    h.cells()[6].click();
    expect(h.placed).toEqual([{ abilityId: 'charge', slot: 7 }]);
    // Disarmed: the next tap picks up rather than placing again.
    h.cells()[0].click();
    expect(h.placed).toHaveLength(1);
    expect(h.cells()[0].getAttribute('aria-pressed')).toBe('true');
  });

  it('repaints the tapped cell from the mutated bar without reopening', () => {
    h.window.open('charge');
    const target = h.cells()[6];
    expect(target.classList.contains('empty')).toBe(true);
    target.click();
    expect(target.classList.contains('empty')).toBe(false);
    expect(target.querySelector('.bar-editor-cell-name')?.textContent).toBeTruthy();
  });

  it('ignores a tap on an out-of-range cell and KEEPS the spell armed', () => {
    h.window.open('charge');
    h.tabs()[1].click();
    const dead = h.cells().find((c) => c.classList.contains('out-of-range')) as HTMLButtonElement;
    dead.disabled = false; // defeat the DOM guard so the handler itself is tested
    dead.click();
    expect(h.placed).toEqual([]);
    // Still armed: a live cell on the same page still takes it.
    h.cells()[0].click();
    expect(h.placed).toHaveLength(1);
  });
});

describe('bar editor window: tap to swap', () => {
  it('swaps two cells with two taps', () => {
    h.window.open();
    h.cells()[0].click();
    expect(h.cells()[0].getAttribute('aria-pressed')).toBe('true');
    h.cells()[3].click();
    expect(h.swapped).toEqual([{ a: 1, b: 4 }]);
    expect(h.bar[3]).toEqual({ type: 'ability', id: 'heroic_strike' });
    expect(h.cells()[0].getAttribute('aria-pressed')).toBe('false');
  });

  it('cancels the pick when the same cell is tapped again', () => {
    h.window.open();
    h.cells()[0].click();
    h.cells()[0].click();
    expect(h.swapped).toEqual([]);
    expect(h.cells()[0].getAttribute('aria-pressed')).toBe('false');
  });

  it('does nothing when an empty cell is tapped with nothing armed', () => {
    h.window.open();
    h.cells()[5].click();
    expect(h.swapped).toEqual([]);
    for (const cell of h.cells()) expect(cell.getAttribute('aria-pressed')).toBe('false');
  });

  it('carries a pending pick ACROSS a page switch and swaps between pages', () => {
    h.window.open();
    h.cells()[0].click();
    h.tabs()[1].click();
    expect(h.tabs()[1].getAttribute('aria-selected')).toBe('true');
    h.cells()[0].click();
    expect(h.swapped).toEqual([{ a: 1, b: 21 }]);
  });
});

describe('bar editor window: the action-bar lock', () => {
  it('renders the grid read-only while the bars are locked', () => {
    h.locked.value = true;
    h.window.open();
    for (const cell of h.cells()) expect(cell.disabled).toBe(true);
    h.cells()[0].click();
    expect(h.swapped).toEqual([]);
    expect(h.placed).toEqual([]);
  });
});

describe('bar editor window: the Clear control', () => {
  it('empties the next tapped slot through the shared clear path, then disarms', () => {
    h.window.open();
    expect(h.clearBtn().getAttribute('aria-pressed')).toBe('false');

    h.clearBtn().click();
    expect(h.clearBtn().getAttribute('aria-pressed')).toBe('true');
    // Slot 1 (button 0, centre) holds heroic_strike in the harness bar.
    h.cells()[0].click();
    expect(h.cleared).toEqual([1]);
    expect(h.bar[0]).toBeNull();
    expect(h.swapped).toEqual([]);
    // One tap, one clear: the mode disarms so the next tap is an ordinary pick.
    expect(h.clearBtn().getAttribute('aria-pressed')).toBe('false');
    h.cells()[1].click();
    expect(h.cleared).toEqual([1]);
  });

  it('toggles back off without touching the bar', () => {
    h.window.open();
    h.clearBtn().click();
    h.clearBtn().click();
    expect(h.clearBtn().getAttribute('aria-pressed')).toBe('false');
    h.cells()[0].click();
    expect(h.cleared).toEqual([]);
  });

  it('is disabled while the action bars are locked', () => {
    h.locked.value = true;
    h.window.open();
    expect(h.clearBtn().disabled).toBe(true);
    h.clearBtn().click();
    h.cells()[0].click();
    expect(h.cleared).toEqual([]);
  });

  it('carries an accessible name of its own', () => {
    h.window.open();
    expect(h.clearBtn().getAttribute('aria-label')).toBeTruthy();
  });
});

describe('bar editor window: open / close lifecycle', () => {
  it('returns focus to the opener on close', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    let restored: HTMLElement | null = null;
    const w = new BarEditorWindow({
      root: () => h.root,
      closeOthers: () => {},
      captureFocus: () => opener,
      restoreFocus: (target) => {
        restored = target;
      },
      onVisibilityChange: () => {},
      hideTooltip: () => {},
      barActions: () => h.bar,
      sourceSlotCount: () => ACTION_BAR_ABILITY_SLOTS,
      editAllowed: () => true,
      placeAbility: () => {},
      swapSlots: () => {},
      clearSlot: () => {},
    });
    w.open();
    w.close();
    expect(restored).toBe(opener);
    expect(w.isOpen).toBe(false);
  });

  it('drops any armed spell on close, so a later open starts idle', () => {
    h.window.open('charge');
    h.window.close();
    h.window.open();
    h.cells()[5].click();
    expect(h.placed).toEqual([]);
  });

  it('toggles closed when already open', () => {
    h.window.open();
    h.window.toggle();
    expect(h.window.isOpen).toBe(false);
  });

  it('relocalize is a no-op while closed, and rebuilds while open', () => {
    h.window.relocalize();
    expect(h.cells()).toHaveLength(0);
    h.window.open();
    h.window.relocalize();
    expect(h.cells()).toHaveLength(20);
  });
});

describe('bar editor window: the cold-window contracts', () => {
  it('takes no forced-reflow layout read', () => {
    for (const token of [
      'offsetWidth',
      'offsetHeight',
      'getBoundingClientRect',
      'getComputedStyle',
      'clientWidth',
      'clientHeight',
    ]) {
      expect(SOURCE, `${token} forces a reflow`).not.toContain(token);
    }
  });

  it('arms no repeating driver of its own', () => {
    for (const token of ['requestAnimationFrame', 'requestIdleCallback', 'setInterval']) {
      expect(SOURCE, `${token} would put a cold window on a cadence`).not.toContain(token);
    }
  });

  it('holds no literal color or px value (those belong in the stylesheet)', () => {
    const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).not.toMatch(/\b\d+px\b/);
    expect(code).not.toMatch(/\brgba?\(/);
  });

  it('binds by click only: no gesture survives in the touch binding path', () => {
    for (const token of ['pointerdown', 'pointermove', 'pointerup', 'setPointerCapture']) {
      expect(SOURCE, `${token} would reintroduce a gesture`).not.toContain(token);
    }
    expect(SOURCE).toContain("addEventListener('click'");
  });
});
