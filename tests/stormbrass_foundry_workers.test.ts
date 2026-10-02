// The Stormbrass Foundry's chained workers (src/sim/content/
// stormbrass_foundry_workers.ts, src/sim/encounters/stormbrass_foundry/
// workers.ts): three guarded scrap camps whose miners and haulers are pure
// decoration until their guards fall; then "Free them" strikes the chains, the
// workers cheer, walk off toward the lift and vanish. Every quest holder in
// the run is credited per camp, and freeing all three earns the deed.

import { describe, expect, it } from 'vitest';
import { STORMBRASS_FOUNDRY_SPAWNS } from '../src/sim/content/stormbrass_foundry';
import { STORMBRASS_FOUNDRY_FIELD } from '../src/sim/content/stormbrass_foundry_layout';
import {
  LIFT_WARDEN_ENTITY_ID,
  STORMBRASS_FOUNDRY_QUEST_ORDER,
} from '../src/sim/content/stormbrass_foundry_quests';
import {
  FOUNDRY_WORKER_CAMP_COUNT,
  FOUNDRY_WORKER_CAMP_TEMPLATES,
  FOUNDRY_WORKER_CAMPS,
  FOUNDRY_WORKER_MOBS,
  FOUNDRY_WORKER_TEMPLATES,
  FOUNDRY_WORKERS_DEED,
  FOUNDRY_WORKERS_QUEST,
  FOUNDRY_WORKERS_QUEST_ID,
  foundryWorkerCampProps,
} from '../src/sim/content/stormbrass_foundry_workers';
import { DEEDS } from '../src/sim/content/deeds';
import { DUNGEONS, instanceOrigin, MOBS, QUESTS } from '../src/sim/data';
import {
  FOUNDRY_WORKER_LINES,
  FREED_LEAVE_SECONDS,
  foundryWorkerCampObjects,
} from '../src/sim/encounters/stormbrass_foundry/workers';
import { authoredFieldHeight } from '../src/sim/instances/authored_field';
import { claimedInstanceAt, enterDungeon } from '../src/sim/instances/dungeons';
import type { InstanceSlot } from '../src/sim/sim';
import { Sim } from '../src/sim/sim';
import { DT, type Entity, type SimEvent } from '../src/sim/types';
import { foundryWorkerGossip } from '../src/ui/hud/dungeon/foundry_worker_gossip_core';

interface Run {
  sim: Sim;
  inst: InstanceSlot;
  ox: number;
  oz: number;
  tank: Entity;
  others: Entity[];
  events: SimEvent[];
}

/** A claimed Foundry run with a party of three, one tick in (the camps are up). */
function freshRun(extra = 2): Run {
  const sim = new Sim({ seed: 31, playerClass: 'warrior', autoEquip: false, devCommands: true });
  const tank = sim.player;
  sim.chat('/dev level 20', tank.id);
  const ids: number[] = [];
  for (let i = 0; i < extra; i++) {
    const pid = sim.addPlayer('mage', `Chainbreaker${i}`);
    sim.partyInvite(pid, tank.id);
    sim.partyAccept(pid);
    ids.push(pid);
  }
  sim.chat('/dev foundry enter', tank.id);
  for (const pid of ids) enterDungeon(sim.ctx, 'stormbrass_foundry', pid);
  const inst = claimedInstanceAt(sim.ctx, tank.pos);
  if (!inst) throw new Error('no foundry claim');
  const o = instanceOrigin(DUNGEONS.stormbrass_foundry.index, inst.slot);
  const others = ids.map((pid) => sim.ctx.entities.get(pid) as Entity);
  for (const p of [tank, ...others]) {
    p.maxHp = 1e7;
    p.hp = 1e7;
  }
  sim.tick();
  sim.drainEvents();
  return { sim, inst, ox: o.x, oz: o.z, tank, others, events: [] };
}

function tick(r: Run, seconds: number): void {
  for (let t = 0; t < seconds - DT * 0.5; t += DT) {
    for (const p of [r.tank, ...r.others]) if (p.hp < 1e5) p.hp = 1e6;
    r.events.push(...r.sim.tick());
  }
}

function put(r: Run, e: Entity, x: number, z: number): void {
  e.pos = r.sim.ctx.groundPos(r.ox + x, r.oz + z);
  e.prevPos = { ...e.pos };
  r.sim.ctx.grid.update(e);
}

