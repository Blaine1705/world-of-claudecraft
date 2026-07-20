import { describe, expect, it } from 'vitest';
import { RIFT_RARE_ITEM_IDS } from '../src/sim/content/rift/items';
import { RIFT_BOSS_IDS, RIFT_TRASH_IDS } from '../src/sim/content/rift/mobs';
import { BUILTIN_WORLD, ITEMS, MOBS, riftInstanceOrigin } from '../src/sim/data';
import { RIFT_TIER_INFO } from '../src/sim/rift/portals';
import {
  RIFT_HEROIC_MIN_MOVE_SPEED,
  RIFT_HEROIC_TUNING,
  RIFT_RANK_MECHANIC_BUDGET,
  riftFloorLevel,
  riftMechanicSuppressed,
  riftRankForBaseLevel,
} from '../src/sim/rift/ranks';
import { generateRiftFloor, isSetPieceSeed, riftFloorCount } from '../src/sim/rift/rift_gen';
import { Sim } from '../src/sim/sim';
import type { Entity, RiftTier, WorldContent } from '../src/sim/types';

// Rank-driven rift difficulty (rift/ranks.ts): the C/B/A/S level bands, the A/S
// heroic stat transform, the rank-gated boss mechanic kits (C=1 .. S=4), the
// boss-add level pin, the A/S one-shot rolling boulder, and the loot tables.

const SEED = 4242;

const RIFT_RANK_TEST_WORLD: WorldContent = {
  ...BUILTIN_WORLD,
  camps: [],
  npcs: {},
  groundObjects: [],
};

function makeSim(seed = SEED) {
  return new Sim({
    seed,
    playerClass: 'warrior',
    autoEquip: true,
    devCommands: true,
    world: RIFT_RANK_TEST_WORLD,
  });
}

function active(sim: Sim) {
  return sim.riftInstances.find((i) => i.partyKey !== null)!;
}

function tickAlive(sim: Sim, n: number): void {
  for (let i = 0; i < n; i++) {
    sim.player.hp = sim.player.maxHp;
    sim.tick();
  }
}

function killTrash(sim: Sim): void {
  const inst = active(sim);
  for (const id of inst.mobIds) {
    if (id === inst.bossId) continue;
    const e = sim.entities.get(id);
    if (e) {
      e.hp = 0;
      e.dead = true;
    }
  }
}

/** Enter a rift and descend to its boss floor (the rift_sim.test.ts recipe). */
function enterAtBossFloor(seed: number, baseLevel: number): Sim {
  const sim = makeSim(seed);
  sim.enterRift(seed, baseLevel, sim.player.id);
  const inst = active(sim);
  for (let guard = 0; guard < 10 && inst.floorIndex < inst.floorCount - 1; guard++) {
    killTrash(sim);
    inst.litPylons = new Set(inst.pylonIds);
    inst.puzzleSolved = true;
    tickAlive(sim, 21);
    if (inst.descentId === null) break;
    const desc = sim.entities.get(inst.descentId)!;
    sim.player.pos = { ...desc.pos };
    sim.player.hp = sim.player.maxHp;
    sim.tick();
  }
  expect(inst.floorIndex).toBe(inst.floorCount - 1);
  expect(inst.bossId).not.toBeNull();
  return sim;
}

/** A procedural (non-set-piece) seed whose final-floor boss is `bossId`. */
function seedWithFinalBoss(bossId: string): number {
  for (let s = 1; s < 800; s++) {
    if (isSetPieceSeed(s)) continue;
    const fc = riftFloorCount(s);
    const boss = generateRiftFloor(s, 20, fc - 1).spawns.find((sp) => sp.boss);
    if (boss?.templateId === bossId) return s;
  }
  throw new Error(`no seed found whose final boss is ${bossId}`);
}

