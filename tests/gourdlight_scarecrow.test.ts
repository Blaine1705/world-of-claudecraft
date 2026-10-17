// Old Thatchgrin, Gourdlight Eve's field boss (src/sim/seasonal/scarecrow*.ts): he stands
// in his field only while the event runs (host-fed or /dev), his field resolves against
// the live world, his kit telegraphs and lands deterministically, every contributor gets
// personal spoils once per daily reset, and what he pays is cosmetic or currency.
import { describe, expect, it } from 'vitest';
import { GOURDLIGHT_EVE_ID, GOURDLIGHT_SWEET_ID } from '../src/sim/content/gourdlight_eve';
import {
  GOURDLIGHT_CROW_ID,
  STRAWLING_CHARM_ID,
  STRAWLING_GUISE_AURA_ID,
  STRAWLING_ID,
  THATCHGRIN_CHAFF_ABILITY,
  THATCHGRIN_GOURD_ABILITY,
  THATCHGRIN_HP_STEP_RATIO,
  THATCHGRIN_ID,
  THATCHGRIN_KIT,
  THATCHGRIN_SACK_ID,
  THATCHGRIN_SACK_SWEETS,
} from '../src/sim/content/gourdlight_eve_scarecrow';
import { ITEMS, MOBS } from '../src/sim/data';
import { openWorldMobScale } from '../src/sim/mob/open_world_tuning';
import { updateSeasonal } from '../src/sim/seasonal';
import {
  measureScarecrowField,
  resolveScarecrowField,
  SCARECROW_FIELD_CAMP_CLEARANCE,
  SCARECROW_FIELD_RADIUS,
  SCARECROW_FIELD_ROAD_CLEARANCE,
  scarecrowFieldPasses,
} from '../src/sim/seasonal/scarecrow_field';
import { Sim } from '../src/sim/sim';
import type { Entity, SimEvent } from '../src/sim/types';
import { worldBossLockoutId } from '../src/sim/world_boss';
import { WORLD_SEED } from '../src/sim/world_seed';

function world(): Sim {
  const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior', devCommands: true });
  sim.resetDay = '2026-10-20';
  return sim;
}

function boss(sim: Sim): Entity | undefined {
  return [...sim.entities.values()].find((e) => e.templateId === THATCHGRIN_ID);
}

function standUp(sim: Sim): Entity {
  sim.chat('/dev season on');
  sim.tick();
  const b = boss(sim);
  if (!b) throw new Error('no Thatchgrin');
  return b;
}

/** A tanky level-20 stand-in parked in his face, already on his hate table. */
function engage(sim: Sim, pid: number, b: Entity, dx = 2): Entity {
  const p = sim.entities.get(pid) as Entity;
  p.pos = { ...b.pos, x: b.pos.x + dx };
  p.prevPos = { ...p.pos };
  p.level = 20;
  p.maxHp = 1_000_000;
  p.hp = 1_000_000;
  (sim as any).dealDamage(p, b, 10, false, 'physical', 'Chip', 'hit', true);
  return p;
}

function spellfxAt(events: SimEvent[], ability: string) {
  return events.filter(
    (e): e is Extract<SimEvent, { type: 'spellfxAt' }> =>
      e.type === 'spellfxAt' && e.ability === ability,
  );
}

describe('his field', () => {
  it('resolves against the shipped world, clear, dry, flat and away from roads and camps', () => {
    world();
    const field = resolveScarecrowField(WORLD_SEED);
    expect(field).not.toBeNull();
    if (!field) return;
    const check = measureScarecrowField(WORLD_SEED, field.x, field.z);
    expect(scarecrowFieldPasses(check)).toBe(true);
    expect(check.road).toBeGreaterThanOrEqual(SCARECROW_FIELD_ROAD_CLEARANCE);
    expect(check.camp).toBeGreaterThanOrEqual(SCARECROW_FIELD_CAMP_CLEARANCE);
    expect(SCARECROW_FIELD_RADIUS).toBeGreaterThan(THATCHGRIN_KIT.gourd.radius);
  });

  it('is the same spot every time (pure, memoized)', () => {
    world();
    expect(resolveScarecrowField(WORLD_SEED)).toEqual(resolveScarecrowField(WORLD_SEED));
  });
});

