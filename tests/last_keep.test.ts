// The Last Keep: a zero-combat authored room-graph castle interior.
// Pins the structural contracts the layout must keep: every room is reachable
// from the entrance hall through real doorways, every door straddles exactly
// two rooms on a shared wall line (with the opening inside both rooms' shared
// span), the dungeon entry and exit both land inside the entrance hall, decor
// uses only keys the authored decor renderer handles and never sits on a stair
// ramp, and the layout yields a real collision set.
import { describe, expect, it } from 'vitest';
import { DUNGEON_LIST, DUNGEON_X_THRESHOLD, DUNGEONS, dungeonAt } from '../src/sim/data';
import {
  type AuthoredDoor,
  type AuthoredRoom,
  LASTKEEP_DECOR,
  LASTKEEP_DOORS,
  LASTKEEP_LAYOUT,
  LASTKEEP_ROOMS,
  lastKeepLiftAt,
  layoutColliders,
} from '../src/sim/dungeon_layout';
import { enterDungeon, leaveDungeon } from '../src/sim/instances/dungeons';
import { authoredLiftAt, roomAt } from '../src/sim/rift/authored';
import { Sim } from '../src/sim/sim';

// The decor keys the authored render path supports (src/render/rift_decor.ts:
// DECOR_MODELS plus the procedural 'pentagram' and 'rug'). A key outside this
// set renders as NOTHING (the builder skips unknown keys), so a typo here
// would silently ship an unfurnished room.
const SUPPORTED_DECOR_KEYS = new Set([
  'infernal_brazier',
  'infernal_altar',
  'demon_idol',
  'hell_forge',
  'hanging_cage',
  'bone_pile',
  'obsidian_fang',
  'infernal_statue',
  'slag_cauldron',
  'bone_throne',
  'pentagram',
  'rug',
]);

// The exact room-recovery rule authoredLiftAt/placeAuthoredRelief use: a door
// joins the two rooms whose shared wall line it sits on.
function doorRooms(
  rooms: readonly AuthoredRoom[],
  d: AuthoredDoor,
): [AuthoredRoom, AuthoredRoom] | null {
  const south = rooms.find((r) => r.z1 === d.z && d.x >= r.x0 && d.x <= r.x1);
  const north = rooms.find((r) => r.z0 === d.z && d.x >= r.x0 && d.x <= r.x1);
  if (south && north) return [south, north];
  const west = rooms.find((r) => r.x1 === d.x && d.z >= r.z0 && d.z <= r.z1);
  const east = rooms.find((r) => r.x0 === d.x && d.z >= r.z0 && d.z <= r.z1);
  if (west && east) return [west, east];
  return null;
}