describe('rift ranks: derivation and level bands', () => {
  it('riftRankForBaseLevel inverts the portal tier table, and budgets are 1/2/3/4', () => {
    for (const tier of ['C', 'B', 'A', 'S'] as RiftTier[]) {
      expect(riftRankForBaseLevel(RIFT_TIER_INFO[tier].baseLevel)).toBe(tier);
    }
    expect(RIFT_RANK_MECHANIC_BUDGET).toEqual({ C: 1, B: 2, A: 3, S: 4 });
  });

  it('C ramps 20..22, B/A hold 22, S runs 23..25', () => {
    expect([0, 1, 2, 3, 5].map((i) => riftFloorLevel(20, i))).toEqual([20, 21, 22, 22, 22]);
    expect([0, 3, 5].map((i) => riftFloorLevel(22, i))).toEqual([22, 22, 22]);
    expect([0, 3, 5].map((i) => riftFloorLevel(25, i))).toEqual([22, 22, 22]);
    expect([0, 1, 2, 3, 5].map((i) => riftFloorLevel(28, i))).toEqual([23, 24, 25, 25, 25]);
  });
});

describe('rift ranks: boss mechanic kits (content integrity)', () => {
  const DRIVER_KEYS = new Set([
    'aoePulse',
    'aoeSlow',
    'bigCast',
    'stoneskin',
    'stomp',
    'terrify',
    'summonAdds',
    'desperateHeal',
  ]);

  it('every rift boss lists exactly 4 distinct mechanics its template actually carries', () => {
    for (const id of RIFT_BOSS_IDS) {
      const t = MOBS[id] as unknown as Record<string, unknown>;
      const kit = MOBS[id].rankMechanics;
      expect(kit, `${id} has a rankMechanics kit`).toBeDefined();
      expect(kit, id).toHaveLength(4);
      expect(new Set(kit).size, `${id} kit keys are distinct`).toBe(4);
      for (const key of kit ?? []) {
        expect(DRIVER_KEYS.has(key), `${id} kit key ${key} has a gated driver`).toBe(true);
        expect(t[key], `${id} template carries ${key}`).toBeDefined();
      }
    }
  });

  it('suppression follows the entity budget and never touches unlisted mechanics', () => {
    const bossAt = (limit: number | undefined) =>
      ({ templateId: 'rift_boss_frost', riftMechanicLimit: limit }) as unknown as Entity;
    // Frost kit order: aoePulse, aoeSlow, stoneskin, bigCast.
    const c = bossAt(1);
    expect(riftMechanicSuppressed(c, 'aoePulse')).toBe(false);
    expect(riftMechanicSuppressed(c, 'aoeSlow')).toBe(true);
    expect(riftMechanicSuppressed(c, 'stoneskin')).toBe(true);
    expect(riftMechanicSuppressed(c, 'bigCast')).toBe(true);
    expect(riftMechanicSuppressed(c, 'enrage'), 'unlisted keys are never gated').toBe(false);
    const b = bossAt(2);
    expect(riftMechanicSuppressed(b, 'aoeSlow')).toBe(false);
    expect(riftMechanicSuppressed(b, 'stoneskin')).toBe(true);
    const s = bossAt(4);
    for (const key of ['aoePulse', 'aoeSlow', 'stoneskin', 'bigCast']) {
      expect(riftMechanicSuppressed(s, key), `S runs ${key}`).toBe(false);
    }
    const trash = bossAt(undefined);
    expect(riftMechanicSuppressed(trash, 'aoeSlow'), 'no budget = nothing gated').toBe(false);
    const nonRift = { templateId: 'wolf', riftMechanicLimit: 1 } as unknown as Entity;
    expect(riftMechanicSuppressed(nonRift, 'aoePulse'), 'no kit = nothing gated').toBe(false);
  });
});

