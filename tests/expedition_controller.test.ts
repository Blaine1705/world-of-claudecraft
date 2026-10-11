// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExpeditionController } from '../src/ui/hud/expeditions';
import { makeWriterFacet } from '../src/ui/painter_host';
import type { IWorld } from '../src/world_api';

function setup() {
  const world = {
    playerId: 1,
    player: { inCombat: false, level: 8, name: 'Recruiter' },
    partyInfo: null,
    dungeonFinderInfo: {
      roles: ['tank'],
      eligibleRoles: ['tank', 'dps'],
      cooldown: 0,
      queue: null,
      proposal: null,
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
        bossesTotal: 4,
      },
    },
    dungeonFinderBoard: [
      {
        id: 3,
        activityId: 'hollow_crypt_normal',
        leaderName: '<img src=x onerror=alert(1)>',
        tags: [],
        size: 1,
        capacity: 5,
        needed: { tank: 0, healer: 1, dps: 3 },
        members: [],
        expedition: { bossesDefeated: 1, bossesTotal: 4 },
      },
    ],
    dungeonFinderExpeditionOpen: vi.fn(),
    dungeonFinderExpeditionTravel: vi.fn(),
    dungeonFinderExpeditionApply: vi.fn(),
    dungeonFinderApplyCancel: vi.fn(),
    dungeonFinderApplicationRespond: vi.fn(),
    dungeonFinderListingClose: vi.fn(),
    dungeonFinderExpeditionConfigure: vi.fn(),
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
    notify: vi.fn(),
  };
  const controller = new ExpeditionController(deps);
  controller.render();
  return { controller, world, deps };
}
const click = (action: string) =>
  document.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.click();

