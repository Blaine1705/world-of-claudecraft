import { describe, expect, it } from 'vitest';
import { resolveMovement, resolvePosition } from '../src/sim/colliders';
import { isRiftPos, riftInstanceOrigin } from '../src/sim/data';
import { Sim } from '../src/sim/sim';
import type { Entity, SimEvent } from '../src/sim/types';

const SEED = 4242;

function makeSim() {
  return new Sim({ seed: SEED, playerClass: 'warrior', autoEquip: true, devCommands: true });
}

// Tick while keeping the player alive, so the dev tester survives the elites long
// enough to exercise the gate/descent flow (a dead, unreleased player cannot move).
function tickAlive(sim: Sim, n: number): void {
  for (let i = 0; i < n; i++) {
    sim.player.hp = sim.player.maxHp;
    sim.tick();
  }
}

function killTrash(sim: Sim): void {
  const inst = sim.riftInstances.find((i) => i.partyKey !== null);
  if (!inst) return;
  for (const id of inst.mobIds) {
    if (id === inst.bossId) continue;
    const e = sim.entities.get(id);
    if (e) {
      e.hp = 0;
      e.dead = true;
    }
  }
}

function killAll(sim: Sim): void {
  const inst = sim.riftInstances.find((i) => i.partyKey !== null);
  if (!inst) return;
  for (const id of inst.mobIds) {
    const e = sim.entities.get(id);
    if (e) {
      e.hp = 0;
      e.dead = true;
    }
  }
}

describe('rift sim: dev portal + entry', () => {
  it('/dev portal spawns a walk-through rift portal', () => {
    const sim = makeSim();
    sim.chat('/dev portal 555 12', sim.player.id);
    const portal = [...sim.entities.values()].find((e) => e.templateId === 'rift_portal');
    expect(portal).toBeTruthy();
    expect(portal?.riftSeed).toBe(555);
    expect(portal?.riftBaseLevel).toBe(12);
  });

  it('walking into the portal enters a generated floor with spawned mobs', () => {
    const sim = makeSim();
    sim.enterRift(SEED, 15, sim.player.id);
    const inst = sim.riftInstances.find((i) => i.partyKey !== null);
    expect(inst).toBeTruthy();
    expect(isRiftPos(sim.player.pos.x)).toBe(true);
    expect(inst?.mobIds.length ?? 0).toBeGreaterThan(0);
    // Spawned mobs are real, alive, and near the instance origin.
    const origin = riftInstanceOrigin(inst!.slot, inst!.floorIndex);
    for (const id of inst!.mobIds) {
      const m = sim.entities.get(id) as Entity;
      expect(m.kind).toBe('mob');
      expect(Math.abs(m.pos.x - origin.x)).toBeLessThan(60);
    }
  });

  it('registers generated collision (walls push the player back inside)', () => {
    const sim = makeSim();
    sim.enterRift(SEED, 15, sim.player.id);
    const inst = sim.riftInstances.find((i) => i.partyKey !== null)!;
    const origin = riftInstanceOrigin(inst.slot, inst.floorIndex);
    // A swept move from the centre spine outward must be stopped by the side wall
    // (max wall centre is |x|=28), not tunnel through to the target.
    const resolved = resolveMovement(
      SEED,
      origin.x,
      origin.z + 20,
      origin.x + 40,
      origin.z + 20,
      0.6,
    );
    expect(resolved.x).toBeLessThan(origin.x + 30);
  });
});

