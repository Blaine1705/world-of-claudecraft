// Laverock, the Drowned Temple's optional lore guide (src/sim/dungeon_guide,
// content/drowned_temple_cantor.ts): the offer and its answer from any member,
// the change of mind until Selthe's fight, the trail follow over the floating
// walkways and the catch-up, the speech queue's rules, his invulnerability and
// invisibility to every fight system, the finale (walk, farewell, song, the
// fallen rising) with the deed and its title, determinism, and a fresh guide on
// every claim. Driven through full Sim ticks in a real claimed Temple.

import { describe, expect, it } from 'vitest';
import { DEEDS } from '../src/sim/content/deeds';
import {
  CANTOR_DEED_ID,
  CANTOR_GUIDE,
  CANTOR_LAST_VERSE_CAST,
  CANTOR_NPC_ID,
  CANTOR_SPAWN,
} from '../src/sim/content/drowned_temple_cantor';
import { DROWNED_TEMPLE_VOID_HEIGHT } from '../src/sim/content/drowned_temple_layout';
import { DUNGEON_GUIDES, dungeonGuideForNpc } from '../src/sim/content/dungeon_guides';
import { DUNGEONS, instanceOrigin, MOBS, NPCS } from '../src/sim/data';
import { answerDungeonGuide, freshGuideRun } from '../src/sim/dungeon_guide';
import { catchUpPoint, recordTrail, stepAlongTrail } from '../src/sim/dungeon_guide/follow';
import { pickLine } from '../src/sim/dungeon_guide/speech';
import { claimedInstanceAt, enterDungeon, freeInstance } from '../src/sim/instances/dungeons';
import type { InstanceSlot } from '../src/sim/sim';
import { Sim } from '../src/sim/sim';
import { DT, type Entity, type SimEvent, type Vec3 } from '../src/sim/types';

interface Run {
  sim: Sim;
  inst: InstanceSlot;
  ox: number;
  oz: number;
  lead: Entity;
  others: Entity[];
  guide: Entity;
  events: SimEvent[];
}

const BOSSES = new Set([
  'choirmother_selthe',
  'tideglass_colossus',
  'ysolei',
  'mere_hydra_head_left',
  'mere_hydra_head_center',
  'mere_hydra_head_right',
]);

function temple(
  opts: {
    difficulty?: 'normal' | 'heroic';
    extra?: number;
    clearTrash?: boolean;
    seed?: number;
  } = {},
): Run {
  const sim = new Sim({
    seed: opts.seed ?? 23,
    playerClass: 'warrior',
    autoEquip: false,
    devCommands: true,
  });
  const lead = sim.player;
  sim.chat('/dev level 20', lead.id);
  const ids: number[] = [];
  for (let i = 0; i < (opts.extra ?? 2); i++) {
    const pid = sim.addPlayer('priest', `Wader${i}`);
    sim.partyInvite(pid, lead.id);
    sim.partyAccept(pid);
    ids.push(pid);
  }
  sim.chat(`/dev temple enter ${opts.difficulty ?? 'normal'}`, lead.id);
  for (const pid of ids) enterDungeon(sim.ctx, 'drowned_temple', pid);
  const inst = claimedInstanceAt(sim.ctx, lead.pos);
  if (!inst) throw new Error('no temple claim');
  if (opts.clearTrash !== false) {
    for (const id of inst.mobIds) {
      const e = sim.ctx.entities.get(id);
      if (e && !e.dead && !BOSSES.has(e.templateId)) sim.ctx.handleDeath(e, lead);
    }
  }
  const others = ids.map((pid) => sim.ctx.entities.get(pid) as Entity);
  for (const p of [lead, ...others]) {
    p.maxHp = 1e7;
    p.hp = 1e7;
  }
  const o = instanceOrigin(DUNGEONS.drowned_temple.index, inst.slot);
  const guideId = inst.npcIds.find((id) => sim.ctx.entities.get(id)?.templateId === CANTOR_NPC_ID);
  const guide = guideId === undefined ? null : sim.ctx.entities.get(guideId);
  if (!guide) throw new Error('no guide');
  sim.drainEvents();
  return { sim, inst, ox: o.x, oz: o.z, lead, others, guide, events: [] };
}