function camp(r: Run, id: 'A' | 'B' | 'C'): Entity {
  const obj = foundryWorkerCampObjects(r.sim.ctx, r.inst).find(
    (o) => o.foundryWorkerCamp?.camp === id,
  );
  if (!obj) throw new Error(`no camp ${id}`);
  return obj;
}

function workersOf(r: Run, id: 'A' | 'B' | 'C'): Entity[] {
  return (camp(r, id).foundryWorkerCamp?.workerIds ?? []).map(
    (wid) => r.sim.ctx.entities.get(wid) as Entity,
  );
}

function killPack(r: Run, pack: string): void {
  r.sim.chat(`/dev foundry kill ${pack}`, r.tank.id);
  tick(r, 0.1);
}

/** Talk to a worker and press "Free them" (the gossip sends target + interact). */
function freeAt(r: Run, p: Entity, worker: Entity): void {
  put(r, p, worker.pos.x - r.ox + 1.5, worker.pos.z - r.oz);
  r.sim.targetEntity(worker.id, p.id);
  r.sim.interact(p.id);
}

function take(sim: Sim, pid: number): void {
  sim.players.get(pid)?.questLog.set(FOUNDRY_WORKERS_QUEST_ID, {
    questId: FOUNDRY_WORKERS_QUEST_ID,
    counts: [0],
    state: 'active',
  });
}

describe('the camps as authored', () => {
  it('three camps, two or three workers each, guarded by real packs', () => {
    expect(FOUNDRY_WORKER_CAMPS.map((c) => c.id)).toEqual(['A', 'B', 'C']);
    expect(FOUNDRY_WORKER_CAMP_COUNT).toBe(3);
    for (const c of FOUNDRY_WORKER_CAMPS) {
      expect(c.workers.length, c.id).toBeGreaterThanOrEqual(2);
      expect(c.workers.length, c.id).toBeLessThanOrEqual(3);
      expect(c.workers.some((w) => w.role === 'miner'), c.id).toBe(true);
      expect(c.workers.some((w) => w.role === 'hauler'), c.id).toBe(true);
      expect(STORMBRASS_FOUNDRY_SPAWNS.some((s) => s.packId === c.guardPack), c.id).toBe(true);
    }
    expect(FOUNDRY_WORKER_CAMPS.map((c) => c.guardPack)).toEqual(['g2', 'g6', 'g12']);
  });

  it('every camp spot stands on the walkable floor of its own terrace', () => {
    const h = (x: number, z: number) => authoredFieldHeight(STORMBRASS_FOUNDRY_FIELD, x, z);
    for (const c of FOUNDRY_WORKER_CAMPS) {
      const spots = [
        c.post,
        c.seam,
        c.heap,
        c.heap.stand,
        c.cart,
        c.cart.stand,
        c.leave,
        ...c.workers,
      ];
      for (const s of spots) {
        expect(Math.abs(h(s.x, s.z) - c.floor), `${c.id} ${s.x},${s.z}`).toBeLessThan(0.25);
      }
      // Where a body stands or walks, a yard round it is floor too (no edge).
      for (const s of [...c.workers, c.heap.stand, c.cart.stand, c.leave]) {
        for (let a = 0; a < 8; a++) {
          const x = s.x + Math.cos((a * Math.PI) / 4) * 1.2;
          const z = s.z + Math.sin((a * Math.PI) / 4) * 1.2;
          expect(Math.abs(h(x, z) - c.floor), `${c.id} ring ${x},${z}`).toBeLessThan(0.25);
        }
      }
    }
  });

  it('keeps clear of the route, the packs and the props already placed', () => {
    const own = new Set(foundryWorkerCampProps().map((p) => p.kind));
    const others = STORMBRASS_FOUNDRY_FIELD.props.filter((p) => !own.has(p.kind));
    for (const c of FOUNDRY_WORKER_CAMPS) {
      for (const w of c.workers) {
        // The route's spine runs x = 0 from the lift to the Gantry.
        expect(Math.abs(w.x), `${c.id} off the spine`).toBeGreaterThan(12);
        for (const s of STORMBRASS_FOUNDRY_SPAWNS) {
          if (s.patrol) continue;
          expect(Math.hypot(s.x - w.x, s.z - w.z), `${c.id} vs ${s.mobId}`).toBeGreaterThan(4);
        }
      }
      for (const spot of [c.post, c.seam, c.heap, c.cart]) {
        for (const p of others) {
          const reach = (p.r ?? Math.hypot(p.hw ?? 0, p.hd ?? 0)) + 1.5;
          expect(Math.hypot(p.x - spot.x, p.z - spot.z), `${c.id} vs ${p.kind}`).toBeGreaterThan(
            reach,
          );
        }
      }
    }
  });

  it('places the camp props on the authored field', () => {
    const kinds = STORMBRASS_FOUNDRY_FIELD.props.map((p) => p.kind);
    for (const kind of ['sf_ore_seam', 'sf_scrap_heap', 'sf_chain_post', 'sf_scrap_cart']) {
      expect(kinds.filter((k) => k === kind).length, kind).toBe(3);
    }
  });

  it('the workers are humanoid decoration: no loot, no xp', () => {
    for (const id of Object.values(FOUNDRY_WORKER_TEMPLATES)) {
      const t = MOBS[id];
      expect(t, id).toBe(FOUNDRY_WORKER_MOBS[id]);
      expect(t.family).toBe('humanoid');
      expect(t.loot).toEqual([]);
      expect(t.xpMult).toBe(0);
      expect(t.aggroRadius).toBe(0);
    }
  });
});

