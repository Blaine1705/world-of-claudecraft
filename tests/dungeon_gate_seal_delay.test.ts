// The boss-room seal delay (src/sim/instances/dungeon_gates.ts): an arena
// seals BOSS_ROOM_SEAL_DELAY_SECONDS into its boss's fight, not at the pull.
// The first half drives a real claimed Hollow Crypt with a real party through
// full Sim ticks (the window, the wipe inside it, the boss dying inside it,
// the second pull, the boss walked to its own door, who is locked out); the
// second half walks every sealing gate of every dungeon through the one rule.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { rotY } from '../src/sim/collider_pushout';
import { isBlocked } from '../src/sim/colliders';
import { HOLLOW_CRYPT_GATES } from '../src/sim/content/hollow_crypt';
import { BUILTIN_WORLD, DUNGEONS, instanceOrigin } from '../src/sim/data';
import { BELL_YARD, MARROW_ID } from '../src/sim/encounters/hollow_crypt';
import { clearDungeonGateStateForTest } from '../src/sim/instances/dungeon_gate_state';
import {
  BOSS_ROOM_DOORWAY_REACH,
  BOSS_ROOM_SEAL_DELAY_SECONDS,
  BOSS_ROOM_SEAL_DELAY_TICKS,
  DUNGEON_GATE_TEMPLATES,
  dungeonGateEntity,
  dungeonGateState,
  inGateDoorway,
  tickDungeonGates,
} from '../src/sim/instances/dungeon_gates';
import { enterDungeon } from '../src/sim/instances/dungeons';
import type { InstanceSlot } from '../src/sim/sim';
import { Sim } from '../src/sim/sim';
import { DT, type DungeonGateDef, type Entity, type WorldContent } from '../src/sim/types';
import { boss, cryptFight, type Fight, put, run, tick } from './helpers/crypt_boss_fight';

vi.setConfig({ testTimeout: 120_000 });

const YARD = HOLLOW_CRYPT_GATES.find((g) => g.id === 'yard_barrier') as DungeonGateDef;
const KEEP = new Set([MARROW_ID]);
const MID = { x: BELL_YARD.x, z: BELL_YARD.z };

function state(f: Fight): string {
  return dungeonGateState(f.sim.ctx, f.inst, YARD);
}

function gateEntity(f: Fight): Entity {
  const e = dungeonGateEntity(f.sim.ctx, f.inst, YARD);
  if (!e) throw new Error('no yard barrier object');
  return e;
}

/** Is the Bone Barrier's passage walled right now (the collision view)? */
function walled(f: Fight): boolean {
  return isBlocked(f.sim.cfg.seed, f.ox + YARD.x, f.oz + YARD.z, 0.5);
}

/** Marrow's distance along the passage on his own side of the gate's line
 *  (positive inside his yard, negative once he is through the door). */
function inward(f: Fight, mob: Entity): number {
  const home = rotY(mob.spawnPos.x - f.ox - YARD.x, mob.spawnPos.z - f.oz - YARD.z, -YARD.rot);
  const at = rotY(mob.pos.x - f.ox - YARD.x, mob.pos.z - f.oz - YARD.z, -YARD.rot);
  return at.z * (home.z < 0 ? -1 : 1);
}

/** A claimed crypt with every mob but Marrow dead, so the Bone Barrier is open. */
function yard(extra = 1): { f: Fight; marrow: Entity } {
  const f = cryptFight('normal', extra, KEEP);
  const marrow = boss(f, MARROW_ID);
  marrow.maxHp = 1e6;
  marrow.hp = marrow.maxHp;
  put(f, marrow, MID.x, MID.z);
  put(f, f.tank, MID.x, MID.z - 2.5);
  for (const [i, p] of f.others.entries()) put(f, p, MID.x + 12 + i * 3, MID.z + 8);
  tick(f);
  return { f, marrow };
}

/** Hold the tank on Marrow and the others on their spots (no grave drift). */
function holder(f: Fight): () => void {
  const spots = [f.tank, ...f.others].map((p) => [p, p.pos.x - f.ox, p.pos.z - f.oz] as const);
  return () => {
    for (const [p, x, z] of spots) if (!p.dead) put(f, p, x, z);
  };
}