function at(r: Run, x: number, z: number): Vec3 {
  return r.sim.ctx.groundPos(r.ox + x, r.oz + z);
}

function put(r: Run, e: Entity, x: number, z: number): void {
  e.pos = at(r, x, z);
  e.prevPos = { ...e.pos };
  r.sim.ctx.rebucket(e);
}

function tick(r: Run, seconds: number, each: () => void = () => {}): void {
  for (let t = 0; t < seconds - DT * 0.5; t += DT) {
    each();
    r.events.push(...r.sim.tick());
  }
}

function linesFor(r: Run, pid: number): string[] {
  return r.events
    .filter(
      (ev): ev is Extract<SimEvent, { type: 'dungeonGuideLine' }> =>
        ev.type === 'dungeonGuideLine' && ev.pid === pid,
    )
    .map((ev) => ev.lineId);
}

/** Stand the whole group beside the guide on the landing. */
function gather(r: Run): void {
  put(r, r.lead, CANTOR_SPAWN.x - 2, CANTOR_SPAWN.z);
  r.others.forEach((p, i) => {
    put(r, p, CANTOR_SPAWN.x - 3 - i, CANTOR_SPAWN.z + 1);
  });
}

// The Moongate Landing, down the Pilgrim Steps, along the Reflecting Causeway
// and the Colonnade to the Choir Stair: every point on a walkway.
const ROUTE: [number, number][] = [
  [0, -224],
  [3.9, -218.1],
  [0, -215],
  [-24, -196],
  [-28, -193],
  [-31, -183],
  [-27.5, -178],
  [-11.3, -155],
  [-9.5, -152.5],
  [-5, -140],
  [0, -112],
  [0, -92],
  [0, -76],
  [0, -50],
];

/** Points every `step` yards along the route. */
function routePoints(step: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < ROUTE.length - 1; i++) {
    const [ax, az] = ROUTE[i];
    const [bx, bz] = ROUTE[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / step));
    for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  out.push(ROUTE[ROUTE.length - 1]);
  return out;
}

/** Walk the group down the route at run pace (the others a few yards behind). */
function walkRoute(r: Run, upto = Number.POSITIVE_INFINITY, each: () => void = () => {}): void {
  const pts = routePoints(7 * DT);
  const n = Math.min(pts.length, upto);
  for (let i = 0; i < n; i++) {
    put(r, r.lead, pts[i][0], pts[i][1]);
    r.others.forEach((p, k) => {
      const j = Math.max(0, i - 15 * (k + 1));
      put(r, p, pts[j][0], pts[j][1]);
    });
    each();
    r.events.push(...r.sim.tick());
  }
}

function bossOf(r: Run, id: string): Entity {
  for (const mid of r.inst.mobIds) {
    const e = r.sim.ctx.entities.get(mid);
    if (e?.templateId === id) return e;
  }
  throw new Error(`no ${id}`);
}