describe('a run spawns its camps', () => {
  it('three guarded camps and their chained workers, outside the combat roster', () => {
    const r = freshRun();
    const camps = foundryWorkerCampObjects(r.sim.ctx, r.inst);
    expect(camps.map((c) => c.templateId)).toEqual([
      FOUNDRY_WORKER_CAMP_TEMPLATES.guarded,
      FOUNDRY_WORKER_CAMP_TEMPLATES.guarded,
      FOUNDRY_WORKER_CAMP_TEMPLATES.guarded,
    ]);
    for (const c of FOUNDRY_WORKER_CAMPS) {
      const obj = camp(r, c.id);
      expect(Math.hypot(obj.pos.x - r.ox - c.post.x, obj.pos.z - r.oz - c.post.z)).toBeLessThan(
        0.01,
      );
      const workers = workersOf(r, c.id);
      expect(workers.map((w) => w.templateId)).toEqual(
        c.workers.map((w) => FOUNDRY_WORKER_TEMPLATES[w.role]),
      );
      for (const w of workers) {
        expect(w.kind).toBe('mob');
        expect(w.hostile).toBe(false);
        expect(r.inst.mobIds.includes(w.id)).toBe(false);
        expect(r.inst.npcIds.includes(w.id)).toBe(true);
        expect(Math.abs(w.pos.y - r.sim.ctx.groundPos(w.pos.x, w.pos.z).y)).toBeLessThan(0.3);
      }
    }
  });

  it('a hauler walks its loop between the heap and the cart; a miner stays at the seam', () => {
    const r = freshRun();
    const c = FOUNDRY_WORKER_CAMPS[0];
    const workers = workersOf(r, 'A');
    const hauler = workers[c.workers.findIndex((w) => w.role === 'hauler')];
    const miner = workers[c.workers.findIndex((w) => w.role === 'miner')];
    const minerAt = { ...miner.pos };
    let nearCart = false;
    let backAtHeap = false;
    for (let s = 0; s < 40; s++) {
      tick(r, 0.5);
      const lx = hauler.pos.x - r.ox;
      const lz = hauler.pos.z - r.oz;
      if (Math.hypot(lx - c.cart.stand.x, lz - c.cart.stand.z) < 0.6) nearCart = true;
      if (nearCart && Math.hypot(lx - c.heap.stand.x, lz - c.heap.stand.z) < 0.6) backAtHeap = true;
    }
    expect(nearCart).toBe(true);
    expect(backAtHeap).toBe(true);
    expect(Math.hypot(miner.pos.x - minerAt.x, miner.pos.z - minerAt.z)).toBeLessThan(0.01);
  });
});

