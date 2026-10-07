import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { BOSS_TRACK_URLS, bossTrackFor, DEFAULT_BOSS_TRACK_URL } from '../src/game/boss_music_loop';
import {
  InstanceMusicController,
  type InstanceMusicEntity,
  type InstanceMusicInput,
  instanceMusicDecision,
} from '../src/game/instance_music';
import { DUNGEONS, instanceOrigin, MOBS, ZONES } from '../src/sim/data';

const MORTHEN_URL = '/audio/music/boss_morthen.mp3?v=664edb19bfe2';

const zoneFixture = ZONES.find((zone) => zone.id === 'eastbrook_vale');
if (!zoneFixture) throw new Error('eastbrook_vale fixture is missing');
const zone = zoneFixture;
const crypt = instanceOrigin(DUNGEONS.hollow_crypt.index, 0);

function input(overrides: Partial<InstanceMusicInput> = {}): InstanceMusicInput {
  return {
    now: 20000,
    lastCombatEventAt: 0,
    lastBossCombatEventAt: 0,
    inCombat: false,
    playerId: 7,
    playerPos: { x: crypt.x, z: crypt.z },
    zone,
    inDungeon: true,
    entities: [],
    riftFloor: null,
    ...overrides,
  };
}

const morthen = (aggroTargetId: number | null): InstanceMusicEntity => ({
  kind: 'mob',
  dead: false,
  templateId: 'morthen',
  aggroTargetId,
});

describe('per-boss fight tracks', () => {
  it('gives Morthen his own committed, content-hash-versioned track', () => {
    expect(BOSS_TRACK_URLS).toEqual({ morthen: MORTHEN_URL });
    expect(MOBS.morthen).toBeDefined();
    const [asset, hash] = MORTHEN_URL.split('?v=');
    const bytes = readFileSync(path.join(__dirname, '..', 'public', asset));
    expect(createHash('sha256').update(bytes).digest('hex').slice(0, 12)).toBe(hash);
  });

  it('resolves a track only for a boss that has one', () => {
    expect(bossTrackFor('morthen')).toBe(MORTHEN_URL);
    expect(bossTrackFor('sexton_marrow')).toBeNull();
    expect(bossTrackFor('toString')).toBeNull();
  });

  it('engages the boss loop on Morthen only while he holds a target', () => {
    const idle = instanceMusicDecision(input({ entities: [morthen(null)] }));
    expect(idle.bossEngaged).toBe(false);
    expect(idle.bossTrackUrl).toBeNull();

    const fighting = instanceMusicDecision(input({ entities: [morthen(7)] }));
    expect(fighting.bossEngaged).toBe(true);
    expect(fighting.bossTrackUrl).toBe(MORTHEN_URL);

    const dead = instanceMusicDecision(input({ entities: [{ ...morthen(7), dead: true }] }));
    expect(dead.bossEngaged).toBe(false);
    expect(dead.bossTrackUrl).toBeNull();
  });

  it('keeps his track through a short aggro gap, then hands the mix back', () => {
    const port = { resetForDungeonEntry: vi.fn(), update: vi.fn(), setBossCombat: vi.fn() };
    const controller = new InstanceMusicController(port);

    controller.update(input({ now: 20000, entities: [morthen(7)] }));
    expect(port.setBossCombat).toHaveBeenLastCalledWith(true, MORTHEN_URL);

    // An immune hover drops his target for a few seconds: the track holds.
    controller.update(input({ now: 25000, entities: [morthen(null)] }));
    expect(port.setBossCombat).toHaveBeenLastCalledWith(true, MORTHEN_URL);

    // Ten seconds without a target (a wipe, a reset): back to the zone score.
    controller.update(input({ now: 30000, entities: [morthen(null)] }));
    expect(port.setBossCombat).toHaveBeenLastCalledWith(false);
  });

  it('leaves every other boss fight on the shared default loop', () => {
    const port = { resetForDungeonEntry: vi.fn(), update: vi.fn(), setBossCombat: vi.fn() };
    const controller = new InstanceMusicController(port);
    controller.update(input({ lastBossCombatEventAt: 19000 }));
    expect(port.setBossCombat).toHaveBeenLastCalledWith(true);
    expect(DEFAULT_BOSS_TRACK_URL).toBe('/audio/dungeon-boss-fight.mp3');
  });
});