describe('the guide record', () => {
  it('is registered, dynamic, and every trigger names real content', () => {
    expect(DUNGEON_GUIDES[CANTOR_GUIDE.id]).toBe(CANTOR_GUIDE);
    expect(dungeonGuideForNpc(CANTOR_NPC_ID)).toBe(CANTOR_GUIDE);
    expect(NPCS[CANTOR_NPC_ID]?.dynamic).toBe(true);
    expect(NPCS[CANTOR_NPC_ID]?.name).toBe('Laverock');
    expect(NPCS[CANTOR_NPC_ID]?.title).toBe('Last Cantor of the Pale Choir');
    const gates = new Set((DUNGEONS.drowned_temple.gates ?? []).map((g) => g.id));
    const ids = new Set(CANTOR_GUIDE.lines.map((l) => l.id));
    expect(ids.size).toBe(CANTOR_GUIDE.lines.length);
    for (const line of CANTOR_GUIDE.lines) {
      const t = line.trigger;
      if (t.kind === 'sight' || t.kind === 'mobAlive') {
        for (const m of t.mobIds) expect(MOBS[m], `${line.id} ${m}`).toBeDefined();
      }
      if (t.kind === 'gateOpen') expect(gates.has(t.gateId), line.id).toBe(true);
      if (t.kind === 'bossNear') expect(MOBS[t.bossId], line.id).toBeDefined();
      if (t.kind === 'bossDead') for (const b of t.bossIds) expect(MOBS[b], line.id).toBeDefined();
      if (t.kind === 'follows') for (const f of t.lines) expect(ids.has(f), line.id).toBe(true);
      if (line.beforeBoss) expect(MOBS[line.beforeBoss], line.id).toBeDefined();
      expect(line.text, line.id).not.toMatch(/[\u2013\u2014]/);
    }
    for (const id of CANTOR_GUIDE.finale.dissolveMobIds) expect(MOBS[id], id).toBeDefined();
    expect(DEEDS[CANTOR_DEED_ID]?.trigger).toEqual({ kind: 'manual' });
    expect(DEEDS[CANTOR_DEED_ID]?.reward).toEqual({ kind: 'title', text: 'Witness of the Choir' });
    // Every line in the design doc, the dialog's six keys aside.
    expect(CANTOR_GUIDE.lines.length).toBe(47);
  });

  it('draws each variant group from the private stream, never the shared one', () => {
    const a = freshGuideRun(CANTOR_GUIDE, 1234);
    const b = freshGuideRun(CANTOR_GUIDE, 1234);
    expect(a.chosen).toEqual(b.chosen);
    const groups = new Set(CANTOR_GUIDE.lines.flatMap((l) => (l.variant ? [l.variant] : [])));
    expect(Object.keys(a.chosen).sort()).toEqual([...groups].sort());
    // Across seeds both halves of a pair turn up.
    const seen = new Set<string>();
    for (let s = 1; s < 40; s++) seen.add(freshGuideRun(CANTOR_GUIDE, s).chosen.accept);
    expect(seen).toEqual(new Set(['E05', 'E06']));
  });
});

describe('the offer', () => {
  it('spawns on the landing each claim, as an npc no fight system counts', () => {
    const r = temple();
    expect(r.inst.mobIds).not.toContain(r.guide.id);
    expect(r.inst.npcIds).toContain(r.guide.id);
    expect(r.guide.kind).toBe('npc');
    expect(r.guide.hostile).toBe(false);
    expect(r.guide.pos.x - r.ox).toBeCloseTo(CANTOR_SPAWN.x, 1);
    expect(r.guide.pos.z - r.oz).toBeCloseTo(CANTOR_SPAWN.z, 1);
    tick(r, 0.2);
    expect(r.guide.guideState).toBe('open');
  });

  it('any member (not only the leader) answers for the whole group', () => {
    const r = temple();
    gather(r);
    tick(r, 0.2);
    answerDungeonGuide(r.sim.ctx, r.guide.id, true, r.others[1].id);
    expect(r.guide.guideState).toBe('joined');
    tick(r, 0.2);
    // Every player in the claim hears the thanks.
    for (const p of [r.lead, ...r.others]) {
      const heard = linesFor(r, p.id);
      expect(heard.length).toBe(1);
      expect(['E05', 'E06']).toContain(heard[0]);
    }
  });

  it('a group that goes alone may change its mind until Selthe fights', () => {
    const r = temple();
    gather(r);
    tick(r, 0.2);
    answerDungeonGuide(r.sim.ctx, r.guide.id, false, r.lead.id);
    expect(r.guide.guideState).toBe('declined');
    answerDungeonGuide(r.sim.ctx, r.guide.id, false, r.others[0].id);
    tick(r, 1);
    expect(linesFor(r, r.lead.id)).toEqual(['E07']); // once
    answerDungeonGuide(r.sim.ctx, r.guide.id, true, r.others[0].id);
    expect(r.guide.guideState).toBe('joined');
  });

  it('closes for good when Selthe is pulled, and a closed offer refuses an answer', () => {
    const r = temple();
    gather(r);
    tick(r, 0.2);
    answerDungeonGuide(r.sim.ctx, r.guide.id, false, r.lead.id);
    const selthe = bossOf(r, 'choirmother_selthe');
    put(r, r.others[0], 0, 4);
    r.sim.ctx.aggroMob(selthe, r.others[0], false);
    tick(r, 0.5);
    expect(r.guide.guideState).toBe('closed');
    answerDungeonGuide(r.sim.ctx, r.guide.id, true, r.lead.id);
    expect(r.guide.guideState).toBe('closed');
  });

  it('refuses a member out of reach, a dead one, and anyone outside the claim', () => {
    const r = temple();
    gather(r);
    tick(r, 0.2);
    put(r, r.others[0], CANTOR_SPAWN.x, CANTOR_SPAWN.z + 20);
    answerDungeonGuide(r.sim.ctx, r.guide.id, true, r.others[0].id);
    expect(r.guide.guideState).toBe('open');
    r.others[1].dead = true;
    answerDungeonGuide(r.sim.ctx, r.guide.id, true, r.others[1].id);
    expect(r.guide.guideState).toBe('open');
    const stranger = r.sim.addPlayer('mage', 'Outsider');
    answerDungeonGuide(r.sim.ctx, r.guide.id, true, stranger);
    expect(r.guide.guideState).toBe('open');
    // Not a guide at all: a gate object.
    answerDungeonGuide(r.sim.ctx, r.inst.objectIds[0], true, r.lead.id);
    expect(r.guide.guideState).toBe('open');
  });
});

