// The Sunken Bastion bosses (src/sim/encounters/sunken_bastion): each core, its
// counterplay, its heroic twists, the reset on a wipe, and the deed each kill
// can earn. Driven through full Sim ticks inside a real claimed Bastion with a
// real party, the trash cleared so nothing else joins the fight.

import { describe, expect, it } from 'vitest';
import {
  BASTION_BUTTRESSES,
  BREACH_BASTION,
  MOORING_POSTS,
} from '../src/sim/content/sunken_bastion_layout';
import { DUNGEONS, instanceOrigin } from '../src/sim/data';
import {
  BUTTRESS_TEMPLATES,
  CROWN,
  FOG_SHADE_ID,
  inBeam,
  OLEN_BREACHED,
  OLEN_BREACHED_VULN,
  OLEN_ID,
  OLEN_OATHBOUND_CHARGE,
  OLEN_TUNING,
  OLEN_UNBROKEN_OATH,
  OLEN_UNDERTOW,
  OSSICK_CUDGEL,
  OSSICK_CUDGEL_SLOW,
  OSSICK_GAOL_HOOK,
  OSSICK_HOOKED,
  OSSICK_ID,
  OSSICK_KEELHAULED,
  OSSICK_TUNING,
  oathLaneEnd,
  POST_TEMPLATES,
  pickChargeTarget,
  UNDERTOW_TEMPLATE,
  VAEL_DROWNING_HYMN,
  VAEL_EXPOSED,
  VAEL_FOG_VEIL,
  VAEL_ID,
  VAEL_MIST_SURGE,
  VAEL_STAGGER,
  VAEL_TUNING,
  veilBeamYaw,
  WINCH,
} from '../src/sim/encounters/sunken_bastion';
import { claimedInstanceAt, enterDungeon } from '../src/sim/instances/dungeons';
import type { InstanceSlot } from '../src/sim/sim';
import { Sim } from '../src/sim/sim';
import { DT, type Entity } from '../src/sim/types';

interface Fight {
  sim: Sim;
  inst: InstanceSlot;
  ox: number;
  oz: number;
  tank: Entity;
  others: Entity[];
}

const BOSSES = new Set([OLEN_ID, OSSICK_ID, VAEL_ID]);

function fight(difficulty: 'normal' | 'heroic' = 'normal', extra = 2): Fight {
  const sim = new Sim({ seed: 17, playerClass: 'warrior', autoEquip: false, devCommands: true });
  const tank = sim.player;
  sim.chat('/dev level 20', tank.id);
  const ids: number[] = [];
  for (let i = 0; i < extra; i++) {
    const pid = sim.addPlayer('mage', `Tidewalker${i}`);
    sim.partyInvite(pid, tank.id);
    sim.partyAccept(pid);
    ids.push(pid);
  }
  sim.chat(`/dev bastion enter ${difficulty}`, tank.id);
  for (const pid of ids) enterDungeon(sim.ctx, 'sunken_bastion', pid);
  const inst = claimedInstanceAt(sim.ctx, tank.pos);
  if (!inst) throw new Error('no bastion claim');
  // Clear every pack so the bosses fight alone.
  for (const id of inst.mobIds) {
    const e = sim.ctx.entities.get(id);
    if (e && !e.dead && !BOSSES.has(e.templateId)) sim.ctx.handleDeath(e, tank);
  }
  const others = ids.map((pid) => sim.ctx.entities.get(pid) as Entity);
  for (const p of [tank, ...others]) {
    p.maxHp = 1e7;
    p.hp = 1e7;
  }
  const o = instanceOrigin(DUNGEONS.sunken_bastion.index, inst.slot);
  sim.drainEvents();
  return { sim, inst, ox: o.x, oz: o.z, tank, others };
}

function boss(f: Fight, id: string): Entity {
  for (const mid of f.inst.mobIds) {
    const e = f.sim.ctx.entities.get(mid);
    if (e?.templateId === id) return e;
  }
  throw new Error(`no ${id}`);
}

