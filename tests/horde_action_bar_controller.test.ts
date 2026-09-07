// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { hordeExitInput } from '../src/game/horde_controls';
import { sfx } from '../src/game/sfx';
import { HORDE_QUEST_ID } from '../src/sim/content/world_quest_horde';
import { createHordeBarricade } from '../src/sim/minigames/horde_barricade';
import { emptyMoveInput, type WorldQuestProgress } from '../src/sim/types';
import {
  HordeActionBarController,
  type HordeHudWorld,
} from '../src/ui/hud/vehicle/horde_action_bar_controller';
import { makeWriterFacet } from '../src/ui/painter_host';

vi.mock('../src/game/sfx', () => ({ sfx: { preload: vi.fn(), playUi: vi.fn() } }));
vi.mock('../src/sim/world', () => ({ groundHeight: () => 2 }));
afterEach(() => {
  document.body.replaceChildren();
  document.body.className = '';
  vi.clearAllMocks();
});

it('shows paired rewards, blocks normal chrome, elides repeated cues and restores after exit', () => {
  document.body.innerHTML = '<div id="ui"></div>';
  const state = createHordeBarricade(1);
  state.phase = 'active';
  state.tick = 100;
  state.units = [
    { id: 1, kind: 'crate', x: -5, z: 24, hp: 24, maxHp: 24, reward: 'projectile', choiceId: 1 },
    { id: 2, kind: 'crate', x: 5, z: 24, hp: 24, maxHp: 24, reward: 'haste', choiceId: 1 },
  ];
  const progress: WorldQuestProgress = {
    questId: HORDE_QUEST_ID,
    state: 'active',
    count: 0,
    horde: state,
  };
  const world = {
    worldQuestLog: new Map([[HORDE_QUEST_ID, progress]]),
    cfg: { seed: 1 },
    player: { pos: { x: 402, y: 2, z: 1778 } },
  } as unknown as HordeHudWorld;
  const writes = vi.fn();
  const cancel = vi.fn();
  const controller = new HordeActionBarController(
    world,
    makeWriterFacet(new Map(), new Map(), new Map(), new Map(), writes, () => {}),
    { worldToScreen: (x, _y, z) => ({ x, y: z, behind: false }) },
    [{ cancel }],
  );
  controller.update();
  expect(document.body.classList.contains('playing-horde')).toBe(true);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect([...document.querySelectorAll('.horde-crate-label')].map((e) => e.textContent)).toEqual([
    '+1 shot',
    '+25% fire rate',
  ]);
  writes.mockClear();
  controller.update();
  expect(writes).not.toHaveBeenCalled();
  state.units = [];
  state.lastUpgrade = { kind: 'projectile', tick: 100 };
  controller.update();
  expect(document.querySelector('.horde-upgrade-feedback')?.textContent).toBe('Upgrade: +1 shot');
  expect(sfx.playUi).toHaveBeenCalledTimes(1);
  controller.update();
  expect(sfx.playUi).toHaveBeenCalledTimes(1);
  expect(
    [...document.querySelectorAll<HTMLElement>('.horde-crate-label')].every(
      (e) => e.style.display === 'none',
    ),
  ).toBe(true);
  document.querySelector<HTMLButtonElement>('.horde-exit')?.click();
  expect(hordeExitInput(world, emptyMoveInput()).back).toBe(true);
  delete progress.horde;
  controller.update();
  expect(document.body.classList.contains('playing-horde')).toBe(false);
  expect(document.querySelector<HTMLElement>('.horde-controls')?.style.display).toBe('none');
  expect(hordeExitInput(world, emptyMoveInput()).back).toBe(false);
});
