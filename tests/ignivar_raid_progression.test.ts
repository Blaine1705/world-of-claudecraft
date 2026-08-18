import { describe, expect, it } from 'vitest';
import { DUNGEONS } from '../src/sim/data';
import { INTERIOR_LAYOUTS } from '../src/sim/dungeon_floor';
import { IGNIVAR_SECOND_WING_LAYOUT } from '../src/sim/dungeon_layout';
import {
  IGNIVAR_GATE_LOCKED_TEMPLATE,
  IGNIVAR_RAID_ARENA_ID,
  IGNIVAR_SECOND_WING_ID,
} from '../src/sim/ignivar_raid_ids';
import { enterDungeon, updateDoorTriggers } from '../src/sim/instances/dungeons';
import { Sim } from '../src/sim/sim';
import { IGNIVAR_BOSS_ID } from '../src/sim/types';

function claimedRaid(difficulty: 'normal' | 'heroic' = 'normal') {
  const sim = new Sim({ seed: 3410, playerClass: 'warrior', devCommands: true });
  sim.chat(`/dev dungeon ignivar_raid_arena ${difficulty}`);
  sim.chat('/dev ignivarraid');
  const boss = [...sim.entities.values()].find((entity) => entity.templateId === IGNIVAR_BOSS_ID);
  const gate = [...sim.entities.values()].find(
    (entity) =>
      entity.templateId === IGNIVAR_GATE_LOCKED_TEMPLATE &&
      entity.dungeonId === IGNIVAR_SECOND_WING_ID,
  );
  if (!boss || !gate) throw new Error('Ignivar raid progression fixtures did not spawn');
  return { sim, boss, gate };
}

function teleport(sim: Sim, entityId: number, pos: { x: number; z: number }): void {
  const entity = sim.entities.get(entityId);
  if (!entity) throw new Error(`Missing entity ${entityId}`);
  entity.pos = sim.groundPos(pos.x, pos.z);
  entity.prevPos = { ...entity.pos };
  sim.rebucket(entity);
}

function reapEmptyInstances(sim: Sim): void {
  sim.tickCount = 20;
  for (let second = 0; second <= 300; second++) {
    (sim as unknown as { updateInstances(): void }).updateInstances();
  }
}

