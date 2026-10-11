import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { FocusManager } from '../../src/ui/focus_manager';
import { ExpeditionController } from '../../src/ui/hud/expeditions';
import { makeWriterFacet } from '../../src/ui/painter_host';
import { resolveTheme, themeCssVars } from '../../src/ui/theme';
import { makeWindowFocus } from '../../src/ui/window_focus';
import type { IWorld } from '../../src/world_api';
import { axeSeriousViolations, cleanup, host } from './_harness';

function setup() {
  host('ui', '');
  const opener = document.createElement('button');
  opener.textContent = 'Game control';
  document.body.append(opener);
  opener.focus();
  const world = {
    playerId: 1,
    player: { inCombat: false, level: 8, name: 'Recruiter' },
    partyInfo: null,
    dungeonFinderExpeditionConfigure: vi.fn(),
    dungeonFinderInfo: {
      eligibleRoles: ['dps'],
      myListing: null,
      myApplication: null,
      expedition: {
        exitId: 20,
        activityId: 'hollow_crypt_normal',
        dungeonId: 'hollow_crypt',
        leaderPid: 1,
        isLeader: true,
        isInside: true,
        canTravel: false,
        open: false,
        bossesDefeated: 0,
        bossesTotal: 2,
      },
    },
    dungeonFinderBoard: Array.from({ length: 6 }, (_, n) => ({
      id: n + 1,
      activityId: 'hollow_crypt_normal',
      leaderName: `Leader ${n + 1}`,
      tags: [],
      size: 1,
      capacity: 5,
      needed: null,
      members: [],
      expedition: { bossesDefeated: 0, bossesTotal: 2 },
    })),
  };
  const fm = new FocusManager();
  const openFinder = vi.fn();
  const controller = new ExpeditionController({
    world: () => world as unknown as IWorld,
    writers: makeWriterFacet(
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      () => {},
      () => {},
    ),
    ...makeWindowFocus(fm, () => document.getElementById('expedition-panel')!),
    openFinder,
    openRecruitment: vi.fn(),
  });
  controller.render();
  return { controller, world, opener, openFinder };
}

afterEach(() => {
  cleanup();
  document.body.classList.remove('mobile-touch');
});