describe('rift ranks: A/S heroic spawn scaling', () => {
  it('A/S trash takes the heroic stat transform + mechanic multipliers; C/B does not', () => {
    for (const baseLevel of [20, 22]) {
      const sim = makeSim();
      sim.enterRift(SEED, baseLevel, sim.player.id);
      const inst = active(sim);
      for (const id of inst.mobIds) {
        const m = sim.entities.get(id)!;
        expect(m.mechanicDamageMult, `C/B mob ${m.templateId}`).toBeUndefined();
        expect(m.riftMechanicLimit, 'trash carries no mechanic budget').toBeUndefined();
      }
    }
    for (const baseLevel of [25, 28]) {
      const tier = riftRankForBaseLevel(baseLevel);
      const tuning = RIFT_HEROIC_TUNING[tier]!;
      const sim = makeSim();
      sim.enterRift(SEED, baseLevel, sim.player.id);
      const inst = active(sim);
      expect(inst.mobIds.length).toBeGreaterThan(0);
      for (const id of inst.mobIds) {
        const m = sim.entities.get(id)!;
        const t = MOBS[m.templateId];
        expect(m.mechanicDamageMult, `${tier} mob ${m.templateId}`).toBe(tuning.damageMultiplier);
        expect(m.mechanicHealMult).toBe(tuning.healthMultiplier);
        expect(m.moveSpeed, 'anti-kite move-speed floor').toBeGreaterThanOrEqual(
          RIFT_HEROIC_MIN_MOVE_SPEED,
        );
        // The spawn-time template transform reached the derived stats: maxHp is
        // the elite formula over the health-multiplied template line.
        const hm = tuning.healthMultiplier;
        const expected = Math.round((t.hpBase * hm + t.hpPerLevel * hm * (m.level - 1)) * 2.3);
        expect(m.maxHp, `${tier} ${m.templateId} hp`).toBe(expected);
      }
    }
  });

  it('the boss mechanic budget follows the rank (C=1 .. S=4) on the boss floor', () => {
    const seed = seedWithFinalBoss('rift_boss_ember');
    const c = enterAtBossFloor(seed, 20);
    const cBoss = c.entities.get(active(c).bossId!)!;
    expect(cBoss.riftMechanicLimit).toBe(1);
    expect(cBoss.level, 'C boss holds the 22 cap').toBe(22);
    const s = enterAtBossFloor(seed, 28);
    const sBoss = s.entities.get(active(s).bossId!)!;
    expect(sBoss.riftMechanicLimit).toBe(4);
    expect(sBoss.level, 'S boss reaches the 25 ceiling').toBe(25);
  });
});

describe('rift ranks: rank-gated summons + the boss-add level pin', () => {
  // Ember kit order: bigCast, aoePulse, stomp, summonAdds. So the add wave is
  // its S-rank capstone: suppressed entirely at C, live at S.
  it('C suppresses the ember add wave; S fires it, with adds AT the boss level (not 50)', () => {
    const seed = seedWithFinalBoss('rift_boss_ember');

    const c = enterAtBossFloor(seed, 20);
    const cBoss = c.entities.get(active(c).bossId!)!;
    c.player.gm = true; // survive the boss so combat (and the wave window) persists
    c.player.pos = { ...cBoss.pos, z: cBoss.pos.z - 4 };
    c.player.prevPos = { ...c.player.pos };
    (c as unknown as { dealDamage: Function }).dealDamage(
      c.player,
      cBoss,
      Math.round(cBoss.maxHp * 0.5),
      false,
      'physical',
      'test',
      'hit',
      true,
    );
    tickAlive(c, 3);
    expect(cBoss.summonedIds, 'C rank never summons (mechanic 4 of 4)').toHaveLength(0);

    const s = enterAtBossFloor(seed, 28);
    const sBoss = s.entities.get(active(s).bossId!)!;
    s.player.gm = true; // survive the heroic boss so the summoned wave persists
    s.player.pos = { ...sBoss.pos, z: sBoss.pos.z - 4 };
    s.player.prevPos = { ...s.player.pos };
    (s as unknown as { dealDamage: Function }).dealDamage(
      s.player,
      sBoss,
      Math.round(sBoss.maxHp * 0.5),
      false,
      'physical',
      'test',
      'hit',
      true,
    );
    tickAlive(s, 3);
    expect(sBoss.summonedIds.length, 'S rank summons the wave').toBeGreaterThan(0);
    for (const addId of sBoss.summonedIds) {
      const add = s.entities.get(addId)!;
      // The level-50 bug: adds rolled the template band (18..60 before the fix)
      // instead of matching the dungeon. They must spawn AT the boss's level.
      expect(add.level, 'adds match the boss level').toBe(sBoss.level);
      const addMult = RIFT_HEROIC_TUNING.S?.addDamageMultiplier;
      expect(add.mechanicDamageMult, 'add mechanics take the softer multiplier').toBe(addMult);
      // The auto-attack takes the SAME softer multiplier via the spawn-time
      // template transform (never the full boss damageMultiplier).
      const t = MOBS[add.templateId];
      const swing = t.dmgBase * addMult! + t.dmgPerLevel * addMult! * (add.level - 1);
      expect(add.weapon.min, 'add swings at the add multiplier').toBe(Math.round(swing * 0.8));
    }
  });
});