describe('Ignivar raid progression', () => {
  it('authors a separate, hidden second encounter room', () => {
    expect(DUNGEONS[IGNIVAR_SECOND_WING_ID]).toMatchObject({
      id: IGNIVAR_SECOND_WING_ID,
      overworldDoor: false,
      guideVisible: false,
      interior: 'ignivar_depths',
      suggestedPlayers: 10,
    });
    expect(DUNGEONS[IGNIVAR_SECOND_WING_ID].spawns).toEqual([]);
    expect(INTERIOR_LAYOUTS.ignivar_depths).toBe(IGNIVAR_SECOND_WING_LAYOUT);
    expect(IGNIVAR_SECOND_WING_LAYOUT.shellPolygon).toHaveLength(12);
    expect(IGNIVAR_SECOND_WING_LAYOUT.floorHalfX).toBe(40);
    expect(IGNIVAR_SECOND_WING_LAYOUT.pillars).toEqual([]);
  });

  it.each(['normal', 'heroic'] as const)(
    'keeps the gate locked, then walks into the %s wing with source difficulty',
    (difficulty) => {
      const { sim, boss, gate } = claimedRaid(difficulty);
      const opposite = difficulty === 'normal' ? 'heroic' : 'normal';
      sim.setDungeonDifficulty(opposite);
      expect(sim.dungeonDifficulty()).toBe(opposite);
      const source = sim.instances.find(
        (instance) => instance.dungeonId === IGNIVAR_RAID_ARENA_ID && instance.partyKey !== null,
      );
      expect(source?.difficulty).toBe(difficulty);
      expect(gate.templateId).toBe(IGNIVAR_GATE_LOCKED_TEMPLATE);

      teleport(sim, sim.player.id, gate.pos);
      updateDoorTriggers(sim.ctx, sim.player);
      expect(sim.instanceInfoAt(sim.player.pos)?.dungeonId).toBe(IGNIVAR_RAID_ARENA_ID);

      boss.dead = true;
      boss.hp = 0;
      sim.tick();

      expect(gate.templateId).toBe('dungeon_door');
      updateDoorTriggers(sim.ctx, sim.player);
      expect(sim.instanceInfoAt(sim.player.pos)?.dungeonId).toBe(IGNIVAR_SECOND_WING_ID);
      expect(
        sim.instances.find(
          (instance) => instance.dungeonId === IGNIVAR_SECOND_WING_ID && instance.partyKey !== null,
        )?.difficulty,
      ).toBe(difficulty);
    },
  );

  it('denies second-wing entry independently for a foreign claim and an outside player', () => {
    const { sim, boss } = claimedRaid();
    const source = sim.instances.find(
      (instance) => instance.dungeonId === IGNIVAR_RAID_ARENA_ID && instance.partyKey !== null,
    );
    if (!source?.partyKey) throw new Error('Ignivar source claim did not form');
    boss.dead = true;
    boss.hp = 0;
    sim.tick();

    const ownerKey = source.partyKey;
    source.partyKey = 'party:foreign';
    expect(enterDungeon(sim.ctx, IGNIVAR_SECOND_WING_ID, sim.player.id)).toBe(false);
    source.partyKey = ownerKey;

    teleport(sim, sim.player.id, { x: 0, z: 0 });
    expect(enterDungeon(sim.ctx, IGNIVAR_SECOND_WING_ID, sim.player.id)).toBe(false);
  });

  it('requires a raid group even after a solo dev tester defeats Ignivar', () => {
    const sim = new Sim({ seed: 3411, playerClass: 'warrior', devCommands: true });
    sim.chat(`/dev dungeon ${IGNIVAR_RAID_ARENA_ID} normal`);
    const boss = [...sim.entities.values()].find((entity) => entity.templateId === IGNIVAR_BOSS_ID);
    if (!boss) throw new Error('Solo Ignivar did not spawn');
    boss.dead = true;
    boss.hp = 0;
    sim.tick();

    expect(enterDungeon(sim.ctx, IGNIVAR_SECOND_WING_ID, sim.player.id)).toBe(false);
    expect(sim.instanceInfoAt(sim.player.pos)?.dungeonId).toBe(IGNIVAR_RAID_ARENA_ID);
  });

  it('keeps either linked room alive while the raid occupies its sibling', () => {
    const { sim, boss } = claimedRaid();
    boss.dead = true;
    boss.hp = 0;
    sim.tick();

    const party = sim.partyOf(sim.player.id);
    if (!party) throw new Error('Practice raid did not form');
    for (const pid of party.members) {
      expect(enterDungeon(sim.ctx, IGNIVAR_SECOND_WING_ID, pid)).toBe(true);
    }

    reapEmptyInstances(sim);

    const source = sim.instances.find(
      (instance) => instance.dungeonId === IGNIVAR_RAID_ARENA_ID && instance.partyKey !== null,
    );
    expect(source).toBeDefined();
    expect(sim.entities.get(boss.id)?.dead).toBe(true);

    for (const pid of party.members) {
      expect(enterDungeon(sim.ctx, IGNIVAR_RAID_ARENA_ID, pid)).toBe(true);
    }
    reapEmptyInstances(sim);
    expect(
      sim.instances.find(
        (instance) => instance.dungeonId === IGNIVAR_SECOND_WING_ID && instance.partyKey !== null,
      ),
    ).toBeDefined();
  });

  it('frees both empty rooms and reclaims a fresh locked Ignivar run', () => {
    const { sim, boss } = claimedRaid();
    boss.dead = true;
    boss.hp = 0;
    sim.tick();
    const party = sim.partyOf(sim.player.id);
    if (!party) throw new Error('Practice raid did not form');
    for (const pid of party.members) {
      expect(enterDungeon(sim.ctx, IGNIVAR_SECOND_WING_ID, pid)).toBe(true);
      teleport(sim, pid, { x: 0, z: 0 });
    }

    reapEmptyInstances(sim);
    expect(
      sim.instances.filter(
        (instance) =>
          (instance.dungeonId === IGNIVAR_RAID_ARENA_ID ||
            instance.dungeonId === IGNIVAR_SECOND_WING_ID) &&
          instance.partyKey !== null,
      ),
    ).toEqual([]);

    sim.chat(`/dev dungeon ${IGNIVAR_RAID_ARENA_ID} normal`);
    const freshGate = [...sim.entities.values()].find(
      (entity) =>
        entity.templateId === IGNIVAR_GATE_LOCKED_TEMPLATE &&
        entity.dungeonId === IGNIVAR_SECOND_WING_ID,
    );
    expect(freshGate).toBeDefined();
    expect(enterDungeon(sim.ctx, IGNIVAR_SECOND_WING_ID, sim.player.id)).toBe(false);
  });
});