describe('the season gate', () => {
  it('stands only while Gourdlight Eve runs: none offline, up on /dev, gone on close', () => {
    const sim = world();
    for (let i = 0; i < 5; i++) sim.tick();
    expect(boss(sim)).toBeUndefined();
    const b = standUp(sim);
    const field = resolveScarecrowField(WORLD_SEED);
    expect(b.pos.x).toBeCloseTo(field?.x ?? 0, 5);
    expect(b.pos.z).toBeCloseTo(field?.z ?? 0, 5);
    sim.chat('/dev season off');
    sim.tick();
    expect(boss(sim)).toBeUndefined();
  });

  it('rises on the host calendar too (the server path), with no dev override', () => {
    const sim = world();
    (sim as any).ctx.seasonal.hostEventId = GOURDLIGHT_EVE_ID;
    sim.tick();
    expect(boss(sim)?.templateId).toBe(THATCHGRIN_ID);
    (sim as any).ctx.seasonal.hostEventId = null;
    sim.tick();
    expect(boss(sim)).toBeUndefined();
  });

  it('takes his adds with him when the event closes mid-fight', () => {
    const sim = world();
    const b = standUp(sim);
    engage(sim, sim.playerId, b);
    sim.tick();
    b.hp = Math.floor(b.maxHp * 0.79);
    for (let i = 0; i < 60; i++) sim.tick();
    expect(b.summonedIds.length).toBeGreaterThan(0);
    const adds = [...b.summonedIds];
    sim.chat('/dev season off');
    sim.tick();
    for (const id of adds) expect(sim.entities.has(id)).toBe(false);
  });
});

describe('his tuning', () => {
  it('is the Waking Warden ladder on the open-world curve, scaled per contributor by the world-boss step', () => {
    const sim = world();
    const b = standUp(sim);
    const t = MOBS[THATCHGRIN_ID];
    const raw = (t.hpBase + t.hpPerLevel * 19) * 2.3;
    expect(b.maxHp / raw).toBeCloseTo(openWorldMobScale(20).health, 1);
    const base = b.maxHp;
    const a = sim.addPlayer('mage', 'Ada');
    engage(sim, sim.playerId, b);
    engage(sim, a, b, -2);
    sim.tick();
    expect(b.maxHp).toBe(base + Math.round(base * THATCHGRIN_HP_STEP_RATIO));
  });

  it('is a world boss in every rule, flagged seasonal, and pays nothing that is power', () => {
    const t = MOBS[THATCHGRIN_ID];
    expect(t.worldBoss).toBe(true);
    expect(t.seasonalEvent).toBe(GOURDLIGHT_EVE_ID);
    for (const entry of t.loot) {
      const item = ITEMS[entry.itemId ?? ''];
      expect(item).toBeDefined();
      expect(item.kind).toBe('tool');
      expect((item as { stats?: unknown }).stats).toBeUndefined();
    }
    expect(MOBS[GOURDLIGHT_CROW_ID].loot).toEqual([]);
    expect(MOBS[STRAWLING_ID].loot).toEqual([]);
  });
});

