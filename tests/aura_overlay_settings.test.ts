// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultAuraOverlayConfig } from '../src/ui/aura_overlay_config';
import { AuraOverlaySettingsPanel } from '../src/ui/aura_overlay_settings';
import type { WarriorProcDef } from '../src/ui/aura_overlay_view';
import { FocusManager } from '../src/ui/focus_manager';

const revenge: WarriorProcDef = {
  id: 'revenge_free',
  auraKind: 'revenge_free',
  iconAbilityId: 'revenge',
  theme: 'rage',
  labelKey: 'hudChrome.auraOverlay.procs.revenge',
};
const raisedGuard: WarriorProcDef = {
  id: 'raised_guard',
  auraKind: 'buff_dr_phys',
  auraId: 'raised_guard_dr',
  iconAbilityId: 'raised_guard',
  theme: 'battle',
  labelKey: null,
};
const openFocusTrap = (root: () => HTMLElement, returnFocusTo: HTMLElement) =>
  new FocusManager().open({ root, returnFocusTo });

beforeEach(() => {
  document.body.replaceChildren();
});

describe('AuraOverlaySettingsPanel position controls', () => {
  it('keeps position sliders out of the main menu and resets through the card action', () => {
    let config = defaultAuraOverlayConfig('revenge_free');
    const panel = new AuraOverlaySettingsPanel({
      click: vi.fn(),
      openFocusTrap,
      auras: {
        playerClass: () => 'warrior',
        defs: () => [revenge],
        get: () => config,
        patch: (_id, patch) => {
          config = { ...config, ...patch };
        },
        reset: (id) => {
          config = { ...config, ...defaultAuraOverlayConfig(id) };
        },
        nudge: vi.fn(),
        setAll: vi.fn(),
        beginPlacement: vi.fn(),
        endPlacement: vi.fn(),
        setPlacement: vi.fn(),
        onPositionChange: () => vi.fn(),
        onPlacementChange: () => vi.fn(),
      },
    });
    const root = document.createElement('div');
    document.body.appendChild(root);
    panel.render(root);
    expect(root.querySelectorAll('input[type="range"]')).toHaveLength(3);

    config = {
      ...config,
      iconPosX: 0.18,
      iconPosY: 0.73,
      arcsPosX: 0.24,
      arcsPosY: 0.64,
    };

    root.querySelector<HTMLButtonElement>('.aura-reset-btn')?.click();
    expect(config).toMatchObject({
      iconPosX: 0.42,
      iconPosY: 0.72,
      arcsPosX: 0.5,
      arcsPosY: 0.56,
    });
  });

  it('changes icon and crescent sizes independently', () => {
    let config = defaultAuraOverlayConfig('revenge_free');
    const panel = new AuraOverlaySettingsPanel({
      click: vi.fn(),
      openFocusTrap,
      auras: {
        playerClass: () => 'warrior',
        defs: () => [revenge],
        get: () => config,
        patch: (_id, patch) => {
          config = { ...config, ...patch };
        },
        reset: vi.fn(),
        nudge: vi.fn(),
        setAll: vi.fn(),
        beginPlacement: vi.fn(),
        endPlacement: vi.fn(),
        setPlacement: vi.fn(),
        onPositionChange: () => vi.fn(),
        onPlacementChange: () => vi.fn(),
      },
    });
    const root = document.createElement('div');
    document.body.appendChild(root);
    panel.render(root);
    const sliders = root.querySelectorAll<HTMLInputElement>('input[type="range"]');

    sliders[1].value = '0.8';
    sliders[1].dispatchEvent(new Event('input', { bubbles: true }));
    expect(config).toMatchObject({ scale: 0.8, arcsScale: 0.8 });

    sliders[2].value = '1.4';
    sliders[2].dispatchEvent(new Event('input', { bubbles: true }));
    expect(config).toMatchObject({ scale: 0.8, arcsScale: 1.4 });
  });

  it('offers global enable controls and a per-aura color picker', () => {
    let config = defaultAuraOverlayConfig('revenge_free');
    const setAll = vi.fn();
    const panel = new AuraOverlaySettingsPanel({
      click: vi.fn(),
      openFocusTrap,
      auras: {
        playerClass: () => 'warrior',
        defs: () => [revenge],
        get: () => config,
        patch: (_id, patch) => {
          config = { ...config, ...patch };
        },
        reset: vi.fn(),
        nudge: vi.fn(),
        setAll,
        beginPlacement: vi.fn(),
        endPlacement: vi.fn(),
        setPlacement: vi.fn(),
        onPositionChange: () => vi.fn(),
        onPlacementChange: () => vi.fn(),
      },
    });
    const root = document.createElement('div');
    document.body.appendChild(root);
    panel.render(root);

    root.querySelector<HTMLButtonElement>('.aura-all-on')?.click();
    root.querySelector<HTMLButtonElement>('.aura-all-off')?.click();
    expect(setAll.mock.calls).toEqual([[true], [false]]);

    const color = root.querySelector<HTMLInputElement>('input[type="color"]');
    expect(color?.value).toBe('#ffe14d');
    if (color) {
      color.value = '#33ccff';
      color.dispatchEvent(new Event('input', { bubbles: true }));
    }
    expect(config.color).toBe('#33ccff');
  });

  it('keeps icon and crescents visible but positions them independently', async () => {
    let config = defaultAuraOverlayConfig('revenge_free');
    const beginPlacement = vi.fn();
    const endPlacement = vi.fn();
    const nudge = vi.fn();
    const placementListener: {
      current: ((id: 'revenge_free' | 'raised_guard', part: 'icon' | 'arcs') => void) | null;
    } = { current: null };
    const reset = vi.fn((id: 'revenge_free') => {
      config = { ...config, ...defaultAuraOverlayConfig(id) };
    });
    const panel = new AuraOverlaySettingsPanel({
      click: vi.fn(),
      openFocusTrap,
      auras: {
        playerClass: () => 'warrior',
        defs: () => [revenge, raisedGuard],
        get: () => config,
        patch: (_id, patch) => {
          config = { ...config, ...patch };
        },
        reset,
        nudge,
        setAll: vi.fn(),
        beginPlacement,
        endPlacement,
        setPlacement: vi.fn(),
        onPositionChange: () => vi.fn(),
        onPlacementChange: (listener) => {
          placementListener.current = listener;
          return vi.fn();
        },
      },
    });
    const menu = document.createElement('div');
    menu.id = 'options-menu';
    const root = document.createElement('div');
    menu.appendChild(root);
    document.body.appendChild(menu);
    panel.render(root);

    const reposition = root.querySelector<HTMLButtonElement>('.aura-reposition-btn');
    Object.defineProperty(reposition, 'getClientRects', {
      value: () => [{ width: 100, height: 40 }],
    });
    reposition?.click();
    expect(menu.classList.contains('aura-placement-hidden')).toBe(true);
    expect(document.querySelector('.aura-placement-toolbar')).not.toBeNull();
    expect(document.querySelector('.aura-placement-toolbar')?.getAttribute('aria-modal')).toBe(
      'true',
    );
    expect(beginPlacement).toHaveBeenLastCalledWith('revenge_free', 'icon');
    const auraSelect = document.querySelector<HTMLSelectElement>('.aura-placement-select');
    expect(auraSelect?.classList.contains('hud-select')).toBe(true);
    expect(Array.from(auraSelect?.options ?? []).map((option) => option.value)).toEqual([
      'revenge_free',
      'raised_guard',
    ]);
    expect(auraSelect?.value).toBe('revenge_free');
    const iconPart = document.querySelector<HTMLButtonElement>('.aura-placement-icon');
    const arcsPart = document.querySelector<HTMLButtonElement>('.aura-placement-arcs');
    expect(iconPart?.classList.contains('active')).toBe(true);
    expect(iconPart?.getAttribute('aria-pressed')).toBe('true');
    expect(arcsPart?.classList.contains('active')).toBe(false);
    expect(arcsPart?.getAttribute('aria-pressed')).toBe('false');
    const nudgeButtons = [
      ['.aura-placement-left', 'Move Left'],
      ['.aura-placement-up', 'Move Up'],
      ['.aura-placement-down', 'Move Down'],
      ['.aura-placement-right', 'Move Right'],
    ] as const;
    for (const [selector, label] of nudgeButtons) {
      const button = document.querySelector<HTMLElement>(selector);
      expect(button?.tagName).toBe('BUTTON');
      expect(button?.getAttribute('aria-label')).toBe(label);
    }

    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(document.activeElement).toBe(iconPart);

    document.querySelector<HTMLButtonElement>('.aura-placement-left')?.click();
    document.querySelector<HTMLButtonElement>('.aura-placement-up')?.click();
    if (auraSelect) {
      auraSelect.value = 'raised_guard';
      auraSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
    expect(beginPlacement).toHaveBeenLastCalledWith('raised_guard', 'icon');
    placementListener.current?.('raised_guard', 'arcs');
    expect(iconPart?.getAttribute('aria-pressed')).toBe('false');
    expect(arcsPart?.getAttribute('aria-pressed')).toBe('true');
    expect(auraSelect?.value).toBe('raised_guard');
    document.querySelector<HTMLButtonElement>('.aura-placement-down')?.click();
    document.querySelector<HTMLButtonElement>('.aura-placement-right')?.click();
    expect(nudge.mock.calls).toEqual([
      ['revenge_free', 'icon', -1, 0],
      ['revenge_free', 'icon', 0, -1],
      ['raised_guard', 'arcs', 0, 1],
      ['raised_guard', 'arcs', 1, 0],
    ]);

    document.querySelector<HTMLButtonElement>('.aura-placement-reset')?.click();
    expect(reset).toHaveBeenCalledWith('raised_guard');
    expect(config).toMatchObject({
      iconPosX: 0.5,
      arcsPosX: 0.5,
      arcsPosY: 0.56,
    });

    document.querySelector<HTMLButtonElement>('.aura-placement-done')?.click();
    expect(endPlacement).toHaveBeenCalledOnce();
    expect(menu.classList.contains('aura-placement-hidden')).toBe(false);
    expect(document.querySelector('.aura-placement-toolbar')).toBeNull();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(document.activeElement).toBe(reposition);
  });
});
