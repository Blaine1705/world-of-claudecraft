// The progress-events observer (server/progress_events.ts): FIFO fire-and-forget
// writes into level_up_events / ftue_events, the FTUE level gate, the death-row
// derivation from the live entity map, and the never-throw guarantee. The db
// boundary is mocked at the progress_events_db seam, so no Postgres is needed.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../server/db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) },
}));

vi.mock('../../server/progress_events_db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/progress_events_db')>();
  return {
    ...actual,
    insertLevelUpEvent: vi.fn(async () => {}),
    insertFtueEvent: vi.fn(async () => {}),
  };
});

import { zoneAt } from '../../src/sim/data';
import type { Entity } from '../../src/sim/types';
import {
  progressEventsIdle,
  recordFtueDeath,
  recordFtueQuest,
  recordLevelUp,
} from '../../server/progress_events';
import {
  FTUE_MAX_LEVEL,
  insertFtueEvent,
  insertLevelUpEvent,
} from '../../server/progress_events_db';

const insertLevelUpMock = vi.mocked(insertLevelUpEvent);
const insertFtueMock = vi.mocked(insertFtueEvent);

const who = { characterId: 42, accountId: 7 };

function fakeEntity(over: Partial<{ level: number; templateId: string; x: number; z: number }>) {
  return {
    level: over.level ?? 1,
    templateId: over.templateId ?? 'warrior',
    pos: { x: over.x ?? 0, y: 0, z: over.z ?? 0 },
  } as unknown as Entity;
}

beforeEach(() => {
  insertLevelUpMock.mockClear();
  insertFtueMock.mockClear();
  insertLevelUpMock.mockResolvedValue(undefined);
  insertFtueMock.mockResolvedValue(undefined);
});

describe('recordLevelUp', () => {
  it('records every ding with the caller identity and level', async () => {
    recordLevelUp(who, 3);
    await progressEventsIdle();
    expect(insertLevelUpMock).toHaveBeenCalledTimes(1);
    const row = insertLevelUpMock.mock.calls[0][1];
    expect(row).toMatchObject({ characterId: 42, accountId: 7, level: 3 });
    expect(row.realm.length).toBeGreaterThan(0);
  });

  it('survives a rejected insert and keeps recording later events', async () => {
    insertLevelUpMock.mockRejectedValueOnce(new Error('db down'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    recordLevelUp(who, 2);
    recordLevelUp(who, 3);
    await progressEventsIdle();
    expect(insertLevelUpMock).toHaveBeenCalledTimes(2);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe('recordFtueQuest', () => {
  it('records quest events inside the FTUE window', async () => {
    recordFtueQuest(who, 'quest_accepted', 'first_steps', 1);
    recordFtueQuest(who, 'quest_done', 'first_steps', 2);
    await progressEventsIdle();
    expect(insertFtueMock).toHaveBeenCalledTimes(2);
    expect(insertFtueMock.mock.calls[0][1]).toMatchObject({
      kind: 'quest_accepted',
      questId: 'first_steps',
      level: 1,
    });
    expect(insertFtueMock.mock.calls[1][1]).toMatchObject({ kind: 'quest_done', level: 2 });
  });

  it('drops quest events past the FTUE level gate', async () => {
    recordFtueQuest(who, 'quest_done', 'late_quest', FTUE_MAX_LEVEL + 1);
    await progressEventsIdle();
    expect(insertFtueMock).not.toHaveBeenCalled();
  });
});

describe('recordFtueDeath', () => {
  it('derives level, zone, and killer template from the entity map', async () => {
    const entities = new Map<number, Entity>([
      [5, fakeEntity({ level: 4, templateId: 'warrior', x: 10, z: 20 })],
      [900, fakeEntity({ level: 5, templateId: 'murloc_scout' })],
    ]);
    recordFtueDeath(who, { entities }, 5, 900);
    await progressEventsIdle();
    expect(insertFtueMock).toHaveBeenCalledTimes(1);
    expect(insertFtueMock.mock.calls[0][1]).toMatchObject({
      kind: 'death',
      level: 4,
      zone: zoneAt(10, 20).id,
      killer: 'murloc_scout',
    });
  });

  it('degrades a despawned killer to null instead of failing', async () => {
    const entities = new Map<number, Entity>([[5, fakeEntity({ level: 2 })]]);
    recordFtueDeath(who, { entities }, 5, 901);
    await progressEventsIdle();
    expect(insertFtueMock).toHaveBeenCalledTimes(1);
    expect(insertFtueMock.mock.calls[0][1]).toMatchObject({ kind: 'death', killer: null });
  });

  it('drops deaths past the FTUE level gate and unknown entities', async () => {
    const entities = new Map<number, Entity>([[5, fakeEntity({ level: FTUE_MAX_LEVEL + 1 })]]);
    recordFtueDeath(who, { entities }, 5, 900);
    recordFtueDeath(who, { entities }, 999, 900);
    await progressEventsIdle();
    expect(insertFtueMock).not.toHaveBeenCalled();
  });
});