describe('his kit', () => {
  it('throws a Kindled Gourd: rings first, the burst after the windup, then burning chaff', () => {
    const sim = world();
    const b = standUp(sim);
    const p = engage(sim, sim.playerId, b, 6);
    p.gm = false;
    let rings: ReturnType<typeof spellfxAt> = [];
    let ticks = 0;
    while (rings.length === 0 && ticks < 20 * 20) {
      rings = spellfxAt(sim.tick(), THATCHGRIN_GOURD_ABILITY).filter((e) => e.fx === 'runeCircle');
      ticks++;
    }
    expect(rings).toHaveLength(1);
    expect(ticks / 20).toBeGreaterThanOrEqual(THATCHGRIN_KIT.gourd.first - 0.2);
    expect(rings[0].radius).toBe(THATCHGRIN_KIT.gourd.radius);
    expect(rings[0].duration).toBe(THATCHGRIN_KIT.gourd.windup);
    // Freeze the target on the ring so the landing reads true.
    const hpBefore = p.hp;
    let burst = false;
    let chaff = false;
    for (let i = 0; i < Math.ceil(THATCHGRIN_KIT.gourd.windup * 20) + 2; i++) {
      p.pos.x = rings[0].x;
      p.pos.z = rings[0].z;
      const ev = sim.tick();
      if (spellfxAt(ev, THATCHGRIN_GOURD_ABILITY).some((e) => e.fx === 'nova')) burst = true;
      if (spellfxAt(ev, THATCHGRIN_CHAFF_ABILITY).length > 0) chaff = true;
    }
    expect(burst).toBe(true);
    expect(chaff).toBe(true);
    expect(p.hp).toBeLessThan(hpBefore);
  });

  it('burns whoever stands in the chaff once a second, and stops when it gutters out', () => {
    const sim = world();
    const b = standUp(sim);
    const p = engage(sim, sim.playerId, b, 6);
    const kit = () => (sim as any).ctx.seasonal.scarecrow.kit;
    while (!kit()) sim.tick();
    kit().chaff = [p.pos.x, p.pos.z, THATCHGRIN_KIT.chaff.seconds, THATCHGRIN_KIT.chaff.interval];
    kit().gourdTimer = 999;
    let burns = 0;
    const hits = (ev: SimEvent[]) =>
      ev.filter(
        (e) =>
          e.type === 'damage' &&
          (e as any).targetId === p.id &&
          (e as any).ability === THATCHGRIN_KIT.chaff.name,
      ).length;
    for (let i = 0; i < THATCHGRIN_KIT.chaff.seconds * 20 + 40; i++) burns += hits(sim.tick());
    expect(burns).toBe(THATCHGRIN_KIT.chaff.seconds / THATCHGRIN_KIT.chaff.interval);
    expect(kit().chaff).toHaveLength(0);
  });

  it('calls crows, then strawlings, at falling health, once per pull each', () => {
    const sim = world();
    const b = standUp(sim);
    engage(sim, sim.playerId, b);
    sim.tick();
    const addsOf = (id: string) =>
      b.summonedIds.filter((a) => sim.entities.get(a)?.templateId === id).length;
    b.hp = Math.floor(b.maxHp * 0.79);
    for (let i = 0; i < 60; i++) sim.tick();
    expect(addsOf(GOURDLIGHT_CROW_ID)).toBe(THATCHGRIN_KIT.calls[0].count);
    expect(addsOf(STRAWLING_ID)).toBe(0);
    b.hp = Math.floor(b.maxHp * 0.59);
    for (let i = 0; i < 100; i++) sim.tick();
    expect(addsOf(STRAWLING_ID)).toBe(THATCHGRIN_KIT.calls[1].count);
    // no second wave while he sits under the same threshold
    for (let i = 0; i < 100; i++) sim.tick();
    expect((sim as any).ctx.seasonal.scarecrow.kit.callsFired).toBe(2);
  });

  it('is deterministic: the same seed and the same fight draw the same gourds', () => {
    const run = () => {
      const sim = world();
      const b = standUp(sim);
      engage(sim, sim.playerId, b, 6);
      const a = sim.addPlayer('mage', 'Ada');
      const c = sim.addPlayer('priest', 'Cy');
      engage(sim, a, b, -6);
      engage(sim, c, b, 9);
      const out: string[] = [];
      for (let i = 0; i < 20 * 40; i++) {
        for (const e of spellfxAt(sim.tick(), THATCHGRIN_GOURD_ABILITY)) {
          out.push(`${e.fx}:${e.x.toFixed(3)}:${e.z.toFixed(3)}`);
        }
      }
      return out;
    };
    const first = run();
    expect(first.length).toBeGreaterThan(0);
    expect(run()).toEqual(first);
  });

  it('drops the pull (kit and adds) when he evades home', () => {
    const sim = world();
    const b = standUp(sim);
    engage(sim, sim.playerId, b);
    sim.tick();
    b.hp = Math.floor(b.maxHp * 0.79);
    for (let i = 0; i < 60; i++) sim.tick();
    expect(b.summonedIds.length).toBeGreaterThan(0);
    b.aiState = 'evade';
    sim.tick();
    expect((sim as any).ctx.seasonal.scarecrow.kit).toBeNull();
  });
});

