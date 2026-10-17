// The enemy cooldown row on the peer wire: the server encode
// (server/major_cooldown_wire.ts, called from game.ts dynamicFields on the peer
// cache path) and the client decode (src/net/peer_major_cooldown_wire.ts, called
// from online.ts applyWire and the snapshot clock), round-tripped here so the
// `mcd` key and its deadline shape cannot drift on one side only.
import { describe, expect, it } from 'vitest';
import { writeMajorCooldownWire } from '../server/major_cooldown_wire';
import { blankEntity } from '../src/net/blank_entity';
import {
  agePeerMajorCooldowns,
  applyPeerMajorCooldownWire,
} from '../src/net/peer_major_cooldown_wire';
import type { Entity } from '../src/sim/types';

function serverPlayer(cooldowns: Record<string, number>): Entity {
  const e = blankEntity(7);
  e.kind = 'player';
  e.cooldowns = new Map(Object.entries(cooldowns));
  return e;
}

const encode = (e: Entity, simTime: number): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  writeMajorCooldownWire(e, simTime, out);
  return JSON.parse(JSON.stringify(out));
};

describe('major cooldown wire', () => {
  it('ships only tracked cooldowns, as deadlines on the sim clock', () => {
    const e = serverPlayer({
      barkskin: 40,
      'trinket:medallion_of_defiance': 90,
      mortal_strike: 4, // a rotation button: never rides
      system_unstuck: 300, // not an ability at all
    });
    expect(encode(e, 1000)).toEqual({
      mcd: { barkskin: 1040, 'trinket:medallion_of_defiance': 1090 },
    });
  });

  it('holds the same deadline while the cooldown counts down, so the cache can elide', () => {
    const e = serverPlayer({ recklessness: 180 });
    const first = JSON.stringify(encode(e, 500));
    e.cooldowns.set('recklessness', 179.95);
    expect(JSON.stringify(encode(e, 500.05))).toBe(first);
  });

  it('ships nothing for a player with no tracked cooldown running, or for a mob', () => {
    expect(encode(serverPlayer({ mortal_strike: 4 }), 10)).toEqual({});
    const mob = serverPlayer({ barkskin: 30 });
    mob.kind = 'mob';
    expect(encode(mob, 10)).toEqual({});
  });

  it('decodes deadlines into the peer entity cooldown map and ages them on the snapshot clock', () => {
    const peer = blankEntity(7);
    applyPeerMajorCooldownWire(peer, { barkskin: 1040, recklessness: 1005 }, 1000);
    expect(peer.cooldowns.get('barkskin')).toBe(40);
    expect(peer.cooldowns.get('recklessness')).toBe(5);

    // A bare keep id carries no record: the held deadlines age on their own.
    agePeerMajorCooldowns([peer], 1010);
    expect(peer.cooldowns.get('barkskin')).toBe(30);
    expect(peer.cooldowns.has('recklessness')).toBe(false);
  });

  it('treats each arriving record as the whole truth', () => {
    const peer = blankEntity(7);
    applyPeerMajorCooldownWire(peer, { barkskin: 1040, avatar: 1100 }, 1000);
    applyPeerMajorCooldownWire(peer, { avatar: 1100 }, 1001);
    expect(peer.cooldowns.has('barkskin')).toBe(false);
    expect(peer.cooldowns.get('avatar')).toBe(99);
    applyPeerMajorCooldownWire(peer, undefined, 1002);
    expect(peer.cooldowns.size).toBe(0);
    agePeerMajorCooldowns([peer], 1003);
    expect(peer.cooldowns.size).toBe(0);
  });

  it('round-trips server encode to client decode', () => {
    const server = serverPlayer({ evasion: 120, 'trinket:medallion_of_defiance': 45 });
    const wire = encode(server, 2000);
    const peer = blankEntity(7);
    applyPeerMajorCooldownWire(peer, wire.mcd, 2000);
    expect(Object.fromEntries(peer.cooldowns)).toEqual({
      evasion: 120,
      'trinket:medallion_of_defiance': 45,
    });
  });

  it('drops malformed rows and an unknown clock instead of painting garbage', () => {
    const peer = blankEntity(7);
    applyPeerMajorCooldownWire(peer, { barkskin: 'soon', avatar: 1100 }, 1000);
    expect(Object.fromEntries(peer.cooldowns)).toEqual({ avatar: 100 });
    applyPeerMajorCooldownWire(peer, { avatar: 1100 }, Number.NaN);
    expect(peer.cooldowns.size).toBe(0);
  });
});