function put(f: Fight, e: Entity, x: number, z: number): void {
  e.pos = f.sim.ctx.groundPos(f.ox + x, f.oz + z);
  e.prevPos = { ...e.pos };
}

function run(f: Fight, seconds: number, keep: () => void = () => {}): void {
  for (let t = 0; t < seconds - DT * 0.5; t += DT) {
    // Keep everyone standing (their pools recalc to their real size), but
    // only top up when low so a test can read one landing's damage.
    for (const p of [f.tank, ...f.others]) if (p.hp < 1e5) p.hp = 1e6;
    keep();
    f.sim.tick();
  }
  f.sim.drainEvents();
}

function engage(f: Fight, b: Entity): void {
  b.maxHp = Math.max(b.maxHp, 1e6);
  b.hp = b.maxHp;
  f.sim.ctx.aggroMob(b, f.tank, false);
}

function objectAt(f: Fight, x: number, z: number): Entity | undefined {
  for (const id of f.inst.objectIds) {
    const e = f.sim.ctx.entities.get(id);
    if (e && Math.abs(e.pos.x - f.ox - x) < 0.75 && Math.abs(e.pos.z - f.oz - z) < 0.75) return e;
  }
  return undefined;
}

function earned(f: Fight, e: Entity, deed: string): boolean {
  return f.sim.players.get(e.id)?.deedsEarned.has(deed) ?? false;
}