describe('the boss-room seal delay: the one shared rule', () => {
  it('is ten seconds, counted in sim ticks', () => {
    expect(BOSS_ROOM_SEAL_DELAY_SECONDS).toBe(10);
    expect(BOSS_ROOM_SEAL_DELAY_TICKS).toBe(200);
    expect(BOSS_ROOM_SEAL_DELAY_TICKS * DT).toBeCloseTo(BOSS_ROOM_SEAL_DELAY_SECONDS, 9);
  });

  it('reads a doorway from the side the boss lives on', () => {
    // The Bone Barrier spans x at z 93; Marrow's yard lies beyond it (z up).
    const home = { x: YARD.x, z: YARD.z + 29 };
    expect(inGateDoorway(YARD, home, { x: YARD.x, z: YARD.z + 20 })).toBe(false);
    expect(inGateDoorway(YARD, home, { x: YARD.x, z: YARD.z + BOSS_ROOM_DOORWAY_REACH })).toBe(
      true,
    );
    expect(
      inGateDoorway(YARD, home, { x: YARD.x, z: YARD.z + BOSS_ROOM_DOORWAY_REACH + 0.1 }),
    ).toBe(false);
    expect(inGateDoorway(YARD, home, { x: YARD.x, z: YARD.z - 1 })).toBe(true);
    // Far past the line, or beside the passage, is not the doorway.
    expect(inGateDoorway(YARD, home, { x: YARD.x, z: YARD.z - 12 })).toBe(false);
    expect(inGateDoorway(YARD, home, { x: YARD.x + YARD.hw + 3, z: YARD.z + 1 })).toBe(false);
    // The same gate seen from a boss living on the other side mirrors it.
    const other = { x: YARD.x, z: YARD.z - 29 };
    expect(inGateDoorway(YARD, other, { x: YARD.x, z: YARD.z - BOSS_ROOM_DOORWAY_REACH })).toBe(
      true,
    );
    expect(inGateDoorway(YARD, other, { x: YARD.x, z: YARD.z - 20 })).toBe(false);
  });
});

