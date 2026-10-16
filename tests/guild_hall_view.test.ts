// Lantern Hall's guild window: the pure view core (src/ui/hud/guild_hall/guild_hall_view.ts),
// the painter over jsdom (guild_hall_window.ts), the event routing
// (hud/quest/quest_event_router.ts) and the online mirror's decode (net/guild_hall_wire_state.ts).
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { decodeGuildContractsWire } from '../src/net/guild_hall_wire_state';
import {
  GUILD_QUARTERMASTER_STOCK,
  LANTERN_SEAL_ITEM_ID,
} from '../src/sim/content/guild_contracts';
import { type GuildContractsView, guildContractsForWeek } from '../src/sim/guild_contracts';
import type { SimEvent } from '../src/sim/types';
import {
  buildGuildHallView,
  GuildHallWindow,
  guildResetText,
  lanternSeals,
} from '../src/ui/hud/guild_hall';
import { guildContractToast } from '../src/ui/hud/guild_hall/guild_hall_toasts';
import { applyQuestEventPresentation } from '../src/ui/hud/quest/quest_event_router';

const WEEK = 'wk_6';

function board(done: string[] = []): GuildContractsView {
  return {
    week: WEEK,
    offered: guildContractsForWeek(WEEK).map((c) => c.id),
    done,
    lifetime: done.length,
  };
}

function world(
  seals: number,
  owned: string[] = [],
  done: string[] = [],
  mounts: string[] = [],
  skins: string[] = [],
) {
  return {
    guildContracts: board(done),
    inventory: seals > 0 ? [{ itemId: LANTERN_SEAL_ITEM_ID, count: seals }] : [],
    deedsEarned: new Map(owned.map((id) => [id, '2026-10-16'])),
    ownedMounts: () => mounts,
    accountCosmetics: { weaponSkinIds: skins },
    weeklyQuestResetAtMs: Date.UTC(2026, 9, 20),
    player: { name: 'Wanderer' },
    buyGuildCosmetic: vi.fn(),
  };
}

