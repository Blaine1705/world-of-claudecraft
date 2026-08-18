import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CROSS_HOTBAR_EXPANDED_SET,
  CROSS_HOTBAR_PRIMARY_SET,
  CROSS_HOTBAR_SLOTS_PER_SET,
  defaultCrossHotbarLayout,
} from '../src/game/cross_hotbar';
import { CrossHotbarBindings } from '../src/game/cross_hotbar_bindings';
import { GP } from '../src/game/gamepad_map';

const STORE_KEY = 'woc_gamepad_xhb';

// minimal localStorage stub (the test env is plain node, no DOM)
function installStorage(): void {
  const map = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
  };
}

beforeEach(() => installStorage());

describe('CrossHotbarBindings', () => {
  const ability = (id: string) => ({ type: 'ability' as const, id });
  const bar = (n: number) => Array.from({ length: n }, (_, i) => ability(`a${i}`));

  it('starts empty and unseeded', () => {
    const b = new CrossHotbarBindings();
    expect(b.all()).toEqual(defaultCrossHotbarLayout());
    expect(b.isSeeded()).toBe(false);
  });

  it('seeds once from the action bar and persists it', () => {
    const b = new CrossHotbarBindings();
    expect(b.seedOnce(bar(4))).toBe(true);
    expect(b.actionFor(CROSS_HOTBAR_PRIMARY_SET, 'left', GP.DPAD_UP)).toEqual(ability('a0'));
    expect(new CrossHotbarBindings().isSeeded()).toBe(true);
  });

  it('never re-seeds over a bar the player has arranged', () => {
    const b = new CrossHotbarBindings();
    b.seedOnce(bar(4));
    b.bind(CROSS_HOTBAR_PRIMARY_SET, 0, ability('rearranged'));
    expect(b.seedOnce(bar(4))).toBe(false);
    expect(b.actionFor(CROSS_HOTBAR_PRIMARY_SET, 'left', GP.DPAD_UP)).toEqual(
      ability('rearranged'),
    );
  });

  it('stays unseeded when there is nothing yet to seed FROM', () => {
    // A bar of empty slots must not count as seeded, or the real seed would be
    // skipped forever once the player has abilities.
    const b = new CrossHotbarBindings();
    expect(b.seedOnce([null, null])).toBe(false);
    expect(b.isSeeded()).toBe(false);
  });

  it('carries class extras onto the bar', () => {
    const b = new CrossHotbarBindings();
    b.seedOnce([ability('heroic_strike'), null], ['battle_stance']);
    expect(b.actionFor(CROSS_HOTBAR_PRIMARY_SET, 'left', GP.DPAD_LEFT)).toEqual(
      ability('battle_stance'),
    );
  });

  it('resolves a trigger-plus-button press to the action on that cell', () => {
    const b = new CrossHotbarBindings();
    b.seedOnce(bar(32));
    expect(b.actionFor(CROSS_HOTBAR_PRIMARY_SET, 'left', GP.DPAD_UP)).toEqual(ability('a0'));
    expect(b.actionFor(CROSS_HOTBAR_EXPANDED_SET, 'right', GP.A)).toEqual(ability('a31'));
  });

  it('persists a rebind and reloads it', () => {
    const b = new CrossHotbarBindings();
    b.bind(CROSS_HOTBAR_PRIMARY_SET, 0, ability('shield_block'));
    expect(
      new CrossHotbarBindings().actionFor(CROSS_HOTBAR_PRIMARY_SET, 'left', GP.DPAD_UP),
    ).toEqual(ability('shield_block'));
  });

  it('rebinds by the physical trigger-plus-button pair', () => {
    const b = new CrossHotbarBindings();
    b.seedOnce(bar(32));
    b.bindButton(CROSS_HOTBAR_PRIMARY_SET, 'right', GP.B, ability('x'));
    expect(b.actionFor(CROSS_HOTBAR_PRIMARY_SET, 'right', GP.B)).toEqual(ability('x'));
    // the same button on the OTHER layer is a different cell and must not move
    expect(b.actionFor(CROSS_HOTBAR_PRIMARY_SET, 'left', GP.B)).toEqual(ability('a6'));
  });

  it('clears a cell when bound to nothing', () => {
    const b = new CrossHotbarBindings();
    b.seedOnce(bar(4));
    b.bind(CROSS_HOTBAR_PRIMARY_SET, 0, null);
    expect(b.actionFor(CROSS_HOTBAR_PRIMARY_SET, 'left', GP.DPAD_UP)).toBeNull();
  });

  it('ignores a rebind of a button the cross hotbar does not claim', () => {
    const b = new CrossHotbarBindings();
    b.bindButton(CROSS_HOTBAR_PRIMARY_SET, 'left', GP.LB, ability('x'));
    expect(b.isSeeded()).toBe(false);
  });

  it('ignores an out-of-range set or position', () => {
    const b = new CrossHotbarBindings();
    b.bind(9, 0, ability('x'));
    b.bind(CROSS_HOTBAR_PRIMARY_SET, -1, ability('x'));
    b.bind(CROSS_HOTBAR_PRIMARY_SET, CROSS_HOTBAR_SLOTS_PER_SET, ability('x'));
    expect(b.isSeeded()).toBe(false);
  });

  it('swaps two cells, which is what an edit-mode drag does', () => {
    const b = new CrossHotbarBindings();
    b.seedOnce(bar(4));
    b.swap(CROSS_HOTBAR_PRIMARY_SET, 0, CROSS_HOTBAR_PRIMARY_SET, 1);
    expect(b.setActions(CROSS_HOTBAR_PRIMARY_SET)[0]).toEqual(ability('a1'));
    expect(b.setActions(CROSS_HOTBAR_PRIMARY_SET)[1]).toEqual(ability('a0'));
  });

  it('swaps across sets too', () => {
    const b = new CrossHotbarBindings();
    b.seedOnce(bar(32));
    b.swap(CROSS_HOTBAR_PRIMARY_SET, 0, CROSS_HOTBAR_EXPANDED_SET, 0);
    expect(b.setActions(CROSS_HOTBAR_PRIMARY_SET)[0]).toEqual(ability('a16'));
    expect(b.setActions(CROSS_HOTBAR_EXPANDED_SET)[0]).toEqual(ability('a0'));
  });

  it('leaves the bar alone when a swap names a cell that does not exist', () => {
    const b = new CrossHotbarBindings();
    b.seedOnce(bar(4));
    const before = JSON.stringify(b.all());
    b.swap(CROSS_HOTBAR_PRIMARY_SET, 0, 9, 0);
    expect(JSON.stringify(b.all())).toBe(before);
  });

  it('allows two cells to hold the same action', () => {
    const b = new CrossHotbarBindings();
    b.bind(CROSS_HOTBAR_PRIMARY_SET, 0, ability('x'));
    b.bind(CROSS_HOTBAR_PRIMARY_SET, 1, ability('x'));
    expect(b.setActions(CROSS_HOTBAR_PRIMARY_SET).slice(0, 2)).toEqual([
      ability('x'),
      ability('x'),
    ]);
  });

  it('resets back to empty so the next seed refills it', () => {
    const b = new CrossHotbarBindings();
    b.seedOnce(bar(4));
    b.reset();
    expect(b.isSeeded()).toBe(false);
    expect(new CrossHotbarBindings().isSeeded()).toBe(false);
  });

  it('falls back to empty when the stored value is corrupt', () => {
    localStorage.setItem(STORE_KEY, '{not json');
    expect(new CrossHotbarBindings().all()).toEqual(defaultCrossHotbarLayout());
  });

  it('survives storage being unavailable', () => {
    const b = new CrossHotbarBindings();
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => b.bind(CROSS_HOTBAR_PRIMARY_SET, 0, ability('x'))).not.toThrow();
    expect(b.actionFor(CROSS_HOTBAR_PRIMARY_SET, 'left', GP.DPAD_UP)).toEqual(ability('x'));
  });
});