describe('the boss-room seal delay: Sexton Marrow and the Bone Barrier', () => {
  afterEach(() => clearDungeonGateStateForTest());

  it('stays open, on the wire and to collision, for ten seconds of the fight and then seals', () => {
    const { f, marrow } = yard();
    const keep = holder(f);
    expect(state(f)).toBe('open');
    expect(gateEntity(f).gateSealTick).toBeUndefined();
    f.sim.ctx.aggroMob(marrow, f.tank, false);
    tick(f, keep);
    // The pull is seen: the clock is set, the gate is still open.
    expect(marrow.inCombat).toBe(true);
    const lands = gateEntity(f).gateSealTick;
    expect(lands).toBeDefined();
    expect((lands as number) - f.sim.tickCount).toBe(BOSS_ROOM_SEAL_DELAY_TICKS);
    let open = 0;
    for (let i = 0; i < BOSS_ROOM_SEAL_DELAY_TICKS * 2 && state(f) === 'open'; i++) {
      // Truthful through the whole window: the readers, the mirrored template
      // and the collision view all say open.
      expect(gateEntity(f).templateId).toBe(DUNGEON_GATE_TEMPLATES.open);
      expect(walled(f)).toBe(false);
      tick(f, keep);
      open++;
    }
    expect(open).toBe(BOSS_ROOM_SEAL_DELAY_TICKS);
    expect(state(f)).toBe('sealed');
    expect(gateEntity(f).templateId).toBe(DUNGEON_GATE_TEMPLATES.sealed);
    expect(walled(f)).toBe(true);
    // It holds for the fight.
    run(f, 3, keep);
    expect(state(f)).toBe('sealed');
    expect(walled(f)).toBe(true);
  });

  it('locks out whoever is outside when it lands, until the boss resets', () => {
    const { f, marrow } = yard(1);
    const late = f.others[0];
    // The latecomer waits outside the barrier, on the far side from the yard.
    put(f, late, YARD.x, YARD.z - 6);
    const keep = holder(f);
    f.sim.ctx.aggroMob(marrow, f.tank, false);
    run(f, BOSS_ROOM_SEAL_DELAY_SECONDS + 0.5, keep);
    expect(state(f)).toBe('sealed');
    // Nobody is moved by the seal: the latecomer is where they stood, outside,
    // and the passage between them and the fight is walled.
    expect(late.pos.z - f.oz).toBeCloseTo(YARD.z - 6, 3);
    expect(walled(f)).toBe(true);
    const step = f.sim.ctx.resolveMovePoint(f.ox + YARD.x, f.oz + YARD.z, 0.5, late);
    expect(Math.hypot(step.x - (f.ox + YARD.x), step.z - (f.oz + YARD.z))).toBeGreaterThan(0.5);
  });

  it('a wipe inside the window cancels the seal: the door never shuts on the empty yard', () => {
    const { f, marrow } = yard();
    const keep = holder(f);
    f.sim.ctx.aggroMob(marrow, f.tank, false);
    run(f, 4, keep);
    expect(state(f)).toBe('open');
    expect(gateEntity(f).gateSealTick).toBeDefined();
    // Dragged to the rim first, so his walk home outlasts the rest of the window.
    put(f, marrow, MID.x + 16, MID.z);
    for (const p of [f.tank, ...f.others]) f.sim.ctx.handleDeath(p, marrow);
    let sawEvade = false;
    for (let i = 0; i < (BOSS_ROOM_SEAL_DELAY_SECONDS + 6) / DT; i++) {
      f.sim.tick();
      if (marrow.aiState === 'evade') sawEvade = true;
      expect(state(f)).toBe('open');
      expect(gateEntity(f).templateId).toBe(DUNGEON_GATE_TEMPLATES.open);
      expect(walled(f)).toBe(false);
    }
    expect(sawEvade).toBe(true);
    expect(marrow.aiState).toBe('idle');
    expect(marrow.inCombat).toBe(false);
    expect(gateEntity(f).gateSealTick).toBeUndefined();
  });

  it('the pull after a reset gets the whole ten seconds again', () => {
    const { f, marrow } = yard();
    const keep = holder(f);
    f.sim.ctx.aggroMob(marrow, f.tank, false);
    run(f, 7, keep);
    for (const p of [f.tank, ...f.others]) f.sim.ctx.handleDeath(p, marrow);
    for (let i = 0; i < 12 / DT && (marrow.aiState !== 'idle' || marrow.inCombat); i++)
      f.sim.tick();
    expect(marrow.aiState).toBe('idle');
    expect(gateEntity(f).gateSealTick).toBeUndefined();
    // The group comes back and pulls again (the tank stood back up by hand:
    // the corpse run is not what is under test).
    f.tank.dead = false;
    f.tank.ghost = false;
    f.tank.maxHp = 1e7;
    f.tank.hp = 1e7;
    put(f, f.tank, marrow.pos.x - f.ox, marrow.pos.z - f.oz - 2.5);
    const again = holder(f);
    f.sim.ctx.aggroMob(marrow, f.tank, false);
    tick(f, again);
    expect((gateEntity(f).gateSealTick as number) - f.sim.tickCount).toBe(
      BOSS_ROOM_SEAL_DELAY_TICKS,
    );
    run(f, BOSS_ROOM_SEAL_DELAY_SECONDS - 0.5, again);
    expect(state(f)).toBe('open');
    run(f, 1, again);
    expect(state(f)).toBe('sealed');
  });

  it('a boss that dies inside the window never seals its room', () => {
    const { f, marrow } = yard();
    const keep = holder(f);
    f.sim.ctx.aggroMob(marrow, f.tank, false);
    run(f, 5, keep);
    expect(state(f)).toBe('open');
    f.sim.ctx.handleDeath(marrow, f.tank);
    for (let i = 0; i < 8 / DT; i++) {
      tick(f, keep);
      expect(state(f)).toBe('open');
      expect(walled(f)).toBe(false);
    }
    expect(gateEntity(f).gateSealTick).toBeUndefined();
  });

  it('a landed seal still holds while he walks home and opens when he stands idle', () => {
    const { f, marrow } = yard();
    const keep = holder(f);
    f.sim.ctx.aggroMob(marrow, f.tank, false);
    run(f, BOSS_ROOM_SEAL_DELAY_SECONDS + 1, keep);
    expect(state(f)).toBe('sealed');
    put(f, marrow, MID.x + 16, MID.z);
    for (const p of [f.tank, ...f.others]) f.sim.ctx.handleDeath(p, marrow);
    f.sim.tick();
    f.sim.tick();
    expect(marrow.aiState).toBe('evade');
    expect(state(f)).toBe('sealed');
    expect(walled(f)).toBe(true);
    for (let i = 0; i < 12 / DT && marrow.aiState !== 'idle'; i++) f.sim.tick();
    f.sim.tick();
    expect(marrow.aiState).toBe('idle');
    expect(state(f)).toBe('open');
    expect(walled(f)).toBe(false);
  });

  it('walked to his own door inside the window, he shuts it at once and stays inside', () => {
    const { f, marrow } = yard(0);
    // The tank pulls from outside the barrier and waits there for him.
    put(f, marrow, marrow.spawnPos.x - f.ox, marrow.spawnPos.z - f.oz);
    put(f, f.tank, YARD.x, YARD.z - 7);
    const keep = (): void => put(f, f.tank, YARD.x, YARD.z - 7);
    expect(inward(f, marrow)).toBeGreaterThan(20);
    f.sim.ctx.aggroMob(marrow, f.tank, false);
    let sealedAfter = -1;
    let nearest = Infinity;
    const window = BOSS_ROOM_SEAL_DELAY_TICKS - 20;
    for (let i = 0; i < window; i++) {
      tick(f, keep);
      nearest = Math.min(nearest, inward(f, marrow));
      if (sealedAfter < 0 && state(f) === 'sealed') sealedAfter = i + 1;
    }
    // Sealed early, well inside the ten seconds, on his arrival at the door.
    expect(sealedAfter).toBeGreaterThan(0);
    expect(sealedAfter).toBeLessThan(window);
    expect(walled(f)).toBe(true);
    // He never crossed the line: the door shut with him still on his side.
    expect(nearest).toBeGreaterThan(0.9);
    expect(nearest).toBeLessThanOrEqual(BOSS_ROOM_DOORWAY_REACH + 0.01);
    expect(marrow.inCombat).toBe(true);
    expect(marrow.aiState).not.toBe('evade');
  });

  it('draws no rng and is deterministic from the seed', () => {
    const timeline = (): string => {
      const { f, marrow } = yard();
      const keep = holder(f);
      f.sim.ctx.aggroMob(marrow, f.tank, false);
      let out = '';
      for (let i = 0; i < BOSS_ROOM_SEAL_DELAY_TICKS + 20; i++) {
        tick(f, keep);
        out += state(f) === 'sealed' ? 'S' : 'o';
      }
      let draws = 0;
      f.sim.rng.setObserver(() => {
        draws++;
      });
      for (let i = 0; i < 5; i++) tickDungeonGates(f.sim.ctx);
      f.sim.rng.setObserver(null);
      expect(draws).toBe(0);
      clearDungeonGateStateForTest();
      return out;
    };
    const a = timeline();
    expect(a).toBe(timeline());
    expect(a.indexOf('S')).toBe(BOSS_ROOM_SEAL_DELAY_TICKS);
  });
});