describe('the follow', () => {
  it('walks the group trail down the steps and causeway, never over the void', () => {
    const r = temple();
    gather(r);
    tick(r, 0.2);
    answerDungeonGuide(r.sim.ctx, r.guide.id, true, r.lead.id);
    let maxBehind = 0;
    walkRoute(r, Number.POSITIVE_INFINITY, () => {
      const g = r.guide.pos;
      expect(g.y).toBeGreaterThan(DROWNED_TEMPLE_VOID_HEIGHT + 10);
      // He stands where a walkway is (the floor under him is not the void).
      expect(r.sim.ctx.groundPos(g.x, g.z).y).toBeGreaterThan(DROWNED_TEMPLE_VOID_HEIGHT + 10);
      const rear = r.others[r.others.length - 1];
      maxBehind = Math.max(maxBehind, Math.hypot(g.x - rear.pos.x, g.z - rear.pos.z));
    });
    tick(r, 6);
    const rear = r.others[r.others.length - 1];
    const d = Math.hypot(r.guide.pos.x - rear.pos.x, r.guide.pos.z - rear.pos.z);
    expect(d).toBeGreaterThan(3);
    expect(d).toBeLessThan(7);
    expect(maxBehind).toBeLessThan(40); // he kept up without a single snap
    expect(linesFor(r, r.lead.id)).not.toContain('O02');
  }, 180_000);

  it('stands still while any member fights', () => {
    const r = temple({ clearTrash: false });
    gather(r);
    tick(r, 0.2);
    answerDungeonGuide(r.sim.ctx, r.guide.id, true, r.lead.id);
    put(r, r.lead, CANTOR_SPAWN.x - 2, CANTOR_SPAWN.z + 20);
    r.lead.inCombat = true;
    const before = { ...r.guide.pos };
    tick(r, 2, () => {
      r.lead.inCombat = true;
    });
    expect(r.guide.pos).toEqual(before);
  });

  it('catches up on his own when left far behind, and says so once', () => {
    const r = temple();
    gather(r);
    tick(r, 0.2);
    answerDungeonGuide(r.sim.ctx, r.guide.id, true, r.lead.id);
    tick(r, 7);
    walkRoute(r, 60);
    // Strand him back on the landing while the group runs down the steps.
    put(r, r.guide, CANTOR_SPAWN.x, CANTOR_SPAWN.z);
    walkRoute(r, 400);
    tick(r, 8);
    expect(linesFor(r, r.lead.id)).toContain('O02');
    const rear = r.others[r.others.length - 1];
    expect(Math.hypot(r.guide.pos.x - rear.pos.x, r.guide.pos.z - rear.pos.z)).toBeLessThan(12);
    // A second stranding never repeats the line.
    put(r, r.guide, CANTOR_SPAWN.x, CANTOR_SPAWN.z);
    tick(r, 8);
    expect(linesFor(r, r.lead.id).filter((id) => id === 'O02')).toHaveLength(1);
  }, 180_000);

  it('the catch-up point never walks back across a jump in the trail', () => {
    const before = [
      { x: 0, y: 0, z: 0 },
      { x: 1.5, y: 0, z: 0 },
    ];
    // Just past a jump: no trail yet on the near side, so no snap at all.
    const fresh = [...before, { x: 50, y: 0, z: 0 }, { x: 51.5, y: 0, z: 0 }];
    expect(catchUpPoint(fresh, { x: 52, y: 0, z: 0 }, 6)).toBeNull();
    // Once the member has walked on, he lands on the near side, six yards back.
    const walked = [...before];
    for (let x = 40; x <= 52; x += 1.5) walked.push({ x, y: 0, z: 0 });
    const snap = catchUpPoint(walked, { x: 52, y: 0, z: 0 }, 6);
    expect(snap?.at.x).toBeGreaterThanOrEqual(40);
    expect(52 - (snap?.at.x ?? 0)).toBeGreaterThanOrEqual(6);
    expect(snap?.rest.every((c) => c.x > (snap?.at.x ?? 0))).toBe(true);
  });

  it('holds a gap behind the member and hurries when far behind', () => {
    const run = freshGuideRun(CANTOR_GUIDE, 9);
    for (let z = 0; z <= 30; z += 1) recordTrail(run, { x: 0, y: 2, z });
    const step = stepAlongTrail(
      run,
      { x: 0, y: 2, z: 0 },
      0,
      { x: 0, y: 2, z: 30 },
      CANTOR_GUIDE.follow,
      DT,
    );
    expect(step.pos.z).toBeCloseTo(CANTOR_GUIDE.follow.runSpeed * DT, 5);
    const near = freshGuideRun(CANTOR_GUIDE, 9);
    recordTrail(near, { x: 0, y: 2, z: 3 });
    const still = stepAlongTrail(
      near,
      { x: 0, y: 2, z: 0 },
      0,
      { x: 0, y: 2, z: 4 },
      CANTOR_GUIDE.follow,
      DT,
    );
    expect(still.moved).toBe(false);
  });
});

