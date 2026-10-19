// The Smith's Heart's gating (src/sim/encounters/smith_heart/seal.ts and the
// shared gate engine over content/smith_heart.ts SMITH_HEART_GATES), driven
// through a real Sim claim:
// - a fresh claim: every gate shut, the seal dark;
// - the Hammer ALWAYS FIRST: its death splits the Slab and lights the ochre
//   quarter, and nothing else orders the other three;
// - the Breath, the Quench and the Heat light in any order, each with its own
//   line to the raid, each once;
// - the causeways into the Heart open only with all four lit AND the Ring
//   clear, and seal behind the raid while the final boss fights;
// - a reset (a fresh claim) starts dark again;
// - the raid is dev-only while it is a blockout.

import { afterEach, describe, expect, it } from 'vitest';
import {
  SMITH_HEART_FINAL_BOSS,
  SMITH_HEART_GATES,
  SMITH_HEART_GUARDIANS,
  SMITH_HEART_PACKS,
} from '../src/sim/content/smith_heart';
import { SMITH_HEART_VEINS, type SmithHeartVein } from '../src/sim/content/smith_heart_layout';
import { BUILTIN_WORLD, DUNGEONS } from '../src/sim/data';
import {
  SMITH_HEART_CLOSED_TEXT,
  SMITH_HEART_SEAL_FULL,
  SMITH_HEART_VEIN_BITS,
  SMITH_HEART_VEIN_LIT_LOG,
  smithHeartLitCount,
  smithHeartProgress,
  smithHeartSealMaskOf,
  smithHeartSealTemplate,
  smithHeartVeinLit,
} from '../src/sim/encounters/smith_heart';
import { clearDungeonGateStateForTest } from '../src/sim/instances/dungeon_gate_state';
import { dungeonGateState } from '../src/sim/instances/dungeon_gates';
import { enterDungeon, freeInstance } from '../src/sim/instances/dungeons';
import type { InstanceSlot } from '../src/sim/sim';
import { Sim } from '../src/sim/sim';
import type { Entity, WorldContent } from '../src/sim/types';
import { localizeSimText } from '../src/ui/sim_i18n';

const WORLD: WorldContent = { ...BUILTIN_WORLD, camps: [], npcs: {}, groundObjects: [] };
const SPAWNS = DUNGEONS.smith_heart.spawns;

function setup(seed = 17): { sim: Sim; pid: number; inst: InstanceSlot } {
  const sim = new Sim({
    seed,
    playerClass: 'warrior',
    noPlayer: true,
    world: WORLD,
    devCommands: true,
  });
  const pid = sim.addPlayer('warrior', 'Heartwalker');
  expect(enterDungeon(sim.ctx, 'smith_heart', pid)).toBe(true);
  const inst = sim.ctx.instances.find(
    (i) => i.dungeonId === 'smith_heart' && i.partyKey !== null,
  ) as InstanceSlot;
  sim.tick();
  return { sim, pid, inst };
}

function gate(id: string) {
  const g = SMITH_HEART_GATES.find((x) => x.id === id);
  if (!g) throw new Error(id);
  return g;
}

function state(sim: Sim, inst: InstanceSlot, id: string) {
  return dungeonGateState(sim.ctx, inst, gate(id));
}

/** Kill every claim mob of the listed packs or templates (instant, no loot). */
function kill(sim: Sim, inst: InstanceSlot, ids: readonly string[]): void {
  SPAWNS.forEach((s, i) => {
    if (!ids.includes(s.packId ?? '') && !ids.includes(s.mobId)) return;
    const mob = sim.ctx.entities.get(inst.mobIds[i]) as Entity;
    mob.hp = 0;
    mob.dead = true;
    mob.aiState = 'dead';
    mob.inCombat = false;
  });
}

function markers(sim: Sim, inst: InstanceSlot): number[] {
  const out: number[] = [];
  for (const id of inst.objectIds) {
    const e = sim.ctx.entities.get(id);
    const m = e ? smithHeartSealMaskOf(e.templateId) : null;
    if (m !== null) out.push(m);
  }
  return out;
}

