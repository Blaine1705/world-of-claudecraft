// Lantern Hall's guild window: the pure view core (src/ui/hud/guild_hall/guild_hall_view.ts),
// the painter over jsdom (guild_hall_window.ts), the event routing
// (hud/quest/quest_event_router.ts) and the online mirror's decode (net/guild_hall_wire_state.ts).
// @vitest-environment jsdom
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { decodeGuildContractsWire } from '../src/net/guild_hall_wire_state';
import {
  GUILD_CONTRACTS,
  GUILD_QUARTERMASTER_STOCK,
  LANTERN_SEAL_ITEM_ID,
} from '../src/sim/content/guild_contracts';
import { type GuildContractsView, guildContractsForWeek } from '../src/sim/guild_contracts';
import type { SimEvent } from '../src/sim/types';
import {
  buildGuildHallView,
  buildGuildShopView,
  defaultGuildShopSelection,
  GuildHallWindow,
  guildResetText,
  guildShopTooltip,
  lanternSeals,
} from '../src/ui/hud/guild_hall';
import { guildContractToast } from '../src/ui/hud/guild_hall/guild_hall_toasts';
import { applyQuestEventPresentation } from '../src/ui/hud/quest/quest_event_router';

// Additive, never bare: only the canvas-touching iconDataUrl (the stock's crests) is stubbed.
vi.mock('../src/ui/icons', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/ui/icons')>()),
  iconDataUrl: () => 'data:,',
}));

const WEEK = 'wk_6';

function board(done: string[] = []): GuildContractsView {
  return {
    week: WEEK,
    offered: guildContractsForWeek(WEEK).map((c) => c.id),
    done,
    lifetime: done.length,
  };
}