describe('the workers are never a fight', () => {
  it('no player can attack one, and none ever aggroes or enters combat', () => {
    const r = freshRun();
    const [miner] = workersOf(r, 'A');
    expect(r.sim.ctx.isHostileTo(r.tank, miner)).toBe(false);
    put(r, r.tank, miner.pos.x - r.ox + 1.5, miner.pos.z - r.oz);
    r.sim.targetEntity(miner.id, r.tank.id);
    r.sim.startAutoAttack(r.tank.id);
    const hp = miner.hp;
    tick(r, 4);
    expect(miner.hp).toBe(hp);
    for (const w of workersOf(r, 'A')) {
      expect(w.hostile).toBe(false);
      expect(w.inCombat).toBe(false);
      expect(w.aggroTargetId).toBeNull();
      expect(w.threat.size).toBe(0);
    }
    expect(r.events.some((e) => e.type === 'damage' && e.targetId === miner.id)).toBe(false);
  });
});

describe('Free them', () => {
  it('is refused while the camp guards stand, and offered once they fall', () => {
    const r = freshRun();
    const [miner] = workersOf(r, 'A');
    // The gossip reads the camp's state object (the client's view of it).
    expect(foundryWorkerGossip(miner, r.sim.entities)).toBe('guarded');
    freeAt(r, r.tank, miner);
    tick(r, 0.1);
    expect(camp(r, 'A').foundryWorkerCamp?.phase).toBe('guarded');
    expect(miner.templateId).toBe(FOUNDRY_WORKER_TEMPLATES.miner);
    expect(
      r.events.some(
        (e) => e.type === 'error' && e.text === FOUNDRY_WORKER_LINES.guarded && e.pid === r.tank.id,
      ),
    ).toBe(true);
    // Another camp's guards falling changes nothing here.
    killPack(r, 'g1');
    expect(camp(r, 'A').templateId).toBe(FOUNDRY_WORKER_CAMP_TEMPLATES.guarded);
    killPack(r, 'g2');
    expect(camp(r, 'A').templateId).toBe(FOUNDRY_WORKER_CAMP_TEMPLATES.unguarded);
    expect(foundryWorkerGossip(miner, r.sim.entities)).toBe('unguarded');
    // The other camps still wait on their own guards.
    expect(camp(r, 'B').templateId).toBe(FOUNDRY_WORKER_CAMP_TEMPLATES.guarded);
    expect(camp(r, 'C').templateId).toBe(FOUNDRY_WORKER_CAMP_TEMPLATES.guarded);
    freeAt(r, r.tank, miner);
    tick(r, 0.1);
    expect(camp(r, 'A').templateId).toBe(FOUNDRY_WORKER_CAMP_TEMPLATES.freed);
    expect(foundryWorkerGossip(miner, r.sim.entities)).toBe('freed');
    for (const w of workersOf(r, 'A')) expect(w.templateId).toBe(FOUNDRY_WORKER_TEMPLATES.freed);
    expect(r.events.some((e) => e.type === 'chat' && e.text === FOUNDRY_WORKER_LINES.freed)).toBe(
      true,
    );
  });

  it('only from beside the worker', () => {
    const r = freshRun();
    killPack(r, 'g2');
    const [miner] = workersOf(r, 'A');
    put(r, r.tank, miner.pos.x - r.ox + 20, miner.pos.z - r.oz);
    r.sim.targetEntity(miner.id, r.tank.id);
    r.sim.interact(r.tank.id);
    tick(r, 0.1);
    expect(camp(r, 'A').templateId).toBe(FOUNDRY_WORKER_CAMP_TEMPLATES.unguarded);
  });

  it('the freed cheer, walk off toward the lift and vanish', () => {
    const r = freshRun();
    killPack(r, 'g2');
    const c = FOUNDRY_WORKER_CAMPS[0];
    const workers = workersOf(r, 'A');
    freeAt(r, r.tank, workers[0]);
    tick(r, 1);
    // Cheering first: nobody has gone anywhere yet.
    const start = workers.map((w) => ({ x: w.pos.x, z: w.pos.z }));
    tick(r, 1);
    workers.forEach((w, i) => {
      expect(Math.hypot(w.pos.x - start[i].x, w.pos.z - start[i].z)).toBeLessThan(0.01);
    });
    tick(r, 3.5);
    // Then walking toward the lift.
    workers.forEach((w, i) => {
      const before = Math.hypot(start[i].x - r.ox - c.leave.x, start[i].z - r.oz - c.leave.z);
      const now = Math.hypot(w.pos.x - r.ox - c.leave.x, w.pos.z - r.oz - c.leave.z);
      expect(now, `worker ${i}`).toBeLessThan(before - 1);
    });
    tick(r, FREED_LEAVE_SECONDS);
    for (const w of workers) {
      expect(r.sim.ctx.entities.has(w.id)).toBe(false);
      expect(r.inst.npcIds.includes(w.id)).toBe(false);
    }
    expect(camp(r, 'A').foundryWorkerCamp?.workerIds).toEqual([]);
    expect(camp(r, 'A').templateId).toBe(FOUNDRY_WORKER_CAMP_TEMPLATES.freed);
  });

  it('a second press on a freed camp does nothing more', () => {
    const r = freshRun();
    take(r.sim, r.tank.id);
    killPack(r, 'g2');
    const [miner] = workersOf(r, 'A');
    freeAt(r, r.tank, miner);
    freeAt(r, r.tank, miner);
    tick(r, 0.1);
    expect(r.sim.players.get(r.tank.id)?.questLog.get(FOUNDRY_WORKERS_QUEST_ID)?.counts).toEqual([
      1,
    ]);
  });
});

