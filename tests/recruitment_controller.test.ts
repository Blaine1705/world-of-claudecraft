// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExpeditionController } from '../src/ui/hud/expeditions';
import { makeWriterFacet } from '../src/ui/painter_host';
import type { IWorld } from '../src/world_api';
import type { DungeonFinderInfo } from '../src/world_api/dungeon_finder';

function setup() {
  const world = {
    playerId: 1,
    player: { level: 8, name: 'Recruiter', inCombat: false },
    partyInfo: null,
    dungeonFinderInfo: {
      roles: ['tank'],
      eligibleRoles: ['tank', 'dps'],
      cooldown: 0,
      queue: null,
      proposal: null,
      myListing: null,
      myApplication: null,
    } as DungeonFinderInfo,
    dungeonFinderBoard: [],
    dungeonFinderExpeditionConfigure: vi.fn(),
    dungeonFinderExpeditionApply: vi.fn(),
  };
  const deps = {
    world: () => world as unknown as IWorld,
    writers: makeWriterFacet(
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      () => {},
      () => {},
    ),
    captureFocus: vi.fn(() => document.getElementById('expedition-bell')),
    restoreFocus: vi.fn(),
    openFinder: vi.fn(),
    openRecruitment: vi.fn(),
  };
  const controller = new ExpeditionController(deps);
  controller.render();
  document.querySelector<HTMLButtonElement>('.expedition-tools [data-action="recruit"]')?.click();
  return { world, controller, deps };
}
const button = (action: string) =>
  document.querySelector<HTMLButtonElement>(`[data-recruit-action="${action}"]`)!;
