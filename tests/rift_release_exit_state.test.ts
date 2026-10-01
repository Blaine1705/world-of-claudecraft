// A spirit released in a rift must take the online client OUT of the rift.
//
// ClientWorld mirrors `riftFloor` from riftState events alone (no snapshot field),
// and only enterRift / descendRift / the rift exit emitted them. A death on a rift
// floor followed by a spirit release teleports the ghost to an overworld graveyard
// (spirit.ts ghostGraveyard) without any exit event, so online the client kept its
// floor: mapWindowMode and minimapMode both lead with `world.riftFloor`, which locked
// the world map and minimap on the rift plan for the whole corpse run. The offline
// Sim never showed it because its riftFloor is derived from position. The two
// /unstuck graveyard moves had the same hole. Every graveyard move now emits the
// exit (spirit.ts graveyardForMove -> rift/runs.ts emitRiftDeparture).
import { describe, expect, it } from 'vitest';
import { ActionBarLayoutUploader } from '../src/net/action_bar_upload';
import { ClientWorld } from '../src/net/online';
import { allocRiftCollisionToken } from '../src/sim/colliders';
import { BUILTIN_WORLD, dungeonAt, isRiftPos } from '../src/sim/data';
import { spawnNaturalRiftPortal } from '../src/sim/rift/portals';
import { Sim } from '../src/sim/sim';
import { moveToGraveyardForUnstuck, reviveAtGraveyardForUnstuck } from '../src/sim/spirit';
import type { SimEvent } from '../src/sim/types';
import { mapWindowMode } from '../src/ui/map_window_view';
import { minimapMode } from '../src/ui/minimap_markers';
import type { IWorld } from '../src/world_api';

const TEST_WORLD = { ...BUILTIN_WORLD, camps: [], npcs: {}, groundObjects: [] };

type RiftStateEvent = Extract<SimEvent, { type: 'riftState' }>;

function riftStates(events: SimEvent[], pid: number): RiftStateEvent[] {
  return events.filter((e): e is RiftStateEvent => e.type === 'riftState' && e.pid === pid);
}

/** One player standing on floor 0 of a natural rift, with the entry events drained. */
function enterRiftSolo(): { sim: Sim; pid: number; entry: RiftStateEvent } {
  const sim = new Sim({
    seed: 99117,
    playerClass: 'warrior',
    noPlayer: true,
    autoEquip: true,
    devCommands: true,
    riftPortals: true,
    world: TEST_WORLD,
  });
  const pid = sim.addPlayer('warrior', 'Runner');
  sim.setPlayerLevel(20, pid);
  expect(spawnNaturalRiftPortal(sim.ctx, 0)).toBe(true);
  const portal = sim.entities.get(sim.naturalRiftPortals[0].id)!;
  sim.drainEvents();
  sim.enterRift(portal.riftSeed!, portal.riftBaseLevel!, pid, undefined, portal);
  const [entry] = riftStates(sim.drainEvents(), pid);
  expect(entry?.active, 'sanity: entering emits the active floor').toBe(true);
  expect(isRiftPos(sim.entities.get(pid)!.pos.x), 'sanity: standing in the rift band').toBe(true);
  return { sim, pid, entry };
}

function kill(sim: Sim, pid: number): void {
  const e = sim.entities.get(pid)!;
  e.hp = 0;
  e.dead = true;
}

// Object.create skips field initializers: seed exactly what applyRiftStateEvent
// touches (the tests/rift_collision_region_online.test.ts idiom).
function riftReadyClient(): ClientWorld {
  const client = Object.create(ClientWorld.prototype) as ClientWorld;
  const c = client as any;
  c.riftFloor = null;
  c.riftCollisionToken = allocRiftCollisionToken();
  c.riftEventExpiresAtMs = null;
  c.activeBossDeathZones = [];
  c.actionBarUploader = new ActionBarLayoutUploader((command) => c.cmd(command));
  c.sessionEnded = false;
  return client;
}

/** Replay a player's riftState stream into a client, then ask both map surfaces
 *  which mode they would paint with the player standing at `pos`. */
function onlineMapModes(
  events: RiftStateEvent[],
  pos: { x: number; y: number; z: number },
): { riftFloor: unknown; map: string; minimap: string } {
  const client = riftReadyClient();
  for (const ev of events) (client as any).applyRiftStateEvent(ev);
  const world = { riftFloor: client.riftFloor, delveRun: null, player: { pos } } as IWorld;
  return { riftFloor: client.riftFloor, map: mapWindowMode(world), minimap: minimapMode(world) };
}