describe('seeding waits for the action bar', () => {
  it('does not latch on the extras alone', () => {
    // A pad is usually connected before the character's bar has loaded, and the
    // stance is ready first. Latching then produced a bar holding a stance and
    // nothing else, which is what a Steam Deck player actually saw.
    const xhb = new CrossHotbarBindings();
    xhb.reset();
    expect(
      xhb.seedOnce(
        Array.from({ length: 32 }, () => null),
        ['battle_stance'],
      ),
    ).toBe(false);
    expect(xhb.isSeeded()).toBe(false);
  });

  it('latches once the bar has something on it, extras included', () => {
    const xhb = new CrossHotbarBindings();
    xhb.reset();
    const bar: ({ type: 'ability'; id: string } | null)[] = Array.from({ length: 32 }, () => null);
    bar[0] = { type: 'ability', id: 'heroic_strike' };
    expect(xhb.seedOnce(bar, ['battle_stance'])).toBe(true);
    const flat = xhb.all().flat();
    expect(flat).toContainEqual({ type: 'ability', id: 'heroic_strike' });
    expect(flat).toContainEqual({ type: 'ability', id: 'battle_stance' });
  });
});

describe('syncKnown offers a cell to a newly learned ability', () => {
  const seed = (xhb: CrossHotbarBindings) => {
    const bar: ({ type: 'ability'; id: string } | null)[] = Array.from({ length: 32 }, () => null);
    bar[0] = { type: 'ability', id: 'heroic_strike' };
    xhb.seedOnce(bar, []);
  };

  it('places a spell the bar has never seen', () => {
    // A new player levels, learns something, and would otherwise never see it on
    // the pad: the bar seeds once and nothing put a new spell on it after that.
    const xhb = new CrossHotbarBindings();
    xhb.reset();
    seed(xhb);
    expect(xhb.syncKnown(['heroic_strike', 'rend'])).toBe(true);
    expect(xhb.all().flat()).toContainEqual({ type: 'ability', id: 'rend' });
  });

  it('leaves an ability the player REMOVED off the bar', () => {
    // The whole reason for tracking what has been seen: re-offering a cell to
    // something deliberately cleared would fight the player every level.
    const xhb = new CrossHotbarBindings();
    xhb.reset();
    seed(xhb);
    xhb.syncKnown(['rend']);
    const at = xhb.all()[0].findIndex((a) => a?.id === 'rend');
    xhb.bind(0, at, null);
    expect(xhb.syncKnown(['rend'])).toBe(false);
    expect(xhb.all().flat()).not.toContainEqual({ type: 'ability', id: 'rend' });
  });

  it('does not re-offer what the seed already placed', () => {
    const xhb = new CrossHotbarBindings();
    xhb.reset();
    seed(xhb);
    expect(xhb.syncKnown(['heroic_strike'])).toBe(false);
    expect(
      xhb
        .all()
        .flat()
        .filter((a) => a?.id === 'heroic_strike'),
    ).toHaveLength(1);
  });

  it('does nothing before the bar is seeded', () => {
    // Placing into an unseeded bar would beat the seed to the cells and leave the
    // player's action-bar order scattered.
    const xhb = new CrossHotbarBindings();
    xhb.reset();
    expect(xhb.syncKnown(['rend'])).toBe(false);
  });
});