function choose(field: string, value: string) {
  const control = document.querySelector<HTMLSelectElement>(`[data-recruit-field="${field}"]`)!;
  control.value = value;
  control.dispatchEvent(new Event('change', { bubbles: true }));
}
function note(value: string) {
  const control = document.querySelector<HTMLInputElement>('[data-recruit-field="note"]')!;
  control.value = value;
  control.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('compact recruitment through the bell', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="ui"></div>';
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens dungeon, difficulty, role, goal and preview directly without navigating to Finder', () => {
    const { deps } = setup();
    expect(document.querySelectorAll('[data-recruit-field]')).toHaveLength(5);
    expect(document.querySelector('[data-recruit-preview]')?.textContent).toContain('1/5 players');
    expect(button('publish').disabled).toBe(false);
    expect(deps.openFinder).not.toHaveBeenCalled();
    expect(deps.openRecruitment).not.toHaveBeenCalled();
  });

  it('previews the chosen role and goal, escapes notes and publishes them atomically once', () => {
    const { world } = setup();
    choose('role', 'dps');
    choose('purpose', 'first_time');
    note('<img src=x onerror=alert(1)>');
    expect(document.querySelector('[data-recruit-preview]')?.textContent).toContain('First time');
    expect(document.querySelector('[data-recruit-preview]')?.textContent).toContain('Damage');
    expect(document.querySelector('[data-recruit-preview] img[src="x"]')).toBeNull();
    button('publish').click();
    expect(world.dungeonFinderExpeditionConfigure).toHaveBeenCalledExactlyOnceWith({
      kind: 'recruit',
      activityId: 'hollow_crypt_normal',
      role: 'dps',
      details: { purpose: 'first_time', note: '<img src=x onerror=alert(1)>' },
    });
    expect(button('publish').disabled).toBe(true);
    button('publish').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(world.dungeonFinderExpeditionConfigure).toHaveBeenCalledOnce();
    expect(document.querySelector('.expedition-own')).toBeNull();
  });

  it('shows the actual own-group card and requests only after authoritative confirmation', () => {
    const { world, controller } = setup();
    choose('purpose', 'relaxed');
    note('No rush');
    button('publish').click();
    world.dungeonFinderInfo.myListing = {
      id: 5,
      activityId: 'hollow_crypt_normal',
      tags: [],
      details: { purpose: 'relaxed', note: 'No rush' },
      applicants: [{ pid: 2, name: 'Mira', cls: 'priest', level: 8, roles: ['healer'] }],
    };
    controller.render();
    expect(document.querySelector('.expedition-recruitment')).toBeNull();
    expect(document.querySelector('.expedition-own')?.textContent).toContain('Forming Group');
    expect(document.querySelector('.expedition-own')?.textContent).toContain('No rush');
    expect(document.querySelector('.expedition-own')?.textContent).toContain('Mira');
    expect(document.querySelector('.expedition-own [data-action="edit-details"]')).not.toBeNull();
    expect(document.querySelector('[data-action="travel"]')).toBeNull();
    controller.close();
  });

  it('previews and publishes a different dungeon on its eligible heroic difficulty', () => {
    const { world, controller } = setup();
    world.player.level = 20;
    controller.render();
    choose('dungeon', 'wildheart_basin');
    expect(document.querySelector<HTMLSelectElement>('[data-recruit-field="dungeon"]')!.value).toBe(
      'wildheart_basin',
    );
    expect(document.querySelector('[data-recruit-preview]')?.textContent).toContain('Normal');
    choose('difficulty', 'heroic');
    expect(
      document.querySelector<HTMLSelectElement>('[data-recruit-field="difficulty"]')!.value,
    ).toBe('heroic');
    expect(document.querySelector('[data-recruit-preview]')?.textContent).toContain('Heroic');
    button('publish').click();
    expect(world.dungeonFinderExpeditionConfigure).toHaveBeenCalledExactlyOnceWith({
      kind: 'recruit',
      activityId: 'wildheart_basin_heroic',
      role: 'tank',
      details: { purpose: 'clear', note: '' },
    });
  });

  it('keeps the draft and offers a retry when no listing is confirmed, without inventing success', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const { world, controller } = setup();
    note('Learning together');
    button('publish').click();
    vi.setSystemTime(10_999);
    controller.render();
    expect(button('publish').disabled).toBe(true);
    vi.setSystemTime(11_000);
    controller.render();
    expect(button('publish').disabled).toBe(false);
    expect(document.querySelector('[data-recruit-field="note"]')).toHaveProperty(
      'value',
      'Learning together',
    );
    expect(document.querySelector('.expedition-recruit-footer')?.textContent).toContain(
      'not been confirmed',
    );
    expect(document.querySelector('.expedition-own')).toBeNull();
    button('publish').click();
    expect(world.dungeonFinderExpeditionConfigure).toHaveBeenCalledTimes(2);
  });

  it('keeps note, caret and selections across live updates and language repaint', () => {
    const { world, controller } = setup();
    choose('purpose', 'needs_help');
    expect(document.querySelector('[data-recruit-preview]')?.textContent).toContain('Need help');
    expect(document.querySelector('[data-recruit-field="purpose"]')).toHaveProperty(
      'value',
      'needs_help',
    );
    choose('role', 'dps');
    note('Help with mechanics');
    const control = document.querySelector<HTMLInputElement>('[data-recruit-field="note"]')!;
    control.focus();
    control.setSelectionRange(2, 8);
    world.player.inCombat = true;
    controller.render();
    controller.relocalize();
    const restored = document.querySelector<HTMLInputElement>('[data-recruit-field="note"]')!;
    expect(restored.value).toBe('Help with mechanics');
    expect(restored.selectionStart).toBe(2);
    expect(restored.selectionEnd).toBe(8);
    expect(document.activeElement).toBe(restored);
    expect(document.querySelector('[data-recruit-field="purpose"]')).toHaveProperty(
      'value',
      'needs_help',
    );
    expect(document.querySelector('[data-recruit-field="role"]')).toHaveProperty('value', 'dps');
  });

  it('retains a cancelled draft but sends nothing until publication', () => {
    const { world } = setup();
    note('Learning together');
    button('cancel').click();
    expect(document.querySelector('.expedition-recruitment')).toBeNull();
    document.querySelector<HTMLButtonElement>('.expedition-tools [data-action="recruit"]')?.click();
    expect(document.querySelector('[data-recruit-field="note"]')).toHaveProperty(
      'value',
      'Learning together',
    );
    expect(world.dungeonFinderExpeditionConfigure).not.toHaveBeenCalled();
  });

  it('revalidates current authority before a stale Publish button can send', () => {
    const { world, controller } = setup();
    world.dungeonFinderInfo.queue = { activities: ['hollow_crypt_normal'], waited: 0 };
    button('publish').click();
    expect(world.dungeonFinderExpeditionConfigure).not.toHaveBeenCalled();
    controller.render();
    expect(button('publish').disabled).toBe(true);
    expect(document.querySelector('.expedition-recruit-footer')?.textContent).toContain(
      'Leave the matchmaking queue',
    );
  });

  it('does not reopen a closed panel when delayed publication is confirmed', () => {
    const { world, controller } = setup();
    button('publish').click();
    controller.close();
    world.dungeonFinderInfo.myListing = {
      id: 5,
      activityId: 'hollow_crypt_normal',
      tags: [],
      applicants: [],
    };
    controller.render();
    expect(document.getElementById('expedition-panel')).toHaveProperty('hidden', true);
  });

  it('does no DOM work during unchanged polls with the form open', () => {
    const { controller } = setup();
    const panel = document.getElementById('expedition-panel')!;
    const query = vi.spyOn(panel, 'querySelector');
    const observer = new MutationObserver(() => {});
    observer.observe(panel, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
    for (let n = 0; n < 20; n++) controller.render();
    expect(query).not.toHaveBeenCalled();
    expect(observer.takeRecords()).toEqual([]);
    observer.disconnect();
  });

  it('preserves the native input through IME composition and live updates', () => {
    const { world, controller } = setup();
    const input = document.querySelector<HTMLInputElement>('[data-recruit-field="note"]')!;
    input.focus();
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    input.value = '一緒に';
    input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    world.player.inCombat = true;
    controller.render();
    controller.relocalize();
    expect(document.querySelector('[data-recruit-field="note"]')).toBe(input);
    expect(document.activeElement).toBe(input);
    input.value = '一緒に探索';
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    expect(document.querySelector('[data-recruit-preview]')?.textContent).toContain('一緒に探索');
    button('publish').click();
    expect(world.dungeonFinderExpeditionConfigure).toHaveBeenCalledWith(
      expect.objectContaining({ details: { purpose: 'clear', note: '一緒に探索' } }),
    );
  });

  it('shows another pre-entry group as forming, with the selected application role', () => {
    const { world, controller } = setup();
    button('cancel').click();
    world.dungeonFinderBoard = [
      {
        id: 9,
        activityId: 'hollow_crypt_normal',
        leaderName: 'Mira',
        tags: [],
        size: 1,
        capacity: 5,
        needed: null,
        members: [],
        details: { purpose: 'needs_help', note: 'Learning bosses' },
      },
    ] as never;
    controller.render();
    expect(document.querySelector('.expedition-card')?.textContent).toContain('Forming Group');
    expect(document.querySelector('.expedition-card')?.textContent).toContain('Learning bosses');
    expect(document.querySelector('.expedition-card')?.textContent).not.toContain('0/0');
    document.querySelector<HTMLButtonElement>('[data-action="request"]')!.click();
    const role = document.querySelector<HTMLSelectElement>('[data-role]')!;
    role.value = 'dps';
    role.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector<HTMLButtonElement>('[data-action="send"]')!.click();
    expect(world.dungeonFinderExpeditionApply).toHaveBeenCalledExactlyOnceWith(9, 'dps');
  });

  it('releases a composing draft when a delayed authoritative publication arrives', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const { world, controller } = setup();
    button('publish').click();
    vi.setSystemTime(11_001);
    controller.render();
    const input = document.querySelector<HTMLInputElement>('[data-recruit-field="note"]')!;
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    input.value = '探索';
    input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    world.dungeonFinderInfo.myListing = {
      id: 5,
      activityId: 'hollow_crypt_normal',
      tags: [],
      applicants: [],
      details: { purpose: 'clear', note: '' },
    };
    controller.render();
    expect(document.querySelector('.expedition-recruitment')).toBeNull();
    expect(document.querySelector('.expedition-own')?.textContent).toContain('Forming Group');
    controller.relocalize();
    expect(document.querySelector('.expedition-own')).not.toBeNull();
  });
});