describe('expedition bell controller', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="ui"></div>';
    localStorage.clear();
  });
  it('shows simultaneous requests and cancels only the chosen listing', () => {
    const { world, controller } = setup();
    Object.assign(world.dungeonFinderInfo, {
      myApplications: [
        { listingId: 3, leaderName: 'Mira', remaining: 100 },
        { listingId: 4, leaderName: 'Aldric', remaining: 90 },
      ],
    });
    controller.toggle();
    expect(document.querySelectorAll('.expedition-pending')).toHaveLength(2);
    document
      .querySelector<HTMLButtonElement>('[data-action="cancel-application"][data-listing="4"]')!
      .click();
    expect(world.dungeonFinderExpeditionConfigure).toHaveBeenCalledWith({
      kind: 'cancel_application',
      listingId: 4,
    });
    expect(world.dungeonFinderApplyCancel).not.toHaveBeenCalled();
  });
  it('keeps waiting and cancellation available when the pending group is outside the capped board', () => {
    const { world, controller } = setup();
    Object.assign(world.dungeonFinderInfo, {
      myApplication: { listingId: 99, remaining: 90, leaderName: 'Mira' },
    });
    controller.toggle();
    expect(document.querySelector('.expedition-pending')?.textContent).toContain('Mira');
    click('cancel-application');
    expect(world.dungeonFinderExpeditionConfigure).toHaveBeenCalledWith({
      kind: 'cancel_application',
      listingId: 99,
    });
  });
  it('updates deadline text without replacing focused controls or sounding on every tick', () => {
    const { world, controller, deps } = setup();
    controller.toggle();
    const sound = document.querySelector<HTMLInputElement>('[data-sound]')!;
    sound.checked = true;
    sound.dispatchEvent(new Event('change', { bubbles: true }));
    world.dungeonFinderInfo.expedition.open = true;
    const request = {
      pid: 7,
      name: 'Mira',
      level: 8,
      cls: 'priest',
      roles: ['healer'],
      remaining: 95,
    };
    Object.assign(world.dungeonFinderInfo, {
      myListing: { id: 5, activityId: 'hollow_crypt_normal', tags: [], applicants: [request] },
    });
    world.player.inCombat = true;
    controller.render();
    expect(deps.notify).not.toHaveBeenCalled();
    world.player.inCombat = false;
    controller.render();
    expect(deps.notify).toHaveBeenCalledOnce();
    const accept = document.querySelector<HTMLButtonElement>('[data-action="accept"]')!;
    accept.focus();
    request.remaining = 94;
    controller.render();
    expect(document.querySelector('[data-action="accept"]')).toBe(accept);
    expect(document.activeElement).toBe(accept);
    expect(document.querySelector('[data-deadline]')?.textContent).toContain('1:34');
    expect(deps.notify).toHaveBeenCalledOnce();
    request.remaining = 0;
    controller.render();
    expect(document.querySelector('[data-action="accept"]')).toBeNull();
    expect(document.querySelector('[data-badge]')?.getAttribute('style')).toContain('none');
  });
  it('counts actionable requests in the bell and keeps their deadlines in Alerts', () => {
    const { world, controller } = setup();
    world.dungeonFinderInfo.expedition.open = true;
    Object.assign(world.dungeonFinderInfo, {
      myListing: {
        id: 5,
        activityId: 'hollow_crypt_normal',
        tags: [],
        applicants: [
          { pid: 7, name: 'Mira', level: 8, cls: 'priest', roles: ['healer'], remaining: 95 },
        ],
      },
    });
    controller.toggle();
    expect(document.querySelector('.expedition-counts')?.textContent).toContain('Open groups: 1');
    expect(document.querySelector('.expedition-own')?.textContent).toContain('Expires in 1:35');
    expect(document.querySelector('[data-badge]')?.textContent).toBe('1');
    document.getElementById('expedition-bell')!.click();
    expect(document.querySelector('.expedition-alerts')?.textContent).toContain(
      'Mira wants to join as Healer',
    );
    expect(document.querySelector('.expedition-alerts')?.textContent).toContain('Expires in 1:35');
    expect(document.querySelector('.expedition-alerts [data-action="accept"]')).not.toBeNull();
  });
  it('opens alerts from the bell, Finder from the visible action, and rewards only on their tab', () => {
    const { controller, deps } = setup();
    document.getElementById('expedition-bell')!.click();
    expect(document.querySelector('.expedition-alerts')).not.toBeNull();
    expect(document.querySelector('.expedition-cards')).toBeNull();
    expect(document.querySelector('[data-badge]')?.getAttribute('style')).toContain('none');
    click('finder');
    expect(deps.openFinder).toHaveBeenCalledOnce();
    document.getElementById('expedition-bell')!.click();
    click('show-groups');
    expect(document.querySelector('.expedition-cards')).not.toBeNull();
    expect(document.querySelector('.expedition-shop')).toBeNull();
    click('shop');
    expect(document.querySelector('.expedition-shop')).not.toBeNull();
    expect(document.querySelector('.expedition-cards')).toBeNull();
    controller.close();
  });
  it('shows the next step and confirms a role request before showing sent feedback', () => {
    const { world, controller } = setup();
    world.dungeonFinderInfo.expedition = null as never;
    controller.render();
    controller.toggle();
    expect(document.querySelector('.expedition-next')?.textContent).toContain('Find one');
    click('request');
    expect(document.querySelector('[data-action="send"]')?.textContent).toContain(
      'Confirm Request',
    );
    click('send');
    expect(world.dungeonFinderExpeditionApply).toHaveBeenCalledWith(3, 'tank');
    expect(document.querySelector('.expedition-next')?.textContent).toContain('Request sent');
    Object.assign(world.dungeonFinderInfo, {
      myApplications: [{ listingId: 3, leaderName: 'Ana', remaining: 60 }],
    });
    controller.render();
    expect(document.querySelector('.expedition-next')?.textContent).toContain(
      'Waiting for replies',
    );
  });
  it('sends independent accept and decline decisions to the correct applicant', () => {
    const { world } = setup();
    world.dungeonFinderInfo.expedition.open = true;
    Object.assign(world.dungeonFinderInfo, {
      myListing: {
        id: 5,
        activityId: 'hollow_crypt_normal',
        tags: [],
        applicants: [
          { pid: 7, name: 'Mira', level: 8, cls: 'priest', roles: ['healer'], remaining: 95 },
          { pid: 8, name: 'Ana', level: 8, cls: 'warrior', roles: ['tank'], remaining: 55 },
        ],
      },
    });
    document.getElementById('expedition-bell')!.click();
    document
      .querySelector<HTMLButtonElement>('.expedition-alerts [data-action="accept"][data-pid="7"]')!
      .click();
    document
      .querySelector<HTMLButtonElement>('.expedition-alerts [data-action="decline"][data-pid="8"]')!
      .click();
    expect(world.dungeonFinderApplicationRespond).toHaveBeenNthCalledWith(1, 7, true);
    expect(world.dungeonFinderApplicationRespond).toHaveBeenNthCalledWith(2, 8, false);
  });
  it('opens pre-entry recruitment and shows its applicants in the bell before entering a dungeon', () => {
    const { world, controller, deps } = setup();
    world.dungeonFinderInfo.expedition = null as never;
    controller.render();
    click('recruit');
    expect(document.querySelector('.expedition-recruitment')).not.toBeNull();
    expect(deps.openRecruitment).not.toHaveBeenCalled();
    expect(world.dungeonFinderExpeditionOpen).not.toHaveBeenCalled();
    Object.assign(world.dungeonFinderInfo, {
      myListing: {
        id: 5,
        activityId: 'hollow_crypt_normal',
        tags: [],
        applicants: [{ pid: 7, name: 'Mira', level: 8, cls: 'priest', roles: ['healer'] }],
      },
    });
    controller.render();
    document.getElementById('expedition-bell')!.click();
    expect(document.querySelector('[data-badge]')?.textContent).toBe('1');
    expect(document.querySelector('.expedition-alerts')?.textContent).toContain('Mira');
    expect(document.querySelector('.expedition-next')?.textContent).toContain('dungeon entrance');
    click('show-groups');
    expect(document.querySelector('.expedition-own')?.textContent).toContain('Forming Group');
    expect(document.querySelector('.expedition-own')?.textContent).toContain('1/5 players');
    expect(document.querySelector('[data-action="travel"]')).toBeNull();
    click('accept');
    expect(world.dungeonFinderApplicationRespond).toHaveBeenCalledWith(7, true);
    click('close-run');
    expect(world.dungeonFinderListingClose).toHaveBeenCalledOnce();
  });
  it('does not offer recruitment or invent a dungeon entrance for a non-leader in an unlisted party', () => {
    const { world, controller } = setup();
    world.dungeonFinderInfo.expedition = null as never;
    Object.assign(world, {
      partyInfo: {
        leader: 9,
        members: [{ pid: 9, name: 'Ana', cls: 'warrior', level: 8 }],
        raid: false,
      },
    });
    controller.toggle();
    expect(document.querySelector('.expedition-next')?.textContent).toContain('group leader');
    expect(document.querySelector('.expedition-next')?.textContent).not.toContain('entrance');
    expect(document.querySelector('.expedition-own [data-action="recruit"]')).toBeNull();
    expect(
      document.querySelector('.expedition-tools [data-action="recruit"]')?.getAttribute('style'),
    ).toContain('none');
  });
  it('preserves a typed note and its selected goal through countdown and language repaint', () => {
    const { world, controller } = setup();
    world.dungeonFinderInfo.expedition.open = true;
    Object.assign(world.dungeonFinderInfo, {
      myListing: {
        id: 5,
        activityId: 'hollow_crypt_normal',
        tags: [],
        details: { purpose: 'clear', note: '' },
        applicants: [],
      },
    });
    controller.toggle();
    click('edit-details');
    const note = document.querySelector<HTMLInputElement>('[data-note]')!;
    note.value = 'Please help with the last boss';
    note.dispatchEvent(new Event('input', { bubbles: true }));
    note.focus();
    note.setSelectionRange(3, 8);
    const goal = document.querySelector<HTMLSelectElement>('[data-purpose]')!;
    goal.value = 'needs_help';
    goal.dispatchEvent(new Event('change', { bubbles: true }));
    world.dungeonFinderBoard[0].expedition.bossesDefeated++;
    controller.render();
    controller.relocalize();
    expect(document.querySelector<HTMLInputElement>('[data-note]')?.value).toBe(
      'Please help with the last boss',
    );
    expect(document.querySelector<HTMLSelectElement>('[data-purpose]')?.value).toBe('needs_help');
    expect(document.querySelector<HTMLInputElement>('[data-note]')?.selectionStart).toBe(3);
    click('save-details');
    expect(world.dungeonFinderExpeditionConfigure).toHaveBeenCalledWith({
      kind: 'details',
      details: { purpose: 'needs_help', note: 'Please help with the last boss' },
    });
  });
  it('shows expiry feedback outside the panel until dismissed and suppresses it during combat', () => {
    const { world, controller } = setup();
    click('solo');
    Object.assign(world.dungeonFinderInfo, {
      applicationFeedback: { seq: 1, outcome: 'expired', leaderName: 'Leader' },
    });
    controller.render();
    expect(document.querySelector('[data-expedition-notice]')?.textContent).toContain(
      'Your request expired',
    );
    world.player.inCombat = true;
    controller.render();
    expect(document.querySelector<HTMLElement>('[data-expedition-notice]')?.hidden).toBe(true);
    world.player.inCombat = false;
    controller.render();
    click('dismiss-feedback');
    expect(document.querySelector<HTMLElement>('[data-expedition-notice]')?.hidden).toBe(true);
  });
  it('chooses helper roles explicitly and purchases only through the authoritative world seam', () => {
    const { world, controller } = setup();
    Object.assign(world.dungeonFinderInfo, {
      queueRewards: { balance: 100, unlocked: [], equipped: null, earnedToday: 0, dailyCap: 60 },
    });
    controller.toggle();
    const role = document.querySelector<HTMLInputElement>('[data-helper-role][value="dps"]')!;
    role.checked = true;
    role.dispatchEvent(new Event('change', { bubbles: true }));
    click('available');
    expect(world.dungeonFinderExpeditionConfigure).toHaveBeenCalledWith({
      kind: 'available',
      enabled: true,
      roles: ['tank', 'dps'],
    });
    click('shop');
    document
      .querySelector<HTMLButtonElement>('[data-action="buy-reward"][data-reward="silver"]')!
      .click();
    expect(world.dungeonFinderExpeditionConfigure).toHaveBeenCalledWith({
      kind: 'reward',
      id: 'silver',
      buy: true,
    });
    expect(
      document.querySelector<HTMLButtonElement>('[data-action="buy-reward"][data-reward="gold"]')
        ?.disabled,
    ).toBe(true);
  });
  it('lets a solo player dismiss the prompt and open the run later without leaving', () => {
    const { world, controller } = setup();
    click('solo');
    expect(document.querySelector<HTMLElement>('[data-expedition-notice]')!.hidden).toBe(true);
    click('open');
    expect(world.dungeonFinderExpeditionOpen).toHaveBeenCalledOnce();
    controller.render();
    expect(world.dungeonFinderExpeditionOpen).toHaveBeenCalledOnce();
  });
  it('sends the selected single compatible role and listing, and escapes player names', () => {
    const { world, controller } = setup();
    controller.toggle();
    expect(document.querySelector('#expedition-panel img[src="x"]')).toBeNull();
    expect(document.querySelector('#expedition-panel [onerror]')).toBeNull();
    click('request');
    document.querySelector<HTMLSelectElement>('[data-role]')!.value = 'dps';
    click('send');
    expect(world.dungeonFinderExpeditionApply).toHaveBeenCalledWith(3, 'dps');
  });
  it('performs no queries or DOM mutations on unchanged medium-HUD polls', () => {
    const { controller } = setup();
    controller.toggle();
    const panel = document.getElementById('expedition-panel')!;
    const query = vi.spyOn(panel, 'querySelector');
    const observer = new MutationObserver(() => {});
    observer.observe(document.getElementById('expedition-hud')!, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    for (let n = 0; n < 20; n++) controller.render();
    expect(query).not.toHaveBeenCalled();
    expect(observer.takeRecords()).toEqual([]);
    observer.disconnect();
  });
  it('returns focus through the shared bridge when dismissed', () => {
    const { controller, deps } = setup();
    controller.toggle();
    expect(controller.close()).toBe(true);
    expect(deps.restoreFocus).toHaveBeenCalledWith(document.getElementById('expedition-bell'));
    expect(controller.close()).toBe(false);
  });
  it('retains role-selector focus and horizontal scroll when progress updates', () => {
    const { world, controller } = setup();
    controller.toggle();
    click('request');
    const cards = document.querySelector('.expedition-cards')!;
    cards.scrollLeft = 120;
    const select = document.querySelector<HTMLSelectElement>('[data-role]')!;
    select.value = 'dps';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    select.focus();
    world.dungeonFinderBoard[0].expedition.bossesDefeated++;
    controller.render();
    expect(document.activeElement).toBe(document.querySelector('[data-role]'));
    expect(document.querySelector<HTMLSelectElement>('[data-role]')!.value).toBe('dps');
    expect(document.querySelector('.expedition-cards')!.scrollLeft).toBe(120);
  });
  it('keeps reward rules expanded and focused across a live board update', () => {
    const { world, controller } = setup();
    controller.toggle();
    click('shop');
    document.querySelector<HTMLDetailsElement>('[data-shop-rules]')!.open = true;
    document.querySelector<HTMLElement>('[data-shop-rules] summary')!.focus();
    world.dungeonFinderBoard[0].expedition.bossesDefeated++;
    controller.render();
    expect(document.querySelector<HTMLDetailsElement>('[data-shop-rules]')!.open).toBe(true);
    expect(document.activeElement).toBe(document.querySelector('[data-shop-rules] summary'));
  });
  it('requires explicit travel after acceptance and disables unsafe travel', () => {
    const { world, controller } = setup();
    world.dungeonFinderInfo.expedition.isLeader = false;
    world.dungeonFinderInfo.expedition.isInside = false;
    controller.render();
    click('travel');
    expect(world.dungeonFinderExpeditionTravel).not.toHaveBeenCalled();
    world.dungeonFinderInfo.expedition.canTravel = true;
    controller.render();
    expect(world.dungeonFinderExpeditionTravel).not.toHaveBeenCalled();
    click('travel');
    expect(world.dungeonFinderExpeditionTravel).toHaveBeenCalledOnce();
  });
  it('replaces the previous HUD owner without duplicate bells or stale-world commands', () => {
    const previous = setup();
    previous.controller.toggle();
    const current = setup();
    expect(document.querySelectorAll('#expedition-bell')).toHaveLength(1);
    click('open');
    expect(previous.world.dungeonFinderExpeditionOpen).not.toHaveBeenCalled();
    expect(current.world.dungeonFinderExpeditionOpen).toHaveBeenCalledOnce();
    previous.controller.render();
    expect(document.querySelectorAll('#expedition-bell')).toHaveLength(1);
  });
  it('resets the private-entry choice when a recycled HUD switches worlds', () => {
    const { controller, world, deps } = setup();
    click('solo');
    expect(document.querySelector<HTMLElement>('[data-expedition-notice]')!.hidden).toBe(true);
    const nextWorld = { ...world };
    deps.world = () => nextWorld as unknown as IWorld;
    controller.render();
    expect(document.querySelector<HTMLElement>('[data-expedition-notice]')!.hidden).toBe(false);
  });
});