describe('the speech queue', () => {
  it('names what the group meets on the way, each line once', () => {
    const r = temple({ clearTrash: false });
    gather(r);
    tick(r, 0.2);
    answerDungeonGuide(r.sim.ctx, r.guide.id, true, r.lead.id);
    walkRoute(r, 260, () => {
      for (const p of [r.lead, ...r.others]) p.hp = p.maxHp;
    });
    tick(r, 30, () => {
      for (const p of [r.lead, ...r.others]) p.hp = p.maxHp;
    });
    const heard = linesFor(r, r.lead.id);
    expect(new Set(heard).size).toBe(heard.length);
    expect(heard).toContain('A01');
    expect(heard.some((id) => id === 'C01' || id === 'C02')).toBe(true);
  }, 180_000);

  it('picks the most urgent waiting line, and drops the stale and the too-late ones', () => {
    const run = freshGuideRun(CANTOR_GUIDE, 5);
    run.queue.push(
      { id: 'C01', at: 0 },
      { id: 'A04', at: 1 },
      { id: 'B07', at: 2 },
      { id: 'C03', at: 3 },
    );
    const notStarted = () => false;
    expect(pickLine(CANTOR_GUIDE, run, 4, false, notStarted)?.id).toBe('B07');
    // Too late: the Colossus is already in its fight, so B07 is dropped.
    expect(pickLine(CANTOR_GUIDE, run, 4, false, (id) => id === 'tideglass_colossus')?.id).toBe(
      'A04',
    );
    expect(run.done.has('B07')).toBe(true);
    // Stale: 20 s later the creature and area lines have passed.
    expect(pickLine(CANTOR_GUIDE, run, 30, false, notStarted)).toBeNull();
    expect(run.queue).toEqual([]);
  });

  it('waits at least the spacing between two lines', () => {
    const r = temple();
    gather(r);
    tick(r, 0.2);
    answerDungeonGuide(r.sim.ctx, r.guide.id, true, r.lead.id);
    const at: number[] = [];
    for (let i = 0; i < 20 * 20; i++) {
      const evs = r.sim.tick();
      if (evs.some((ev) => ev.type === 'dungeonGuideLine' && ev.pid === r.lead.id)) {
        at.push(r.sim.time);
      }
    }
    expect(at.length).toBeGreaterThanOrEqual(2); // the thanks, then a memory
    for (let i = 1; i < at.length; i++) {
      expect(at[i] - at[i - 1]).toBeGreaterThanOrEqual(CANTOR_GUIDE.speech.spacing - DT);
    }
  });

  it('keeps the heroic lines for heroic claims', () => {
    const normal = temple({ clearTrash: false });
    gather(normal);
    tick(normal, 0.2);
    answerDungeonGuide(normal.sim.ctx, normal.guide.id, true, normal.lead.id);
    tick(normal, 20);
    expect(linesFor(normal, normal.lead.id)).not.toContain('E08');
    const heroic = temple({ difficulty: 'heroic', clearTrash: false });
    gather(heroic);
    tick(heroic, 0.2);
    answerDungeonGuide(heroic.sim.ctx, heroic.guide.id, true, heroic.lead.id);
    tick(heroic, 20);
    const heard = linesFor(heroic, heroic.lead.id);
    expect(heard).toContain('E08');
    // It follows the thanks, ahead of the memory it shares a queue with.
    expect(heard.indexOf('E08')).toBeLessThan(
      heard.findIndex((id) => id === 'E09' || id === 'E10'),
    );
  }, 180_000);

  it('falls silent in a boss fight except for the lines meant for it', () => {
    const r = temple();
    gather(r);
    tick(r, 0.2);
    answerDungeonGuide(r.sim.ctx, r.guide.id, true, r.lead.id);
    tick(r, 1);
    const colossus = bossOf(r, 'tideglass_colossus');
    colossus.maxHp = 1e8;
    colossus.hp = 1e8;
    // The whole group stands on the Prism Terrace with him.
    for (const p of [r.lead, ...r.others]) put(r, p, 82, 202);
    put(r, r.guide, 78, 196);
    r.guide.guideRun?.trail.splice(0);
    r.sim.ctx.aggroMob(colossus, r.lead, false);
    const n0 = r.events.length;
    tick(r, 30, () => {
      for (const p of [r.lead, ...r.others]) p.hp = p.maxHp;
      r.sim.chat('/dev temple trigger reflections', r.lead.id);
    });
    const during = r.events
      .slice(n0)
      .filter((ev) => ev.type === 'dungeonGuideLine' && ev.pid === r.lead.id)
      .map((ev) => (ev as Extract<SimEvent, { type: 'dungeonGuideLine' }>).lineId);
    // The memory line queued at the entrance waits; only C10 speaks.
    expect(during).toEqual(['C10']);
  }, 180_000);

  it('cries out once when the whole group lies dead', () => {
    const r = temple();
    gather(r);
    tick(r, 0.2);
    answerDungeonGuide(r.sim.ctx, r.guide.id, true, r.lead.id);
    tick(r, 14);
    for (const p of [r.lead, ...r.others]) {
      p.hp = 0;
      p.dead = true;
    }
    tick(r, 8);
    for (const p of [r.lead, ...r.others]) {
      p.dead = false;
      p.hp = p.maxHp;
    }
    tick(r, 1);
    for (const p of [r.lead, ...r.others]) {
      p.hp = 0;
      p.dead = true;
    }
    tick(r, 8);
    expect(linesFor(r, r.lead.id).filter((id) => id === 'O01')).toHaveLength(1);
  });
});