describe('rift sim: floor progression', () => {
  it('opens the descent only after the floor is cleared, then descends', () => {
    const sim = makeSim();
    sim.enterRift(SEED, 15, sim.player.id);
    const inst = sim.riftInstances.find((i) => i.partyKey !== null)!;
    expect(inst.floorIndex).toBe(0);
    expect(inst.descentOpen).toBe(false);

    // Before clearing (mobs alive): the descent stays closed.
    tickAlive(sim, 21);
    expect(inst.descentOpen).toBe(false);

    // Clear trash (and light any pylons) then tick: the descent opens.
    killTrash(sim);
    inst.litPylons = new Set(inst.pylonIds);
    tickAlive(sim, 21);
    expect(inst.descentOpen).toBe(true);
    expect(inst.descentId).not.toBeNull();

    // Walk onto the descent -> next floor.
    const desc = sim.entities.get(inst.descentId!)!;
    sim.player.pos = { ...desc.pos };
    sim.player.hp = sim.player.maxHp;
    sim.tick();
    expect(inst.floorIndex).toBe(1);
  });

  it('reaches the boss floor, and the exit opens only after the boss dies', () => {
    const sim = makeSim();
    sim.enterRift(SEED, 15, sim.player.id);
    const inst = sim.riftInstances.find((i) => i.partyKey !== null)!;

    // Descend until the boss floor (bounded loop).
    for (let guard = 0; guard < 10 && inst.floorIndex < inst.floorCount - 1; guard++) {
      killTrash(sim);
      inst.litPylons = new Set(inst.pylonIds);
      tickAlive(sim, 21);
      if (inst.descentId === null) break;
      const desc = sim.entities.get(inst.descentId)!;
      sim.player.pos = { ...desc.pos };
      sim.player.hp = sim.player.maxHp;
      sim.tick();
    }
    expect(inst.floorIndex).toBe(inst.floorCount - 1);
    expect(inst.bossId).not.toBeNull();

    // Boss alive: no exit yet.
    tickAlive(sim, 21);
    expect(inst.exitId).toBeNull();

    // Kill the boss: the exit opens.
    killAll(sim);
    tickAlive(sim, 21);
    expect(inst.exitId).not.toBeNull();

    // Walk into the exit -> back to the overworld.
    const exit = sim.entities.get(inst.exitId!)!;
    sim.player.pos = { ...exit.pos };
    sim.player.hp = sim.player.maxHp;
    sim.tick();
    expect(isRiftPos(sim.player.pos.x)).toBe(false);
  });
});

describe('rift sim: death returns to the entry zone cemetery', () => {
  function dieAndRelease(sim: Sim): void {
    sim.player.gm = false;
    sim.dealDamage(null, sim.player, 999999, false, 'physical', 'test', 'hit');
    expect(sim.player.dead).toBe(true);
    sim.releaseSpirit(sim.player.id);
    expect(sim.player.ghost).toBe(true);
  }

  it('a rift entered from Eastbrook sends the spirit to an Eastbrook graveyard (not Thornpeak)', () => {
    const sim = makeSim();
    // Enter with an Eastbrook-Vale overworld return position (zone 1, z ~ 0).
    sim.enterRift(SEED, 20, sim.player.id, { x: 0, z: 0 });
    expect(isRiftPos(sim.player.pos.x)).toBe(true);
    dieAndRelease(sim);
    // Eastbrook graveyards sit at z ~ -14/-56; Thornpeak's are z ~ 645+.
    expect(sim.player.pos.z).toBeLessThan(100);
    expect(isRiftPos(sim.player.pos.x)).toBe(false);
  });

  it('a rift entered from Thornpeak sends the spirit to a Thornpeak graveyard', () => {
    const sim = makeSim();
    // Enter with a Thornpeak-Heights overworld return position (zone 3, z ~ 838).
    sim.enterRift(SEED, 20, sim.player.id, { x: 138, z: 838 });
    dieAndRelease(sim);
    expect(sim.player.pos.z).toBeGreaterThan(500);
  });
});

