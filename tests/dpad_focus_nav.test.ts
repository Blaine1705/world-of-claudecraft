import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPadFocus, moveDpadFocus, pressDpadFocus } from '../src/game/dpad_focus_nav';

// A fake DOM modelling only what dpad_focus_nav touches: the two selector shapes
// it queries, visibility, boxes, focus and click. The shared tests/helpers/fake_dom
// has no querySelectorAll, and jsdom is not a dependency, so this follows the
// repo's hand-rolled-fake rule (tests/CLAUDE.md, "DOM in tests").
interface FakeEl {
  tag: string;
  role?: string;
  cls: string[];
  rect: { left: number; top: number; right: number; bottom: number };
  visible: boolean;
  disabled: boolean;
  clicks: number;
  classes: Set<string>;
  classList: { add(c: string): void; remove(c: string): void };
  focus(): void;
  click(): void;
  getBoundingClientRect(): {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };
  hasAttribute(name: string): boolean;
}

let active: FakeEl | null = null;
let allEls: FakeEl[] = [];

function el(
  tag: string,
  x: number,
  y: number,
  opts: { role?: string; cls?: string[]; visible?: boolean; disabled?: boolean } = {},
): FakeEl {
  const node: FakeEl = {
    tag,
    role: opts.role,
    cls: opts.cls ?? [],
    rect: { left: x, top: y, right: x + 40, bottom: y + 20 },
    visible: opts.visible ?? true,
    disabled: opts.disabled ?? false,
    clicks: 0,
    classes: new Set<string>(),
    get classList() {
      return {
        add: (c: string) => {
          node.classes.add(c);
        },
        remove: (c: string) => {
          node.classes.delete(c);
        },
      };
    },
    focus() {
      active = node;
    },
    click() {
      node.clicks++;
    },
    getBoundingClientRect: () => ({
      ...node.rect,
      width: node.rect.right - node.rect.left,
      height: node.rect.bottom - node.rect.top,
    }),
    hasAttribute: (name: string) => name === 'disabled' && node.disabled,
  };
  return node;
}

// Only the two selectors the module actually passes.
function matches(node: FakeEl, selector: string): boolean {
  if (selector.includes('role="dialog"')) {
    return node.role === 'dialog' || (node.cls.includes('window') && node.cls.includes('panel'));
  }
  // FOCUSABLE_SELECTOR: button/input/select/textarea/[href]/[tabindex], not disabled
  return ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A'].includes(node.tag) && !node.disabled;
}

/** Children of a container, by the box containment the fake models. */
function within(container: FakeEl | null, node: FakeEl): boolean {
  if (!container) return true;
  return (
    node !== container &&
    node.rect.left >= container.rect.left &&
    node.rect.right <= container.rect.right &&
    node.rect.top >= container.rect.top &&
    node.rect.bottom <= container.rect.bottom
  );
}

function install(): void {
  const queryAll = (root: FakeEl | null, selector: string): FakeEl[] =>
    allEls.filter((n) => matches(n, selector) && within(root, n));
  const docLike = {
    querySelectorAll: (selector: string) => queryAll(null, selector),
    get activeElement() {
      return active;
    },
    body: { tagName: 'BODY' },
  };
  vi.stubGlobal('document', docLike);
  vi.stubGlobal('getComputedStyle', (n: FakeEl) => ({
    visibility: n.visible ? 'visible' : 'hidden',
    display: n.visible ? 'block' : 'none',
  }));
  // Scoped query: a container's own querySelectorAll.
  for (const node of allEls) {
    (node as unknown as { querySelectorAll: (s: string) => FakeEl[] }).querySelectorAll = (s) =>
      queryAll(node, s);
  }
}

beforeEach(() => {
  active = null;
  allEls = [];
});
afterEach(() => vi.unstubAllGlobals());

