import { describe, expect, it } from 'vitest';
import { runEffects } from '../src/sim/combat/effect_dispatch';
import { DROWNED_TEMPLE_SPAWNS } from '../src/sim/content/drowned_temple';
import { CANTOR_GUIDE } from '../src/sim/content/drowned_temple_cantor';
import { DUNGEONS, instanceOrigin, MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import {
  applyDungeonMobTuning,
  mobLevelForDungeonDifficulty,
  mobTemplateForDungeonDifficulty,
} from '../src/sim/instances/difficulty';
import { dungeonGateState } from '../src/sim/instances/dungeon_gates';
import { claimedInstanceAt } from '../src/sim/instances/dungeons';
import { SCRIPTED_INTERRUPTIBLE_CHANNELS } from '../src/sim/mob/healer_channel';
import { tickBreathConeBar } from '../src/sim/mob/mob_cast_bars';
import { tickTrashKits } from '../src/sim/mob/trash_kit';
import {
  TEMPLE_SKEWERING_TRIDENT,
  TEMPLE_TIDEMARKED_SURGE,
} from '../src/sim/mob/trash_kit/temple_cast_ids';
import { Sim } from '../src/sim/sim';
import { type AbilityDef, DT } from '../src/sim/types';
import { dungeonGuideStrings } from '../src/ui/i18n.catalog/dungeon_guides';
import { localizeSimAuraName } from '../src/ui/sim_i18n';

const TRIDENT = 'temple_tidemarked_trident';
const TIDE = 'temple_tidemarked_tide';
const LURKER = 'temple_abyssal_lurker';
function room(difficulty: 'normal' | 'heroic' = 'normal') {
  const sim = new Sim({ seed: 93, playerClass: 'warrior', autoEquip: false, devCommands: true });
  sim.chat('/dev level 20', sim.player.id);
  sim.chat(`/dev temple enter ${difficulty}`, sim.player.id);
  const inst = claimedInstanceAt(sim.ctx, sim.player.pos);
  if (!inst) throw new Error('No Temple claim');
  const origin = instanceOrigin(DUNGEONS.drowned_temple.index, inst.slot);
  sim.player.pos = sim.ctx.groundPos(origin.x, origin.z - 12);
  sim.player.prevPos = { ...sim.player.pos };
  sim.player.hp = sim.player.maxHp = 1e6;
  return { sim, inst };
}
function engage(r: ReturnType<typeof room>, id: string) {
  const { sim, inst } = r;
  const mob = createMob(
    sim.ctx.nextId++,
    mobTemplateForDungeonDifficulty(MOBS[id], 'drowned_temple', inst.difficulty),
    mobLevelForDungeonDifficulty('drowned_temple', inst.difficulty, 16),
    sim.ctx.groundPos(sim.player.pos.x + 4, sim.player.pos.z),
  );
  applyDungeonMobTuning(mob, 'drowned_temple', inst.difficulty);
  sim.ctx.addEntity(mob);
  inst.mobIds.push(mob.id);
  mob.inCombat = true;
  mob.aiState = 'attack';
  mob.aggroTargetId = sim.player.id;
  mob.facing = -Math.PI / 2;
  return mob;
}
function run(r: ReturnType<typeof room>, seconds: number) {
  for (let i = 0; i < Math.round(seconds / DT); i++) tickTrashKits(r.sim.ctx);
}

describe('Tidemarked door guardians and the lagoon lurkers', () => {
  it('localizes the tide name and keeps the Cantor clue attached to the new lurker', () => {
    const name = MOBS[TIDE].trashKit?.nova?.name;
    expect(name).toBe('Tidal Surge');
    expect(localizeSimAuraName(name ?? '')).toBe(name);
    const clue = CANTOR_GUIDE.lines.find((line) => line.id === 'C09');
    expect(clue?.key).toBe('sight.eel');
    expect(clue?.trigger).toMatchObject({ kind: 'sight', mobIds: [LURKER] });
    expect(clue?.text).toBe(dungeonGuideStrings.drownedTemple.sight.eel);
    expect(clue?.text).toContain('step behind it to avoid the bite');
  });
  it('replaces only the four eel placements, with guardians confined to g5', () => {
    const placements = DROWNED_TEMPLE_SPAWNS.filter((s) =>
      [TRIDENT, TIDE, LURKER].includes(s.mobId),
    );
    expect(placements.map((s) => [s.mobId, s.x, s.z, s.packId])).toEqual([
      [TRIDENT, -9, -47, 'g5'],
      [TIDE, 9, -47, 'g5'],
      [LURKER, 85, 70, 'g9'],
      [LURKER, 21, 215, 'g13'],
    ]);
    expect(DROWNED_TEMPLE_SPAWNS.some((s) => s.mobId === 'lagoon_eel')).toBe(false);
    expect(MOBS.lagoon_eel).toBeDefined();
    for (const id of [TRIDENT, TIDE, LURKER]) expect(MOBS[id].boss).toBeFalsy();
  });
  it('pulls both guardians and the Siren together; the gate waits for every pack member', () => {
    const r = room();
    const first = r.sim.entities.get(
      r.inst.mobIds[DROWNED_TEMPLE_SPAWNS.findIndex((s) => s.mobId === TRIDENT)],
    )!;
    r.sim.ctx.aggroMob(first, r.sim.player, false);
    const gate = DUNGEONS.drowned_temple.gates!.find((g) => g.id === 'choir_veil')!;
    for (const [i, spawn] of DROWNED_TEMPLE_SPAWNS.entries()) {
      const mob = r.sim.entities.get(r.inst.mobIds[i])!;
      if (spawn.packId === 'g5') expect(mob.inCombat).toBe(true);
      if (spawn.packId && gate.packs?.includes(spawn.packId) && spawn.mobId !== TIDE)
        mob.dead = true;
    }
    expect(dungeonGateState(r.sim.ctx, r.inst, gate)).toBe('closed');
    const tide = r.sim.entities.get(
      r.inst.mobIds[DROWNED_TEMPLE_SPAWNS.findIndex((s) => s.mobId === TIDE)],
    )!;
    tide.dead = true;
    expect(dungeonGateState(r.sim.ctx, r.inst, gate)).toBe('open');
    expect(r.inst.bossExitId).toBeNull();
  });
  it('holds the trident lane in place and lets its target sidestep', () => {
    const r = room();
    const mob = engage(r, TRIDENT);
    run(r, 7.1);
    expect(mob.castingAbility).toBe(TEMPLE_SKEWERING_TRIDENT);
    const original = { ...mob.pos };
    const yaw = mob.facing;
    const otherId = r.sim.addPlayer('mage', 'Lane witness');
    const other = r.sim.entities.get(otherId)!;
    other.pos = r.sim.ctx.groundPos(
      original.x + Math.sin(yaw) * 10,
      original.z + Math.cos(yaw) * 10,
    );
    other.hp = other.maxHp = 1e6;
    r.sim.player.pos = r.sim.ctx.groundPos(
      other.pos.x + Math.cos(yaw) * 6,
      other.pos.z - Math.sin(yaw) * 6,
    );
    mob.pos.x += 2;
    mob.facing += 0.5;
    run(r, DT);
    expect(mob.pos).toEqual(original);
    expect(mob.facing).toBe(yaw);
    run(r, 2);
    expect(r.sim.player.hp).toBe(1e6);
    expect(other.hp).toBeLessThan(1e6);
  });
  it('lets players step behind the ordinary lurker to avoid its bite', () => {
    const r = room();
    const mob = engage(r, LURKER);
    const bite = MOBS[LURKER].breathCone;
    if (!bite) throw new Error('No lurker bite');
    const victimId = r.sim.addPlayer('mage', 'Bite witness');
    const victim = r.sim.entities.get(victimId)!;
    victim.pos = { ...r.sim.player.pos };
    victim.hp = victim.maxHp = 1e6;
    mob.castingAbility = bite.castId;
    mob.castRemaining = bite.castTime;
    mob.castTotal = bite.castTime;
    r.sim.player.pos = r.sim.ctx.groundPos(mob.pos.x + 4, mob.pos.z);
    for (let i = 0; i < 32; i++) tickBreathConeBar(r.sim.ctx, mob, bite);
    expect(r.sim.player.hp).toBe(1e6);
    expect(victim.hp).toBeLessThan(1e6);
    expect(mob.castingAbility).toBeNull();
    expect(MOBS[LURKER].trashKit?.leap?.maxRange).toBe(12);
  });
  it('registers the tide for interrupts and discards a cancelled cast', () => {
    expect(SCRIPTED_INTERRUPTIBLE_CHANNELS[TEMPLE_TIDEMARKED_SURGE]?.school).toBe('frost');
    expect(SCRIPTED_INTERRUPTIBLE_CHANNELS[TEMPLE_SKEWERING_TRIDENT]).toBeUndefined();
    const r = room();
    const mob = engage(r, TIDE);
    run(r, 5.1);
    expect(mob.castingAbility).toBe(TEMPLE_TIDEMARKED_SURGE);
    const def: AbilityDef = {
      id: 'test_interrupt',
      name: 'Test Interrupt',
      class: 'warrior',
      learnLevel: 1,
      cost: 0,
      castTime: 0,
      cooldown: 0,
      range: 30,
      school: 'physical',
      requiresTarget: true,
      effects: [{ type: 'interrupt', lockout: 4 }],
      description: '',
    };
    const meta = r.sim.players.get(r.sim.player.id);
    if (!meta) throw new Error('No player metadata');
    runEffects(r.sim.ctx, r.sim.player, meta, mob, {
      def,
      rank: 1,
      cost: 0,
      castTime: 0,
      cooldown: 0,
      effects: def.effects,
      threatFlat: 0,
      threatMult: 1,
    });
    expect(mob.castingAbility).toBeNull();
    expect(mob.auras.some((a) => a.kind === 'lockout' && a.school === 'frost')).toBe(true);
    run(r, 3);
    expect(r.sim.player.hp).toBe(1e6);
  });
  it.each(['normal', 'heroic'] as const)(
    'lands tide at the intended %s mechanic scale, sparing out-of-range players',
    (difficulty) => {
      const r = room(difficulty);
      const mob = engage(r, TIDE);
      const otherId = r.sim.addPlayer('mage', 'Outside tide');
      const other = r.sim.entities.get(otherId)!;
      other.pos = r.sim.ctx.groundPos(mob.pos.x + 12, mob.pos.z);
      other.hp = other.maxHp = 1e6;
      run(r, 7.2);
      const lost = 1e6 - r.sim.player.hp;
      const scale = difficulty === 'heroic' ? 5.5 : 1;
      expect(lost).toBeGreaterThanOrEqual(45 * scale - 1);
      expect(lost).toBeLessThanOrEqual(55 * scale + 1);
      expect(other.hp).toBe(1e6);
      expect(mob.maxHp).toBeGreaterThan(engage(r, LURKER).maxHp);
      if (difficulty === 'normal') expect(mob.maxHp).toBe(1339);
      for (const id of [TRIDENT, TIDE, LURKER])
        expect(engage(r, id).mechanicDamageMult ?? 1).toBe(scale);
    },
  );
});