describe('rift sim: generator clearance matches runtime collision', () => {
  it('spawned mobs sit on genuinely clear tiles (the real pushOut resolver does not move them)', () => {
    // Covers many floor-0 shapes (incl. tilted-wall apse/rotunda/cavern), so a
    // mismatch between the generator's isClear and colliders.ts pushOut (e.g. a
    // rotated-OBB sign flip) would surface as a spawn getting shoved on tick 1.
    for (let seed = 0; seed < 30; seed++) {
      const sim = new Sim({ seed, playerClass: 'warrior', autoEquip: true, devCommands: true });
      sim.enterRift(seed, 20, sim.player.id);
      const inst = sim.riftInstances.find((i) => i.partyKey !== null)!;
      for (const id of inst.mobIds) {
        const e = sim.entities.get(id)!;
        const res = resolvePosition(seed, e.pos.x, e.pos.z, 0.6);
        const moved = Math.hypot(res.x - e.pos.x, res.z - e.pos.z);
        expect(
          moved,
          `seed ${seed} mob ${e.templateId} @${e.pos.x},${e.pos.z} pushed ${moved}`,
        ).toBeLessThan(0.1);
      }
    }
  });
});

describe('rift sim: /dev smite one-shots mobs', () => {
  it('a smiting player deletes any mob in one hit, but the toggle is off by default', () => {
    const sim = makeSim();
    sim.enterRift(SEED, 20, sim.player.id);
    const inst = sim.riftInstances.find((i) => i.partyKey !== null)!;
    const mob = sim.entities.get(inst.mobIds[0])!;
    // Without smite, a small hit barely dents a raid-tier mob.
    sim.dealDamage(sim.player, mob, 5, false, 'physical', 'test', 'hit');
    expect(mob.dead).toBe(false);
    // Toggle smite on: the same small hit one-shots it.
    sim.chat('/dev smite', sim.player.id);
    expect(sim.player.oneShot).toBe(true);
    sim.dealDamage(sim.player, mob, 5, false, 'physical', 'test', 'hit');
    expect(mob.dead).toBe(true);
  });
});

describe('rift sim: giga bosses', () => {
  it('the final boss is huge and raid-tier tanky', () => {
    const sim = makeSim();
    sim.enterRift(SEED, 20, sim.player.id);
    const inst = sim.riftInstances.find((i) => i.partyKey !== null)!;
    // Descend to the boss floor.
    for (let guard = 0; guard < 10 && inst.floorIndex < inst.floorCount - 1; guard++) {
      for (const id of inst.mobIds) {
        if (id === inst.bossId) continue;
        const e = sim.entities.get(id);
        if (e) {
          e.hp = 0;
          e.dead = true;
        }
      }
      inst.litPylons = new Set(inst.pylonIds);
      for (let i = 0; i < 21; i++) {
        sim.player.hp = sim.player.maxHp;
        sim.tick();
      }
      if (inst.descentId === null) break;
      const desc = sim.entities.get(inst.descentId)!;
      sim.player.pos = { ...desc.pos };
      sim.player.hp = sim.player.maxHp;
      sim.tick();
    }
    const boss = sim.entities.get(inst.bossId!)!;
    expect(boss.scale).toBeGreaterThan(2.4); // towering
    expect(boss.maxHp).toBeGreaterThan(2500); // raid-tier at this level
  });
});

describe('rift sim: client-sync event', () => {
  it('emits a riftState event on entry with the descriptor', () => {
    const sim = makeSim();
    let evt: Extract<SimEvent, { type: 'riftState' }> | undefined;
    // enterRift emits during the call; capture via the next tick's drained events
    // is not possible (emit happens synchronously), so drive it through a portal.
    sim.chat('/dev portal 91 18', sim.player.id);
    const portal = [...sim.entities.values()].find((e) => e.templateId === 'rift_portal')!;
    sim.player.pos = { ...portal.pos };
    const events = sim.tick();
    for (const e of events) if (e.type === 'riftState') evt = e;
    expect(evt).toBeTruthy();
    expect(evt?.active).toBe(true);
    expect(evt?.seed).toBe(91);
    expect(evt?.baseLevel).toBe(18);
    expect(evt?.floorIndex).toBe(0);
    expect(evt?.floorCount).toBeGreaterThanOrEqual(3);
  });
});