describe('Free the Workers', () => {
  it('credits every quest holder in the run per camp freed, never anyone else', () => {
    const r = freshRun(2);
    const [holder, bystander] = r.others;
    take(r.sim, r.tank.id);
    take(r.sim, holder.id);
    // The holder stays back by the lift: a group objective, not a proximity one.
    put(r, holder, 0, -224);
    for (const [id, pack] of [
      ['A', 'g2'],
      ['B', 'g6'],
      ['C', 'g12'],
    ] as const) {
      killPack(r, pack);
      freeAt(r, r.tank, workersOf(r, id)[0]);
      tick(r, 0.1);
    }
    for (const p of [r.tank, holder]) {
      const qp = r.sim.players.get(p.id)?.questLog.get(FOUNDRY_WORKERS_QUEST_ID);
      expect(qp?.counts, p.name).toEqual([3]);
      expect(qp?.state, p.name).toBe('ready');
    }
    expect(r.sim.players.get(bystander.id)?.questLog.has(FOUNDRY_WORKERS_QUEST_ID)).toBe(false);
    const progress = r.events.filter(
      (e) => e.type === 'questProgress' && e.questId === FOUNDRY_WORKERS_QUEST_ID,
    );
    expect(progress.length).toBe(6);
  });

  it('the Lift Warden offers it at level 19 beside the chain and takes it back', () => {
    const quest = QUESTS[FOUNDRY_WORKERS_QUEST_ID];
    expect(quest).toBe(FOUNDRY_WORKERS_QUEST);
    expect(STORMBRASS_FOUNDRY_QUEST_ORDER).toContain(FOUNDRY_WORKERS_QUEST_ID);
    const sim = new Sim({ seed: 3, playerClass: 'warrior' });
    const warden = sim.entities.get(LIFT_WARDEN_ENTITY_ID) as Entity;
    expect(warden.questIds).toContain(FOUNDRY_WORKERS_QUEST_ID);
    sim.setPlayerLevel(18);
    expect(sim.questState(FOUNDRY_WORKERS_QUEST_ID)).toBe('unavailable');
    sim.setPlayerLevel(19);
    expect(sim.questState(FOUNDRY_WORKERS_QUEST_ID)).toBe('available');
    sim.player.pos = { ...warden.pos, x: warden.pos.x + 1 };
    sim.player.prevPos = { ...sim.player.pos };
    sim.ctx.grid.update(sim.player);
    sim.acceptQuest(FOUNDRY_WORKERS_QUEST_ID);
    expect(sim.questState(FOUNDRY_WORKERS_QUEST_ID)).toBe('active');
    const meta = sim.players.get(sim.player.id);
    const qp = meta?.questLog.get(FOUNDRY_WORKERS_QUEST_ID);
    if (!qp) throw new Error('not accepted');
    qp.counts = [3];
    qp.state = 'ready';
    const copper = meta?.copper ?? 0;
    sim.turnInQuest(FOUNDRY_WORKERS_QUEST_ID);
    expect(sim.questState(FOUNDRY_WORKERS_QUEST_ID)).toBe('done');
    expect((meta?.copper ?? 0) - copper).toBe(quest.copperReward);
  });

  it('pays the dungeon quest rung of its siblings (no invented numbers)', () => {
    const rung = QUESTS.q_sf_storm_line;
    expect(FOUNDRY_WORKERS_QUEST.xpReward).toBe(rung.xpReward);
    expect(FOUNDRY_WORKERS_QUEST.copperReward).toBe(rung.copperReward);
    expect(FOUNDRY_WORKERS_QUEST.minLevel).toBe(rung.minLevel);
    expect(FOUNDRY_WORKERS_QUEST.objectives[0].count).toBe(FOUNDRY_WORKER_CAMP_COUNT);
  });
});