function logs(events: unknown[], pid: number): string[] {
  return (events as { type: string; text?: string; pid?: number }[])
    .filter((e) => e.type === 'log' && e.pid === pid)
    .map((e) => e.text ?? '');
}

const HEART_GATES = ['causeway_north', 'causeway_east', 'causeway_west'];
const ARENA_MOUTH: Record<Exclude<SmithHeartVein, 'hammer'>, string> = {
  breath: 'cornice_mouth',
  quench: 'lake_mouth',
  heat: 'anvil_mouth',
};

describe("the Smith's Heart gating", () => {
  afterEach(() => clearDungeonGateStateForTest());

  it('the seal mask round-trips through the marker template id', () => {
    for (let m = 0; m <= SMITH_HEART_SEAL_FULL; m++) {
      expect(smithHeartSealMaskOf(smithHeartSealTemplate(m))).toBe(m);
    }
    expect(smithHeartSealMaskOf('sanctum_story_3')).toBeNull();
    expect(smithHeartSealMaskOf('smith_heart_seal_16')).toBeNull();
    expect(smithHeartLitCount(SMITH_HEART_SEAL_FULL)).toBe(4);
    expect(smithHeartVeinLit(SMITH_HEART_VEIN_BITS.quench, 'quench')).toBe(true);
    expect(smithHeartVeinLit(SMITH_HEART_VEIN_BITS.quench, 'heat')).toBe(false);
  });

  it('a fresh claim: every gate with a prerequisite is shut and the seal is dark', () => {
    const { sim, inst } = setup();
    for (const g of SMITH_HEART_GATES) expect(state(sim, inst, g.id), g.id).toBe('closed');
    const ms = markers(sim, inst);
    expect(ms.length).toBeGreaterThan(0);
    expect(ms.every((m) => m === 0)).toBe(true);
    expect(smithHeartProgress(sim.ctx, inst)).toEqual({
      mask: 0,
      slabOpen: false,
      sealLit: false,
      ringClear: false,
      heartOpen: false,
    });
  });

  it('the Hammer goes first: its packs open the Pit, its death splits the Slab', () => {
    const { sim, pid, inst } = setup();
    kill(sim, inst, SMITH_HEART_PACKS.hammer);
    sim.tick();
    expect(state(sim, inst, 'hammer_pit_mouth')).toBe('open');
    expect(state(sim, inst, 'the_slab')).toBe('closed');
    kill(sim, inst, [SMITH_HEART_GUARDIANS.hammer]);
    const events = sim.tick();
    expect(state(sim, inst, 'the_slab')).toBe('open');
    expect(markers(sim, inst).every((m) => m === SMITH_HEART_VEIN_BITS.hammer)).toBe(true);
    expect(logs(events, pid)).toContain(SMITH_HEART_VEIN_LIT_LOG.hammer);
    expect(smithHeartProgress(sim.ctx, inst).slabOpen).toBe(true);
    // Said once.
    expect(logs(sim.tick(), pid)).not.toContain(SMITH_HEART_VEIN_LIT_LOG.hammer);
  });

  it('the other three veins light in any order, each arena behind its own packs only', () => {
    const orders: SmithHeartVein[][] = [
      ['breath', 'quench', 'heat'],
      ['heat', 'breath', 'quench'],
      ['quench', 'heat', 'breath'],
    ];
    for (const order of orders) {
      const { sim, pid, inst } = setup();
      kill(sim, inst, [...SMITH_HEART_PACKS.hammer, SMITH_HEART_GUARDIANS.hammer]);
      sim.tick();
      let mask = SMITH_HEART_VEIN_BITS.hammer;
      for (const vein of order) {
        const v = vein as Exclude<SmithHeartVein, 'hammer'>;
        expect(state(sim, inst, ARENA_MOUTH[v])).toBe('closed');
        kill(sim, inst, SMITH_HEART_PACKS[v]);
        sim.tick();
        expect(state(sim, inst, ARENA_MOUTH[v])).toBe('open');
        kill(sim, inst, [SMITH_HEART_GUARDIANS[v]]);
        const events = sim.tick();
        mask |= SMITH_HEART_VEIN_BITS[v];
        expect(markers(sim, inst).every((m) => m === mask)).toBe(true);
        expect(logs(events, pid)).toContain(SMITH_HEART_VEIN_LIT_LOG[v]);
      }
      expect(mask).toBe(SMITH_HEART_SEAL_FULL);
      clearDungeonGateStateForTest();
    }
  });

  it('the Heart opens only with all four lit and the Ring clear', () => {
    const { sim, inst } = setup();
    kill(sim, inst, Object.values(SMITH_HEART_GUARDIANS));
    sim.tick();
    expect(smithHeartProgress(sim.ctx, inst).sealLit).toBe(true);
    for (const id of HEART_GATES) expect(state(sim, inst, id), id).toBe('closed');
    kill(sim, inst, SMITH_HEART_PACKS.ring.slice(0, 7));
    sim.tick();
    for (const id of HEART_GATES) expect(state(sim, inst, id), id).toBe('closed');
    kill(sim, inst, SMITH_HEART_PACKS.ring);
    sim.tick();
    for (const id of HEART_GATES) expect(state(sim, inst, id), id).toBe('open');
    expect(smithHeartProgress(sim.ctx, inst).heartOpen).toBe(true);
    // Ring clear but a guardian alive: still shut.
    const fresh = setup(23);
    kill(fresh.sim, fresh.inst, [
      ...SMITH_HEART_PACKS.ring,
      ...SMITH_HEART_VEINS.slice(0, 3).map((v) => SMITH_HEART_GUARDIANS[v]),
    ]);
    fresh.sim.tick();
    for (const id of HEART_GATES) expect(state(fresh.sim, fresh.inst, id), id).toBe('closed');
  });

  it('every causeway seals for the final boss, every arena mouth for its guardian', () => {
    for (const id of HEART_GATES) expect(gate(id).sealWhileEngaged).toBe(SMITH_HEART_FINAL_BOSS);
    expect(gate('hammer_pit_mouth').sealWhileEngaged).toBe(SMITH_HEART_GUARDIANS.hammer);
    for (const [vein, id] of Object.entries(ARENA_MOUTH)) {
      expect(gate(id).sealWhileEngaged).toBe(SMITH_HEART_GUARDIANS[vein as SmithHeartVein]);
    }
    // No gate of one free vein waits on another vein's guardian or packs.
    for (const [vein, id] of Object.entries(ARENA_MOUTH)) {
      const g = gate(id);
      expect(g.bosses ?? []).toEqual([]);
      expect(g.packs).toEqual([...SMITH_HEART_PACKS[vein as keyof typeof ARENA_MOUTH]]);
    }
  });

  it('a reset starts the seal dark and every gate shut again', () => {
    const { sim, pid, inst } = setup();
    kill(sim, inst, Object.values(SMITH_HEART_GUARDIANS));
    sim.tick();
    expect(markers(sim, inst).every((m) => m === SMITH_HEART_SEAL_FULL)).toBe(true);
    freeInstance(sim.ctx, inst);
    expect(enterDungeon(sim.ctx, 'smith_heart', pid)).toBe(true);
    const again = sim.ctx.instances.find(
      (i) => i.dungeonId === 'smith_heart' && i.partyKey !== null,
    ) as InstanceSlot;
    sim.tick();
    expect(markers(sim, again).every((m) => m === 0)).toBe(true);
    expect(state(sim, again, 'the_slab')).toBe('closed');
  });

  it('is dev-only while it is a blockout', () => {
    const sim = new Sim({ seed: 3, playerClass: 'warrior', noPlayer: true, world: WORLD });
    const pid = sim.addPlayer('warrior', 'Outsider');
    expect(enterDungeon(sim.ctx, 'smith_heart', pid)).toBe(false);
    sim.tick();
    expect(
      sim.ctx.instances.some((i) => i.dungeonId === 'smith_heart' && i.partyKey !== null),
    ).toBe(false);
  });

  it('every line it sends the raid is localized', () => {
    for (const text of [...Object.values(SMITH_HEART_VEIN_LIT_LOG), SMITH_HEART_CLOSED_TEXT]) {
      expect(localizeSimText(text), text).not.toBeNull();
    }
    for (const g of SMITH_HEART_GATES) {
      if (g.openText) expect(localizeSimText(g.openText), g.id).not.toBeNull();
    }
  });
});