describe('no fight ever touches him', () => {
  it('a boss fight beside him leaves him whole, unthreatened and unmoved', () => {
    const r = temple();
    gather(r);
    tick(r, 0.2);
    answerDungeonGuide(r.sim.ctx, r.guide.id, true, r.lead.id);
    const ysolei = bossOf(r, 'ysolei');
    ysolei.maxHp = 1e8;
    ysolei.hp = 1e8;
    for (const p of [r.lead, ...r.others]) put(r, p, -18, 206);
    put(r, r.guide, -16, 210);
    r.guide.guideRun?.trail.splice(0);
    r.sim.ctx.aggroMob(ysolei, r.lead, false);
    const before = { ...r.guide.pos };
    tick(r, 40, () => {
      for (const p of [r.lead, ...r.others]) p.hp = p.maxHp;
      if (r.sim.time % 10 < DT) r.sim.chat('/dev temple trigger undertow', r.lead.id);
    });
    expect(r.guide.hp).toBe(r.guide.maxHp);
    expect(r.guide.dead).toBe(false);
    expect(r.guide.pos).toEqual(before);
    expect(ysolei.threat.has(r.guide.id)).toBe(false);
    expect(
      r.events.some(
        (ev) => (ev.type === 'damage' || ev.type === 'heal') && ev.targetId === r.guide.id,
      ),
    ).toBe(false);
  }, 180_000);

  it('a player cannot attack him: he is never tabbed to and takes no hit', () => {
    const r = temple();
    gather(r);
    tick(r, 0.2);
    r.sim.targetEntity(r.guide.id, r.lead.id);
    r.sim.startAutoAttack(r.lead.id);
    tick(r, 4);
    expect(r.guide.hp).toBe(r.guide.maxHp);
    r.sim.targetEntity(null, r.lead.id);
    r.sim.tabTarget(r.lead.id);
    expect(r.lead.targetId === r.guide.id).toBe(false);
  });
});