describe('leaving a rift through a graveyard move clears the online rift floor', () => {
  it('a spirit release emits the rift exit, so the corpse run shows the overworld map', () => {
    const { sim, pid, entry } = enterRiftSolo();
    kill(sim, pid);
    sim.releaseSpirit(pid);
    const ghost = sim.entities.get(pid)!;
    expect(ghost.ghost, 'the spirit released').toBe(true);
    expect(isRiftPos(ghost.pos.x), 'the ghost stands at an overworld graveyard').toBe(false);

    const exits = riftStates(sim.drainEvents(), pid);
    expect(exits.map((e) => e.active)).toEqual([false]);
    expect(exits[0].instanceId).toBe(entry.instanceId);

    const modes = onlineMapModes([entry, ...exits], ghost.pos);
    expect(modes.riftFloor).toBeNull();
    expect(modes.map).toBe('overworld');
    expect(modes.minimap).toBe('overworld');
  });

  it('the ghost walking back in rebuilds the rift floor on the client', () => {
    const { sim, pid, entry } = enterRiftSolo();
    const portal = sim.entities.get(sim.naturalRiftPortals[0].id)!;
    kill(sim, pid);
    sim.releaseSpirit(pid);
    const exits = riftStates(sim.drainEvents(), pid);
    sim.enterRift(portal.riftSeed!, portal.riftBaseLevel!, pid, undefined, portal);
    const ghost = sim.entities.get(pid)!;
    expect(isRiftPos(ghost.pos.x), 'the ghost is back on the floor').toBe(true);
    const reentry = riftStates(sim.drainEvents(), pid);
    expect(reentry.map((e) => e.active)).toEqual([true]);
    const modes = onlineMapModes([entry, ...exits, ...reentry], ghost.pos);
    expect(modes.riftFloor).not.toBeNull();
    expect(modes.map).toBe('rift');
    expect(modes.minimap).toBe('rift');
  });

  // Control: replays only the entry, so it passes with or without the fix. It pins
  // the mechanism the fix relies on (the client holds its floor until an exit).
  it('control: a client that never receives an exit stays on the rift plan', () => {
    const { sim, pid, entry } = enterRiftSolo();
    kill(sim, pid);
    sim.releaseSpirit(pid);
    const modes = onlineMapModes([entry], sim.entities.get(pid)!.pos);
    expect(modes.map).toBe('rift');
    expect(modes.minimap).toBe('rift');
  });

  it('a living /unstuck out of a rift emits the rift exit', () => {
    const { sim, pid, entry } = enterRiftSolo();
    moveToGraveyardForUnstuck(sim.ctx, pid, 'none');
    const p = sim.entities.get(pid)!;
    expect(isRiftPos(p.pos.x)).toBe(false);
    const exits = riftStates(sim.drainEvents(), pid);
    expect(exits.map((e) => e.active)).toEqual([false]);
    expect(onlineMapModes([entry, ...exits], p.pos).map).toBe('overworld');
  });

  it('a dead /unstuck out of a rift emits the rift exit', () => {
    const { sim, pid, entry } = enterRiftSolo();
    kill(sim, pid);
    reviveAtGraveyardForUnstuck(sim.ctx, pid, 'none');
    const p = sim.entities.get(pid)!;
    expect(p.dead).toBe(false);
    expect(isRiftPos(p.pos.x)).toBe(false);
    const exits = riftStates(sim.drainEvents(), pid);
    expect(exits.map((e) => e.active)).toEqual([false]);
    expect(onlineMapModes([entry, ...exits], p.pos).map).toBe('overworld');
  });

  it('a release outside any rift emits no riftState at all', () => {
    const { sim } = enterRiftSolo();
    const outside = sim.addPlayer('warrior', 'Outsider');
    expect(isRiftPos(sim.entities.get(outside)!.pos.x)).toBe(false);
    sim.drainEvents();
    kill(sim, outside);
    sim.releaseSpirit(outside);
    expect(sim.entities.get(outside)!.ghost).toBe(true);
    expect(riftStates(sim.drainEvents(), outside)).toEqual([]);
  });

  it('a ghost already at the graveyard using /unstuck emits no second exit', () => {
    const { sim, pid } = enterRiftSolo();
    kill(sim, pid);
    sim.releaseSpirit(pid);
    sim.drainEvents();
    reviveAtGraveyardForUnstuck(sim.ctx, pid, 'none');
    expect(sim.entities.get(pid)!.dead).toBe(false);
    expect(riftStates(sim.drainEvents(), pid)).toEqual([]);
  });

  it('a dungeon release emits no riftState (dungeon maps are position-derived)', () => {
    const { sim } = enterRiftSolo();
    const delver = sim.addPlayer('warrior', 'Delver');
    sim.setPlayerLevel(20, delver);
    sim.enterDungeon('hollow_crypt', delver);
    expect(dungeonAt(sim.entities.get(delver)!.pos.x), 'sanity: inside the dungeon').not.toBeNull();
    sim.drainEvents();
    kill(sim, delver);
    sim.releaseSpirit(delver);
    const ghost = sim.entities.get(delver)!;
    expect(ghost.ghost).toBe(true);
    expect(dungeonAt(ghost.pos.x), 'the ghost is outside the dungeon').toBeNull();
    expect(riftStates(sim.drainEvents(), delver)).toEqual([]);
  });
});
