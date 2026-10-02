// The Stormbrass Foundry as a registered dungeon (docs/design/dungeon-rework/
// stormbrass_foundry.md sections 2 and 11): its record, its door in Stormcrag,
// its finder rows and tuning rows, the gates and seals as live claim state
// (opening on the right deaths, sealing while a boss is engaged), the premature
// final-boss pull that wakes the whole shelf, and the /dev foundry jumps.

import { describe, expect, it } from 'vitest';
import {
  HEROIC_DUNGEON_TUNING,
  NORMAL_DUNGEON_TUNING,
} from '../src/sim/content/dungeon_difficulty';
import { finderActivity } from '../src/sim/content/dungeon_finder';
import {
  STORMBRASS_FOUNDRY_BOSSES,
  STORMBRASS_FOUNDRY_DOOR,
  STORMBRASS_FOUNDRY_GATES,
} from '../src/sim/content/stormbrass_foundry';
import { DUNGEONS, instanceOrigin, instanceOriginX, MOBS } from '../src/sim/data';
import {
  handleStormbrassFoundryDevChat,
  STORMBRASS_FOUNDRY_DEV_AREAS,
} from '../src/sim/dev/stormbrass_foundry_dev';
import { dungeonGateStateOf } from '../src/sim/instances/dungeon_gates';
import { claimedInstanceAt } from '../src/sim/instances/dungeons';
import { Sim } from '../src/sim/sim';
import { DT, type Entity } from '../src/sim/types';
import { groundHeight } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

const ID = 'stormbrass_foundry';

/** Run a `/dev foundry` line straight through its handler (the chat token
 *  bucket would throttle a burst of test commands). */
function dev(sim: Sim, me: Entity, rest: string): void {
  handleStormbrassFoundryDevChat(sim.ctx, `/dev foundry ${rest}`, me.id);
}

function enter(difficulty: 'normal' | 'heroic' = 'normal') {
  const sim = new Sim({ seed: 11, playerClass: 'warrior', autoEquip: false, devCommands: true });
  const me = sim.player;
  sim.chat('/dev level 20', me.id);
  dev(sim, me, `enter ${difficulty}`);
  const inst = claimedInstanceAt(sim.ctx, me.pos);
  if (!inst) throw new Error('no foundry claim');
  return { sim, me, inst };
}

function rosterOf(sim: Sim, inst: { mobIds: number[] }, templateId: string): Entity {
  for (const id of inst.mobIds) {
    const e = sim.ctx.entities.get(id);
    if (e?.templateId === templateId) return e;
  }
  throw new Error(`no ${templateId}`);
}

function gateState(
  sim: Sim,
  inst: { objectIds: number[]; slot: number },
  gateId: string,
): string | null {
  const gate = STORMBRASS_FOUNDRY_GATES.find((g) => g.id === gateId);
  if (!gate) throw new Error(gateId);
  const o = instanceOrigin(DUNGEONS[ID].index, inst.slot);
  for (const id of inst.objectIds) {
    const e = sim.ctx.entities.get(id);
    if (!e) continue;
    if (Math.abs(e.pos.x - o.x - gate.x) < 0.75 && Math.abs(e.pos.z - o.z - gate.z) < 0.75)
      return dungeonGateStateOf(e.templateId);
  }
  return null;
}

function tick(sim: Sim, seconds: number): void {
  for (let t = 0; t < seconds - DT * 0.5; t += DT) sim.tick();
}