describe('the finale', () => {
  it('Ysolei falls: he walks to the altar, says farewell, sings, and the fallen rise', () => {
    const r = temple({ clearTrash: false });
    gather(r);
    tick(r, 0.2);
    answerDungeonGuide(r.sim.ctx, r.guide.id, true, r.lead.id);
    tick(r, 1);
    // The run's trash and the first two bosses fall.
    for (const id of r.inst.mobIds) {
      const e = r.sim.ctx.entities.get(id);
      if (e && !e.dead && e.templateId !== 'ysolei') r.sim.ctx.handleDeath(e, r.lead);
    }
    for (const p of [r.lead, ...r.others]) put(r, p, 24, 206);
    put(r, r.guide, 30, 206);
    r.guide.guideRun?.trail.splice(0);
    tick(r, 2);
    const ysolei = bossOf(r, 'ysolei');
    r.sim.ctx.handleDeath(ysolei, r.lead);
    tick(r, 60, () => {
      for (const p of [r.lead, ...r.others]) p.hp = p.maxHp;
    });
    const heard = linesFor(r, r.lead.id);
    const farewell = heard.filter((id) => id.startsWith('F'));
    expect(farewell.slice(0, 3)).toEqual(['F01', 'F02', 'F03']);
    expect(['F04', 'F05']).toContain(farewell[3]);
    expect(farewell[4]).toBe('F06');
    expect(r.guide.guideState).toBe('singing');
    expect(r.guide.castingAbility).toBe(CANTOR_LAST_VERSE_CAST);
    expect(r.guide.channeling).toBe(true);
    const spot = CANTOR_GUIDE.finale.path[CANTOR_GUIDE.finale.path.length - 1];
    expect(Math.hypot(r.guide.pos.x - r.ox - spot.x, r.guide.pos.z - r.oz - spot.z)).toBeLessThan(
      0.5,
    );
    const finale = r.events.filter(
      (ev): ev is Extract<SimEvent, { type: 'dungeonGuideFinale' }> =>
        ev.type === 'dungeonGuideFinale' && ev.pid === r.lead.id,
    );
    expect(finale).toHaveLength(1);
    // Every fallen pilgrim, novice, guard, siren and the Choirmother rise.
    const fallen = r.inst.mobIds
      .map((id) => r.sim.ctx.entities.get(id))
      .filter((e) => e?.dead && CANTOR_GUIDE.finale.dissolveMobIds.includes(e.templateId));
    expect(finale[0].spots.length).toBe(fallen.length * 3);
    expect(fallen.length).toBeGreaterThan(20);
    // The song loops while the claim lives.
    tick(r, CANTOR_GUIDE.finale.castSeconds + 2);
    expect(r.guide.castingAbility).toBe(CANTOR_LAST_VERSE_CAST);
    // The deed and its title went to everyone in the claim.
    for (const p of [r.lead, ...r.others]) {
      expect(r.sim.meta(p.id)?.deedsEarned.has(CANTOR_DEED_ID)).toBe(true);
    }
    r.sim.setActiveTitle(CANTOR_DEED_ID, r.lead.id);
    expect(r.sim.meta(r.lead.id)?.activeTitle).toBe(CANTOR_DEED_ID);
  }, 180_000);

  it('the deed reaches a member who entered this run but is running back from the graveyard', () => {
    const r = temple();
    gather(r);
    tick(r, 0.2);
    answerDungeonGuide(r.sim.ctx, r.guide.id, true, r.lead.id);
    for (const p of [r.lead, ...r.others]) put(r, p, 24, 206);
    // One member stands far outside the claim (a spirit on its way back).
    const away = r.others[0];
    away.pos = { x: 0, y: 0, z: 0 };
    away.prevPos = { ...away.pos };
    r.sim.ctx.handleDeath(bossOf(r, 'ysolei'), r.lead);
    tick(r, 1);
    expect(r.inst.enteredBy.has(away.id)).toBe(true);
    expect(r.sim.meta(away.id)?.deedsEarned.has(CANTOR_DEED_ID)).toBe(true);
    // A stranger who never entered this run gets nothing.
    const stranger = r.sim.addPlayer('mage', 'Passerby');
    expect(r.sim.meta(stranger)?.deedsEarned.has(CANTOR_DEED_ID)).toBe(false);
  }, 180_000);

  it('no deed and no finale when the group went alone', () => {
    const r = temple();
    gather(r);
    tick(r, 0.2);
    answerDungeonGuide(r.sim.ctx, r.guide.id, false, r.lead.id);
    for (const p of [r.lead, ...r.others]) put(r, p, 24, 206);
    r.sim.ctx.handleDeath(bossOf(r, 'ysolei'), r.lead);
    tick(r, 30);
    expect(r.sim.meta(r.lead.id)?.deedsEarned.has(CANTOR_DEED_ID)).toBe(false);
    expect(r.guide.guideState).not.toBe('singing');
    expect(r.guide.pos.z - r.oz).toBeCloseTo(CANTOR_SPAWN.z, 1);
  });
});