describe('The Last Keep layout', () => {
  const rooms = LASTKEEP_ROOMS;
  const doors = LASTKEEP_DOORS;
  const def = DUNGEONS.the_last_keep;

  it('registers the dungeon def: zero combat, unique index, authored interior', () => {
    expect(def).toBeDefined();
    expect(def.spawns).toEqual([]);
    // zero combat, but not zero encounters: the entrance hall keepsake is
    // the instance's one placed object (the placement sweep in fixes.test.ts
    // requires every dungeon to place at least one encounter)
    expect(def.objects?.map((o) => o.itemId)).toEqual(['last_keep_signet']);
    expect(def.interior).toBe('lastkeep');
    expect(def.suggestedPlayers).toBe(1);
    // index unique across the merged registry
    const withIndex = DUNGEON_LIST.filter((d) => d.index === def.index);
    expect(withIndex).toEqual([def]);
    // door position unique (two doors at one point is the map-portal overlap bug)
    const doorKey = `${def.doorPos.x},${def.doorPos.z}`;
    const sameDoor = DUNGEON_LIST.filter((d) => `${d.doorPos.x},${d.doorPos.z}` === doorKey);
    expect(sameDoor).toEqual([def]);
  });

  it('every door straddles exactly two rooms, with the opening inside their shared span', () => {
    for (const d of doors) {
      const pair = doorRooms(rooms, d);
      expect(pair, `door at (${d.x},${d.z}) does not straddle two rooms`).not.toBeNull();
      const [a, b] = pair as [AuthoredRoom, AuthoredRoom];
      expect(a.id).not.toBe(b.id);
      if (a.z1 === d.z || a.z0 === d.z) {
        // constant-z wall: the opening runs along x and must fit inside both rooms
        const lo = Math.max(a.x0, b.x0);
        const hi = Math.min(a.x1, b.x1);
        expect(d.x - d.hw, `door (${d.x},${d.z}) opening exits ${a.id}/${b.id}`).toBeGreaterThan(
          lo,
        );
        expect(d.x + d.hw, `door (${d.x},${d.z}) opening exits ${a.id}/${b.id}`).toBeLessThan(hi);
      } else {
        const lo = Math.max(a.z0, b.z0);
        const hi = Math.min(a.z1, b.z1);
        expect(d.z - d.hd, `door (${d.x},${d.z}) opening exits ${a.id}/${b.id}`).toBeGreaterThan(
          lo,
        );
        expect(d.z + d.hd, `door (${d.x},${d.z}) opening exits ${a.id}/${b.id}`).toBeLessThan(hi);
      }
    }
  });

  it('every room is reachable from the entrance hall through doors', () => {
    const entryRoom = roomAt(rooms, def.entry.x, def.entry.z);
    expect(entryRoom?.id).toBe('hall_entrance');
    const adjacency = new Map<string, string[]>();
    for (const d of doors) {
      const pair = doorRooms(rooms, d);
      if (!pair) continue;
      const [a, b] = pair;
      adjacency.set(a.id, [...(adjacency.get(a.id) ?? []), b.id]);
      adjacency.set(b.id, [...(adjacency.get(b.id) ?? []), a.id]);
    }
    const seen = new Set<string>([(entryRoom as AuthoredRoom).id]);
    const queue = [(entryRoom as AuthoredRoom).id];
    while (queue.length > 0) {
      const cur = queue.pop() as string;
      for (const next of adjacency.get(cur) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    const unreachable = rooms.filter((r) => !seen.has(r.id)).map((r) => r.id);
    expect(unreachable).toEqual([]);
  });

  it('rooms never overlap', () => {
    for (const a of rooms) {
      for (const b of rooms) {
        if (a.id >= b.id) continue;
        const overlap = a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
        expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });

  it('entry and exit both sit in the entrance hall, outside the exit door trigger', () => {
    expect(roomAt(rooms, def.entry.x, def.entry.z)?.id).toBe('hall_entrance');
    expect(roomAt(rooms, def.exitOffset.x, def.exitOffset.z)?.id).toBe('hall_entrance');
    const gap = Math.hypot(def.entry.x - def.exitOffset.x, def.entry.z - def.exitOffset.z);
    expect(gap).toBeGreaterThan(2); // DOOR_TRIGGER_RADIUS: arrival must not re-trigger the exit
  });

  it('the gaol sits lowest and the tower climbs in +1.6 steps', () => {
    const lift = (id: string): number => rooms.find((r) => r.id === id)?.lift ?? 0;
    const lowest = Math.min(...rooms.map((r) => r.lift ?? 0));
    // Negative lifts are unsupported by the render relief path, so the cells sit
    // at exactly 0 and everything else is raised above them.
    expect(lowest).toBe(0);
    for (const id of ['gaol', 'cell_north', 'cell_mid', 'cell_south']) {
      expect(lift(id), id).toBe(0);
    }
    expect(lift('gaol_stair')).toBeGreaterThan(0);
    expect(lift('hall_entrance')).toBeGreaterThan(lift('gaol_stair'));
    expect(lift('throne_dais') - lift('great_hall')).toBeCloseTo(1.2, 5);
    expect(lift('tower_mid') - lift('tower_base')).toBeCloseTo(1.6, 5);
    expect(lift('tower_lookout') - lift('tower_mid')).toBeCloseTo(1.6, 5);
    // lastKeepLiftAt (the groundHeight arm's source) agrees with the room data
    expect(lastKeepLiftAt(def.entry.x, def.entry.z)).toBeCloseTo(lift('hall_entrance'), 5);
    expect(lastKeepLiftAt(31, 1)).toBe(0); // middle cell floor
    expect(lastKeepLiftAt(37, 47)).toBeCloseTo(lift('tower_lookout'), 5);
  });

  it('decor uses only renderer-supported keys, inside a room, never on a stair ramp', () => {
    for (const d of LASTKEEP_DECOR) {
      expect(SUPPORTED_DECOR_KEYS.has(d.key), `unsupported decor key ${d.key}`).toBe(true);
      const room = roomAt(rooms, d.x, d.z);
      expect(room, `${d.key} at (${d.x},${d.z}) is outside every room`).not.toBeNull();
      // A decor piece inside a door's ramp band would stand tilted on the stair
      // run; every piece must sit on its room's flat floor.
      const at = authoredLiftAt(rooms, doors, d.x, d.z);
      expect(at, `${d.key} at (${d.x},${d.z}) sits on a ramp`).toBeCloseTo(
        (room as AuthoredRoom).lift ?? 0,
        5,
      );
    }
  });

  it('layoutColliders yields walls and decor footprints', () => {
    const colliders = layoutColliders(LASTKEEP_LAYOUT);
    expect(colliders.length).toBeGreaterThan(0);
    expect(colliders.some((c) => c.type === 'obb')).toBe(true); // wall runs
    expect(colliders.some((c) => c.type === 'circle')).toBe(true); // decor footprints
  });

  it('a player enters through the door path, spawns no mobs, and leaves clean', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', autoEquip: true });
    const pid = sim.player.id;
    const before = [...(sim as any).entities.values()].filter(
      (e: { kind: string }) => e.kind === 'mob',
    ).length;
    expect(enterDungeon((sim as any).ctx, 'the_last_keep', pid)).toBe(true);
    expect(sim.player.pos.x).toBeGreaterThan(DUNGEON_X_THRESHOLD);
    expect(dungeonAt(sim.player.pos.x)?.id).toBe('the_last_keep');
    // a zero-combat interior claims its slot without creating a single mob
    const after = [...(sim as any).entities.values()].filter(
      (e: { kind: string }) => e.kind === 'mob',
    ).length;
    expect(after).toBe(before);
    // the arrival point must not sit inside the exit portal's walk-out trigger:
    // a tick of door processing leaves the player standing inside
    sim.tick();
    expect(sim.player.pos.x).toBeGreaterThan(DUNGEON_X_THRESHOLD);
    expect(leaveDungeon((sim as any).ctx, pid)).toBe(true);
    expect(sim.player.pos.x).toBeLessThan(DUNGEON_X_THRESHOLD);
  });
});