describe('the Stormbrass Foundry record', () => {
  it('is a new five-player open-air dungeon in the overflow band', () => {
    const d = DUNGEONS[ID];
    expect(d.name).toBe('The Stormbrass Foundry');
    expect(d.index).toBe(15);
    expect(d.interior).toBe(ID);
    expect(d.suggestedPlayers).toBe(5);
    expect(d.bossChainPull).toBe(true);
    expect(d.gates).toHaveLength(8);
    // The only dungeon on its index, and its origin clear of every other.
    for (const other of Object.values(DUNGEONS)) {
      if (other.id === ID) continue;
      expect(other.index, other.id).not.toBe(d.index);
      expect(Math.abs(instanceOriginX(other.index) - instanceOriginX(d.index))).toBeGreaterThan(
        240,
      );
    }
  });

  it('opens its door at the foot of the storm line in Stormcrag, on walkable ground', () => {
    const door = DUNGEONS[ID].doorPos;
    expect(door).toEqual(STORMBRASS_FOUNDRY_DOOR);
    // Thornpeak Heights, near the Stormcrag POI (110, 760), clear of its camp
    // (radius 20) plus a whole aggro clamp, and of the Gravewyrm Sanctum gate.
    expect(door.z).toBeGreaterThanOrEqual(540);
    expect(door.z).toBeLessThan(900);
    expect(Math.hypot(door.x - 110, door.z - 760)).toBeGreaterThan(40);
    expect(Math.hypot(door.x - 110, door.z - 760)).toBeLessThan(60);
    expect(Math.hypot(door.x - 0, door.z - 858)).toBeGreaterThan(100);
    // The ground round the door is a gentle slope a player walks up.
    const h = groundHeight(door.x, door.z, WORLD_SEED);
    for (const [dx, dz] of [
      [4, 0],
      [-4, 0],
      [0, 4],
      [0, -4],
    ])
      expect(Math.abs(groundHeight(door.x + dx, door.z + dz, WORLD_SEED) - h)).toBeLessThan(3);
  });

  it('lists four bosses, the Prime Draft the only one flagged final', () => {
    expect(STORMBRASS_FOUNDRY_BOSSES).toEqual([
      'line_master_tock',
      'rangewarden',
      'voltaic_warden',
      'prime_draft',
    ]);
    for (const id of STORMBRASS_FOUNDRY_BOSSES) {
      expect(MOBS[id].ccImmune, id).toBe(true);
      expect(MOBS[id].slowImmune, id).toBe(true);
      expect(MOBS[id].boss === true, id).toBe(id === 'prime_draft');
    }
    expect(MOBS.line_master_tock.name).toBe('Line-Master Ambrel Tock');
  });

  it('carries a finder row per difficulty (19 to 20 normal, 20 heroic)', () => {
    const normal = finderActivity('stormbrass_foundry_normal');
    const heroic = finderActivity('stormbrass_foundry_heroic');
    expect([normal?.minLevel, normal?.maxLevel, normal?.lockout]).toEqual([19, 20, 'none']);
    expect([heroic?.minLevel, heroic?.maxLevel, heroic?.lockout]).toEqual([20, 20, 'daily']);
    expect(normal?.encounters.map((e) => e.mobId)).toEqual([...STORMBRASS_FOUNDRY_BOSSES]);
    expect(normal?.encounters.find((e) => e.final)?.mobId).toBe('prime_draft');
  });

  it('carries a normal and a heroic tuning row ending on the Prime Draft', () => {
    expect(NORMAL_DUNGEON_TUNING[ID]?.difficulty).toBe('normal');
    expect(HEROIC_DUNGEON_TUNING[ID]?.level).toBe(22);
    expect(HEROIC_DUNGEON_TUNING[ID]?.finalBossId).toBe('prime_draft');
  });
});