describe('determinism', () => {
  it('the guide never draws from the shared rng, whatever he does', () => {
    const drive = (keepGuide: boolean): number[] => {
      const r = temple({ clearTrash: false, seed: 41 });
      if (!keepGuide) {
        r.inst.npcIds.splice(r.inst.npcIds.indexOf(r.guide.id), 1);
        r.sim.ctx.dropEntity(r.guide.id);
      }
      gather(r);
      tick(r, 0.2);
      if (keepGuide) answerDungeonGuide(r.sim.ctx, r.guide.id, true, r.lead.id);
      walkRoute(r, 500);
      tick(r, 10);
      return [r.sim.ctx.rng.next(), r.sim.ctx.rng.next(), r.lead.pos.x, r.lead.hp];
    };
    expect(drive(true)).toEqual(drive(false));
  }, 180_000);

  it('two runs on one seed hear the same lines in the same order', () => {
    const play = (): string[] => {
      const r = temple({ seed: 77 });
      gather(r);
      tick(r, 0.2);
      answerDungeonGuide(r.sim.ctx, r.guide.id, true, r.others[0].id);
      walkRoute(r, 900);
      tick(r, 20);
      return linesFor(r, r.lead.id);
    };
    expect(play()).toEqual(play());
  }, 180_000);

  it('a fresh claim gets a fresh guide with no memory', () => {
    const r = temple();
    gather(r);
    tick(r, 0.2);
    answerDungeonGuide(r.sim.ctx, r.guide.id, true, r.lead.id);
    tick(r, 2);
    const oldId = r.guide.id;
    // The run ends: the claim is freed (its guide goes with it) and claimed anew.
    freeInstance(r.sim.ctx, r.inst);
    expect(r.sim.ctx.entities.has(oldId)).toBe(false);
    r.sim.chat('/dev temple enter normal', r.lead.id);
    const inst = claimedInstanceAt(r.sim.ctx, r.lead.pos);
    const fresh = inst?.npcIds
      .map((id) => r.sim.ctx.entities.get(id))
      .find((e) => e?.templateId === CANTOR_NPC_ID);
    expect(fresh).toBeDefined();
    expect(fresh?.id).not.toBe(oldId);
    expect(fresh?.guideRun).toBeUndefined();
    tick(r, 0.2);
    expect(fresh?.guideState).toBe('open');
    expect(fresh?.guideRun?.done.size).toBe(0);
  });
});