describe('the deed', () => {
  it('every chain struck in one run earns it for the players in the run', () => {
    expect(DEEDS[FOUNDRY_WORKERS_DEED].trigger).toEqual({ kind: 'manual' });
    const r = freshRun(1);
    const earned = (p: Entity) =>
      r.sim.players.get(p.id)?.deedsEarned.has(FOUNDRY_WORKERS_DEED) ?? false;
    for (const [id, pack] of [
      ['A', 'g2'],
      ['B', 'g6'],
    ] as const) {
      killPack(r, pack);
      freeAt(r, r.tank, workersOf(r, id)[0]);
      tick(r, 0.1);
    }
    expect(earned(r.tank)).toBe(false);
    killPack(r, 'g12');
    freeAt(r, r.tank, workersOf(r, 'C')[0]);
    tick(r, 0.1);
    expect(earned(r.tank)).toBe(true);
    expect(earned(r.others[0])).toBe(true);
  });
});

describe('a reset', () => {
  it('a fresh run restores every camp, chained and guarded', () => {
    const r = freshRun(0);
    killPack(r, 'g2');
    freeAt(r, r.tank, workersOf(r, 'A')[0]);
    tick(r, FREED_LEAVE_SECONDS + 1);
    expect(workersOf(r, 'A')).toEqual([]);
    r.sim.chat('/dev foundry reset', r.tank.id);
    const inst = claimedInstanceAt(r.sim.ctx, r.tank.pos);
    if (!inst) throw new Error('no claim');
    r.inst = inst;
    tick(r, 0.1);
    const camps = foundryWorkerCampObjects(r.sim.ctx, r.inst);
    expect(camps.map((c) => c.foundryWorkerCamp?.phase)).toEqual([
      'guarded',
      'guarded',
      'guarded',
    ]);
    expect(workersOf(r, 'A').map((w) => w.templateId)).toEqual([
      FOUNDRY_WORKER_TEMPLATES.miner,
      FOUNDRY_WORKER_TEMPLATES.miner,
      FOUNDRY_WORKER_TEMPLATES.hauler,
    ]);
  });
});

describe('/dev foundry workers', () => {
  it('frees a camp, resets them, and jumps to each camp', () => {
    const r = freshRun(0);
    r.sim.chat('/dev foundry workers free b', r.tank.id);
    tick(r, 0.1);
    expect(camp(r, 'B').foundryWorkerCamp?.phase).toBe('freed');
    expect(camp(r, 'A').foundryWorkerCamp?.phase).toBe('guarded');
    r.sim.chat('/dev foundry workers reset', r.tank.id);
    tick(r, 0.1);
    expect(foundryWorkerCampObjects(r.sim.ctx, r.inst).map((c) => c.templateId)).toEqual([
      FOUNDRY_WORKER_CAMP_TEMPLATES.guarded,
      FOUNDRY_WORKER_CAMP_TEMPLATES.guarded,
      FOUNDRY_WORKER_CAMP_TEMPLATES.guarded,
    ]);
    expect(workersOf(r, 'B').length).toBe(2);
    for (const c of FOUNDRY_WORKER_CAMPS) {
      r.sim.chat(`/dev foundry tp camp${c.id.toLowerCase()}`, r.tank.id);
      const lx = r.tank.pos.x - r.ox;
      const lz = r.tank.pos.z - r.oz;
      expect(Math.hypot(lx - c.post.x, lz - c.post.z), c.id).toBeLessThan(12);
      expect(Math.abs(r.tank.pos.y - r.sim.ctx.groundPos(r.tank.pos.x, r.tank.pos.z).y)).toBeLessThan(
        0.5,
      );
    }
  });
});
