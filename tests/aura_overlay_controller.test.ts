// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedAbility } from '../src/sim/sim';
import { AuraOverlayController } from '../src/ui/aura_overlay_controller';
import type { PainterHostWriters } from '../src/ui/painter_host';

beforeEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
});

const known = (...ids: string[]): ResolvedAbility[] =>
  ids.map((id) => ({ def: { id } }) as ResolvedAbility);

const writers = {
  toggleClass: (el: HTMLElement, cls: string, on: boolean) => el.classList.toggle(cls, on),
} as unknown as PainterHostWriters;

describe('AuraOverlayController setup preview', () => {
  it('shows every relevant frame in placement mode with its final appearance vars', () => {
    const controller = new AuraOverlayController({
      doc: document,
      writers,
      playerClass: 'warrior',
      playerName: 'Raido',
      known: () => known('mortal_strike', 'heroic_strike', 'overpower', 'execute', 'sudden_death'),
      iconUrl: (id) => `/icons/${id}.png`,
    });

    controller.beginPlacement('battle_trance', 'arcs');
    const root = document.querySelector('#aura-overlays');
    expect(root?.classList.contains('placement')).toBe(true);
    expect(root?.querySelectorAll('.aura-overlay-frame')).toHaveLength(3);
    const revenge = root?.querySelector<HTMLElement>('[data-proc="battle_trance"]');
    expect(revenge?.classList.contains('placement-target')).toBe(true);
    expect(revenge?.classList.contains('placement-arcs')).toBe(true);
    expect(revenge?.classList.contains('placement-icon')).toBe(false);
    expect(
      root?.querySelector('[data-proc="sudden_death"]')?.classList.contains('placement-target'),
    ).toBe(false);
    expect(
      root?.querySelector('[data-proc="sudden_death"]')?.classList.contains('placement-preview'),
    ).toBe(true);
    expect(revenge?.style.getPropertyValue('--aura-opacity')).toBe('0.7');
    expect(revenge?.querySelector('img')?.getAttribute('src')).toBe('/icons/mortal_strike.png');
    expect(revenge?.querySelector('.aura-overlay-icon')).not.toBeNull();
    expect(revenge?.querySelector('.aura-overlay-arcs-shell')).not.toBeNull();
    const handle = revenge?.querySelector<HTMLElement>('.aura-overlay-move-handle');
    expect(handle?.getAttribute('aria-hidden')).toBe('true');
  });

  it('selects another visible spell part directly from its placement preview', () => {
    const onPlacement = vi.fn();
    const controller = new AuraOverlayController({
      doc: document,
      writers,
      playerClass: 'warrior',
      playerName: 'Raido',
      known: () => known('revenge', 'raised_guard'),
      iconUrl: (id) => `/icons/${id}.png`,
    });
    controller.onPlacementChange(onPlacement);
    controller.beginPlacement('revenge_free', 'icon');
    const raisedGuard = document.querySelector<HTMLElement>('[data-proc="raised_guard"]');
    const crescents = raisedGuard?.querySelector<HTMLElement>('.aura-overlay-arcs-shell');
    Object.defineProperty(crescents, 'setPointerCapture', { value: vi.fn() });

    crescents?.dispatchEvent(
      Object.assign(new MouseEvent('pointerdown', { button: 0, bubbles: true }), { pointerId: 4 }),
    );

    expect(raisedGuard?.classList.contains('placement-target')).toBe(true);
    expect(raisedGuard?.classList.contains('placement-arcs')).toBe(true);
    expect(
      document.querySelector('[data-proc="revenge_free"]')?.classList.contains('placement-target'),
    ).toBe(false);
    expect(onPlacement).toHaveBeenLastCalledWith('raised_guard', 'arcs');
  });

  it('keeps frames inactive outside setup until their aura kind is present', () => {
    const controller = new AuraOverlayController({
      doc: document,
      writers,
      playerClass: 'warrior',
      playerName: 'Raido',
      known: () => known('bloodthirst', 'enrage_passive'),
      iconUrl: (id) => `/icons/${id}.png`,
    });
    const frame = document.querySelector<HTMLElement>('[data-proc="enrage"]');

    controller.setPlacement(false);
    controller.paint([]);
    expect(frame?.classList.contains('active')).toBe(false);
    controller.paint([{ kind: 'buff_ap_pct' } as never]);
    expect(frame?.classList.contains('active')).toBe(false);
    controller.paint([{ kind: 'enrage' } as never]);
    expect(frame?.classList.contains('active')).toBe(true);
  });

  it('enables and disables every available aura without losing staggered defaults', () => {
    const controller = new AuraOverlayController({
      doc: document,
      writers,
      playerClass: 'warrior',
      playerName: 'Raido',
      known: () => known('revenge', 'raised_guard', 'iron_resolve'),
      iconUrl: (id) => `/icons/${id}.png`,
    });

    expect(controller.get('revenge_free')).toMatchObject({ enabled: false, arcsScale: 0.8 });
    expect(controller.get('raised_guard')).toMatchObject({ enabled: false, arcsScale: 1 });
    expect(controller.get('iron_resolve')).toMatchObject({ enabled: false, arcsScale: 1.1 });

    controller.setAll(true);
    expect(controller.get('revenge_free').enabled).toBe(true);
    expect(controller.get('raised_guard').enabled).toBe(true);
    expect(controller.get('iron_resolve').enabled).toBe(true);
    expect(
      document.querySelector('[data-proc="revenge_free"]')?.classList.contains('disabled'),
    ).toBe(false);

    controller.setAll(false);
    expect(controller.get('revenge_free').enabled).toBe(false);
    expect(controller.get('raised_guard').enabled).toBe(false);
  });

  it('matches Ironguard defensive buffs by aura id without lighting on another absorb', () => {
    const controller = new AuraOverlayController({
      doc: document,
      writers,
      playerClass: 'warrior',
      playerName: 'Raido',
      known: () => known('raised_guard', 'iron_resolve'),
      iconUrl: (id) => `/icons/${id}.png`,
    });
    const raisedGuard = document.querySelector<HTMLElement>('[data-proc="raised_guard"]');
    const ironResolve = document.querySelector<HTMLElement>('[data-proc="iron_resolve"]');

    controller.paint([
      { id: 'another_physical_wall', kind: 'buff_dr_phys' } as never,
      { id: 'another_absorb', kind: 'absorb' } as never,
    ]);
    expect(raisedGuard?.classList.contains('active')).toBe(false);
    expect(ironResolve?.classList.contains('active')).toBe(false);

    controller.paint([
      { id: 'raised_guard_dr', kind: 'absorb' } as never,
      { id: 'iron_resolve', kind: 'buff_dr_phys' } as never,
    ]);
    expect(raisedGuard?.classList.contains('active')).toBe(false);
    expect(ironResolve?.classList.contains('active')).toBe(false);

    controller.paint([
      { id: 'raised_guard_dr', kind: 'buff_dr_phys' } as never,
      { id: 'iron_resolve', kind: 'absorb' } as never,
    ]);
    expect(raisedGuard?.classList.contains('active')).toBe(true);
    expect(ironResolve?.classList.contains('active')).toBe(true);
  });

  it('refreshes frames immediately when the known loadout changes', () => {
    let currentKnown = known('revenge');
    const controller = new AuraOverlayController({
      doc: document,
      writers,
      playerClass: 'warrior',
      playerName: 'Raido',
      known: () => currentKnown,
      iconUrl: (id) => `/icons/${id}.png`,
    });
    expect(document.querySelector('[data-proc="revenge_free"]')).not.toBeNull();

    currentKnown = known('bloodthirst', 'enrage_passive');
    controller.paint([]);
    expect(
      document.querySelector('[data-proc="revenge_free"]')?.classList.contains('loadout-hidden'),
    ).toBe(true);
    expect(document.querySelector('[data-proc="enrage"]')).not.toBeNull();
  });

  it('refreshes frames when a same-length loadout changes ability ids', () => {
    let currentKnown = known('revenge');
    const controller = new AuraOverlayController({
      doc: document,
      writers,
      playerClass: 'warrior',
      playerName: 'Raido',
      known: () => currentKnown,
      iconUrl: (id) => `/icons/${id}.png`,
    });

    currentKnown = known('bloodthirst');
    controller.paint([]);

    expect(
      document.querySelector('[data-proc="revenge_free"]')?.classList.contains('loadout-hidden'),
    ).toBe(true);
    expect(document.querySelector('[data-proc="enrage"]')).not.toBeNull();
  });

  it('applies persisted appearance and position to rebuilt frames', () => {
    localStorage.setItem(
      'woc_aura_overlays:warrior:Raido',
      JSON.stringify({
        revenge_free: { posX: 0.2, opacity: 0.55, scale: 1.4, arcsScale: 0.8 },
      }),
    );
    new AuraOverlayController({
      doc: document,
      writers,
      playerClass: 'warrior',
      playerName: 'Raido',
      known: () => known('revenge'),
      iconUrl: (id) => `/icons/${id}.png`,
    });
    const frame = document.querySelector<HTMLElement>('[data-proc="revenge_free"]');
    expect(frame?.style.getPropertyValue('--aura-icon-x')).toBe('20%');
    expect(frame?.style.getPropertyValue('--aura-arcs-x')).toBe('20%');
    expect(frame?.style.getPropertyValue('--aura-opacity')).toBe('0.55');
    expect(frame?.style.getPropertyValue('--aura-icon-scale')).toBe('1.4');
    expect(frame?.style.getPropertyValue('--aura-arcs-scale')).toBe('0.8');
    expect(frame?.style.getPropertyValue('--aura-color')).toBe('#ffe14d');
  });

  it('drags setup frames inside the app viewport and persists the normalized position', () => {
    const onPosition = vi.fn();
    const controller = new AuraOverlayController({
      doc: document,
      writers,
      playerClass: 'warrior',
      playerName: 'Raido',
      known: () => known('revenge'),
      iconUrl: (id) => `/icons/${id}.png`,
    });
    controller.onPositionChange(onPosition);
    controller.beginPlacement('revenge_free', 'icon');
    const root = document.querySelector<HTMLElement>('#aura-overlays');
    const frame = root?.querySelector<HTMLElement>('[data-proc="revenge_free"]');
    const icon = frame?.querySelector<HTMLElement>('.aura-overlay-icon');
    const arcs = frame?.querySelector<HTMLElement>('.aura-overlay-arcs-shell');
    Object.defineProperty(root, 'getBoundingClientRect', {
      value: () => ({ left: 100, top: 50, width: 800, height: 500 }),
    });
    Object.defineProperty(icon, 'setPointerCapture', { value: vi.fn() });

    icon?.dispatchEvent(
      Object.assign(new MouseEvent('pointerdown', { button: 0, bubbles: true }), { pointerId: 7 }),
    );
    icon?.dispatchEvent(new MouseEvent('pointermove', { clientX: 1_000, clientY: 0 }));

    expect(frame?.style.getPropertyValue('--aura-icon-x')).toBe('100%');
    expect(frame?.style.getPropertyValue('--aura-icon-y')).toBe('0%');
    expect(frame?.style.getPropertyValue('--aura-arcs-x')).toBe('50%');
    expect(frame?.style.getPropertyValue('--aura-arcs-y')).toBe('56%');
    expect(onPosition).toHaveBeenLastCalledWith(
      'revenge_free',
      expect.objectContaining({ iconPosX: 1, iconPosY: 0, arcsPosX: 0.5, arcsPosY: 0.56 }),
    );
    icon?.dispatchEvent(new MouseEvent('pointerup'));
    controller.beginPlacement('revenge_free', 'arcs');
    Object.defineProperty(arcs, 'setPointerCapture', { value: vi.fn() });
    arcs?.dispatchEvent(
      Object.assign(new MouseEvent('pointerdown', { button: 0, bubbles: true }), { pointerId: 8 }),
    );
    arcs?.dispatchEvent(new MouseEvent('pointermove', { clientX: 100, clientY: 550 }));
    expect(frame?.style.getPropertyValue('--aura-icon-x')).toBe('100%');
    expect(frame?.style.getPropertyValue('--aura-icon-y')).toBe('0%');
    expect(frame?.style.getPropertyValue('--aura-arcs-x')).toBe('0%');
    expect(frame?.style.getPropertyValue('--aura-arcs-y')).toBe('100%');
    expect(
      JSON.parse(localStorage.getItem('woc_aura_overlays:warrior:Raido') ?? '{}'),
    ).toMatchObject({
      revenge_free: { iconPosX: 1, iconPosY: 0, arcsPosX: 0, arcsPosY: 1 },
    });
  });

  it('snaps pointer placement to the same one-percent grid used by nudges', () => {
    const controller = new AuraOverlayController({
      doc: document,
      writers,
      playerClass: 'warrior',
      playerName: 'Raido',
      known: () => known('revenge'),
      iconUrl: (id) => `/icons/${id}.png`,
    });
    controller.beginPlacement('revenge_free', 'icon');
    const root = document.querySelector<HTMLElement>('#aura-overlays');
    const frame = root?.querySelector<HTMLElement>('[data-proc="revenge_free"]');
    const icon = frame?.querySelector<HTMLElement>('.aura-overlay-icon');
    Object.defineProperty(root, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 1_000, height: 800 }),
    });
    Object.defineProperty(icon, 'setPointerCapture', { value: vi.fn() });

    icon?.dispatchEvent(
      Object.assign(new MouseEvent('pointerdown', { button: 0, bubbles: true }), { pointerId: 5 }),
    );
    icon?.dispatchEvent(new MouseEvent('pointermove', { clientX: 333, clientY: 287 }));

    expect(controller.get('revenge_free')).toMatchObject({
      iconPosX: 0.33,
      iconPosY: 0.36,
    });
  });

  it('does not drag outside setup or with a non-primary pointer button', () => {
    const controller = new AuraOverlayController({
      doc: document,
      writers,
      playerClass: 'warrior',
      playerName: 'Raido',
      known: () => known('revenge'),
      iconUrl: (id) => `/icons/${id}.png`,
    });
    const frame = document.querySelector<HTMLElement>('[data-proc="revenge_free"]');
    const icon = frame?.querySelector<HTMLElement>('.aura-overlay-icon');
    Object.defineProperty(icon, 'setPointerCapture', { value: vi.fn() });

    icon?.dispatchEvent(
      Object.assign(new MouseEvent('pointerdown', { button: 0 }), { pointerId: 1 }),
    );
    icon?.dispatchEvent(new MouseEvent('pointermove', { clientX: 10, clientY: 10 }));
    controller.beginPlacement('revenge_free', 'icon');
    icon?.dispatchEvent(
      Object.assign(new MouseEvent('pointerdown', { button: 1 }), { pointerId: 2 }),
    );
    icon?.dispatchEvent(new MouseEvent('pointermove', { clientX: 10, clientY: 10 }));

    expect(frame?.style.getPropertyValue('--aura-icon-x')).toBe('42%');
    expect(frame?.style.getPropertyValue('--aura-icon-y')).toBe('72%');
  });

  it('drags only the selected aura part from the four-arrow move handle', () => {
    const controller = new AuraOverlayController({
      doc: document,
      writers,
      playerClass: 'warrior',
      playerName: 'Raido',
      known: () => known('revenge'),
      iconUrl: (id) => `/icons/${id}.png`,
    });
    controller.beginPlacement('revenge_free', 'icon');
    const root = document.querySelector<HTMLElement>('#aura-overlays');
    const frame = root?.querySelector<HTMLElement>('[data-proc="revenge_free"]');
    const handle = frame?.querySelector<HTMLElement>('.aura-overlay-move-handle');
    Object.defineProperty(root, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 1_000, height: 800 }),
    });
    Object.defineProperty(handle, 'setPointerCapture', { value: vi.fn() });

    handle?.dispatchEvent(
      Object.assign(new MouseEvent('pointerdown', { button: 0, bubbles: true }), { pointerId: 9 }),
    );
    handle?.dispatchEvent(new MouseEvent('pointermove', { clientX: 400, clientY: 480 }));

    expect(frame?.style.getPropertyValue('--aura-arcs-x')).toBe('50%');
    expect(frame?.style.getPropertyValue('--aura-arcs-y')).toBe('56%');
    expect(frame?.style.getPropertyValue('--aura-icon-x')).toBe('40%');
    expect(frame?.style.getPropertyValue('--aura-icon-y')).toBe('60%');
  });

  it('nudges icon and crescents independently for keyboard-accessible placement', () => {
    const onPosition = vi.fn();
    const controller = new AuraOverlayController({
      doc: document,
      writers,
      playerClass: 'warrior',
      playerName: 'Raido',
      known: () => known('revenge'),
      iconUrl: (id) => `/icons/${id}.png`,
    });
    controller.onPositionChange(onPosition);

    controller.nudge('revenge_free', 'icon', -1, 1);

    expect(controller.get('revenge_free')).toMatchObject({
      iconPosX: 0.41,
      iconPosY: 0.73,
      arcsPosX: 0.5,
      arcsPosY: 0.56,
    });
    expect(onPosition).toHaveBeenCalledWith(
      'revenge_free',
      expect.objectContaining({ iconPosX: 0.41, arcsPosX: 0.5 }),
    );

    controller.patch('revenge_free', {
      iconPosX: 0.99,
      arcsPosX: 0.95,
      iconPosY: 0.02,
      arcsPosY: 0.26,
    });
    controller.nudge('revenge_free', 'icon', 1, -10);
    expect(controller.get('revenge_free')).toMatchObject({
      iconPosX: 1,
      arcsPosX: 0.95,
      iconPosY: 0,
      arcsPosY: 0.26,
    });

    controller.patch('revenge_free', {
      iconPosX: 0.04,
      arcsPosX: 0,
      iconPosY: 0.7,
      arcsPosY: 0.94,
    });
    controller.nudge('revenge_free', 'arcs', -1, 10);
    expect(controller.get('revenge_free')).toMatchObject({
      iconPosX: 0.04,
      arcsPosX: 0,
      iconPosY: 0.7,
      arcsPosY: 1,
    });
    expect(
      JSON.parse(localStorage.getItem('woc_aura_overlays:warrior:Raido') ?? '{}'),
    ).toMatchObject({
      revenge_free: { iconPosX: 0.04, arcsPosX: 0, iconPosY: 0.7, arcsPosY: 1 },
    });
  });
});
