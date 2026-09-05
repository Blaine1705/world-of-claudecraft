// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { createCannonEncounter } from '../src/sim/minigames/cannon_encounter';
import type { VehicleSession } from '../src/sim/types';
import { VehicleActionBarController } from '../src/ui/hud/vehicle/vehicle_action_bar_controller';
import { makeWriterFacet } from '../src/ui/painter_host';

vi.mock('../src/ui/icons', () => ({ iconDataUrl: (_kind: string, key: string) => `/${key}.webp` }));
vi.mock('../src/game/sfx', () => ({ sfx: { preload: vi.fn(), playUi: vi.fn() } }));

afterEach(() => {
  document.body.replaceChildren();
  document.body.className = '';
});

it('elides unchanged frames, routes all three buttons, and restores normal controls on exit', () => {
  const ui = document.createElement('div');
  ui.id = 'ui';
  document.body.append(ui);
  const world = {
    vehicleSession: null as VehicleSession | null,
    enterVehicle: vi.fn(),
    useVehicleAction: vi.fn(),
    leaveVehicle: vi.fn(() => {
      world.vehicleSession = null;
    }),
  };
  const writes = vi.fn();
  const cancel = vi.fn();
  const consumePeek = vi.fn(() => false);
  const presentation = { setGroundAimReticle: vi.fn(), addShake: vi.fn() };
  const controller = new VehicleActionBarController({
    world,
    writers: makeWriterFacet(new Map(), new Map(), new Map(), new Map(), writes, () => {}),
    keyLabel: (slot) => String(slot + 1),
    consumePeek,
    clearReticle: vi.fn(),
    presentation,
    cancelOnEnter: [{ cancel }],
    attachTooltip: (element, html) => {
      element.addEventListener('focus', () => {
        element.setAttribute('data-test-tooltip', html());
      });
    },
  });
  controller.update();
  expect(document.body.classList.contains('operating-vehicle')).toBe(false);
  const encounter = createCannonEncounter();
  encounter.phase = 'wave';
  world.vehicleSession = {
    kind: 'cannon',
    stationId: 'north_watch_cannon',
    cycle: 'wq3_8',
    origin: { x: 442, y: 3, z: 1034 },
    encounter,
  };
  controller.update();
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(document.body.classList.contains('operating-vehicle')).toBe(true);
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('.vehicle-action')];
  expect(buttons).toHaveLength(3);
  const meter = document.querySelector<HTMLElement>('.vehicle-integrity')!;
  expect(meter.tabIndex).toBe(0);
  meter.focus();
  expect(meter.getAttribute('data-test-tooltip')).toContain('Gold:');
  const shake = document.querySelector<HTMLInputElement>('.vehicle-comfort input')!;
  expect(shake.checked).toBe(false);
  encounter.feedback.push({ id: 1, tick: 0, kind: 'shot', x: 440, z: 1000 });
  controller.update();
  expect(presentation.addShake).not.toHaveBeenCalled();
  shake.checked = true;
  encounter.feedback.push({ id: 2, tick: 0, kind: 'barrel', x: 440, z: 1000 });
  controller.update();
  expect(presentation.addShake).toHaveBeenCalledExactlyOnceWith(0.12);
  controller.update();
  expect(presentation.addShake).toHaveBeenCalledTimes(1);
  consumePeek.mockReturnValueOnce(true);
  buttons[0].click();
  expect(controller.aim.isActive()).toBe(false);
  for (const [slot, button] of buttons.entries()) {
    button.click();
    controller.update();
    expect(controller.aim.activeSlot()).toBe(slot);
    expect(button.querySelector<HTMLElement>('.icon-label')!.style.backgroundImage).toContain(
      '.webp',
    );
    expect(button.getAttribute('aria-label')).toBeTruthy();
    button.focus();
    expect(button.getAttribute('data-test-tooltip')).toContain('damage');
    expect(button.getAttribute('aria-description')).toContain('No mana cost');
  }
  writes.mockClear();
  for (let frame = 0; frame < 60; frame++) controller.update();
  expect(writes).not.toHaveBeenCalled();
  document.querySelector<HTMLButtonElement>('.vehicle-exit')!.click();
  controller.update();
  expect(world.leaveVehicle).toHaveBeenCalledTimes(1);
  expect(controller.aim.isActive()).toBe(false);
  expect(document.body.classList.contains('operating-vehicle')).toBe(false);
  expect(document.getElementById('vehicle-action-bar')!.style.display).toBe('none');
});
