import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  InstanceMusicController,
  type InstanceMusicEntity,
  type InstanceMusicInput,
  instanceMusicDecision,
} from '../src/game/instance_music';
import { ZONE_STREAM_URLS } from '../src/game/music_tracks';
import { DELVE_X_MIN, ZONES } from '../src/sim/data';
import { SOWFIELD_CENTER } from '../src/sim/vale_cup_layout';

const eastbrookFixture = ZONES.find((zone) => zone.id === 'eastbrook_vale');
if (!eastbrookFixture) throw new Error('eastbrook_vale fixture is missing');
const eastbrook = eastbrookFixture;

function input(overrides: Partial<InstanceMusicInput> = {}): InstanceMusicInput {
  return {
    now: 20000,
    lastCombatEventAt: 0,
    lastBossCombatEventAt: 0,
    playerId: 7,
    playerPos: { x: eastbrook.hub.x, z: eastbrook.hub.z },
    zone: eastbrook,
    inDungeon: false,
    entities: [],
    cupInfo: null,
    riftFloor: null,
    ...overrides,
  };
}

describe('instance music policy', () => {
  it('derives combat from the local aggro target without treating unrelated mobs as combat', () => {
    const unrelated: InstanceMusicEntity = {
      kind: 'mob',
      dead: false,
      templateId: 'wolf',
      aggroTargetId: 99,
    };
    const localAggro = { ...unrelated, aggroTargetId: 7 };

    expect(instanceMusicDecision(input({ entities: [unrelated] })).inCombat).toBe(false);
    expect(instanceMusicDecision(input({ entities: [localAggro] })).inCombat).toBe(true);
  });

  it('selects and resets a delve profile by its domain id', () => {
    const port = {
      resetForDungeonEntry: vi.fn(),
      update: vi.fn(),
      setBossCombat: vi.fn(),
      setSowfieldTrack: vi.fn(),
    };
    const controller = new InstanceMusicController(port);
    const delveInput = input({
      playerPos: { x: DELVE_X_MIN, z: 0 },
      inDungeon: true,
    });

    const first = controller.update(delveInput);
    controller.update(delveInput);

    expect(first.instanceId).toBe('collapsed_reliquary');
    expect(first.zone).toBe('dungeon_hollow_crypt');
    expect(port.resetForDungeonEntry).toHaveBeenCalledTimes(1);
    expect(port.resetForDungeonEntry).toHaveBeenCalledWith(
      'collapsed_reliquary',
      'dungeon_hollow_crypt',
    );
    expect(port.update).toHaveBeenLastCalledWith('dungeon_hollow_crypt', false);
  });

  it('selects the Sowfield music zone and follows its public match phase', () => {
    const waiting = instanceMusicDecision(
      input({
        playerPos: SOWFIELD_CENTER,
        cupInfo: null,
      }),
    );
    expect(waiting.atSowfield).toBe(true);
    expect(waiting.zone).toBe('vale_cup');
    expect(waiting.sowfieldTrack).toBe('waiting');

    const active = instanceMusicDecision(
      input({
        playerPos: SOWFIELD_CENTER,
        cupInfo: {
          match: { phase: 'active', origin: { x: 0, z: 0 } },
          spectate: null,
        },
      }),
    );
    expect(active.atSowfield).toBe(true);
    expect(active.zone).toBe('vale_cup');
    expect(active.sowfieldTrack).toBe('match');
  });

  it('routes private-practice phases through the Vale Cup tracks', () => {
    const practice = instanceMusicDecision(
      input({
        playerPos: { x: 30000, z: 0 },
        inDungeon: true,
        cupInfo: {
          match: { phase: 'active', origin: { x: 30000, z: 0 } },
          spectate: null,
        },
      }),
    );
    expect(practice.sowfieldTrack).toBe('match');

    const waiting = instanceMusicDecision(
      input({
        playerPos: { x: 0, z: 0 },
        cupInfo: {
          match: null,
          spectate: { phase: 'briefing', origin: { x: 0, z: 0 } },
        },
      }),
    );
    expect(waiting.sowfieldTrack).toBeNull();
  });
});

describe('the Proving Shore cue, resolved from the shipped zone record', () => {
  // The routing tests in music.test.ts feed musicZoneForLocation a hand-typed
  // zone id and biome. This one goes through the real content record and the
  // resolver the client actually calls, so a change to the island's biome,
  // its hub, or its id cannot silently drop it back onto the mainland loop.
  const islandFixture = ZONES.find((zone) => zone.id === 'proving_shore');
  if (!islandFixture) throw new Error('proving_shore fixture is missing');
  const island = islandFixture;

  const at = (x: number, z: number) =>
    instanceMusicDecision(input({ zone: island, playerPos: { x, z } })).zone;

  it('plays the island cue at Dawnrest Camp and out on the strand alike', () => {
    expect(at(island.hub.x, island.hub.z)).toBe('proving_shore');
    // The Wreck Line, the far west end of the island, well outside the hub.
    expect(at(-380, -42)).toBe('proving_shore');
  });

  it('is a different cue from the mainland vale it paints as', () => {
    // Without its own row the island would inherit its biome's cue, which is
    // the whole reason this exists: the first music a new player hears would
    // be the mainland's.
    expect(island.biome).toBe('vale');
    expect(at(island.hub.x, island.hub.z)).not.toBe('vale');
    expect(ZONE_STREAM_URLS.proving_shore).not.toBe(ZONE_STREAM_URLS.vale);
  });

  it('streams a committed file, so the island is never silent', () => {
    const url = ZONE_STREAM_URLS.proving_shore;
    expect(url).toBeTruthy();
    expect(existsSync(path.join(__dirname, '..', 'public', ...url!.split('?')[0].split('/')))).toBe(
      true,
    );
  });
});