describe('the guild window view core', () => {
  it("shapes the week's three cards, the done one marked, in English through t()", () => {
    const offered = board().offered;
    const view = buildGuildHallView(world(0, [], [offered[1]]), Date.UTC(2026, 9, 16), 'contracts');
    expect(view.title).toBe('Lantern Hall');
    expect(view.contracts.map((c) => c.kind)).toEqual(['boss', 'heroic', 'task']);
    expect(view.contracts.map((c) => c.done)).toEqual([false, true, false]);
    expect(view.contracts[0].kindLabel).toBe('Bounty');
    expect(view.contracts[1].goal).toMatch(/on Heroic/);
    // a task card carries its Book of Deeds condition as a sentence of its own
    expect(view.contracts[2].goal).toMatch(/^.+ \(.+\)$/);
    expect(view.contracts[2].detail.length).toBeGreaterThan(0);
    expect(view.contracts[0].detail).toBe('');
    expect(view.contracts[0].reward).toBe('1 Lantern Seal');
    expect(view.contracts[1].reward).toBe('3 Lantern Seals');
    expect(view.lifetimeText).toBe('Contracts completed: 1');
    expect(view.emptyText).toBeNull();
    expect(view.tabs.map((t) => [t.id, t.selected])).toEqual([
      ['contracts', true],
      ['quartermaster', false],
    ]);
    // an empty board says so instead of drawing no cards
    const empty = buildGuildHallView(
      { ...world(0), guildContracts: { week: '', offered: [], done: [], lifetime: 0 } },
      0,
      'contracts',
    );
    expect(empty.contracts).toEqual([]);
    expect(empty.emptyText).toMatch(/weekly reset/);
  });

  it("prices the quartermaster's titles against the seals in the bags, owned ones marked", () => {
    const [first, second] = GUILD_QUARTERMASTER_STOCK;
    if (first.kind !== 'title') throw new Error('the first offer is a title');
    const view = buildGuildHallView(world(first.seals + 1, [first.deedId]), 0, 'quartermaster');
    expect(view.seals).toBe(first.seals + 1);
    expect(view.sealsText).toBe(`Lantern Seals: ${first.seals + 1}`);
    expect(view.offers[0]).toMatchObject({ owned: true, action: 'Owned' });
    expect(view.offers[1].owned).toBe(false);
    expect(view.offers[1].affordable).toBe(first.seals + 1 >= second.seals);
    expect(view.offers[1].action).toBe(`Needs ${second.seals - first.seals - 1} more`);
    expect(view.offers[0].title).toBe('Title: Writ-Runner');
    expect(view.offers[0].preview).toContain('Wanderer');
    expect(view.intro).toMatch(/Nothing here makes you stronger/);
  });

  it('shows the war horse and the sword with their art, speed and owned state', () => {
    const horse = GUILD_QUARTERMASTER_STOCK.find((o) => o.id === 'mount_lantern_hall_destrier');
    const sword = GUILD_QUARTERMASTER_STOCK.find((o) => o.id === 'weapon_skin_lantern_hall_sword');
    if (!horse || !sword) throw new Error('the guild stocks its horse and sword');
    const row = (v: ReturnType<typeof buildGuildHallView>, id: string) => {
      const found = v.offers.find((o) => o.id === id);
      if (!found) throw new Error(`no row ${id}`);
      return found;
    };
    const poor = buildGuildHallView(world(sword.seals), 0, 'quartermaster');
    expect(row(poor, horse.id)).toMatchObject({
      kind: 'mount',
      icon: '/ui/items/reins_lantern_hall_destrier.webp',
      title: 'Mount: Lantern Hall Destrier',
      preview: 'Ground mount: +70% movement speed while riding. Requires riding training.',
      price: '40 Lantern Seals',
      owned: false,
      affordable: false,
      action: `Needs ${horse.seals - sword.seals} more`,
    });
    expect(row(poor, sword.id)).toMatchObject({
      kind: 'weaponSkin',
      icon: '/ui/store/armory/lantern_hall_sword.webp',
      title: 'Sword appearance: Blade of Lantern Hall',
      price: '20 Lantern Seals',
      owned: false,
      affordable: true,
      action: 'Buy',
    });
    expect(row(poor, sword.id).preview).toMatch(/Appearance only: no stats\.$/);
    // owned reads the held mount and the account's skin ledger, not the Book of Deeds
    const rich = buildGuildHallView(
      world(99, [], [], ['lantern_hall_destrier'], ['lantern_hall_sword']),
      0,
      'quartermaster',
    );
    expect(row(rich, horse.id)).toMatchObject({ owned: true, action: 'Owned' });
    expect(row(rich, sword.id)).toMatchObject({ owned: true, action: 'Owned' });
    // titles carry no art
    expect(row(rich, 'title_writ_runner').icon).toBeNull();
  });

  it('counts seals across stacks and reads the reset in days and hours', () => {
    expect(
      lanternSeals([
        { itemId: LANTERN_SEAL_ITEM_ID, count: 3 },
        { itemId: 'heroic_mark', count: 9 },
        { itemId: LANTERN_SEAL_ITEM_ID, count: 4 },
      ]),
    ).toBe(7);
    const now = Date.UTC(2026, 9, 16, 0, 0);
    expect(guildResetText(now + (2 * 86_400 + 5 * 3_600) * 1000, now)).toBe(
      'New contracts in 2 days and 5 hours',
    );
    expect(guildResetText(0, now)).toBe('New contracts at the next weekly reset');
    expect(guildContractToast(board().offered[1], 3)).toMatch(
      /^Contract complete: Heroic Clear: .+ You receive 3 Lantern Seals\.$/,
    );
  });
});

