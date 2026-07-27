// The slot_tool_effect dispatch case over the live GameServer wire.
//
// This exists because the case is DEV-GATED, and a gate nothing drives is a
// gate nothing protects. Slotting mints a permanent live harvest bonus for
// free (no item, no copper, no recipe, no cooldown, and re-sending refills the
// charges), and there is no acquisition craft yet, so an ungated case would BE
// the acquisition path for anyone able to send a frame. Both arms below are
// load-bearing: refused with the env unset, accepted with it set.
//
// Harness copied from tests/professions_training_online.test.ts.
import { describe, expect, it, vi } from 'vitest';

// Mock the db layer so the live GameServer suite needs no Postgres (the
// vi.mock hoisting caveat from #2088 applies: this block cannot reference
// imports).
vi.mock('../server/db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) },
  saveCharacterState: vi.fn(async () => {}),
  openPlaySession: vi.fn(async () => 1),
  touchCharacterLogin: vi.fn(async () => {}),
  closePlaySession: vi.fn(async () => {}),
  insertChatLogs: vi.fn(async () => {}),
  walletForAccount: vi.fn(async () => null),
  loadAccountFlair: vi.fn(async () => ({ ai: false, streamer: false, links: {} })),
  markAccountQuestComplete: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  grantAccountMechChroma: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  setAccountWeaponSkinLoadout: vi.fn(async () => ({
    completedQuestIds: [],
    mechChromaIds: [],
    weaponSkinIds: [],
    weaponSkinLoadout: {},
  })),
}));

import { type ClientSession, GameServer } from '../server/game';
import type { PlayerMeta } from '../src/sim/sim';
import type { SimEvent } from '../src/sim/types';

// alchemy -> the Highwatch apothecary (station_highwatch_apothecary).
const RECIPE_ID = 'recipe_volatile_flux_elixir';
const APOTHECARY_POS = { x: 7, z: 660 };

// A field spot far outside every station circle and clear of camp pulls.
const FIELD_POS = { x: 0, z: 150 };

function fakeWs(): { sent: { t: string; list?: SimEvent[]; [k: string]: unknown }[]; ws: unknown } {
  const sent: { t: string; list?: SimEvent[] }[] = [];
  return {
    sent,
    ws: { readyState: 1, send: (payload: string) => sent.push(JSON.parse(payload)) },
  };
}

function joinServer(
  server: GameServer,
  fc: ReturnType<typeof fakeWs>,
  id: number,
  name: string,
): ClientSession {
  const session = server.join(fc.ws as never, id, id, name, 'warrior', null);
  if ('error' in session) throw new Error(session.error);
  session.blockListLoaded = true;
  return session;
}

function placeAt(server: GameServer, pid: number, pos: { x: number; z: number }): void {
  const entities = (
    server.sim as unknown as {
      entities: Map<number, { pos: { x: number; z: number }; prevPos?: { x: number; z: number } }>;
    }
  ).entities;
  const entity = entities.get(pid);
  if (!entity) throw new Error(`no entity for pid ${pid}`);
  entity.pos.x = pos.x;
  entity.pos.z = pos.z;
  entity.prevPos = { x: pos.x, z: pos.z };
}

function metaOf(server: GameServer, pid: number): PlayerMeta {
  const meta = (server.sim as unknown as { players: Map<number, PlayerMeta> }).players.get(pid);
  if (!meta) throw new Error(`no meta for pid ${pid}`);
  return meta;
}

function routeTick(server: GameServer): void {
  (server as unknown as { routeEvents(e: SimEvent[]): void }).routeEvents(server.sim.tick());
}

function cmd(server: GameServer, session: ClientSession, body: Record<string, unknown>): void {
  server.handleMessage(session, JSON.stringify({ t: 'cmd', ...body }));
}

function trainResultsOf(sent: { t: string; list?: SimEvent[] }[]): SimEvent[] {
  return sent
    .filter((m) => m.t === 'events')
    .flatMap((m) => m.list ?? [])
    .filter((ev) => ev.type === 'trainResult');
}

describe('slot_tool_effect is refused on the wire unless dev commands are enabled', () => {
  const withDevCommands = (value: string | undefined, run: () => void): void => {
    const prior = process.env.ALLOW_DEV_COMMANDS;
    if (value === undefined) delete process.env.ALLOW_DEV_COMMANDS;
    else process.env.ALLOW_DEV_COMMANDS = value;
    try {
      run();
    } finally {
      if (prior === undefined) delete process.env.ALLOW_DEV_COMMANDS;
      else process.env.ALLOW_DEV_COMMANDS = prior;
    }
  };

  it('mints NOTHING on a production realm, even with a valid tool carried', () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc, 1, 'Slotter');
    const pid = session.pid as number;
    server.sim.addItem('copper_mining_pick', 1, pid);
    withDevCommands(undefined, () => {
      cmd(server, session, {
        cmd: 'slot_tool_effect',
        profession: 'mining',
        effect: 'gatherers_cache',
      });
    });
    // Absent, not empty: the whole absent-by-default contract rides on the
    // command never reaching the sim.
    expect(metaOf(server, pid).toolEffectSlots).toBeUndefined();
  });

  it('mints the slot on a dev realm, so the gate is the ONLY thing refusing it', () => {
    // Without this arm the test above would pass just as well if the command
    // were broken outright, and the gate would be proving nothing.
    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc, 1, 'DevSlotter');
    const pid = session.pid as number;
    server.sim.addItem('copper_mining_pick', 1, pid);
    withDevCommands('1', () => {
      cmd(server, session, {
        cmd: 'slot_tool_effect',
        profession: 'mining',
        effect: 'gatherers_cache',
      });
    });
    expect(metaOf(server, pid).toolEffectSlots?.mining?.effectId).toBe('gatherers_cache');
  });

  it('re-validates the payload sim-side rather than trusting the frame', () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc, 1, 'Malformed');
    const pid = session.pid as number;
    server.sim.addItem('copper_mining_pick', 1, pid);
    withDevCommands('1', () => {
      // Non-string fields fall out at the shape guard.
      cmd(server, session, { cmd: 'slot_tool_effect', profession: 42, effect: 'gatherers_cache' });
      cmd(server, session, { cmd: 'slot_tool_effect', profession: 'mining', effect: 7 });
      // Unknown ids fall out sim-side.
      cmd(server, session, {
        cmd: 'slot_tool_effect',
        profession: 'skinning',
        effect: 'gatherers_cache',
      });
      cmd(server, session, {
        cmd: 'slot_tool_effect',
        profession: 'mining',
        effect: 'no_such_effect',
      });
      expect(metaOf(server, pid).toolEffectSlots).toBeUndefined();
      // A mode outside the union is passed THROUGH and refused by the sim, so
      // the two hosts agree; laundering it to undefined here would have hit the
      // sim default and turned a refusal into a success.
      cmd(server, session, {
        cmd: 'slot_tool_effect',
        profession: 'mining',
        effect: 'gatherers_cache',
        mode: 'sometimes',
      });
      expect(metaOf(server, pid).toolEffectSlots).toBeUndefined();
      // The control: the same frame minus the bad mode does land.
      cmd(server, session, {
        cmd: 'slot_tool_effect',
        profession: 'mining',
        effect: 'gatherers_cache',
      });
      expect(metaOf(server, pid).toolEffectSlots?.mining?.confirmMode).toBe('always');
    });
  });
});
