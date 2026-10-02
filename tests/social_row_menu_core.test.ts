import { describe, expect, it } from 'vitest';
import {
  livePlayerPid,
  type SocialRowMenuWorld,
  socialRowMenuPoint,
  socialRowMenuTarget,
  socialRowPlayer,
} from '../src/ui/social_row_menu_core';

// A Social window row right-click opens the menu that player's unit frame opens.
// The routing is pure, so it is pinned here against the two IWorld hosts' shapes:
// the offline Sim and the online ClientWorld both expose playerId, player.name and
// an entities Map (the ClientWorld one holds only the ~120yd interest scope).

type Ent = { id: number; kind: 'player' | 'mob' | 'npc'; name: string };

function world(selfName: string, selfPid: number, others: Ent[]): SocialRowMenuWorld {
  const entities = new Map<number, Ent>();
  entities.set(selfPid, { id: selfPid, kind: 'player', name: selfName });
  for (const e of others) entities.set(e.id, e);
  return { playerId: selfPid, player: { name: selfName }, entities };
}

// Sim-shaped: the whole offline world is in the map. ClientWorld-shaped: a mirror
// whose entities are only what the last snapshot carried. Same structural slice.
const HOSTS = {
  sim: () =>
    world('Aria', 1, [
      { id: 7, kind: 'player', name: 'Borin' },
      { id: 9, kind: 'mob', name: 'Kessa' },
    ]),
  clientWorld: () =>
    world('Aria', 101, [
      { id: 107, kind: 'player', name: 'Borin' },
      { id: 109, kind: 'mob', name: 'Kessa' },
    ]),
};

describe('socialRowPlayer: reads the row data attributes', () => {
  it('reads the name and leaves pid null when the row carries none', () => {
    expect(socialRowPlayer({ player: 'Borin' })).toEqual({ name: 'Borin', pid: null });
  });

  it('reads a raid row pid', () => {
    expect(socialRowPlayer({ player: 'Borin', pid: '42' })).toEqual({ name: 'Borin', pid: 42 });
  });

  it('drops a malformed pid rather than routing to a bogus unit', () => {
    for (const pid of ['', 'abc', '-3', '1.5'])
      expect(socialRowPlayer({ player: 'Borin', pid })).toEqual({ name: 'Borin', pid: null });
  });

  it('is null for a row that names no player', () => {
    expect(socialRowPlayer({})).toBeNull();
    expect(socialRowPlayer({ player: '   ' })).toBeNull();
  });
});

describe('livePlayerPid: by-name lookup over the interest-scoped roster', () => {
  it('matches a player case-insensitively', () => {
    const w = HOSTS.sim();
    expect(livePlayerPid(w.entities.values(), 'bORIN')).toBe(7);
  });

  it('never matches a mob or npc that shares the name', () => {
    const w = HOSTS.sim();
    expect(livePlayerPid(w.entities.values(), 'Kessa')).toBeNull();
  });

  it('is null for a player outside the roster', () => {
    expect(livePlayerPid(HOSTS.clientWorld().entities.values(), 'Faraway')).toBeNull();
  });
});

describe.each(Object.entries(HOSTS))('socialRowMenuTarget (%s-shaped world)', (_host, make) => {
  it('your own row opens your own player-frame menu (by name, any case)', () => {
    const w = make();
    expect(socialRowMenuTarget({ name: 'aria', pid: null }, w)).toEqual({ kind: 'self' });
  });

  it('your own raid row opens your own player-frame menu (by pid)', () => {
    const w = make();
    expect(socialRowMenuTarget({ name: 'Aria', pid: w.playerId }, w)).toEqual({ kind: 'self' });
  });

  it('a player in view opens the unit-frame menu keyed by their live pid', () => {
    const w = make();
    const pid = livePlayerPid(w.entities.values(), 'Borin');
    expect(pid).not.toBeNull();
    expect(socialRowMenuTarget({ name: 'Borin', pid: null }, w)).toEqual({
      kind: 'unit',
      pid,
      name: 'Borin',
    });
  });

  it('a raid row keeps its member pid even when that member is out of view', () => {
    // An out-of-range raid member still has a party frame, so the raid row
    // routes to the same pid-keyed menu (promote, remove) the frame opens.
    const w = make();
    expect(socialRowMenuTarget({ name: 'Faraway', pid: 555 }, w)).toEqual({
      kind: 'unit',
      pid: 555,
      name: 'Faraway',
    });
  });

  it('a player with no entity near you opens the by-name player menu', () => {
    const w = make();
    expect(socialRowMenuTarget({ name: 'Faraway', pid: null }, w)).toEqual({
      kind: 'name',
      name: 'Faraway',
    });
  });

  it('a name shared with a mob still resolves to the by-name player menu', () => {
    const w = make();
    expect(socialRowMenuTarget({ name: 'Kessa', pid: null }, w)).toEqual({
      kind: 'name',
      name: 'Kessa',
    });
  });
});

describe('socialRowMenuPoint: pointer vs keyboard open', () => {
  const rect = { left: 40, bottom: 300 };

  it('a pointer right-click opens at the cursor', () => {
    expect(socialRowMenuPoint({ clientX: 120, clientY: 80 }, rect)).toEqual({ x: 120, y: 80 });
  });

  it('a keyboard open (0,0) anchors under the row instead of the screen corner', () => {
    expect(socialRowMenuPoint({ clientX: 0, clientY: 0 }, rect)).toEqual({ x: 40, y: 300 });
  });

  it('falls back to the event point when there is no row box', () => {
    expect(socialRowMenuPoint({ clientX: 0, clientY: 0 }, null)).toEqual({ x: 0, y: 0 });
  });
});