describe('the guild window painter', () => {
  function mount(w: ReturnType<typeof world>) {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const win = new GuildHallWindow({
      root: () => root,
      world: () => w as never,
      closeOthers: () => {},
      captureFocus: () => null,
      restoreFocus: () => {},
    });
    return { root, win };
  }

  it('opens on a tab, switches tabs, sends a purchase, and closes', () => {
    const w = world(GUILD_QUARTERMASTER_STOCK[0].seals);
    const { root, win } = mount(w);
    win.open('quartermaster');
    expect(win.isOpen).toBe(true);
    // the horse and the sword draw their art; a title draws none
    expect(root.querySelectorAll('.gh-offer-icon').length).toBe(2);
    expect(
      root.querySelector('[data-gh-offer="mount_lantern_hall_destrier"] .gh-offer-icon'),
    ).not.toBeNull();
    expect(root.style.display).toBe('flex');
    expect(root.querySelectorAll('[data-gh-offer]').length).toBe(GUILD_QUARTERMASTER_STOCK.length);
    const buy = root.querySelector<HTMLButtonElement>(
      `[data-gh-buy="${GUILD_QUARTERMASTER_STOCK[0].id}"]`,
    );
    expect(buy?.disabled).toBe(false);
    buy?.click();
    expect(w.buyGuildCosmetic).toHaveBeenCalledWith(GUILD_QUARTERMASTER_STOCK[0].id);
    // a title it cannot afford is a disabled button
    const dear = root.querySelector<HTMLButtonElement>(
      `[data-gh-buy="${GUILD_QUARTERMASTER_STOCK[2].id}"]`,
    );
    expect(dear?.disabled).toBe(true);
    root.querySelector<HTMLButtonElement>('[data-gh-tab="contracts"]')?.click();
    expect(root.querySelectorAll('[data-gh-card]').length).toBe(3);
    root.querySelector<HTMLButtonElement>('[data-close]')?.click();
    expect(win.isOpen).toBe(false);
    expect(root.style.display).toBe('none');
  });

  it('is a keyboard tablist: roving tabindex, arrows switch, focus follows, a tabpanel below', () => {
    const { root, win } = mount(world(0));
    win.open('contracts');
    const tab = (id: string) => root.querySelector<HTMLButtonElement>(`[data-gh-tab="${id}"]`);
    expect(root.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe(
      'Lantern Hall sections',
    );
    expect(tab('contracts')?.tabIndex).toBe(0);
    expect(tab('quartermaster')?.tabIndex).toBe(-1);
    expect(tab('contracts')?.getAttribute('aria-controls')).toBe('guild-hall-panel');
    expect(root.querySelector('[id="guild-hall-panel"]')?.getAttribute('role')).toBe('tabpanel');
    tab('contracts')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(tab('quartermaster')?.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab('quartermaster'));
    expect(root.querySelectorAll('[data-gh-offer]').length).toBe(GUILD_QUARTERMASTER_STOCK.length);
    tab('quartermaster')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
    expect(document.activeElement).toBe(tab('contracts'));
  });

  it('repaints when a horse or sword becomes owned', () => {
    const owned: string[] = [];
    const w = { ...world(99), ownedMounts: () => owned };
    const { root, win } = mount(w as ReturnType<typeof world>);
    win.open('quartermaster');
    root.querySelector('.gh-offers')?.setAttribute('data-probe', '1');
    win.refreshIfChanged();
    expect(root.querySelector('.gh-offers')?.getAttribute('data-probe')).toBe('1');
    owned.push('lantern_hall_destrier');
    win.refreshIfChanged();
    expect(root.querySelector('.gh-offers')?.getAttribute('data-probe')).toBeNull();
    expect(
      root.querySelector<HTMLButtonElement>('[data-gh-buy="mount_lantern_hall_destrier"]')
        ?.disabled,
    ).toBe(true);
  });

  it('repaints only when its signature moves', () => {
    const w = world(0);
    const { root, win } = mount(w);
    win.open('contracts');
    win.refreshIfChanged();
    const painted = root.innerHTML;
    root.querySelector('.gh-cards')?.setAttribute('data-probe', '1');
    win.refreshIfChanged();
    expect(root.querySelector('.gh-cards')?.getAttribute('data-probe')).toBe('1');
    w.guildContracts = board([board().offered[0]]);
    win.refreshIfChanged();
    expect(root.querySelector('.gh-cards')?.getAttribute('data-probe')).toBeNull();
    expect(root.innerHTML).not.toBe(painted);
  });
});

describe("routing the guild's events", () => {
  function host() {
    return {
      log: vi.fn(),
      questBanner: { show: vi.fn() },
      showBanner: vi.fn(),
      questDialog: { refresh: vi.fn(), open: vi.fn() },
      weeklyQuestsWindow: { open: vi.fn() },
      guildHallWindow: { open: vi.fn(), refreshIfChanged: vi.fn() },
      dungeonFinderWindow: { open: vi.fn() },
      showError: vi.fn(),
      worldQuestPuzzleWindow: { applyEventPresentation: vi.fn() },
      treasureMapWindow: { open: vi.fn(), refresh: vi.fn() },
    };
  }

  it('opens the window on the tab, the finder for the recruiter, and logs payments and refusals', () => {
    const h = host();
    const send = (ev: Record<string, unknown>) =>
      applyQuestEventPresentation(h, ev as unknown as SimEvent);
    expect(send({ type: 'guildHallOpen', tab: 'quartermaster' })).toBe(true);
    expect(h.guildHallWindow.open).toHaveBeenCalledWith('quartermaster');
    expect(send({ type: 'guildRecruiterOpen' })).toBe(true);
    expect(h.dungeonFinderWindow.open).toHaveBeenCalled();
    expect(send({ type: 'guildContractDone', contractId: board().offered[0], seals: 1 })).toBe(
      true,
    );
    expect(h.log.mock.calls[0][0]).toMatch(/You receive 1 Lantern Seal\./);
    expect(send({ type: 'guildCosmeticBought', offerId: GUILD_QUARTERMASTER_STOCK[0].id })).toBe(
      true,
    );
    expect(h.log.mock.calls[1][0]).toMatch(/Writ-Runner/);
    send({ type: 'guildCosmeticBought', offerId: 'mount_lantern_hall_destrier' });
    expect(h.log.mock.calls[2][0]).toBe(
      'You bought the Lantern Hall Destrier. Its reins are in your bags.',
    );
    send({ type: 'guildCosmeticBought', offerId: 'weapon_skin_lantern_hall_sword' });
    expect(h.log.mock.calls[3][0]).toBe(
      'You bought the Blade of Lantern Hall appearance. Apply it from the Cosmetics window.',
    );
    // every refusal reason resolves to its own English line, never a raw key
    for (const [reason, line] of [
      ['seals', 'You do not have enough Lantern Seals.'],
      ['owned', 'You already own that.'],
      ['range', 'Stand at the quartermaster to trade.'],
      ['riding', 'Learn to ride before you buy a mount.'],
      ['bags', 'Your bags are full.'],
    ]) {
      expect(send({ type: 'guildCosmeticRefused', offerId: 'x', reason })).toBe(true);
      expect(h.showError).toHaveBeenLastCalledWith(line);
    }
    // an offer this client does not know logs nothing
    const logged = h.log.mock.calls.length;
    expect(send({ type: 'guildCosmeticBought', offerId: 'phantom' })).toBe(true);
    expect(h.log.mock.calls.length).toBe(logged);
  });
});

describe('the online mirror', () => {
  it('decodes the gcon key, dropping ids the catalog does not know', () => {
    const offered = board().offered;
    expect(
      decodeGuildContractsWire({
        week: WEEK,
        offered: [...offered, 'phantom'],
        done: [offered[0], 7],
        lifetime: 4.6,
      }),
    ).toEqual({ week: WEEK, offered, done: [offered[0]], lifetime: 4 });
    expect(decodeGuildContractsWire(null)).toEqual({
      week: '',
      offered: [],
      done: [],
      lifetime: 0,
    });
    expect(decodeGuildContractsWire([1, 2])).toEqual({
      week: '',
      offered: [],
      done: [],
      lifetime: 0,
    });
  });
});