// Every sealing gate of every dungeon rides the same rule. A real claim and the
// real gate tick, with each boss's combat flags set by hand and the tick count
// advanced directly: the gate module reads nothing else, and the bosses' own
// entrances and scripts are not what is under test here.
describe('the boss-room seal delay: every sealing gate of every dungeon', () => {
  afterEach(() => clearDungeonGateStateForTest());

  const WORLD: WorldContent = { ...BUILTIN_WORLD, camps: [], npcs: {}, groundObjects: [] };
  const SEALING = Object.values(DUNGEONS).flatMap((d) =>
    (d.gates ?? []).filter((g) => g.sealWhileEngaged).map((g) => [d.id, g.id] as const),
  );

  it('covers the five reworked dungeons', () => {
    expect(new Set(SEALING.map(([d]) => d))).toEqual(
      new Set([
        'hollow_crypt',
        'sunken_bastion',
        'drowned_temple',
        'gravewyrm_sanctum',
        'wildheart_basin',
      ]),
    );
    expect(SEALING.length).toBeGreaterThanOrEqual(17);
  });

  function claim(dungeonId: string): { sim: Sim; inst: InstanceSlot } {
    const sim = new Sim({ seed: 11, playerClass: 'warrior', noPlayer: true, world: WORLD });
    const pid = sim.addPlayer('warrior', 'Sealwalker');
    sim.setPlayerLevel(20, pid);
    expect(enterDungeon(sim.ctx, dungeonId, pid)).toBe(true);
    const inst = sim.ctx.instances.find(
      (i) => i.dungeonId === dungeonId && i.partyKey !== null,
    ) as InstanceSlot;
    return { sim, inst };
  }

  function step(sim: Sim): void {
    (sim as unknown as { tickCount: number }).tickCount++;
    tickDungeonGates(sim.ctx);
  }

  it.each(SEALING)('%s / %s: open for the window, sealed when it runs out', (dungeonId, gateId) => {
    const { sim, inst } = claim(dungeonId);
    const def = DUNGEONS[dungeonId];
    const gate = (def.gates ?? []).find((g) => g.id === gateId) as DungeonGateDef;
    const bossId = gate.sealWhileEngaged as string;
    // Everything this gate waits on is dead; its boss stands at home.
    let live: Entity | null = null;
    def.spawns.forEach((s, i) => {
      const mob = sim.ctx.entities.get(inst.mobIds[i]) as Entity;
      if (s.mobId === bossId) {
        live = mob;
        return;
      }
      mob.hp = 0;
      mob.dead = true;
      mob.aiState = 'dead';
      mob.inCombat = false;
    });
    const mob = live as Entity | null;
    if (!mob) throw new Error(`${bossId} is not in the roster`);
    const o = instanceOrigin(def.index, inst.slot);
    const walled = (): boolean => isBlocked(sim.cfg.seed, o.x + gate.x, o.z + gate.z, 0.5);
    mob.aiState = 'idle';
    mob.inCombat = false;
    step(sim);
    expect(dungeonGateState(sim.ctx, inst, gate)).toBe('open');
    expect(walled()).toBe(false);
    // The pull.
    mob.aiState = 'chase';
    mob.inCombat = true;
    step(sim);
    for (let i = 1; i < BOSS_ROOM_SEAL_DELAY_TICKS; i++) {
      expect(dungeonGateState(sim.ctx, inst, gate), `tick ${i}`).toBe('open');
      step(sim);
    }
    expect(dungeonGateState(sim.ctx, inst, gate)).toBe('open');
    expect(walled()).toBe(false);
    step(sim);
    expect(dungeonGateState(sim.ctx, inst, gate)).toBe('sealed');
    expect(dungeonGateEntity(sim.ctx, inst, gate)?.templateId).toBe(DUNGEON_GATE_TEMPLATES.sealed);
    expect(walled()).toBe(true);
    // Every gate that seals for the same boss lands on the same tick.
    for (const twin of def.gates ?? []) {
      if (twin.sealWhileEngaged === bossId)
        expect(dungeonGateState(sim.ctx, inst, twin), twin.id).toBe('sealed');
    }
    // Home and idle: open again, and the clock is gone.
    mob.aiState = 'idle';
    mob.inCombat = false;
    step(sim);
    expect(dungeonGateState(sim.ctx, inst, gate)).toBe('open');
    expect(dungeonGateEntity(sim.ctx, inst, gate)?.gateSealTick).toBeUndefined();
    expect(walled()).toBe(false);
  });
});