describe('rift ranks: A/S one-shot rolling boulder', () => {
  function rollerSeed(): number {
    for (let s = 1; s < 800; s++) {
      const f = generateRiftFloor(s, 20, 0);
      if (!f.isBoss && f.rollers.length > 0) return s;
    }
    throw new Error('no roller seed found');
  }

  function parkInLane(sim: Sim): void {
    const inst = active(sim);
    killTrash(sim);
    const origin = riftInstanceOrigin(inst.slot, 0);
    const floor = generateRiftFloor(inst.seed, inst.baseLevel, 0);
    const lane = floor.rollers[0];
    sim.player.pos = sim.player.pos && {
      ...sim.player.pos,
      x: origin.x + lane.x,
      z: origin.z + (lane.z0 + lane.z1) / 2,
    };
    sim.player.prevPos = { ...sim.player.pos };
  }

  it('C chips a fraction of max hp; A executes outright (lava stays a burn)', () => {
    const seed = rollerSeed();

    const c = makeSim(seed);
    c.enterRift(seed, 20, c.player.id);
    parkInLane(c);
    c.player.hp = c.player.maxHp;
    for (let i = 0; i < 20 * 30 && c.player.hp === c.player.maxHp; i++) {
      parkInLane(c);
      c.tick();
    }
    expect(c.player.dead, 'a C-rank boulder is survivable').toBe(false);
    expect(c.player.hp, 'but it hurts').toBeLessThan(c.player.maxHp);

    const a = makeSim(seed);
    a.enterRift(seed, 25, a.player.id);
    parkInLane(a);
    a.player.hp = a.player.maxHp;
    for (let i = 0; i < 20 * 30 && !a.player.dead; i++) {
      parkInLane(a);
      a.tick();
    }
    expect(a.player.dead, 'an A-rank boulder is a one-shot kill').toBe(true);
  });
});

describe('rift loot: every rift creature pays out', () => {
  it('every declared rift rare resolves, is rare quality, and actually drops', () => {
    const dropped = new Set(
      [...RIFT_TRASH_IDS, ...RIFT_BOSS_IDS].flatMap((id) =>
        MOBS[id].loot.map((entry) => entry.itemId),
      ),
    );
    for (const id of RIFT_RARE_ITEM_IDS) {
      expect(ITEMS[id], id).toBeDefined();
      expect(ITEMS[id].quality, id).toBe('rare');
      expect(dropped.has(id), `${id} drops from some rift creature`).toBe(true);
    }
  });

  it('every trash template carries its themed rare + an essence trickle + coin', () => {
    for (const id of RIFT_TRASH_IDS) {
      const loot = MOBS[id].loot;
      expect(
        loot.some((e) => e.copper !== undefined && e.chance === 1),
        id,
      ).toBe(true);
      expect(
        loot.some((e) => e.itemId !== undefined && e.itemId !== 'rift_essence'),
        `${id} drops a themed rare`,
      ).toBe(true);
      expect(
        loot.some((e) => e.itemId === 'rift_essence'),
        `${id} trickles essence`,
      ).toBe(true);
    }
  });

  it('every boss carries a fat rare chance plus guaranteed essence', () => {
    for (const id of RIFT_BOSS_IDS) {
      const loot = MOBS[id].loot;
      const rare = loot.find((e) => e.itemId !== undefined && e.itemId !== 'rift_essence');
      expect(rare, `${id} drops a signature item`).toBeDefined();
      expect(rare!.chance, id).toBeGreaterThanOrEqual(0.35);
      expect(
        loot.filter((e) => e.itemId === 'rift_essence' && e.chance === 1).length,
        `${id} guarantees essence`,
      ).toBeGreaterThanOrEqual(1);
    }
    expect(MOBS.rift_boss_ritualist.loot.some((e) => e.itemId === 'pactbound_vestments')).toBe(
      true,
    );
    expect(MOBS.rift_boss_pitlord.loot.some((e) => e.itemId === 'pitlords_cleaver')).toBe(true);
  });

  it('a killed non-main boss (the citadel ritualist) leaves a lootable corpse with items', () => {
    let seed = -1;
    for (let s = 1; s < 400 && seed < 0; s++) if (isSetPieceSeed(s)) seed = s;
    expect(seed, 'found a set-piece seed').toBeGreaterThan(0);
    const sim = makeSim(seed);
    sim.enterRift(seed, 20, sim.player.id);
    const inst = active(sim);
    expect(inst.minibossId, 'the citadel halls field a miniboss').not.toBeNull();
    const mini = sim.entities.get(inst.minibossId!)!;
    sim.player.pos = { ...mini.pos, z: mini.pos.z - 3 };
    sim.player.prevPos = { ...sim.player.pos };
    (sim as unknown as { dealDamage: Function }).dealDamage(
      sim.player,
      mini,
      mini.hp + 100,
      false,
      'physical',
      'test',
      'hit',
      true,
    );
    expect(mini.dead).toBe(true);
    expect(mini.lootable, 'the miniboss corpse is lootable').toBe(true);
    const items = mini.loot?.items ?? [];
    expect(
      items.filter((i) => i.itemId === 'rift_essence').length,
      'guaranteed essence dropped',
    ).toBeGreaterThanOrEqual(2);
  });
});