describe('the Foundry claim: gates follow the deaths', () => {
  it('claims every placement and one gate object per gate, all shut', () => {
    const { sim, inst } = enter();
    expect(inst.mobIds.length).toBe(DUNGEONS[ID].spawns.length);
    for (const g of STORMBRASS_FOUNDRY_GATES)
      expect(gateState(sim, inst, g.id), g.id).toBe('closed');
  });

  it('the Yard Shutter opens on the yard packs and the Hauler, the wings on Tock', () => {
    const { sim, me, inst } = enter();
    dev(sim, me, 'kill g1');
    dev(sim, me, 'kill g2');
    tick(sim, 0.2);
    expect(gateState(sim, inst, 'yard_shutter')).toBe('closed');
    dev(sim, me, 'kill pa');
    tick(sim, 0.2);
    expect(gateState(sim, inst, 'yard_shutter')).toBe('open');
    expect(gateState(sim, inst, 'range_shutter')).toBe('closed');
    dev(sim, me, 'kill tock');
    tick(sim, 0.2);
    expect(gateState(sim, inst, 'range_shutter')).toBe('open');
    expect(gateState(sim, inst, 'coil_shutter')).toBe('open');
    expect(gateState(sim, inst, 'crane_bridge')).toBe('closed');
    dev(sim, me, 'kill rangewarden');
    tick(sim, 0.2);
    expect(gateState(sim, inst, 'crane_bridge')).toBe('closed');
    dev(sim, me, 'kill voltaic');
    tick(sim, 0.2);
    expect(gateState(sim, inst, 'crane_bridge')).toBe('open');
  });

  it('the Line Shutter seals behind the group while the Line-Master is engaged', () => {
    const { sim, me, inst } = enter();
    for (const p of ['g1', 'g2', 'pa', 'g3', 'g4']) dev(sim, me, `kill ${p}`);
    tick(sim, 0.2);
    expect(gateState(sim, inst, 'line_shutter')).toBe('open');
    const tock = rosterOf(sim, inst, 'line_master_tock');
    me.maxHp = 1e7;
    me.hp = 1e7;
    dev(sim, me, 'tp tock');
    sim.ctx.aggroMob(tock, me, false);
    tick(sim, 0.5);
    expect(gateState(sim, inst, 'line_shutter')).toBe('sealed');
  });
});

describe('bossChainPull: the Prime Draft wakes the whole shelf', () => {
  it('pulling the final boss early pulls every idle living mob of the claim', () => {
    const { sim, me, inst } = enter();
    me.maxHp = 1e7;
    me.hp = 1e7;
    dev(sim, me, 'gates');
    dev(sim, me, 'tp prime');
    const prime = rosterOf(sim, inst, 'prime_draft');
    const sentry = rosterOf(sim, inst, 'brass_sentry');
    expect(sentry.aiState).toBe('idle');
    sim.ctx.aggroMob(prime, me, false);
    expect(sentry.aiState).not.toBe('idle');
    expect(sentry.aggroTargetId).toBe(me.id);
  });

  it('a mid boss pull never wakes the wings (only the final boss chains)', () => {
    const { sim, me, inst } = enter();
    me.maxHp = 1e7;
    me.hp = 1e7;
    dev(sim, me, 'gates');
    dev(sim, me, 'tp tock');
    const tock = rosterOf(sim, inst, 'line_master_tock');
    sim.ctx.aggroMob(tock, me, false);
    for (const id of inst.mobIds) {
      const e = sim.ctx.entities.get(id);
      if (!e || e.templateId !== 'shieldbearer_frame') continue;
      expect(e.aiState).toBe('idle');
    }
  });
});