function world(seals: number, owned: string[] = [], done: string[] = []) {
  return {
    guildContracts: board(done),
    inventory: seals > 0 ? [{ itemId: LANTERN_SEAL_ITEM_ID, count: seals }] : [],
    deedsEarned: new Map(owned.map((id) => [id, '2026-10-16'])),
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
    expect(view.contracts[1].rewardLine).toBe('Reward: 3 Lantern Seals');
    expect(view.lifetimeText).toBe('Contracts completed: 1');
    // each notice carries its boss's portrait (the dungeon finder's still) and name, and the
    // week's counter out of the once a contract pays
    const week = guildContractsForWeek(WEEK);
    for (const [i, card] of view.contracts.entries()) {
      expect(card.portraitUrl).toBe(`/ui/dungeons/${week[i].mobId}.webp`);
      expect(card.boss.length).toBeGreaterThan(0);
      expect(card.boss).not.toBe(week[i].mobId);
      expect(card.progressTotal).toBe(1);
    }
    expect(view.contracts.map((c) => [c.progressDone, c.progressText])).toEqual([
      [0, '0/1 this week'],
      [1, '1/1 this week'],
      [0, '0/1 this week'],
    ]);
    // the board's weekly tally
    expect([view.weekDone, view.weekTotal]).toEqual([1, 3]);
    expect(view.weekProgressText).toBe('This week: 1 of 3 contracts complete');
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
    expect([empty.weekDone, empty.weekTotal]).toEqual([0, 0]);
  });

  it('has a portrait still for every boss any contract is posted against', () => {
    // the notice shows /ui/dungeons/<mobId>.webp; a contract against a boss without one would
    // ship a broken image
    const missing = [...new Set(GUILD_CONTRACTS.map((c) => c.mobId))].filter(
      (mobId) => !existsSync(path.join(process.cwd(), 'public', 'ui', 'dungeons', `${mobId}.webp`)),
    );
    expect(missing).toEqual([]);
  });

  it('reads the same from the online mirror as from the offline world', () => {
    // ClientWorld's shape: the board decoded off the wire (gcon), the bags and the Book mirrored
    const done = [board().offered[0]];
    const sim = world(7, [GUILD_QUARTERMASTER_STOCK[0].deedId], done);
    const mirror = {
      ...sim,
      guildContracts: decodeGuildContractsWire(JSON.parse(JSON.stringify(sim.guildContracts))),
      inventory: sim.inventory.map((slot) => ({ ...slot })),
      deedsEarned: new Map(sim.deedsEarned),
    };
    const now = Date.UTC(2026, 9, 16);
    for (const tab of ['contracts', 'quartermaster'] as const) {
      expect(buildGuildHallView(mirror, now, tab, null)).toEqual(
        buildGuildHallView(sim, now, tab, null),
      );
    }
  });

  it("prices the quartermaster's titles against the seals in the bags, owned ones marked", () => {
    const [first, second, third] = GUILD_QUARTERMASTER_STOCK;
    const view = buildGuildHallView(world(first.seals + 1, [first.deedId]), 0, 'quartermaster');
    expect(view.seals).toBe(first.seals + 1);
    expect(view.sealsText).toBe(`Lantern Seals: ${first.seals + 1}`);
    expect(view.intro).toMatch(/Nothing here makes you stronger/);
    const items = view.shop.items;
    expect(items.map((item) => item.id)).toEqual(GUILD_QUARTERMASTER_STOCK.map((o) => o.id));
    expect(items[0]).toMatchObject({ state: 'owned', stateLabel: 'Owned', name: 'Writ-Runner' });
    expect(items[1].state).toBe('short');
    expect(items[1].stateLabel).toBe(`Needs ${second.seals - first.seals - 1} more`);
    expect(items[1]).toMatchObject({
      priceValue: String(second.seals),
      price: `${second.seals} Lantern Seals`,
      kindLabel: 'Title',
    });
    // every card names the crest the Book of Deeds shows for its feat
    for (const item of items) expect(item.crestId).toMatch(/^deed_/);
    // a fresh counter opens on the cheapest title not yet owned
    expect(items.map((item) => item.selected)).toEqual([false, true, false]);
    expect(view.shop.detail?.id).toBe(second.id);
    // exactly enough seals is enough
    const exact = buildGuildShopView(
      { seals: third.seals, playerName: 'Wanderer', deedsEarned: new Map() },
      third.id,
    );
    expect(exact.items[2]).toMatchObject({ state: 'ready', stateLabel: 'Buy', selected: true });
    expect(exact.detail).toMatchObject({ id: third.id, actionEnabled: true, shortText: null });
  });

  it("shapes the selected title's detail: the nameplate, the price against the bags, why not", () => {
    const [first, second] = GUILD_QUARTERMASTER_STOCK;
    const input = { seals: 2, playerName: 'Wanderer', deedsEarned: new Map<string, string>() };
    const short = buildGuildShopView(input, second.id).detail;
    expect(short).toMatchObject({
      name: 'Hallsworn',
      plateName: 'Wanderer',
      platePre: '',
      platePost: ' [Hallsworn]',
      priceText: `Price: ${second.seals} Lantern Seals`,
      haveText: 'You have 2',
      state: 'short',
      action: `Needs ${second.seals - 2} more`,
      actionEnabled: false,
      shortText: `You need ${second.seals - 2} more Lantern Seals.`,
    });
    expect(short?.howTo).toMatch(/Book of Deeds/);
    expect(short?.cosmetic).toMatch(/Cosmetic only/);
    // one seal short reads in the singular
    const one = buildGuildShopView({ ...input, seals: first.seals - 1 }, first.id).detail;
    expect(one?.shortText).toBe('You need 1 more Lantern Seal.');
    // an owned title says where to wear it and offers no purchase
    const owned = buildGuildShopView(
      { ...input, seals: 99, deedsEarned: new Map([[first.deedId, '2026-10-16']]) },
      first.id,
    ).detail;
    expect(owned).toMatchObject({ state: 'owned', action: 'Owned', actionEnabled: false });
    expect(owned?.howTo).toBe('You own this title. Choose it in the Book of Deeds.');
    // an unknown selection falls back to the default card, never a blank detail
    expect(buildGuildShopView(input, 'phantom').detail?.id).toBe(first.id);
    expect(defaultGuildShopSelection(new Map([[first.deedId, 'x']]))).toBe(second.id);
    // every title owned: the first card
    const all = new Map(GUILD_QUARTERMASTER_STOCK.map((o) => [o.deedId, 'x']));
    expect(defaultGuildShopSelection(all)).toBe(first.id);
  });

  it("writes each stock card's hover card from the live rule", () => {
    const [first] = GUILD_QUARTERMASTER_STOCK;
    const input = { seals: 1, playerName: 'Wanderer', deedsEarned: new Map<string, string>() };
    const tip = guildShopTooltip(first.id, input);
    expect(tip?.title).toBe('Title: Writ-Runner');
    expect(tip?.lines.map((line) => line.tone)).toEqual(['sub', 'desc', 'desc', 'sub', 'red']);
    expect(tip?.lines[0].text).toBe('Shown as Wanderer [Writ-Runner]');
    expect(tip?.lines[3].text).toBe(`Price: ${first.seals} Lantern Seals`);
    expect(tip?.lines[4].text).toBe(`You need ${first.seals - 1} more Lantern Seals.`);
    // affordable: no red line; owned: the owned sentence, no red line
    expect(guildShopTooltip(first.id, { ...input, seals: first.seals })?.lines).toHaveLength(4);
    const owned = guildShopTooltip(first.id, {
      ...input,
      deedsEarned: new Map([[first.deedId, 'x']]),
    });
    expect(owned?.lines[1].text).toMatch(/You own this title/);
    expect(owned?.lines).toHaveLength(4);
    expect(guildShopTooltip('phantom', input)).toBeNull();
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
    const tips = new Map<HTMLElement, () => string>();
    const win = new GuildHallWindow({
      root: () => root,
      world: () => w as never,
      closeOthers: () => {},
      captureFocus: () => null,
      restoreFocus: () => {},
      attachTooltip: (el, html) => tips.set(el, html),
    });
    return { root, win, tips };
  }

  it('opens on a tab, switches tabs, sends a purchase, and closes', () => {
    const w = world(GUILD_QUARTERMASTER_STOCK[0].seals);
    const { root, win } = mount(w);
    win.open('quartermaster');
    expect(win.isOpen).toBe(true);
    expect(root.style.display).toBe('flex');
    expect(root.querySelectorAll('[data-gh-offer]').length).toBe(GUILD_QUARTERMASTER_STOCK.length);
    // the counter opens on the first title, the one buy button under its detail
    const buy = root.querySelector<HTMLButtonElement>(
      `[data-gh-buy="${GUILD_QUARTERMASTER_STOCK[0].id}"]`,
    );
    expect(root.querySelectorAll('[data-gh-buy]').length).toBe(1);
    expect(buy?.disabled).toBe(false);
    buy?.click();
    expect(w.buyGuildCosmetic).toHaveBeenCalledWith(GUILD_QUARTERMASTER_STOCK[0].id);
    // selecting a title it cannot afford shows it with a disabled buy and the reason
    const dearId = GUILD_QUARTERMASTER_STOCK[2].id;
    root.querySelector<HTMLButtonElement>(`[data-gh-offer="${dearId}"]`)?.click();
    expect(root.querySelector(`[data-gh-offer="${dearId}"]`)?.getAttribute('aria-pressed')).toBe(
      'true',
    );
    const dear = root.querySelector<HTMLButtonElement>(`[data-gh-buy="${dearId}"]`);
    expect(dear?.disabled).toBe(true);
    expect(root.querySelector('.gh-short')?.textContent).toMatch(
      /^You need \d+ more Lantern Seals\.$/,
    );
    expect(root.querySelector('.gh-plate')?.textContent).toBe('Wanderer [of Lantern Hall]');
    root.querySelector<HTMLButtonElement>('[data-gh-tab="contracts"]')?.click();
    expect(root.querySelectorAll('[data-gh-card]').length).toBe(3);
    // each notice shows its boss's portrait, its counter and its reward line
    const card = root.querySelector('[data-gh-card]');
    expect(card?.querySelector('.gh-portrait img')?.getAttribute('src')).toMatch(
      /^\/ui\/dungeons\/.+\.webp$/,
    );
    expect(card?.querySelector('.gh-count')?.textContent).toBe('0/1 this week');
    expect(card?.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('0');
    expect(card?.querySelector('.gh-reward')?.textContent).toMatch(/^Reward: /);
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

  it('stamps a done notice, counts the week, and hangs hover cards on the stock and the seals', () => {
    const offered = board().offered;
    const { root, win, tips } = mount(world(3, [], [offered[2]]));
    win.open('contracts');
    const cards = [...root.querySelectorAll('[data-gh-card]')];
    expect(cards.map((c) => c.classList.contains('gh-card-done'))).toEqual([false, false, true]);
    expect(cards.map((c) => !!c.querySelector('.gh-stamp'))).toEqual([false, false, true]);
    expect(cards[2].querySelector('.gh-stamp')?.textContent).toBe('Sealed');
    expect(cards[2].querySelector('.gh-count')?.textContent).toBe('1/1 this week');
    expect(root.querySelector('.gh-tally-text')?.textContent).toBe(
      'This week: 1 of 3 contracts complete',
    );
    expect(root.querySelectorAll('.gh-tally .gh-pip-done').length).toBe(1);
    const seals = root.querySelector<HTMLElement>('.gh-seals');
    expect(seals && tips.get(seals)?.()).toMatch(/spent only at Garrick Holt/);
    win.open('quartermaster');
    const card = root.querySelector<HTMLElement>(
      `[data-gh-offer="${GUILD_QUARTERMASTER_STOCK[1].id}"]`,
    );
    const html = card ? tips.get(card)?.() : '';
    expect(html).toContain('<div class="tt-title">Title: Hallsworn</div>');
    expect(html).toContain('class="tt-red"');
  });

  it('hands focus back to the pressed card and the seal chip without popping a hover card', () => {
    const { root, win } = mount(world(3));
    win.open('quartermaster');
    const id = GUILD_QUARTERMASTER_STOCK[2].id;
    root.querySelector<HTMLButtonElement>(`[data-gh-offer="${id}"]`)?.focus();
    root.querySelector<HTMLButtonElement>(`[data-gh-offer="${id}"]`)?.click();
    const twin = root.querySelector<HTMLButtonElement>(`[data-gh-offer="${id}"]`);
    expect(document.activeElement).toBe(twin);
    // the flag attachTooltip's focusin reads (and clears) before it would show the card
    expect(twin?.dataset.suppressFocusTooltip).toBe('true');
    // the seal chip is a named button whose focus survives a rebuild
    const chip = root.querySelector<HTMLButtonElement>('[data-gh-seals]');
    expect(chip?.tagName).toBe('BUTTON');
    expect(
      document.getElementById(chip?.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toMatch(/Garrick Holt/);
    chip?.focus();
    win.relocalize();
    expect(document.activeElement).toBe(root.querySelector('[data-gh-seals]'));
    // a disabled buy names its reason
    const buy = root.querySelector<HTMLButtonElement>(`[data-gh-buy="${id}"]`);
    expect(buy?.disabled).toBe(true);
    expect(document.getElementById(buy?.getAttribute('aria-describedby') ?? '')?.className).toBe(
      'gh-short',
    );
    win.close();
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
    // every refusal reason resolves to its own English line, never a raw key
    for (const [reason, line] of [
      ['seals', 'You do not have enough Lantern Seals.'],
      ['owned', 'You already own that.'],
      ['range', 'Stand at the quartermaster to trade.'],
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