describe('rift ranks: rune-reset notice rate limit', () => {
  it('standing on a wrong rune announces once per cooldown, not every tick', () => {
    let seed = -1;
    for (let s = 1; s < 800 && seed < 0; s++) {
      const f = generateRiftFloor(s, 20, 0);
      if (!f.isBoss && f.puzzle.kind === 'sequence') seed = s;
    }
    expect(seed, 'found a sequence floor').toBeGreaterThan(0);
    const sim = makeSim(seed);
    sim.enterRift(seed, 20, sim.player.id);
    const inst = active(sim);
    killTrash(sim);
    sim.player.gm = true;
    const wrongRune = sim.entities.get(inst.seqRuneIds[1])!;
    const countResets = (ticks: number): number => {
      let n = 0;
      for (let i = 0; i < ticks; i++) {
        sim.player.pos = { ...wrongRune.pos };
        sim.player.prevPos = { ...sim.player.pos };
        sim.player.hp = sim.player.maxHp;
        for (const ev of sim.tick()) {
          if (ev.type === 'log' && ev.text === 'The runes go dark. Begin again.') n++;
        }
      }
      return n;
    };
    // The bug: 20 notices per second while standing still. Now: one on arrival...
    expect(countResets(40), 'one notice in the first two seconds').toBe(1);
    // ...and at most a couple more across the next ten (the 4s cooldown cadence).
    const later = countResets(200);
    expect(later).toBeGreaterThanOrEqual(1);
    expect(later).toBeLessThanOrEqual(3);
  });

  it('a reset that wipes real progress announces immediately, cooldown or not', () => {
    let seed = -1;
    for (let s = 1; s < 800 && seed < 0; s++) {
      const f = generateRiftFloor(s, 20, 0);
      if (
        !f.isBoss &&
        f.puzzle.kind === 'sequence' &&
        f.objects.filter((o) => o.kind === 'seq_rune').length >= 3
      )
        seed = s;
    }
    const sim = makeSim(seed);
    sim.enterRift(seed, 20, sim.player.id);
    const inst = active(sim);
    killTrash(sim);
    sim.player.gm = true;
    const stepOnto = (i: number): ReturnType<Sim['tick']> => {
      const rune = sim.entities.get(inst.seqRuneIds[i])!;
      sim.player.pos = { ...rune.pos };
      sim.player.prevPos = { ...sim.player.pos };
      sim.player.hp = sim.player.maxHp;
      return sim.tick();
    };
    // Trip the no-progress notice (stamps the cooldown)...
    stepOnto(1);
    expect(inst.seqStep).toBe(0);
    // ...then advance legitimately and wipe: the wipe must announce despite the
    // ticking cooldown, because progress was actually lost.
    stepOnto(0);
    expect(inst.seqStep).toBe(1);
    const events = stepOnto(2);
    expect(inst.seqStep).toBe(0);
    expect(
      events.some((e) => e.type === 'log' && e.text === 'The runes go dark. Begin again.'),
    ).toBe(true);
  });
});