describe('/dev foundry tp: a jump to every area and boss', () => {
  const { sim, me, inst } = enter();
  for (const [alias, templateId] of [
    ['tock', 'line_master_tock'],
    ['rangewarden', 'rangewarden'],
    ['voltaic', 'voltaic_warden'],
    ['prime', 'prime_draft'],
  ] as const) {
    it(`${alias} lands beside ${templateId}, on its floor, out of its reach`, () => {
      dev(sim, me, `tp ${alias}`);
      const boss = rosterOf(sim, inst, templateId);
      const d = Math.hypot(me.pos.x - boss.pos.x, me.pos.z - boss.pos.z);
      expect(d).toBeLessThan(45);
      expect(d).toBeGreaterThan(15);
      expect(Math.abs(me.pos.y - boss.pos.y)).toBeLessThan(3);
    });
  }

  it('every named area lands on walkable ground inside the claim', () => {
    const o = instanceOrigin(DUNGEONS[ID].index, inst.slot);
    for (const [area, spot] of Object.entries(STORMBRASS_FOUNDRY_DEV_AREAS)) {
      dev(sim, me, `tp ${area}`);
      expect(Math.hypot(me.pos.x - o.x - spot.x, me.pos.z - o.z - spot.z), area).toBeLessThan(1);
      expect(me.pos.y, area).toBeGreaterThan(-1);
      expect(claimedInstanceAt(sim.ctx, me.pos), area).toBe(inst);
    }
  });

  it('/dev foundry pack lands beside a pack on its own floor', () => {
    const o = instanceOrigin(DUNGEONS[ID].index, inst.slot);
    for (const pack of ['g1', 'g7', 'g8', 'g13', 'pc']) {
      dev(sim, me, `pack ${pack}`);
      const spawn = DUNGEONS[ID].spawns.find((s) => s.packId === pack);
      if (!spawn) throw new Error(pack);
      expect(Math.hypot(me.pos.x - o.x - spawn.x, me.pos.z - o.z - spawn.z), pack).toBeLessThan(17);
      const floor = sim.ctx.groundPos(o.x + spawn.x, o.z + spawn.z).y;
      expect(Math.abs(me.pos.y - floor), pack).toBeLessThan(2);
    }
  });

  it('/dev foundry reset claims a fresh run with every gate shut again', () => {
    dev(sim, me, 'kill all');
    tick(sim, 0.2);
    dev(sim, me, 'reset');
    const fresh = claimedInstanceAt(sim.ctx, me.pos);
    expect(fresh).not.toBeNull();
    if (!fresh) return;
    for (const id of fresh.mobIds) expect(sim.ctx.entities.get(id)?.dead, String(id)).toBe(false);
  });
});

describe('/dev foundry trigger: every boss mechanic fires on demand', () => {
  const BY_BOSS: Record<string, string[]> = {
    line_master_tock: ['lever', 'press', 'parts', 'rivet', 'vents'],
    rangewarden: ['lock', 'proof', 'drones'],
    voltaic_warden: ['flip', 'discharge', 'platedrones', 'lash', 'strike'],
    prime_draft: ['cell', 'overload', 'fist', 'sweep', 'unbolt', 'tremor', 'heartless', 'surge'],
  };
  for (const [templateId, mechanics] of Object.entries(BY_BOSS)) {
    it(`${templateId}: ${mechanics.join(', ')}`, () => {
      const { sim, me, inst } = enter();
      // A second player so a mark always has a non-tank target.
      const pid = sim.addPlayer('mage', 'Triggerhand');
      const mate = sim.ctx.entities.get(pid) as Entity;
      const boss = rosterOf(sim, inst, templateId);
      for (const p of [me, mate]) {
        p.maxHp = 1e7;
        p.hp = 1e7;
        p.pos = sim.ctx.groundPos(boss.pos.x + 3, boss.pos.z + 3);
        p.prevPos = { ...p.pos };
      }
      boss.maxHp = 1e6;
      boss.hp = 1e6;
      sim.ctx.aggroMob(boss, me, false);
      for (let i = 0; i < 2; i++) sim.tick();
      for (const what of mechanics) {
        sim.drainEvents();
        dev(sim, me, `trigger ${what}`);
        const lines = sim
          .drainEvents()
          .filter((e) => e.type === 'log')
          .map((e) => (e as { text: string }).text);
        expect(
          lines.some((t) => t.startsWith('[dev] ')),
          what,
        ).toBe(true);
        expect(
          lines.some((t) => t.includes('Mechanics:') || t.includes('first.')),
          what,
        ).toBe(false);
        sim.tick();
      }
    });
  }
});