describe('expedition bell in a real browser', () => {
  it.each([
    [1280, 800],
    [390, 844],
    [844, 390],
  ])(
    'publishes a compact pre-entry group at %sx%s with accessible controls and preserved focus',
    async (width, height) => {
      await page.viewport(width, height);
      if (width < 1000) document.body.classList.add('mobile-touch');
      const { controller, world } = setup();
      Object.assign(world.dungeonFinderInfo, {
        expedition: null,
        roles: ['dps'],
        queue: null,
        proposal: null,
      });
      controller.render();
      await userEvent.click(document.querySelector('.expedition-tools [data-action="recruit"]')!);
      const panel = document.getElementById('expedition-panel')!;
      expect(panel.contains(document.activeElement)).toBe(true);
      const goal = document.querySelector<HTMLSelectElement>('[data-recruit-field="purpose"]')!;
      goal.value = 'needs_help';
      goal.dispatchEvent(new Event('change', { bubbles: true }));
      const input = document.querySelector<HTMLInputElement>('[data-recruit-field="note"]')!;
      input.focus();
      input.value = 'Learning the bosses';
      input.setSelectionRange(2, 8);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      world.player.inCombat = true;
      controller.render();
      controller.relocalize();
      const restored = document.querySelector<HTMLInputElement>('[data-recruit-field="note"]')!;
      expect(document.activeElement).toBe(restored);
      expect(restored.selectionStart).toBe(2);
      expect(restored.selectionEnd).toBe(8);
      expect(
        document.querySelector<HTMLSelectElement>('[data-recruit-field="purpose"]')!.value,
      ).toBe('needs_help');
      expect(document.querySelector('[data-recruit-preview]')?.textContent).toContain(
        'Learning the bosses',
      );
      for (const control of panel.querySelectorAll<HTMLElement>('input,select,button')) {
        expect(control.getBoundingClientRect().height).toBeGreaterThanOrEqual(40);
        if (width < 1000 && control.matches('input,select'))
          expect(Number.parseFloat(getComputedStyle(control).fontSize)).toBeGreaterThanOrEqual(16);
      }
      const bounds = panel.getBoundingClientRect();
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(innerWidth);
      expect(bounds.bottom).toBeLessThanOrEqual(innerHeight);
      expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth + 1);
      expect(await axeSeriousViolations(panel)).toEqual([]);
      await userEvent.click(document.querySelector('[data-recruit-action="publish"]')!);
      expect(world.dungeonFinderExpeditionConfigure).toHaveBeenCalledExactlyOnceWith({
        kind: 'recruit',
        activityId: 'hollow_crypt_normal',
        role: 'dps',
        details: { purpose: 'needs_help', note: 'Learning the bosses' },
      });
      expect(
        document.querySelector<HTMLButtonElement>('[data-recruit-action="publish"]')!.disabled,
      ).toBe(true);
      Object.assign(world.dungeonFinderInfo, {
        myListing: {
          id: 7,
          activityId: 'hollow_crypt_normal',
          tags: [],
          applicants: [],
          details: { purpose: 'needs_help', note: 'Learning the bosses' },
        },
      });
      controller.render();
      expect(document.querySelector('.expedition-own')?.textContent).toContain(
        'Learning the bosses',
      );
      expect(panel.contains(document.activeElement)).toBe(true);
      await userEvent.keyboard('{Tab}');
      expect(panel.contains(document.activeElement)).toBe(true);
      expect(await axeSeriousViolations(panel)).toEqual([]);
      controller.close();
    },
  );
  it('opens alerts from the bell and Finder from the visible mobile action', async () => {
    await page.viewport(390, 844);
    document.body.classList.add('mobile-touch');
    const { controller, openFinder } = setup();
    await userEvent.click(document.getElementById('expedition-bell')!);
    expect(document.querySelector('.expedition-alerts')).not.toBeNull();
    expect(document.querySelector('.expedition-cards')).toBeNull();
    await vi.waitFor(() =>
      expect(document.getElementById('expedition-panel')?.contains(document.activeElement)).toBe(
        true,
      ),
    );
    expect(
      getComputedStyle(document.querySelector<HTMLElement>('.expedition-run > span')!).display,
    ).not.toBe('none');
    await userEvent.click(
      document.querySelector('#expedition-hud > .expedition-tools [data-action="finder"]')!,
    );
    expect(openFinder).toHaveBeenCalledOnce();
    await userEvent.click(document.getElementById('expedition-bell')!);
    await userEvent.click(document.querySelector('[data-action="show-groups"]')!);
    expect(document.querySelector('.expedition-cards')).not.toBeNull();
    expect(await axeSeriousViolations(document.getElementById('expedition-panel')!)).toEqual([]);
    controller.close();
  });
  it('shows separate pending requests and preserves shop rules during live updates on a phone', async () => {
    await page.viewport(844, 390);
    document.body.classList.add('mobile-touch');
    const { controller, world } = setup();
    Object.assign(world.dungeonFinderInfo, {
      myApplications: [
        { listingId: 2, leaderName: 'Aldric', remaining: 100 },
        { listingId: 3, leaderName: 'Nerea', remaining: 90 },
      ],
    });
    controller.toggle();
    expect(document.querySelectorAll('.expedition-pending')).toHaveLength(2);
    expect(document.querySelector('[data-action="request"][data-listing="4"]')).not.toBeNull();
    document
      .querySelector<HTMLButtonElement>('[data-action="cancel-application"][data-listing="3"]')!
      .click();
    expect(world.dungeonFinderExpeditionConfigure).toHaveBeenCalledWith({
      kind: 'cancel_application',
      listingId: 3,
    });
    await userEvent.click(document.querySelector('[data-action="shop"]')!);
    expect(document.querySelector('.expedition-own,.expedition-other')).toBeNull();
    const summary = document.querySelector<HTMLElement>('[data-shop-rules] summary')!;
    summary.focus();
    await userEvent.keyboard('{Enter}');
    expect(document.querySelector<HTMLDetailsElement>('[data-shop-rules]')!.open).toBe(true);
    world.dungeonFinderBoard[0].size++;
    controller.render();
    expect(document.querySelector<HTMLDetailsElement>('[data-shop-rules]')!.open).toBe(true);
    expect(document.activeElement).toBe(document.querySelector('[data-shop-rules] summary'));
    expect(await axeSeriousViolations(document.getElementById('expedition-panel')!)).toEqual([]);
    controller.close();
  });
  it('keeps request notices readable in Parchment and desktop decisions visible', async () => {
    await page.viewport(1280, 800);
    const { controller, world } = setup();
    const ui = document.getElementById('ui')!;
    for (const [key, value] of Object.entries(
      themeCssVars(resolveTheme({ preset: 'parchment', custom: {} })),
    )) {
      ui.style.setProperty(key, value);
    }
    world.dungeonFinderInfo.expedition.open = true;
    Object.assign(world.dungeonFinderInfo, {
      myListing: {
        id: 1,
        activityId: 'hollow_crypt_normal',
        tags: [],
        details: { purpose: 'first_time', note: 'First clear - help with bosses' },
        applicants: [
          { pid: 9, name: 'Mira', cls: 'priest', level: 8, roles: ['healer'], remaining: 100 },
        ],
      },
    });
    controller.render();
    expect(
      await axeSeriousViolations(document.querySelector<HTMLElement>('[data-expedition-notice]')!),
    ).toEqual([]);
    controller.toggle();
    const accept = document.querySelector<HTMLElement>('.expedition-own [data-action="accept"]')!;
    const panel = document.getElementById('expedition-panel')!;
    expect(accept.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      panel.getBoundingClientRect().bottom,
    );
    expect(await axeSeriousViolations(panel)).toEqual([]);
    controller.close();
  });
  it('keeps controls within enlarged UI and safe-area bounds', async () => {
    await page.viewport(844, 390);
    document.body.classList.add('mobile-touch');
    const { controller } = setup();
    const ui = document.getElementById('ui')!;
    ui.style.setProperty('--ui-scale', '1.25');
    const root = document.getElementById('expedition-hud')!;
    root.style.setProperty('--expedition-safe-left', '44px');
    root.style.setProperty('--expedition-safe-right', '44px');
    root.style.setProperty('--expedition-safe-bottom', '21px');
    controller.toggle();
    const rect = document.getElementById('expedition-panel')!.getBoundingClientRect();
    expect(rect.left).toBeGreaterThanOrEqual(44);
    expect(rect.right).toBeLessThanOrEqual(innerWidth - 44);
    expect(rect.bottom).toBeLessThanOrEqual(innerHeight - 21);
    controller.close();
  });
  it('separates own requests from other groups side by side and stacks them on narrow screens', async () => {
    await page.viewport(1280, 800);
    const { controller, world } = setup();
    world.dungeonFinderInfo.expedition.open = true;
    Object.assign(world.dungeonFinderInfo, {
      myListing: {
        id: 1,
        activityId: 'hollow_crypt_normal',
        tags: [],
        applicants: [
          { pid: 9, name: 'Mira', level: 8, cls: 'priest', roles: ['healer'], remaining: 100 },
        ],
      },
    });
    controller.toggle();
    const own = document.querySelector<HTMLElement>('.expedition-own')!;
    const others = document.querySelector<HTMLElement>('.expedition-other')!;
    expect(own.querySelector('[data-action="accept"]')).not.toBeNull();
    expect(others.querySelector('[data-action="accept"]')).toBeNull();
    expect(others.querySelectorAll('.expedition-card')).toHaveLength(5);
    expect(others.querySelector('[data-listing="1"]')).toBeNull();
    expect(own.getBoundingClientRect().right).toBeLessThan(others.getBoundingClientRect().left);
    expect(own.getBoundingClientRect().top).toBe(others.getBoundingClientRect().top);
    await page.viewport(390, 844);
    document.body.classList.add('mobile-touch');
    await expect
      .poll(() => own.getBoundingClientRect().bottom <= others.getBoundingClientRect().top)
      .toBe(true);
    const panel = document.getElementById('expedition-panel')!.getBoundingClientRect();
    expect(panel.left).toBeGreaterThanOrEqual(0);
    expect(panel.right).toBeLessThanOrEqual(innerWidth);
    expect(await axeSeriousViolations(document.getElementById('expedition-hud')!)).toEqual([]);
    controller.close();
  });
  it('preserves note, goal and caret across a live request countdown and exposes an accessible cosmetic shop', async () => {
    await page.viewport(1280, 800);
    const { controller, world } = setup();
    world.dungeonFinderInfo.expedition.open = true;
    const request = {
      pid: 9,
      name: 'Mira',
      level: 8,
      cls: 'priest',
      roles: ['healer'],
      remaining: 100,
    };
    Object.assign(world.dungeonFinderInfo, {
      myListing: {
        id: 7,
        activityId: 'hollow_crypt_normal',
        tags: [],
        applicants: [request],
        details: { purpose: 'clear', note: '' },
      },
      queueRewards: { balance: 100, unlocked: [], equipped: null, earnedToday: 20, dailyCap: 60 },
    });
    controller.toggle();
    await userEvent.click(document.querySelector('[data-action="edit-details"]')!);
    const input = document.querySelector<HTMLInputElement>('[data-note]')!;
    input.value = 'Help with the last boss';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const goal = document.querySelector<HTMLSelectElement>('[data-purpose]')!;
    goal.value = 'needs_help';
    goal.dispatchEvent(new Event('change', { bubbles: true }));
    input.focus();
    input.setSelectionRange(2, 5);
    request.remaining = 99;
    controller.render();
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(2);
    expect(goal.value).toBe('needs_help');
    expect(document.querySelector('[data-deadline]')?.textContent).toContain('1:39');
    await userEvent.click(document.querySelector('[data-action="save-details"]')!);
    expect(world.dungeonFinderExpeditionConfigure).toHaveBeenCalledWith({
      kind: 'details',
      details: { purpose: 'needs_help', note: 'Help with the last boss' },
    });
    await userEvent.click(document.querySelector('[data-action="shop"]')!);
    expect(
      document.querySelector<HTMLButtonElement>('[data-action="buy-reward"][data-reward="gold"]')
        ?.disabled,
    ).toBe(true);
    expect(await axeSeriousViolations(document.getElementById('expedition-hud')!)).toEqual([]);
    controller.close();
  });
  it('contains the dungeon title and action, centred beside the bell', async () => {
    await page.viewport(1280, 800);
    setup();
    const run = document.querySelector<HTMLElement>('.expedition-run')!;
    const title = run.querySelector('span')!.getBoundingClientRect();
    const button = run.querySelector('button')!.getBoundingClientRect();
    const bounds = run.getBoundingClientRect();
    const bell = document.getElementById('expedition-bell')!.getBoundingClientRect();
    expect(title.top).toBeGreaterThanOrEqual(bounds.top);
    expect(title.bottom).toBeLessThanOrEqual(bounds.bottom);
    expect(button.top).toBeGreaterThanOrEqual(bounds.top);
    expect(button.bottom).toBeLessThanOrEqual(bounds.bottom);
    expect(Math.abs((title.top + title.bottom - button.top - button.bottom) / 2)).toBeLessThan(1);
    expect(Math.abs((bounds.top + bounds.bottom - bell.top - bell.bottom) / 2)).toBeLessThan(1);
  });
  it('announces entry without stealing focus, and suppresses the prompt during combat', () => {
    const { controller, world, opener } = setup();
    expect(document.activeElement).toBe(opener);
    expect(document.querySelector<HTMLElement>('[data-expedition-notice]')!.hidden).toBe(false);
    world.player.inCombat = true;
    controller.render();
    expect(document.activeElement).toBe(opener);
    expect(document.querySelector<HTMLElement>('[data-expedition-notice]')!.hidden).toBe(true);
  });
  it('keeps keyboard navigation in the role form and returns focus to its opener', async () => {
    const { controller, opener } = setup();
    controller.toggle();
    await userEvent.click(document.querySelector('[data-action="request"]')!);
    expect(document.activeElement).toBe(document.querySelector('[data-role]'));
    await userEvent.keyboard('{Tab}');
    expect(document.getElementById('expedition-panel')!.contains(document.activeElement)).toBe(
      true,
    );
    controller.close();
    await expect.poll(() => document.activeElement).toBe(opener);
  });
  it('keeps a horizontal tray inside the phone viewport, with touch targets and labelled controls', async () => {
    await page.viewport(844, 390);
    document.body.classList.add('mobile-touch');
    const { controller } = setup();
    controller.toggle();
    const root = document.getElementById('expedition-hud')!;
    const panel = document.getElementById('expedition-panel')!;
    const rect = panel.getBoundingClientRect();
    expect(rect.left).toBeGreaterThanOrEqual(0);
    expect(rect.right).toBeLessThanOrEqual(innerWidth);
    expect(rect.bottom).toBeLessThanOrEqual(innerHeight);
    const tray = panel.querySelector<HTMLElement>('.expedition-cards')!;
    expect(tray.scrollWidth).toBeGreaterThan(tray.clientWidth);
    for (const button of root.querySelectorAll<HTMLButtonElement>('button')) {
      if (button.getClientRects().length)
        expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(40);
    }
    expect(await axeSeriousViolations(root)).toEqual([]);
    controller.close();
  });
});