describe('moveDpadFocus', () => {
  it('focuses the next control AND answers its centre for the cursor snap', () => {
    // The snap is the whole fix: focus alone is invisible on a pad, so a move
    // that reports no point leaves the cursor parked and looks like a no-op.
    const a = el('BUTTON', 0, 0);
    const b = el('BUTTON', 0, 50);
    allEls = [a, b];
    install();
    a.focus();

    const moved = moveDpadFocus('down');
    expect(active).toBe(b);
    expect(moved).toEqual({ x: 20, y: 60 });
  });

  it('marks the focused control so a pad player can SEE it', () => {
    // Programmatic focus() does not satisfy the browser's :focus-visible
    // heuristic, so without an explicit class there is no ring at all and the
    // navigation reads as broken.
    const a = el('BUTTON', 0, 0);
    const b = el('BUTTON', 0, 50);
    allEls = [a, b];
    install();
    a.focus();
    moveDpadFocus('down');
    expect(b.classes.has('pad-focus')).toBe(true);
    // and the mark follows focus rather than accumulating
    moveDpadFocus('up');
    expect(b.classes.has('pad-focus')).toBe(false);
    expect(a.classes.has('pad-focus')).toBe(true);
  });

  it('drops the mark when navigation ends', () => {
    const a = el('BUTTON', 0, 0);
    const b = el('BUTTON', 0, 50);
    allEls = [a, b];
    install();
    a.focus();
    moveDpadFocus('down');
    clearPadFocus();
    expect(b.classes.has('pad-focus')).toBe(false);
  });

  it('answers null when nothing lies that way, so the caller nudges the cursor', () => {
    const a = el('BUTTON', 0, 0);
    allEls = [a];
    install();
    a.focus();
    expect(moveDpadFocus('down')).toBeNull();
  });

  it('answers null on a surface with no focusable controls at all', () => {
    allEls = [el('DIV', 0, 0)];
    install();
    expect(moveDpadFocus('up')).toBeNull();
  });

  it('lands on the first control when nothing is focused yet', () => {
    const a = el('BUTTON', 0, 0);
    const b = el('BUTTON', 0, 50);
    allEls = [a, b];
    install();
    expect(moveDpadFocus('down')).not.toBeNull();
    expect(active).toBe(a);
  });

  it('stays inside the open window rather than wandering into the side rail', () => {
    // The rail sits outside the dialog's box; navigation must not reach it.
    const dialog = el('DIV', 0, 0, { role: 'dialog' });
    dialog.rect = { left: 0, top: 0, right: 300, bottom: 300 };
    const inside1 = el('BUTTON', 10, 10);
    const inside2 = el('BUTTON', 10, 60);
    const railButton = el('BUTTON', 900, 60);
    allEls = [dialog, inside1, inside2, railButton];
    install();
    inside1.focus();

    moveDpadFocus('down');
    expect(active).toBe(inside2);
    // and nothing can reach the rail, in any direction
    for (const dir of ['up', 'down', 'left', 'right'] as const) moveDpadFocus(dir);
    expect(active).not.toBe(railButton);
  });

  it('skips a hidden or disabled control', () => {
    const a = el('BUTTON', 0, 0);
    const hidden = el('BUTTON', 0, 40, { visible: false });
    const disabled = el('BUTTON', 0, 80, { disabled: true });
    const reachable = el('BUTTON', 0, 120);
    allEls = [a, hidden, disabled, reachable];
    install();
    a.focus();
    moveDpadFocus('down');
    expect(active).toBe(reachable);
  });
});

describe('pressDpadFocus', () => {
  it('clicks whatever the d-pad focused', () => {
    const a = el('BUTTON', 0, 0);
    allEls = [a];
    install();
    a.focus();
    expect(pressDpadFocus()).toBe(true);
    expect(a.clicks).toBe(1);
  });

  it('refuses when nothing is focused, so A falls back to the cursor', () => {
    allEls = [el('BUTTON', 0, 0)];
    install();
    expect(pressDpadFocus()).toBe(false);
  });

  it('refuses to click an element the navigation could not have reached', () => {
    // A chat input holding focus must not be "pressed" by the A button.
    const dialog = el('DIV', 0, 0, { role: 'dialog' });
    dialog.rect = { left: 0, top: 0, right: 300, bottom: 300 };
    const inside = el('BUTTON', 10, 10);
    const outside = el('INPUT', 900, 900);
    allEls = [dialog, inside, outside];
    install();
    outside.focus();
    expect(pressDpadFocus()).toBe(false);
    expect(outside.clicks).toBe(0);
  });
});
