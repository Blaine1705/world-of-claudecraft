// @vitest-environment happy-dom
// The Key Bindings panel's keyboard-layout row (src/ui/keybind_layout_convert_rows.ts),
// driven through its seam: the expando opens, the target preselects from the
// OS layout, the live count follows the pickers and the movement switch, and
// Convert hands the converted snapshot to the painter's apply.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setInterfaceMode } from '../src/game/mobile_controls';
import {
  buildKeybindLayoutConvertRow,
  type KeybindLayoutConvertDeps,
} from '../src/ui/keybind_layout_convert_rows';
import type { KeybindSetup } from '../src/ui/keybind_transfer_core';
import type { KeyboardLayoutId } from '../src/ui/keyboard_layout_convert_core';

const SETUP: KeybindSetup = {
  forward: ['KeyW', 'ArrowUp'],
  map: ['KeyM', null],
  bags: ['KeyB', null],
  slot1: ['Digit1', null],
};

function rig(detected: KeyboardLayoutId | null) {
  document.body.innerHTML = '<div id="body"></div>';
  const host = document.getElementById('body') as HTMLElement;
  const dropdowns: { el: HTMLElement; onChange?: (v: string) => void }[] = [];
  const applied: { binds: KeybindSetup; note: string }[] = [];
  let resolveDetect: (id: KeyboardLayoutId | null) => void = () => {};
  const deps: KeybindLayoutConvertDeps = {
    keybinds: () => ({ snapshot: () => structuredClone(SETUP) }),
    buildDropdown: (_options, current, onChange) => {
      const el = document.createElement('div');
      el.dataset.value = current;
      el.innerHTML = '<button class="ui-dd-btn"></button>';
      dropdowns.push({ el, onChange });
      return el;
    },
    setDropdownValue: (root, value) => {
      root.dataset.value = value;
    },
    detectLayout: () =>
      new Promise((resolve) => {
        resolveDetect = resolve;
      }),
  };
  buildKeybindLayoutConvertRow(host, deps, (binds, note) => applied.push({ binds, note }));
  const open = host.querySelector<HTMLButtonElement>('.kb-layout .set-toggle')!;
  const pane = host.querySelector<HTMLElement>('.kb-layout-pane')!;
  const status = pane.querySelector<HTMLElement>('[role="status"]')!;
  const apply = pane.querySelector<HTMLButtonElement>('.ui-btn--gold')!;
  const keep = pane.querySelector<HTMLButtonElement>('.ui-btn--plate')!;
  return {
    host,
    open,
    pane,
    status,
    apply,
    keep,
    dropdowns,
    applied,
    detect: async () => {
      resolveDetect(detected);
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

describe('buildKeybindLayoutConvertRow', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    setInterfaceMode('auto');
  });

  it('starts closed and opens on Convert with the target preselected from the OS layout', async () => {
    const r = rig('azerty-fr');
    expect(r.pane.hidden).toBe(true);
    expect(r.open.getAttribute('aria-expanded')).toBe('false');
    r.open.click();
    expect(r.pane.hidden).toBe(false);
    expect(r.open.getAttribute('aria-expanded')).toBe('true');
    // Same layout on both sides until detection lands: nothing to convert.
    expect(r.apply.disabled).toBe(true);
    await r.detect();
    expect(r.dropdowns[1].el.dataset.value).toBe('azerty-fr');
    // Only the map moves (KeyM -> Semicolon); movement is kept, digits stay.
    expect(r.status.textContent).toContain('1');
    expect(r.apply.disabled).toBe(false);
    for (const dd of r.dropdowns) {
      expect(dd.el.querySelector('.ui-dd-btn')?.classList.contains('ui-btn')).toBe(true);
    }
  });

  it('counts the movement keys once they are no longer kept in place, and applies', async () => {
    const r = rig('azerty-fr');
    r.open.click();
    await r.detect();
    expect(r.keep.getAttribute('aria-pressed')).toBe('true');
    r.keep.click();
    expect(r.keep.getAttribute('aria-pressed')).toBe('false');
    expect(r.status.textContent).toContain('2');
    r.apply.click();
    expect(r.applied).toHaveLength(1);
    expect(r.applied[0].binds.forward).toEqual(['KeyZ', 'ArrowUp']);
    expect(r.applied[0].binds.map).toEqual(['Semicolon', null]);
    expect(r.applied[0].binds.slot1).toEqual(['Digit1', null]);
    expect(r.applied[0].note).toContain('AZERTY');
  });

  it('keeps a target the player already picked when detection lands late', async () => {
    const r = rig('azerty-fr');
    r.open.click();
    r.dropdowns[1].onChange?.('qwertz-de');
    await r.detect();
    // The late detection never overwrites the player's own pick.
    expect(r.dropdowns[1].el.dataset.value).not.toBe('azerty-fr');
    r.apply.click();
    // QWERTZ moves no bound letter here (M and B print the same), so no apply.
    expect(r.applied).toHaveLength(0);
    expect(r.apply.disabled).toBe(true);
  });

  it('builds nothing on the touch interface, which has no keyboard to convert', () => {
    setInterfaceMode('touch');
    document.body.innerHTML = '<div id="body"></div>';
    const host = document.getElementById('body') as HTMLElement;
    // An empty seam: the gate returns before any dep is touched.
    buildKeybindLayoutConvertRow(host, {} as KeybindLayoutConvertDeps, () => {});
    expect(host.querySelector('.kb-layout')).toBeNull();
  });

  it('ignores an unknown picker value and leaves the target alone without detection', async () => {
    const r = rig(null);
    r.open.click();
    await r.detect();
    expect(r.dropdowns[1].el.dataset.value).toBe('qwerty-us');
    r.dropdowns[1].onChange?.('not-a-layout');
    expect(r.apply.disabled).toBe(true);
    r.dropdowns[1].onChange?.('dvorak');
    expect(r.apply.disabled).toBe(false);
  });
});