describe('his spoils', () => {
  function killWithTwo(sim: Sim) {
    const b = standUp(sim);
    const a = sim.addPlayer('mage', 'Ada');
    engage(sim, sim.playerId, b);
    engage(sim, a, b, -2);
    sim.tick();
    (sim as any).dealDamage(sim.player, b, b.hp + 10, false, 'physical', 'Chip', 'hit', true);
    sim.tick();
    expect(b.dead).toBe(true);
    return { b, a };
  }

  it('pays every contributor a personal sack, locks each out on loot until the daily reset', () => {
    const sim = world();
    const { b, a } = killWithTwo(sim);
    for (const pid of [sim.playerId, a]) {
      const e = sim.entities.get(pid) as Entity;
      e.pos = { ...b.pos };
      expect(sim.lootCorpse(b.id, pid)).toBe(true);
      expect(sim.countItem(THATCHGRIN_SACK_ID, pid)).toBe(1);
      const meta = (sim as any).players.get(pid);
      expect(meta.raidLockouts.get(worldBossLockoutId(THATCHGRIN_ID))).toBeGreaterThan(0);
    }
    // The next spawn pays nobody locked out.
    sim.chat('/dev scarecrow reset');
    sim.tick();
    const b2 = boss(sim) as Entity;
    engage(sim, sim.playerId, b2);
    sim.tick();
    (sim as any).dealDamage(sim.player, b2, b2.hp + 10, false, 'physical', 'Chip', 'hit', true);
    sim.tick();
    const mine = (b2.loot?.items ?? []).filter((s) => s.personalFor?.includes(sim.playerId));
    expect(mine).toHaveLength(0);
  });

  it('never credits the weekly world-boss quest, but counts his feat for every contributor', () => {
    const sim = world();
    const { a } = killWithTwo(sim);
    for (const pid of [sim.playerId, a]) {
      const meta = (sim as any).players.get(pid);
      expect(meta.deedStats.counters.thatchgrinKills).toBe(1);
    }
  });

  it('the sack opens to its sweets; the charm wears the strawling guise, never in combat', () => {
    const sim = world();
    sim.chat('/dev season on');
    sim.tick();
    sim.addItem(THATCHGRIN_SACK_ID, 1);
    sim.useItem(THATCHGRIN_SACK_ID);
    expect(sim.countItem(GOURDLIGHT_SWEET_ID)).toBe(THATCHGRIN_SACK_SWEETS);
    expect(sim.countItem(THATCHGRIN_SACK_ID)).toBe(0);
    sim.addItem(STRAWLING_CHARM_ID, 1);
    sim.useItem(STRAWLING_CHARM_ID);
    expect(sim.player.auras.some((x) => x.id === STRAWLING_GUISE_AURA_ID)).toBe(true);
    expect(sim.countItem(STRAWLING_CHARM_ID)).toBe(1);
    sim.player.inCombat = true;
    updateSeasonal((sim as any).ctx);
    expect(sim.player.auras.some((x) => x.id === STRAWLING_GUISE_AURA_ID)).toBe(false);
  });
});