// ---------------------------------------------------------------------------
describe('Knight-Commander Olen: bait the Oathbound Charge into a buttress', () => {
  it('stops the lane at the first standing buttress, else at the rim', () => {
    const all = new Set(BASTION_BUTTRESSES.map((b) => b.id));
    // Straight north from the centre: the north buttress.
    const n = oathLaneEnd(BREACH_BASTION.x, BREACH_BASTION.z, 0, all);
    expect(n.buttress).toBe('n');
    expect(n.length).toBeLessThan(BREACH_BASTION.r - 2);
    // The same lane with the north buttress broken: the open rim.
    const open = oathLaneEnd(BREACH_BASTION.x, BREACH_BASTION.z, 0, new Set(['nw', 'ne', 'e']));
    expect(open.buttress).toBeNull();
    expect(open.length).toBeCloseTo(BREACH_BASTION.r - 1, 3);
    // West has no buttress at all.
    expect(oathLaneEnd(BREACH_BASTION.x, BREACH_BASTION.z, -Math.PI / 2, all).buttress).toBeNull();
  });

  it('marks the farthest non-tank player, never the tank while anyone else stands', () => {
    const f = fight();
    const olen = boss(f, OLEN_ID);
    put(f, olen, 57, 130);
    put(f, f.others[0], 57, 140);
    put(f, f.others[1], 57, 118);
    put(f, f.tank, 57, 110);
    olen.aggroTargetId = f.tank.id;
    // others[1] stands 12 yd off, others[0] 10: the farther one is marked,
    // though the tank stands farther still.
    const pick = pickChargeTarget(olen, [f.tank, ...f.others]);
    expect(pick?.id).toBe(f.others[1].id);
    expect(pickChargeTarget(olen, [f.tank])?.id).toBe(f.tank.id);
  });

  it('a crash into a buttress breaches him and cracks it; the second crash breaks it', () => {
    const f = fight();
    const olen = boss(f, OLEN_ID);
    put(f, olen, 57, 128);
    put(f, f.tank, 57, 125);
    // The bait stands before the north buttress.
    const bait = f.others[0];
    const hold = () => {
      put(f, bait, 57, 144);
      put(f, f.others[1], 62, 124);
    };
    hold();
    engage(f, olen);
    run(f, OLEN_TUNING.chargeFirst + DT * 2, hold);
    expect(olen.castingAbility).toBe(OLEN_OATHBOUND_CHARGE);
    expect(olen.castTargetId).toBe(bait.id);
    run(f, OLEN_TUNING.chargeCast + OLEN_TUNING.dashSeconds + 0.2, hold);
    expect(olen.auras.some((a) => a.id === OLEN_BREACHED && a.kind === 'stun')).toBe(true);
    expect(olen.auras.find((a) => a.id === OLEN_BREACHED_VULN)?.value).toBe(0.3);
    const north = BASTION_BUTTRESSES.find((b) => b.id === 'n');
    if (!north) throw new Error('north');
    expect(objectAt(f, north.x, north.z)?.templateId).toBe(BUTTRESS_TEMPLATES.cracked);
    // Walk him back and bait the same buttress again.
    const st = olen.bastionFight;
    if (st?.kind !== 'olen') throw new Error('fight');
    run(f, OLEN_TUNING.breachedStun + 0.2, hold);
    put(f, olen, 57, 128);
    st.chargeTimer = 0;
    run(f, OLEN_TUNING.chargeCast + OLEN_TUNING.dashSeconds + 0.4, () => {
      hold();
    });
    expect(objectAt(f, north.x, north.z)?.templateId).toBe(BUTTRESS_TEMPLATES.broken);
    expect(st.everOath).toBe(false);
  });

  it('a lane to the open rim grants Unbroken Oath, stacking damage done', () => {
    const f = fight();
    const olen = boss(f, OLEN_ID);
    put(f, olen, 57, 128);
    put(f, f.tank, 60, 128);
    const hold = () => {
      put(f, f.others[0], 39, 128);
      put(f, f.others[1], 58, 126);
    };
    hold();
    engage(f, olen);
    run(f, OLEN_TUNING.chargeFirst + OLEN_TUNING.chargeCast + OLEN_TUNING.dashSeconds + 0.3, hold);
    const oath = olen.auras.find((a) => a.id === OLEN_UNBROKEN_OATH);
    expect(oath?.kind).toBe('buff_dmg_done');
    expect(oath?.value).toBeCloseTo(0.1, 6);
    const st = olen.bastionFight;
    expect(st?.kind === 'olen' && st.everOath).toBe(true);
  });

  it('strikes and throws aside everyone in the lane, and nobody outside it', () => {
    const f = fight();
    const olen = boss(f, OLEN_ID);
    put(f, olen, 57, 128);
    put(f, f.tank, 57, 124);
    const inLane = f.others[0];
    const aside = f.others[1];
    const hold = () => {
      put(f, aside, 66, 128);
    };
    put(f, inLane, 57, 142);
    hold();
    engage(f, olen);
    run(f, OLEN_TUNING.chargeFirst + OLEN_TUNING.chargeCast - 0.1, hold);
    const before = inLane.hp;
    const asideBefore = aside.hp;
    const at = { ...inLane.pos };
    f.sim.ctx.entities.get(inLane.id);
    run(f, 0.3, hold);
    expect(before - inLane.hp).toBeGreaterThanOrEqual(OLEN_TUNING.min);
    expect(aside.hp).toBe(asideBefore);
    expect(Math.hypot(inLane.pos.x - at.x, inLane.pos.z - at.z)).toBeGreaterThan(2);
  });

  it('heroic: a buttress breaks on its first crash, and the lane floods behind him', () => {
    const f = fight('heroic');
    const olen = boss(f, OLEN_ID);
    put(f, olen, 57, 128);
    put(f, f.tank, 57, 125);
    const bait = f.others[0];
    const wader = f.others[1];
    put(f, bait, 57, 144);
    put(f, wader, 62, 124);
    engage(f, olen);
    run(f, OLEN_TUNING.chargeFirst + OLEN_TUNING.chargeCast + OLEN_TUNING.dashSeconds + 0.3, () =>
      put(f, bait, 57, 144),
    );
    const north = BASTION_BUTTRESSES.find((b) => b.id === 'n');
    if (!north) throw new Error('north');
    expect(objectAt(f, north.x, north.z)?.templateId).toBe(BUTTRESS_TEMPLATES.broken);
    const wake = f.inst.objectIds
      .map((id) => f.sim.ctx.entities.get(id))
      .find((e) => e?.templateId === UNDERTOW_TEMPLATE);
    expect(wake).toBeDefined();
    // A player standing in the flooded lane is chilled and slowed.
    put(f, wader, 57, 134);
    const before = wader.hp;
    run(f, 1.2, () => put(f, wader, 57, 134));
    expect(wader.hp).toBeLessThan(before);
    expect(wader.auras.some((a) => a.id === OLEN_UNDERTOW && a.kind === 'slow')).toBe(true);
    run(f, OLEN_TUNING.wakeSeconds);
    expect(
      f.inst.objectIds.some((id) => f.sim.ctx.entities.get(id)?.templateId === UNDERTOW_TEMPLATE),
    ).toBe(false);
  });

  it('a wipe stands every buttress back up and clears his oath', () => {
    const f = fight();
    const olen = boss(f, OLEN_ID);
    put(f, olen, 57, 128);
    put(f, f.tank, 57, 125);
    const hold = () => {
      put(f, f.others[0], 57, 144);
      put(f, f.others[1], 62, 124);
    };
    hold();
    engage(f, olen);
    run(f, OLEN_TUNING.chargeFirst + OLEN_TUNING.chargeCast + OLEN_TUNING.dashSeconds + 0.3, hold);
    const north = BASTION_BUTTRESSES.find((b) => b.id === 'n');
    if (!north) throw new Error('north');
    expect(objectAt(f, north.x, north.z)?.templateId).toBe(BUTTRESS_TEMPLATES.cracked);
    // Everyone dies: the fight resets.
    olen.inCombat = false;
    olen.aggroTargetId = null;
    olen.aiState = 'evade';
    run(f, DT * 2);
    expect(objectAt(f, north.x, north.z)?.templateId).toBe(BUTTRESS_TEMPLATES.intact);
    expect(olen.bastionFight).toBeUndefined();
  });

  it('killing him without an oath earns Hold the Wall', () => {
    const f = fight();
    const olen = boss(f, OLEN_ID);
    put(f, olen, 57, 128);
    put(f, f.tank, 57, 125);
    engage(f, olen);
    run(f, 1);
    f.sim.ctx.handleDeath(olen, f.tank);
    run(f, DT * 2);
    expect(earned(f, f.tank, 'dgn_olen_buttress')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('Gaoler Ossick: race the hooked player to a lit mooring post', () => {
  function yard(
    difficulty: 'normal' | 'heroic' = 'normal',
    extra = 2,
  ): { f: Fight; ossick: Entity } {
    const f = fight(difficulty, extra);
    const ossick = boss(f, OSSICK_ID);
    put(f, ossick, -2, 12);
    put(f, f.tank, -2, 9);
    for (const [i, p] of f.others.entries()) put(f, p, -14 + i * 24, 30);
    engage(f, ossick);
    return { f, ossick };
  }

  it('hooks a non-tank player after its bar, the keelhaul 8 s later', () => {
    const { f, ossick } = yard();
    run(f, OSSICK_TUNING.hookFirst + DT * 2);
    expect(ossick.castingAbility).toBe(OSSICK_GAOL_HOOK);
    run(f, OSSICK_TUNING.hookCast + DT);
    const hooked = f.others.find((p) => p.auras.some((a) => a.id === OSSICK_HOOKED));
    expect(hooked).toBeDefined();
    expect(f.tank.auras.some((a) => a.id === OSSICK_HOOKED)).toBe(false);
    const aura = hooked?.auras.find((a) => a.id === OSSICK_HOOKED);
    expect(aura?.remaining).toBeCloseTo(OSSICK_TUNING.keelhaulAfter, 0);
    expect(aura?.value).toBe(1);
  });

  it('a hooked player at a lit post is freed and the post goes dark', () => {
    const { f, ossick } = yard();
    run(f, OSSICK_TUNING.hookFirst + OSSICK_TUNING.hookCast + DT * 3);
    const hooked = f.others.find((p) => p.auras.some((a) => a.id === OSSICK_HOOKED));
    if (!hooked) throw new Error('nobody hooked');
    const post = MOORING_POSTS[0];
    const hold = () => put(f, hooked, post.x + 1.5, post.z);
    const before = hooked.hp;
    run(f, OSSICK_TUNING.keelhaulAfter + 0.2, hold);
    expect(hooked.hp).toBeGreaterThan(before - 1);
    expect(hooked.auras.some((a) => a.id === OSSICK_KEELHAULED)).toBe(false);
    expect(objectAt(f, post.x, post.z)?.templateId).toBe(POST_TEMPLATES.dark);
    const st = ossick.bastionFight;
    expect(st?.kind === 'ossick' && st.keelhauled).toBe(false);
  });

  it('anyone else is dragged to the cage, stunned and drowned', () => {
    const { f, ossick } = yard();
    run(f, OSSICK_TUNING.hookFirst + OSSICK_TUNING.hookCast + DT * 3);
    const hooked = f.others.find((p) => p.auras.some((a) => a.id === OSSICK_HOOKED));
    if (!hooked) throw new Error('nobody hooked');
    put(f, hooked, -2, 42);
    run(f, OSSICK_TUNING.keelhaulAfter - 0.3);
    const before = hooked.hp;
    const far = Math.hypot(hooked.pos.x - f.ox - WINCH.x, hooked.pos.z - f.oz - WINCH.z);
    run(f, 0.5);
    expect(before - hooked.hp).toBeGreaterThanOrEqual(OSSICK_TUNING.min);
    expect(hooked.auras.some((a) => a.id === OSSICK_KEELHAULED && a.kind === 'stun')).toBe(true);
    const near = Math.hypot(hooked.pos.x - f.ox - WINCH.x, hooked.pos.z - f.oz - WINCH.z);
    expect(near).toBeLessThan(far - 5);
    const st = ossick.bastionFight;
    expect(st?.kind === 'ossick' && st.keelhauled).toBe(true);
  });

  it('a dark post takes no pull', () => {
    const { f, ossick } = yard();
    const st0 = () => (ossick.bastionFight?.kind === 'ossick' ? ossick.bastionFight : null);
    run(f, 1);
    const st = st0();
    if (!st) throw new Error('fight');
    const post = MOORING_POSTS[1];
    st.postDarkUntil[post.id] = f.sim.ctx.time + 60;
    run(f, OSSICK_TUNING.hookFirst + OSSICK_TUNING.hookCast);
    const hooked = f.others.find((p) => p.auras.some((a) => a.id === OSSICK_HOOKED));
    if (!hooked) throw new Error('nobody hooked');
    expect(objectAt(f, post.x, post.z)?.templateId).toBe(POST_TEMPLATES.dark);
    run(f, OSSICK_TUNING.keelhaulAfter + 0.2, () => put(f, hooked, post.x + 1, post.z));
    expect(hooked.auras.some((a) => a.id === OSSICK_KEELHAULED)).toBe(true);
  });

  it('heroic: two players are hooked, one post frees only one, and the chain drags', () => {
    const { f } = yard('heroic', 3);
    run(f, OSSICK_TUNING.hookFirst + OSSICK_TUNING.hookCast + DT * 3);
    const hooked = f.others.filter((p) => p.auras.some((a) => a.id === OSSICK_HOOKED));
    expect(hooked).toHaveLength(2);
    for (const h of hooked) {
      expect(h.auras.find((a) => a.id === OSSICK_HOOKED)?.value).toBe(OSSICK_TUNING.heavyChainSlow);
    }
    const post = MOORING_POSTS[2];
    run(f, OSSICK_TUNING.keelhaulAfter + 0.2, () => {
      put(f, hooked[0], post.x + 1, post.z);
      put(f, hooked[1], post.x - 1, post.z);
    });
    const hauled = hooked.filter((h) => h.auras.some((a) => a.id === OSSICK_KEELHAULED));
    expect(hauled).toHaveLength(1);
  });

  it('the cudgel falls on the tank with a slow', () => {
    const { f, ossick } = yard();
    run(f, OSSICK_TUNING.cudgelFirst + DT * 2);
    expect(ossick.castingAbility).toBe(OSSICK_CUDGEL);
    run(f, OSSICK_TUNING.cudgelCast + 0.1);
    expect(f.tank.auras.find((a) => a.id === OSSICK_CUDGEL_SLOW)?.value).toBe(
      OSSICK_TUNING.cudgelSlow,
    );
  });

  it('opens the cells at 60 percent: three prisoners break out', () => {
    const { f, ossick } = yard();
    run(f, 0.5);
    ossick.hp = Math.round(ossick.maxHp * 0.59);
    run(f, DT * 2);
    const prisoners = ossick.summonedIds
      .map((id) => f.sim.ctx.entities.get(id))
      .filter((e) => e?.templateId === 'shackled_prisoner' && !e.dead);
    expect(prisoners).toHaveLength(3);
  });

  it('a wipe takes the hooks off and relights the posts; a clean kill earns Safe Harbor', () => {
    const { f, ossick } = yard();
    run(f, 1);
    const st = ossick.bastionFight;
    if (st?.kind !== 'ossick') throw new Error('fight');
    st.postDarkUntil[MOORING_POSTS[3].id] = f.sim.ctx.time + 60;
    run(f, DT * 2);
    expect(objectAt(f, MOORING_POSTS[3].x, MOORING_POSTS[3].z)?.templateId).toBe(
      POST_TEMPLATES.dark,
    );
    ossick.inCombat = false;
    ossick.aggroTargetId = null;
    ossick.aiState = 'evade';
    run(f, DT * 2);
    expect(objectAt(f, MOORING_POSTS[3].x, MOORING_POSTS[3].z)?.templateId).toBe(
      POST_TEMPLATES.lit,
    );
    // A fresh pull, killed clean.
    const again = yard();
    run(again.f, 1);
    again.f.sim.ctx.handleDeath(again.ossick, again.f.tank);
    run(again.f, DT * 2);
    expect(earned(again.f, again.f.tank, 'dgn_ossick_moored')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('Vael the Fogbinder: find the real Vael among the fog shades', () => {
  function roof(difficulty: 'normal' | 'heroic' = 'normal'): { f: Fight; vael: Entity } {
    const f = fight(difficulty);
    const vael = boss(f, VAEL_ID);
    put(f, vael, -4, 226);
    put(f, f.tank, -4, 223);
    put(f, f.others[0], 8, 218);
    put(f, f.others[1], -16, 196);
    engage(f, vael);
    return { f, vael };
  }

  function shades(f: Fight): Entity[] {
    return [...f.sim.ctx.entities.values()].filter((e) => e.templateId === FOG_SHADE_ID && !e.dead);
  }

  it('beam geometry: a figure in the beam is lit, one across the roof is not', () => {
    const yaw = 0;
    expect(inBeam(yaw, CROWN.x, CROWN.z + 20)).toBe(true);
    expect(inBeam(yaw, CROWN.x + 20, CROWN.z)).toBe(false);
    expect(veilBeamYaw(0, VAEL_TUNING.beamPeriod / 4)).toBeCloseTo(Math.PI / 2, 6);
  });

  it('Mist Surge: a 1.5 s bar, then frost to everyone within 12 yd only', () => {
    const { f, vael } = roof();
    run(f, VAEL_TUNING.surgeFirst + DT * 2);
    expect(vael.castingAbility).toBe(VAEL_MIST_SURGE);
    const near = f.tank.hp;
    const far = f.others[1].hp;
    run(f, VAEL_TUNING.surgeCast + 0.1);
    expect(f.tank.hp).toBeLessThan(near);
    expect(f.others[1].hp).toBe(far);
  });

  it('the Fog Veil: three shades wearing his name and health, all four singing', () => {
    const { f, vael } = roof();
    run(f, 0.5);
    vael.hp = Math.round(vael.maxHp * 0.69);
    run(f, DT * 2);
    const list = shades(f);
    expect(list).toHaveLength(3);
    for (const s of list) {
      expect(s.name).toBe(vael.name);
      expect(s.hp).toBe(vael.hp);
      expect(s.maxHp).toBe(vael.maxHp);
      expect(s.castingAbility).toBe(VAEL_DROWNING_HYMN);
    }
    expect(vael.castingAbility).toBe(VAEL_DROWNING_HYMN);
    expect(vael.auras.some((a) => a.id === VAEL_FOG_VEIL)).toBe(true);
    // Every figure stands on the rim.
    for (const e of [vael, ...list]) {
      const r = Math.hypot(e.pos.x - f.ox - CROWN.x, e.pos.z - f.oz - CROWN.z);
      expect(r).toBeCloseTo(CROWN.r - 5, 0);
    }
    // The hymn swells: every second, more frost.
    const a = f.others[1].hp;
    run(f, 1);
    const first = a - f.others[1].hp;
    run(f, 6);
    const b = f.others[1].hp;
    run(f, 1);
    expect(b - f.others[1].hp).toBeGreaterThan(first);
  });

  it('striking a shade bursts it (Fogburst), and costs the deed', () => {
    const { f, vael } = roof();
    run(f, 0.5);
    vael.hp = Math.round(vael.maxHp * 0.69);
    run(f, DT * 2);
    const shade = shades(f)[0];
    put(f, f.others[0], shade.pos.x - f.ox + 2, shade.pos.z - f.oz);
    const before = f.others[0].hp;
    f.sim.dealDamage(f.others[0], shade, 50, false, 'fire', 'Fireball', 'hit', true);
    run(f, DT * 2, () => put(f, f.others[0], shade.pos.x - f.ox + 2, shade.pos.z - f.oz));
    expect(shades(f)).toHaveLength(2);
    expect(f.others[0].hp).toBeLessThan(before);
    const st = vael.bastionFight;
    expect(st?.kind === 'vael' && st.burst).toBe(true);
  });

  it('striking the real Vael for 5 percent breaks the veil: he staggers and is exposed', () => {
    const { f, vael } = roof();
    run(f, 0.5);
    vael.hp = Math.round(vael.maxHp * 0.69);
    run(f, DT * 2);
    f.sim.dealDamage(
      f.tank,
      vael,
      Math.ceil(vael.maxHp * 0.051),
      false,
      'physical',
      'Strike',
      'hit',
      true,
    );
    run(f, DT * 2);
    expect(shades(f)).toHaveLength(0);
    expect(vael.castingAbility).not.toBe(VAEL_DROWNING_HYMN);
    expect(vael.auras.some((a) => a.id === VAEL_STAGGER && a.kind === 'stun')).toBe(true);
    expect(vael.auras.find((a) => a.id === VAEL_EXPOSED)?.value).toBe(VAEL_TUNING.exposed);
  });

  it('left alone, the hymn runs its 18 s and the fog lifts', () => {
    const { f, vael } = roof();
    run(f, 0.5);
    vael.hp = Math.round(vael.maxHp * 0.69);
    run(f, VAEL_TUNING.hymnSeconds + 0.3);
    expect(shades(f)).toHaveLength(0);
    expect(vael.auras.some((a) => a.id === VAEL_FOG_VEIL)).toBe(false);
  });

  it('heroic: the figures drift round the rim, and a burst shade leaves a thrall', () => {
    const { f, vael } = roof('heroic');
    run(f, 0.5);
    vael.hp = Math.round(vael.maxHp * 0.69);
    run(f, DT * 2);
    const at = { x: vael.pos.x, z: vael.pos.z };
    run(f, VAEL_TUNING.driftEvery + 0.2);
    expect(Math.hypot(vael.pos.x - at.x, vael.pos.z - at.z)).toBeGreaterThan(5);
    const shade = shades(f)[0];
    f.sim.dealDamage(f.tank, shade, 50, false, 'physical', 'Strike', 'hit', true);
    run(f, DT * 2);
    const thralls = [...f.sim.ctx.entities.values()].filter(
      (e) => e.templateId === 'drowned_thrall' && !e.dead,
    );
    expect(thralls.length).toBeGreaterThanOrEqual(1);
  });

  it('killing him with every shade untouched earns the beacon deed', () => {
    const { f, vael } = roof();
    run(f, 1);
    f.sim.ctx.handleDeath(vael, f.tank);
    run(f, DT * 2);
    expect(earned(f, f.tank, 'dgn_vael_beacon')).toBe(true);
  });
});
